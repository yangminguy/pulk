// FR-4/5/6/9 + 점검 후속 신규 테스트 —
// 게이트 리포트 사전조건 · 소싱 라우터 · 기획서 생성기 · 정량 4요소 · 제목 35자 강제.

import {
  advanceStatus,
  missingGateReports,
  requiredReportStages,
  GATE_REQUIRED_REPORT_STAGES,
} from '../state-machine';
import type { VideoRoomStatus } from '../types';
import { routeResearchSource, mergeResearchCandidate, SOURCE_PRIORITY } from '../sourcing-router';
import { buildKeyContentPlanDoc, buildPullingPlanDoc } from '../gate-report-docs';
import { assessQuantitativeFactors, QUANT_TARGETS } from '../quantitative-factors';
import { recordVideoPerformance } from '../performance-ingestion';
import { truncateTitleToMax, countTitleLength } from '../../cmo-strategy/title-development';
import { splitIntoSlideChunks, shortHeadline } from '../render-pipeline';

const GATES: VideoRoomStatus[] = [
  'key_content_approval',
  'pulling_content_set_approval',
  'hook_draft_approval',
  'script_approval',
  'video_qa_approval',
  'upload_approval',
];

describe('state-machine 게이트 리포트 사전조건 (FR-6)', () => {
  it.each(GATES)('%s: 리포트 카드 없으면 승인돼도 전이 차단', (gate) => {
    expect(() =>
      advanceStatus(gate, { gateApproved: true, presentCardStages: [] }),
    ).toThrow(/requires report card/);
  });

  it.each(GATES)('%s: 필수 리포트 카드가 있으면 전이 허용', (gate) => {
    const present = requiredReportStages(gate);
    expect(present.length).toBeGreaterThan(0);
    expect(() =>
      advanceStatus(gate, { gateApproved: true, presentCardStages: present }),
    ).not.toThrow();
  });

  it('비게이트 status는 presentCardStages와 무관하게 전이', () => {
    expect(advanceStatus('script_draft', { presentCardStages: [] })).toBe('script_approval');
  });

  it('missingGateReports: 일부만 있으면 없는 것만 반환', () => {
    expect(missingGateReports('hook_draft_approval', ['title_development'])).toEqual([
      'thumbnail_plan',
    ]);
  });

  it('6개 게이트 전부 요구 stage 매핑 존재', () => {
    expect(Object.keys(GATE_REQUIRED_REPORT_STAGES).sort()).toEqual([...GATES].sort());
  });

  it('레거시 호출(presentCardStages 미제공)은 기존 동작 유지', () => {
    expect(advanceStatus('key_content_approval', { gateApproved: true })).toBe(
      'viewtrap_pulling_research',
    );
  });
});

describe('sourcing-router (FR-9 / AC-0)', () => {
  it('성과도·기여도 → 플러그인 오버레이', () => {
    expect(routeResearchSource('performance_contribution')).toBe('viewtrap_overlay');
  });
  it('영상 메타 → YouTube API', () => {
    expect(routeResearchSource('video_meta')).toBe('youtube_api');
  });
  it('노출 확률·키워드 집계 → 뷰트랩 사이트', () => {
    expect(routeResearchSource('viewtrap_aggregates')).toBe('viewtrap_site');
  });
  it('우선순위: API > 오버레이 > 사이트', () => {
    expect(SOURCE_PRIORITY.youtube_api).toBeLessThan(SOURCE_PRIORITY.viewtrap_overlay);
    expect(SOURCE_PRIORITY.viewtrap_overlay).toBeLessThan(SOURCE_PRIORITY.viewtrap_site);
  });

  const meta = {
    videoId: 'abc123', title: '테스트 영상', channelTitle: '채널', viewCount: 12345,
    publishedAt: '2026-01-01T00:00:00Z', subscriberCount: 1000,
  };

  it('병합 레코드는 source/fetched_at 항상 존재', () => {
    const rec = mergeResearchCandidate({
      meta,
      grades: { performance: 'Good', contribution: 'Great' },
      aggregates: { exposure: 'good' },
      fetched_at: '2026-07-12T00:00:00Z',
    });
    expect(rec.fetched_at).toBe('2026-07-12T00:00:00Z');
    expect(rec.sources.meta).toBe('youtube_api');
    expect(rec.sources.grades).toBe('viewtrap_overlay');
    expect(rec.sources.aggregates).toBe('viewtrap_site');
    expect(rec.thumbnailUrl).toContain('abc123');
  });

  it('fetched_at 없으면 throw (소스 불명 데이터 금지)', () => {
    expect(() => mergeResearchCandidate({ meta, fetched_at: '' })).toThrow(/fetched_at/);
  });
});

