// research-engine — data contracts (RESEARCH_ENGINE_SPEC §3, §5, §6 type shapes).
//
// Pure types + a few strict-JSON parsing primitives shared by the LLM-backed
// modules (query-expansion / atom-extraction / synthesis / verification).
// NO fs / child_process / fetch / NocoBase here — every side effect goes through
// ports.ts. This module is dependency-free except for the pure `extractJsonBlock`
// code-fence stripper reused from ../llm-json.

import { extractJsonBlock } from '../llm-json';

// ---------------------------------------------------------------------------
// Request (§3)
// ---------------------------------------------------------------------------

export type ResearchPurpose =
  | 'LEARNING'
  | 'TECHNICAL_RESEARCH'
  | 'CONTENT_PLANNING'
  | 'BUSINESS_RESEARCH'
  | 'DECISION_SUPPORT';

export type Market = 'KR' | 'US';
export type OutputLanguage = 'ko' | 'en';

export interface ResearchRequest {
  topic: string;
  researchPurpose: ResearchPurpose;
  researchQuestion?: string;
  targetAudience?: string;
  markets?: Market[]; // default ['KR','US']
  outputLanguage?: OutputLanguage; // default 'ko'
  requiredVideoCount?: number; // default 15
  minimumViewCount?: number; // default 50_000
  minimumDurationSeconds?: number; // default 240
  maxPerChannel?: number; // default 2
  candidateTarget?: number; // default 100
}

/** ResearchRequest with all defaults resolved. Carried in RunState. */
export interface ResolvedResearchRequest {
  topic: string;
  researchPurpose: ResearchPurpose;
  researchQuestion: string | null;
  targetAudience: string | null;
  markets: Market[];
  outputLanguage: OutputLanguage;
  requiredVideoCount: number;
  minimumViewCount: number;
  minimumDurationSeconds: number;
  maxPerChannel: number;
  candidateTarget: number;
}

export const REQUEST_DEFAULTS = {
  markets: ['KR', 'US'] as Market[],
  outputLanguage: 'ko' as OutputLanguage,
  requiredVideoCount: 15,
  minimumViewCount: 50_000,
  minimumDurationSeconds: 240,
  maxPerChannel: 2,
  candidateTarget: 100,
} as const;

// ---------------------------------------------------------------------------
// Query expansion
// ---------------------------------------------------------------------------

export type QueryAngle =
  | 'core'
  | 'subquestion'
  | 'synonym'
  | 'methodology'
  | 'case_study'
  | 'failure'
  | 'counterargument'
  | 'trend';

export interface SearchQuery {
  q: string;
  lang: OutputLanguage;
  market: Market;
  angle: QueryAngle;
}

// ---------------------------------------------------------------------------
// Candidates (COLLECT + SELECT)
// ---------------------------------------------------------------------------

export interface CandidateVideo {
  videoId: string;
  title: string;
  description?: string;
  channelId: string;
  channelTitle?: string;
  publishedAt?: string; // ISO
  liveBroadcastContent?: string; // 'none' | 'live' | 'upcoming'
  // stats (enriched by COLLECT)
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  durationSeconds?: number;
  isShort?: boolean;
  captionsAvailable?: boolean;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  tags?: string[];
  // channel (enriched by COLLECT)
  channelCountry?: string;
  subscriberCount?: number;
  /** search queries whose tokens this candidate matched (for relevance scoring). */
  matchedQueryTokens?: string[];
}

/** A candidate after market classification + deterministic ranking. */
export interface RankedCandidate {
  video: CandidateVideo;
  market: Market;
  rankScore: number;
  /** component breakdown, kept for transparency / debugging. */
  scoreParts: {
    relevance: number;
    recency: number;
    views: number;
    subscribers: number;
  };
}

export type RejectReason =
  | 'below_view_count'
  | 'below_duration'
  | 'live_or_upcoming'
  | 'duplicate_videoid'
  | 'reupload'
  | 'unknown_market';

export interface RejectedCandidate {
  videoId: string;
  reason: RejectReason;
}

export interface SelectionResult {
  /** ranked, channel-capped, market-balanced shortlist (requiredVideoCount + 10). */
  shortlist: RankedCandidate[];
  /** remaining ranked candidates, used to backfill when transcripts fail. */
  refillQueue: RankedCandidate[];
  rejected: RejectedCandidate[];
}

