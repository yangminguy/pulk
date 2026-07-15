import {
  applyFilters,
  compareRanked,
  dedupeReuploads,
  jaccard,
  planRefill,
  rankCandidates,
  selectCandidates,
  selectShortlist,
  tokenize,
} from '../candidate-selection';
import { makeCandidate, makeRanked, makeRequest } from '../__fixtures__';
import type { CandidateVideo, RankedCandidate } from '../types';

const NOW = new Date('2025-07-01T00:00:00Z');

describe('tokenize / jaccard', () => {
  it('drops <2-char tokens and lowercases', () => {
    expect([...tokenize('YouTube 콘텐츠 a b')]).toEqual(['youtube', '콘텐츠']);
  });
  it('jaccard of identical sets is 1, disjoint is 0', () => {
    expect(jaccard(tokenize('a bb cc'), tokenize('a bb cc'))).toBe(1);
    expect(jaccard(tokenize('aa bb'), tokenize('cc dd'))).toBe(0);
  });
});

describe('applyFilters', () => {
  const req = makeRequest();

  it('excludes videos below the minimum view count (50k)', () => {
    const out = applyFilters([makeCandidate({ videoId: 'lowview', viewCount: 49_999 })], req);
    expect(out.kept).toHaveLength(0);
    expect(out.rejected[0]).toEqual({ videoId: 'lowview', reason: 'below_view_count' });
  });

  it('excludes videos shorter than 240s', () => {
    const out = applyFilters([makeCandidate({ videoId: 'short', durationSeconds: 239 })], req);
    expect(out.rejected[0]).toEqual({ videoId: 'short', reason: 'below_duration' });
  });

  it('excludes live / upcoming broadcasts', () => {
    const out = applyFilters(
      [
        makeCandidate({ videoId: 'live', liveBroadcastContent: 'live' }),
        makeCandidate({ videoId: 'up', liveBroadcastContent: 'upcoming' }),
      ],
      req,
    );
    expect(out.kept).toHaveLength(0);
    expect(out.rejected.map((r) => r.reason)).toEqual(['live_or_upcoming', 'live_or_upcoming']);
  });

  it('de-duplicates identical videoIds', () => {
    const out = applyFilters(
      [makeCandidate({ videoId: 'dup' }), makeCandidate({ videoId: 'dup' })],
      req,
    );
    expect(out.kept).toHaveLength(1);
    expect(out.rejected[0]).toEqual({ videoId: 'dup', reason: 'duplicate_videoid' });
  });

  it('keeps a clean candidate', () => {
    const out = applyFilters([makeCandidate({ videoId: 'ok' })], req);
    expect(out.kept.map((c) => c.videoId)).toEqual(['ok']);
  });
});

describe('dedupeReuploads', () => {
  it('drops a near-identical title within 5s duration, keeping the higher-view copy', () => {
    const original = makeCandidate({
      videoId: 'orig',
      title: '유튜브 알고리즘 완전정복 강의',
      durationSeconds: 600,
      viewCount: 500_000,
    });
    const reupload = makeCandidate({
      videoId: 're',
      title: '유튜브 알고리즘 완전정복 강의',
      durationSeconds: 603,
      viewCount: 100_000,
    });
    const out = dedupeReuploads([original, reupload]);
    expect(out.kept.map((c) => c.videoId)).toEqual(['orig']);
    expect(out.rejected[0]).toEqual({ videoId: 're', reason: 'reupload' });
  });

  it('keeps both when durations differ by more than 5s', () => {
    const a = makeCandidate({ videoId: 'a', title: '같은 제목 강의', durationSeconds: 600 });
    const b = makeCandidate({ videoId: 'b', title: '같은 제목 강의', durationSeconds: 620 });
    const out = dedupeReuploads([a, b]);
    expect(out.kept).toHaveLength(2);
  });
});

describe('rankCandidates', () => {
  const req = makeRequest();
  it('rejects candidates with an undeterminable / out-of-scope market', () => {
    const c = makeCandidate({ videoId: 'nomarket', channelCountry: '', defaultAudioLanguage: '', title: '', description: '' });
    const { ranked, rejected } = rankCandidates([c], req, [], NOW);
    expect(ranked).toHaveLength(0);
    expect(rejected[0]).toEqual({ videoId: 'nomarket', reason: 'unknown_market' });
  });

  it('ranks higher views above lower views (all else equal)', () => {
    const hi = makeCandidate({ videoId: 'hi', viewCount: 1_000_000 });
    const lo = makeCandidate({ videoId: 'lo', viewCount: 60_000 });
    const { ranked } = rankCandidates([lo, hi], req, [], NOW);
    expect(ranked[0].video.videoId).toBe('hi');
  });

  it('produces a strict total order (deterministic tie-break by videoId)', () => {
    const a = makeCandidate({ videoId: 'aaa', viewCount: 100_000, publishedAt: '2025-06-01T00:00:00Z' });
    const b = makeCandidate({ videoId: 'bbb', viewCount: 100_000, publishedAt: '2025-06-01T00:00:00Z' });
    const { ranked } = rankCandidates([b, a], req, [], NOW);
    expect(ranked.map((r) => r.video.videoId)).toEqual(['aaa', 'bbb']);
  });

  it('compareRanked orders by score desc', () => {
    const high = makeRanked({ rankScore: 0.9 });
    const low = makeRanked({ rankScore: 0.1 });
    expect(compareRanked(high, low)).toBeLessThan(0);
  });
});

