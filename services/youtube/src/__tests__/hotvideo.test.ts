import { collectHotVideoCandidates, HOT_VIDEO_PROVENANCE } from '../hotvideo.js';
import { collectThumbnailReferences, pickBestThumbnailUrl } from '../thumbnail-reference.js';
import type { SearchResult, VideoStats, ChannelStats } from '../client.js';

const NOW = Date.parse('2026-06-11T00:00:00Z');

function searchResult(videoId: string, over: Partial<SearchResult> = {}): SearchResult {
  return {
    videoId,
    title: `title-${videoId}`,
    channelTitle: `channel-${videoId}`,
    publishedAt: '2026-06-01T00:00:00Z',
    thumbnails: {
      default: { url: `https://i.ytimg.com/vi/${videoId}/default.jpg` },
      high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` },
    },
    ...over,
  };
}

function videoStats(videoId: string, channelId: string, viewCount: number): VideoStats {
  return {
    videoId,
    title: `title-${videoId}`,
    channelTitle: `channel-${videoId}`,
    channelId,
    viewCount,
    likeCount: null,
    commentCount: null,
  };
}

function channelStats(channelId: string, subscriberCount: number | null): ChannelStats {
  return {
    channelId,
    channelTitle: `c-${channelId}`,
    subscriberCount,
    viewCount: 0,
    videoCount: 0,
    avgViewsPerVideo: 0,
  };
}

describe('collectHotVideoCandidates (핫비디오 후보 — viewtrap 프록시)', () => {
  function makeClient(args: {
    searched: SearchResult[];
    stats: VideoStats[];
    channels: ChannelStats[];
  }) {
    return {
      searchVideos: jest.fn(async () => args.searched),
      getVideoStats: jest.fn(async () => args.stats),
      getChannelStats: jest.fn(async () => args.channels),
    };
  }

  it('publishedAfter=now-14d·order=viewCount로 검색, minViews 필터, 구독자 적은 순 정렬', async () => {
    const client = makeClient({
      searched: [searchResult('big'), searchResult('small'), searchResult('cold'), searchResult('hidden')],
      stats: [
        videoStats('big', 'ch-big', 900_000), // 구독자 많음
        videoStats('small', 'ch-small', 150_000), // 구독자 적음 → 1순위
        videoStats('cold', 'ch-x', 99_999), // minViews 미달 → 제외
        videoStats('hidden', 'ch-hidden', 300_000), // 구독자 숨김 → 맨 뒤
      ],
      channels: [
        channelStats('ch-big', 1_000_000),
        channelStats('ch-small', 3_000),
        channelStats('ch-hidden', null),
      ],
    });

    const r = await collectHotVideoCandidates(
      { query: '미국주식', grades: ['굳', '그레이트'], now: () => NOW },
      client,
    );

    // 검색 파라미터: publishedAfter = now - 14d, order=viewCount
    expect(client.searchVideos).toHaveBeenCalledWith('미국주식', {
      maxResults: 45, // 15 * 3 over-fetch (필터 탈락 대비)
      order: 'viewCount',
      publishedAfter: '2026-05-28T00:00:00.000Z',
    });
    expect(client.getChannelStats).toHaveBeenCalledWith(['ch-big', 'ch-small', 'ch-hidden']);

    expect(r.candidates.map((c) => c.video_id)).toEqual(['small', 'big', 'hidden']);
    expect(r.candidates[0]).toEqual({
      video_id: 'small',
      title: 'title-small',
      view_count: 150_000,
      subscriber_count: 3_000,
      published_at: '2026-06-01T00:00:00Z',
      thumbnail_url: 'https://i.ytimg.com/vi/small/hqdefault.jpg', // maxres 없음 → high 폴백
    });
    expect(r.candidates[2].subscriber_count).toBeUndefined(); // 구독자 숨김
    expect(r.published_after).toBe('2026-05-28T00:00:00.000Z');
    expect(r.provenance).toBe(HOT_VIDEO_PROVENANCE);
    expect(r.provenance).toContain('viewtrap 핫비디오 메뉴 자동화 전 YouTube 최근 고성과 프록시');
    expect(r.grade_criteria).toEqual(['굳', '그레이트']); // 기록용 echo(필터 미적용)
  });

  it('구독자 동률이면 조회수 많은 순, maxResults로 절단', async () => {
    const client = makeClient({
      searched: [searchResult('a'), searchResult('b'), searchResult('c')],
      stats: [
        videoStats('a', 'ch1', 200_000),
        videoStats('b', 'ch2', 500_000),
        videoStats('c', 'ch3', 300_000),
      ],
      channels: [channelStats('ch1', 100), channelStats('ch2', 100), channelStats('ch3', 100)],
    });
    const r = await collectHotVideoCandidates({ query: 'q', maxResults: 2, now: () => NOW }, client);
    expect(r.candidates.map((c) => c.video_id)).toEqual(['b', 'c']); // 동률 → 조회수 desc, 2개로 절단
  });

  it('커스텀 publishedWithinDays/minViews 반영', async () => {
    const client = makeClient({
      searched: [searchResult('a')],
      stats: [videoStats('a', 'ch1', 60_000)],
      channels: [channelStats('ch1', 10)],
    });
    const r = await collectHotVideoCandidates(
      { query: 'q', publishedWithinDays: 7, minViews: 50_000, now: () => NOW },
      client,
    );
    expect(client.searchVideos).toHaveBeenCalledWith('q', expect.objectContaining({
      publishedAfter: '2026-06-04T00:00:00.000Z', // now - 7d
    }));
    expect(r.candidates).toHaveLength(1);
    expect(r.grade_criteria).toBeUndefined();
  });

  it('전부 minViews 미달이면 빈 후보 + provenance 유지(채널 조회 생략)', async () => {
    const client = makeClient({
      searched: [searchResult('a')],
      stats: [videoStats('a', 'ch1', 10)],
      channels: [],
    });
    const r = await collectHotVideoCandidates({ query: 'q', now: () => NOW }, client);
    expect(r.candidates).toEqual([]);
    expect(r.provenance).toBe(HOT_VIDEO_PROVENANCE);
    expect(client.getChannelStats).not.toHaveBeenCalled();
  });
});

describe('collectThumbnailReferences (썸네일 레퍼런스 — 고성과 구성 학습 소스)', () => {
  it('5만+ 필터, 조회수 내림차순, maxres→high 폴백', async () => {
    const client = {
      searchVideos: jest.fn(async () => [
        searchResult('hi', {
          thumbnails: {
            maxres: { url: 'https://i/hi/maxres.jpg' },
            high: { url: 'https://i/hi/hq.jpg' },
          },
        }),
        searchResult('mid'),
        searchResult('low'),
      ]),
      getVideoStats: jest.fn(async () => [
        videoStats('hi', 'ch1', 80_000),
        videoStats('mid', 'ch2', 120_000),
        videoStats('low', 'ch3', 49_999), // 5만 미달 → 제외
      ]),
    };

    const refs = await collectThumbnailReferences({ query: '재테크 강의' }, client);

    expect(client.searchVideos).toHaveBeenCalledWith('재테크 강의', {
      maxResults: 36, // 12 * 3 over-fetch
      order: 'viewCount',
    });
    expect(refs.map((r) => r.video_id)).toEqual(['mid', 'hi']); // 조회수 desc
    expect(refs[1]).toEqual({
      video_id: 'hi',
      title: 'title-hi',
      view_count: 80_000,
      thumbnail_url: 'https://i/hi/maxres.jpg', // maxres 우선
      channel_title: 'channel-hi',
      published_at: '2026-06-01T00:00:00Z',
    });
    expect(refs[0].thumbnail_url).toBe('https://i.ytimg.com/vi/mid/hqdefault.jpg'); // high 폴백
  });

  it('maxResults/minViews 커스텀 + 절단', async () => {
    const client = {
      searchVideos: jest.fn(async () => [searchResult('a'), searchResult('b'), searchResult('c')]),
      getVideoStats: jest.fn(async () => [
        videoStats('a', 'c1', 3_000),
        videoStats('b', 'c2', 2_000),
        videoStats('c', 'c3', 999), // minViews 미달
      ]),
    };
    const refs = await collectThumbnailReferences({ query: 'q', maxResults: 1, minViews: 1_000 }, client);
    expect(refs.map((r) => r.video_id)).toEqual(['a']);
  });

  it('검색 결과 없으면 stats 호출 없이 []', async () => {
    const client = {
      searchVideos: jest.fn(async () => []),
      getVideoStats: jest.fn(async () => []),
    };
    expect(await collectThumbnailReferences({ query: 'q' }, client)).toEqual([]);
    expect(client.getVideoStats).not.toHaveBeenCalled();
  });
});

describe('pickBestThumbnailUrl', () => {
  it('maxres → high → medium → default 순서, 없으면 빈 문자열', () => {
    expect(pickBestThumbnailUrl({ maxres: { url: 'm' }, high: { url: 'h' } })).toBe('m');
    expect(pickBestThumbnailUrl({ high: { url: 'h' }, default: { url: 'd' } })).toBe('h');
    expect(pickBestThumbnailUrl({ medium: { url: 'md' } })).toBe('md');
    expect(pickBestThumbnailUrl({ default: { url: 'd' } })).toBe('d');
    expect(pickBestThumbnailUrl({})).toBe('');
    expect(pickBestThumbnailUrl(undefined)).toBe('');
  });
});
