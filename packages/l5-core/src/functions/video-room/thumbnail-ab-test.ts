// CMO Thumbnail A/B Track B — sequential rotation, scoring, confidence.
//
// PRD §6 정본:
// - Track B 순차 테스트: 후보별 N일 구간을 순서대로 배정.
// - 승자 판단은 CTR 단독 금지. watch_time + avg_view_duration + impressions 안정성 포함.
// - CTR 수집 불가(null) 시 CTR 가중치를 watch_time/avg_duration/impressions로 재배분.
//
// 순수·결정론 도메인 로직. 외부 API/LLM 호출 없음.

import { z } from 'zod';

// ── Types & schemas ──────────────────────────────────────────────────────────

export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low', 'insufficient']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const SequentialRotationSlotSchema = z.object({
  thumbnail_candidate_id: z.string().min(1),
  start_offset_day: z.number().int().min(0),
  end_offset_day: z.number().int().min(1),
});

export type SequentialRotationSlot = z.infer<typeof SequentialRotationSlotSchema>;

export const AbTestResultInputSchema = z.object({
  thumbnail_candidate_id: z.string().min(1),
  start_datetime: z.string().datetime().optional(),
  end_datetime: z.string().datetime().optional(),
  impressions: z.number().int().nonnegative().nullable(),
  ctr: z.number().min(0).nullable(),
  views: z.number().int().nonnegative(),
  watch_time_minutes: z.number().nonnegative(),
  average_view_duration_percentage: z.number().min(0).nullable(),
});

export type AbTestResultInput = z.infer<typeof AbTestResultInputSchema>;

export const AbTestMetricWeightsSchema = z.object({
  ctr: z.number().min(0).max(1),
  watch_time_minutes: z.number().min(0).max(1),
  average_view_duration_percentage: z.number().min(0).max(1),
  impressions: z.number().min(0).max(1),
});

export type AbTestMetricWeights = z.infer<typeof AbTestMetricWeightsSchema>;

export const NormalizedAbTestMetricsSchema = z.object({
  ctr: z.number().min(0).max(1).nullable(),
  watch_time_minutes: z.number().min(0).max(1),
  average_view_duration_percentage: z.number().min(0).max(1),
  impressions: z.number().min(0).max(1),
});

export type NormalizedAbTestMetrics = z.infer<typeof NormalizedAbTestMetricsSchema>;

export const ScoredAbTestResultSchema = AbTestResultInputSchema.extend({
  normalized: NormalizedAbTestMetricsSchema,
  score: z.number().min(0).max(1),
  rank: z.number().int().positive(),
  winner_label: z.enum(['winner', 'loser']),
});

export type ScoredAbTestResult = z.infer<typeof ScoredAbTestResultSchema>;

export const ScoreAbTestResultsOutputSchema = z.object({
  results: z.array(ScoredAbTestResultSchema),
  ranking: z.array(z.string().min(1)),
  winner: ScoredAbTestResultSchema.nullable(),
  confidence_level: ConfidenceLevelSchema,
  weights_used: AbTestMetricWeightsSchema,
});

export type ScoreAbTestResultsOutput = z.infer<typeof ScoreAbTestResultsOutputSchema>;

export interface ScoreAbTestResultsOptions {
  /**
   * Decimal places for score rounding. Defaults to 6 to keep deterministic
   * outputs stable while avoiding floating-point noise in storage/tests.
   */
  precision?: number;
}

const DEFAULT_WEIGHTS: AbTestMetricWeights = {
  ctr: 0.35,
  watch_time_minutes: 0.35,
  average_view_duration_percentage: 0.20,
  impressions: 0.10,
};

const NO_CTR_WEIGHTS: AbTestMetricWeights = {
  ctr: 0,
  watch_time_minutes: 0.525,
  average_view_duration_percentage: 0.35,
  impressions: 0.125,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function normalizeValues(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 1);
  return values.map((value) => roundScore((value - min) / (max - min), 12));
}