describe('selectShortlist', () => {
  it('enforces the per-channel cap (max 2) and pushes overflow to refill', () => {
    const req = makeRequest({ requiredVideoCount: 2, markets: ['KR'] });
    const ranked: RankedCandidate[] = [1, 2, 3, 4].map((n, i) =>
      makeRanked(
        { rankScore: 1 - i * 0.1 },
        { videoId: `v${n}`, channelId: 'sameCh' },
      ),
    );
    const { shortlist, refillQueue } = selectShortlist(ranked, req);
    const fromChannel = shortlist.filter((rc) => rc.video.channelId === 'sameCh');
    expect(fromChannel).toHaveLength(2);
    expect(refillQueue.length).toBeGreaterThanOrEqual(2);
  });

  it('guarantees ≥4 per market when available and targets requiredVideoCount+10', () => {
    const req = makeRequest({ requiredVideoCount: 5 }); // target 15
    const kr = Array.from({ length: 10 }, (_, i) =>
      makeRanked({ market: 'KR', rankScore: 0.9 - i * 0.01 }, { videoId: `kr${i}`, channelId: `krch${i}` }),
    );
    const us = Array.from({ length: 10 }, (_, i) =>
      makeRanked({ market: 'US', rankScore: 0.8 - i * 0.01 }, { videoId: `us${i}`, channelId: `usch${i}` }),
    );
    const { shortlist } = selectShortlist([...kr, ...us], req);
    expect(shortlist.length).toBe(15);
    expect(shortlist.filter((s) => s.market === 'KR').length).toBeGreaterThanOrEqual(4);
    expect(shortlist.filter((s) => s.market === 'US').length).toBeGreaterThanOrEqual(4);
  });
});

describe('selectCandidates (end-to-end SELECT) — final 15 selection', () => {
  it('filters, dedupes, ranks and selects requiredVideoCount+10 from a large pool', () => {
    const req = makeRequest({ requiredVideoCount: 5 }); // target 15
    const pool: CandidateVideo[] = [];
    for (let i = 0; i < 40; i++) {
      pool.push(
        makeCandidate({
          videoId: `p${i}`,
          channelId: `pch${i}`,
          market: undefined,
          channelCountry: i % 2 === 0 ? 'KR' : 'US',
          title: i % 2 === 0 ? `콘텐츠 전략 강의 ${i}` : `content strategy ${i}`,
          viewCount: 60_000 + i * 1000,
          durationSeconds: 400,
        }),
      );
    }
    // add a below-threshold and a live one that must be excluded
    pool.push(makeCandidate({ videoId: 'weak', viewCount: 100, channelCountry: 'KR' }));
    pool.push(makeCandidate({ videoId: 'livev', liveBroadcastContent: 'live', channelCountry: 'KR' }));

    const result = selectCandidates(pool, req, [], NOW);
    expect(result.shortlist.length).toBe(15);
    expect(result.shortlist.map((s) => s.video.videoId)).not.toContain('weak');
    expect(result.shortlist.map((s) => s.video.videoId)).not.toContain('livev');
    expect(result.rejected.some((r) => r.videoId === 'weak' && r.reason === 'below_view_count')).toBe(true);
  });
});

describe('planRefill (transcript failure backfill)', () => {
  it('prefers the same market and respects the channel cap', () => {
    const refillQueue: RankedCandidate[] = [
      makeRanked({ market: 'US' }, { videoId: 'usFill', channelId: 'x' }),
      makeRanked({ market: 'KR' }, { videoId: 'krFill', channelId: 'y' }),
    ];
    const next = planRefill({
      refillQueue,
      triedVideoIds: new Set(),
      acceptedChannelCount: new Map(),
      maxPerChannel: 2,
      preferMarket: 'KR',
    });
    expect(next?.video.videoId).toBe('krFill');
  });

  it('skips tried videos and channel-capped channels; returns null when exhausted', () => {
    const refillQueue: RankedCandidate[] = [
      makeRanked({ market: 'KR' }, { videoId: 'tried', channelId: 'a' }),
      makeRanked({ market: 'KR' }, { videoId: 'capped', channelId: 'full' }),
    ];
    const next = planRefill({
      refillQueue,
      triedVideoIds: new Set(['tried']),
      acceptedChannelCount: new Map([['full', 2]]),
      maxPerChannel: 2,
    });
    expect(next).toBeNull();
  });
});
