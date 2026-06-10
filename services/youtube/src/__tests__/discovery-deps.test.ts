// CMO M1~M3 — createLiveDiscoveryDeps scrapeMetrics 조립 단위테스트.
// CDP 없이 fake 어댑터로 2단계(extension)·3단계(viewtrap site) 병합을 검증한다.

import { createLiveDiscoveryDeps } from '../discovery/deps.js';
import type { ExtensionMetricsAdapter, ViewtrapReferenceAdapter } from '../viewtrap/adapter.js';
import type { ExtensionMetricsRow } from '../viewtrap/types.js';
import type { YouTubeClient } from '../client.js';

// searchVideos/getVideoStats는 본 테스트에서 직접 안 쓰므로 최소 stub.
const fakeClient = {
  searchVideos: async () => [],
  getVideoStats: async () => [],
} as unknown as YouTubeClient;

function extAdapter(rows: ExtensionMetricsRow[]): ExtensionMetricsAdapter {
  return { fetch: async () => rows };
}

function vtAdapter(
  candidates: Array<{ url: string; selection_reason: string }>,
): ViewtrapReferenceAdapter {
  return {
    fetch: async () =>
      candidates.map((c, i) => ({
        id: `viewtrap-${i}`,
        research_session_id: 's',
        title: 't',
        url: c.url,
        source: 'viewtrap' as const,
        consumer_stage: '욕구' as const,
        selected_for: 'key_content' as const,
        selection_reason: c.selection_reason,
      })),
  };
}

const ext = (
  videoId: string,
  contribution: ExtensionMetricsRow['contribution'],
  performance: ExtensionMetricsRow['performance'],
  exposure: ExtensionMetricsRow['exposure'],
): ExtensionMetricsRow => ({
  videoId,
  title: `t-${videoId}`,
  views: 100000,
  contribution,
  performance,
  exposure,
  url: `https://youtu.be/${videoId}`,
});

describe('createLiveDiscoveryDeps — scrapeMetrics 조립', () => {
  it('어댑터가 둘 다 없으면 scrapeMetrics 키 자체가 없다(단계 스킵)', () => {
    const deps = createLiveDiscoveryDeps({ client: fakeClient });
    expect(deps.scrapeMetrics).toBeUndefined();
  });

  it('2단계 extension만으로 영상별 지표를 채운다(요청 videoId만)', async () => {
    const deps = createLiveDiscoveryDeps({
      client: fakeClient,
      extensionAdapter: extAdapter([
        ext('AAA00000001', 'good', 'great', 'normal'),
        ext('BBB00000002', 'bad', 'bad', null),
        ext('ZZZ00000009', 'wow', 'wow', 'good'), // 요청 목록에 없음 → 제외
      ]),
    });
    expect(deps.scrapeMetrics).toBeDefined();
    const out = await deps.scrapeMetrics!('릴스', ['AAA00000001', 'BBB00000002']);
    const byId = new Map(out.map((m) => [m.videoId, m]));
    expect(byId.size).toBe(2);
    expect(byId.get('AAA00000001')).toMatchObject({
      contribution: 'good',
      performance: 'great',
      exposure: 'normal',
    });
    // BBB00000002는 exposure null → 키 미포함.
    expect(byId.get('BBB00000002')!.exposure).toBeUndefined();
    expect(byId.has('ZZZ00000009')).toBe(false);
  });

  it('3단계 viewtrap 사이트가 extension이 비운 exposure를 보강한다', async () => {
    const deps = createLiveDiscoveryDeps({
      client: fakeClient,
      // extension: 기여/성과는 채우되 노출확률은 비움(버튼 클릭 전).
      extensionAdapter: extAdapter([ext('AAA00000001', 'good', 'great', null)]),
      // viewtrap site: 노출확률 great 로드됨.
      viewtrapAdapter: vtAdapter([
        {
          url: 'https://youtu.be/AAA00000001',
          selection_reason: 'Viewtrap 실측: 조회수 100,000 · 기여도 good · 성과도 great · 노출확률 great',
        },
      ]),
    });
    const out = await deps.scrapeMetrics!('릴스', ['AAA00000001']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      videoId: 'AAA00000001',
      contribution: 'good',
      performance: 'great',
      exposure: 'great', // 3단계가 보강
    });
  });

  it('extension의 exposure가 이미 있으면 3단계가 덮어쓰지 않는다', async () => {
    const deps = createLiveDiscoveryDeps({
      client: fakeClient,
      extensionAdapter: extAdapter([ext('AAA00000001', 'good', 'great', 'normal')]),
      viewtrapAdapter: vtAdapter([
        {
          url: 'https://youtu.be/AAA00000001',
          selection_reason: 'Viewtrap 실측: 조회수 100,000 · 기여도 good · 성과도 great · 노출확률 great',
        },
      ]),
    });
    const out = await deps.scrapeMetrics!('릴스', ['AAA00000001']);
    expect(out[0].exposure).toBe('normal'); // extension 값 유지
  });

  it('viewtrap site 단독으로도 동작한다(extension 미주입)', async () => {
    const deps = createLiveDiscoveryDeps({
      client: fakeClient,
      viewtrapAdapter: vtAdapter([
        {
          url: 'https://youtu.be/CCC00000003',
          selection_reason: 'Viewtrap 실측: 조회수 99,999 · 기여도 great · 성과도 good · 노출확률 good',
        },
      ]),
    });
    const out = await deps.scrapeMetrics!('릴스', ['CCC00000003']);
    expect(out[0]).toMatchObject({
      videoId: 'CCC00000003',
      contribution: 'great',
      performance: 'good',
      exposure: 'good',
    });
  });
});
