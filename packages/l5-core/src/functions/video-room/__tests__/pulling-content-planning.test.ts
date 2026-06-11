// Tests for Pulling Content Planning Agent — PRD §4 Step 0–12.
// Pure functions, deterministic. Mirrors key-content-planning.test.ts style.

import {
  loadKeyContentSalesLogic,
  buildKeyReadyAudience,
  buildLogicalExpansionMap,
  buildProblemAxisMap,
  buildContentTypePortfolio,
  buildPullingViewtrapValidation,
  buildHotVideoStructureTemplate,
  buildExposureProbabilityCandidate,
  sortByExposureProbability,
  buildLongtailEvergreenCandidate,
  enforceLongtailMustUse,
  scorePullingTopic,
  buildKeyConnectionSentence,
  assessConsumerJourneyCoverage,
  buildApprovedPullingTopic,
  assembleApprovedPullingContentSet,
  assemblePullingContentPlan,
} from '../pulling-content-planning';
import type { ApprovedKeyContentTopic, ApprovedPullingTopic } from '../types';

// ── Shared fixtures ─────────────────────────────────────────────────────────

const KEY_TOPIC: ApprovedKeyContentTopic = {
  title: '마케팅 대행사 쓰기 전에 작은 브랜드 대표가 먼저 알아야 할 것',
  thumbnail_promise: '대행사 쓰기 전 체크',
  entry_stage: 'plan',
  sales_logic: {
    problem_statement: '콘텐츠가 매출로 안 이어진다',
    category_feature_benefit: '유입/판매 콘텐츠 분리',
    category_need: '콘텐츠 마케팅 시스템',
    item_feature_benefit: '판매 논리 자동 삽입',
    item_solution_statement: 'AI 마케팅팀이 해결',
    cta: '무료 진단 신청',
  },
  viewtrap_validation: {
    validated_keywords: ['콘텐츠 마케팅'],
    candidate_titles: ['콘텐츠 마케팅 자동화'],
    performance_score: 'good',
    contribution_score: 'great',
    growth_status: 'growing',
    channel_value_risk: false,
    person_value_risk: false,
    verdict: 'use',
  },
  intro_direction: '문제 공감으로 시작',
  body_structure: ['문제', '카테고리', '상품'],
  cta: '무료 진단 신청',
};

const READY_AUDIENCE = {
  required_problem_awareness: '콘텐츠가 매출로 안 이어진다는 인식',
  required_desire: '손님이 오게 만들고 싶다',
  required_plan_awareness: '대행사를 알아보는 중',
  not_ready_reasons: ['문제 자체를 모름'],
};

const EXPANSION = {
  product: 'AI 마케팅팀',
  category: '콘텐츠 마케팅 시스템',
  feature_benefit: ['고객 구매 흐름 설계'],
  problems: ['콘텐츠가 매출로 안 이어짐'],
  audience_situations: ['작은 브랜드 대표'],
  possible_content_topics: ['인스타 열심히 해도 손님이 안 오는 이유'],
};

const AXIS = {
  symptom_topics: ['인스타 열심히 해도 손님이 안 옴'],
  cause_topics: ['구매 흐름이 없음'],
  desire_topics: ['손님이 오게 만들기'],
  plan_topics: ['콘텐츠 시스템 도입'],
  misconception_topics: ['콘텐츠 양이 답이다'],
  reward_case_topics: ['매출 2배 사례'],
};

const candidate = (title: string, stages: ApprovedPullingTopic['covered_stages']) => ({
  title,
  covered_stages: stages,
  topic_axis: 'symptom',
  key_content_connection: '키 콘텐츠로 연결',
});

const PORTFOLIO = {
  evergreen_candidates: [candidate('에버그린1', ['phenomenon'])],
  daily_candidates: [candidate('데일리1', ['desire'])],
  seasonal_candidates: [],
  hero_candidates: [],
};

const fullScore = scorePullingTopic({
  performance_score: 8,
  contribution_score: 8,
  exposure_probability_score: 8,
  growth_score: 8,
  evergreen_score: 8,
  reproducibility_score: 8,
  key_connection_score: 8,
  sales_logic_connection_score: 8,
  home_selection_score: 8,
});

