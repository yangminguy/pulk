import { YouTubeClient } from '../client.js';
import type { FetchLike } from '../token.js';
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

function makeFetch(handler: (url: string) => unknown) {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const body = handler(url);
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { fetchImpl, calls };
}

describe('YouTubeClient.searchChannels (채널 우선 발굴)', () => {
  it('search.list type=channel 파싱 — channelId 없는 항목은 제외', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({
      items: [
        {
          id: { channelId: 'UC-1' },
          snippet: { title: '채널 하나', description: '재테크 강의 채널' },
        },
        { id: {}, snippet: { title: 'channelId 없음 — 제외' } },
        { id: { channelId: 'UC-2' }, snippet: { title: '채널 둘', description: '' } },
      ],
    }));
    const client = new YouTubeClient(CREDS, fetchImpl);
    const channels = await client.searchChannels('재테크', 5);

    expect(channels).toEqual([
      { channelId: 'UC-1', title: '채널 하나', description: '재테크 강의 채널' },
      { channelId: 'UC-2', title: '채널 둘', description: '' },
    ]);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/youtube/v3/search');
    expect(url.searchParams.get('type')).toBe('channel');
    expect(url.searchParams.get('q')).toBe('재테크');
    expect(url.searchParams.get('maxResults')).toBe('5');
    expect(url.searchParams.get('key')).toBe('TEST_API_KEY');
  });

  it('maxResults 기본값 10', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ items: [] }));
    const client = new YouTubeClient(CREDS, fetchImpl);
    await client.searchChannels('q');
    expect(new URL(calls[0].url).searchParams.get('maxResults')).toBe('10');
  });
});

describe('YouTubeClient.getChannelStats (구독자/조회수/영상 수)', () => {
  it('channels.list 파싱 + 중복 제거 + 50개 청크', async () => {
    const { fetchImpl, calls } = makeFetch((url) => {
      const ids = new URL(url).searchParams.get('id')!.split(',');
      return {
        items: ids.map((id) => ({
          id,
          snippet: { title: `c-${id}` },
          statistics: { subscriberCount: '1200', viewCount: '100000', videoCount: '50' },
        })),
      };
    });
    const client = new YouTubeClient(CREDS, fetchImpl);
    const ids = Array.from({ length: 60 }, (_, i) => `UC${i}`);
    const stats = await client.getChannelStats([...ids, 'UC0', '']); // 중복 + 빈값 제거 확인

    expect(calls).toHaveLength(2); // 50 + 10
    expect(new URL(calls[0].url).pathname).toBe('/youtube/v3/channels');
    expect(new URL(calls[0].url).searchParams.get('part')).toBe('statistics,snippet');
    expect(stats).toHaveLength(60);
    expect(stats[0]).toEqual({
      channelId: 'UC0',
      channelTitle: 'c-UC0',
      subscriberCount: 1200,
      viewCount: 100000,
      videoCount: 50,
      avgViewsPerVideo: 2000,
    });
  });

  it('subscriberCount 누락(숨김)이면 null', async () => {
    const { fetchImpl } = makeFetch(() => ({
      items: [{ id: 'UC-h', snippet: { title: 'hidden' }, statistics: { viewCount: '10', videoCount: '0' } }],
    }));
    const client = new YouTubeClient(CREDS, fetchImpl);
    const [s] = await client.getChannelStats(['UC-h']);
    expect(s.subscriberCount).toBeNull();
    expect(s.avgViewsPerVideo).toBe(0);
  });
});

describe('YouTubeClient.getChannelTopVideos (채널 상위 영상)', () => {
  it('search.list channelId+order=viewCount 파라미터와 파싱', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({
      items: [
        {
          id: { videoId: 'top-1' },
          snippet: {
            title: '베스트 영상',
            channelTitle: '채널A',
            publishedAt: '2026-01-01T00:00:00Z',
            thumbnails: { high: { url: 'https://i/top-1/hq.jpg' } },
          },
        },
      ],
    }));
    const client = new YouTubeClient(CREDS, fetchImpl);
    const videos = await client.getChannelTopVideos('UC-abc', 3);

    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/youtube/v3/search');
    expect(url.searchParams.get('channelId')).toBe('UC-abc');
    expect(url.searchParams.get('order')).toBe('viewCount');
    expect(url.searchParams.get('type')).toBe('video');
    expect(url.searchParams.get('maxResults')).toBe('3');
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ videoId: 'top-1', title: '베스트 영상' });
  });
});

describe('YouTubeClient.searchVideos publishedAfter (하위호환 확장)', () => {
  it('지정 시 쿼리에 포함, 미지정 시 미포함', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ items: [] }));
    const client = new YouTubeClient(CREDS, fetchImpl);
    await client.searchVideos('q', { publishedAfter: '2026-05-28T00:00:00Z' });
    await client.searchVideos('q');
    expect(new URL(calls[0].url).searchParams.get('publishedAfter')).toBe('2026-05-28T00:00:00Z');
    expect(new URL(calls[1].url).searchParams.get('publishedAfter')).toBeNull();
  });
});
