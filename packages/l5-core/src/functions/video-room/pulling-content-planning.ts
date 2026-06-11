// CMO v3 Pulling Content Planning — pure builder functions for Step 0–12.
// Mirrors key-content-planning.ts structure: each Step = a buildXxx pure
// function, composed by assemblePullingContentPlan.
//
// Pure functions only. No Date.now(), new Date(), or randomUUID() inside —
// all ids/values are injected by the caller. PRD-forbidden rules are enforced
// with throw (see Step 8 must_use, Step 10 connection sentence, Step 11
// consumer-journey coverage).
//
// Source: docs/prd/cmo-content-strategy-v3.md §4 (Pulling Content Planning Agent).

import { z } from 'zod';
import type {
  ApprovedKeyContentTopic,
  ContentTypePortfolio,
  PullingTopicCandidate,
  PullingTopicScore,
  HotVideoStructureTemplate,
  ExposureProbabilityCandidate,
  LongtailEvergreenCandidate,
  ConsumerJourneyCoverageReport,
  ApprovedPullingTopic,
  ApprovedPullingContentSet,
} from './types';
import {
  HotVideoStructureTemplateSchema,
  ExposureProbabilityCandidateSchema,
  LongtailEvergreenCandidateSchema,
} from './viewtrap-tools';

// ── P5 re-exports (viewtrap-tools is the canonical source) ───────────────────
export { buildHotVideoStructureTemplate } from './viewtrap-tools';
export { assessExposureProbability as buildExposureProbabilityCandidate } from './viewtrap-tools';
export { buildLongtailEvergreenCandidate } from './viewtrap-tools';

// ── Types not yet in types.ts (Stage 3 will move these) ─────────────────────

/** Step 1. 키 콘텐츠를 볼 준비가 된 사람 정의 (PRD §4 Step 1). */
export interface KeyReadyAudience {
  required_problem_awareness: string;
  required_desire: string;
  required_plan_awareness: string;
  not_ready_reasons: string[];
}

/** Step 2. 논리적 확장 (PRD §4 Step 2). */
export interface PullingLogicalExpansionMap {
  product: string;
  category: string;
  feature_benefit: string[];
  problems: string[];
  audience_situations: string[];
  possible_content_topics: string[];
}

/** Step 3. 풀링 문제 축 (PRD §4 Step 3). 분류 도구이지 고정 단계가 아님. */
export interface PullingProblemAxisMap {
  symptom_topics: string[];
  cause_topics: string[];
  desire_topics: string[];
  plan_topics: string[];
  misconception_topics: string[];
  reward_case_topics: string[];
}

// ── Local Zod schemas (validate runtime input) ──────────────────────────────

const PullingTopicCandidateSchema = z.object({
  title: z.string().min(1),
  covered_stages: z
    .array(z.enum(['phenomenon', 'desire', 'plan', 'action', 'reward']))
    .min(1),
  topic_axis: z.string().min(1),
  key_content_connection: z.string().min(1),
});

const KeyReadyAudienceSchema = z.object({
  required_problem_awareness: z.string().min(1),
  required_desire: z.string().min(1),
  required_plan_awareness: z.string().min(1),
  not_ready_reasons: z.array(z.string().min(1)),
});

const PullingLogicalExpansionMapSchema = z.object({
  product: z.string().min(1),
  category: z.string().min(1),
  feature_benefit: z.array(z.string().min(1)).min(1),
  problems: z.array(z.string().min(1)).min(1),
  audience_situations: z.array(z.string().min(1)).min(1),
  possible_content_topics: z.array(z.string().min(1)).min(1),
});

const PullingProblemAxisMapSchema = z.object({
  symptom_topics: z.array(z.string().min(1)),
  cause_topics: z.array(z.string().min(1)),
  desire_topics: z.array(z.string().min(1)),
  plan_topics: z.array(z.string().min(1)),
  misconception_topics: z.array(z.string().min(1)),
  reward_case_topics: z.array(z.string().min(1)),
});

