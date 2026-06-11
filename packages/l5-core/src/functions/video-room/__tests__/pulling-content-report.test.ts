import {
  gradeToScore,
  videoScore,
  topicScore,
  decideGrade,
  computeChannelOutlier,
  runPullingContentReport,
  type PullingReportDeps,
  type RunPullingReportInput,
} from '../pulling-content-report';
import type { ReportSourceVideo, VideoDurationInfo } from '../key-content-report';

const NOW = Date.parse('2026-06-11T00:00:00Z');

function vid(id: string, viewCount: number, metrics?: Record<string, string>): ReportSourceVideo {
  return { videoId: id, title: `t-${id}`, channelTitle: `ch-${id}`, viewCount, metrics };
}
function dur(id: string, isShort = false): VideoDurationInfo {
  return { videoId: id, isShort, durationSeconds: isShort ? 30 : 800, publishedAt: '2026-05-01T00:00:00Z' };
}

// ── 순수함수: gradeToScore ───────────────────────────────────────────────────
describe('gradeToScore', () => {
  it('영어 등급 → 점수', () => {
    expect(gradeToScore('great')).toBe(1.0);
    expect(gradeToScore('good')).toBe(0.75);
    expect(gradeToScore('normal')).toBe(0.5);
    expect(gradeToScore('bad')).toBe(0.25);
    expect(gradeToScore('worst')).toBe(0.0);
  });
  it('대소문자/한글/미수집 처리', () => {
    expect(gradeToScore('GOOD')).toBe(0.75);
    expect(gradeToScore('좋음')).toBe(0.75);
    expect(gradeToScore('')).toBe(0.5);
    expect(gradeToScore(null)).toBe(0.5);
    expect(gradeToScore(undefined)).toBe(0.5);
    expect(gradeToScore('xyz')).toBe(0.5);
  });
});

// ── 순수함수: videoScore (노출확률 최우선 가중) ──────────────────────────────
describe('videoScore', () => {
  it('노출확률 가중이 가장 크다(0.35)', () => {
    const highExp = videoScore({ exposure: 'great', contribution: 'worst', performance: 'worst', viewCount: 0 });
    const highContrib = videoScore({ exposure: 'worst', contribution: 'great', performance: 'worst', viewCount: 0 });
    expect(highExp).toBeGreaterThan(highContrib);
  });
  it('모든 등급 great + 고조회수면 1.0에 근접', () => {
    const s = videoScore({ exposure: 'great', contribution: 'great', performance: 'great', viewCount: 1_000_000, channelAdj: 1, topicFit: 1 });
    expect(s).toBeCloseTo(1.0, 5);
  });
  it('등급 미수집(중립 0.5) + 조회수 0 → 0.5 근방', () => {
    const s = videoScore({ exposure: null, contribution: null, performance: null, viewCount: 0 });
    // 0.35*0.5+0.2*0.5+0.15*0.5+0.1*0+0.1*0.5+0.1*0.5 = 0.45
    expect(s).toBeCloseTo(0.45, 5);
  });
});

// ── 순수함수: topicScore ─────────────────────────────────────────────────────
describe('topicScore', () => {
  it('상위 영상 평균이 주도(0.45)', () => {
    const strong = topicScore({ videoScores: [0.9, 0.8], repeatCount: 2, keyLink: 0.5, productLink: 0.5 });
    const weak = topicScore({ videoScores: [0.2, 0.1], repeatCount: 2, keyLink: 0.5, productLink: 0.5 });
    expect(strong).toBeGreaterThan(weak);
  });
  it('키 콘텐츠 연결성이 점수를 올린다', () => {
    const linked = topicScore({ videoScores: [0.5], repeatCount: 1, keyLink: 1, productLink: 0.5 });
    const unlinked = topicScore({ videoScores: [0.5], repeatCount: 1, keyLink: 0, productLink: 0.5 });
    expect(linked).toBeGreaterThan(unlinked);
  });
});

