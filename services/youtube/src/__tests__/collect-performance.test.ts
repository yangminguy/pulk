import { YouTubeClient } from '../client.js';
import type { FetchLike } from '../token.js';
import type { YouTubeCredentials } from '../credentials.js';
import { collectVideoPerformance } from '../performance/collect.js';

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

const TOKEN_RESPONSE = { access_token: 'token-1', expires_in: 3600 };

function header(name: string) {
  return { name, columnType: name === 'video' ? 'DIMENSION' : 'METRIC', dataType: 'INTEGER' };
}

const VIDEO_REPORT = {
  columnHeaders: [
    header('video'),
    header('views'),
    header('estimatedMinutesWatched'),
    header('averageViewDuration'),
    header('averageViewPercentage'),
    header('subscribersGained'),
  ],
  rows: [
    ['vid-1', 1200, 180, 21, 35.4, 1],
    ['vid-2', 150, 30, 12, 18.2, 0],
  ],
};

const CHANNEL_REPORT = {
  columnHeaders: [
    header('views'),
    header('estimatedMinutesWatched'),
    header('averageViewDuration'),
    header('averageViewPercentage'),
    header('subscribersGained'),
  ],
  rows: [[1395, 225, 21, 30.1, 1]],
};

function makeFetch(handler: (url: string) => { ok: boolean; status: number; body: unknown }) {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        status: 200,
        json: async () => TOKEN_RESPONSE,
        text: async () => JSON.stringify(TOKEN_RESPONSE),
      };
    }
    urls.push(url);
    const res = handler(url);
    return {
      ok: res.ok,
      status: res.status,
      json: async () => res.body,
      text: async () => JSON.stringify(res.body),
    };
  };
  return { fetchImpl, urls };
}

describe('collectVideoPerformance', () => {
  const range = { startDate: '2026-05-13', endDate: '2026-06-10' };

  it('video 디멘전 성공 → scope=video + 영상별 records', async () => {
    const { fetchImpl, urls } = makeFetch(() => ({ ok: true, status: 200, body: VIDEO_REPORT }));
    const client = new YouTubeClient(CREDS, fetchImpl);

    const result = await collectVideoPerformance(client, range);
    expect(result.scope).toBe('video');
    expect(result.records).toHaveLength(2);
    expect(result.records[0].video).toBe('vid-1');
    expect(result.records[0].views).toBe(1200);
    expect(result.records[0].averageViewPercentage).toBe(35.4);
    expect(result.note).toBeUndefined();

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('dimensions=video');
    expect(urls[0]).toContain('sort=-views');
    expect(urls[0]).toContain('averageViewPercentage');
  });

  it('videoIds 지정 → filters=video==.. 적용', async () => {
    const { fetchImpl, urls } = makeFetch(() => ({ ok: true, status: 200, body: VIDEO_REPORT }));
    const client = new YouTubeClient(CREDS, fetchImpl);

    await collectVideoPerformance(client, { ...range, videoIds: ['vid-1', 'vid-2'] });
    expect(decodeURIComponent(urls[0])).toContain('filters=video==vid-1,vid-2');
  });

  it('전체 메트릭 400 → 핵심 메트릭 축소 재시도(scope=video + note)', async () => {
    const { fetchImpl } = makeFetch((url) =>
      url.includes('averageViewPercentage')
        ? { ok: false, status: 400, body: {} }
        : { ok: true, status: 200, body: VIDEO_REPORT },
    );
    const client = new YouTubeClient(CREDS, fetchImpl);

    const result = await collectVideoPerformance(client, range);
    expect(result.scope).toBe('video');
    expect(result.metrics).not.toContain('averageViewPercentage');
    expect(result.note).toContain('축소');
  });

  it('video 디멘전 전부 실패 → 채널 합계 폴백(scope=channel + note)', async () => {
    const { fetchImpl } = makeFetch((url) =>
      url.includes('dimensions=video')
        ? { ok: false, status: 400, body: {} }
        : { ok: true, status: 200, body: CHANNEL_REPORT },
    );
    const client = new YouTubeClient(CREDS, fetchImpl);

    const result = await collectVideoPerformance(client, range);
    expect(result.scope).toBe('channel');
    expect(result.records).toHaveLength(1);
    expect(result.records[0].views).toBe(1395);
    expect(result.note).toContain('채널 합계 폴백');
  });
});
