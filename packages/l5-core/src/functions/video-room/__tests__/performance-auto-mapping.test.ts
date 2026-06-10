import {
  parseVideoAnalyticsRecords,
  mapAnalyticsToPerformanceInput,
  IMPRESSIONS_UNAVAILABLE_NOTE,
} from '../performance-auto-mapping';
import { recordVideoPerformance } from '../performance-ingestion';

// @l5/youtube ChannelAnalyticsReport.records 형태의 fixture (video 디멘전).
const VIDEO_DIMENSION_RECORDS: Record<string, string | number>[] = [
  {
    video: 'abc123XYZ_1',
    views: 1200,
    estimatedMinutesWatched: 180,
    averageViewDuration: 21,
    averageViewPercentage: 35.4,
    subscribersGained: 1,
  },
  {
    video: 'abc123XYZ_2',
    views: 150,
    estimatedMinutesWatched: 30,
    averageViewDuration: 12,
    averageViewPercentage: 18.2,
    subscribersGained: 0,
  },
];

// 채널 합계 폴백 fixture (video 컬럼 없음).
const CHANNEL_TOTAL_RECORDS: Record<string, string | number>[] = [
  { views: 1395, estimatedMinutesWatched: 225, averageViewDuration: 21, subscribersGained: 1 },
];

describe('parseVideoAnalyticsRecords', () => {
  it('video 디멘전 행 → 영상별 지표 정규화', () => {
    const parsed = parseVideoAnalyticsRecords(VIDEO_DIMENSION_RECORDS);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      video_id: 'abc123XYZ_1',
      views: 1200,
      estimated_minutes_watched: 180,
      average_view_duration_seconds: 21,
      average_view_percentage: 35.4,
      subscribers_gained: 1,
    });
  });

  it('채널 합계 행(video 없음) → video_id null + 미수집 지표 null', () => {
    const parsed = parseVideoAnalyticsRecords(CHANNEL_TOTAL_RECORDS);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].video_id).toBeNull();
    expect(parsed[0].views).toBe(1395);
    expect(parsed[0].average_view_percentage).toBeNull();
  });
});

describe('mapAnalyticsToPerformanceInput → recordVideoPerformance (동일 ingest 경로)', () => {
  it('video 디멘전 지표 → ingest 입력 → PerformanceRecord (CTR/노출 null + 사유)', () => {
    const [m] = parseVideoAnalyticsRecords(VIDEO_DIMENSION_RECORDS);
    const input = mapAnalyticsToPerformanceInput({
      project_id: 'p1',
      metrics: m,
      range: '2026-05-13..2026-06-10',
    });

    expect(input.view_count).toBe(1200);
    expect(input.completion_rate).toBeCloseTo(0.354);
    expect(input.ctr).toBeNull();
    expect(input.impressions).toBeNull();
    expect(input.metrics_note).toBe(IMPRESSIONS_UNAVAILABLE_NOTE);
    expect(input.retention_notes).toContain('영상 abc123XYZ_1');
    expect(input.retention_notes).toContain('평균 시청 21초');
    expect(input.retention_notes).toContain('2026-05-13..2026-06-10');

    const record = recordVideoPerformance(input);
    expect(record.view_count).toBe(1200);
    expect(record.ctr).toBeNull();
    expect(record.impressions).toBeNull();
    expect(record.summary).toContain('완료율 35%');
    expect(record.summary).toContain('CTR 미수집');
  });

  it('채널 합계 폴백 → completion_rate null + 폴백 표기', () => {
    const [m] = parseVideoAnalyticsRecords(CHANNEL_TOTAL_RECORDS);
    const input = mapAnalyticsToPerformanceInput({ project_id: 'p1', metrics: m });
    expect(input.completion_rate).toBeNull();
    expect(input.retention_notes).toContain('채널 합계');

    const record = recordVideoPerformance(input);
    expect(record.summary).toContain('완료율 미수집');
  });

  it('averageViewPercentage 100 초과는 1로 클램프, 음수 views는 0', () => {
    const input = mapAnalyticsToPerformanceInput({
      project_id: 'p1',
      metrics: {
        video_id: 'v1',
        views: -3,
        estimated_minutes_watched: null,
        average_view_duration_seconds: null,
        average_view_percentage: 120,
        subscribers_gained: null,
      },
    });
    expect(input.view_count).toBe(0);
    expect(input.completion_rate).toBe(1);
    expect(() => recordVideoPerformance(input)).not.toThrow();
  });
});

describe('recordVideoPerformance 수동 경로 호환(폴백 유지)', () => {
  it('기존 수동 입력(숫자 ctr/completion_rate)은 그대로 동작', () => {
    const rec = recordVideoPerformance({
      project_id: 'p1',
      view_count: 100,
      completion_rate: 0.5,
      ctr: 0.05,
    });
    expect(rec.summary).toContain('CTR 5%');
    expect(rec.impressions).toBeUndefined();
  });
});
