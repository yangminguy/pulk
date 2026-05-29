import { generateWorkflow, generateWorkflowWithLLM } from '../generator';
import type { LLMClient } from '../../ceo-orchestration/types';

const baseInput = {
  business_idea: 'AI 기반 회계 자동화 SaaS',
  current_phase: 'pmf_diagnosis' as const,
};

function mockLLM(response: string | (() => Promise<string>)): LLMClient {
  return {
    complete: async () => (typeof response === 'string' ? response : response()),
  };
}

describe('generateWorkflowWithLLM', () => {
  test('returns deterministic baseline when no llm provided', async () => {
    const baseline = generateWorkflow(baseInput);
    const out = await generateWorkflowWithLLM(baseInput);
    expect(out.business_brief.idea_summary).toBe(baseline.business_brief.idea_summary);
    expect(out.pmf_experiment_plan.experiment_type).toBe(baseline.pmf_experiment_plan.experiment_type);
  });

  test('LLM throw → deterministic fallback', async () => {
    const llm = mockLLM(async () => {
      throw new Error('rate limit');
    });
    const out = await generateWorkflowWithLLM(baseInput, llm);
    const baseline = generateWorkflow(baseInput);
    expect(out.business_brief.target_customer).toBe(baseline.business_brief.target_customer);
  });

  test('LLM returns junk → deterministic fallback', async () => {
    const llm = mockLLM('not json at all');
    const out = await generateWorkflowWithLLM(baseInput, llm);
    expect(out.business_brief).toEqual(generateWorkflow(baseInput).business_brief);
  });

  test('LLM returns partial JSON → merges with baseline', async () => {
    const llm = mockLLM(
      JSON.stringify({
        business_brief: {
          target_customer: 'SMB 회계 담당자',
          differentiation: 'GPT 기반 자동 분류 + 한국 세무 규정 반영',
        },
        pmf_experiment_plan: { timeline_days: 14 },
      }),
    );
    const out = await generateWorkflowWithLLM(baseInput, llm);
    expect(out.business_brief.target_customer).toBe('SMB 회계 담당자');
    expect(out.business_brief.differentiation).toContain('GPT');
    // unchanged field still present
    expect(out.business_brief.idea_summary).toBe(baseInput.business_idea);
    expect(out.pmf_experiment_plan.timeline_days).toBe(14);
    // unchanged plan field
    expect(out.pmf_experiment_plan.channels).toEqual(['direct_outreach', 'community', 'social']);
    // staffing untouched
    expect(out.agent_staffing_plan.primary_agent).toBe('CMO');
  });

  test('handles ```json fenced response', async () => {
    const llm = mockLLM('```json\n{"business_brief":{"target_customer":"X"}}\n```');
    const out = await generateWorkflowWithLLM(baseInput, llm);
    expect(out.business_brief.target_customer).toBe('X');
  });
});
