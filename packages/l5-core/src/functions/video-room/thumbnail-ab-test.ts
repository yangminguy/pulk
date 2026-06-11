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

// ── 강의 노트(2026-06-11) — 업로드 후 교체 윈도우 + 모니터링 교체 신호 ────────

/**
 * 썸네일 교체는 업로드 후 1주일 안에만 유의미하다 (강의 정본).
 * 그 이후의 교체는 알고리즘 노출 사이클상 효과가 크게 떨어진다.
 */
export const THUMBNAIL_SWAP_WINDOW_DAYS = 7;

export interface RotationWindowCheck {
  fits: boolean;
  total_days: number;
  window_days: number;
  note: string;
}

/**
 * 순차 로테이션 전체 기간이 교체 유효 윈도우(기본 7일) 안에 끝나는지 검사한다.
 * 기본 설정(3개 × 2일 = 6일)은 통과. 3일/후보 × 3개 = 9일은 경고.
 */
export function validateRotationWindow(
  slots: SequentialRotationSlot[],
  windowDays: number = THUMBNAIL_SWAP_WINDOW_DAYS,
): RotationWindowCheck {
  const totalDays = slots.reduce((max, slot) => Math.max(max, slot.end_offset_day), 0);
  const fits = totalDays <= windowDays;
  return {
    fits,
    total_days: totalDays,
    window_days: windowDays,
    note: fits
      ? `로테이션 ${totalDays}일 — 업로드 후 ${windowDays}일 교체 유효 윈도우 내 완료`
      : `로테이션 ${totalDays}일 — ${windowDays}일 윈도우 초과. 후보 수를 줄이거나 후보당 기간을 줄여야 한다(7일 이후 교체는 효과 낮음).`,
  };
}

export interface ThumbnailSwapMonitorConfig {
  /**
   * 강의 원 기준: "업로드 이후 분당 100개면 합격, 못 넘으면 교체".
   * 신생 채널엔 비현실적이라 기본 미사용(null) — 사장님이 채널 규모에 맞게 설정.
   */
  views_per_minute_pass?: number | null;
  /**
   * 보수적 기본 기준: 윈도우(7일) 종료 시점까지 기대 조회수.
   * 일할 계산으로 중간 평가한다. 기본 100회(제목 교체 규칙과 동일 스케일).
   */
  min_views_by_window_end?: number;
  /** 교체 유효 윈도우 (기본 7일). */
  window_days?: number;
}

export interface ThumbnailSwapSignal {
  action: 'keep' | 'swap_recommended' | 'too_late';
  reason: string;
}

/**
 * 업로드 후 썸네일 교체 신호 (결정론 모니터링 규칙).
 *
 * - 윈도우(기본 7일) 경과 후에는 too_late — 교체 효과 낮음.
 * - views_per_minute_pass 설정 시: 분당 조회수 기준(강의 원 기준)으로 판단.
 * - 미설정 시: min_views_by_window_end의 일할(prorate) 기대치 미달이면 교체 권장.
 */
export function evaluateThumbnailSwapSignal(
  input: { days_since_upload: number; views: number },
  config: ThumbnailSwapMonitorConfig = {},
): ThumbnailSwapSignal {
  const windowDays = config.window_days ?? THUMBNAIL_SWAP_WINDOW_DAYS;
  if (input.days_since_upload < 0) throw new Error('days_since_upload must be >= 0');

  if (input.days_since_upload > windowDays) {
    return {
      action: 'too_late',
      reason: `업로드 ${input.days_since_upload}일차 — 교체 유효 윈도우(${windowDays}일) 경과. 교체보다 다음 영상에 반영 권장.`,
    };
  }

  if (config.views_per_minute_pass != null) {
    const minutes = Math.max(1, input.days_since_upload * 24 * 60);
    const vpm = input.views / minutes;
    if (vpm < config.views_per_minute_pass) {
      return {
        action: 'swap_recommended',
        reason: `분당 조회수 ${vpm.toFixed(2)} < 기준 ${config.views_per_minute_pass} — 썸네일 교체 권장(강의 기준)`,
      };
    }
    return { action: 'keep', reason: `분당 조회수 ${vpm.toFixed(2)} ≥ 기준 ${config.views_per_minute_pass} — 합격` };
  }

  const targetByWindowEnd = config.min_views_by_window_end ?? 100;
  const expectedSoFar = (targetByWindowEnd * input.days_since_upload) / windowDays;
  if (input.days_since_upload > 0 && input.views < expectedSoFar) {
    return {
      action: 'swap_recommended',
      reason: `업로드 ${input.days_since_upload}일차 조회수 ${input.views}회 < 기대 추세 ${Math.ceil(expectedSoFar)}회(${windowDays}일 ${targetByWindowEnd}회 기준) — 썸네일 교체 권장`,
    };
  }
  return {
    action: 'keep',
    reason: `업로드 ${input.days_since_upload}일차 조회수 ${input.views}회 — 기대 추세 충족(윈도우 내 유지)`,
  };
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