// ---------------------------------------------------------------------------
// Transcript (skill output schema — accepted verbatim, never re-cut)
// ---------------------------------------------------------------------------

export type TranscriptSource = 'manual' | 'auto';

export interface TranscriptSegment {
  index: number;
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string;
  endTimestamp: string;
  text: string;
  sourceUrl: string;
}

export interface TranscriptChunk {
  index: number;
  segmentStartIndex: number;
  segmentEndIndex: number;
  startTimestamp: string;
  endTimestamp: string;
  text: string;
  charCount: number;
  sourceUrl: string;
}

export interface TranscriptProvenance {
  provider: string;
  captionType: string;
  captionFile?: string;
  fetchedAt: string;
}

export interface Transcript {
  videoId: string;
  available: true;
  text: string;
  segments: TranscriptSegment[];
  chunks: TranscriptChunk[];
  languageCode: string;
  source: TranscriptSource;
  provenance?: TranscriptProvenance;
  charCount: number;
  wordCount?: number;
  segmentCount?: number;
  chunkCount?: number;
  sha256: string;
  truncated?: boolean;
}

export interface SkippedTranscript {
  videoId: string;
  available: false;
  skipped: true;
  note: string;
}

export type TranscriptResult = Transcript | SkippedTranscript;

export function isTranscriptAvailable(r: TranscriptResult): r is Transcript {
  return r.available === true;
}

/** Per-video metadata persisted alongside the raw transcript (§6 meta.json). */
export interface VideoMeta {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string | null;
  market: Market;
  viewCount: number | null;
  durationSeconds: number | null;
  channelCountry: string | null;
  subscriberCount: number | null;
  publishedAt: string | null;
}

// ---------------------------------------------------------------------------
// Knowledge Atom (§5.1)
// ---------------------------------------------------------------------------

export type ClaimType =
  | 'objective_fact'
  | 'causal_claim'
  | 'framework'
  | 'instruction'
  | 'case_study'
  | 'practitioner_heuristic'
  | 'opinion'
  | 'prediction';

export type VerificationStatus =
  | 'VERIFIED'
  | 'SUPPORTED'
  | 'PRACTITIONER_CONSENSUS'
  | 'CONTESTED'
  | 'ANECDOTAL'
  | 'UNVERIFIED'
  | 'TRANSCRIPT_AMBIGUOUS'
  | 'OUTDATED';

export interface KnowledgeAtom {
  claimId: string;
  claim: string;
  claimType: ClaimType;
  explanation: string;
  evidence: string;
  videoId: string;
  channelId: string;
  startSeconds: number;
  endSeconds: number;
  sourceUrl: string;
  transcriptSource: TranscriptSource;
  verificationStatus: VerificationStatus;
  confidence: number;
  market: Market;
  chunkIndex: number;
  runId: string;
}

// ---------------------------------------------------------------------------
// Synthesis (§5.2)
// ---------------------------------------------------------------------------

export type PrincipleKind =
  | 'common'
  | 'conflict'
  | 'conditional'
  | 'kr_us_diff'
  | 'old_vs_new'
  | 'unified_theory';

export type ClusterRelation = 'common' | 'conflict' | 'conditional' | 'independent';

/** LLM output: a cluster is just a labelled bag of atom ids + a relation hint. */
export interface AtomCluster {
  clusterId: string;
  label: string;
  atomIds: string[];
  relation: ClusterRelation;
}

export interface RepresentativeSource {
  videoId: string;
  startSeconds: number;
  sourceUrl: string;
  market: Market;
}

export interface SynthesizedPrinciple {
  id: string;
  statement: string;
  kind: PrincipleKind;
  /** distinct videoIds among the cluster's atoms. */
  mentionVideoCount: number;
  /** distinct channelIds among the cluster's atoms (same channel, 2 videos = 1). */
  independentChannelCount: number;
  representativeSources: RepresentativeSource[];
  evidenceQuality: 'strong' | 'moderate' | 'weak';
  counterClaims: string[];
  applicabilityConditions: string[];
  verificationStatus: VerificationStatus;
  atomIds: string[];
}

// ---------------------------------------------------------------------------
// Concept graph (§2 concept-graph — 8 relation types)
// ---------------------------------------------------------------------------

export type ConceptRelationType =
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'EXPLAINS'
  | 'EXAMPLE_OF'
  | 'REQUIRES'
  | 'PRECEDES'
  | 'SIMILAR_TO'
  | 'DERIVED_FROM';

