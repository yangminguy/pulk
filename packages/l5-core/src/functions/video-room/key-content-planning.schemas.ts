// CMO v3 Key Content Planning — Zod schemas for Step 1–11 deliverable types.
// Validates runtime input against the canonical types in types.ts.

import { z } from 'zod';

// ── 보조 타입 스키마 ─────────────────────────────────────────────────────────

export const FeatureBenefitSchema = z.object({
  item: z.string().min(1),
  description: z.string().min(1),
});

export const ProblemCandidateSchema = z.object({
  id: z.string().min(1),
  problem: z.string().min(1),
  derived_from: z.string().min(1),
});

export const FunnelStageItemSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
});

// ── Step 1. ItemGeneralization ───────────────────────────────────────────────

export const ItemGeneralizationSchema = z.object({
  item_name: z.string().min(1),
  direct_category: z.string().min(1),
  parent_category: z.string().min(1),
  customer_problem_category: z.string().min(1),
  reason: z.string().min(1),
});

// ── Step 2. ItemFeatureBenefitMap ───────────────────────────────────────────

export const ItemFeatureBenefitMapSchema = z.object({
  features: z.array(FeatureBenefitSchema).min(1),
  characteristics: z.array(FeatureBenefitSchema).min(1),
  benefits: z.array(FeatureBenefitSchema).min(1),
});

// ── Step 3. CategoryFeatureBenefitMap ───────────────────────────────────────

export const CategoryFeatureBenefitMapSchema = z.object({
  category_name: z.string().min(1),
  features: z.array(FeatureBenefitSchema).min(1),
  characteristics: z.array(FeatureBenefitSchema).min(1),
  benefits: z.array(FeatureBenefitSchema).min(1),
});

// ── Step 4. ProblemDerivationMap ────────────────────────────────────────────

export const ProblemDerivationMapSchema = z.object({
  item_problem_candidates: z.array(ProblemCandidateSchema),
  category_problem_candidates: z.array(ProblemCandidateSchema),
  selected_problem_ids: z.array(z.string().min(1)).min(1),
});

// ── Step 5. FunnelPlanningMap ───────────────────────────────────────────────

export const FunnelPlanningMapSchema = z.object({
  phenomenon: z.array(FunnelStageItemSchema),
  desire: z.array(FunnelStageItemSchema),
  plan: z.array(FunnelStageItemSchema),
  action: z.array(FunnelStageItemSchema),
  reward: z.array(FunnelStageItemSchema),
});

// ── Step 6. KeyContentEntryDecision ────────────────────────────────────────

export const KeyContentEntryDecisionSchema = z.object({
  selected_entry_stage: z.enum(['phenomenon', 'desire', 'plan']),
  rationale: z.string().min(1),
});

// ── Step 7. KeyContentSearchKeywordSet ──────────────────────────────────────

export const KeyContentSearchKeywordSetSchema = z.object({
  problem_keywords: z.array(z.string().min(1)).min(1),
  item_name_keywords: z.array(z.string().min(1)).min(1),
  category_name_keywords: z.array(z.string().min(1)).min(1),
  item_feature_benefit_keywords: z.array(z.string().min(1)).min(1),
  category_feature_benefit_keywords: z.array(z.string().min(1)).min(1),
});

// ── Step 8. KeyContentViewtrapValidation ───────────────────────────────────

const scoreEnum = z.enum(['normal', 'good', 'great']);

export const KeyContentViewtrapValidationSchema = z.object({
  validated_keywords: z.array(z.string().min(1)),
  candidate_titles: z.array(z.string().min(1)),
  performance_score: scoreEnum,
  contribution_score: scoreEnum,
  growth_status: z.enum(['growing', 'stalled', 'unknown']),
  channel_value_risk: z.boolean(),
  person_value_risk: z.boolean(),
  verdict: z.enum(['use', 'watch', 'reject']),
});

// ── Step 10. SalesLogicMap ──────────────────────────────────────────────────

export const SalesLogicMapSchema = z.object({
  problem_statement: z.string().min(1),
  category_feature_benefit: z.string().min(1),
  category_need: z.string().min(1),
  item_feature_benefit: z.string().min(1),
  item_solution_statement: z.string().min(1),
  cta: z.string().min(1),
});

// ── Step 11. ApprovedKeyContentTopic ────────────────────────────────────────

export const ApprovedKeyContentTopicSchema = z.object({
  title: z.string().min(1),
  thumbnail_promise: z.string().min(1),
  entry_stage: z.enum(['phenomenon', 'desire', 'plan']),
  sales_logic: SalesLogicMapSchema,
  viewtrap_validation: KeyContentViewtrapValidationSchema,
  intro_direction: z.string().min(1),
  body_structure: z.array(z.string().min(1)).min(1),
  cta: z.string().min(1),
});