const ContentTypePortfolioSchema = z.object({
  evergreen_candidates: z.array(PullingTopicCandidateSchema),
  daily_candidates: z.array(PullingTopicCandidateSchema),
  seasonal_candidates: z.array(PullingTopicCandidateSchema),
  hero_candidates: z.array(PullingTopicCandidateSchema),
});

const PullingTopicScoreSchema = z.object({
  performance_score: z.number(),
  contribution_score: z.number(),
  exposure_probability_score: z.number(),
  growth_score: z.number(),
  evergreen_score: z.number(),
  reproducibility_score: z.number(),
  key_connection_score: z.number(),
  sales_logic_connection_score: z.number(),
  home_selection_score: z.number(),
  total_score: z.number(),
  verdict: z.enum(['use', 'watch', 'reject']),
});

const ConsumerJourneyCoverageReportSchema = z.object({
  phenomenon_covered: z.boolean(),
  desire_covered: z.boolean(),
  plan_covered: z.boolean(),
  action_connected: z.boolean(),
  reward_promised: z.boolean(),
  natural_flow_score: z.number(),
  notes: z.array(z.string()),
});

const ApprovedPullingTopicSchema = z.object({
  title: z.string().min(1),
  thumbnail_promise: z.string().min(1),
  covered_stages: z
    .array(z.enum(['phenomenon', 'desire', 'plan', 'action', 'reward']))
    .min(1),
  content_type: z.enum(['daily', 'seasonal', 'evergreen', 'hero']),
  score: PullingTopicScoreSchema,
  key_content_connection: z.string().min(1),
});

// ── Step 0: loadKeyContentSalesLogic ────────────────────────────────────────
// 풀링 콘텐츠는 키 콘텐츠 없이 만들면 안 된다. 키 콘텐츠 판매 논리를 불러온다.

export interface KeyContentSalesLogicContext {
  key_title: string;
  core_problem: string;
  sales_logic: ApprovedKeyContentTopic['sales_logic'];
  cta: string;
  viewtrap_validation: ApprovedKeyContentTopic['viewtrap_validation'];
}

export function loadKeyContentSalesLogic(input: {
  key_content: ApprovedKeyContentTopic;
}): KeyContentSalesLogicContext {
  const { key_content } = input;
  if (key_content.viewtrap_validation.verdict === 'reject') {
    throw new Error(
      'Cannot start pulling planning: key content has a rejected viewtrap validation',
    );
  }
  return {
    key_title: key_content.title,
    core_problem: key_content.sales_logic.problem_statement,
    sales_logic: key_content.sales_logic,
    cta: key_content.cta,
    viewtrap_validation: key_content.viewtrap_validation,
  };
}

// ── Step 1: buildKeyReadyAudience ───────────────────────────────────────────

export function buildKeyReadyAudience(input: KeyReadyAudience): KeyReadyAudience {
  return KeyReadyAudienceSchema.parse(input);
}

// ── Step 2: buildLogicalExpansionMap ────────────────────────────────────────

export function buildLogicalExpansionMap(
  input: PullingLogicalExpansionMap,
): PullingLogicalExpansionMap {
  return PullingLogicalExpansionMapSchema.parse(input);
}

// ── Step 3: buildProblemAxisMap ─────────────────────────────────────────────
// 축은 분류 도구이지 고정 단계가 아니다. 하나의 콘텐츠가 여러 축을 가질 수 있다.

export function buildProblemAxisMap(input: PullingProblemAxisMap): PullingProblemAxisMap {
  const parsed = PullingProblemAxisMapSchema.parse(input);
  const totalTopics =
    parsed.symptom_topics.length +
    parsed.cause_topics.length +
    parsed.desire_topics.length +
    parsed.plan_topics.length +
    parsed.misconception_topics.length +
    parsed.reward_case_topics.length;
  if (totalTopics === 0) {
    throw new Error('PullingProblemAxisMap requires at least one topic across axes');
  }
  return parsed;
}

