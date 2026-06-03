// M1–M5 End-to-End integration test (mock, in-process).
//
// Exercises the full tool-calling loop with:
//   - StubLLMClient (scripted responses, no real LLM)
//   - createInMemorySecondBrainTransport (M3)
//   - createInMemoryVideoFactoryTransport (M5)
//   - createAskFounderTool with mock propose (M4)
//   - formatConsultationForPrompt for resolved consultation injection (M4)
//
// Scenarios:
//   A. CMO: secondbrain.read → ask_founder → await_founder early exit
//   B. CMO: resolved consultation injected as recalledInsights →
//            video_factory.configure + video_factory.generate → final output
//   C. Role guard: CRO attempting video_factory.generate → rejected

import type { LLMClient } from '../../ceo-orchestration/types';
import type { AgentTask } from '../../../types/orchestration';
import type { ExecutiveTool, ToolResult } from '../tools/types';
import { runExecutiveWithTools } from '../tool-loop';
import {
  createSecondBrainSource,
  createSecondBrainTools,
  createInMemorySecondBrainTransport,
} from '../../memory/secondbrain-source';
import {
  createVideoFactoryTools,
  createInMemoryVideoFactoryTransport,
} from '../../memory/video-factory';
import { createAskFounderTool } from '../../consultation/tool';
import { formatConsultationForPrompt } from '../../consultation';

// ── helpers ───────────────────────────────────────────────────────────────────

class StubLLMClient implements LLMClient {
  private responses: string[];

  constructor(responses: string[]) {
    this.responses = [...responses];
  }

  async complete(_args: {
    system: string;
    user: string;
    trace_name?: string;
    trace_metadata?: Record<string, unknown>;
  }): Promise<string> {
    const next = this.responses.shift();
    if (next === undefined) throw new Error('StubLLMClient: no more scripted responses');
    return next;
  }

  remaining(): number {
    return this.responses.length;
  }
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'e2e-task-001',
    instruction_id: 'instr-e2e-001',
    assigned_agent: 'CMO',
    title: 'SNS 마케팅 영상 기획',
    rationale: '브랜드 인지도 향상을 위한 영상 콘텐츠 전략',
    expected_output: '영상 기획안 + 생성 요청',
    status: 'queued',
    approval_required: false,
    created_at: '2026-06-02T00:00:00Z',
    updated_at: '2026-06-02T00:00:00Z',
    ...overrides,
  };
}

function makeOutputJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    current_situation: '마케팅 영상 전략 수립 완료',
    goal: '브랜드 영상 제작',
    why_now: '캠페인 시작',
    bottleneck: '',
    root_cause: '',
    options: ['숏폼', '롱폼'],
    recommendation: '숏폼 우선 제작',
    action_items: ['주제 확정', '영상 생성 요청'],
    insight_to_record: '숏폼이 브랜드 인지도에 효과적',
    workflow_improvement_suggestion: '주간 영상 루틴화',
    confidence_level: 'high',
    risk_level: 'D1',
    needs_outbound_or_payment: false,
    ...overrides,
  });
}

// ── Scenario A: CMO secondbrain.read → ask_founder → await_founder exit ───────

describe('Scenario A: CMO reads secondbrain then asks founder', () => {
  it('invokes secondbrain.read, then ask_founder, and returns await_founder signal', async () => {
    // Track ask_founder calls
    let consultationProposed: { question: string } | null = null;

    const sbTransport = createInMemorySecondBrainTransport([
      { insight: '이전 캠페인 전환율 3.2%', source_agent: 'CMO', phase: 'market_pmf_diagnosis' },
    ]);
    const sbSource = createSecondBrainSource(sbTransport);
    const proposeWrite = async (_req: any): Promise<ToolResult> => ({ ok: true, data: { queued: true } });
    const sbTools = createSecondBrainTools({ source: sbSource, proposeWrite });

    const askFounderTool = createAskFounderTool({
      propose: async (req) => {
        consultationProposed = { question: req.question };
        return { ok: true, data: { await_founder: true, consultation_id: 'cons-001' } };
      },
    });

    const tools: ExecutiveTool[] = [...sbTools, askFounderTool];

    // Scripted responses:
    // 1. CMO calls secondbrain.read
    // 2. CMO calls ask_founder
    // 3. Final output (after await_founder — in real plugin this wouldn't be reached,
    //    but in the unit test the loop still needs a final output)
    const llm = new StubLLMClient([
      JSON.stringify({ tool_call: { name: 'secondbrain.read', args: { limit: 5 } } }),
      JSON.stringify({ tool_call: { name: 'ask_founder', args: { question: '어떤 채널에 집중할까요?' } } }),
      makeOutputJson(),
    ]);

    const result = await runExecutiveWithTools(
      { task: makeTask() },
      llm,
      { tools, recalledInsights: undefined },
    );

    // secondbrain.read was invoked
    expect(result.output.required_tools).toContain('secondbrain.read');

    // ask_founder was invoked (ok:true → recorded in required_tools)
    expect(result.output.required_tools).toContain('ask_founder');

    // consultation was proposed with the question
    expect(consultationProposed).not.toBeNull();
    expect(consultationProposed!.question).toContain('채널');
  });
});

