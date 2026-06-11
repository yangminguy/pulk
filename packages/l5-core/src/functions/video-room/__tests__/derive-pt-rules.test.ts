import {
  derivePTRules,
  DEFAULT_KEY_CONTENT_RULES,
  DEFAULT_PULLING_CONTENT_RULES,
} from '../business-pt-context';

describe('derivePTRules', () => {
  it('LLM 미가용 시 강의 기반 기본 규칙으로 폴백한다', async () => {
    const r = await derivePTRules(['소스1', '소스2']);
    expect(r.source).toBe('fallback');
    expect(r.key_content_rules).toEqual([...DEFAULT_KEY_CONTENT_RULES]);
    expect(r.pulling_content_rules).toEqual([...DEFAULT_PULLING_CONTENT_RULES]);
    expect(r.key_content_rules.length).toBeGreaterThan(0);
  });

  it('LLM이 유효 JSON을 주면 그 규칙을 쓴다', async () => {
    const llmComplete = async () =>
      '{"key_content_rules":["키 규칙 A"],"pulling_content_rules":["풀링 규칙 B"]}';
    const r = await derivePTRules(['s1'], { product: 'P' }, { llmComplete });
    expect(r.source).toBe('llm');
    expect(r.key_content_rules).toEqual(['키 규칙 A']);
    expect(r.pulling_content_rules).toEqual(['풀링 규칙 B']);
  });

  it('LLM이 빈 배열/깨진 출력이면 폴백한다', async () => {
    const empty = await derivePTRules([], {}, { llmComplete: async () => '{"key_content_rules":[],"pulling_content_rules":[]}' });
    expect(empty.source).toBe('fallback');
    const broken = await derivePTRules([], {}, { llmComplete: async () => 'not json' });
    expect(broken.source).toBe('fallback');
    const throws = await derivePTRules([], {}, { llmComplete: async () => { throw new Error('x'); } });
    expect(throws.source).toBe('fallback');
  });
});
