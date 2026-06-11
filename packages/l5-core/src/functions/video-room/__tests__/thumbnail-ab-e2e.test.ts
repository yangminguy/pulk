// Thumbnail A/B E2E — PRD 전체 체인 결정론 통합 테스트.
//
// 1. 입력 → buildThumbnailMatrix9 → 9개 후보
// 2. 각 후보 → analyzeThumbnailPsychology → 심리분석
// 3. 3개 선택(서로 다른 image_strategy) → buildSequentialRotationPlan
// 4. 모의 성과 주입 → scoreAbTestResults → winner + 랭킹
// 5. computeConfidenceLevel → 신뢰도 등급
// 6. CTR null 시나리오 → 가중치 재분배

import {
  buildThumbnailMatrix9,
  analyzeThumbnailPsychology,
  IMAGE_STRATEGIES,
  SLOT_LABELS,
  ThumbnailMatrixCandidateSchema,
  ThumbnailPsychologyAnalysisSchema,
} from '../thumbnail-matrix';
import type { ThumbnailMatrixCandidate, ThumbnailMatrixInput } from '../thumbnail-matrix';
import {
  buildSequentialRotationPlan,
  scoreAbTestResults,
  computeConfidenceLevel,
  SequentialRotationSlotSchema,
  ScoreAbTestResultsOutputSchema,
} from '../thumbnail-ab-test';
import type { AbTestResultInput } from '../thumbnail-ab-test';

// ── Fixtures ────────────────────────────────────────────────────────────────

const VIDEO_INPUT: ThumbnailMatrixInput = {
  video_id: 'e2e-vid-001',
  title: '월급쟁이가 부동산 투자로 3년 만에 경제적 자유를 얻은 방법',
  main_click_reason: '직장인도 가능한 부동산 전략이 궁금해서',
  target_audience: '30대 직장인',
  target_problem: '월급만으로는 자산 증식이 안 된다',
  target_desire: '경제적 자유',
  target_loss_to_avoid: '부동산 타이밍을 놓치면 평생 월급쟁이',
  reference_patterns: [],
};