describe('gate-report-docs (FR-4/FR-5)', () => {
  const baseReport: any = {
    product: '상품', target: '타깃',
    market: [{ keyword: '미용실 마케팅', videoCount: 5, avgViews: 90000, topViews: 300000, longformRatio: 0.8, shortsRatio: 0.2, recentRatio: 0.5, targetFit: '높음', salesLink: '높음', verdict: '진행 추천', verdictReason: '표본·조회 충분' }],
    candidates: [{ videoId: 'vid1', title: '벤치 영상', url: 'https://youtu.be/vid1', thumbnailUrl: 'https://i.ytimg.com/vi/vid1/hqdefault.jpg', channelTitle: '채널', viewCount: 100000, performance: 'Good', contribution: 'Great', isShort: false, keyword: 'k', rank: 1, topPick: true, transcriptAvailable: true, viewer_identity: '원장', identity_match: 'match', identity_reason: '동일 타깃' }],
    applied_sales_logic: { content_topic: '주제', core_target: '원장', target_phenomenon: '손님 없음', desire_to_trigger: '시스템 욕구', plan_user_makes: '배우기', action_to_our_product: '상담', reward_user_expects: '예약 증가' },
    recommended_video_id: 'vid1', recommendation_reason: '이유', approval_request: '승인 요청',
    provenance: { keywords_analyzed: 1, keywords_advanced: 1, candidates_selected: 1, transcripts_fetched: 1, notes: [] },
  };
  const project = { id: 'aaaabbbb-0000', title: '프로젝트' };

  it('키 기획서: 4개 목차 + 썸네일 + KB 인용 포함', () => {
    const doc = buildKeyContentPlanDoc({
      project, report: baseReport,
      pulling_keyword_plan: [{ keyword: '미용실 손님', reason: '현상 레벨 검색어' }],
    });
    expect(doc.html).toContain('키 콘텐츠 주제와 선별 이유');
    expect(doc.html).toContain('벤치마킹 영상');
    expect(doc.html).toContain('판매 논리');
    expect(doc.html).toContain('풀링 키워드 계획');
    expect(doc.html).toContain('i.ytimg.com/vi/vid1');
    expect(doc.html).toContain('[06 §4]');
  });

  it('applied_sales_logic null → throw (FR-4 §3 필수화)', () => {
    expect(() =>
      buildKeyContentPlanDoc({
        project, report: { ...baseReport, applied_sales_logic: null },
        pulling_keyword_plan: [{ keyword: 'k', reason: 'r' }],
      }),
    ).toThrow(/applied_sales_logic/);
  });

  it('풀링 키워드 계획 비면 throw (FR-4 §4)', () => {
    expect(() =>
      buildKeyContentPlanDoc({ project, report: baseReport, pulling_keyword_plan: [] }),
    ).toThrow(/pulling_keyword_plan/);
  });

  it('풀링 리포트 문서: 주제·근거영상·연결 논리 포함', () => {
    const doc = buildPullingPlanDoc({
      project,
      report: {
        product: '상품', target: '타깃', key_content_title: '키 주제', key_funnel_summary: '요약',
        pulling_role: '현상 → 욕구',
        search_summary: { keywords_used: 3, videos_collected: 50, videos_after_dedup: 40, longform_count: 30, over_50k_count: 20, qualified_count: 10 },
        viewtrap_budget: { used: 2, limit: 10, slots: [] },
        topics: [{ rank: 1, topic_name: '풀링 주제', grade: 'A', target_phenomenon: '현상', created_desire: '욕구', linked_key_content: '키 주제', evidence_videos: [{ videoId: 'ev1', title: '근거', url: 'u', thumbnailUrl: 'https://i.ytimg.com/vi/ev1/hqdefault.jpg', channelTitle: 'c', viewCount: 60000, publishedAt: '2026-01-01', isShort: false, exposure: 'good', performance: 'Good', contribution: 'Good', videoScore: 0.8, source: '뷰트랩/YouTube' }], selection_reason: '이유', product_application: '접목', funnel: { phenomenon: 'p', desire: 'd', plan: 'pl', action: 'a', reward: 'r' }, topic_score: 88 }],
        approval_request: '요청',
        provenance: { keywords_generated: 3, clusters_formed: 2, topics_selected: 1, notes: [] },
      } as any,
    });
    expect(doc.html).toContain('풀링 주제');
    expect(doc.html).toContain('i.ytimg.com/vi/ev1');
    expect(doc.html).toContain('키 콘텐츠 연결 논리');
  });

  it('topics 비면 throw', () => {
    expect(() =>
      buildPullingPlanDoc({ project, report: { topics: [], search_summary: {}, viewtrap_budget: {} } as any }),
    ).toThrow(/topics/);
  });
});

