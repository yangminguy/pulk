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