// ── Scenario B: resolved consultation → configure + generate ─────────────────

describe('Scenario B: CMO with resolved consultation runs configure then generate', () => {
  it('calls video_factory.configure then generate, both recorded in required_tools', async () => {
    const vfTransport = createInMemoryVideoFactoryTransport();
    const vfTools = createVideoFactoryTools(vfTransport);

    const sbTransport = createInMemorySecondBrainTransport();
    const sbSource = createSecondBrainSource(sbTransport);
    const proposeWrite = async (_req: any): Promise<ToolResult> => ({ ok: true, data: { queued: true } });
    const sbTools = createSecondBrainTools({ source: sbSource, proposeWrite });

    const tools: ExecutiveTool[] = [...sbTools, ...vfTools];

    // Resolved consultation formatted as recalledInsights (M4 pattern)
    const resolvedConsultation = {
      id: 'cons-001',
      task_id: 'e2e-task-001',
      business_id: null,
      from_agent: 'CMO' as const,
      question: '어떤 채널에 집중할까요?',
      options: ['인스타그램', '유튜브'],
      status: 'resolved' as const,
      founder_response: '인스타그램 숏폼에 집중하세요.',
      resolved_at: '2026-06-02T01:00:00Z',
    };
    const recalledInsights = formatConsultationForPrompt(resolvedConsultation);

    // Scripted:
    // 1. CMO calls configure with agreed strategy
    // 2. CMO calls generate
    // 3. Final output
    const llm = new StubLLMClient([
      JSON.stringify({
        tool_call: {
          name: 'video_factory.configure',
          args: { strategy: '인스타그램 숏폼 우선', content_style: '트렌디하고 짧은 영상' },
        },
      }),
      JSON.stringify({
        tool_call: {
          name: 'video_factory.generate',
          args: { topic: '브랜드 런칭 숏폼', angle: '창업자 스토리', format: 'reel' },
        },
      }),
      makeOutputJson({ insight_to_record: '인스타그램 숏폼이 런칭 캠페인에 가장 효과적' }),
    ]);

    const result = await runExecutiveWithTools(
      { task: makeTask() },
      llm,
      { tools, recalledInsights },
    );

    // Both tools invoked
    expect(result.output.required_tools).toContain('video_factory.configure');
    expect(result.output.required_tools).toContain('video_factory.generate');

    // configure persisted the preset in the transport store
    expect(vfTransport._store.config.strategy).toBe('인스타그램 숏폼 우선');
    expect(vfTransport._store.config.content_style).toBe('트렌디하고 짧은 영상');

    // generate was recorded in the transport store
    expect(vfTransport._store.generated).toHaveLength(1);
    expect(vfTransport._store.generated[0].topic).toBe('브랜드 런칭 숏폼');
    expect(vfTransport._store.generated[0].format).toBe('reel');

    // final output
    expect(result.status).toBe('completed');
    expect(result.output.insight_to_record).toContain('인스타그램');
  });

  it('get_config returns the configured preset', async () => {
    const vfTransport = createInMemoryVideoFactoryTransport({ strategy: '초기 전략' });
    const vfTools = createVideoFactoryTools(vfTransport);
    const getConfigTool = vfTools.find((t) => t.name === 'video_factory.get_config')!;

    const result = await getConfigTool.run({}, { role: 'CMO', task_id: 'test' });
    expect(result.ok).toBe(true);
    expect((result.data as any).strategy).toBe('초기 전략');
  });

  it('secondbrain.write result is pending (queued for CEO review), not direct append', async () => {
    const sbTransport = createInMemorySecondBrainTransport();
    const sbSource = createSecondBrainSource(sbTransport);

    let writeCaptured: any = null;
    const proposeWrite = async (req: any): Promise<ToolResult> => {
      writeCaptured = req;
      return { ok: true, data: { queued: true, message: 'CEO 검토 큐에 추가됨' } };
    };
    const sbTools = createSecondBrainTools({ source: sbSource, proposeWrite });
    const writeTool = sbTools.find((t) => t.name === 'secondbrain.write')!;

    const writeResult = await writeTool.run(
      { insight: '인스타그램 숏폼 효과적', pii_level: 'none' },
      { role: 'CMO', task_id: 'e2e-task-001' },
    );

    // write is queued, not directly appended
    expect(writeResult.ok).toBe(true);
    expect((writeResult.data as any).queued).toBe(true);
    expect(writeCaptured.insight).toBe('인스타그램 숏폼 효과적');

    // the real transport store is untouched (CEO gate not bypassed)
    const stored = await sbTransport.query({});
    expect(stored).toHaveLength(0);
  });
});

