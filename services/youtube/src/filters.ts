import type { VideoStats } from './client.js';

/** CMO discovery baseline: 조회수 5만+ (client-side filter; the API has no view filter). */
export const MIN_VIEWS_DEFAULT = 50_000;

export function filterByMinViews(stats: VideoStats[], minViews: number = MIN_VIEWS_DEFAULT): VideoStats[] {
  return stats.filter((s) => s.viewCount >= minViews);
}
