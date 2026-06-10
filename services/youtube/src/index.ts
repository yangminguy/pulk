export { loadCredentials, defaultCredentialsPath, type YouTubeCredentials } from './credentials.js';
export { TokenManager, type FetchLike } from './token.js';
export {
  YouTubeClient,
  type SearchResult,
  type SearchOptions,
  type VideoStats,
  type ChannelAnalyticsOptions,
  type ChannelAnalyticsReport,
} from './client.js';
export { filterByMinViews, MIN_VIEWS_DEFAULT } from './filters.js';
export {
  collectVideoPerformance,
  type CollectVideoPerformanceOptions,
  type VideoPerformanceCollection,
} from './performance/collect.js';

// ── CMO M1 — Viewtrap CDP 크롤링 ─────────────────────────────────────────────
export {
  type ViewtrapGrade,
  GRADE_RANK,
  type VideoSearchRow,
  type ExtensionMetricsRow,
  type RawTableRow,
  type RawExtensionCard,
} from './viewtrap/types.js';
export {
  normalizeGrade,
  parseViews,
  extractVideoId,
  parseVideoSearchRow,
  parseVideoSearchRows,
  parseExtensionCard,
  parseExtensionCards,
} from './viewtrap/parse.js';
export {
  passesDiscoveryFilter,
  filterDiscoveryRows,
  DISCOVERY_MIN_VIEWS,
  type ViewtrapMetricsLike,
  type DiscoveryFilterOptions,
} from './viewtrap/filters.js';
export {
  toReferenceCandidates,
  toViewtrapValidationInput,
  toValidationScore,
  type ViewtrapReferenceCandidate,
  type ViewtrapValidationInput,
  type ViewtrapScrapedRow,
  type ViewtrapConsumerStage,
  type ViewtrapSelectedFor,
  type ToReferenceCandidatesOptions,
  type ToViewtrapValidationOptions,
} from './viewtrap/transform.js';
export {
  connectCdp,
  scrapeVideoSearchTable,
  clickExposureProbability,
  scrapeYoutubeSearchExtension,
  DEFAULT_CDP_ENDPOINT,
  type CdpSession,
  type CdpBrowser,
  type CdpContext,
  type CdpPage,
  type ConnectCdpOptions,
  type ScrapeVideoSearchOptions,
  type ExposureClickOptions,
  type ScrapeYoutubeExtensionOptions,
} from './viewtrap/cdp.js';
export {
  createViewtrapScraperAdapter,
  type ViewtrapReferenceAdapter,
  type CreateViewtrapScraperAdapterOptions,
} from './viewtrap/adapter.js';