// ── 순수함수: computeChannelOutlier ──────────────────────────────────────────
describe('computeChannelOutlier', () => {
  it('채널 평균의 2배↑면 1.0(강한 초과성과)', () => {
    expect(computeChannelOutlier(200_000, 100_000)).toBe(1);
    expect(computeChannelOutlier(500_000, 100_000)).toBe(1);
  });
  it('평균과 같으면 0.5, 절반이면 0.25', () => {
    expect(computeChannelOutlier(100_000, 100_000)).toBe(0.5);
    expect(computeChannelOutlier(50_000, 100_000)).toBe(0.25);
  });
  it('채널 평균 미상(0)이면 0.5 중립', () => {
    expect(computeChannelOutlier(100_000, 0)).toBe(0.5);
  });
});

// ── 순수함수: decideGrade ────────────────────────────────────────────────────
describe('decideGrade', () => {
  it('데이터 강 + 연결 강 → A', () => expect(decideGrade(0.7, 0.7)).toBe('A'));
  it('데이터 강 + 연결 약 → B', () => expect(decideGrade(0.7, 0.3)).toBe('B'));
  it('데이터 보통 + 연결 강 → C', () => expect(decideGrade(0.5, 0.7)).toBe('C'));
  it('데이터/연결 약함 → D', () => expect(decideGrade(0.3, 0.3)).toBe('D'));
});

// ── 통합: runPullingContentReport ────────────────────────────────────────────
function makeInput(): RunPullingReportInput {
  return {
    product: { product_name: '마케팅 자동화', category: '마케팅 SaaS', target_audience: '1인 창업자/작은 브랜드 대표', core_offer: '마케팅팀 없이 고객을 움직이는 구조' },
    keyContent: { key_topic_title: '마케팅팀 없이 90일 실전 기록', recommended_video_id: 'KEY1' },
    draftContext: { category: '마케팅', entryStage: '욕구', itemFeatures: ['자동화'], itemBenefits: ['시간절약'], problems: ['콘텐츠 반응 없음', '광고비 낭비'], searchAxes: ['1인 창업 마케팅', '광고비 문의 없음'] },
    maxKeywords: 2,
    targetTopics: 1,
  };
}

function makeDeps(over: Partial<PullingReportDeps> = {}): PullingReportDeps {
  const calls: string[] = [];
  const llmComplete = async (prompt: string): Promise<string> => {
    if (prompt.includes('주제 탐색용 검색어')) {
      return JSON.stringify([
        { query: '콘텐츠 올려도 반응 없음', purpose: '반응 없음 현상', phenomenon: '콘텐츠 반응 없음', desire: '마케팅 구조를 알고 싶다' },
        { query: '광고비 문의 없음', purpose: '광고비 낭비 현상', phenomenon: '광고비 낭비', desire: '광고 전 설득 구조' },
      ]);
    }
    if (prompt.includes('주제 클러스터')) {
      return JSON.stringify([
        { rank: 1, topic_name: '콘텐츠 반응 없는 이유', target_phenomenon: '콘텐츠 반응 없음', created_desire: '마케팅 구조를 알고 싶다', video_indexes: [0, 1], viewer_identity: '작은 브랜드 대표', identity_match: 'match', identity_reason: '대표가 자기 문제로 인식', key_link: 0.8, product_link: 0.7, selection_reason: '노출확률·기여도 강함' },
      ]);
    }
    if (prompt.includes('어떻게 작동하는지')) {
      return JSON.stringify({ funnel: { phenomenon: '콘텐츠 반응 없음', desire: '마케팅 구조', plan: '고객 이동 경로 학습', action: '상품 도입', reward: '구조적 운영' }, product_application: '상품을 바로 팔지 않고 현상을 인식시킨 뒤 키 콘텐츠로 연결한다' });
    }
    return '[]';
  };
  return {
    discover: async (kw: string) => {
      calls.push(kw);
      return [
        vid(`${kw}-A`, 120_000, { 성과도: 'good', 기여도: 'great', 노출확률: 'good' }),
        vid(`${kw}-B`, 80_000, { 성과도: 'normal', 기여도: 'good', 노출확률: 'normal' }),
      ];
    },
    getDurations: async (ids: string[]) => ids.map((id) => dur(id, false)),
    getComments: async () => ['사장인데 도움됐어요', '우리 회사에 바로 적용'],
    llmComplete,
    nowMs: NOW,
    ...over,
  };
}

