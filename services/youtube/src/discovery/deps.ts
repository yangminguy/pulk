// CMO M1~M3 통합 — 실 어댑터 조립.
//
// l5-core runDiscoveryPipeline(input, deps)의 deps를 실제 @l5/youtube 클라이언트
// (+ 옵션 Viewtrap CDP 크롤러)로 만든다. classify(Sonnet 분류)는 주입받는다 —
// 이 패키지는 l5-core에 의존하지 않으므로(워크스페이스 경계 유지) caller가
// l5-core classifyDiscoveredVideos를 감싸 넘긴다.
//
// 순수성: 이 모듈은 조립만. I/O는 주입된 client/scraper에서만 발생.

import { YouTubeClient } from '../client.js';
import {
  type ViewtrapReferenceAdapter,
  type ExtensionMetricsAdapter,
} from '../viewtrap/adapter.js';

// ── l5-core DiscoveryPipelineDeps 미러 (구조적 동일) ─────────────────────────
// 원본: packages/l5-core/src/functions/video-room/discovery-pipeline.ts

export interface DiscoverySearchResultMirror {
  videoId: string;
  title: string;
  channelTitle: string;
}

export interface DiscoveryVideoStatsMirror {
  videoId: string;
  title?: string;
  channelTitle?: string;
  viewCount: number;
}

export interface DiscoveryScrapedMetricsMirror {
  videoId: string;
  contribution?: string;
  performance?: string;
  exposure?: string;
  publishedAge?: 'old' | 'recent';
}

export interface DiscoveredVideoMirror {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  metrics?: Record<string, string | number | undefined>;
}

/** l5-core ClassifyDiscoveredVideosResult 미러(부분 — pipeline이 읽는 필드). */
export interface ClassificationResultMirror {
  classifications: Array<{
    videoId: string;
    verdict: 'fit' | 'ambiguous' | 'unfit';
    reasons: string[];
    bridge_idea?: string;
    candidate_basis: boolean;
    source: 'llm' | 'fallback';
  }>;
  candidate_video_ids: string[];
  fallback_count: number;
  [key: string]: unknown;
}

/** runDiscoveryPipeline deps 미러. */
export interface LiveDiscoveryDeps {
  searchVideos(query: string): Promise<DiscoverySearchResultMirror[]>;
  getVideoStats(videoIds: string[]): Promise<DiscoveryVideoStatsMirror[]>;
  scrapeMetrics?(query: string, videoIds: string[]): Promise<DiscoveryScrapedMetricsMirror[]>;
  classify?(
    videos: DiscoveredVideoMirror[],
    mode: 'key' | 'pulling',
  ): Promise<ClassificationResultMirror>;
}

export interface CreateLiveDiscoveryDepsOptions {
  client: YouTubeClient;
  /** 검색 옵션(maxResults 등). 기본 maxResults=25. */
  searchMaxResults?: number;
  /**
   * 2단계: YouTube 검색결과 확장(deepWalk) per-video 지표 어댑터(옵션).
   * 주입되면 scrapeMetrics의 1차 소스가 된다 — 영상별 기여도/성과도/노출확률을
   * shadow DOM에서 추출해 videoId로 병합한다. 대부분의 거름은 여기서 일어난다.
   */
  extensionAdapter?: ExtensionMetricsAdapter;
  /**
   * 3단계: Viewtrap 사이트 테이블(+노출확률 버튼) 크롤러 어댑터(옵션).
   * 주입되면 extension에서 노출확률을 못 채운 영상의 exposure를 보강한다.
   * 주의: CDP 운전(로그인 크롬)이 전제 — 없으면 주입하지 않는다.
   */
  viewtrapAdapter?: ViewtrapReferenceAdapter;
  /**
   * Sonnet 분류 함수(주입). l5-core classifyDiscoveredVideos를 감싸 넘긴다.
   * 미주입 시 classify는 deps에 포함되지 않고, pipeline이 결정론 폴백(후보 0).
   */
  classify?: LiveDiscoveryDeps['classify'];
}

/**
 * Viewtrap 어댑터의 selection_reason 문자열에서 등급 키워드를 뽑아 지표로 환원한다.
 * 어댑터는 ReferenceCandidate[]만 주므로(영상별 등급 원본 없음), 같은 query로
 * 긁은 후보들의 selection_reason("Viewtrap 실측: ... 기여도 Good · 성과도 Great ...")을
 * videoId(url 끝)별로 파싱해 scrapeMetrics 형태로 돌려준다.
 */
