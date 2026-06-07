// Red-phase tests for CMO v3 Key Content Planning Zod schemas.
// These tests verify that Zod schemas exist, validate correct input,
// and reject invalid input for each Step 1–11 deliverable type.

import {
  FeatureBenefitSchema,
  ProblemCandidateSchema,
  FunnelStageItemSchema,
  ItemGeneralizationSchema,
  ItemFeatureBenefitMapSchema,
  CategoryFeatureBenefitMapSchema,
  ProblemDerivationMapSchema,
  FunnelPlanningMapSchema,
  KeyContentEntryDecisionSchema,
  KeyContentSearchKeywordSetSchema,
  KeyContentViewtrapValidationSchema,
  SalesLogicMapSchema,
  ApprovedKeyContentTopicSchema,
} from '../key-content-planning.schemas';

// ── Helpers ─────────────────────────────────────────────────────────────────

const validFeatureBenefit = { item: 'AI 기획', description: '감 대신 구조로 기획' };
const validProblemCandidate = { id: 'p1', problem: '주제가 감으로 정해짐', derived_from: '구조적 기획' };
const validFunnelStageItem = { id: 'f1', content: '콘텐츠 주제를 감으로 정한다' };

const validSalesLogicMap = {
  problem_statement: '콘텐츠 주제가 감으로 정해진다',
  category_feature_benefit: '고객 문제 기반 기획',
  category_need: '콘텐츠 마케팅 시스템',
  item_feature_benefit: '판매 논리 자동 삽입',
  item_solution_statement: 'AI 마케팅팀이 해결',
  cta: '무료 체험 시작',
};

const validViewtrapValidation = {
  validated_keywords: ['콘텐츠 마케팅'],
  candidate_titles: ['콘텐츠 마케팅 자동화'],
  performance_score: 'good' as const,
  contribution_score: 'great' as const,
  growth_status: 'growing' as const,
  channel_value_risk: false,
  person_value_risk: false,
  verdict: 'use' as const,
};

// ── 보조 타입 스키마 ─────────────────────────────────────────────────────────

describe('FeatureBenefitSchema', () => {
  it('accepts valid input', () => {
    expect(FeatureBenefitSchema.parse(validFeatureBenefit)).toEqual(validFeatureBenefit);
  });

  it('rejects empty item', () => {
    expect(() => FeatureBenefitSchema.parse({ item: '', description: 'desc' })).toThrow();
  });

  it('rejects missing description', () => {
    expect(() => FeatureBenefitSchema.parse({ item: 'x' })).toThrow();
  });
});

describe('ProblemCandidateSchema', () => {
  it('accepts valid input', () => {
    expect(ProblemCandidateSchema.parse(validProblemCandidate)).toEqual(validProblemCandidate);
  });

  it('rejects missing id', () => {
    expect(() => ProblemCandidateSchema.parse({ problem: 'p', derived_from: 'd' })).toThrow();
  });
});

describe('FunnelStageItemSchema', () => {
  it('accepts valid input', () => {
    expect(FunnelStageItemSchema.parse(validFunnelStageItem)).toEqual(validFunnelStageItem);
  });

  it('rejects empty content', () => {
    expect(() => FunnelStageItemSchema.parse({ id: 'f1', content: '' })).toThrow();
  });
});

// ── Step 1. ItemGeneralizationSchema ─────────────────────────────────────────

describe('ItemGeneralizationSchema', () => {
  const valid = {
    item_name: 'AI 마케팅팀',
    direct_category: 'AI 마케팅 자동화',
    parent_category: '콘텐츠 마케팅 시스템',
    customer_problem_category: '작은 브랜드 마케팅 구조',
    reason: '고객이 인식하는 문제로 일반화',
  };

  it('accepts valid input', () => {
    expect(ItemGeneralizationSchema.parse(valid)).toEqual(valid);
  });

  it('rejects empty item_name', () => {
    expect(() => ItemGeneralizationSchema.parse({ ...valid, item_name: '' })).toThrow();
  });

  it('rejects missing reason', () => {
    const { reason: _, ...noReason } = valid;
    expect(() => ItemGeneralizationSchema.parse(noReason)).toThrow();
  });
});

// ── Step 2. ItemFeatureBenefitMapSchema ──────────────────────────────────────

describe('ItemFeatureBenefitMapSchema', () => {
  const valid = {
    features: [validFeatureBenefit],
    characteristics: [validFeatureBenefit],
    benefits: [validFeatureBenefit],
  };

  it('accepts valid input', () => {
    const result = ItemFeatureBenefitMapSchema.parse(valid);
    expect(result.features).toHaveLength(1);
  });

  it('rejects empty features array', () => {
    expect(() =>
      ItemFeatureBenefitMapSchema.parse({ ...valid, features: [] }),
    ).toThrow();
  });
});

// ── Step 3. CategoryFeatureBenefitMapSchema ──────────────────────────────────

describe('CategoryFeatureBenefitMapSchema', () => {
  const valid = {
    category_name: '콘텐츠 마케팅 시스템',
    features: [validFeatureBenefit],
    characteristics: [validFeatureBenefit],
    benefits: [validFeatureBenefit],
  };

  it('accepts valid input', () => {
    expect(CategoryFeatureBenefitMapSchema.parse(valid)).toHaveProperty('category_name');
  });

  it('rejects empty category_name', () => {
    expect(() =>
      CategoryFeatureBenefitMapSchema.parse({ ...valid, category_name: '' }),
    ).toThrow();
  });
});

