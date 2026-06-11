import {
  buildSequentialRotationPlan,
  computeConfidenceLevel,
  scoreAbTestResults,
  SequentialRotationSlotSchema,
  ScoreAbTestResultsOutputSchema,
  type AbTestResultInput,
} from '../thumbnail-ab-test';

function daysAfter(day: number): string {
  return new Date(Date.UTC(2026, 5, 1 + day, 0, 0, 0)).toISOString();
}

function result(
  thumbnail_candidate_id: string,
  overrides: Partial<AbTestResultInput> = {},
): AbTestResultInput {
  return {
    thumbnail_candidate_id,
    start_datetime: daysAfter(0),
    end_datetime: daysAfter(2),
    impressions: 1000,
    ctr: 0.05,
    views: 50,
    watch_time_minutes: 100,
    average_view_duration_percentage: 40,
    ...overrides,
  };
}

// ── buildSequentialRotationPlan ──────────────────────────────────────────────

describe('buildSequentialRotationPlan', () => {
  it('기본 2일/후보 순차 구간을 만든다', () => {
    const plan = buildSequentialRotationPlan(['thumb-a', 'thumb-b', 'thumb-c']);

    expect(plan).toEqual([
      { thumbnail_candidate_id: 'thumb-a', start_offset_day: 0, end_offset_day: 2 },
      { thumbnail_candidate_id: 'thumb-b', start_offset_day: 2, end_offset_day: 4 },
      { thumbnail_candidate_id: 'thumb-c', start_offset_day: 4, end_offset_day: 6 },
    ]);
    for (const slot of plan) {
      expect(() => SequentialRotationSlotSchema.parse(slot)).not.toThrow();
    }
  });

  it('daysPerCandidate를 반영한다', () => {
    expect(buildSequentialRotationPlan(['a', 'b'], 3)).toEqual([
      { thumbnail_candidate_id: 'a', start_offset_day: 0, end_offset_day: 3 },
      { thumbnail_candidate_id: 'b', start_offset_day: 3, end_offset_day: 6 },
    ]);
  });

  it('빈 후보 배열은 빈 플랜을 반환하고, 잘못된 일수는 throw', () => {
    expect(buildSequentialRotationPlan([])).toEqual([]);
    expect(() => buildSequentialRotationPlan(['a'], 0)).toThrow('daysPerCandidate');
  });
});

// ── scoreAbTestResults ───────────────────────────────────────────────────────

describe('scoreAbTestResults', () => {
  it('CTR이 있으면 PRD 기본 가중치로 점수와 승자를 산출한다', () => {
    const output = scoreAbTestResults([
      result('a', { ctr: 0.10, watch_time_minutes: 50, average_view_duration_percentage: 20, impressions: 1000 }),
      result('b', { ctr: 0.05, watch_time_minutes: 200, average_view_duration_percentage: 60, impressions: 2000 }),
      result('c', { ctr: 0.01, watch_time_minutes: 100, average_view_duration_percentage: 40, impressions: 1500 }),
    ]);

    expect(output.weights_used).toEqual({
      ctr: 0.35,
      watch_time_minutes: 0.35,
      average_view_duration_percentage: 0.20,
      impressions: 0.10,
    });
    expect(output.winner?.thumbnail_candidate_id).toBe('b');
    expect(output.ranking).toEqual(['b', 'a', 'c']);
    expect(output.results.find((r) => r.thumbnail_candidate_id === 'a')?.score).toBe(0.35);
    expect(output.results.find((r) => r.thumbnail_candidate_id === 'b')?.score).toBe(0.805556);
    expect(output.results.find((r) => r.thumbnail_candidate_id === 'c')?.score).toBe(0.266667);
    expect(() => ScoreAbTestResultsOutputSchema.parse(output)).not.toThrow();
  });

  it('CTR이 하나라도 null이면 CTR 가중치를 재분배한다', () => {
    const output = scoreAbTestResults([
      result('a', { ctr: null, watch_time_minutes: 50, average_view_duration_percentage: 20, impressions: 1000 }),
      result('b', { ctr: null, watch_time_minutes: 200, average_view_duration_percentage: 60, impressions: 2000 }),
      result('c', { ctr: null, watch_time_minutes: 100, average_view_duration_percentage: 40, impressions: 1500 }),
    ]);

    expect(output.weights_used).toEqual({
      ctr: 0,
      watch_time_minutes: 0.525,
      average_view_duration_percentage: 0.35,
      impressions: 0.125,
    });
    expect(output.winner?.thumbnail_candidate_id).toBe('b');
    expect(output.results.find((r) => r.thumbnail_candidate_id === 'a')?.normalized.ctr).toBeNull();
    expect(output.results.find((r) => r.thumbnail_candidate_id === 'b')?.score).toBe(1);
    expect(output.results.find((r) => r.thumbnail_candidate_id === 'c')?.score).toBe(0.4125);
  });

  it('동일 라운드 내 min-max 정규화로 0~1 값을 만든다', () => {
    const output = scoreAbTestResults([
      result('low', { ctr: 0.01, watch_time_minutes: 10, average_view_duration_percentage: 10, impressions: 100 }),
      result('mid', { ctr: 0.02, watch_time_minutes: 20, average_view_duration_percentage: 20, impressions: 200 }),
      result('high', { ctr: 0.03, watch_time_minutes: 30, average_view_duration_percentage: 30, impressions: 300 }),
    ]);

    expect(output.results.find((r) => r.thumbnail_candidate_id === 'low')?.normalized).toEqual({
      ctr: 0,
      watch_time_minutes: 0,
      average_view_duration_percentage: 0,
      impressions: 0,
    });
    expect(output.results.find((r) => r.thumbnail_candidate_id === 'mid')?.normalized).toEqual({
      ctr: 0.5,
      watch_time_minutes: 0.5,
      average_view_duration_percentage: 0.5,
      impressions: 0.5,
    });
    expect(output.results.find((r) => r.thumbnail_candidate_id === 'high')?.normalized).toEqual({
      ctr: 1,
      watch_time_minutes: 1,
      average_view_duration_percentage: 1,
      impressions: 1,
    });
  });

  it('동점이면 candidate_id 오름차순으로 승자를 안정적으로 선정한다', () => {
    const output = scoreAbTestResults([
      result('b', { ctr: 0.05, watch_time_minutes: 100, average_view_duration_percentage: 40, impressions: 1000 }),
      result('a', { ctr: 0.05, watch_time_minutes: 100, average_view_duration_percentage: 40, impressions: 1000 }),
    ]);

    expect(output.ranking).toEqual(['a', 'b']);
    expect(output.winner?.thumbnail_candidate_id).toBe('a');
  });

  it('빈 결과는 winner null과 insufficient를 반환한다', () => {
    const output = scoreAbTestResults([]);

    expect(output.results).toEqual([]);
    expect(output.ranking).toEqual([]);
    expect(output.winner).toBeNull();
    expect(output.confidence_level).toBe('insufficient');
  });
});

