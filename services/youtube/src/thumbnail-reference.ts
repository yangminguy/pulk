// thumbnail-reference.ts — 썸네일 레퍼런스 수집.
// 같은 카테고리의 성과 좋은 영상 썸네일을 모아 구성 학습(분석은 l5-core 몫)의 소스로 쓴다.
// 검색 → stats → minViews(기본 5만) 필터 → 조회수 내림차순 상위 N.

import type { YouTubeClient, SearchResult } from './client.js';

export type ThumbnailReferenceClient = Pick<YouTubeClient, 'searchVideos' | 'getVideoStats'>;

export interface ThumbnailReference {
  video_id: string;
  title: string;
  view_count: number;
  /** 고해상도 우선: maxres → high → medium → default 폴백. */
  thumbnail_url: string;
  channel_title: string;
  published_at: string;
}

export interface CollectThumbnailReferencesOptions {
  query: string;
  /** 최종 레퍼런스 수. default 12. */
  maxResults?: number;
  /** 조회수 하한(이상). default 50_000. */
  minViews?: number;
}

/** 썸네일 맵에서 고해상도 우선 URL 선택(maxres → high → medium → default). 없으면 ''. */
export function pickBestThumbnailUrl(
  thumbnails: SearchResult['thumbnails'] | undefined,
): string {
  if (!thumbnails) return '';
  for (const key of ['maxres', 'high', 'medium', 'default']) {
    const url = thumbnails[key]?.url;
    if (url) return url;
  }
  return '';
}

/**
 * 같은 카테고리(query) 고성과 영상의 썸네일 레퍼런스 수집.
 * 필터 통과분이 maxResults보다 적으면 있는 만큼만 반환(에러 아님).
 */
export async function collectThumbnailReferences(
  opts: CollectThumbnailReferencesOptions,
  client: ThumbnailReferenceClient,
): Promise<ThumbnailReference[]> {
  const maxResults = opts.maxResults ?? 12;
  const minViews = opts.minViews ?? 50_000;

  // minViews 필터로 탈락분을 감안해 넉넉히 검색(search.list 1페이지 상한 50).
  const searchSize = Math.min(50, Math.max(maxResults * 3, maxResults));
  const searched = await client.searchVideos(opts.query, {
    maxResults: searchSize,
    order: 'viewCount',
  });
  if (searched.length === 0) return [];

  const byId = new Map(searched.map((s) => [s.videoId, s]));
  const stats = await client.getVideoStats(searched.map((s) => s.videoId));

  return stats
    .filter((s) => s.viewCount >= minViews)
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, maxResults)
    .map((s) => {
      const found = byId.get(s.videoId);
      return {
        video_id: s.videoId,
        title: s.title || found?.title || '',
        view_count: s.viewCount,
        thumbnail_url: pickBestThumbnailUrl(found?.thumbnails),
        channel_title: s.channelTitle || found?.channelTitle || '',
        published_at: found?.publishedAt ?? '',
      };
    });
}