// ── Step 4. ProblemDerivationMapSchema ────────────────────────────────────────

describe('ProblemDerivationMapSchema', () => {
  const valid = {
    item_problem_candidates: [validProblemCandidate],
    category_problem_candidates: [validProblemCandidate],
    selected_problem_ids: ['p1'],
  };

  it('accepts valid input', () => {
    expect(ProblemDerivationMapSchema.parse(valid)).toEqual(valid);
  });

  it('rejects empty selected_problem_ids', () => {
    expect(() =>
      ProblemDerivationMapSchema.parse({ ...valid, selected_problem_ids: [] }),
    ).toThrow();
  });
});

// ── Step 5. FunnelPlanningMapSchema ──────────────────────────────────────────

describe('FunnelPlanningMapSchema', () => {
  const valid = {
    phenomenon: [validFunnelStageItem],
    desire: [validFunnelStageItem],
    plan: [validFunnelStageItem],
    action: [validFunnelStageItem],
    reward: [validFunnelStageItem],
  };

  it('accepts valid input', () => {
    const result = FunnelPlanningMapSchema.parse(valid);
    expect(result.phenomenon).toHaveLength(1);
  });

  it('rejects missing stage', () => {
    const { reward: _, ...noReward } = valid;
    expect(() => FunnelPlanningMapSchema.parse(noReward)).toThrow();
  });
});

// ── Step 6. KeyContentEntryDecisionSchema ────────────────────────────────────

describe('KeyContentEntryDecisionSchema', () => {
  it('accepts valid input', () => {
    const valid = { selected_entry_stage: 'phenomenon', rationale: '계획 단계 고객 부족' };
    expect(KeyContentEntryDecisionSchema.parse(valid)).toEqual(valid);
  });

  it('rejects invalid stage', () => {
    expect(() =>
      KeyContentEntryDecisionSchema.parse({ selected_entry_stage: 'action', rationale: 'x' }),
    ).toThrow();
  });

  it('rejects empty rationale', () => {
    expect(() =>
      KeyContentEntryDecisionSchema.parse({ selected_entry_stage: 'plan', rationale: '' }),
    ).toThrow();
  });
});

// ── Step 7. KeyContentSearchKeywordSetSchema ─────────────────────────────────

describe('KeyContentSearchKeywordSetSchema', () => {
  const valid = {
    problem_keywords: ['콘텐츠 감'],
    item_name_keywords: ['AI 마케팅팀'],
    category_name_keywords: ['콘텐츠 마케팅'],
    item_feature_benefit_keywords: ['자동 기획'],
    category_feature_benefit_keywords: ['문제 기반'],
  };

  it('accepts valid input', () => {
    expect(KeyContentSearchKeywordSetSchema.parse(valid)).toEqual(valid);
  });

  it('rejects empty problem_keywords', () => {
    expect(() =>
      KeyContentSearchKeywordSetSchema.parse({ ...valid, problem_keywords: [] }),
    ).toThrow();
  });
});

// ── Step 8. KeyContentViewtrapValidationSchema ───────────────────────────────

describe('KeyContentViewtrapValidationSchema', () => {
  it('accepts valid input', () => {
    expect(KeyContentViewtrapValidationSchema.parse(validViewtrapValidation)).toEqual(
      validViewtrapValidation,
    );
  });

  it('rejects invalid verdict', () => {
    expect(() =>
      KeyContentViewtrapValidationSchema.parse({ ...validViewtrapValidation, verdict: 'maybe' }),
    ).toThrow();
  });

  it('rejects invalid performance_score', () => {
    expect(() =>
      KeyContentViewtrapValidationSchema.parse({
        ...validViewtrapValidation,
        performance_score: 'bad',
      }),
    ).toThrow();
  });
});

// ── Step 10. SalesLogicMapSchema ─────────────────────────────────────────────

describe('SalesLogicMapSchema', () => {
  it('accepts valid input', () => {
    expect(SalesLogicMapSchema.parse(validSalesLogicMap)).toEqual(validSalesLogicMap);
  });

  it('rejects empty problem_statement', () => {
    expect(() =>
      SalesLogicMapSchema.parse({ ...validSalesLogicMap, problem_statement: '' }),
    ).toThrow();
  });

  it('rejects missing cta', () => {
    const { cta: _, ...noCta } = validSalesLogicMap;
    expect(() => SalesLogicMapSchema.parse(noCta)).toThrow();
  });
});

// ── Step 11. ApprovedKeyContentTopicSchema ───────────────────────────────────

describe('ApprovedKeyContentTopicSchema', () => {
  const valid = {
    title: '감이 아닌 구조로 콘텐츠를 만드는 법',
    thumbnail_promise: '콘텐츠 기획 3단계',
    entry_stage: 'phenomenon' as const,
    sales_logic: validSalesLogicMap,
    viewtrap_validation: validViewtrapValidation,
    intro_direction: '문제 공감으로 시작',
    body_structure: ['문제 제시', '카테고리 설명', 'CTA'],
    cta: '무료 체험',
  };

  it('accepts valid input', () => {
    expect(ApprovedKeyContentTopicSchema.parse(valid)).toEqual(valid);
  });

  it('rejects empty body_structure', () => {
    expect(() =>
      ApprovedKeyContentTopicSchema.parse({ ...valid, body_structure: [] }),
    ).toThrow();
  });

  it('rejects invalid entry_stage', () => {
    expect(() =>
      ApprovedKeyContentTopicSchema.parse({ ...valid, entry_stage: 'reward' }),
    ).toThrow();
  });
});