// ── computeConfidenceLevel ──────────────────────────────────────────────────

describe('computeConfidenceLevel', () => {
  it('high: 각 후보 5000 impressions 이상 + 3일 이상 + 후보 간 기간 균등', () => {
    const results = [
      result('a', { start_datetime: daysAfter(0), end_datetime: daysAfter(3), impressions: 5000 }),
      result('b', { start_datetime: daysAfter(3), end_datetime: daysAfter(6), impressions: 6000 }),
      result('c', { start_datetime: daysAfter(6), end_datetime: daysAfter(9), impressions: 7000 }),
    ];

    expect(computeConfidenceLevel(results)).toBe('high');
  });

  it('medium: 각 후보 impressions 1000 이상이면 기간이 2일 미만이어도 medium', () => {
    const results = [
      result('a', { start_datetime: daysAfter(0), end_datetime: daysAfter(1), impressions: 1000 }),
      result('b', { start_datetime: daysAfter(1), end_datetime: daysAfter(2), impressions: 1200 }),
    ];

    expect(computeConfidenceLevel(results)).toBe('medium');
  });

  it('medium: 기간이 각 후보 2일 이상이면 impressions 1000 미만이어도 medium', () => {
    const results = [
      result('a', { start_datetime: daysAfter(0), end_datetime: daysAfter(2), impressions: 200 }),
      result('b', { start_datetime: daysAfter(2), end_datetime: daysAfter(4), impressions: 300 }),
    ];

    expect(computeConfidenceLevel(results)).toBe('medium');
  });

  it('low: 판단 가능하지만 impressions와 기간 기준 모두 미달', () => {
    const results = [
      result('a', { start_datetime: daysAfter(0), end_datetime: daysAfter(1), impressions: 100 }),
      result('b', { start_datetime: daysAfter(1), end_datetime: daysAfter(2), impressions: 200 }),
    ];

    expect(computeConfidenceLevel(results)).toBe('low');
  });

  it('insufficient: 결과 없음, impressions null, 기간 누락은 판단 불가', () => {
    expect(computeConfidenceLevel([])).toBe('insufficient');
    expect(computeConfidenceLevel([result('a', { impressions: null })])).toBe('insufficient');
    expect(computeConfidenceLevel([{
      thumbnail_candidate_id: 'a',
      impressions: 1000,
      ctr: 0.05,
      views: 50,
      watch_time_minutes: 100,
      average_view_duration_percentage: 40,
    }])).toBe('insufficient');
  });
});
