import {
  runDiscoveryPipeline,
  buildSelectionReason,
  toKeyViewtrapValidationInput,
  toPullingViewtrapValidationInput,
  toLongtailCandidateInputs,
  type DiscoveryPipelineDeps,
  type RunDiscoveryPipelineInput,
  type DiscoveryCandidate,
} from '../discovery-pipeline';
import type { ClassifyDiscoveredVideosResult } from '../discovery-classification';
import { buildViewtrapValidation } from '../key-content-planning';
import { buildPullingViewtrapValidation } from '../pulling-content-planning';
import { findLongtailEvergreen } from '../viewtrap-tools';
import type { ProductBrief } from '../types';

const product: ProductBrief = {
  product_name: '리스토어',
  category: '영상 편집 SaaS',
  target_audience: '1인 크리에이터',
  core_offer: '자동 편집',
  business_goal: 'brand_growth',
};

const baseInput: RunDiscoveryPipelineInput = {
  query: '인스타 릴스 만드는 법',
  product,
  target: '릴스를 처음 만드는 1인 크리에이터',
  mode: 'key',
};

function classifyResult(
  classifications: ClassifyDiscoveredVideosResult['classifications'],
  fallback_count = 0,
): ClassifyDiscoveredVideosResult {
  return {
    mode: 'key',
    model: 'claude-sonnet-4-6',
    classifications,
    candidate_video_ids: classifications.filter((c) => c.candidate_basis).map((c) => c.videoId),
    fallback_count,
  };
}

function makeDeps(overrides: Partial<DiscoveryPipelineDeps> = {}): DiscoveryPipelineDeps {
  return {
    async searchVideos() {
      return [
        { videoId: 'v1', title: '릴스 A', channelTitle: 'ch1' },
        { videoId: 'v2', title: '릴스 B', channelTitle: 'ch2' },
      ];
    },
    async getVideoStats() {
      return [
        { videoId: 'v1', viewCount: 120_000 },
        { videoId: 'v2', viewCount: 3_000 }, // under 50k → filtered out
      ];
    },
    async classify(videos) {
      return classifyResult(
        videos.map((v) => ({
          videoId: v.videoId,
          verdict: 'fit' as const,
          reasons: ['타깃이 볼 주제'],
          candidate_basis: v.viewCount >= 50_000,
          source: 'llm' as const,
        })),
      );
    },
    ...overrides,
  };
}

describe('runDiscoveryPipeline', () => {
  it('full flow: search → stats+filter → classify → candidates', async () => {
    const res = await runDiscoveryPipeline(baseInput, makeDeps());
    // v2 filtered out by 5만+ filter.
    expect(res.videos.map((v) => v.videoId)).toEqual(['v1']);
    expect(res.candidates.map((c) => c.videoId)).toEqual(['v1']);
    expect(res.provenance).toMatchObject({
      searched: true,
      stats: true,
      scraped: false,
      classified: true,
    });
  });

  it('merges scraped metrics and exposes them on candidates', async () => {
    const deps = makeDeps({
      async scrapeMetrics() {
        return [{ videoId: 'v1', contribution: 'Great', performance: 'Good', exposure: 'good', publishedAge: 'old' }];
      },
    });
    const res = await runDiscoveryPipeline(baseInput, deps);
    expect(res.provenance.scraped).toBe(true);
    expect(res.candidates[0].metrics).toMatchObject({
      기여도: 'Great',
      성과도: 'Good',
      노출확률: 'good',
      게시일: 'old',
    });
  });

  it('search failure → empty result, no throw', async () => {
    const deps = makeDeps({
      async searchVideos() {
        throw new Error('quota exceeded');
      },
    });
    const res = await runDiscoveryPipeline(baseInput, deps);
    expect(res.videos).toEqual([]);
    expect(res.candidates).toEqual([]);
    expect(res.provenance.searched).toBe(false);
    expect(res.provenance.notes.join()).toContain('quota exceeded');
  });

  it('stats failure → keeps videos at viewCount 0, no 5만+ filter applied', async () => {
    const deps = makeDeps({
      async getVideoStats() {
        throw new Error('stats 500');
      },
      // classify marks fit but candidate_basis requires good performance (50k or grade)
      async classify(videos) {
        return classifyResult(
          videos.map((v) => ({
            videoId: v.videoId,
            verdict: 'fit' as const,
            reasons: ['ok'],
            candidate_basis: false, // no perf data → not a candidate
            source: 'llm' as const,
          })),
        );
      },
    });
    const res = await runDiscoveryPipeline(baseInput, deps);
    expect(res.provenance.stats).toBe(false);
    // both videos pass through (no filter), classified, but not candidates.
    expect(res.videos.map((v) => v.videoId).sort()).toEqual(['v1', 'v2']);
    expect(res.candidates).toEqual([]);
  });

  it('scrape failure → continues with stats-only data', async () => {
    const deps = makeDeps({
      async scrapeMetrics() {
        throw new Error('CDP not connected');
      },
    });
    const res = await runDiscoveryPipeline(baseInput, deps);
    expect(res.provenance.scraped).toBe(false);
    expect(res.provenance.notes.join()).toContain('CDP not connected');
    expect(res.candidates.map((c) => c.videoId)).toEqual(['v1']);
  });

  it('classify failure → no candidates, notes recorded', async () => {
    const deps = makeDeps({
      async classify() {
        throw new Error('sonnet timeout');
      },
    });
    const res = await runDiscoveryPipeline(baseInput, deps);
    expect(res.candidates).toEqual([]);
    expect(res.provenance.classified).toBe(false);
    expect(res.provenance.notes.join()).toContain('sonnet timeout');
  });

  it('no classify dep → deterministic ambiguous fallback (no llm) → 0 candidates', async () => {
    const deps = makeDeps({ classify: undefined });
    const res = await runDiscoveryPipeline(baseInput, deps);
    expect(res.candidates).toEqual([]);
    expect(res.classificationResult?.fallback_count).toBe(1); // v1 only after filter
  });
});

