// Shared inline fixtures for research-engine tests. Factory style matches the
// rest of l5-core (makeX(over: Partial<X> = {})). Deterministic, no network.

import type { LLMClient } from '../../ceo-orchestration/types';
import type {
  CandidateVideo,
  KnowledgeAtom,
  RankedCandidate,
  ResolvedResearchRequest,
  Transcript,
  TranscriptChunk,
  TranscriptSegment,
} from '../types';

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export function makeRequest(over: Partial<ResolvedResearchRequest> = {}): ResolvedResearchRequest {
  return {
    topic: '유튜브 콘텐츠 전략',
    researchPurpose: 'LEARNING',
    researchQuestion: null,
    targetAudience: null,
    markets: ['KR', 'US'],
    outputLanguage: 'ko',
    requiredVideoCount: 15,
    minimumViewCount: 50_000,
    minimumDurationSeconds: 240,
    maxPerChannel: 2,
    candidateTarget: 100,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

let candSeq = 0;
export function makeCandidate(over: Partial<CandidateVideo> = {}): CandidateVideo {
  candSeq += 1;
  return {
    videoId: `vid${candSeq}`,
    title: `콘텐츠 전략 강의 ${candSeq}`,
    description: '유튜브 채널 성장 방법',
    channelId: `ch${candSeq}`,
    channelTitle: `채널 ${candSeq}`,
    publishedAt: '2025-06-01T00:00:00Z',
    liveBroadcastContent: 'none',
    viewCount: 100_000,
    durationSeconds: 600,
    channelCountry: 'KR',
    subscriberCount: 50_000,
    ...over,
  };
}

export function makeRanked(over: Partial<RankedCandidate> = {}, candOver: Partial<CandidateVideo> = {}): RankedCandidate {
  return {
    video: makeCandidate(candOver),
    market: 'KR',
    rankScore: 0.5,
    scoreParts: { relevance: 0.5, recency: 0.5, views: 0.5, subscribers: 0.5 },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

let atomSeq = 0;
export function makeAtom(over: Partial<KnowledgeAtom> = {}): KnowledgeAtom {
  atomSeq += 1;
  return {
    claimId: `run-r1-vid1-${atomSeq}`,
    claim: '섬네일이 조회수를 결정한다',
    claimType: 'causal_claim',
    explanation: '',
    evidence: '섬네일 클릭률이 높으면 노출이 늘어난다',
    videoId: 'vid1',
    channelId: 'ch1',
    startSeconds: 10,
    endSeconds: 20,
    sourceUrl: 'https://www.youtube.com/watch?v=vid1&t=10s',
    transcriptSource: 'manual',
    verificationStatus: 'UNVERIFIED',
    confidence: 0.8,
    market: 'KR',
    chunkIndex: 0,
    runId: 'r1',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Transcript builder (produces a spec-shaped, integrity-valid transcript)
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
export function toTimestamp(sec: number): string {
  const s = Math.floor(sec);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Build segments from raw texts. Each segment spans 5s. text join = full text. */
export function buildSegments(texts: string[], videoId: string): TranscriptSegment[] {
  return texts.map((text, index) => {
    const startSeconds = index * 5;
    const endSeconds = startSeconds + 5;
    return {
      index,
      startSeconds,
      endSeconds,
      startTimestamp: toTimestamp(startSeconds),
      endTimestamp: toTimestamp(endSeconds),
      text,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}&t=${startSeconds}s`,
    };
  });
}

/** Segment-boundary-preserving chunker (mimics the skill). */
export function chunkSegments(
  segments: TranscriptSegment[],
  targetChars: number,
  videoId: string,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let start = 0;
  let idx = 0;
  while (start < segments.length) {
    let end = start;
    let size = 0;
    while (end < segments.length) {
      size += segments[end].text.length;
      if (size >= targetChars && end > start) break;
      end += 1;
    }
    if (end >= segments.length) end = segments.length - 1;
    const range = segments.slice(start, end + 1);
    const text = range.map((s) => s.text).join('');
    chunks.push({
      index: idx,
      segmentStartIndex: start,
      segmentEndIndex: end,
      startTimestamp: range[0].startTimestamp,
      endTimestamp: range[range.length - 1].endTimestamp,
      text,
      charCount: text.length,
      sourceUrl: range[0].sourceUrl,
    });
    idx += 1;
    start = end + 1;
  }
  return chunks;
}

export interface BuildTranscriptOpts {
  videoId?: string;
  texts?: string[];
  chunkChars?: number;
  source?: 'manual' | 'auto';
  sha256?: string;
  languageCode?: string;
}

export function buildTranscript(opts: BuildTranscriptOpts = {}): Transcript {
  const videoId = opts.videoId ?? 'vid1';
  const texts = opts.texts ?? ['섬네일이 조회수를 결정한다. ', '제목도 클릭률에 영향을 준다. ', '업로드 주기가 중요하다. '];
  const chunkChars = opts.chunkChars ?? 7000;
  const segments = buildSegments(texts, videoId);
  const text = texts.join('');
  const chunks = chunkSegments(segments, chunkChars, videoId);
  return {
    videoId,
    available: true,
    text,
    segments,
    chunks,
    languageCode: opts.languageCode ?? 'ko',
    source: opts.source ?? 'manual',
    provenance: { provider: 'yt-dlp', captionType: opts.source ?? 'manual', fetchedAt: '2025-06-01T00:00:00Z' },
    charCount: text.length,
    wordCount: text.split(/\s+/).length,
    segmentCount: segments.length,
    chunkCount: chunks.length,
    sha256: opts.sha256 ?? `sha-${videoId}`,
    truncated: false,
  };
}

/** Generate N segments each `perSeg` chars long — for large-transcript tests. */
export function genLargeTexts(totalChars: number, perSeg = 200): string[] {
  const count = Math.ceil(totalChars / perSeg);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    // distinct, deterministic content per segment
    out.push(`세그먼트${i}: ` + '가나다라마바사아자차카타파하'.repeat(Math.ceil(perSeg / 14)).slice(0, perSeg) + ' ');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mock LLM
// ---------------------------------------------------------------------------

export type LlmHandler = (args: { system: string; user: string; trace_name?: string }) => string;

/**
 * Mock LLM routing by trace_name prefix. Any unmatched trace_name throws
 * (so callers must register what they use). Pass `{ throwAll: true }` to
 * simulate a fully unavailable model (exercises deterministic fallbacks).
 */
export function makeMockLLM(
  handlers: Record<string, LlmHandler>,
  opts: { throwAll?: boolean } = {},
): LLMClient {
  return {
    async complete(args) {
      if (opts.throwAll) throw new Error('llm unavailable');
      const trace = args.trace_name ?? '';
      for (const [prefix, handler] of Object.entries(handlers)) {
        if (trace.startsWith(prefix)) return handler(args);
      }
      throw new Error(`no mock handler for trace_name=${trace}`);
    },
  };
}