// ── Step 4: buildContentTypePortfolio ───────────────────────────────────────
// 에버그린/데일리 중심으로 깔고, 결에 맞는 시즌성/히어로를 얹는다.

export function buildContentTypePortfolio(input: {
  evergreen_candidates: PullingTopicCandidate[];
  daily_candidates: PullingTopicCandidate[];
  seasonal_candidates: PullingTopicCandidate[];
  hero_candidates: PullingTopicCandidate[];
}): ContentTypePortfolio {
  const parsed = ContentTypePortfolioSchema.parse(input);
  // 운영 원칙: 에버그린/데일리가 비어 있으면 풀링 포트폴리오의 토대가 없는 것.
  if (parsed.evergreen_candidates.length === 0 && parsed.daily_candidates.length === 0) {
    throw new Error(
      'ContentTypePortfolio requires evergreen or daily candidates as the base (PRD 운영 원칙)',
    );
  }
  return parsed;
}

// ── Step 5: buildPullingViewtrapValidation ──────────────────────────────────
// 풀링용 Viewtrap 기본 검색 검증. 키 콘텐츠 Step 8 검증과 같은 판단 모델을 쓴다.

export interface PullingViewtrapValidation {
  search_keyword: string;
  candidate_titles: string[];
  performance_score: 'normal' | 'good' | 'great';
  contribution_score: 'normal' | 'good' | 'great';
  growth_status: 'growing' | 'stalled' | 'unknown';
  reproducible_low_subscriber: boolean;
  channel_value_risk: boolean;
  person_value_risk: boolean;
  verdict: 'use' | 'watch' | 'reject';
}

const PullingViewtrapValidationInputSchema = z.object({
  search_keyword: z.string().min(1),
  candidate_titles: z.array(z.string().min(1)),
  performance_score: z.enum(['normal', 'good', 'great']),
  contribution_score: z.enum(['normal', 'good', 'great']),
  growth_status: z.enum(['growing', 'stalled', 'unknown']),
  reproducible_low_subscriber: z.boolean(),
  channel_value_risk: z.boolean(),
  person_value_risk: z.boolean(),
});

type PullingViewtrapValidationInput = z.infer<typeof PullingViewtrapValidationInputSchema>;

function computePullingVerdict(
  input: PullingViewtrapValidationInput,
): 'use' | 'watch' | 'reject' {
  // 채널 가치/인물 가치가 들어간 영상은 제외한다.
  if (input.channel_value_risk || input.person_value_risk) return 'reject';

  const rank = { normal: 0, good: 1, great: 2 } as const;
  const p = rank[input.performance_score];
  const c = rank[input.contribution_score];

  if (p === 0 && c === 0 && input.growth_status === 'stalled') return 'reject';
  if (p >= 1 || c >= 1) return 'use';
  return 'watch';
}

export function buildPullingViewtrapValidation(
  input: PullingViewtrapValidationInput,
): PullingViewtrapValidation {
  const parsed = PullingViewtrapValidationInputSchema.parse(input);
  return { ...parsed, verdict: computePullingVerdict(parsed) };
}

// ── Step 6: buildHotVideoStructureTemplate — re-exported from viewtrap-tools ─
// ── Step 7: buildExposureProbabilityCandidate — re-exported from viewtrap-tools

/** 노출 확률 높은 순 정렬 (great > good > normal). 순수 정렬 헬퍼. */
export function sortByExposureProbability(
  candidates: ExposureProbabilityCandidate[],
): ExposureProbabilityCandidate[] {
  const rank = { normal: 0, good: 1, great: 2 } as const;
  return [...candidates].sort(
    (a, b) => rank[b.exposure_probability] - rank[a.exposure_probability],
  );
}

// ── Step 8: buildLongtailEvergreenCandidate — re-exported from viewtrap-tools ─