function makeAbResult(
  id: string,
  overrides: Partial<AbTestResultInput> = {},
): AbTestResultInput {
  return {
    thumbnail_candidate_id: id,
    start_datetime: '2026-06-01T00:00:00Z',
    end_datetime: '2026-06-04T00:00:00Z',
    impressions: 6000,
    ctr: 5.0,
    views: 300,
    watch_time_minutes: 900,
    average_view_duration_percentage: 45,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Thumbnail A/B E2E chain', () => {
  let candidates: ThumbnailMatrixCandidate[];

  // Step 1: buildThumbnailMatrix9 → 9개 후보
  it('Step 1: buildThumbnailMatrix9 produces 9 valid candidates', async () => {
    const result = await buildThumbnailMatrix9(VIDEO_INPUT);

    expect(result.source).toBe('fallback');
    expect(result.candidates).toHaveLength(9);

    // 모든 슬롯(A~I) 커버
    const slots = result.candidates.map((c) => c.slot);
    expect(new Set(slots)).toEqual(new Set(SLOT_LABELS));

    // 3개 이미지 전략 각 3개씩
    for (const strategy of IMAGE_STRATEGIES) {
      const count = result.candidates.filter((c) => c.image_strategy === strategy).length;
      expect(count).toBe(3);
    }

    // 개별 스키마 검증
    for (const c of result.candidates) {
      expect(() => ThumbnailMatrixCandidateSchema.parse(c)).not.toThrow();
    }

    // candidate_id 유일성
    const ids = new Set(result.candidates.map((c) => c.candidate_id));
    expect(ids.size).toBe(9);

    // 제목과 썸네일 문구 중복 금지
    for (const c of result.candidates) {
      expect(c.thumbnail_text).not.toBe(VIDEO_INPUT.title);
    }

    candidates = result.candidates;
  });

  // Step 2: analyzeThumbnailPsychology → 9개 심리분석
  it('Step 2: analyzeThumbnailPsychology produces valid analysis for each candidate', async () => {
    for (const candidate of candidates) {
      const { analysis, source } = await analyzeThumbnailPsychology(candidate);

      expect(source).toBe('fallback');
      expect(analysis.candidate_id).toBe(candidate.candidate_id);
      expect(() => ThumbnailPsychologyAnalysisSchema.parse(analysis)).not.toThrow();

      // 점수 범위
      expect(analysis.click_reason_clarity_score).toBeGreaterThanOrEqual(0);
      expect(analysis.click_reason_clarity_score).toBeLessThanOrEqual(100);
      expect(analysis.title_text_image_alignment_score).toBeGreaterThanOrEqual(0);
      expect(analysis.title_text_image_alignment_score).toBeLessThanOrEqual(100);

      // 필수 문자열 필드 비어있지 않음
      expect(analysis.text_structure.length).toBeGreaterThan(0);
      expect(analysis.combined_click_psychology.length).toBeGreaterThan(0);
    }
  });

  // Step 3: 서로 다른 image_strategy 3개 선택 → buildSequentialRotationPlan
  it('Step 3: buildSequentialRotationPlan creates correct rotation for 3 candidates', () => {
    // 각 이미지 전략에서 1개씩 선택
    const selected = IMAGE_STRATEGIES.map(
      (strategy) => candidates.find((c) => c.image_strategy === strategy)!,
    );
    expect(selected).toHaveLength(3);
    const selectedStrategies = new Set(selected.map((c) => c.image_strategy));
    expect(selectedStrategies.size).toBe(3);

    const selectedIds = selected.map((c) => c.candidate_id);
    const plan = buildSequentialRotationPlan(selectedIds, 3);

    expect(plan).toHaveLength(3);

    // 스키마 검증 + 오프셋 연속성
    for (let i = 0; i < plan.length; i++) {
      expect(() => SequentialRotationSlotSchema.parse(plan[i])).not.toThrow();
      expect(plan[i].thumbnail_candidate_id).toBe(selectedIds[i]);
      expect(plan[i].start_offset_day).toBe(i * 3);
      expect(plan[i].end_offset_day).toBe((i + 1) * 3);
    }

    // 구간이 겹치지 않음
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].start_offset_day).toBe(plan[i - 1].end_offset_day);
    }
  });

  // Step 4: 모의 성과 주입 → scoreAbTestResults → winner + 랭킹
  it('Step 4: scoreAbTestResults ranks candidates and picks a winner', () => {
    const selected = IMAGE_STRATEGIES.map(
      (strategy) => candidates.find((c) => c.image_strategy === strategy)!,
    );

    // 성과 차등 주입: zoom > evidence > empathy
    const results: AbTestResultInput[] = [
      makeAbResult(selected[0].candidate_id, { ctr: 8.0, watch_time_minutes: 1500, views: 500 }),
      makeAbResult(selected[1].candidate_id, { ctr: 5.0, watch_time_minutes: 900, views: 300 }),
      makeAbResult(selected[2].candidate_id, { ctr: 3.0, watch_time_minutes: 600, views: 200 }),
    ];

    const output = scoreAbTestResults(results);
    expect(() => ScoreAbTestResultsOutputSchema.parse(output)).not.toThrow();

    // winner 존재
    expect(output.winner).not.toBeNull();
    expect(output.winner!.thumbnail_candidate_id).toBe(selected[0].candidate_id);
    expect(output.winner!.winner_label).toBe('winner');
    expect(output.winner!.rank).toBe(1);

    // 랭킹 순서: zoom → evidence → empathy
    expect(output.ranking).toEqual([
      selected[0].candidate_id,
      selected[1].candidate_id,
      selected[2].candidate_id,
    ]);

    // 점수 내림차순
    const scores = output.results
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }

    // 가중치: CTR 있으므로 기본 가중치
    expect(output.weights_used.ctr).toBe(0.35);

    // loser 라벨 검증
    const losers = output.results.filter((r) => r.winner_label === 'loser');
    expect(losers).toHaveLength(2);
  });

  // Step 5: computeConfidenceLevel → 신뢰도 등급
  it('Step 5: computeConfidenceLevel returns correct confidence levels', () => {
    const selected = IMAGE_STRATEGIES.map(
      (strategy) => candidates.find((c) => c.image_strategy === strategy)!,
    );

    // high: impressions >= 5000, duration >= 3일, 균등 기간
    const highResults: AbTestResultInput[] = selected.map((c) =>
      makeAbResult(c.candidate_id, {
        impressions: 6000,
        start_datetime: '2026-06-01T00:00:00Z',
        end_datetime: '2026-06-04T00:00:00Z', // 3일
      }),
    );
    expect(computeConfidenceLevel(highResults)).toBe('high');

    // medium: impressions >= 1000 but < 5000
    const mediumResults: AbTestResultInput[] = selected.map((c) =>
      makeAbResult(c.candidate_id, {
        impressions: 2000,
        start_datetime: '2026-06-01T00:00:00Z',
        end_datetime: '2026-06-03T00:00:00Z', // 2일
      }),
    );
    expect(computeConfidenceLevel(mediumResults)).toBe('medium');

    // insufficient: impressions null
    const insufficientResults: AbTestResultInput[] = selected.map((c) =>
      makeAbResult(c.candidate_id, { impressions: null }),
    );
    expect(computeConfidenceLevel(insufficientResults)).toBe('insufficient');

    // empty
    expect(computeConfidenceLevel([])).toBe('insufficient');
  });

  // Step 6: CTR null → 가중치 재분배
  it('Step 6: CTR null triggers weight redistribution', () => {
    const selected = IMAGE_STRATEGIES.map(
      (strategy) => candidates.find((c) => c.image_strategy === strategy)!,
    );

    // CTR을 null로 — watch_time으로 승자 결정
    const results: AbTestResultInput[] = [
      makeAbResult(selected[0].candidate_id, {
        ctr: null,
        watch_time_minutes: 1500,
        average_view_duration_percentage: 60,
      }),
      makeAbResult(selected[1].candidate_id, {
        ctr: null,
        watch_time_minutes: 900,
        average_view_duration_percentage: 40,
      }),
      makeAbResult(selected[2].candidate_id, {
        ctr: null,
        watch_time_minutes: 600,
        average_view_duration_percentage: 30,
      }),
    ];

    const output = scoreAbTestResults(results);
    expect(() => ScoreAbTestResultsOutputSchema.parse(output)).not.toThrow();

    // CTR 가중치 0, 재분배 가중치 적용
    expect(output.weights_used.ctr).toBe(0);
    expect(output.weights_used.watch_time_minutes).toBe(0.525);
    expect(output.weights_used.average_view_duration_percentage).toBe(0.35);
    expect(output.weights_used.impressions).toBe(0.125);

    // normalized CTR은 전부 null
    for (const r of output.results) {
      expect(r.normalized.ctr).toBeNull();
    }

    // watch_time 최고인 첫 번째가 winner
    expect(output.winner).not.toBeNull();
    expect(output.winner!.thumbnail_candidate_id).toBe(selected[0].candidate_id);
    expect(output.ranking[0]).toBe(selected[0].candidate_id);
  });
});
