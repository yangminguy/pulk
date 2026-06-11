// Tests for content-strategy-package.ts
// PRD docs/prd/cmo-content-strategy-v3.md §5 (Phase 6).

import type {
  ApprovedKeyContentTopic,
  ApprovedPullingContentSet,
  ApprovedPullingTopic,
  ContentTypePortfolio,
  ConsumerJourneyCoverageReport,
  ProductBrief,
  KeyContentViewtrapValidation,
} from '../types';
import {
  assembleContentStrategyPackage,
  AssembleContentStrategyPackageInput,
} from '../content-strategy-package';

// ── fixtures ──────────────────────────────────────────────────────────────

function makeViewtrap(
  verdict: KeyContentViewtrapValidation['verdict'] = 'use',
): KeyContentViewtrapValidation {
  return {
    validated_keywords: ['k1'],
    candidate_titles: ['t1'],
    performance_score: 'good',
    contribution_score: 'good',
    growth_status: 'growing',
    channel_value_risk: false,
    person_value_risk: false,
    verdict,
  };
}

function makeKey(
  overrides: Partial<ApprovedKeyContentTopic> = {},
): ApprovedKeyContentTopic {
  return {
    title: 'Key Title',
    thumbnail_promise: 'promise',
    entry_stage: 'plan',
    sales_logic: {
      problem_statement: 'p',
      category_feature_benefit: 'cfb',
      category_need: 'cn',
      item_feature_benefit: 'ifb',
      item_solution_statement: 'iss',
      cta: 'cta',
    },
    viewtrap_validation: makeViewtrap(),
    intro_direction: 'intro',
    body_structure: ['a', 'b'],
    cta: 'buy now',
    ...overrides,
  };
}

function makeJourney(
  overrides: Partial<ConsumerJourneyCoverageReport> = {},
): ConsumerJourneyCoverageReport {
  return {
    phenomenon_covered: true,
    desire_covered: true,
    plan_covered: true,
    action_connected: true,
    reward_promised: true,
    natural_flow_score: 8,
    notes: [],
    ...overrides,
  };
}

function makePullingTopic(): ApprovedPullingTopic {
  return {
    title: 'Pulling 1',
    thumbnail_promise: 'pp',
    covered_stages: ['phenomenon', 'desire'],
    content_type: 'evergreen',
    score: {
      performance_score: 7,
      contribution_score: 7,
      exposure_probability_score: 7,
      growth_score: 7,
      evergreen_score: 7,
      reproducibility_score: 7,
      key_connection_score: 7,
      sales_logic_connection_score: 7,
      home_selection_score: 7,
      total_score: 70,
      verdict: 'use',
    },
    key_content_connection: 'connects to key',
  };
}

function makePullingSet(
  key: ApprovedKeyContentTopic,
  overrides: Partial<ApprovedPullingContentSet> = {},
): ApprovedPullingContentSet {
  return {
    pulling_topics: [makePullingTopic()],
    key_content_topic: key,
    journey_coverage_report: makeJourney(),
    set_logic: 'set logic',
    approval_status: 'approved',
    ...overrides,
  };
}

const portfolio: ContentTypePortfolio = {
  evergreen_candidates: [],
  daily_candidates: [],
  seasonal_candidates: [],
  hero_candidates: [],
};

const productBrief: ProductBrief = {
  product_name: 'AI Marketing Team',
  category: 'content marketing system',
  target_audience: 'small brand owners',
  core_offer: 'automated content strategy',
  business_goal: 'consulting_lead',
};

function makeInput(
  overrides: Partial<AssembleContentStrategyPackageInput> = {},
): AssembleContentStrategyPackageInput {
  const key = overrides.key_content_topic ?? makeKey();
  return {
    product_brief: productBrief,
    key_content_topic: key,
    pulling_content_set: makePullingSet(key),
    content_type_portfolio: portfolio,
    title_thumbnail_direction: 'home-selection optimized titles',
    script_direction: 'problem-first sales logic',
    cta_strategy: 'soft CTA toward consulting',
    ...overrides,
  };
}

// ── happy path ─────────────────────────────────────────────────────────────

