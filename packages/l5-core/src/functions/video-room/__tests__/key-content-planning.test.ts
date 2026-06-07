// Red-phase tests for Key Content Planning Agent — 11-step workflow.
// Aligned with docs/specs/key-content-planning-agent-spec.md §3.2, §3.3, §3.4.
// Spec-named functions (deriveProblemMap, decideKeyContentEntryStage, etc.)
// and missing functions (filterSalesViableCandidates, assembleKeyContentPlan)
// do NOT exist yet → those tests fail (red).

import {
  buildItemGeneralization,
  buildItemFeatureBenefitMap,
  buildCategoryFeatureBenefitMap,
  deriveProblemMap,
  buildFunnelPlanningMap,
  decideKeyContentEntryStage,
  generateSearchKeywords,
  buildViewtrapValidation,
  filterSalesViableCandidates,
  buildSalesLogicMap,
  buildApprovedKeyContentTopic,
  assembleKeyContentPlan,
} from '../key-content-planning';

// ── Shared fixtures ─────────────────────────────────────────────────────────

const PRODUCT = {
  product_name: 'AI 마케팅팀',
  category: '콘텐츠 마케팅 시스템',
  target_audience: '1인 사업자',
  core_offer: 'AI 기반 콘텐츠 기획 자동화',
  business_goal: 'product_sale' as const,
};

const fb = { item: 'AI 기획', description: '감 대신 구조로 기획' };

const pc = {
  id: 'p1',
  problem: '주제가 감으로 정해짐',
  derived_from: '구조적 기획',
};

const fi = { id: 'f1', content: '콘텐츠 주제를 감으로 정한다' };

const GENERALIZATION = {
  item_name: 'AI 마케팅팀',
  direct_category: 'AI 마케팅 자동화',
  parent_category: '콘텐츠 마케팅 시스템',
  customer_problem_category: '작은 브랜드 마케팅 구조',
  reason: '고객이 인식하는 문제로 일반화',
};

const ITEM_FB = {
  features: [fb],
  characteristics: [fb],
  benefits: [fb],
};

const CATEGORY_FB = {
  category_name: '콘텐츠 마케팅 시스템',
  features: [fb],
  characteristics: [fb],
  benefits: [fb],
};

const PROBLEMS = {
  item_problem_candidates: [pc],
  category_problem_candidates: [pc],
  selected_problem_ids: ['p1'],
};

const FUNNEL = {
  phenomenon: [fi],
  desire: [fi],
  plan: [],
  action: [],
  reward: [],
};

const SALES_LOGIC = {
  problem_statement: '콘텐츠 주제가 감으로 정해진다',
  category_feature_benefit: '고객 문제 기반 기획',
  category_need: '콘텐츠 마케팅 시스템',
  item_feature_benefit: '판매 논리 자동 삽입',
  item_solution_statement: 'AI 마케팅팀이 해결',
  cta: '무료 체험 시작',
};

const GOOD_VALIDATION = {
  validated_keywords: ['콘텐츠 마케팅'],
  candidate_titles: ['콘텐츠 마케팅 자동화'],
  performance_score: 'good' as const,
  contribution_score: 'great' as const,
  growth_status: 'growing' as const,
  channel_value_risk: false,
  person_value_risk: false,
  verdict: 'use' as const,
};

// ── Step 1: buildItemGeneralization ─────────────────────────────────────────

describe('buildItemGeneralization', () => {
  it('creates ItemGeneralization from ProductBrief', () => {
    const result = buildItemGeneralization({ product: PRODUCT });
    expect(result.item_name).toBe(PRODUCT.product_name);
    expect(result.direct_category).toBeTruthy();
    expect(result.parent_category).toBeTruthy();
    expect(result.customer_problem_category).toBeTruthy();
    expect(result.reason).toBeTruthy();
  });
});

// ── Step 2: buildItemFeatureBenefitMap ──────────────────────────────────────

