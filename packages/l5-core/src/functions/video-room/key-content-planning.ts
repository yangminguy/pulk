// CMO v3 Key Content Planning — pure builder functions for Step 1–11.
// No Date.now(), randomUUID() — all IDs injected by caller.

import type {
  ProductBrief,
  ItemGeneralization,
  ItemFeatureBenefitMap,
  CategoryFeatureBenefitMap,
  FeatureBenefit,
  ProblemCandidate,
  ProblemDerivationMap,
  FunnelStageItem,
  FunnelPlanningMap,
  KeyContentEntryDecision,
  KeyContentSearchKeywordSet,
  KeyContentViewtrapValidation,
  SalesLogicMap,
  ApprovedKeyContentTopic,
} from './types';
import {
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
} from './key-content-planning.schemas';

// ── Step 1: buildItemGeneralization ─────────────────────────────────────────

export function buildItemGeneralization(input: {
  product: ProductBrief;
}): ItemGeneralization {
  const { product } = input;
  const result: ItemGeneralization = {
    item_name: product.product_name,
    direct_category: product.category,
    parent_category: product.category,
    customer_problem_category: product.category,
    reason: `${product.product_name}을(를) 고객이 인식하는 문제 카테고리로 일반화`,
  };
  return ItemGeneralizationSchema.parse(result);
}

// ── Step 2: buildItemFeatureBenefitMap ──────────────────────────────────────

export function buildItemFeatureBenefitMap(input: {
  product: ProductBrief;
  features: FeatureBenefit[];
  characteristics: FeatureBenefit[];
  benefits: FeatureBenefit[];
}): ItemFeatureBenefitMap {
  const result: ItemFeatureBenefitMap = {
    features: input.features,
    characteristics: input.characteristics,
    benefits: input.benefits,
  };
  return ItemFeatureBenefitMapSchema.parse(result);
}

// ── Step 3: buildCategoryFeatureBenefitMap ──────────────────────────────────

export function buildCategoryFeatureBenefitMap(input: {
  generalization: ItemGeneralization;
  features: FeatureBenefit[];
  characteristics: FeatureBenefit[];
  benefits: FeatureBenefit[];
}): CategoryFeatureBenefitMap {
  const result: CategoryFeatureBenefitMap = {
    category_name: input.generalization.parent_category,
    features: input.features,
    characteristics: input.characteristics,
    benefits: input.benefits,
  };
  return CategoryFeatureBenefitMapSchema.parse(result);
}

// ── Step 4: deriveProblemMap ────────────────────────────────────────────────

export function deriveProblemMap(input: {
  item_fb: ItemFeatureBenefitMap;
  category_fb: CategoryFeatureBenefitMap;
  item_problems: ProblemCandidate[];
  category_problems: ProblemCandidate[];
  selected_problem_ids: string[];
}): ProblemDerivationMap {
  const result: ProblemDerivationMap = {
    item_problem_candidates: input.item_problems,
    category_problem_candidates: input.category_problems,
    selected_problem_ids: input.selected_problem_ids,
  };
  return ProblemDerivationMapSchema.parse(result);
}

// ── Step 5: buildFunnelPlanningMap ──────────────────────────────────────────

export function buildFunnelPlanningMap(input: {
  phenomenon: FunnelStageItem[];
  desire: FunnelStageItem[];
  plan: FunnelStageItem[];
  action: FunnelStageItem[];
  reward: FunnelStageItem[];
}): FunnelPlanningMap {
  const filledStages = [
    input.phenomenon,
    input.desire,
    input.plan,
    input.action,
    input.reward,
  ].filter((s) => s.length > 0).length;

  if (filledStages < 2) {
    throw new Error('FunnelPlanningMap requires at least 2 stages to be filled');
  }

  return FunnelPlanningMapSchema.parse(input);
}

// ── Step 6: decideKeyContentEntryStage ──────────────────────────────────────

export function decideKeyContentEntryStage(input: {
  funnel: FunnelPlanningMap;
  selected_entry_stage: 'phenomenon' | 'desire' | 'plan';
  rationale: string;
}): KeyContentEntryDecision {
  const result: KeyContentEntryDecision = {
    selected_entry_stage: input.selected_entry_stage,
    rationale: input.rationale,
  };
  return KeyContentEntryDecisionSchema.parse(result);
}

// ── Step 7: generateSearchKeywords ─────────────────────────────────────────

export function generateSearchKeywords(input: {
  generalization: ItemGeneralization;
  item_fb: ItemFeatureBenefitMap;
  category_fb: CategoryFeatureBenefitMap;
  problems: ProblemDerivationMap;
}): KeyContentSearchKeywordSet {
  const { generalization, item_fb, category_fb, problems } = input;
  const result: KeyContentSearchKeywordSet = {
    problem_keywords: problems.item_problem_candidates.map((p) => p.problem),
    item_name_keywords: [generalization.item_name],
    category_name_keywords: [generalization.direct_category, category_fb.category_name].filter(
      (v, i, a) => a.indexOf(v) === i,
    ),
    item_feature_benefit_keywords: item_fb.features.map((f) => f.item),
    category_feature_benefit_keywords: category_fb.features.map((f) => f.item),
  };
  return KeyContentSearchKeywordSetSchema.parse(result);
}

