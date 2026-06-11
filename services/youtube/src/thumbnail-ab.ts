// thumbnail-ab.ts — 썸네일 9개 A/B PRD의 YouTube 연동(Track B).
// 1) setVideoThumbnail: thumbnails.set 교체(D3 외부 액션 — 승인 게이트 + 업로더 주입).
// 2) collectThumbnailPeriodMetrics: 기간별 성과를 getChannelAnalytics로 수집 → A/B 점수 입력 shape.
// 실제 바이너리 업로드/실호출은 엣지에서 주입한다(FetchLike는 string body만 지원하므로).

import type { YouTubeClient } from './client.js';

export interface SetVideoThumbnailParams {
  videoId: string;
  imageBytes: Uint8Array;
  mimeType?: string; // 'image/jpeg' | 'image/png'
  accessToken: string;
  /** D3 외부 액션 게이트 — Founder 승인 전에는 호출하지 않는다. */
  approved: boolean;
}

export interface SetVideoThumbnailDeps {
  /** 실제 thumbnails.set 바이너리 업로더(엣지 주입). 미주입 시 not_configured. */
  uploadThumbnail?: (args: {
    videoId: string;
    imageBytes: Uint8Array;
    mimeType: string;
    accessToken: string;
  }) => Promise<{ ok: boolean; thumbnailUrl?: string; status?: number }>;
}

export interface SetVideoThumbnailResult {
  ok: boolean;
  reason?: 'approval_required' | 'not_configured' | 'upload_failed';
  thumbnailUrl?: string;
}

/** PRD §8.1: 특정 영상의 커스텀 썸네일 교체. 미승인 시 호출 차단(approval_required). */
export async function setVideoThumbnail(
  params: SetVideoThumbnailParams,
  deps: SetVideoThumbnailDeps = {},
): Promise<SetVideoThumbnailResult> {
  if (!params.approved) return { ok: false, reason: 'approval_required' };
  if (!deps.uploadThumbnail) return { ok: false, reason: 'not_configured' };
  const r = await deps.uploadThumbnail({
    videoId: params.videoId,
    imageBytes: params.imageBytes,
    mimeType: params.mimeType ?? 'image/jpeg',
    accessToken: params.accessToken,
  });
  return r.ok ? { ok: true, thumbnailUrl: r.thumbnailUrl } : { ok: false, reason: 'upload_failed' };
}

/** 기간별 썸네일 성과(영상 단위). scoreAbTestResults의 AbTestResultInput과 호환되는 plain shape. */
export interface ThumbnailPeriodMetrics {
  video_id: string;
  start_datetime: string;
  end_datetime: string;
  impressions: number | null;
  ctr: number | null;
  views: number;
  watch_time_minutes: number;
  average_view_duration_percentage: number | null;
}

function toNum(v: string | number | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * PRD §6.3/§8.2: 한 기간(썸네일 적용 구간)의 영상 단위 성과를 수집한다.
 * impressions/CTR은 표준 Analytics에 없을 수 있어(Reporting API 필요) 없으면 null.
 */
export async function collectThumbnailPeriodMetrics(
  client: Pick<YouTubeClient, 'getChannelAnalytics'>,
  videoId: string,
  startDate: string,
  endDate: string,
): Promise<ThumbnailPeriodMetrics> {
  const report = await client.getChannelAnalytics({
    startDate,
    endDate,
    metrics: ['views', 'estimatedMinutesWatched', 'averageViewPercentage'],
    filters: `video==${videoId}`,
  });
  const rec: Record<string, string | number> = report.records[0] ?? {};
  return {
    video_id: videoId,
    start_datetime: startDate,
    end_datetime: endDate,
    impressions: 'impressions' in rec ? toNum(rec.impressions) : null,
    ctr: 'impressionClickThroughRate' in rec ? toNum(rec.impressionClickThroughRate) / 100 : null,
    views: toNum(rec.views),
    watch_time_minutes: toNum(rec.estimatedMinutesWatched),
    average_view_duration_percentage:
      'averageViewPercentage' in rec ? toNum(rec.averageViewPercentage) : null,
  };
}
