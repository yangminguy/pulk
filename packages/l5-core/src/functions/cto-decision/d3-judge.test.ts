import { judgeD3Task } from './d3-judge';
import type { D3JudgeInput } from './d3-judge';
import type { LLMClient } from '../ceo-orchestration/types';

function makeInput(overrides: Partial<D3JudgeInput['task']> = {}): D3JudgeInput {
  return {
    task: {
      id: 'task-001',
      title: 'Test D3 task',
      rationale: 'Internal module update',
      expected_output: 'Updated module',
      risk_level: 'D3',
      assigned_agent: 'CTO',
      created_at: new Date().toISOString(),
      ...overrides,
    },
  };
}

function makeLLM(response: string): LLMClient {
  return {
    complete: async () => response,
  };
}

describe('judgeD3Task', () => {
  it('throws when task is not D3', async () => {
    const input = makeInput({ risk_level: 'D2' });
    await expect(judgeD3Task(input, null)).rejects.toThrow('judgeD3Task: not a D3 task');
  });

  it('D5 task also throws', async () => {
    const input = makeInput({ risk_level: 'D5' });
    await expect(judgeD3Task(input, null)).rejects.toThrow('judgeD3Task: not a D3 task');
  });

  it('returns hold with used_llm=false when llm is null', async () => {
    const input = makeInput();
    const result = await judgeD3Task(input, null);
    expect(result.verdict).toBe('hold');
    expect(result.used_llm).toBe(false);
    expect(result.rationale).toContain('LLM 미설정');
  });

  it('returns pass when LLM mock returns pass verdict', async () => {
    const input = makeInput();
    const llm = makeLLM(JSON.stringify({ verdict: 'pass', rationale: '단일 모듈 내부 작업', conditions: ['테스트 커버리지 확인'] }));
    const result = await judgeD3Task(input, llm);
    expect(result.verdict).toBe('pass');
    expect(result.used_llm).toBe(true);
    expect(result.rationale).toBe('단일 모듈 내부 작업');
    expect(result.conditions).toEqual(['테스트 커버리지 확인']);
    expect(result.raw).toBeDefined();
  });

  it('returns escalate when LLM mock returns escalate verdict', async () => {
    const input = makeInput({ title: '고객 이메일 발송' });
    const llm = makeLLM(JSON.stringify({ verdict: 'escalate', rationale: '외부 고객에게 영향', conditions: [] }));
    const result = await judgeD3Task(input, llm);
    expect(result.verdict).toBe('escalate');
    expect(result.used_llm).toBe(true);
    expect(result.rationale).toBe('외부 고객에게 영향');
  });

  it('returns hold with used_llm=false when LLM returns invalid JSON', async () => {
    const input = makeInput();
    const llm = makeLLM('이건 JSON이 아닙니다. 그냥 텍스트 응답입니다.');
    const result = await judgeD3Task(input, llm);
    expect(result.verdict).toBe('hold');
    expect(result.used_llm).toBe(false);
    expect(result.rationale).toContain('파싱 실패');
    expect(result.raw).toBeDefined();
  });

  it('returns hold fallback when LLM returns invalid verdict string', async () => {
    const input = makeInput();
    const llm = makeLLM(JSON.stringify({ verdict: 'approve_now', rationale: '잘못된 값' }));
    const result = await judgeD3Task(input, llm);
    expect(result.verdict).toBe('hold');
    expect(result.used_llm).toBe(false);
    expect(result.raw).toBeDefined();
  });

  it('returns hold with used_llm=false when LLM throws', async () => {
    const input = makeInput();
    const llm: LLMClient = {
      complete: async () => { throw new Error('network timeout'); },
    };
    const result = await judgeD3Task(input, llm);
    expect(result.verdict).toBe('hold');
    expect(result.used_llm).toBe(false);
    expect(result.rationale).toContain('network timeout');
  });

  it('handles LLM response wrapped in markdown code fence', async () => {
    const input = makeInput();
    const payload = JSON.stringify({ verdict: 'hold', rationale: '충돌 가능성 있음' });
    const llm = makeLLM(`\`\`\`json\n${payload}\n\`\`\``);
    const result = await judgeD3Task(input, llm);
    expect(result.verdict).toBe('hold');
    expect(result.used_llm).toBe(true);
  });

  it('includes context in LLM call when provided', async () => {
    let capturedUser = '';
    const llm: LLMClient = {
      complete: async ({ user }) => {
        capturedUser = user;
        return JSON.stringify({ verdict: 'pass', rationale: '문제없음' });
      },
    };
    const input: D3JudgeInput = {
      task: makeInput().task,
      context: {
        business_id: 'biz-123',
        recent_decisions: [{ task_id: 't-0', verdict: 'pass', rationale: '이전', at: '2026-05-01T00:00:00Z' }],
      },
    };
    await judgeD3Task(input, llm);
    expect(capturedUser).toContain('biz-123');
    expect(capturedUser).toContain('recent_decisions');
  });
});