const approvedTopic = (
  title: string,
  stages: ApprovedPullingTopic['covered_stages'],
): ApprovedPullingTopic => ({
  title,
  thumbnail_promise: `${title} 약속`,
  covered_stages: stages,
  content_type: 'evergreen',
  score: fullScore,
  key_content_connection: '키 콘텐츠로 연결',
});

// covers all 5 stages across the set
const TOPICS_ALL_STAGES: ApprovedPullingTopic[] = [
  approvedTopic('현상/욕구', ['phenomenon', 'desire']),
  approvedTopic('계획', ['plan']),
  approvedTopic('보상', ['reward']),
];

// ── Step 0: loadKeyContentSalesLogic ────────────────────────────────────────

describe('loadKeyContentSalesLogic', () => {
  it('loads the key content sales logic context', () => {
    const ctx = loadKeyContentSalesLogic({ key_content: KEY_TOPIC });
    expect(ctx.key_title).toBe(KEY_TOPIC.title);
    expect(ctx.core_problem).toBe(KEY_TOPIC.sales_logic.problem_statement);
    expect(ctx.cta).toBe(KEY_TOPIC.cta);
  });

  it('throws when key content viewtrap is rejected', () => {
    const rejected: ApprovedKeyContentTopic = {
      ...KEY_TOPIC,
      viewtrap_validation: { ...KEY_TOPIC.viewtrap_validation, verdict: 'reject' },
    };
    expect(() => loadKeyContentSalesLogic({ key_content: rejected })).toThrow();
  });
});

// ── Step 1: buildKeyReadyAudience ───────────────────────────────────────────

describe('buildKeyReadyAudience', () => {
  it('builds a valid ready-audience definition', () => {
    expect(buildKeyReadyAudience(READY_AUDIENCE)).toEqual(READY_AUDIENCE);
  });

  it('throws on empty required fields', () => {
    expect(() =>
      buildKeyReadyAudience({ ...READY_AUDIENCE, required_desire: '' }),
    ).toThrow();
  });
});

// ── Step 2: buildLogicalExpansionMap ────────────────────────────────────────

describe('buildLogicalExpansionMap', () => {
  it('builds a valid expansion map', () => {
    expect(buildLogicalExpansionMap(EXPANSION)).toEqual(EXPANSION);
  });

  it('throws when possible topics are empty', () => {
    expect(() =>
      buildLogicalExpansionMap({ ...EXPANSION, possible_content_topics: [] }),
    ).toThrow();
  });
});

// ── Step 3: buildProblemAxisMap ─────────────────────────────────────────────

describe('buildProblemAxisMap', () => {
  it('builds a valid axis map', () => {
    expect(buildProblemAxisMap(AXIS)).toEqual(AXIS);
  });

  it('throws when all axes are empty', () => {
    expect(() =>
      buildProblemAxisMap({
        symptom_topics: [],
        cause_topics: [],
        desire_topics: [],
        plan_topics: [],
        misconception_topics: [],
        reward_case_topics: [],
      }),
    ).toThrow();
  });
});

// ── Step 4: buildContentTypePortfolio ───────────────────────────────────────

describe('buildContentTypePortfolio', () => {
  it('builds a valid portfolio', () => {
    expect(buildContentTypePortfolio(PORTFOLIO)).toEqual(PORTFOLIO);
  });

  it('throws when both evergreen and daily are empty', () => {
    expect(() =>
      buildContentTypePortfolio({
        evergreen_candidates: [],
        daily_candidates: [],
        seasonal_candidates: [candidate('s', ['phenomenon'])],
        hero_candidates: [],
      }),
    ).toThrow();
  });
});

// ── Step 5: buildPullingViewtrapValidation ──────────────────────────────────

