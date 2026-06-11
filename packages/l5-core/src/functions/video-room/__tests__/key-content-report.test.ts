import {
  computeMarketMetrics,
  decideVerdict,
  isQualifiedCandidate,
  runKeyContentReport,
  type ReportSourceVideo,
  type VideoDurationInfo,
  type KeyContentReportDeps,
} from '../key-content-report';

const NOW = Date.parse('2026-06-11T00:00:00Z');

function vid(id: string, viewCount: number, metrics?: Record<string, string>): ReportSourceVideo {
  return { videoId: id, title: `t-${id}`, channelTitle: `ch-${id}`, viewCount, metrics };
}
function dur(id: string, isShort: boolean, publishedAt: string, seconds = isShort ? 30 : 600): VideoDurationInfo {
  return { videoId: id, isShort, durationSeconds: seconds, publishedAt };
}

describe('computeMarketMetrics', () => {
  it('빈 입력은 0으로', () => {
    expect(computeMarketMetrics([], [], NOW)).toEqual({
      videoCount: 0, avgViews: 0, topViews: 0, longformRatio: 0, shortsRatio: 0, recentRatio: 0,
    });
  });

  it('평균·상위 조회수와 롱폼/쇼츠/최근 비중을 산출', () => {
    const videos = [vid('a', 100_000), vid('b', 50_000), vid('c', 30_000), vid('d', 20_000)];
    const durations = [
      dur('a', false, '2026-05-01T00:00:00Z'), // 롱폼·최근
      dur('b', false, '2026-04-01T00:00:00Z'), // 롱폼·최근
      dur('c', true, '2026-03-01T00:00:00Z'),  // 쇼츠·최근
      dur('d', false, '2024-01-01T00:00:00Z'), // 롱폼·오래됨
    ];
    const m = computeMarketMetrics(videos, durations, NOW);
    expect(m.videoCount).toBe(4);
    expect(m.avgViews).toBe(50_000);
    expect(m.topViews).toBe(100_000);
    expect(m.longformRatio).toBeCloseTo(0.75);
    expect(m.shortsRatio).toBeCloseTo(0.25);
    expect(m.recentRatio).toBeCloseTo(0.75);
  });

  it('duration 미상 영상은 비중 분모에서 제외', () => {
    const videos = [vid('a', 10_000), vid('b', 20_000)];
    const m = computeMarketMetrics(videos, [dur('a', false, '2026-05-01T00:00:00Z')], NOW);
    expect(m.videoCount).toBe(2);
    expect(m.longformRatio).toBeCloseTo(1); // 분모는 duration 아는 1개뿐
  });
});

describe('decideVerdict', () => {
  const strong = { videoCount: 12, avgViews: 40_000, topViews: 120_000, longformRatio: 0.8, shortsRatio: 0.2, recentRatio: 0.6 };

  it('영상 너무 적으면 제외', () => {
    expect(decideVerdict({ ...strong, videoCount: 2 }, '높음', '높음').verdict).toBe('제외');
  });
  it('평균 조회수 낮으면 제외', () => {
    expect(decideVerdict({ ...strong, avgViews: 3_000 }, '높음', '높음').verdict).toBe('제외');
  });
  it('롱폼 비중 낮으면 제외', () => {
    expect(decideVerdict({ ...strong, longformRatio: 0.1 }, '높음', '높음').verdict).toBe('제외');
  });
  it('타깃 적합 낮으면 제외', () => {
    expect(decideVerdict(strong, '낮음', '높음').verdict).toBe('제외');
  });
  it('강한 시장성 + 타깃 높음 → 진행 추천', () => {
    expect(decideVerdict(strong, '높음', '높음').verdict).toBe('진행 추천');
  });
  it('판매연결 낮으면 진행 추천이 아니라 보류', () => {
    expect(decideVerdict(strong, '높음', '낮음').verdict).toBe('보류');
  });
  it('타깃 보통이면 보류', () => {
    expect(decideVerdict(strong, '보통', '높음').verdict).toBe('보류');
  });
});

