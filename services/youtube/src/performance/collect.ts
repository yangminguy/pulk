// CMO M5 — 업로드 영상 성과 자동 수집 러너.
//
// Analytics v2 targeted API의 video 디멘전으로 영상별 views/estimatedMinutesWatched/
// averageViewDuration/averageViewPercentage/subscribersGained를 수집한다.
// 노출수·CTR은 targeted API 미지원(M2 실측) — 여기서 시도하지 않는다(Reporting API는 followup).
//
// 폴백 사다리 (한 단계 실패 시 다음):
//   ① video 디멘전 + 전체 메트릭
//   ② video 디멘전 + 핵심 메트릭(subscribersGained/averageViewPercentage 제외)
//   ③ 채널 합계(디멘전 없음) — scope='channel'로 보고
//
// 결과는 구조적 records로 반환 → l5-core parseVideoAnalyticsRecords/
// mapAnalyticsToPerformanceInput이 기존 ingest(recordVideoPerformance) 입력으로 변환한다.
// (이 패키지는 l5-core에 의존하지 않는다 — 매핑은 caller가 조립.)

import type { YouTubeClient, ChannelAnalyticsReport } from '../client.js';

const FULL_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'averageViewPercentage',
  'subscribersGained',
];
const CORE_METRICS = ['views', 'estimatedMinutesWatched', 'averageViewDuration'];
const MAX_VIDEO_RESULTS = 200; // Analytics video dimension cap

export interface CollectVideoPerformanceOptions {
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  /** 지정 시 해당 영상만(filters=video==..). 미지정 시 채널 상위 영상(sort=-views). */
  videoIds?: string[];
  /** videoIds 미지정 시 상위 N개 (기본 50, 최대 200). */
  maxResults?: number;
}

export interface VideoPerformanceCollection {
  /** 'video' = 영상별 수집 성공 · 'channel' = video 디멘전 실패로 채널 합계 폴백. */
  scope: 'video' | 'channel';
  /** 실제로 수신된 메트릭 목록. */
  metrics: string[];
  startDate: string;
  endDate: string;
  /** columnHeaders와 zip된 행 객체들 — l5-core parseVideoAnalyticsRecords 입력. */
  records: Record<string, string | number>[];
  /** 폴백/축소가 있었으면 사유. */
  note?: string;
}

/**
 * 업로드 영상 성과를 Analytics API로 수집한다 (영상별 → 실패 시 채널 합계 폴백).
 * 노출수·CTR은 수집하지 않는다(targeted API 미지원 — caller가 null+사유로 기록).
 */
export async function collectVideoPerformance(
  client: YouTubeClient,
  opts: CollectVideoPerformanceOptions,
): Promise<VideoPerformanceCollection> {
  const base = { startDate: opts.startDate, endDate: opts.endDate };
  const filters = opts.videoIds?.length ? `video==${opts.videoIds.join(',')}` : undefined;
  const maxResults = Math.min(opts.maxResults ?? 50, MAX_VIDEO_RESULTS);

  const attempts: { metrics: string[]; note?: string }[] = [
    { metrics: FULL_METRICS },
    { metrics: CORE_METRICS, note: '일부 메트릭 미지원 → 핵심 메트릭으로 축소 수집' },
  ];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      const report = await client.getChannelAnalytics({
        ...base,
        metrics: attempt.metrics,
        dimensions: ['video'],
        sort: '-views',
        maxResults,
        ...(filters ? { filters } : {}),
      });
      return {
        scope: 'video',
        metrics: attempt.metrics,
        ...base,
        records: report.records,
        ...(attempt.note ? { note: attempt.note } : {}),
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // ③ 채널 합계 폴백 (video 디멘전 자체가 실패한 경우).
  const report: ChannelAnalyticsReport = await client.getChannelAnalytics({
    ...base,
    metrics: FULL_METRICS,
  });
  return {
    scope: 'channel',
    metrics: FULL_METRICS,
    ...base,
    records: report.records,
    note: `video 디멘전 수집 실패 → 채널 합계 폴백 (${lastError?.message ?? 'unknown error'})`,
  };
}
