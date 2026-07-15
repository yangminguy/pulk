// research-engine — port interfaces (all I/O boundaries).
//
// Every side effect (YouTube API, transcript extraction, file store, embeddings,
// Notion, Slack, docs verification) is expressed as a port interface here. The
// domain modules and pipeline depend ONLY on these interfaces — the concrete
// adapters live in services/research-engine (WO-B). This keeps l5-core pure and
// unit-testable with in-memory mocks.
//
// IMPORTANT: there is deliberately NO Whisper/ASR/audio-transcription concept
// anywhere in these ports (or in types.ts). Transcript acquisition is
// caption-only (manual → auto fallback), exactly matching the youtube-research
// skill. A whisper port would be a type error to add — see §1 of the spec.

import type { LLMClient } from '../ceo-orchestration/types';
import type {
  ConceptEdge,
  DocsVerificationResult,
  KnowledgeAtom,
  Market,
  OutputLanguage,
  RunState,
  SynthesisReport,
  SynthesizedPrinciple,
  Transcript,
  TranscriptResult,
  VideoMeta,
} from './types';

// Re-export the shared LLM transport so WO-B imports it from one place.
export type { LLMClient };

// ---------------------------------------------------------------------------
// YouTube data port (search + stats + channel stats)
// ---------------------------------------------------------------------------

export interface SearchParams {
  q: string;
  market: Market;
  lang: OutputLanguage;
  max: number;
  order?: 'relevance' | 'viewCount' | 'date';
  publishedAfter?: string;
}

export interface YouTubeSearchHit {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  description: string;
  thumbnail?: string;
  liveBroadcastContent?: string;
}

export interface VideoStats {
  videoId: string;
  viewCount: number;
  likeCount?: number;
  commentCount?: number;
  durationSeconds: number;
  isShort?: boolean;
  captionsAvailable?: boolean;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  tags?: string[];
}

export interface ChannelStats {
  channelId: string;
  channelTitle?: string;
  country?: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
}

export interface YouTubePort {
  search(params: SearchParams): Promise<YouTubeSearchHit[]>;
  stats(videoIds: string[]): Promise<VideoStats[]>;
  channelStats(channelIds: string[]): Promise<ChannelStats[]>;
}

// ---------------------------------------------------------------------------
// Transcript port (caption-only; no ASR)
// ---------------------------------------------------------------------------

export interface TranscriptFetchOptions {
  langs?: OutputLanguage[];
  chunkChars?: number;
}

export interface TranscriptPort {
  fetchTranscript(videoId: string, opts?: TranscriptFetchOptions): Promise<TranscriptResult>;
}

// ---------------------------------------------------------------------------
// Second Brain file store (§6) — raw / atoms / graph / synthesis / state + dedup
// + top-principle brain-card push.
// ---------------------------------------------------------------------------

export interface SecondBrainStorePort {
  saveState(state: RunState): Promise<void>;
  loadState(runId: string): Promise<RunState | null>;

  /** true when a transcript with this sha256 is already stored (reupload dedup). */
  hasTranscriptSha(sha256: string): Promise<boolean>;
  /** persist raw transcript + meta. Returns deduped=true if sha already existed. */
  saveTranscript(transcript: Transcript, meta: VideoMeta): Promise<{ deduped: boolean }>;
  loadTranscript(videoId: string): Promise<Transcript | null>;

  saveAtoms(runId: string, atoms: KnowledgeAtom[]): Promise<void>;
  saveGraph(runId: string, edges: ConceptEdge[]): Promise<void>;
  saveSynthesis(runId: string, report: SynthesisReport): Promise<void>;
  /** persist rendered markdown; returns the stored path. */
  saveReportMarkdown(runId: string, markdown: string): Promise<string>;

  /** persist a single written book chapter (prose is kept out of RunState). */
  saveBookChapter(runId: string, chapterId: string, markdown: string): Promise<void>;
  /** load a previously written book chapter (resume / assembly). */
  loadBookChapter(runId: string, chapterId: string): Promise<string | null>;

  /** push top synthesized principles as Second Brain cards. graceful no-op ok. */
  pushPrincipleCards(input: {
    topic: string;
    notionUrl: string | null;
    principles: SynthesizedPrinciple[];
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Embeddings port (segment + atom vectors) — optional, graceful skip
// ---------------------------------------------------------------------------

export interface EmbeddingItem {
  /** stable id of the embedded thing (atom claimId, or `${videoId}:${chunkIndex}`). */
  refId: string;
  text: string;
  runId: string;
  videoId: string;
}

export interface EmbeddingPort {
  /** true when the backing venv/model is present; false → pipeline skips embed. */
  available(): boolean;
  embed(kind: 'segment' | 'atom', items: EmbeddingItem[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Notion publish port — optional
// ---------------------------------------------------------------------------

export interface NotionPublishInput {
  title: string;
  markdown: string;
}

export interface NotionPublishResult {
  url: string | null;
  skipped: boolean;
}

export interface NotionPublishPort {
  publishReport(input: NotionPublishInput): Promise<NotionPublishResult>;
}

// ---------------------------------------------------------------------------
// Slack notify port — optional (summary text only, no file upload — policy B)
// ---------------------------------------------------------------------------

export interface SlackNotifyInput {
  channel?: string;
  threadTs?: string;
  text: string;
}

export interface SlackNotifyPort {
  notify(input: SlackNotifyInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// Docs verify port — optional (official-docs cross-check for technical claims)
// ---------------------------------------------------------------------------

export interface DocsVerifyClaim {
  claim: string;
  hint?: string;
}

export interface DocsVerifyPort {
  verifyClaims(claims: DocsVerifyClaim[]): Promise<DocsVerificationResult[]>;
}

// ---------------------------------------------------------------------------
// Bundle injected into the pipeline.
// ---------------------------------------------------------------------------

export interface ResearchPorts {
  youtube: YouTubePort;
  transcript: TranscriptPort;
  llm: LLMClient;
  store: SecondBrainStorePort;
  embeddings?: EmbeddingPort;
  notion?: NotionPublishPort;
  slack?: SlackNotifyPort;
  docsVerify?: DocsVerifyPort;
}