// ── 변환 규약 (cross-step 규칙 통과) ─────────────────────────────────────────

function candidate(metrics: Record<string, string>): DiscoveryCandidate {
  return {
    videoId: 'v1',
    title: '릴스 잘 만드는 법',
    channelTitle: 'ch1',
    viewCount: 120_000,
    metrics,
    classification: {
      videoId: 'v1',
      verdict: 'fit',
      reasons: ['타깃이 검색하는 주제', '판매논리 연결 가능'],
      candidate_basis: true,
      source: 'llm',
    },
  };
}

describe('conversion contracts', () => {
  it('toKeyViewtrapValidationInput → buildViewtrapValidation yields use verdict on good grades', () => {
    const cands = [candidate({ 성과도: 'Great', 기여도: 'Good' })];
    const input = toKeyViewtrapValidationInput(cands, { validatedKeywords: ['릴스'] });
    expect(input.performance_score).toBe('great');
    expect(input.contribution_score).toBe('good');
    expect(input.growth_status).toBe('unknown');
    const validation = buildViewtrapValidation(input);
    expect(validation.verdict).toBe('use');
  });

  it('toPullingViewtrapValidationInput → buildPullingViewtrapValidation passes schema + verdict', () => {
    const cands = [candidate({ 성과도: 'Good', 기여도: 'Normal' })];
    const input = toPullingViewtrapValidationInput(cands, { searchKeyword: '릴스 편집' });
    const validation = buildPullingViewtrapValidation(input);
    expect(validation.search_keyword).toBe('릴스 편집');
    expect(validation.performance_score).toBe('good');
    expect(validation.verdict).toBe('use');
  });

  it('toLongtailCandidateInputs → findLongtailEvergreen flags old+good as must_use', () => {
    const oldGood = candidate({ 노출확률: 'good', 게시일: 'old' });
    const recentGreat: DiscoveryCandidate = {
      ...candidate({ 노출확률: 'great', 게시일: 'recent' }),
      videoId: 'v2',
      title: '최신 영상',
    };
    const inputs = toLongtailCandidateInputs([oldGood, recentGreat]);
    const found = findLongtailEvergreen(inputs);
    expect(found).toHaveLength(1);
    expect(found[0].source_title).toBe('릴스 잘 만드는 법');
    expect(found[0].must_use).toBe(true);
    expect(found[0].exposure_probability).toBe('good');
  });

  it('buildSelectionReason uses real metrics + classification reasons', () => {
    const reason = buildSelectionReason(candidate({ 성과도: 'Great', 기여도: 'Good', 노출확률: 'good' }));
    expect(reason).toContain('조회수 120,000');
    expect(reason).toContain('성과도 Great');
    expect(reason).toContain('기여도 Good');
    expect(reason).toContain('노출확률 good');
    expect(reason).toContain('타깃이 검색하는 주제');
  });
});