describe('buildItemFeatureBenefitMap', () => {
  it('assembles features/characteristics/benefits arrays', () => {
    const result = buildItemFeatureBenefitMap({
      product: PRODUCT,
      features: [fb],
      characteristics: [fb],
      benefits: [fb],
    });
    expect(result.features).toHaveLength(1);
    expect(result.characteristics).toHaveLength(1);
    expect(result.benefits).toHaveLength(1);
  });
});

// ── Step 3: buildCategoryFeatureBenefitMap ──────────────────────────────────

describe('buildCategoryFeatureBenefitMap', () => {
  it('derives category_name from generalization.parent_category', () => {
    const result = buildCategoryFeatureBenefitMap({
      generalization: GENERALIZATION,
      features: [fb],
      characteristics: [fb],
      benefits: [fb],
    });
    expect(result.category_name).toBe(GENERALIZATION.parent_category);
  });
});

// ── Step 4: deriveProblemMap (§3.4: selected_problem_ids ≥ 1) ──────────────

describe('deriveProblemMap', () => {
  it('throws when selected_problem_ids is empty', () => {
    expect(() =>
      deriveProblemMap({
        item_fb: ITEM_FB,
        category_fb: CATEGORY_FB,
        item_problems: [pc],
        category_problems: [pc],
        selected_problem_ids: [],
      }),
    ).toThrow();
  });

  it('returns ProblemDerivationMap with selected problems', () => {
    const result = deriveProblemMap({
      item_fb: ITEM_FB,
      category_fb: CATEGORY_FB,
      item_problems: [pc],
      category_problems: [pc],
      selected_problem_ids: ['p1'],
    });
    expect(result.selected_problem_ids).toContain('p1');
    expect(result.item_problem_candidates).toHaveLength(1);
  });
});

// ── Step 5: buildFunnelPlanningMap (§3.4: 최소 2단계 채움) ─────────────────

describe('buildFunnelPlanningMap', () => {
  it('throws when fewer than 2 stages are filled', () => {
    expect(() =>
      buildFunnelPlanningMap({
        phenomenon: [fi],
        desire: [],
        plan: [],
        action: [],
        reward: [],
      }),
    ).toThrow();
  });

  it('creates FunnelPlanningMap when 2+ stages filled', () => {
    const result = buildFunnelPlanningMap({
      phenomenon: [fi],
      desire: [fi],
      plan: [],
      action: [],
      reward: [],
    });
    expect(result.phenomenon).toEqual([fi]);
    expect(result.desire).toEqual([fi]);
  });
});

// ── Step 6: decideKeyContentEntryStage (§3.4: rationale 필수) ──────────────

describe('decideKeyContentEntryStage', () => {
  it('throws when rationale is empty', () => {
    expect(() =>
      decideKeyContentEntryStage({
        funnel: FUNNEL,
        selected_entry_stage: 'phenomenon',
        rationale: '',
      }),
    ).toThrow();
  });

  it('returns KeyContentEntryDecision with valid input', () => {
    const result = decideKeyContentEntryStage({
      funnel: FUNNEL,
      selected_entry_stage: 'phenomenon',
      rationale: '계획 단계 고객이 부족하여 현상에서 시작',
    });
    expect(result.selected_entry_stage).toBe('phenomenon');
    expect(result.rationale).toBeTruthy();
  });
});

// ── Step 7: generateSearchKeywords (5축 모두 1개 이상) ──────────────────────

describe('generateSearchKeywords', () => {
  it('generates keywords for all 5 axes', () => {
    const result = generateSearchKeywords({
      generalization: GENERALIZATION,
      item_fb: ITEM_FB,
      category_fb: CATEGORY_FB,
      problems: PROBLEMS,
    });
    expect(result.problem_keywords.length).toBeGreaterThan(0);
    expect(result.item_name_keywords.length).toBeGreaterThan(0);
    expect(result.category_name_keywords.length).toBeGreaterThan(0);
    expect(result.item_feature_benefit_keywords.length).toBeGreaterThan(0);
    expect(result.category_feature_benefit_keywords.length).toBeGreaterThan(0);
  });
});