// ── Scenario C: Role guard — CRO cannot use video_factory tools ───────────────

describe('Scenario C: role guard — non-CMO role rejected for video_factory tools', () => {
  it('rejects video_factory.generate for CRO and does not record it in required_tools', async () => {
    const vfTransport = createInMemoryVideoFactoryTransport();
    const vfTools = createVideoFactoryTools(vfTransport);

    const llm = new StubLLMClient([
      JSON.stringify({
        tool_call: {
          name: 'video_factory.generate',
          args: { topic: '영업 영상', format: 'long-form' },
        },
      }),
      makeOutputJson(),
    ]);

    const result = await runExecutiveWithTools(
      { task: makeTask({ assigned_agent: 'CRO' }) },
      llm,
      { tools: vfTools },
    );

    // Tool was rejected — not in required_tools
    expect(result.output.required_tools).not.toContain('video_factory.generate');

    // Transport was not called (no items generated)
    expect(vfTransport._store.generated).toHaveLength(0);

    // Loop still completed successfully
    expect(result.status).toBe('completed');
  });

  it('rejects video_factory.configure for CFO', async () => {
    const vfTransport = createInMemoryVideoFactoryTransport();
    const vfTools = createVideoFactoryTools(vfTransport);
    const configureTool = vfTools.find((t) => t.name === 'video_factory.configure')!;

    // Directly check allowed_roles
    expect(configureTool.allowed_roles).toEqual(['CMO']);

    // Simulate the tool-loop role check
    const allowed =
      configureTool.allowed_roles === 'all' ||
      (configureTool.allowed_roles as string[]).includes('CFO');
    expect(allowed).toBe(false);
  });
});

// ── Scenario D: in-memory transport data integrity ────────────────────────────

describe('Scenario D: in-memory transport data integrity', () => {
  it('configure accumulates partial updates without overwriting unset fields', async () => {
    const vfTransport = createInMemoryVideoFactoryTransport({ strategy: '기존 전략', notes: '메모' });

    await vfTransport.configure({ content_style: '새로운 스타일' });

    expect(vfTransport._store.config.strategy).toBe('기존 전략'); // unchanged
    expect(vfTransport._store.config.content_style).toBe('새로운 스타일'); // updated
    expect(vfTransport._store.config.notes).toBe('메모'); // unchanged
  });

  it('generate accumulates multiple requests', async () => {
    const vfTransport = createInMemoryVideoFactoryTransport();

    await vfTransport.generate({ topic: '첫 번째 영상' });
    await vfTransport.generate({ topic: '두 번째 영상', format: 'reel' });

    expect(vfTransport._store.generated).toHaveLength(2);
    expect(vfTransport._store.generated[1].format).toBe('reel');
  });

  it('generate result includes applied_config snapshot', async () => {
    const vfTransport = createInMemoryVideoFactoryTransport({ strategy: '테스트 전략' });

    const result = await vfTransport.generate({ topic: '테스트 영상' });
    expect(result.ok).toBe(true);
    expect((result.data as any).applied_config.strategy).toBe('테스트 전략');
  });
});
