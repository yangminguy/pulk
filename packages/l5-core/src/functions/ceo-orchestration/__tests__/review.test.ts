import { reviewExecutiveOutput, parseReviewVerdict } from '../review';
import type { LLMClient } from '../types';
import type { AgentTask } from '../../../types/orchestration';
import type { AgentOutput } from '../../executive-runtime/protocol';

function stubLLM(response: string): LLMClient {
  return { complete: async () => response };
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't1',
    instruction_id: 'instr-1',
    assigned_agent: 'CMO',
    title: 'Draft positioning',
    rationale: 'need clarity',
    expected_output: 'positioning statement',
    status: 'queued',
    approval_required: false,
    created_at: '2026-05-31T00:00:00Z',
    updated_at: '2026-05-31T00:00:00Z',
    ...overrides,
  };
}

function baseOutput(over: Partial<AgentOutput> = {}): AgentOutput {
  return {
    current_situation: 's',
    source_instruction: 'r',
    goal: 'g',
    why_now: '',
    bottleneck: '',
    root_cause: '',
    options: [],
    recommendation: 'do X',
    action_items: ['a'],
    next_owner: 'ceo',
    required_tools: [],
    approval_required: false,
    insight_to_record: '',
    workflow_improvement_suggestion: '',
    confidence_level: 'high',
    risk_level: 'D2',
    ...over,
  };
}

describe('parseReviewVerdict', () => {
  it('parses approve and ignores founder_reason', () => {
    const v = parseReviewVerdict('{"decision":"approve","ceo_note":"좋음","founder_reason":null}');
    expect(v.decision).toBe('approve');
    expect(v.founder_reason).toBeUndefined();
  });

  it('keeps founder_reason on escalate', () => {
    const v = parseReviewVerdict('{"decision":"escalate_founder","ceo_note":"확인","founder_reason":"결제"}');
    expect(v.decision).toBe('escalate_founder');
    expect(v.founder_reason).toBe('결제');
  });

  it('defaults to approve on unknown decision', () => {
    const v = parseReviewVerdict('{"decision":"weird","ceo_note":"x"}');
    expect(v.decision).toBe('approve');
  });
});

describe('reviewExecutiveOutput', () => {
  it('returns CEO verdict for internal work', async () => {
    const llm = stubLLM('{"decision":"approve","ceo_note":"승인","founder_reason":null}');
    const v = await reviewExecutiveOutput(makeTask(), baseOutput(), llm);
    expect(v.decision).toBe('approve');
  });

  it('forces escalation when executive flagged outbound/payment even if CEO said approve', async () => {
    const llm = stubLLM('{"decision":"approve","ceo_note":"승인","founder_reason":null}');
    const v = await reviewExecutiveOutput(makeTask(), baseOutput({ approval_required: true }), llm);
    expect(v.decision).toBe('escalate_founder');
    expect(v.founder_reason).toBeTruthy();
  });

  it('never escalates merely because risk is high', async () => {
    const llm = stubLLM('{"decision":"approve","ceo_note":"내부 위험은 내가 처리","founder_reason":null}');
    const v = await reviewExecutiveOutput(makeTask(), baseOutput({ risk_level: 'D5' }), llm);
    expect(v.decision).toBe('approve');
  });
});
