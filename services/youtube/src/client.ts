import type { YouTubeCredentials } from './credentials.js';
import { TokenManager, type FetchLike } from './token.js';

const DATA_API = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports';
const STATS_CHUNK_SIZE = 50; // videos.list id limit per request

// ---- Result types ----

export interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnails: Record<string, { url: string; width?: number; height?: number }>;
}

export interface VideoStats {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  likeCount: number | null;
  commentCount: number | null;
}

export interface SearchOptions {
  maxResults?: number; // default 25
  order?: 'relevance' | 'viewCount' | 'date' | 'rating';
  regionCode?: string;
  relevanceLanguage?: string;
}

export interface VideoDuration {
  videoId: string;
  durationSeconds: number;
  isShort: boolean;
  publishedAt: string;
}

/** ISO-8601 duration (PT#H#M#S) → seconds. Returns 0 on unparseable. */
export function parseIsoDuration(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h ?? 0) * 3600) + (Number(min ?? 0) * 60) + Number(s ?? 0);
}

export interface ChannelAnalyticsOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  metrics: string[]; // e.g. ['views','impressions','impressionClickThroughRate']
  dimensions?: string[]; // e.g. ['insightTrafficSourceType']
  filters?: string; // e.g. 'insightTrafficSourceType==YT_SEARCH'
  ids?: string; // default 'channel==MINE'
  sort?: string;
  maxResults?: number;
}

export interface ChannelAnalyticsReport {
  columnHeaders: { name: string; columnType: string; dataType: string }[];
  rows: (string | number)[][];
  /** rows zipped with columnHeaders into objects, for convenience */
  records: Record<string, string | number>[];
}

// ---- Raw API response shapes (subset) ----

interface RawSearchResponse {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url: string; width?: number; height?: number }>;
    };
  }[];
}

interface RawVideosResponse {
  items?: {
    id?: string;
    snippet?: { title?: string; channelTitle?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  }[];
}

interface RawDurationsResponse {
  items?: {
    id?: string;
    snippet?: { publishedAt?: string };
    contentDetails?: { duration?: string };
  }[];
}

interface RawCommentThreadsResponse {
  items?: {
    snippet?: {
      topLevelComment?: { snippet?: { textDisplay?: string } };
    };
  }[];
}

interface RawAnalyticsResponse {
  columnHeaders?: { name: string; columnType: string; dataType: string }[];
  rows?: (string | number)[][];
}

// ---- Client ----

export class YouTubeClient {
  private readonly tokens: TokenManager;

  constructor(
    private readonly creds: YouTubeCredentials,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    now: () => number = Date.now,
  ) {
    this.tokens = new TokenManager(creds, fetchImpl, now);
  }

  /** search.list (API key) — discovery. Full-sentence queries are fine. */
  async searchVideos(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: String(opts.maxResults ?? 25),
      key: this.creds.api_key,
    });
    if (opts.order) params.set('order', opts.order);
    if (opts.regionCode) params.set('regionCode', opts.regionCode);
    if (opts.relevanceLanguage) params.set('relevanceLanguage', opts.relevanceLanguage);

