import { YouTubeClient, type VideoStats } from '../client.js';
import { TokenManager, type FetchLike } from '../token.js';
import { filterByMinViews } from '../filters.js';
import type { YouTubeCredentials } from '../credentials.js';

const CREDS: YouTubeCredentials = {
  project_id: 'test-project',
  api_key: 'TEST_API_KEY',
  oauth: {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    refresh_token: 'test-refresh-token',
    token_uri: 'https://oauth2.googleapis.com/token',
    scopes: ['yt-analytics.readonly'],
  },
  channel: { title: 'test channel', owner: 'test@example.com' },
};

interface RecordedCall {
  url: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function makeFetch(handler: (url: string, init?: RecordedCall['init']) => unknown) {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const body = handler(url, init);
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { fetchImpl, calls };
}

describe('TokenManager', () => {
  const tokenResponse = (token: string) => ({ access_token: token, expires_in: 3600 });

  it('exchanges refresh_token and caches access_token until expiry', async () => {
    let nowMs = 1_000_000;
    let issued = 0;
    const { fetchImpl, calls } = makeFetch(() => {
      issued += 1;
      return tokenResponse(`token-${issued}`);
    });
    const tm = new TokenManager(CREDS, fetchImpl, () => nowMs);

    expect(await tm.getAccessToken()).toBe('token-1');
    expect(await tm.getAccessToken()).toBe('token-1'); // cached, no second POST
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[0].init?.method).toBe('POST');
    const body = calls[0].init?.body ?? '';
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=test-refresh-token');

    // Advance past expiry (3600s) → refreshes again
    nowMs += 3601 * 1000;
    expect(await tm.getAccessToken()).toBe('token-2');
    expect(calls).toHaveLength(2);
  });

  it('refreshes before expiry margin (within last 60s)', async () => {
    let nowMs = 0;
    let issued = 0;
    const { fetchImpl, calls } = makeFetch(() => {
      issued += 1;
      return tokenResponse(`token-${issued}`);
    });
    const tm = new TokenManager(CREDS, fetchImpl, () => nowMs);
    await tm.getAccessToken();
    nowMs = 3600 * 1000 - 30 * 1000; // 30s before expiry → inside margin
    expect(await tm.getAccessToken()).toBe('token-2');
    expect(calls).toHaveLength(2);
  });

  it('throws on non-ok refresh without echoing the body', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_grant' }),
      text: async () => 'secret-detail',
    });
    const tm = new TokenManager(CREDS, fetchImpl);
    await expect(tm.getAccessToken()).rejects.toThrow('HTTP 401');
  });
});

describe('YouTubeClient.searchVideos', () => {
  it('parses search.list items and sends API key', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({
      items: [
        {
          id: { videoId: 'abc123' },
          snippet: {
            title: '릴스 만드는 법',
            channelTitle: '채널A',
            publishedAt: '2026-01-01T00:00:00Z',
            thumbnails: { default: { url: 'https://i.ytimg.com/vi/abc123/default.jpg' } },
          },
        },
        { id: {}, snippet: { title: 'no-videoId — should be dropped' } },
      ],
    }));
    const client = new YouTubeClient(CREDS, fetchImpl);
    const results = await client.searchVideos('인스타그램 릴스 만드는 방법', { maxResults: 10 });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      videoId: 'abc123',
      title: '릴스 만드는 법',
      channelTitle: '채널A',
    });
    expect(results[0].thumbnails.default.url).toContain('abc123');

    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/youtube/v3/search');
    expect(url.searchParams.get('q')).toBe('인스타그램 릴스 만드는 방법');
    expect(url.searchParams.get('type')).toBe('video');
    expect(url.searchParams.get('maxResults')).toBe('10');
    expect(url.searchParams.get('key')).toBe('TEST_API_KEY');
  });
});