/**
 * Enforces PRD §4 Step 8 강한 규칙: 발견된 롱테일 에버그린 후보(must_use)는
 * 반드시 최종 풀링 주제에 포함되어야 한다. 누락 시 throw.
 */
export function enforceLongtailMustUse(input: {
  longtail_candidates: LongtailEvergreenCandidate[];
  approved_topics: ApprovedPullingTopic[];
}): void {
  for (const lt of input.longtail_candidates) {
    if (!lt.must_use) continue;
    const used = input.approved_topics.some(
      (t) => t.title === lt.adapted_topic || t.key_content_connection.includes(lt.adapted_topic),
    );
    if (!used) {
      throw new Error(
        `Longtail evergreen candidate "${lt.adapted_topic}" is must_use but not present in approved pulling topics (PRD §4 Step 8 노다지 규칙)`,
      );
    }
  }
}

// ── Step 9: scorePullingTopic ───────────────────────────────────────────────
// 10개 항목 점수화 → total_score 및 verdict 산정.

const PULLING_SCORE_KEYS = [
  'performance_score',
  'contribution_score',
  'exposure_probability_score',
  'growth_score',
  'evergreen_score',
  'reproducibility_score',
  'key_connection_score',
  'sales_logic_connection_score',
  'home_selection_score',
] as const;

export function scorePullingTopic(input: {
  performance_score: number;
  contribution_score: number;
  exposure_probability_score: number;
  growth_score: number;
  evergreen_score: number;
  reproducibility_score: number;
  key_connection_score: number;
  sales_logic_connection_score: number;
  home_selection_score: number;
}): PullingTopicScore {
  const total = PULLING_SCORE_KEYS.reduce((sum, key) => sum + input[key], 0);
  const maxPerItem = 10;
  const maxTotal = PULLING_SCORE_KEYS.length * maxPerItem;

  // 키 콘텐츠 연결성/상품 논리 연결성이 0이면 풀링으로 쓸 수 없다.
  let verdict: 'use' | 'watch' | 'reject';
  if (input.key_connection_score <= 0 || input.sales_logic_connection_score <= 0) {
    verdict = 'reject';
  } else if (total >= maxTotal * 0.6) {
    verdict = 'use';
  } else if (total >= maxTotal * 0.4) {
    verdict = 'watch';
  } else {
    verdict = 'reject';
  }

  return PullingTopicScoreSchema.parse({ ...input, total_score: total, verdict });
}

// ── Step 10: assertKeyConnectionSentence ────────────────────────────────────
// 다음 문장을 완성할 수 있으면 통과:
//   "이 콘텐츠는 [고객]이 겪는 [문제/상황/오해/욕망]을 건드려서,
//    [키 콘텐츠의 핵심 문제]를 인식하게 만들고,
//    결국 [키 콘텐츠 제목]을 볼 이유를 만든다."

export interface KeyConnectionSentenceInput {
  audience: string;
  trigger: string;
  key_core_problem: string;
  key_title: string;
}

export function buildKeyConnectionSentence(input: KeyConnectionSentenceInput): string {
  const fields: (keyof KeyConnectionSentenceInput)[] = [
    'audience',
    'trigger',
    'key_core_problem',
    'key_title',
  ];
  for (const f of fields) {
    if (typeof input[f] !== 'string' || input[f].trim() === '') {
      throw new Error(
        `Key connection sentence cannot be completed: "${f}" is empty (PRD §4 Step 10)`,
      );
    }
  }
  return (
    `이 콘텐츠는 ${input.audience.trim()}이(가) 겪는 ${input.trigger.trim()}을(를) 건드려서, ` +
    `${input.key_core_problem.trim()}을(를) 인식하게 만들고, ` +
    `결국 "${input.key_title.trim()}"을(를) 볼 이유를 만든다.`
  );
}

