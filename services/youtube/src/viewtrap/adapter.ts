// CMO M1 — 크롤링(CDP) → l5-core reference-adapters.ts 의 ReferenceSourceAdapter 주입 규약.
//
// l5-core createReferenceAdapter({ scraper }) 는 { fetch(query): Promise<ReferenceCandidate[]> }
// 모양의 어댑터를 받는다. 이 패키지는 l5-core 에 의존하지 않으므로(워크스페이스 의존 추가 금지),
// 구조적으로 동일한 ViewtrapReferenceCandidate[] 를 반환하는 어댑터를 만든다.
//
// 흐름: fetch(query) → scrapeVideoSearchTable → (옵션)clickExposureProbability →
//        filterDiscoveryRows → toReferenceCandidates.
// 순수성: 변환/필터는 순수함수. CDP I/O 는 주입된 session 으로만 발생.

import {
  scrapeVideoSearchTable,
  clickExposureProbability,
  scrapeYoutubeSearchExtension,
  type CdpSession,
  type ScrapeVideoSearchOptions,
  type ExposureClickOptions,
  type ScrapeYoutubeExtensionOptions,
} from './cdp.js';
import type { ExtensionMetricsRow } from './types.js';
import { filterDiscoveryRows, type DiscoveryFilterOptions } from './filters.js';
import {
  toReferenceCandidates,
  type ViewtrapReferenceCandidate,
  type ToReferenceCandidatesOptions,
} from './transform.js';

/** l5-core ReferenceSourceAdapter 미러 (구조적 동일 — fetch(query) → 후보[]). */
export interface ViewtrapReferenceAdapter {
  fetch(query: string): Promise<ViewtrapReferenceCandidate[]>;
}

export interface CreateViewtrapScraperAdapterOptions {
  /** 변환 메타(research_session_id·consumer_stage·selected_for). */
  transform: ToReferenceCandidatesOptions;
  /** 발굴 필터 옵션(기본 5만+ · good 이상 · 노출확률 미로드 통과). */
  filter?: DiscoveryFilterOptions;
  /** 검색 테이블 스크래핑 옵션. */
  scrape?: ScrapeVideoSearchOptions;
  /**
   * 노출확률 버튼을 클릭해 값을 채울지. 기본 false(테이블 1차 거름만).
   * true면 필터 전에 clickExposureProbability 로 다건 채운다.
   */
  resolveExposure?: boolean;
  /** resolveExposure=true 일 때 클릭 옵션. */
  exposureClick?: ExposureClickOptions;
}

/**
 * CDP 세션 기반 실 스크래퍼 어댑터.
 * createReferenceAdapter({ scraper: createViewtrapScraperAdapter(session, opts) }) 로 주입.
 *
 * 주의: session 은 connectCdp() 산출물이며 app.viewtrap.com 탭이 열려 있어야 한다
 * (cdp.ts 가 탭 부재 시 throw — 로그아웃 위험 때문에 새 탭/이동하지 않음).
 */
export function createViewtrapScraperAdapter(
  session: CdpSession,
  options: CreateViewtrapScraperAdapterOptions,
): ViewtrapReferenceAdapter {
  return {
    async fetch(query: string): Promise<ViewtrapReferenceCandidate[]> {
      let rows = await scrapeVideoSearchTable(session, query, options.scrape);
      if (options.resolveExposure) {
        rows = await clickExposureProbability(session, rows, options.exposureClick);
      }
      const passed = filterDiscoveryRows(rows, options.filter);
      return toReferenceCandidates(passed, options.transform);
    },
  };
}

// ── 2단계: YouTube 검색결과 확장(deepWalk) per-video 지표 어댑터 ───────────────

/** 영상별 Viewtrap 지표(기여도/성과도/노출확률) — deepWalk 산출(2단계). */
export interface ExtensionMetricsAdapter {
  /** query 검색결과에서 확장이 주입한 영상별 지표를 deepWalk로 추출. */
  fetch(query: string): Promise<ExtensionMetricsRow[]>;
}

/**
 * CDP 세션 기반 2단계 확장 스크래퍼. createLiveDiscoveryDeps가 영상별 지표 소스로 쓴다.
 * youtube.com 탭을 재사용/이동(안전 — 인메모리 인증은 app.viewtrap.com 탭에만 해당).
 */
export function createExtensionScraperAdapter(
  session: CdpSession,
  options: { scrape?: ScrapeYoutubeExtensionOptions } = {},
): ExtensionMetricsAdapter {
  return {
    async fetch(query: string): Promise<ExtensionMetricsRow[]> {
      return scrapeYoutubeSearchExtension(session, query, options.scrape);
    },
  };
}