describe('YouTubeClient.getVideoStats', () => {
  it('chunks ids by 50 per request and parses viewCount as number', async () => {
    const { fetchImpl, calls } = makeFetch((url) => {
      const ids = new URL(url).searchParams.get('id')!.split(',');
      return {
        items: ids.map((id) => ({
          id,
          snippet: { title: `t-${id}`, channelTitle: 'c' },
          statistics: { viewCount: '57000', likeCount: '12' },
        })),
      };
    });
    const client = new YouTubeClient(CREDS, fetchImpl);
    const ids = Array.from({ length: 120 }, (_, i) => `v${i}`);
    const stats = await client.getVideoStats(ids);

    expect(calls).toHaveLength(3); // 50 + 50 + 20
    expect(new URL(calls[0].url).searchParams.get('id')!.split(',')).toHaveLength(50);
    expect(new URL(calls[2].url).searchParams.get('id')!.split(',')).toHaveLength(20);
    expect(stats).toHaveLength(120);
    expect(stats[0].viewCount).toBe(57000);
    expect(stats[0].likeCount).toBe(12);
    expect(stats[0].commentCount).toBeNull();
  });

  it('returns empty for empty id list without any request', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ items: [] }));
    const client = new YouTubeClient(CREDS, fetchImpl);
    expect(await client.getVideoStats([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('YouTubeClient.getChannelAnalytics', () => {
  it('sends Bearer token, builds params, and zips rows into records', async () => {
    const { fetchImpl, calls } = makeFetch((url) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        return { access_token: 'analytics-token', expires_in: 3600 };
      }
      return {
        columnHeaders: [
          { name: 'views', columnType: 'METRIC', dataType: 'INTEGER' },
          { name: 'impressions', columnType: 'METRIC', dataType: 'INTEGER' },
          { name: 'impressionClickThroughRate', columnType: 'METRIC', dataType: 'FLOAT' },
        ],
        rows: [[1395, 20000, 3.5]],
      };
    });
    const client = new YouTubeClient(CREDS, fetchImpl);
    const report = await client.getChannelAnalytics({
      startDate: '2026-05-13',
      endDate: '2026-06-10',
      metrics: ['views', 'impressions', 'impressionClickThroughRate'],
      dimensions: ['day'],
      filters: 'insightTrafficSourceType==YT_SEARCH',
    });

    // First call = token POST, second = analytics GET
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    const analyticsCall = calls[1];
    const url = new URL(analyticsCall.url);
    expect(url.origin + url.pathname).toBe('https://youtubeanalytics.googleapis.com/v2/reports');
    expect(url.searchParams.get('ids')).toBe('channel==MINE');
    expect(url.searchParams.get('metrics')).toBe('views,impressions,impressionClickThroughRate');
    expect(url.searchParams.get('dimensions')).toBe('day');
    expect(url.searchParams.get('filters')).toBe('insightTrafficSourceType==YT_SEARCH');
    expect(analyticsCall.init?.headers?.Authorization).toBe('Bearer analytics-token');

    expect(report.rows).toEqual([[1395, 20000, 3.5]]);
    expect(report.records[0]).toEqual({
      views: 1395,
      impressions: 20000,
      impressionClickThroughRate: 3.5,
    });
  });

  it('reuses cached token across multiple analytics calls', async () => {
    let tokenPosts = 0;
    const { fetchImpl } = makeFetch((url) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        tokenPosts += 1;
        return { access_token: 'tok', expires_in: 3600 };
      }
      return { columnHeaders: [], rows: [] };
    });
    const client = new YouTubeClient(CREDS, fetchImpl);
    const opts = { startDate: '2026-06-01', endDate: '2026-06-10', metrics: ['views'] };
    await client.getChannelAnalytics(opts);
    await client.getChannelAnalytics(opts);
    expect(tokenPosts).toBe(1);
  });
});

describe('filterByMinViews', () => {
  const stat = (videoId: string, viewCount: number): VideoStats => ({
    videoId,
    title: videoId,
    channelTitle: 'c',
    viewCount,
    likeCount: null,
    commentCount: null,
  });

  it('keeps videos with 50k+ views by default (boundary inclusive)', () => {
    const stats = [stat('a', 49_999), stat('b', 50_000), stat('c', 270_000)];
    expect(filterByMinViews(stats).map((s) => s.videoId)).toEqual(['b', 'c']);
  });

  it('accepts a custom threshold', () => {
    const stats = [stat('a', 100), stat('b', 1000)];
    expect(filterByMinViews(stats, 500).map((s) => s.videoId)).toEqual(['b']);
  });
});
