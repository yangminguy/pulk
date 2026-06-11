// hotvideo.ts — 핫비디오 후보 수집 (제목 디벨롭 5·7단계 hot_videos 주입용).
//
// provenance: viewtrap 핫비디오 메뉴 자동화 전 YouTube 최근 고성과 프록시.
// viewtrap 강의 기준(굳·그레이트 등급 + 조회수 10만+ + 구독자 적은 순)을 YouTube Data API로
// 근사한다: 최근 N일 내 게시 + order=viewCount 검색 → minViews 필터 → 구독자 적은 순 정렬.
// viewtrap 등급(굳/그레이트)은 YouTube API에 없으므로 grades는 기록만 하고 필터엔 미적용.

import type { YouTubeClient } from './client.js';
import { pickBestThumbnailUrl } from './thumbnail-reference.js';

export type HotVideoClient = Pick<YouTubeClient, 'searchVideos' | 'getVideoStats' | 'getChannelStats'>;

export const HOT_VIDEO_PROVENANCE =
  'viewtrap 핫비디오 메뉴 자동화 전 YouTube 최근 고성과 프록시';

export interface HotVideoCandidate {
  video_id: string;
  title: string;
  view_count: number;
  /** 채널 구독자 수. 채널이 숨김 처리했으면 생략. */
  subscriber_count?: number;
  published_at: string;
  thumbnail_url: string;
}

export interface CollectHotVideoCandidatesOptions {
  query: string;
  /** 최종 후보 수. default 15. */
  maxResults?: number;
  /** 최근 N일 내 게시 영상만(search.list publishedAfter). default 14. */
  publishedWithinDays?: number;
  /** 조회수 하한(이상). default 100_000 (viewtrap 강의 기준 10만+). */
  minViews?: number;
  /**
   * viewtrap 등급 기준(예: ['굳', '그레이트']) — 강의 기준 기록용 옵션 입력.
   * YouTube 프록시 단계에선 등급 데이터가 없어 필터엔 적용되지 않고 결과에 echo만 된다.
   */
  grades?: string[];
  /** 테스트 주입용 현재 시각(ms). default Date.now. */
  now?: () => number;
}

export interface HotVideoCandidatesResult {
  candidates: HotVideoCandidate[];
  /** 검색에 사용한 publishedAfter (RFC3339). */
  published_after: string;
  /** 데이터 출처 주석 — viewtrap 자동화 전 임시 프록시임을 명시. */
  provenance: string;
  /** 입력으로 받은 viewtrap 등급 기준(미적용, 기록용). */
  grade_criteria?: string[];
}

/**
 * 핫비디오 후보 수집: 최근 publishedWithinDays일 내 + 조회수 minViews 이상,
 * 구독자 적은 순(작은 채널의 초과성과 우선, 구독자 미상은 뒤로) 정렬 상위 maxResults.
 */
export async function collectHotVideoCandidates(
  opts: CollectHotVideoCandidatesOptions,
  client: HotVideoClient,
): Promise<HotVideoCandidatesResult> {
  const maxResults = opts.maxResults ?? 15;
  const publishedWithinDays = opts.publishedWithinDays ?? 14;
  const minViews = opts.minViews ?? 100_000;
  const now = opts.now ?? Date.now;

  const publishedAfter = new Date(now() - publishedWithinDays * 86_400_000).toISOString();

  // minViews 필터 탈락분을 감안해 넉넉히 검색(search.list 1페이지 상한 50).
  const searchSize = Math.min(50, Math.max(maxResults * 3, maxResults));
  const searched = await client.searchVideos(opts.query, {
    maxResults: searchSize,
    order: 'viewCount',
    publishedAfter,
  });

  const base = {
    published_after: publishedAfter,
    provenance: HOT_VIDEO_PROVENANCE,
    ...(opts.grades?.length ? { grade_criteria: opts.grades } : {}),
  };
  if (searched.length === 0) return { candidates: [], ...base };

  const byId = new Map(searched.map((s) => [s.videoId, s]));
  const stats = await client.getVideoStats(searched.map((s) => s.videoId));
  const hot = stats.filter((s) => s.viewCount >= minViews);
  if (hot.length === 0) return { candidates: [], ...base };

  // 채널 구독자 조회(50개 청크는 getChannelStats가 처리) → 구독자 적은 순 정렬용.
  const channelStats = await client.getChannelStats(hot.map((s) => s.channelId));
  const subsByChannel = new Map(
    channelStats.map((c) => [c.channelId, c.subscriberCount] as const),
  );

  const candidates = hot
    .map((s) => {
      const found = byId.get(s.videoId);
      const subs = subsByChannel.get(s.channelId);
      return {
        video_id: s.videoId,
        title: s.title || found?.title || '',
        view_count: s.viewCount,
        ...(subs != null ? { subscriber_count: subs } : {}),
        published_at: found?.publishedAt ?? '',
        thumbnail_url: pickBestThumbnailUrl(found?.thumbnails),
      };
    })
    .sort((a, b) => {
      // 구독자 적은 순(미상은 맨 뒤), 동률이면 조회수 많은 순.
      const sa = a.subscriber_count ?? Number.POSITIVE_INFINITY;
      const sb = b.subscriber_count ?? Number.POSITIVE_INFINITY;
      if (sa !== sb) return sa - sb;
      return b.view_count - a.view_count;
    })
    .slice(0, maxResults);

  return { candidates, ...base };
}