describe('buildPullingViewtrapValidation', () => {
  const base = {
    search_keyword: '목 어깨 통증',
    candidate_titles: ['목 어깨 통증 푸는 법'],
    performance_score: 'good' as const,
    contribution_score: 'great' as const,
    growth_status: 'growing' as const,
    reproducible_low_subscriber: true,
    channel_value_risk: false,
    person_value_risk: false,
  };

  it('returns use when performance/contribution is good+', () => {
    expect(buildPullingViewtrapValidation(base).verdict).toBe('use');
  });

  it('returns reject when channel value risk', () => {
    expect(
      buildPullingViewtrapValidation({ ...base, channel_value_risk: true }).verdict,
    ).toBe('reject');
  });

  it('returns reject when normal+normal+stalled', () => {
    expect(
      buildPullingViewtrapValidation({
        ...base,
        performance_score: 'normal',
        contribution_score: 'normal',
        growth_status: 'stalled',
      }).verdict,
    ).toBe('reject');
  });

  it('returns watch when normal but not stalled', () => {
    expect(
      buildPullingViewtrapValidation({
        ...base,
        performance_score: 'normal',
        contribution_score: 'normal',
        growth_status: 'unknown',
      }).verdict,
    ).toBe('watch');
  });
});

// ── Step 6: buildHotVideoStructureTemplate ──────────────────────────────────

describe('buildHotVideoStructureTemplate', () => {
  const tpl = {
    original_title: '부동산 계약 특약란에 이 문구 쓰면 망합니다',
    structure_pattern: '일반 상황 + 특정 잘못 → 큰 손실',
    emotional_trigger: 'mistake' as const,
    adapted_title: '광고 켜기 전에 이 구조 없으면 돈만 날립니다',
    adapted_thumbnail_promise: '광고 전 필수 구조',
    connected_sales_logic: '콘텐츠 마케팅 시스템 필요',
  };

  it('builds a valid template', () => {
    expect(buildHotVideoStructureTemplate(tpl)).toEqual(tpl);
  });

  it('throws on invalid trigger', () => {
    // @ts-expect-error invalid enum
    expect(() => buildHotVideoStructureTemplate({ ...tpl, emotional_trigger: 'nope' })).toThrow();
  });
});

// ── Step 7: buildExposureProbabilityCandidate + sort ────────────────────────

describe('exposure probability', () => {
  const mk = (p: 'normal' | 'good' | 'great') => ({
    source_title: `t-${p}`,
    exposure_probability: p,
    adapted_topic: `topic-${p}`,
    recommended_content_type: 'daily' as const,
    reason: 'reason',
  });

  it('builds a valid candidate', () => {
    expect(buildExposureProbabilityCandidate(mk('great')).exposure_probability).toBe('great');
  });

  it('sorts great > good > normal', () => {
    const sorted = sortByExposureProbability([mk('normal'), mk('great'), mk('good')]);
    expect(sorted.map((c) => c.exposure_probability)).toEqual(['great', 'good', 'normal']);
  });
});

// ── Step 8: longtail must_use ───────────────────────────────────────────────

describe('buildLongtailEvergreenCandidate', () => {
  it('always sets must_use true and published_age old', () => {
    const lt = buildLongtailEvergreenCandidate({
      source_title: '5년 전 영상',
      exposure_probability: 'great',
      evergreen_reason: '한 번 더 올라갈 주제',
      adapted_topic: '인스타 손님 안 오는 이유',
    });
    expect(lt.must_use).toBe(true);
    expect(lt.published_age).toBe('old');
  });
});

describe('enforceLongtailMustUse', () => {
  const lt = buildLongtailEvergreenCandidate({
    source_title: '5년 전 영상',
    exposure_probability: 'great',
    evergreen_reason: '한 번 더 올라갈 주제',
    adapted_topic: '인스타 손님 안 오는 이유',
  });

  it('passes when the must_use topic is present in approved topics', () => {
    const topics = [approvedTopic('인스타 손님 안 오는 이유', ['phenomenon'])];
    expect(() =>
      enforceLongtailMustUse({ longtail_candidates: [lt], approved_topics: topics }),
    ).not.toThrow();
  });

  it('throws when a must_use longtail topic is missing', () => {
    const topics = [approvedTopic('전혀 다른 주제', ['phenomenon'])];
    expect(() =>
      enforceLongtailMustUse({ longtail_candidates: [lt], approved_topics: topics }),
    ).toThrow(/must_use/);
  });
});