describe('quantitative-factors (KB 00·10 정량 4요소)', () => {
  it('목표치가 KB 정본과 일치', () => {
    expect(QUANT_TARGETS).toEqual({ views: 1000, completion_rate: 0.35, intro_retention_30s: 0.6, ctr: 0.1 });
  });

  it('전부 충족 → all_known_pass', () => {
    const rec = recordVideoPerformance({ project_id: 'p', view_count: 2000, completion_rate: 0.4, ctr: 0.12, intro_retention_30s: 0.65 });
    const a = assessQuantitativeFactors(rec);
    expect(a.all_known_pass).toBe(true);
    expect(a.failed_count).toBe(0);
  });

  it('CTR 9%는 fail (구 4% 기준이면 pass였던 값)', () => {
    const rec = recordVideoPerformance({ project_id: 'p', view_count: 2000, completion_rate: 0.4, ctr: 0.09, intro_retention_30s: 0.65 });
    const a = assessQuantitativeFactors(rec);
    expect(a.factors.find((f) => f.factor === 'ctr')?.verdict).toBe('fail');
  });

  it('미수집(null)은 unknown — fail 아님', () => {
    const rec = recordVideoPerformance({ project_id: 'p', view_count: 2000, completion_rate: null, ctr: null });
    const a = assessQuantitativeFactors(rec);
    expect(a.unknown_count).toBe(3); // completion, intro(미제공), ctr
    expect(a.all_known_pass).toBe(true);
  });
});

describe('제목 35자 강제 (KB 07 §13.4)', () => {
  it('39자 제목 → 35자 이내로 절단', () => {
    const long = '릴스 매일 올려도 신규 손님 한 명도 안 오는 원장님들의 치명적 공통점'; // 39자
    expect(countTitleLength(long)).toBeGreaterThan(35);
    const cut = truncateTitleToMax(long);
    expect(countTitleLength(cut)).toBeLessThanOrEqual(35);
    expect(cut.length).toBeGreaterThan(10);
  });

  it('35자 이내는 그대로', () => {
    expect(truncateTitleToMax('짧은 제목')).toBe('짧은 제목');
  });
});

describe('render-pipeline 문단 분할·헤드라인 (점검 잔여 1)', () => {
  it('splitIntoSlideChunks: 긴 원고를 여러 청크로, 원문 전량 보존', () => {
    const text = Array.from({ length: 30 }, (_, i) => `${i + 1}번째 문장입니다. 내용이 이어집니다.`).join(' ');
    const chunks = splitIntoSlideChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(24);
    expect(chunks.join(' ').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });

  it('shortHeadline: 첫 문장을 30자 이내로', () => {
    const h = shortHeadline('이것은 아주 길고 긴 메인 클레임 문장이라서 슬라이드 헤드라인으로는 너무 깁니다. 두번째 문장.');
    expect(h.length).toBeLessThanOrEqual(31); // 30 + '…'
    expect(h).not.toContain('두번째');
  });
});
