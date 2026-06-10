// CMO M5 — YouTube Analytics 응답 → 성과 입력(RecordVideoPerformanceInput) 매핑.
//
// 비전: @l5/youtube가 수집한 video 디멘전 analytics(views, estimatedMinutesWatched,
// averageViewDuration, averageViewPercentage, subscribersGained)를 기존 수동 입력과
// 동일한 ingest 함수(recordVideoPerformance)로 흘려보낸다. 수동 경로는 그대로 폴백.
//
// M2 실측 제약: 노출수(impressions)·CTR은 targeted Analytics API 미지원(전 조합 400).
// → ctr/impressions = null 고정 + metrics_note에 사유 기록. Reporting API
// (youtubereporting.googleapis.com + channel_reach_basic_a1 job) 활성화 후 채운다.
//
// 컨벤션: 순수/결정론. 외부 I/O 없음 — analytics 응답은 caller(services/youtube)가
// 구조적 records(Record<string, string|number>[])로 넘긴다. l5-core는 @l5/youtube에
// 의존하지 않는다(NocoBase 없이 테스트 가능 원칙).

import { z } from 'zod';
import type { RecordVideoPerformanceInput } from './performance-ingestion';

/** 노출/CTR 미수집 사유 (M2 실측, Reporting API 활성화 후 해소). */
export const IMPRESSIONS_UNAVAILABLE_NOTE =
  '노출수·CTR 미수집: targeted Analytics API 미지원(M2 실측) — Reporting API(channel_reach_basic_a1) 활성화 후 수집 가능';

/** analytics 1행을 정규화한 영상(또는 채널 합계) 단위 지표. */
export interface VideoAnalyticsMetrics {
  /** video 디멘전의 videoId. 채널 합계 폴백이면 null. */
  video_id: string | null;
  views: number;
  estimated_minutes_watched: number | null;
  average_view_duration_seconds: number | null;
  /** 평균 시청 완료율(%) 0~100. 미수집이면 null. */
  average_view_percentage: number | null;
  subscribers_gained: number | null;
}

const RecordRowSchema = z.record(z.union([z.string(), z.number()]));

function num(row: Record<string, string | number>, key: string): number | null {
  const v = row[key];
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @l5/youtube ChannelAnalyticsReport.records → VideoAnalyticsMetrics[].
 * video 디멘전 행과 채널 합계 행(video 컬럼 없음) 둘 다 처리한다.
 */
export function parseVideoAnalyticsRecords(
  records: Record<string, string | number>[],
): VideoAnalyticsMetrics[] {
  return records.map((raw) => {
    const row = RecordRowSchema.parse(raw);
    const videoId = row.video != null ? String(row.video) : null;
    return {
      video_id: videoId && videoId.length > 0 ? videoId : null,
      views: num(row, 'views') ?? 0,
      estimated_minutes_watched: num(row, 'estimatedMinutesWatched'),
      average_view_duration_seconds: num(row, 'averageViewDuration'),
      average_view_percentage: num(row, 'averageViewPercentage'),
      subscribers_gained: num(row, 'subscribersGained'),
    };
  });
}

/**
 * Reporting API(channel_reach_basic_a1)에서 받은 영상별 노출/CTR.
 * 있으면 ctr/impressions를 채운다(없으면 기존대로 null + metrics_note 유지 — 무회귀).
 */
export interface ReachMetrics {
  impressions: number | null;
  /** 노출 대비 클릭률 0~1. */
  impression_ctr: number | null;
}

export interface MapAnalyticsToPerformanceInputArgs {
  project_id: string;
  metrics: VideoAnalyticsMetrics;
  /** 수집 범위 표기 (예: '2026-05-13..2026-06-10'). retention_notes에 포함. */
  range?: string;
  /** Reporting API 노출/CTR. 미지정 시 노출/CTR = null + metrics_note 유지(무회귀). */
  reach?: ReachMetrics;
}

/**
 * 영상 단위 analytics 지표 → 기존 ingest 입력(RecordVideoPerformanceInput).
 * - completion_rate = averageViewPercentage/100 (0~1 클램프). 미수집이면 null.
 * - ctr/impressions = null + metrics_note 사유 (M2 실측 제약).
 * - retention_notes = 시청 지표 결정론 요약(자동 수집 출처 표기).
 */
export function mapAnalyticsToPerformanceInput(
  args: MapAnalyticsToPerformanceInputArgs,
): RecordVideoPerformanceInput {
  const m = args.metrics;
  const completion_rate =
    m.average_view_percentage == null
      ? null
      : Math.min(1, Math.max(0, m.average_view_percentage / 100));

  const noteParts: string[] = [
    `[자동수집:YouTube Analytics${args.range ? ` ${args.range}` : ''}]`,
    m.video_id ? `영상 ${m.video_id}` : '채널 합계(영상별 폴백)',
  ];
  if (m.average_view_duration_seconds != null) {
    noteParts.push(`평균 시청 ${Math.round(m.average_view_duration_seconds)}초`);
  }
  if (m.estimated_minutes_watched != null) {
    noteParts.push(`총 시청 ${Math.round(m.estimated_minutes_watched)}분`);
  }
  if (m.subscribers_gained != null) {
    noteParts.push(`구독 +${m.subscribers_gained}`);
  }

  // 노출/CTR: Reporting API 데이터가 있으면 채우고, 없으면 기존대로 null + 사유(무회귀).
  const hasReach =
    args.reach != null &&
    (args.reach.impressions != null || args.reach.impression_ctr != null);
  const impressions = hasReach ? args.reach!.impressions : null;
  const ctr =
    hasReach && args.reach!.impression_ctr != null
      ? Math.min(1, Math.max(0, args.reach!.impression_ctr))
      : null;
  const metrics_note = hasReach
    ? `노출수·CTR: Reporting API(channel_reach_basic_a1) 수집${args.range ? ` ${args.range}` : ''}`
    : IMPRESSIONS_UNAVAILABLE_NOTE;

  return {
    project_id: args.project_id,
    view_count: Math.max(0, Math.round(m.views)),
    completion_rate,
    ctr,
    impressions,
    metrics_note,
    retention_notes: noteParts.join(' · '),
  };
}