// ── Step 8: buildViewtrapValidation ─────────────────────────────────────────

describe('buildViewtrapValidation', () => {
  it('returns verdict=use when scores are good+', () => {
    const result = buildViewtrapValidation({
      validated_keywords: ['콘텐츠 마케팅'],
      candidate_titles: ['콘텐츠 마케팅 자동화'],
      performance_score: 'good',
      contribution_score: 'good',
      growth_status: 'growing',
      channel_value_risk: false,
      person_value_risk: false,
    });
    expect(result.verdict).toBe('use');
  });

  it('returns verdict=reject when both scores normal + stalled', () => {
    const result = buildViewtrapValidation({
      validated_keywords: ['마케팅'],
      candidate_titles: ['마케팅 기초'],
      performance_score: 'normal',
      contribution_score: 'normal',
      growth_status: 'stalled',
      channel_value_risk: false,
      person_value_risk: false,
    });
    expect(result.verdict).toBe('reject');
  });
});

// ── Step 9: filterSalesViableCandidates (§3.4: risk 필터) ──────────────────

describe('filterSalesViableCandidates', () => {
  it('filters out channel_value_risk candidates', () => {
    const risky = { ...GOOD_VALIDATION, channel_value_risk: true };
    const result = filterSalesViableCandidates([GOOD_VALIDATION, risky]);
    expect(result).toHaveLength(1);
    expect(result[0].channel_value_risk).toBe(false);
  });

  it('filters out person_value_risk candidates', () => {
    const risky = { ...GOOD_VALIDATION, person_value_risk: true };
    const result = filterSalesViableCandidates([risky]);
    expect(result).toHaveLength(0);
  });

  it('filters out rejected verdicts', () => {
    const rejected = { ...GOOD_VALIDATION, verdict: 'reject' as const };
    const result = filterSalesViableCandidates([GOOD_VALIDATION, rejected]);
    expect(result).toHaveLength(1);
  });
});

// ── Step 10: buildSalesLogicMap (§3.4: 전 필드 non-empty) ──────────────────

describe('buildSalesLogicMap', () => {
  it('throws when cta is empty', () => {
    expect(() => buildSalesLogicMap({ ...SALES_LOGIC, cta: '' })).toThrow();
  });

  it('throws when problem_statement is empty', () => {
    expect(() => buildSalesLogicMap({ ...SALES_LOGIC, problem_statement: '  ' })).toThrow();
  });

  it('creates SalesLogicMap with all fields', () => {
    const result = buildSalesLogicMap(SALES_LOGIC);
    expect(result.problem_statement).toBe(SALES_LOGIC.problem_statement);
    expect(result.cta).toBe(SALES_LOGIC.cta);
  });
});

// ── Step 11: buildApprovedKeyContentTopic (§3.4: reject 차단, body ≥ 1) ────

describe('buildApprovedKeyContentTopic', () => {
  const TOPIC_INPUT = {
    title: '감이 아닌 구조로 콘텐츠를 만드는 법',
    thumbnail_promise: '콘텐츠 기획 3단계',
    entry_stage: 'phenomenon' as const,
    sales_logic: SALES_LOGIC,
    viewtrap_validation: GOOD_VALIDATION,
    intro_direction: '문제 공감으로 시작',
    body_structure: ['문제 제시', '카테고리 설명', 'CTA'],
    cta: '무료 체험',
  };

  it('throws when viewtrap verdict is reject', () => {
    expect(() =>
      buildApprovedKeyContentTopic({
        ...TOPIC_INPUT,
        viewtrap_validation: { ...GOOD_VALIDATION, verdict: 'reject' as const },
      }),
    ).toThrow();
  });

  it('throws when body_structure is empty', () => {
    expect(() =>
      buildApprovedKeyContentTopic({ ...TOPIC_INPUT, body_structure: [] }),
    ).toThrow();
  });

  it('throws when title is empty', () => {
    expect(() =>
      buildApprovedKeyContentTopic({ ...TOPIC_INPUT, title: '' }),
    ).toThrow();
  });

  it('creates ApprovedKeyContentTopic on valid input', () => {
    const result = buildApprovedKeyContentTopic(TOPIC_INPUT);
    expect(result.title).toBe(TOPIC_INPUT.title);
    expect(result.entry_stage).toBe('phenomenon');
    expect(result.sales_logic.cta).toBe('무료 체험 시작');
  });
});