// ── Step 9: scorePullingTopic ───────────────────────────────────────────────

describe('scorePullingTopic', () => {
  it('sums total and yields use for high scores', () => {
    expect(fullScore.total_score).toBe(72);
    expect(fullScore.verdict).toBe('use');
  });

  it('rejects when key_connection_score is 0', () => {
    const s = scorePullingTopic({
      performance_score: 9,
      contribution_score: 9,
      exposure_probability_score: 9,
      growth_score: 9,
      evergreen_score: 9,
      reproducibility_score: 9,
      key_connection_score: 0,
      sales_logic_connection_score: 9,
      home_selection_score: 9,
    });
    expect(s.verdict).toBe('reject');
  });

  it('watch for mid-range total', () => {
    const s = scorePullingTopic({
      performance_score: 5,
      contribution_score: 5,
      exposure_probability_score: 5,
      growth_score: 5,
      evergreen_score: 5,
      reproducibility_score: 5,
      key_connection_score: 2,
      sales_logic_connection_score: 2,
      home_selection_score: 5,
    });
    expect(s.verdict).toBe('watch');
  });
});

// ── Step 10: key connection sentence ────────────────────────────────────────

describe('buildKeyConnectionSentence', () => {
  it('completes the sentence when all fields present', () => {
    const s = buildKeyConnectionSentence({
      audience: '작은 브랜드 대표',
      trigger: '인스타를 열심히 해도 손님이 안 오는 현상',
      key_core_problem: '콘텐츠 양이 아니라 구매 흐름이 문제',
      key_title: KEY_TOPIC.title,
    });
    expect(s).toContain('작은 브랜드 대표');
    expect(s).toContain(KEY_TOPIC.title);
  });

  it('throws when a field is empty (cannot complete)', () => {
    expect(() =>
      buildKeyConnectionSentence({
        audience: '',
        trigger: 't',
        key_core_problem: 'p',
        key_title: 'k',
      }),
    ).toThrow();
  });
});

// ── Step 11: consumer journey coverage ──────────────────────────────────────

describe('assessConsumerJourneyCoverage', () => {
  it('covers all stages across the set (one content can cover multiple)', () => {
    const report = assessConsumerJourneyCoverage({
      pulling_topics: TOPICS_ALL_STAGES,
      key_content: KEY_TOPIC,
    });
    expect(report.phenomenon_covered).toBe(true);
    expect(report.desire_covered).toBe(true);
    expect(report.plan_covered).toBe(true);
    expect(report.action_connected).toBe(true);
    expect(report.reward_promised).toBe(true);
    expect(report.natural_flow_score).toBe(100);
  });

  it('reports uncovered stages', () => {
    const report = assessConsumerJourneyCoverage({
      pulling_topics: [approvedTopic('현상만', ['phenomenon'])],
      key_content: KEY_TOPIC,
    });
    expect(report.reward_promised).toBe(false);
    expect(report.natural_flow_score).toBeLessThan(100);
  });
});

// ── Step 12: approve + assemble set ─────────────────────────────────────────

describe('buildApprovedPullingTopic', () => {
  it('approves a topic with use verdict', () => {
    expect(buildApprovedPullingTopic(approvedTopic('ok', ['phenomenon'])).title).toBe('ok');
  });

  it('throws when score verdict is reject', () => {
    const rejectScore = scorePullingTopic({
      performance_score: 0,
      contribution_score: 0,
      exposure_probability_score: 0,
      growth_score: 0,
      evergreen_score: 0,
      reproducibility_score: 0,
      key_connection_score: 0,
      sales_logic_connection_score: 0,
      home_selection_score: 0,
    });
    expect(() =>
      buildApprovedPullingTopic({ ...approvedTopic('x', ['phenomenon']), score: rejectScore }),
    ).toThrow();
  });
});

