// M1 tool-calling loop + registry tests.
//
// StubLLMClient returns pre-scripted responses in order so the loop is fully
// deterministic without a real LLM.

import type { LLMClient } from '../../../ceo-orchestration/types';
import type { ExecutiveTool, ToolResult, ToolRunContext } from '../types';
import { ToolRegistry, createToolRegistry } from '../registry';
import { runExecutiveWithTools } from '../../tool-loop';
import type { AgentTask } from '../../../../types/orchestration';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-tool-001',
    instruction_id: 'instr-001',
    assigned_agent: 'CMO',
    title: '도구 테스트 작업',
    rationale: '도구 플랫폼 M1 검증',
    expected_output: '분석 결과',
    status: 'queued',
    approval_required: false,
    created_at: '2026-06-02T00:00:00Z',
    updated_at: '2026-06-02T00:00:00Z',
    ...overrides,
  };
}

// Minimal valid AgentOutput JSON the loop can parse.
function makeOutputJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    current_situation: '현재 상황 분석 완료',
    goal: '목표 달성',
    why_now: '지금 필요',
    bottleneck: '',
    root_cause: '',
    options: ['옵션 A', '옵션 B'],
    recommendation: '권고사항: 진행',
    action_items: ['첫 번째 액션'],
    insight_to_record: '인사이트',
    workflow_improvement_suggestion: '개선 제안',
    confidence_level: 'high',
    risk_level: 'D1',
    needs_outbound_or_payment: false,
    ...overrides,
  });
}

// Returns responses in FIFO order; throws if exhausted unexpectedly.
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
    if (next === undefined) throw new Error('StubLLMClient: no more responses');
    return next;
  }

  remaining(): number {
    return this.responses.length;
  }
}

// ── dummy tools ───────────────────────────────────────────────────────────────

const dummyReadTool: ExecutiveTool = {
  name: 'test.read',
  description: '테스트용 읽기 도구',
  parameters: { query: { type: 'string', description: '검색 쿼리' } },
  allowed_roles: 'all',
  permission: 'read',
  async run(_args: Record<string, unknown>, _ctx?: ToolRunContext): Promise<ToolResult> {
    return { ok: true, data: { result: '읽기 결과 데이터' } };
  },
};

const dummyWriteTool: ExecutiveTool = {
  name: 'test.write',
  description: '테스트용 쓰기 도구 (CMO 전용)',
  parameters: { content: { type: 'string', description: '작성할 내용' } },
  allowed_roles: ['CMO'],
  permission: 'write',
  async run(_args: Record<string, unknown>, _ctx?: ToolRunContext): Promise<ToolResult> {
    return { ok: true, data: { written: true } };
  },
};

const throwingTool: ExecutiveTool = {
  name: 'test.throw',
  description: '항상 예외를 던지는 도구',
  parameters: {},
  allowed_roles: 'all',
  permission: 'read',
  async run(_args: Record<string, unknown>, _ctx?: ToolRunContext): Promise<ToolResult> {
    throw new Error('도구 내부 오류 발생');
  },
};

// ── ToolRegistry unit tests ───────────────────────────────────────────────────

describe('ToolRegistry', () => {
  it('registers and retrieves a tool by name', () => {
    const reg = createToolRegistry([dummyReadTool]);
    expect(reg.get('test.read')).toBe(dummyReadTool);
  });

  it('throws on duplicate name registration', () => {
    const reg = createToolRegistry([dummyReadTool]);
    expect(() => reg.register(dummyReadTool)).toThrow(/duplicate tool name/);
  });

  it('forRole returns tools allowed for a role (all)', () => {
    const reg = createToolRegistry([dummyReadTool, dummyWriteTool]);
    const cmoTools = reg.forRole('CMO');
    expect(cmoTools.map((t) => t.name)).toContain('test.read');
    expect(cmoTools.map((t) => t.name)).toContain('test.write');
  });

  it('forRole filters out tools not allowed for a role', () => {
    const reg = createToolRegistry([dummyReadTool, dummyWriteTool]);
    const croTools = reg.forRole('CRO');
    expect(croTools.map((t) => t.name)).toContain('test.read');
    expect(croTools.map((t) => t.name)).not.toContain('test.write');
  });

  it('list returns all registered tools', () => {
    const reg = createToolRegistry([dummyReadTool, dummyWriteTool]);
    expect(reg.list()).toHaveLength(2);
  });

  it('get returns undefined for unknown tool', () => {
    const reg = new ToolRegistry();
    expect(reg.get('no.such.tool')).toBeUndefined();
  });
});