// ── Step 11: assessConsumerJourneyCoverage ──────────────────────────────────
// 전체 풀링 세트 + 키 콘텐츠를 합쳤을 때 현상→욕구→계획→행동→보상 흐름이
// 자연스러우면 된다. 콘텐츠 1개가 여러 단계를 담당해도 된다.

const STAGE_FLAGS: Record<
  'phenomenon' | 'desire' | 'plan' | 'action' | 'reward',
  keyof Pick<
    ConsumerJourneyCoverageReport,
    | 'phenomenon_covered'
    | 'desire_covered'
    | 'plan_covered'
    | 'action_connected'
    | 'reward_promised'
  >
> = {
  phenomenon: 'phenomenon_covered',
  desire: 'desire_covered',
  plan: 'plan_covered',
  action: 'action_connected',
  reward: 'reward_promised',
};

export function assessConsumerJourneyCoverage(input: {
  pulling_topics: ApprovedPullingTopic[];
  key_content: ApprovedKeyContentTopic;
  notes?: string[];
}): ConsumerJourneyCoverageReport {
  const covered = {
    phenomenon: false,
    desire: false,
    plan: false,
    action: false,
    reward: false,
  };

  // 풀링 콘텐츠가 담당하는 단계 집계 (콘텐츠 1개가 여러 단계 가능).
  for (const topic of input.pulling_topics) {
    for (const stage of topic.covered_stages) {
      covered[stage] = true;
    }
  }

  // 키 콘텐츠 진입 단계도 흐름에 포함된다. 키 콘텐츠 CTA는 행동을 연결한다.
  covered[input.key_content.entry_stage] = true;
  if (input.key_content.cta.trim() !== '') {
    covered.action = true;
  }

  const flags = {
    phenomenon_covered: covered.phenomenon,
    desire_covered: covered.desire,
    plan_covered: covered.plan,
    action_connected: covered.action,
    reward_promised: covered.reward,
  };

  const coveredCount = Object.values(covered).filter(Boolean).length;
  const natural_flow_score = Math.round((coveredCount / 5) * 100);

  const report: ConsumerJourneyCoverageReport = {
    ...flags,
    natural_flow_score,
    notes: input.notes ?? [],
  };
  return ConsumerJourneyCoverageReportSchema.parse(report);
}

// ── Step 12: buildApprovedPullingTopic & assembleApprovedPullingContentSet ──

export function buildApprovedPullingTopic(input: ApprovedPullingTopic): ApprovedPullingTopic {
  const parsed = ApprovedPullingTopicSchema.parse(input);
  if (parsed.score.verdict === 'reject') {
    throw new Error(
      `Cannot approve pulling topic "${parsed.title}": score verdict is reject`,
    );
  }
  return parsed;
}

export function assembleApprovedPullingContentSet(input: {
  pulling_topics: ApprovedPullingTopic[];
  key_content_topic: ApprovedKeyContentTopic;
  journey_coverage_report: ConsumerJourneyCoverageReport;
  set_logic: string;
  longtail_candidates?: LongtailEvergreenCandidate[];
}): ApprovedPullingContentSet {
  if (input.pulling_topics.length === 0) {
    throw new Error('Pulling content set requires at least one approved pulling topic');
  }
  if (input.set_logic.trim() === '') {
    throw new Error('Pulling content set requires non-empty set_logic');
  }
  if (input.key_content_topic.viewtrap_validation.verdict === 'reject') {
    throw new Error('Cannot finalize pulling set: key content viewtrap verdict is reject');
  }

  // Step 8 강한 규칙: 발견된 must_use 롱테일은 반드시 포함되어야 한다.
  if (input.longtail_candidates && input.longtail_candidates.length > 0) {
    enforceLongtailMustUse({
      longtail_candidates: input.longtail_candidates,
      approved_topics: input.pulling_topics,
    });
  }

  // Step 11: 소비자 행동 5단계 전체가 세트로 자연스럽게 설명되어야 한다.
  const r = input.journey_coverage_report;
  const allStagesCovered =
    r.phenomenon_covered &&
    r.desire_covered &&
    r.plan_covered &&
    r.action_connected &&
    r.reward_promised;
  if (!allStagesCovered) {
    const missing = [
      !r.phenomenon_covered && '현상',
      !r.desire_covered && '욕구',
      !r.plan_covered && '계획',
      !r.action_connected && '행동',
      !r.reward_promised && '보상',
    ].filter(Boolean);
    throw new Error(
      `Pulling set does not naturally explain the full consumer journey (PRD §4 Step 11); missing stages: ${missing.join(', ')}`,
    );
  }

  return {
    pulling_topics: input.pulling_topics,
    key_content_topic: input.key_content_topic,
    journey_coverage_report: input.journey_coverage_report,
    set_logic: input.set_logic.trim(),
    approval_status: 'approved',
  };
}

