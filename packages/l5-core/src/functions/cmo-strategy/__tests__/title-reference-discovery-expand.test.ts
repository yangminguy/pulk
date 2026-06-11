import { discoverTitleReferences } from '../title-reference-discovery';

const hit = (id: string, title: string) => ({
  video_id: id,
  title,
  channel_id: `ch-${id}`,
  channel_title: `채널-${id}`,
  url: `https://www.youtube.com/watch?v=${id}`,
});

describe('discoverTitleReferences — 2차 의미범위 확장', () => {
  it('1차 적격 후보가 부족하면 expandQueries로 2차 검색해 2개를 채운다', async () => {
    const searched: string[] = [];
    const res = await discoverTitleReferences(
      { pulling_topic: '아주 좁은 문장형 주제라 검색이 안 되는 케이스', target_audience: '작은 브랜드 대표' },
      {
        search: async (q) => {
          searched.push(q);
          if (q === '확장어A') return [hit('v1', '확장 영상 1')];
          if (q === '확장어B') return [hit('v2', '확장 영상 2')];
          return []; // 1차 deterministic 쿼리는 전부 0건
        },
        getStats: async (ids) => Object.fromEntries(ids.map((i) => [i, 120_000])),
        expandQueries: async ({ existing_queries }) => {
          expect(existing_queries.length).toBeGreaterThan(0);
          return ['확장어A', '확장어B'];
        },
      },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.references).toHaveLength(2);
      expect(res.references.every((r) => r.topic_similarity === 'expanded_same_meaning')).toBe(true);
      expect(res.notes.join(' ')).toContain('2차 의미범위 확장 검색');
    }
    expect(searched).toContain('확장어A');
  });

  it('확장 결과도 조회수 미달이면 여전히 insufficient_candidates', async () => {
    const res = await discoverTitleReferences(
      { pulling_topic: '주제', target_audience: '대표' },
      {
        search: async (q) => (q === '확장어A' ? [hit('v1', 't1'), hit('v2', 't2')] : []),
        getStats: async (ids) => Object.fromEntries(ids.map((i) => [i, 100])),
        expandQueries: async () => ['확장어A'],
      },
    );
    expect(res.ok).toBe(false);
  });

  it('expandQueries가 throw해도 1차 결과로 graceful 진행', async () => {
    const res = await discoverTitleReferences(
      { pulling_topic: '주제', target_audience: '대표' },
      {
        search: async () => [],
        getStats: async () => ({}),
        expandQueries: async () => {
          throw new Error('LLM down');
        },
      },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.notes.join(' ')).toContain('검색 결과 0건');
  });
});