describe('runPullingContentReport', () => {
  it('실데이터 풀링 보고서를 조립한다(현상→욕구, 정체성 match, 등급)', async () => {
    const report = await runPullingContentReport(makeInput(), makeDeps());
    expect(report.pulling_role).toBe('현상 → 욕구');
    expect(report.topics.length).toBe(1);
    const t = report.topics[0];
    expect(t.target_phenomenon).toBe('콘텐츠 반응 없음');
    expect(t.identity_match).toBe('match');
    expect(t.evidence_videos.length).toBeGreaterThan(0);
    expect(t.funnel.phenomenon).toBeTruthy();
    expect(t.product_application).toContain('현상');
    expect(['A', 'B', 'C', 'D']).toContain(t.grade);
    // 근거 영상은 video_score 내림차순.
    const vs = t.evidence_videos.map((e) => e.videoScore);
    expect([...vs].sort((a, b) => b - a)).toEqual(vs);
  });

  it('뷰트랩 검색 예산은 10회로 제한된다', async () => {
    const input = { ...makeInput(), maxKeywords: 50 };
    const report = await runPullingContentReport(input, makeDeps());
    expect(report.viewtrap_budget.limit).toBe(10);
    expect(report.viewtrap_budget.used).toBeLessThanOrEqual(10);
  });

  it('정체성 불일치 클러스터는 제외된다', async () => {
    const deps = makeDeps({
      llmComplete: async (prompt: string) => {
        if (prompt.includes('주제 탐색용 검색어')) return JSON.stringify([{ query: 'q1', purpose: 'p', phenomenon: 'ph', desire: 'd' }]);
        if (prompt.includes('주제 클러스터')) return JSON.stringify([{ rank: 1, topic_name: 'SNS 글쓰기 자동화', target_phenomenon: 'x', created_desire: 'y', video_indexes: [0], identity_match: 'mismatch', identity_reason: '실무자 정체성', key_link: 0.3, product_link: 0.3, selection_reason: 'r' }]);
        return JSON.stringify({ funnel: {}, product_application: '' });
      },
    });
    const report = await runPullingContentReport({ ...makeInput(), maxKeywords: 1 }, deps);
    expect(report.topics.every((t) => t.identity_match !== 'mismatch')).toBe(true);
    expect(report.provenance.notes.some((n) => n.includes('정체성 불일치 제외'))).toBe(true);
  });

  it('discover 전부 실패해도 throw하지 않고 빈 주제로 진행', async () => {
    const deps = makeDeps({ discover: async () => { throw new Error('CDP down'); } });
    const report = await runPullingContentReport(makeInput(), deps);
    expect(report.search_summary.qualified_count).toBe(0);
    expect(report.topics.length).toBe(0);
    expect(report.provenance.notes.some((n) => n.includes('discover'))).toBe(true);
  });

  it('검색어 생성 실패 시 draft 검색축으로 폴백', async () => {
    const deps = makeDeps({
      llmComplete: async (prompt: string) => {
        if (prompt.includes('주제 탐색용 검색어')) throw new Error('llm down');
        if (prompt.includes('주제 클러스터')) return JSON.stringify([{ rank: 1, topic_name: 'T', target_phenomenon: 'p', created_desire: 'd', video_indexes: [0], identity_match: 'match', key_link: 0.6, product_link: 0.6, selection_reason: 'r' }]);
        return JSON.stringify({ funnel: {}, product_application: 'x' });
      },
    });
    const report = await runPullingContentReport(makeInput(), deps);
    expect(report.provenance.notes.some((n) => n.includes('검색축으로 폴백'))).toBe(true);
    expect(report.search_summary.keywords_used).toBeGreaterThan(0);
  });
});