describe('isQualifiedCandidate', () => {
  it('쇼츠는 탈락', () => {
    expect(isQualifiedCandidate(vid('a', 100_000, { 성과도: 'Great' }), dur('a', true, ''))).toBe(false);
  });
  it('5만 미만은 탈락', () => {
    expect(isQualifiedCandidate(vid('a', 40_000, { 성과도: 'Great' }), dur('a', false, ''))).toBe(false);
  });
  it('성과도/기여도 Good 이상이면 통과', () => {
    expect(isQualifiedCandidate(vid('a', 80_000, { 성과도: 'Good' }), dur('a', false, ''))).toBe(true);
    expect(isQualifiedCandidate(vid('a', 80_000, { 기여도: 'Great' }), dur('a', false, ''))).toBe(true);
  });
  it('등급이 둘 다 비면 조회수만으로 통과(graceful)', () => {
    expect(isQualifiedCandidate(vid('a', 80_000), dur('a', false, ''))).toBe(true);
  });
  it('등급이 있으나 Good 미만이면 탈락', () => {
    expect(isQualifiedCandidate(vid('a', 80_000, { 성과도: 'Bad', 기여도: 'Soso' }), dur('a', false, ''))).toBe(false);
  });
});

describe('runKeyContentReport (deps 주입 통합)', () => {
  function makeDeps(over: Partial<KeyContentReportDeps> = {}): KeyContentReportDeps {
    return {
      async discover(keyword) {
        // "좋은키워드"만 강한 영상 반환
        if (keyword === '좋은키워드') {
          return [
            vid('v1', 200_000, { 성과도: 'Great', 기여도: 'Good' }),
            vid('v2', 90_000, { 성과도: 'Good', 기여도: 'Good' }),
            vid('v3', 60_000, { 성과도: 'Good', 기여도: 'Great' }),
            // 필러(낮은 조회수) — videoCount≥8 충족용. v3 아래라 상위 3선엔 안 들어감.
            ...Array.from({ length: 6 }, (_, i) => vid(`x${i}`, 55_000, { 성과도: 'Good' })),
          ];
        }
        return [vid('weak', 1_000)];
      },
      async getDurations(ids) {
        return ids.map((id) => dur(id, false, '2026-05-01T00:00:00Z'));
      },
      async fetchTranscript() {
        return { available: true, text: '현상 욕구 계획 행동 보상 대본' };
      },
      async llmComplete(prompt) {
        if (prompt.includes('targetFit')) {
          return JSON.stringify([
            { keyword: '좋은키워드', targetFit: '높음', salesLink: '높음' },
            { keyword: '약한키워드', targetFit: '낮음', salesLink: '낮음' },
          ]);
        }
        if (prompt.includes('identity_match')) {
          return JSON.stringify([
            { videoId: 'v1', rank: 1, top: true, viewer_identity: '팀 없이 직접 마케팅하려는 대표', identity_match: 'match', identity_reason: '대표 정체성 일치', reason: 'best' },
            { videoId: 'v2', rank: 2, top: false, viewer_identity: '대표', identity_match: 'match', identity_reason: '일치', reason: 'ok' },
            { videoId: 'v3', rank: 3, top: false, viewer_identity: '대표', identity_match: 'partial', identity_reason: '부분 일치', reason: 'ok' },
          ]);
        }
        if (prompt.includes('판매논리를 분석')) {
          return JSON.stringify({
            monetization: { selling_product: '강의', pinned_comment: '링크', description_links: '본문', profile_links: '프로필', moves_user_to: '랜딩', monetization_method: '강의판매', takeaway_for_us: '참고' },
            funnel: { phenomenon: '현상', desire: '욕구', plan: '계획', action: '행동', reward: '보상' },
          });
        }
        if (prompt.includes('판매논리를 설계')) {
          return JSON.stringify({
            applied: { content_topic: '주제', core_target: '타깃', target_phenomenon: '현상', desire_to_trigger: '욕구', plan_user_makes: '계획', action_to_our_product: '상담신청', reward_user_expects: '보상' },
            recommendation_reason: '가장 적합',
          });
        }
        return '[]';
      },
      nowMs: NOW,
      ...over,
    };
  }

  it('진행 키워드만 후보 풀에 들어가고 최종 3개 + 판매논리 + 추천이 채워진다', async () => {
    const report = await runKeyContentReport(
      { product: { product_name: '상품', category: '카테고리', target_audience: '타깃', core_offer: '제공가치' }, keywords: ['좋은키워드', '약한키워드'] },
      makeDeps(),
    );
    expect(report.market).toHaveLength(2);
    const good = report.market.find((r) => r.keyword === '좋은키워드')!;
    const weak = report.market.find((r) => r.keyword === '약한키워드')!;
    expect(good.verdict).toBe('진행 추천');
    expect(weak.verdict).toBe('제외');
    expect(report.candidates).toHaveLength(3);
    expect(report.candidates[0].topPick).toBe(true);
    expect(report.candidates[0].rank).toBe(1);
    expect(report.candidates[0].funnel?.phenomenon).toBe('현상');
    expect(report.candidates[0].monetization?.selling_product).toBe('강의');
    expect(report.candidates[0].identity_match).toBe('match');
    expect(report.candidates[0].viewer_identity).toContain('대표');
    expect(report.applied_sales_logic?.action_to_our_product).toBe('상담신청');
    expect(report.recommended_video_id).toBe('v1');
    expect(report.provenance.transcripts_fetched).toBe(3);
    expect(report.approval_request).toContain('확정해도 될까요');
  });

  it('시청자 정체성 mismatch 후보는 조회수 높아도 제외된다', async () => {
    const deps = makeDeps({
      async llmComplete(prompt) {
        if (prompt.includes('targetFit')) {
          return JSON.stringify([{ keyword: '좋은키워드', targetFit: '높음', salesLink: '높음' }, { keyword: '약한키워드', targetFit: '낮음', salesLink: '낮음' }])
        }
        if (prompt.includes('identity_match')) {
          // v1(최고 조회수)을 mismatch로 → 제외돼야 함.
          return JSON.stringify([
            { videoId: 'v1', rank: 1, top: true, identity_match: 'mismatch', identity_reason: '실무자 정체성', reason: 'x' },
            { videoId: 'v2', rank: 1, top: true, identity_match: 'match', identity_reason: '대표', reason: 'ok' },
            { videoId: 'v3', rank: 2, top: false, identity_match: 'match', identity_reason: '대표', reason: 'ok' },
          ])
        }
        if (prompt.includes('판매논리를 분석')) return JSON.stringify({ funnel: { phenomenon: '현상' } })
        if (prompt.includes('판매논리를 설계')) return JSON.stringify({ applied: { content_topic: 't' }, recommendation_reason: 'r' })
        return '[]'
      },
    })
    const report = await runKeyContentReport(
      { product: { product_name: '상품', category: '카테고리', target_audience: '마케팅 팀 없는 대표', core_offer: '제공가치' }, keywords: ['좋은키워드'] },
      deps,
    )
    expect(report.candidates.find((c) => c.videoId === 'v1')).toBeUndefined()
    expect(report.candidates.map((c) => c.videoId).sort()).toEqual(['v2', 'v3'])
    expect(report.provenance.notes.some((n) => n.includes('정체성 불일치 제외'))).toBe(true)
  })

  it('discover가 모두 실패해도 throw 없이 빈 후보 보고서', async () => {
    const report = await runKeyContentReport(
      { product: { product_name: '상품', category: '카테고리', target_audience: '타깃', core_offer: '제공가치' }, keywords: ['좋은키워드'] },
      makeDeps({ discover: async () => { throw new Error('cdp down'); } }),
    );
    expect(report.candidates).toHaveLength(0);
    expect(report.provenance.notes.some((n) => n.includes('discover'))).toBe(true);
  });
});
