import {
  classifyDiscoveredVideos,
  CLASSIFICATION_FALLBACK_REASON,
  DISCOVERY_CLASSIFICATION_MODEL,
  type ClassifyDiscoveredVideosInput,
  type DiscoveredVideo,
} from '../discovery-classification';
import type { LLMClient } from '../../ceo-orchestration/types';
import type { ProductBrief } from '../types';

const product: ProductBrief = {
  product_name: '주름개선 화장품',
  category: '안티에이징 스킨케어',
  target_audience: '40~50대 여성',
  core_offer: '4주 주름 개선 크림',
  business_goal: 'product_sale',
};

function video(id: string, overrides: Partial<DiscoveredVideo> = {}): DiscoveredVideo {
  return {
    videoId: id,
    title: `영상 ${id}`,
    channelTitle: `채널 ${id}`,
    viewCount: 100_000,
    ...overrides,
  };
}

function baseInput(
  videos: DiscoveredVideo[],
  overrides: Partial<ClassifyDiscoveredVideosInput> = {},
): ClassifyDiscoveredVideosInput {
  return {
    product,
    target: '주름이 신경 쓰이기 시작한 40~50대 여성',
    videos,
    mode: 'key',
    ...overrides,
  };
}

function mockLLM(responses: Array<string | Error>): {
  llm: LLMClient;
  calls: Array<{ system: string; user: string }>;
} {
  const calls: Array<{ system: string; user: string }> = [];
  let i = 0;
  const llm: LLMClient = {
    async complete({ system, user }) {
      calls.push({ system, user });
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { llm, calls };
}

describe('classifyDiscoveredVideos', () => {
  it('parses fit/ambiguous/unfit from a fenced JSON array and computes candidate basis', async () => {
    const videos = [
      video('v1', { viewCount: 270_000 }),
      video('v2', { viewCount: 1_000 }),
      video('v3', { viewCount: 80_000 }),
    ];
    const { llm } = mockLLM([
      [
        '```json',
        JSON.stringify([
          { videoId: 'v1', verdict: 'fit', reasons: ['타깃이 보는 주제', '판매논리 가능'] },
          { videoId: 'v2', verdict: 'ambiguous', reasons: ['타깃 불명확'] },
          { videoId: 'v3', verdict: 'unfit', reasons: ['타깃 무관'] },
        ]),
        '```',
      ].join('\n'),
    ]);

    const result = await classifyDiscoveredVideos(baseInput(videos), { llm });

    expect(result.model).toBe(DISCOVERY_CLASSIFICATION_MODEL);
    expect(result.fallback_count).toBe(0);
    expect(result.classifications.map((c) => c.verdict)).toEqual(['fit', 'ambiguous', 'unfit']);
    expect(result.classifications[0]).toMatchObject({
      videoId: 'v1',
      source: 'llm',
      candidate_basis: true, // fit + 조회 5만+
    });
    // unfit은 성과 좋아도 후보 근거 아님.
    expect(result.classifications[2].candidate_basis).toBe(false);
    expect(result.candidate_video_ids).toEqual(['v1']);
  });

  it('counts fit + good Viewtrap grade (low views) as candidate basis', async () => {
    const videos = [video('v1', { viewCount: 12_000, metrics: { 성과도: 'Great', 기여도: 'Good' } })];
    const { llm } = mockLLM([
      JSON.stringify([{ videoId: 'v1', verdict: 'fit', reasons: ['적합'] }]),
    ]);

    const result = await classifyDiscoveredVideos(baseInput(videos), { llm });
    expect(result.classifications[0].candidate_basis).toBe(true);
  });

  it('does not count fit + weak performance as candidate basis', async () => {
    const videos = [video('v1', { viewCount: 12_000, metrics: { 성과도: 'Worst' } })];
    const { llm } = mockLLM([
      JSON.stringify([{ videoId: 'v1', verdict: 'fit', reasons: ['적합'] }]),
    ]);

    const result = await classifyDiscoveredVideos(baseInput(videos), { llm });
    expect(result.classifications[0].candidate_basis).toBe(false);
    expect(result.candidate_video_ids).toEqual([]);
  });

  it('keeps bridge_idea in pulling mode and injects key content context into the prompt', async () => {
    const videos = [video('v1')];
    const { llm, calls } = mockLLM([
      JSON.stringify([
        { videoId: 'v1', verdict: 'fit', reasons: ['같은 타깃'], bridge_idea: '주름 원인 → 키 영상으로 연결' },
      ]),
    ]);

    const result = await classifyDiscoveredVideos(
      baseInput(videos, { mode: 'pulling', key_content_context: '키: 주름 잡는 4주 루틴' }),
      { llm },
    );

    expect(result.classifications[0].bridge_idea).toBe('주름 원인 → 키 영상으로 연결');
    expect(calls[0].user).toContain('키: 주름 잡는 4주 루틴');
    expect(calls[0].system).toContain('브릿지');
  });

  it('drops bridge_idea in key mode and includes product/target in the prompt', async () => {
    const videos = [video('v1')];
    const { llm, calls } = mockLLM([
      JSON.stringify([
        { videoId: 'v1', verdict: 'fit', reasons: ['적합'], bridge_idea: '무관한 값' },
      ]),
    ]);

    const result = await classifyDiscoveredVideos(baseInput(videos), { llm });

    expect(result.classifications[0].bridge_idea).toBeUndefined();
    expect(calls[0].user).toContain('주름개선 화장품');
    expect(calls[0].user).toContain('40~50대 여성');
    expect(calls[0].system).toContain('판매논리');
  });

  it('falls back per-call to ambiguous when the LLM keeps failing (no total failure)', async () => {
    const videos = [video('v1'), video('v2')];
    const { llm, calls } = mockLLM([new Error('boom')]);

    const result = await classifyDiscoveredVideos(baseInput(videos), { llm, maxRetries: 1 });

    expect(calls).toHaveLength(2); // 1 + 1 retry
    expect(result.fallback_count).toBe(2);
    for (const c of result.classifications) {
      expect(c).toMatchObject({
        verdict: 'ambiguous',
        reasons: [CLASSIFICATION_FALLBACK_REASON],
        candidate_basis: false,
        source: 'fallback',
      });
    }
  });

  it('retries on invalid JSON and succeeds on the second attempt', async () => {
    const videos = [video('v1')];
    const { llm, calls } = mockLLM([
      '이건 JSON이 아님',
      JSON.stringify([{ videoId: 'v1', verdict: 'unfit', reasons: ['무관'] }]),
    ]);

    const result = await classifyDiscoveredVideos(baseInput(videos), { llm });

    expect(calls).toHaveLength(2);
    expect(result.fallback_count).toBe(0);
    expect(result.classifications[0].verdict).toBe('unfit');
  });

  it('splits videos into batches and only fails the broken batch', async () => {
    const videos = [video('v1'), video('v2'), video('v3'), video('v4'), video('v5')];
    const calls: Array<{ system: string; user: string }> = [];
    let call = 0;
    const llm: LLMClient = {
      async complete({ system, user }) {
        calls.push({ system, user });
        call++;
        if (call === 2) throw new Error('batch 2 down'); // 두 번째 배치(v3,v4)만 실패
        const ids = [...user.matchAll(/"videoId": "(v\d)"/g)].map((m) => m[1]);
        return JSON.stringify(ids.map((id) => ({ videoId: id, verdict: 'fit', reasons: ['ok'] })));
      },
    };

    const result = await classifyDiscoveredVideos(baseInput(videos), {
      llm,
      batchSize: 2,
      maxRetries: 0,
    });

    expect(calls).toHaveLength(3); // [v1,v2] [v3,v4] [v5]
    expect(calls[0].user).toContain('v2');
    expect(calls[0].user).not.toContain('v3');
    expect(result.classifications.map((c) => c.source)).toEqual([
      'llm',
      'llm',
      'fallback',
      'fallback',
      'llm',
    ]);
    expect(result.fallback_count).toBe(2);
  });

  it('falls back only for videos missing from the LLM response', async () => {
    const videos = [video('v1'), video('v2')];
    const { llm } = mockLLM([
      JSON.stringify([{ videoId: 'v1', verdict: 'fit', reasons: ['적합'] }]),
    ]);

    const result = await classifyDiscoveredVideos(baseInput(videos), { llm });

    expect(result.classifications[0].source).toBe('llm');
    expect(result.classifications[1]).toMatchObject({
      videoId: 'v2',
      verdict: 'ambiguous',
      reasons: [CLASSIFICATION_FALLBACK_REASON],
      source: 'fallback',
    });
  });

  it('returns deterministic fallback for every video when no llm is injected', async () => {
    const videos = [video('v1'), video('v2')];
    const result = await classifyDiscoveredVideos(baseInput(videos));
    expect(result.fallback_count).toBe(2);
    expect(result.classifications.every((c) => c.verdict === 'ambiguous')).toBe(true);
  });

  it('handles empty video list without calling the LLM', async () => {
    const { llm, calls } = mockLLM(['unused']);
    const result = await classifyDiscoveredVideos(baseInput([]), { llm });
    expect(calls).toHaveLength(0);
    expect(result.classifications).toEqual([]);
    expect(result.candidate_video_ids).toEqual([]);
  });
});
