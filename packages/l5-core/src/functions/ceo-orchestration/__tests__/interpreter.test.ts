import { interpretFounderInstruction } from '../interpreter';
import type { FounderInstruction, LLMClient } from '../types';

function mockLLM(response: string): LLMClient {
  return { complete: async () => response };
}

const baseInstruction: FounderInstruction = {
  id: 'fi_1',
  raw_text: 'Launch a waitlist for AI coding assistant by next Friday.',
  source: 'chat',
  status: 'new',
  created_at: '2026-05-26T00:00:00Z',
};

const validJson = JSON.stringify({
  goal: 'Launch AI coding assistant waitlist',
  phase: 'execution_system_build',
  assumptions: ['Founder has landing page copy'],
  success_criteria: ['100 signups in 7 days'],
  risk_level: 'D3',
  approval_required: true,
});

describe('interpretFounderInstruction', () => {
  it('parses valid JSON LLM output into a CEOInterpretation', async () => {
    const result = await interpretFounderInstruction(baseInstruction, {
      llm: mockLLM(validJson),
      now: () => new Date('2026-05-26T00:00:01Z'),
      idGenerator: () => 'interp_test',
    });
    expect(result.id).toBe('interp_test');
    expect(result.instruction_id).toBe('fi_1');
    expect(result.goal).toBe('Launch AI coding assistant waitlist');
    expect(result.phase).toBe('execution_system_build');
    expect(result.risk_level).toBe('D3');
    expect(result.approval_required).toBe(true);
    expect(result.created_at).toBe('2026-05-26T00:00:01.000Z');
  });

  it('extracts JSON from fenced code blocks', async () => {
    const fenced = '```json\n' + validJson + '\n```';
    const result = await interpretFounderInstruction(baseInstruction, {
      llm: mockLLM(fenced),
    });
    expect(result.goal).toBe('Launch AI coding assistant waitlist');
  });

  it('extracts JSON from prose-wrapped output', async () => {
    const prose = `Sure, here is the interpretation: ${validJson} Hope this helps!`;
    const result = await interpretFounderInstruction(baseInstruction, {
      llm: mockLLM(prose),
    });
    expect(result.risk_level).toBe('D3');
  });

  it('throws when required field is missing', async () => {
    const bad = JSON.stringify({
      goal: 'x',
      phase: 'direction_alignment',
      assumptions: [],
      success_criteria: [],
      risk_level: 'D1',
    });
    await expect(
      interpretFounderInstruction(baseInstruction, { llm: mockLLM(bad) })
    ).rejects.toThrow(/missing field: approval_required/);
  });

  it('throws when assumptions is not an array', async () => {
    const bad = JSON.stringify({ ...JSON.parse(validJson), assumptions: 'oops' });
    await expect(
      interpretFounderInstruction(baseInstruction, { llm: mockLLM(bad) })
    ).rejects.toThrow(/must be arrays/);
  });

  it('throws on non-JSON LLM output', async () => {
    await expect(
      interpretFounderInstruction(baseInstruction, { llm: mockLLM('no json here') })
    ).rejects.toThrow(/no JSON object/);
  });

  it('passes Langfuse-style trace metadata to the LLM client', async () => {
    const calls: any[] = [];
    const llm: LLMClient = {
      complete: async args => {
        calls.push(args);
        return validJson;
      },
    };
    await interpretFounderInstruction(baseInstruction, { llm });
    expect(calls[0].trace_name).toBe('ceo.interpretFounderInstruction');
    expect(calls[0].trace_metadata).toEqual({ instruction_id: 'fi_1' });
  });

  // Business inference cases
  it('assigns business_id when LLM picks a clear match from active list', async () => {
    const llmJson = JSON.stringify({
      ...JSON.parse(validJson),
      business_id: 'biz_42',
      needs_business_clarification: false,
    });
    const result = await interpretFounderInstruction(baseInstruction, {
      llm: mockLLM(llmJson),
      activeBusinesses: [
        { id: 'biz_42', name: 'AI Coding Assistant', one_liner: 'AI pair programmer for devs' },
        { id: 'biz_99', name: 'HR Automation', one_liner: 'Automate HR workflows' },
      ],
    });
    expect(result.business_id).toBe('biz_42');
    expect(result.needs_business_clarification).toBe(false);
    expect(result.business_clarification_question).toBeUndefined();
  });

  it('sets needs_business_clarification=true and omits business_id when ambiguous', async () => {
    const llmJson = JSON.stringify({
      ...JSON.parse(validJson),
      business_id: null,
      needs_business_clarification: true,
      business_clarification_question: 'Which business is this for — AI Coding Assistant or HR Automation?',
    });
    const result = await interpretFounderInstruction(baseInstruction, {
      llm: mockLLM(llmJson),
      activeBusinesses: [
        { id: 'biz_42', name: 'AI Coding Assistant' },
        { id: 'biz_99', name: 'HR Automation' },
      ],
    });
    expect(result.needs_business_clarification).toBe(true);
    expect(result.business_id).toBeNull();
    expect(result.business_clarification_question).toBe(
      'Which business is this for — AI Coding Assistant or HR Automation?'
    );
  });

  it('defaults business_id to null when activeBusinesses list is empty', async () => {
    // LLM might try to set something; parser must ignore it when no active list
    const llmJson = JSON.stringify({
      ...JSON.parse(validJson),
      business_id: 'biz_42',
      needs_business_clarification: true,
      business_clarification_question: 'Which business?',
    });
    const result = await interpretFounderInstruction(baseInstruction, {
      llm: mockLLM(llmJson),
      activeBusinesses: [],
    });
    expect(result.business_id).toBeNull();
    expect(result.needs_business_clarification).toBe(false);
    expect(result.business_clarification_question).toBeUndefined();
  });
});