export const CONCEPT_RELATION_TYPES: ConceptRelationType[] = [
  'SUPPORTS',
  'CONTRADICTS',
  'EXPLAINS',
  'EXAMPLE_OF',
  'REQUIRES',
  'PRECEDES',
  'SIMILAR_TO',
  'DERIVED_FROM',
];

export interface ConceptEdge {
  from: string;
  to: string;
  type: ConceptRelationType;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Docs verification (§4.7)
// ---------------------------------------------------------------------------

export interface DocsVerificationResult {
  claim: string;
  status: VerificationStatus;
  sourceUrl?: string;
  checkedVersion?: string;
  checkedAt?: string;
  conflict?: string;
}

// ---------------------------------------------------------------------------
// Report (§5.2 canonical SynthesisReport)
// ---------------------------------------------------------------------------

export interface KeyConcept {
  term: string;
  definition: string;
}

export interface MethodologySummary {
  candidateCount: number;
  analyzedCount: number;
  skippedNoTranscript: string[]; // videoIds
  refillUsed: number;
  marketBreakdown: Record<Market, number>;
  queriesUsed: number;
}

export interface VerificationSummary {
  byStatus: Partial<Record<VerificationStatus, number>>;
  notes: string[];
}

export interface ReportVideoSource {
  videoId: string;
  title: string;
  channelTitle: string;
  market: Market;
  viewCount: number | null;
  durationSeconds: number | null;
  transcriptSource: TranscriptSource;
  sourceUrl: string;
}

export interface LearningSection {
  prerequisites: string[];
  glossary: KeyConcept[];
  learningRoadmap: string[];
  exercises: string[];
  implementationPatterns: string[];
  commonMistakes: string[];
  docsVerification: DocsVerificationResult[];
}

export interface ContentPlanningSection {
  targetProblems: string[];
  coreMessages: string[];
  differentiators: string[];
  contentIdeas: string[];
  reusableClaims: RepresentativeSource[];
}

export interface BusinessSection {
  marketSignals: string[];
  opportunities: string[];
  risks: string[];
  recommendations: string[];
}

export interface DecisionSection {
  options: string[];
  tradeoffs: string[];
  recommendation: string;
  evidenceBasis: string[];
}

export interface SynthesisReport {
  runId: string;
  topic: string;
  researchPurpose: ResearchPurpose;
  researchQuestion: string | null;
  outputLanguage: OutputLanguage;
  generatedAt: string;
  executiveSummary: string[];
  methodology: MethodologySummary;
  keyConcepts: KeyConcept[];
  unifiedTheory: string | null;
  commonClaims: SynthesizedPrinciple[];
  conflictClaims: SynthesizedPrinciple[];
  krUsDifferences: SynthesizedPrinciple[];
  verification: VerificationSummary;
  videoSources: ReportVideoSource[];
  limitations: string[];
  furtherQuestions: string[];
  // purpose-specific (only one is populated per report, but all optional)
  learning?: LearningSection;
  contentPlanning?: ContentPlanningSection;
  business?: BusinessSection;
  decision?: DecisionSection;
}

// ---------------------------------------------------------------------------
// Book composer (§12-A — book-style deep manuscript)
// ---------------------------------------------------------------------------

/**
 * The 8 fixed skeleton chapter roles (§12-A). Carried on each chapter so WRITE
 * can enforce the actionable format on 'howto'/'apply' chapters and so the
 * purpose-specific emphasis (e.g. CONTENT_PLANNING → 'apply' = content-planning
 * worksheet) is deterministic. LLM outlines are tagged with one of these; a
 * missing/unknown tag is inferred by position.
 */
export type BookChapterKind =
  | 'overview' // ① 전체 개요
  | 'concepts' // ② 핵심 개념 (점진 심화)
  | 'methodology' // ③ 아키텍처/방법론
  | 'howto' // ④ 구체적 실행 방법 (단계별)
  | 'cases' // ⑤ 사례·실패담
  | 'conflicts' // ⑥ 충돌 지점과 판단 기준
  | 'apply' // ⑦ 실전 적용 가이드
  | 'glossary'; // ⑧ 용어집·출처

export const BOOK_CHAPTER_KINDS: BookChapterKind[] = [
  'overview',
  'concepts',
  'methodology',
  'howto',
  'cases',
  'conflicts',
  'apply',
  'glossary',
];

/** Chapters whose WRITE output must include numbered steps + a checklist. */
export const ACTIONABLE_CHAPTER_KINDS: BookChapterKind[] = ['howto', 'apply'];

export interface BookChapterSpec {
  chapterId: string;
  kind: BookChapterKind;
  title: string;
  goal: string;
  principleIds: string[];
  atomIds: string[];
}

export interface BookOutline {
  chapters: BookChapterSpec[];
}

/** A single sourced excerpt pulled from a transcript window around an atom. */
export interface ChapterExcerpt {
  atomId: string;
  videoId: string;
  videoTitle: string;
  startSeconds: number;
  timestamp: string; // mm:ss for the inline `[제목 (mm:ss)](url)` link
  sourceUrl: string;
  text: string;
}

// ---------------------------------------------------------------------------
// RunState (§5.3)
// ---------------------------------------------------------------------------

export type RunPhase =
  | 'EXPAND'
  | 'COLLECT'
  | 'SELECT'
  | 'TRANSCRIPT'
  | 'ANALYZE'
  | 'SYNTHESIZE'
  | 'VERIFY'
  | 'COMPOSE'
  | 'STORE'
  | 'PUBLISH'
  | 'DONE';

export const PHASE_ORDER: RunPhase[] = [
  'EXPAND',
  'COLLECT',
  'SELECT',
  'TRANSCRIPT',
  'ANALYZE',
  'SYNTHESIZE',
  'VERIFY',
  'COMPOSE',
  'STORE',
  'PUBLISH',
  'DONE',
];

export type SkipStatus = 'SKIPPED_NO_TRANSCRIPT' | 'SKIPPED_DUPLICATE';

export interface SkippedVideoRecord {
  videoId: string;
  status: SkipStatus;
}

export interface RunError {
  phase: RunPhase;
  message: string;
  at: string;
}

export interface RunState {
  runId: string;
  request: ResolvedResearchRequest;
  phase: RunPhase;
  queries: SearchQuery[];
  candidates: CandidateVideo[];
  selected: RankedCandidate[];
  skipped: SkippedVideoRecord[];
  transcriptsDone: string[]; // videoIds with a stored transcript
  atomsDone: string[]; // videoIds whose atoms were extracted
  startedAt: string;
  updatedAt: string;
  errors: RunError[];
  // carried artifacts (kept in state so resume can continue without re-derivation)
  refillQueue?: RankedCandidate[];
  atoms?: KnowledgeAtom[];
  principles?: SynthesizedPrinciple[];
  unifiedTheory?: string | null;
  graph?: ConceptEdge[];
  docsResults?: DocsVerificationResult[];
  report?: SynthesisReport | null;
  notionUrl?: string | null;
  // book composer (§12-A) — outline is small metadata (kept in state); chapter
  // prose is NOT (persisted to the store via saveBookChapter to avoid state bloat).
  bookOutline?: BookChapterSpec[];
  bookDone?: string[]; // chapterIds already written + persisted (resume skip)
  bookFailedChapters?: string[]; // chapters rendered via deterministic fallback
}

// ---------------------------------------------------------------------------
// Strict JSON parsing primitives (shared by LLM-backed parsers)
// ---------------------------------------------------------------------------

/** Thrown when an LLM response cannot be parsed/validated. Never swallowed
 * silently — callers decide whether to skip the item or fall back. */
export class ResearchParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchParseError';
  }
}

/** Strip code fences, extract the outermost {...}, JSON.parse, require an object.
 * Throws ResearchParseError on any malformed input. */
export function strictJsonObject(raw: string): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ResearchParseError('empty response');
  }
  const block = extractJsonBlock(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch (err) {
    throw new ResearchParseError(`invalid JSON: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ResearchParseError('expected a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/** Require `obj[field]` to be an array; throws otherwise. */
export function requireArray(obj: Record<string, unknown>, field: string): unknown[] {
  const v = obj[field];
  if (!Array.isArray(v)) {
    throw new ResearchParseError(`field "${field}" must be an array`);
  }
  return v;
}

/** Require a non-empty trimmed string; throws otherwise. */
export function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new ResearchParseError(`field "${field}" must be a non-empty string`);
  }
  return v.trim();
}

/** Coerce to a finite number (accepts numeric strings), else fallback. */
export function toFiniteNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
