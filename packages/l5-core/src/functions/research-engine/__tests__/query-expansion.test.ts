import {
  buildQueryExpansionPrompt,
  clampQueries,
  deterministicQueries,
  expandQueries,
  parseQueryExpansionResponse,
} from '../query-expansion';
import { ResearchParseError } from '../types';
import { makeMockLLM, makeRequest } from '../__fixtures__';

describe('deterministicQueries', () => {
  it('produces 8~14 queries covering both markets by default', () => {
    const qs = deterministicQueries(makeRequest());
    expect(qs.length).toBeGreaterThanOrEqual(8);
    expect(qs.length).toBeLessThanOrEqual(14);
    expect(qs.some((q) => q.market === 'KR' && q.lang === 'ko')).toBe(true);
    expect(qs.some((q) => q.market === 'US' && q.lang === 'en')).toBe(true);
  });

  it('emits only Korean queries for a KR-only request', () => {
    const qs = deterministicQueries(makeRequest({ markets: ['KR'] }));
    expect(qs.every((q) => q.market === 'KR')).toBe(true);
  });

  it('always includes the raw topic as a core query', () => {
    const qs = deterministicQueries(makeRequest({ topic: '제목 최적화' }));
    expect(qs.some((q) => q.angle === 'core' && q.q === '제목 최적화')).toBe(true);
  });
});

describe('clampQueries', () => {
  it('de-duplicates by (lang,q) and caps at 14', () => {
    const dup = Array.from({ length: 20 }, () => ({ q: '같은', lang: 'ko' as const, market: 'KR' as const, angle: 'core' as const }));
    expect(clampQueries(dup)).toHaveLength(1);
  });
});

describe('parseQueryExpansionResponse (strict)', () => {
  const req = makeRequest();

  it('parses valid queries and drops langs outside the requested markets', () => {
    const raw = '{"queries":[{"q":"콘텐츠 전략","lang":"ko","angle":"core"},{"q":"content strategy","lang":"en","angle":"methodology"},{"q":"x","lang":"fr","angle":"core"}]}';
    const qs = parseQueryExpansionResponse(raw, req);
    expect(qs.map((q) => q.lang).sort()).toEqual(['en', 'ko']);
  });

  it('drops en queries for a KR-only request', () => {
    const raw = '{"queries":[{"q":"콘텐츠","lang":"ko","angle":"core"},{"q":"content","lang":"en","angle":"core"}]}';
    const qs = parseQueryExpansionResponse(raw, makeRequest({ markets: ['KR'] }));
    expect(qs.every((q) => q.lang === 'ko')).toBe(true);
  });

  it('throws on non-JSON', () => {
    expect(() => parseQueryExpansionResponse('nope', req)).toThrow(ResearchParseError);
  });

  it('throws when there are no valid queries', () => {
    expect(() => parseQueryExpansionResponse('{"queries":[]}', req)).toThrow(ResearchParseError);
  });
});

describe('buildQueryExpansionPrompt', () => {
  it('mentions the topic and required markets', () => {
    const { system, user } = buildQueryExpansionPrompt(makeRequest({ topic: '릴스 편집' }));
    expect(user).toContain('릴스 편집');
    expect(system).toMatch(/KR, US/);
  });
});

describe('expandQueries', () => {
  it('uses LLM output when it meets the floor', async () => {
    const items = Array.from({ length: 8 }, (_, i) => `{"q":"q${i}","lang":"${i % 2 ? 'en' : 'ko'}","angle":"core"}`);
    const llm = makeMockLLM({ 'research.expandQueries': () => `{"queries":[${items.join(',')}]}` });
    const qs = await expandQueries(makeRequest(), llm);
    expect(qs.length).toBeGreaterThanOrEqual(8);
  });

  it('falls back to deterministic queries when the LLM is unavailable', async () => {
    const llm = makeMockLLM({}, { throwAll: true });
    const qs = await expandQueries(makeRequest(), llm);
    expect(qs.length).toBeGreaterThanOrEqual(8);
    // deterministic set always includes the raw topic
    expect(qs.some((q) => q.q === '유튜브 콘텐츠 전략')).toBe(true);
  });

  it('merges to the floor when the LLM returns too few', async () => {
    const llm = makeMockLLM({
      'research.expandQueries': () => '{"queries":[{"q":"only one","lang":"ko","angle":"core"}]}',
    });
    const qs = await expandQueries(makeRequest(), llm);
    expect(qs.length).toBeGreaterThanOrEqual(8);
  });
});
