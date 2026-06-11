export { loadCredentials, defaultCredentialsPath, type YouTubeCredentials } from './credentials.js';
export { TokenManager, type FetchLike } from './token.js';
export {
  YouTubeClient,
  parseIsoDuration,
  type SearchResult,
  type SearchOptions,
  type ChannelSearchResult,
  type VideoStats,
  type ChannelStats,
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
  scrapeLoadedViewtrapExposure,
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

// ── 실제 업로드(videos.insert resumable) + 제목 교체(videos.update) ──────────
// ⚠️ D3+ 외부 액션 — 자동 호출 금지, Founder 승인⑥ 이후 오케스트레이터만 호출.
export {
  uploadVideo,
  updateVideoMetadata,
  type UploadFetchLike,
  type AccessTokenProvider,
  type PrivacyStatus,
  type UploadVideoParams,
  type UploadVideoResult,
  type UpdateVideoMetadataParams,
  type UpdateVideoMetadataResult,
} from './upload.js';

// ── 핫비디오 후보 수집(viewtrap 핫비디오 메뉴 자동화 전 YouTube 프록시) ──────
export {
  collectHotVideoCandidates,
  HOT_VIDEO_PROVENANCE,
  type HotVideoClient,
  type HotVideoCandidate,
  type CollectHotVideoCandidatesOptions,
  type HotVideoCandidatesResult,
} from './hotvideo.js';

// ── 썸네일 레퍼런스 수집(같은 카테고리 고성과 썸네일 — 분석은 l5-core) ───────
export {
  collectThumbnailReferences,
  pickBestThumbnailUrl,
  type ThumbnailReferenceClient,
  type ThumbnailReference,
  type CollectThumbnailReferencesOptions,
} from './thumbnail-reference.js';

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