// ── Pipeline: assemblePullingContentPlan ────────────────────────────────────

export interface PullingContentPlan {
  step0_key_sales_logic: KeyContentSalesLogicContext;
  step1_key_ready_audience: KeyReadyAudience;
  step2_logical_expansion: PullingLogicalExpansionMap;
  step3_problem_axis: PullingProblemAxisMap;
  step4_content_type_portfolio: ContentTypePortfolio;
  step5_viewtrap_validations: PullingViewtrapValidation[];
  step6_hot_video_templates: HotVideoStructureTemplate[];
  step7_exposure_candidates: ExposureProbabilityCandidate[];
  step8_longtail_candidates: LongtailEvergreenCandidate[];
  step9_topic_scores: PullingTopicScore[];
  step10_key_connection_sentences: string[];
  step11_journey_coverage: ConsumerJourneyCoverageReport;
  step12_approved_set: ApprovedPullingContentSet;
}

export function assemblePullingContentPlan(input: PullingContentPlan): PullingContentPlan {
  // Step 0 consistency: the loaded key content must match the finalized set's key content.
  if (input.step0_key_sales_logic.key_title !== input.step12_approved_set.key_content_topic.title) {
    throw new Error(
      `key content title mismatch: step0="${input.step0_key_sales_logic.key_title}" vs step12="${input.step12_approved_set.key_content_topic.title}"`,
    );
  }

  // Step 8 강한 규칙 재검증 across the full plan.
  enforceLongtailMustUse({
    longtail_candidates: input.step8_longtail_candidates,
    approved_topics: input.step12_approved_set.pulling_topics,
  });

  // Step 11 must be satisfied (the approved set already enforces it, but the
  // pipeline's coverage report must agree with the finalized set's report).
  if (input.step11_journey_coverage !== input.step12_approved_set.journey_coverage_report) {
    ConsumerJourneyCoverageReportSchema.parse(input.step11_journey_coverage);
    ConsumerJourneyCoverageReportSchema.parse(input.step12_approved_set.journey_coverage_report);
  }

  // No viable pulling topics → cannot have a plan.
  if (input.step12_approved_set.pulling_topics.length === 0) {
    throw new Error('Cannot assemble pulling plan: no approved pulling topics');
  }

  // Validate each step deliverable via schemas.
  KeyReadyAudienceSchema.parse(input.step1_key_ready_audience);
  PullingLogicalExpansionMapSchema.parse(input.step2_logical_expansion);
  PullingProblemAxisMapSchema.parse(input.step3_problem_axis);
  ContentTypePortfolioSchema.parse(input.step4_content_type_portfolio);
  input.step6_hot_video_templates.forEach((t) => HotVideoStructureTemplateSchema.parse(t));
  input.step7_exposure_candidates.forEach((c) => ExposureProbabilityCandidateSchema.parse(c));
  input.step8_longtail_candidates.forEach((c) => LongtailEvergreenCandidateSchema.parse(c));
  input.step9_topic_scores.forEach((s) => PullingTopicScoreSchema.parse(s));

  return input;
}