// ── Step 8: buildViewtrapValidation ────────────────────────────────────────

type ViewtrapValidationInput = Omit<KeyContentViewtrapValidation, 'verdict'>;

function computeVerdict(input: ViewtrapValidationInput): 'use' | 'watch' | 'reject' {
  if (input.channel_value_risk || input.person_value_risk) return 'reject';

  const scoreRank = { normal: 0, good: 1, great: 2 };
  const pScore = scoreRank[input.performance_score];
  const cScore = scoreRank[input.contribution_score];

  if (pScore === 0 && cScore === 0 && input.growth_status === 'stalled') return 'reject';
  if (pScore >= 1 || cScore >= 1) return 'use';
  return 'watch';
}

export function buildViewtrapValidation(
  input: ViewtrapValidationInput,
): KeyContentViewtrapValidation {
  const result: KeyContentViewtrapValidation = {
    ...input,
    verdict: computeVerdict(input),
  };
  return KeyContentViewtrapValidationSchema.parse(result);
}

// ── Step 9: filterSalesViableCandidates ─────────────────────────────────────

export function filterSalesViableCandidates(
  candidates: KeyContentViewtrapValidation[],
): KeyContentViewtrapValidation[] {
  return candidates.filter(
    (c) => !c.channel_value_risk && !c.person_value_risk && c.verdict !== 'reject',
  );
}

// ── Step 10: buildSalesLogicMap ────────────────────────────────────────────

export function buildSalesLogicMap(input: SalesLogicMap): SalesLogicMap {
  return SalesLogicMapSchema.parse({
    problem_statement: input.problem_statement.trim(),
    category_feature_benefit: input.category_feature_benefit.trim(),
    category_need: input.category_need.trim(),
    item_feature_benefit: input.item_feature_benefit.trim(),
    item_solution_statement: input.item_solution_statement.trim(),
    cta: input.cta.trim(),
  });
}

// ── Step 11: buildApprovedKeyContentTopic ──────────────────────────────────

export function buildApprovedKeyContentTopic(
  input: ApprovedKeyContentTopic,
): ApprovedKeyContentTopic {
  if (input.viewtrap_validation.verdict === 'reject') {
    throw new Error('Cannot approve key content topic with rejected viewtrap validation');
  }
  return ApprovedKeyContentTopicSchema.parse(input);
}

// ── Pipeline: assembleKeyContentPlan ───────────────────────────────────────

export interface KeyContentPlan {
  step1_generalization: ItemGeneralization;
  step2_item_fb: ItemFeatureBenefitMap;
  step3_category_fb: CategoryFeatureBenefitMap;
  step4_problems: ProblemDerivationMap;
  step5_funnel: FunnelPlanningMap;
  step6_entry_decision: KeyContentEntryDecision;
  step7_search_keywords: KeyContentSearchKeywordSet;
  step8_viewtrap_validation: KeyContentViewtrapValidation;
  step9_viable_candidates: KeyContentViewtrapValidation[];
  step10_sales_logic: SalesLogicMap;
  step11_approved_topic: ApprovedKeyContentTopic;
}

export function assembleKeyContentPlan(input: KeyContentPlan): KeyContentPlan {
  if (input.step11_approved_topic.viewtrap_validation.verdict === 'reject') {
    throw new Error('Cannot assemble plan: step11 approved topic has rejected viewtrap');
  }

  // Cross-step consistency: entry_stage must match between step6 and step11
  if (input.step11_approved_topic.entry_stage !== input.step6_entry_decision.selected_entry_stage) {
    throw new Error(
      `entry_stage mismatch: step6="${input.step6_entry_decision.selected_entry_stage}" vs step11="${input.step11_approved_topic.entry_stage}"`,
    );
  }

  // Cross-step consistency: step9 viable candidates must not be empty
  if (input.step9_viable_candidates.length === 0) {
    throw new Error('No viable candidates in step9: cannot approve key content without Viewtrap-validated candidates');
  }

  // Cross-step consistency: step5 funnel must have at least 2 filled stages
  const filledStages = [
    input.step5_funnel.phenomenon,
    input.step5_funnel.desire,
    input.step5_funnel.plan,
    input.step5_funnel.action,
    input.step5_funnel.reward,
  ].filter((s) => s.length > 0).length;
  if (filledStages < 2) {
    throw new Error('Funnel requires at least 2 filled stages in pipeline');
  }

  // Validate each step via schemas
  ItemGeneralizationSchema.parse(input.step1_generalization);
  ItemFeatureBenefitMapSchema.parse(input.step2_item_fb);
  CategoryFeatureBenefitMapSchema.parse(input.step3_category_fb);
  ProblemDerivationMapSchema.parse(input.step4_problems);
  FunnelPlanningMapSchema.parse(input.step5_funnel);
  KeyContentEntryDecisionSchema.parse(input.step6_entry_decision);
  KeyContentSearchKeywordSetSchema.parse(input.step7_search_keywords);
  KeyContentViewtrapValidationSchema.parse(input.step8_viewtrap_validation);
  SalesLogicMapSchema.parse(input.step10_sales_logic);
  ApprovedKeyContentTopicSchema.parse(input.step11_approved_topic);
  return input;
}
