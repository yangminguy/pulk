// llm-json — S4 스키마 강제 + 재시도 테스트.

import {
  extractJsonBlock,
  parseJsonWithValidator,
  completeJsonWithRetry,
} from '../index';
import type { LLMClient } from '../../ceo-orchestration/types';

interface Shape {
  name: string;
  count: number;
}

const validateShape = (v: unknown): Shape | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== 'string' || typeof o.count !== 'number') return null;
  return { name: o.name, count: o.count };
};

function fakeLLM(outputs: Array<string | Error>): LLMClient & { calls: string[] } {
  let i = 0;
  const calls: string[] = [];
  return {
    calls,
    async complete({ user }) {
      calls.push(user);
      const out = outputs[Math.min(i, outputs.length - 1)];
      i++;
      if (out instanceof Error) throw out;
      return out as string;
    },
  };
}

describe('extractJsonBlock', () => {
  it('추출: 코드펜스 안 JSON', () => {
    expect(extractJsonBlock('여기요\n```json\n{"a":1}\n```\n끝')).toBe('{"a":1}');
  });
  it('추출: 앞뒤 잡담 속 최외곽 오브젝트', () => {
    expect(extractJsonBlock('답: {"a":{"b":2}} 입니다')).toBe('{"a":{"b":2}}');
  });
  it('추출: 중괄호 없으면 trim만', () => {
    expect(extractJsonBlock('  no json  ')).toBe('no json');
  });
});

describe('parseJsonWithValidator', () => {
  it('유효 JSON + 스키마 일치 → 값', () => {
    expect(parseJsonWithValidator('{"name":"x","count":2}', validateShape)).toEqual({
      name: 'x',
      count: 2,
    });
  });
  it('유효 JSON + 스키마 불일치 → null', () => {
    expect(parseJsonWithValidator('{"name":"x"}', validateShape)).toBeNull();
  });
  it('깨진 JSON → null (throw 금지)', () => {
    expect(parseJsonWithValidator('{name:', validateShape)).toBeNull();
  });
});

describe('completeJsonWithRetry', () => {
  it('1차 성공 → attempts 1', async () => {
    const llm = fakeLLM(['{"name":"ok","count":1}']);
    const r = await completeJsonWithRetry(llm, {
      system: 's',
      user: 'u',
      validate: validateShape,
    });
    expect(r.value).toEqual({ name: 'ok', count: 1 });
    expect(r.attempts).toBe(1);
  });

  it('1차 깨짐 → 재시도 프롬프트에 직전 출력 포함, 2차 성공', async () => {
    const llm = fakeLLM(['broken {oops', '{"name":"ok","count":2}']);
    const r = await completeJsonWithRetry(llm, {
      system: 's',
      user: 'base-user',
      validate: validateShape,
    });
    expect(r.value).toEqual({ name: 'ok', count: 2 });
    expect(r.attempts).toBe(2);
    expect(llm.calls[1]).toContain('base-user');
    expect(llm.calls[1]).toContain('broken {oops');
    expect(llm.calls[1]).toContain('[재시도 지시]');
  });

  it('전 시도 실패 → value null + 마지막 raw 보존', async () => {
    const llm = fakeLLM(['nope', 'still nope']);
    const r = await completeJsonWithRetry(llm, {
      system: 's',
      user: 'u',
      validate: validateShape,
    });
    expect(r.value).toBeNull();
    expect(r.attempts).toBe(2);
    expect(r.raw).toBe('still nope');
  });

  it('LLM throw → never-throw, null 반환', async () => {
    const llm = fakeLLM([new Error('api down')]);
    const r = await completeJsonWithRetry(llm, {
      system: 's',
      user: 'u',
      validate: validateShape,
    });
    expect(r.value).toBeNull();
    expect(r.raw).toBeNull();
  });

  it('maxAttempts 존중 (3회)', async () => {
    const llm = fakeLLM(['x', 'y', '{"name":"ok","count":3}']);
    const r = await completeJsonWithRetry(llm, {
      system: 's',
      user: 'u',
      validate: validateShape,
      maxAttempts: 3,
    });
    expect(r.value).toEqual({ name: 'ok', count: 3 });
    expect(r.attempts).toBe(3);
  });
});
