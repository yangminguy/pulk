export { loadCredentials, defaultCredentialsPath, type YouTubeCredentials } from './credentials.js';
export { TokenManager, type FetchLike } from './token.js';
export {
  YouTubeClient,
  parseIsoDuration,
  type SearchResult,
  type SearchOptions,
  type VideoStats,
  type VideoDuration,
  type ChannelAnalyticsOptions,
  type ChannelAnalyticsReport,
} from './client.js';
export {
  fetchTranscript,
  pickCaptionTrack,
  extractCaptionTracks,
  parseTimedTextXml,
  parseTimedTextJson3,
  type TranscriptResult,
  type FetchTranscriptOptions,
} from './transcript/fetch.js';
export { filterByMinViews, MIN_VIEWS_DEFAULT } from './filters.js';
export {
  collectVideoPerformance,
  type CollectVideoPerformanceOptions,
  type VideoPerformanceCollection,
} from './performance/collect.js';

// ── CMO M5 후속 — Reporting API 노출수·CTR 수집 ──────────────────────────────
export {
  ReportingClient,
  parseReachReport,
  REACH_REPORT_TYPE,
  type ReportingJob,
  type Report,
  type ListReportsOptions,
  type ReachReportRow,
  type ImpressionsCtrResult,
  type CollectImpressionsCtrOptions,
} from './reporting/client.js';

// ── 썸네일 9개 A/B(PRD cmo-thumbnail-ab-automation) — thumbnails.set + 기간 성과 ──
export {
  setVideoThumbnail,
  collectThumbnailPeriodMetrics,
  type SetVideoThumbnailParams,
  type SetVideoThumbnailDeps,
  type SetVideoThumbnailResult,
  type ThumbnailPeriodMetrics,
} from './thumbnail-ab.js';

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
  scrapeTranscriptViaCdp,
  DEFAULT_CDP_ENDPOINT,
  type CdpTranscriptResult,
  type ScrapeTranscriptOptions,
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
  createExtensionScraperAdapter,
  type ViewtrapReferenceAdapter,
  type ExtensionMetricsAdapter,
  type CreateViewtrapScraperAdapterOptions,
} from './viewtrap/adapter.js';

// ── CMO M1~M3 통합 — 실 발굴 deps 조립 ───────────────────────────────────────
export {
  createLiveDiscoveryDeps,
  type LiveDiscoveryDeps,
  type CreateLiveDiscoveryDepsOptions,
  type DiscoverySearchResultMirror,
  type DiscoveryVideoStatsMirror,
  type DiscoveryScrapedMetricsMirror,
  type DiscoveredVideoMirror,
  type ClassificationResultMirror,
} from './discovery/deps.js';