// ── Pipeline: assembleKeyContentPlan ────────────────────────────────────────

describe('assembleKeyContentPlan', () => {
  it('validates and returns all 11 step results', () => {
    const input = {
      step1_generalization: GENERALIZATION,
      step2_item_fb: ITEM_FB,
      step3_category_fb: CATEGORY_FB,
      step4_problems: PROBLEMS,
      step5_funnel: FUNNEL,
      step6_entry_decision: {
        selected_entry_stage: 'phenomenon' as const,
        rationale: '계획 단계 고객 부족',
      },
      step7_search_keywords: {
        problem_keywords: ['콘텐츠 주제가 감으로 정해짐'],
        item_name_keywords: ['AI 마케팅팀'],
        category_name_keywords: ['콘텐츠 마케팅 시스템'],
        item_feature_benefit_keywords: ['기획 자동 구조화'],
        category_feature_benefit_keywords: ['유입/판매 분리'],
      },
      step8_viewtrap_validation: GOOD_VALIDATION as any,
      step9_viable_candidates: [GOOD_VALIDATION as any],
      step10_sales_logic: SALES_LOGIC,
      step11_approved_topic: {
        title: '콘텐츠 마케팅 자동화',
        thumbnail_promise: '매출이 오르는 콘텐츠 구조',
        entry_stage: 'phenomenon' as const,
        sales_logic: SALES_LOGIC,
        viewtrap_validation: GOOD_VALIDATION as any,
        intro_direction: '문제 제시로 시작',
        body_structure: ['문제 → 카테고리 → 솔루션 → CTA'],
        cta: '무료 체험',
      },
    };
    const result = assembleKeyContentPlan(input);
    expect(result.step1_generalization).toEqual(GENERALIZATION);
    expect(result.step11_approved_topic.title).toBe('콘텐츠 마케팅 자동화');
  });

  it('throws when step11 has rejected viewtrap', () => {
    const input = {
      step1_generalization: GENERALIZATION,
      step2_item_fb: ITEM_FB,
      step3_category_fb: CATEGORY_FB,
      step4_problems: PROBLEMS,
      step5_funnel: FUNNEL,
      step6_entry_decision: {
        selected_entry_stage: 'phenomenon' as const,
        rationale: '계획 단계 고객 부족',
      },
      step7_search_keywords: {
        problem_keywords: ['x'],
        item_name_keywords: ['x'],
        category_name_keywords: ['x'],
        item_feature_benefit_keywords: ['x'],
        category_feature_benefit_keywords: ['x'],
      },
      step8_viewtrap_validation: { ...GOOD_VALIDATION, verdict: 'reject' as const },
      step9_viable_candidates: [],
      step10_sales_logic: SALES_LOGIC,
      step11_approved_topic: {
        title: '테스트',
        thumbnail_promise: '테스트',
        entry_stage: 'phenomenon' as const,
        sales_logic: SALES_LOGIC,
        viewtrap_validation: { ...GOOD_VALIDATION, verdict: 'reject' as const },
        intro_direction: '테스트',
        body_structure: ['테스트'],
        cta: '테스트',
      },
    };
    expect(() => assembleKeyContentPlan(input)).toThrow();
  });
});