describe('assembleContentStrategyPackage', () => {
  it('assembles a full package from approved key + pulling inputs', () => {
    const pkg = assembleContentStrategyPackage(makeInput());

    expect(pkg.product_brief).toBe(productBrief);
    expect(pkg.key_content_strategy.title).toBe('Key Title');
    expect(pkg.pulling_content_set.approval_status).toBe('approved');
    expect(pkg.content_type_portfolio).toBe(portfolio);
    expect(pkg.title_thumbnail_direction).toBe('home-selection optimized titles');
    expect(pkg.script_direction).toBe('problem-first sales logic');
    expect(pkg.cta_strategy).toBe('soft CTA toward consulting');
  });

  // ── key content finalization ──────────────────────────────────────────────

  it('throws when key content viewtrap verdict is reject', () => {
    const key = makeKey({ viewtrap_validation: makeViewtrap('reject') });
    expect(() =>
      assembleContentStrategyPackage(
        makeInput({ key_content_topic: key, pulling_content_set: makePullingSet(key) }),
      ),
    ).toThrow(/rejected Viewtrap/);
  });

  it('throws when key content title is empty', () => {
    const key = makeKey({ title: '   ' });
    expect(() =>
      assembleContentStrategyPackage(
        makeInput({ key_content_topic: key, pulling_content_set: makePullingSet(key) }),
      ),
    ).toThrow(/no title/);
  });

  // ── pulling set finalization ──────────────────────────────────────────────

  it('throws when pulling set is not approved', () => {
    const key = makeKey();
    const set = makePullingSet(key, {
      approval_status: 'pending' as ApprovedPullingContentSet['approval_status'],
    });
    expect(() =>
      assembleContentStrategyPackage(
        makeInput({ key_content_topic: key, pulling_content_set: set }),
      ),
    ).toThrow(/not approved/);
  });

  it('throws when pulling set has no topics', () => {
    const key = makeKey();
    const set = makePullingSet(key, { pulling_topics: [] });
    expect(() =>
      assembleContentStrategyPackage(
        makeInput({ key_content_topic: key, pulling_content_set: set }),
      ),
    ).toThrow(/no pulling topics/);
  });

  // ── cross-step consistency ────────────────────────────────────────────────

  it('throws when pulling set key topic does not match supplied key topic', () => {
    const key = makeKey({ title: 'Key A' });
    const otherKey = makeKey({ title: 'Key B' });
    const set = makePullingSet(otherKey);
    expect(() =>
      assembleContentStrategyPackage(
        makeInput({ key_content_topic: key, pulling_content_set: set }),
      ),
    ).toThrow(/does not match/);
  });

  // ── consumer journey coverage ─────────────────────────────────────────────

  it('throws when a journey stage is not covered', () => {
    const key = makeKey();
    const set = makePullingSet(key, {
      journey_coverage_report: makeJourney({ plan_covered: false }),
    });
    expect(() =>
      assembleContentStrategyPackage(
        makeInput({ key_content_topic: key, pulling_content_set: set }),
      ),
    ).toThrow(/plan stage not covered/);
  });

  it('throws when natural_flow_score is below threshold', () => {
    const key = makeKey();
    const set = makePullingSet(key, {
      journey_coverage_report: makeJourney({ natural_flow_score: 3 }),
    });
    expect(() =>
      assembleContentStrategyPackage(
        makeInput({ key_content_topic: key, pulling_content_set: set }),
      ),
    ).toThrow(/natural_flow_score/);
  });

  it('throws when action stage is not connected', () => {
    const key = makeKey();
    const set = makePullingSet(key, {
      journey_coverage_report: makeJourney({ action_connected: false }),
    });
    expect(() =>
      assembleContentStrategyPackage(
        makeInput({ key_content_topic: key, pulling_content_set: set }),
      ),
    ).toThrow(/action stage not connected/);
  });

  // ── required direction fields ─────────────────────────────────────────────

  it('throws when title_thumbnail_direction is empty', () => {
    expect(() =>
      assembleContentStrategyPackage(makeInput({ title_thumbnail_direction: '' })),
    ).toThrow(/title_thumbnail_direction/);
  });

  it('throws when script_direction is empty', () => {
    expect(() =>
      assembleContentStrategyPackage(makeInput({ script_direction: '  ' })),
    ).toThrow(/script_direction/);
  });

  it('throws when cta_strategy is empty', () => {
    expect(() =>
      assembleContentStrategyPackage(makeInput({ cta_strategy: '' })),
    ).toThrow(/cta_strategy/);
  });
});