// ── runExecutiveWithTools tests ───────────────────────────────────────────────

describe('runExecutiveWithTools', () => {
  // Case 1: tool is called, result injected, final output returned with required_tools populated.
  it('executes a tool call and records it in required_tools', async () => {
    const toolCallResponse = JSON.stringify({
      tool_call: { name: 'test.read', args: { query: '시장 분석' } },
    });
    const finalOutput = makeOutputJson();

    const llm = new StubLLMClient([toolCallResponse, finalOutput]);
    const task = makeTask({ assigned_agent: 'CMO' });

    const result = await runExecutiveWithTools({ task }, llm, {
      tools: [dummyReadTool],
    });

    expect(result.output.required_tools).toContain('test.read');
    expect(result.output.recommendation).toBe('권고사항: 진행');
    expect(result.status).toBe('completed');
  });

  // Case 2: role permission denied — loop continues with error message, does not crash.
  it('rejects tool call for unauthorized role and continues the loop', async () => {
    // CRO tries to use CMO-only write tool.
    const toolCallResponse = JSON.stringify({
      tool_call: { name: 'test.write', args: { content: '내용' } },
    });
    const finalOutput = makeOutputJson();

    const llm = new StubLLMClient([toolCallResponse, finalOutput]);
    const task = makeTask({ assigned_agent: 'CRO' });

    const result = await runExecutiveWithTools({ task }, llm, {
      tools: [dummyReadTool, dummyWriteTool],
    });

    // write tool was not successfully invoked, so not in required_tools.
    expect(result.output.required_tools).not.toContain('test.write');
    expect(result.status).toBe('completed');
  });

  // Case 3: no tools → falls back to single-shot runExecutive path.
  it('falls back to single-shot runExecutive when no tools provided', async () => {
    const finalOutput = makeOutputJson();
    const llm = new StubLLMClient([finalOutput]);
    const task = makeTask({ assigned_agent: 'CMO' });

    const result = await runExecutiveWithTools({ task }, llm, { tools: [] });

    expect(result.status).toBe('completed');
    expect(result.output.required_tools).toEqual([]);
    // Only one LLM call consumed.
    expect(llm.remaining()).toBe(0);
  });

  // Case 4: maxIterations safety — loop emits only tool_calls until forced final prompt.
  it('does not loop infinitely when LLM keeps returning tool_calls (maxIterations guard)', async () => {
    const toolCallResponse = JSON.stringify({
      tool_call: { name: 'test.read', args: {} },
    });
    // Responses: tool_call repeated, then final output on the forced last iteration.
    const llm = new StubLLMClient([
      toolCallResponse,
      toolCallResponse,
      toolCallResponse,
      makeOutputJson(), // forced final prompt response
    ]);
    const task = makeTask({ assigned_agent: 'CMO' });

    const result = await runExecutiveWithTools({ task }, llm, {
      tools: [dummyReadTool],
      maxIterations: 4,
    });

    expect(result.status).toBe('completed');
    // test.read was invoked up to 3 times (not infinitely).
    expect(result.output.required_tools.length).toBeGreaterThanOrEqual(1);
  });

  // Case 5: tool run() throws → wrapped in ok:false, loop continues, task succeeds.
  it('wraps a throwing tool in ok:false and does not crash the loop', async () => {
    const toolCallResponse = JSON.stringify({
      tool_call: { name: 'test.throw', args: {} },
    });
    const finalOutput = makeOutputJson();

    const llm = new StubLLMClient([toolCallResponse, finalOutput]);
    const task = makeTask({ assigned_agent: 'CMO' });

    const result = await runExecutiveWithTools({ task }, llm, {
      tools: [throwingTool],
    });

    // Throwing tool was not recorded as successfully invoked.
    expect(result.output.required_tools).not.toContain('test.throw');
    expect(result.status).toBe('completed');
  });

  // recalledInsights path — no tools, insight text injected into prompt (single call).
  it('injects recalledInsights into the prompt when tools are empty', async () => {
    const finalOutput = makeOutputJson();
    const capturedArgs: { user: string }[] = [];

    const llm: LLMClient = {
      async complete(args: { system: string; user: string; trace_name?: string; trace_metadata?: Record<string, unknown> }) {
        capturedArgs.push({ user: args.user });
        return finalOutput;
      },
    };

    const task = makeTask({ assigned_agent: 'CMO' });
    await runExecutiveWithTools({ task }, llm, {
      tools: [],
      recalledInsights: '이전 캠페인 전환율 3.2%',
    });

    expect(capturedArgs[0].user).toContain('이전 캠페인 전환율 3.2%');
  });
});
