import { executeAgentTaskLive } from '../index';
import type { LLMClient } from '../../ceo-orchestration/types';
import type { AgentTask } from '../../../types/orchestration';

// Queue stub: scripted responses in order (executive call, then CEO review call).
function queueLLM(responses: string[]): LLMClient {
  let i = 0;
  return { complete: async () => responses[i++] ?? '{}' };
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't1',
    instruction_id: 'instr-1',
    assigned_agent: 'CPO',
    title: 'Plan onboarding flow',
    rationale: 'users drop off',
    expected_output: 'onboarding plan',
    status: 'queued',
    approval_required: false,
    created_at: '2026-05-31T00:00:00Z',
    updated_at: '2026-05-31T00:00:00Z',
    ...overrides,
  };
}

const execOk = JSON.stringify({
  current_situation: '온보딩 이탈 분석',
  goal: '온보딩 개선안',
  why_now: '지금',
  bottleneck: '',
  root_cause: '복잡함',
  options: ['단순화'],
  recommendation: '3단계로 축소',
  action_items: ['1단계 정의', '2단계 정의'],
  insight_to_record: '단순화가 핵심',
  workflow_improvement_suggestion: '분석 자동화',
  confidence_level: 'high',
  risk_level: 'D2',
  needs_outbound_or_payment: false,
});

const execOutbound = JSON.stringify({ ...JSON.parse(execOk), needs_outbound_or_payment: true });

describe('executeAgentTaskLive', () => {
  it('completes to done when CEO approves internal work', async () => {
    const llm = queueLLM([execOk, '{"decision":"approve","ceo_note":"좋은 계획"}']);
    const r = await executeAgentTaskLive(makeTask(), llm);
    expect(r.updated_status).toBe('done');
    expect(r.approval_required).toBe(false);
    expect(r.ceo_decision).toBe('approve');
    expect(r.handoffs.length).toBe(2); // executive + CEO
    expect(r.output.recommendation).toContain('3단계');
  });

  it('finalizes to done on CEO revise (course-correction, no founder)', async () => {
    const llm = queueLLM([execOk, '{"decision":"revise","ceo_note":"이 방향으로 조정"}']);
    const r = await executeAgentTaskLive(makeTask(), llm);
    expect(r.updated_status).toBe('done');
    expect(r.approval_required).toBe(false);
    expect(r.ceo_decision).toBe('revise');
  });

  it('escalates to founder (needs_review + approval) for outbound/payment', async () => {
    const llm = queueLLM([execOutbound, '{"decision":"escalate_founder","ceo_note":"외부 발신","founder_reason":"고객 이메일"}']);
    const r = await executeAgentTaskLive(makeTask(), llm);
    expect(r.updated_status).toBe('needs_review');
    expect(r.approval_required).toBe(true);
    expect(r.founder_reason).toBeTruthy();
  });

  it('blocks on executive hard failure', async () => {
    const llm = queueLLM(['not json at all', 'not json again']);
    const r = await executeAgentTaskLive(makeTask(), llm);
    expect(r.updated_status).toBe('blocked');
    expect(r.blocked).toBe(true);
  });

  it('does not escalate to founder merely because risk is high', async () => {
    const highRisk = JSON.stringify({ ...JSON.parse(execOk), risk_level: 'D5' });
    const llm = queueLLM([highRisk, '{"decision":"approve","ceo_note":"내부 위험 처리"}']);
    const r = await executeAgentTaskLive(makeTask(), llm);
    expect(r.updated_status).toBe('done');
    expect(r.approval_required).toBe(false);
  });
});