    const data = (await this.getJson(`${DATA_API}/search?${params}`)) as RawSearchResponse;
    return (data.items ?? [])
      .filter((item) => item.id?.videoId)
      .map((item) => ({
        videoId: item.id!.videoId!,
        title: item.snippet?.title ?? '',
        channelTitle: item.snippet?.channelTitle ?? '',
        publishedAt: item.snippet?.publishedAt ?? '',
        thumbnails: item.snippet?.thumbnails ?? {},
      }));
  }

  /** videos.list (API key) — statistics for up to N ids, chunked by 50. */
  async getVideoStats(videoIds: string[]): Promise<VideoStats[]> {
    const results: VideoStats[] = [];
    for (let i = 0; i < videoIds.length; i += STATS_CHUNK_SIZE) {
      const chunk = videoIds.slice(i, i + STATS_CHUNK_SIZE);
      if (chunk.length === 0) continue;
      const params = new URLSearchParams({
        part: 'statistics,snippet',
        id: chunk.join(','),
        key: this.creds.api_key,
      });
      const data = (await this.getJson(`${DATA_API}/videos?${params}`)) as RawVideosResponse;
      for (const item of data.items ?? []) {
        if (!item.id) continue;
        results.push({
          videoId: item.id,
          title: item.snippet?.title ?? '',
          channelTitle: item.snippet?.channelTitle ?? '',
          viewCount: Number(item.statistics?.viewCount ?? 0),
          likeCount: item.statistics?.likeCount != null ? Number(item.statistics.likeCount) : null,
          commentCount: item.statistics?.commentCount != null ? Number(item.statistics.commentCount) : null,
        });
      }
    }
    return results;
  }

  /**
   * videos.list (API key) — contentDetails.duration + publishedAt for up to N ids.
   * 롱폼/쇼츠 판별·최근성 산출용. 60초 이하를 쇼츠로 본다(isShort).
   */
  async getVideoDurations(videoIds: string[]): Promise<VideoDuration[]> {
    const results: VideoDuration[] = [];
    for (let i = 0; i < videoIds.length; i += STATS_CHUNK_SIZE) {
      const chunk = videoIds.slice(i, i + STATS_CHUNK_SIZE);
      if (chunk.length === 0) continue;
      const params = new URLSearchParams({
        part: 'contentDetails,snippet',
        id: chunk.join(','),
        key: this.creds.api_key,
      });
      const data = (await this.getJson(`${DATA_API}/videos?${params}`)) as RawDurationsResponse;
      for (const item of data.items ?? []) {
        if (!item.id) continue;
        const seconds = parseIsoDuration(item.contentDetails?.duration ?? '');
        results.push({
          videoId: item.id,
          durationSeconds: seconds,
          isShort: seconds > 0 && seconds <= 60,
          publishedAt: item.snippet?.publishedAt ?? '',
        });
      }
    }
    return results;
  }

  /**
   * commentThreads.list (API key) — 영상의 인기순(relevance) 상위 댓글 평문.
   * 시청자 정체성 판단 근거용. 댓글 비활성/오류는 throw하지 않고 [] 반환(graceful).
   */
  async getTopComments(videoId: string, maxResults = 8): Promise<string[]> {
    const params = new URLSearchParams({
      part: 'snippet',
      videoId,
      order: 'relevance',
      maxResults: String(maxResults),
      textFormat: 'plainText',
      key: this.creds.api_key,
    });
    try {
      const data = (await this.getJson(`${DATA_API}/commentThreads?${params}`)) as RawCommentThreadsResponse;
      return (data.items ?? [])
        .map((it) => it.snippet?.topLevelComment?.snippet?.textDisplay?.trim() ?? '')
        .filter((t) => t.length > 0);
    } catch {
      // 댓글 비활성(403 commentsDisabled) 등 — 정체성 판단은 메타데이터로 폴백.
      return [];
    }
  }

  /** Analytics v2 reports (OAuth Bearer) — private channel metrics incl. impressions/CTR. */
  async getChannelAnalytics(opts: ChannelAnalyticsOptions): Promise<ChannelAnalyticsReport> {
    const params = new URLSearchParams({
      ids: opts.ids ?? 'channel==MINE',
      startDate: opts.startDate,
      endDate: opts.endDate,
      metrics: opts.metrics.join(','),
    });
    if (opts.dimensions?.length) params.set('dimensions', opts.dimensions.join(','));
    if (opts.filters) params.set('filters', opts.filters);
    if (opts.sort) params.set('sort', opts.sort);
    if (opts.maxResults != null) params.set('maxResults', String(opts.maxResults));

    const accessToken = await this.tokens.getAccessToken();
    const data = (await this.getJson(`${ANALYTICS_API}?${params}`, {
      Authorization: `Bearer ${accessToken}`,
    })) as RawAnalyticsResponse;

    const columnHeaders = data.columnHeaders ?? [];
    const rows = data.rows ?? [];
    const records = rows.map((row) => {
      const record: Record<string, string | number> = {};
      columnHeaders.forEach((header, idx) => {
        record[header.name] = row[idx];
      });
      return record;
    });
    return { columnHeaders, rows, records };
  }

  private async getJson(url: string, headers?: Record<string, string>): Promise<unknown> {
    const res = await this.fetchImpl(url, headers ? { headers } : undefined);
    if (!res.ok) {
      // Strip query string from error: it contains the API key.
      const endpoint = url.split('?')[0];
      throw new Error(`YouTube API request failed: HTTP ${res.status} for ${endpoint}`);
    }
    return res.json();
  }
}