describe('assembleApprovedPullingContentSet', () => {
  const fullReport = assessConsumerJourneyCoverage({
    pulling_topics: TOPICS_ALL_STAGES,
    key_content: KEY_TOPIC,
  });

  it('finalizes a set that covers the full journey', () => {
    const set = assembleApprovedPullingContentSet({
      pulling_topics: TOPICS_ALL_STAGES,
      key_content_topic: KEY_TOPIC,
      journey_coverage_report: fullReport,
      set_logic: '현상→욕구→계획→행동→보상 흐름',
    });
    expect(set.approval_status).toBe('approved');
  });

  it('throws when the journey is incomplete', () => {
    const partialReport = assessConsumerJourneyCoverage({
      pulling_topics: [approvedTopic('현상만', ['phenomenon'])],
      key_content: KEY_TOPIC,
    });
    expect(() =>
      assembleApprovedPullingContentSet({
        pulling_topics: [approvedTopic('현상만', ['phenomenon'])],
        key_content_topic: KEY_TOPIC,
        journey_coverage_report: partialReport,
        set_logic: 'x',
      }),
    ).toThrow(/consumer journey/);
  });

  it('throws when a must_use longtail topic is missing', () => {
    const lt = buildLongtailEvergreenCandidate({
      source_title: '오래된 영상',
      exposure_probability: 'great',
      evergreen_reason: '재상승 주제',
      adapted_topic: '절대 없는 주제',
    });
    expect(() =>
      assembleApprovedPullingContentSet({
        pulling_topics: TOPICS_ALL_STAGES,
        key_content_topic: KEY_TOPIC,
        journey_coverage_report: fullReport,
        set_logic: 'x',
        longtail_candidates: [lt],
      }),
    ).toThrow(/must_use/);
  });
});

// ── Pipeline: assemblePullingContentPlan ────────────────────────────────────

describe('assemblePullingContentPlan', () => {
  const journey = assessConsumerJourneyCoverage({
    pulling_topics: TOPICS_ALL_STAGES,
    key_content: KEY_TOPIC,
  });

  const approvedSet = assembleApprovedPullingContentSet({
    pulling_topics: TOPICS_ALL_STAGES,
    key_content_topic: KEY_TOPIC,
    journey_coverage_report: journey,
    set_logic: '전체 흐름',
  });

  const validPlan = {
    step0_key_sales_logic: loadKeyContentSalesLogic({ key_content: KEY_TOPIC }),
    step1_key_ready_audience: READY_AUDIENCE,
    step2_logical_expansion: EXPANSION,
    step3_problem_axis: AXIS,
    step4_content_type_portfolio: PORTFOLIO,
    step5_viewtrap_validations: [
      buildPullingViewtrapValidation({
        search_keyword: 'k',
        candidate_titles: ['t'],
        performance_score: 'good' as const,
        contribution_score: 'good' as const,
        growth_status: 'growing' as const,
        reproducible_low_subscriber: true,
        channel_value_risk: false,
        person_value_risk: false,
      }),
    ],
    step6_hot_video_templates: [],
    step7_exposure_candidates: [],
    step8_longtail_candidates: [],
    step9_topic_scores: [fullScore],
    step10_key_connection_sentences: [
      buildKeyConnectionSentence({
        audience: '작은 브랜드 대표',
        trigger: '손님이 안 오는 현상',
        key_core_problem: '구매 흐름 문제',
        key_title: KEY_TOPIC.title,
      }),
    ],
    step11_journey_coverage: journey,
    step12_approved_set: approvedSet,
  };

  it('returns the plan unchanged when consistent', () => {
    expect(assemblePullingContentPlan(validPlan)).toBe(validPlan);
  });

  it('throws on key title mismatch between step0 and step12', () => {
    const mismatched = {
      ...validPlan,
      step0_key_sales_logic: {
        ...validPlan.step0_key_sales_logic,
        key_title: '다른 키 콘텐츠',
      },
    };
    expect(() => assemblePullingContentPlan(mismatched)).toThrow(/mismatch/);
  });
});
