// Integration test: verifies that recalledInsights passed to executeAgentTaskLive
// are forwarded into the executive's LLM prompt.

import { executeAgentTaskLive } from '../index';
import type { LLMClient } from '../../ceo-orchestration/types';
import type { AgentTask } from '../../../types/orchestration';

interface CapturedCall {
  system: string;
  user: string;
}

function capturingLLM(responses: string[]): { llm: LLMClient; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  let i = 0;
  const llm: LLMClient = {
    complete: async (req) => {
      calls.push({ system: req.system ?? '', user: req.user });
      return responses[i++] ?? '{}';
    },
  };
  return { llm, calls };
}

const execOk = JSON.stringify({
  current_situation: '상황 분석',
  goal: '목표',
  why_now: '지금',
  bottleneck: '',
  root_cause: '원인',
  options: ['옵션A'],
  recommendation: '추천안',
  action_items: ['액션1'],
  insight_to_record: '배운점',
  workflow_improvement_suggestion: '개선안',
  confidence_level: 'high',
  risk_level: 'D2',
  needs_outbound_or_payment: false,
});

const ceoApprove = JSON.stringify({ decision: 'approve', ceo_note: '승인' });

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't-insight-1',
    instruction_id: 'instr-1',
    assigned_agent: 'CMO',
    title: '마케팅 계획',
    rationale: '인지도 낮음',
    expected_output: '마케팅 계획서',
    status: 'queued',
    approval_required: false,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('executeAgentTaskLive — recalledInsights integration', () => {
  it('injects recalledInsights text into the executive user prompt', async () => {
    const insightText = '[과거 인사이트 — 1개]\n1. [CPO] 단순화가 핵심이다';
    const { llm, calls } = capturingLLM([execOk, ceoApprove]);

    await executeAgentTaskLive(makeTask(), llm, { recalledInsights: insightText });

    // The first LLM call is the executive; the second is the CEO review.
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const executiveCall = calls[0];
    expect(executiveCall.user).toContain('단순화가 핵심이다');
    expect(executiveCall.user).toContain('[과거 인사이트');
  });

  it('works without recalledInsights (backward-compat, no insight prefix)', async () => {
    const { llm, calls } = capturingLLM([execOk, ceoApprove]);

    await executeAgentTaskLive(makeTask(), llm);

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].user).not.toContain('[과거 인사이트');
  });

  it('still completes successfully when recalledInsights is provided', async () => {
    const { llm } = capturingLLM([execOk, ceoApprove]);
    const result = await executeAgentTaskLive(makeTask(), llm, {
      recalledInsights: '과거 인사이트 텍스트',
    });
    expect(result.updated_status).toBe('done');
    expect(result.ceo_decision).toBe('approve');
  });
});