function parseMetricsFromReason(reason: string): {
  contribution?: string;
  performance?: string;
  exposure?: string;
} {
  const grab = (label: string): string | undefined => {
    const m = reason.match(new RegExp(`${label}\\s+([A-Za-z가-힣-]+)`));
    const val = m?.[1]?.trim();
    return val && val !== '-' ? val : undefined;
  };
  return {
    contribution: grab('기여도'),
    performance: grab('성과도'),
    exposure: grab('노출확률'),
  };
}

function extractVideoIdFromUrl(url: string): string | null {
  const m = url.match(/[?&]v=([\w-]{11})/) ?? url.match(/youtu\.be\/([\w-]{11})/);
  return m?.[1] ?? null;
}

/**
 * 실 발굴 deps 조립. searchVideos/getVideoStats는 YouTubeClient에 위임.
 * scrapeMetrics는 viewtrapAdapter 있을 때만(없으면 키 자체를 빼서 단계 스킵).
 */
export function createLiveDiscoveryDeps(
  options: CreateLiveDiscoveryDepsOptions,
): LiveDiscoveryDeps {
  const { client, extensionAdapter, viewtrapAdapter, classify } = options;

  const deps: LiveDiscoveryDeps = {
    async searchVideos(query: string): Promise<DiscoverySearchResultMirror[]> {
      const results = await client.searchVideos(query, {
        maxResults: options.searchMaxResults ?? 25,
      });
      return results.map((r) => ({
        videoId: r.videoId,
        title: r.title,
        channelTitle: r.channelTitle,
      }));
    },
    async getVideoStats(videoIds: string[]): Promise<DiscoveryVideoStatsMirror[]> {
      if (videoIds.length === 0) return [];
      const stats = await client.getVideoStats(videoIds);
      return stats.map((s) => ({
        videoId: s.videoId,
        title: s.title,
        channelTitle: s.channelTitle,
        viewCount: s.viewCount,
      }));
    },
  };

  // scrapeMetrics: 2단계(extension deepWalk) 우선 + 3단계(viewtrap 사이트 노출확률) 보강.
  // 둘 중 하나라도 있으면 활성화한다(둘 다 없으면 키 자체를 빼서 단계 스킵).
  if (extensionAdapter || viewtrapAdapter) {
    deps.scrapeMetrics = async (
      query: string,
      videoIds: string[],
    ): Promise<DiscoveryScrapedMetricsMirror[]> => {
      const wanted = new Set(videoIds);
      // videoId → 부분 지표. extension(2단계)을 먼저 채우고 viewtrap(3단계) exposure로 보강.
      const merged = new Map<string, DiscoveryScrapedMetricsMirror>();

      // 2단계: 영상별 deepWalk 지표(기여도/성과도/노출확률).
      if (extensionAdapter) {
        const ext = await extensionAdapter.fetch(query);
        for (const row of ext) {
          if (!wanted.has(row.videoId)) continue;
          const m: DiscoveryScrapedMetricsMirror = { videoId: row.videoId };
          if (row.contribution !== null) m.contribution = row.contribution;
          if (row.performance !== null) m.performance = row.performance;
          if (row.exposure !== null) m.exposure = row.exposure;
          merged.set(row.videoId, m);
        }
      }

      // 3단계: viewtrap 사이트 테이블 + 노출확률 버튼 → exposure 보강(미채워진 것만).
      if (viewtrapAdapter) {
        const candidates = await viewtrapAdapter.fetch(query);
        for (const c of candidates) {
          const id = extractVideoIdFromUrl(c.url) ?? c.id.replace(/^viewtrap-/, '');
          if (!wanted.has(id)) continue;
          const parsed = parseMetricsFromReason(c.selection_reason ?? '');
          const existing = merged.get(id) ?? { videoId: id };
          if (existing.contribution === undefined && parsed.contribution !== undefined)
            existing.contribution = parsed.contribution;
          if (existing.performance === undefined && parsed.performance !== undefined)
            existing.performance = parsed.performance;
          // 노출확률은 3단계가 권위(버튼 클릭으로 로드) — extension이 비웠으면 채운다.
          if (existing.exposure === undefined && parsed.exposure !== undefined)
            existing.exposure = parsed.exposure;
          merged.set(id, existing);
        }
      }

      return [...merged.values()];
    };
  }

  if (classify) {
    deps.classify = classify;
  }

  return deps;
}