function roundScore(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function durationDays(result: AbTestResultInput): number | null {
  if (!result.start_datetime || !result.end_datetime) return null;

  const start = Date.parse(result.start_datetime);
  const end = Date.parse(result.end_datetime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  return (end - start) / (24 * 60 * 60 * 1000);
}

function hasEvenWeekdayDistribution(results: AbTestResultInput[]): boolean {
  const durations = results.map(durationDays);
  if (durations.some((days) => days === null)) return false;

  const roundedDurations = durations.map((days) => Math.round((days ?? 0) * 1000) / 1000);
  return new Set(roundedDurations).size === 1;
}

// ── Public functions ─────────────────────────────────────────────────────────

/**
 * PRD §6.2 — 후보별 순차 적용 구간을 offset day로 배정한다.
 * end_offset_day는 exclusive 경계다. 예: 0~2, 2~4, 4~6.
 */
export function buildSequentialRotationPlan(
  candidateIds: string[],
  daysPerCandidate = 2,
): SequentialRotationSlot[] {
  const days = requirePositiveInteger(daysPerCandidate, 'daysPerCandidate');
  const ids = z.array(z.string().min(1)).parse(candidateIds);

  return ids.map((thumbnail_candidate_id, index) => ({
    thumbnail_candidate_id,
    start_offset_day: index * days,
    end_offset_day: (index + 1) * days,
  })).map((slot) => SequentialRotationSlotSchema.parse(slot));
}

/**
 * PRD §6.5 — 순차 테스트 신뢰도.
 *
 * - insufficient: 결과 없음, impressions null, 기간 정보 누락/불량.
 * - high: 각 후보 impressions >= 5,000 + 기간 >= 3일/후보 + 후보 간 기간 균등.
 * - medium: 각 후보 impressions >= 1,000 또는 기간 >= 2일/후보.
 * - low: 판단은 가능하지만 high/medium 기준 미달.
 */
export function computeConfidenceLevel(results: AbTestResultInput[]): ConfidenceLevel {
  const parsed = z.array(AbTestResultInputSchema).parse(results);
  if (parsed.length === 0) return 'insufficient';
  if (parsed.some((result) => result.impressions === null)) return 'insufficient';

  const durations = parsed.map(durationDays);
  if (durations.some((days) => days === null)) return 'insufficient';

  const allHighImpressions = parsed.every((result) => (result.impressions ?? 0) >= 5000);
  const allMediumImpressions = parsed.every((result) => (result.impressions ?? 0) >= 1000);
  const allHighDuration = durations.every((days) => (days ?? 0) >= 3);
  const allMediumDuration = durations.every((days) => (days ?? 0) >= 2);

  if (allHighImpressions && allHighDuration && hasEvenWeekdayDistribution(parsed)) {
    return 'high';
  }
  if (allMediumImpressions || allMediumDuration) {
    return 'medium';
  }
  return 'low';
}

/**
 * PRD §6.4 — 동일 라운드 내 min-max 정규화 후 복합 점수를 산출한다.
 *
 * CTR이 하나라도 null이면 Reporting API 미활성/불완전 상태로 보고 CTR 가중치를
 * PRD 지정값(0.525/0.35/0.125)으로 재분배한다.
 */
export function scoreAbTestResults(
  results: AbTestResultInput[],
  opts: ScoreAbTestResultsOptions = {},
): ScoreAbTestResultsOutput {
  const parsed = z.array(AbTestResultInputSchema).parse(results);
  const precision = opts.precision ?? 6;
  if (!Number.isInteger(precision) || precision < 0 || precision > 12) {
    throw new Error('precision must be an integer between 0 and 12');
  }

  const useCtr = parsed.length > 0 && parsed.every((result) => result.ctr !== null);
  const weights = useCtr ? DEFAULT_WEIGHTS : NO_CTR_WEIGHTS;

  if (parsed.length === 0) {
    return ScoreAbTestResultsOutputSchema.parse({
      results: [],
      ranking: [],
      winner: null,
      confidence_level: 'insufficient',
      weights_used: weights,
    });
  }

  const ctrScores = useCtr ? normalizeValues(parsed.map((result) => result.ctr ?? 0)) : [];
  const watchTimeScores = normalizeValues(parsed.map((result) => result.watch_time_minutes));
  const durationScores = normalizeValues(parsed.map((result) => result.average_view_duration_percentage ?? 0));
  const impressionScores = normalizeValues(parsed.map((result) => result.impressions ?? 0));

  const withScores = parsed.map((result, index) => {
    const normalized: NormalizedAbTestMetrics = {
      ctr: useCtr ? ctrScores[index] : null,
      watch_time_minutes: watchTimeScores[index],
      average_view_duration_percentage: durationScores[index],
      impressions: impressionScores[index],
    };
    const score = roundScore(
      (normalized.ctr ?? 0) * weights.ctr +
        normalized.watch_time_minutes * weights.watch_time_minutes +
        normalized.average_view_duration_percentage * weights.average_view_duration_percentage +
        normalized.impressions * weights.impressions,
      precision,
    );
    return { result, normalized, score };
  });

  const ranked = [...withScores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.result.thumbnail_candidate_id.localeCompare(b.result.thumbnail_candidate_id);
  });
  const winnerId = ranked[0]?.result.thumbnail_candidate_id ?? null;
  const rankById = new Map(ranked.map((item, index) => [item.result.thumbnail_candidate_id, index + 1]));
  const ranking = ranked.map((item) => item.result.thumbnail_candidate_id);

  const scored = withScores.map((item) => ({
    ...item.result,
    normalized: item.normalized,
    score: item.score,
    rank: rankById.get(item.result.thumbnail_candidate_id) ?? 1,
    winner_label: item.result.thumbnail_candidate_id === winnerId ? 'winner' : 'loser',
  }));

  return ScoreAbTestResultsOutputSchema.parse({
    results: scored,
    ranking,
    winner: scored.find((result) => result.thumbnail_candidate_id === winnerId) ?? null,
    confidence_level: computeConfidenceLevel(parsed),
    weights_used: weights,
  });
}
