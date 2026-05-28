import { answerClarifications } from '../clarifier';
import type { LLMClient } from '../../ceo-orchestration/types';

const baseInput = {
  task_title: 'Implement signup endpoint',
  expected_output: 'POST /signup returns 201 with user id',
  risk_level: 'D2' as const,
  questions: ['Should we send a verification email?', 'Use bcrypt or argon2 for hashing?'],
};

function mockLLM(response: string): LLMClient {
  return { complete: async () => response } as unknown as LLMClient;
}

function throwingLLM(msg: string): LLMClient {
  return {
    complete: async () => {
      throw new Error(msg);
    },
  } as unknown as LLMClient;
}

describe('answerClarifications', () => {
  it('returns answered with empty answers when no questions provided', async () => {
    const out = await answerClarifications({ ...baseInput, questions: [] });
    expect(out.verdict).toBe('answered');
    expect(out.answers).toEqual([]);
  });

  it('escalates D4 without consulting LLM', async () => {
    const llm = mockLLM('{"answers":["a","b"]}');
    const out = await answerClarifications({ ...baseInput, risk_level: 'D4' }, llm);
    expect(out.verdict).toBe('escalate');
    expect(out.reason).toContain('D4');
    expect(out.answers).toEqual(['', '']);
  });

  it('escalates D5 without consulting LLM', async () => {
    const llm = mockLLM('{"answers":["a","b"]}');
    const out = await answerClarifications({ ...baseInput, risk_level: 'D5' }, llm);
    expect(out.verdict).toBe('escalate');
    expect(out.reason).toContain('D5');
  });

  it('escalates when no LLM is supplied for D1-D3', async () => {
    const out = await answerClarifications(baseInput);
    expect(out.verdict).toBe('escalate');
    expect(out.reason).toContain('no LLM');
  });

  it('answers D2 with valid LLM JSON', async () => {
    const llm = mockLLM('{"answers":["Yes, send verification email.","Use argon2."]}');
    const out = await answerClarifications(baseInput, llm);
    expect(out.verdict).toBe('answered');
    expect(out.answers).toEqual(['Yes, send verification email.', 'Use argon2.']);
    expect(out.reason).toContain('D2');
  });

  it('strips ```json fences from LLM output', async () => {
    const llm = mockLLM('```json\n{"answers":["a1","a2"]}\n```');
    const out = await answerClarifications(baseInput, llm);
    expect(out.verdict).toBe('answered');
    expect(out.answers).toEqual(['a1', 'a2']);
  });

  it('escalates when LLM throws', async () => {
    const llm = throwingLLM('rate limited');
    const out = await answerClarifications(baseInput, llm);
    expect(out.verdict).toBe('escalate');
    expect(out.reason).toContain('rate limited');
  });

  it('escalates when LLM output is not valid JSON', async () => {
    const llm = mockLLM('I do not know.');
    const out = await answerClarifications(baseInput, llm);
    expect(out.verdict).toBe('escalate');
    expect(out.reason).toContain('not parseable');
  });

  it('escalates when answer count mismatches question count', async () => {
    const llm = mockLLM('{"answers":["only one"]}');
    const out = await answerClarifications(baseInput, llm);
    expect(out.verdict).toBe('escalate');
    expect(out.reason).toContain('1/2');
  });

  it('escalates when any answer is empty', async () => {
    const llm = mockLLM('{"answers":["valid",""]}');
    const out = await answerClarifications(baseInput, llm);
    expect(out.verdict).toBe('escalate');
  });
});
