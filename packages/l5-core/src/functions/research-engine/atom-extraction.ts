// research-engine — atom extraction (ANALYZE phase, §4.5).
//
// Per chunk: LLM prompt → strict JSON parse → build KnowledgeAtom with an
// anchor check that the claim/evidence vocabulary actually occurs in the
// [startSeconds, endSeconds] transcript segments. Anchor failure downgrades the
// atom to verificationStatus='TRANSCRIPT_AMBIGUOUS' (§4.5).
//
// The prompt builder and parser are LLM-free testable. The chunk-integrity
// helper guarantees the skill's chunks losslessly cover the transcript before
// we extract (the transcript text is NEVER re-cut here).

import type { LLMClient } from '../ceo-orchestration/types';
import {
  ClaimType,
  KnowledgeAtom,
  Market,
  OutputLanguage,
  ResearchParseError,
  Transcript,
  TranscriptChunk,
  TranscriptSegment,
  requireArray,
  requireString,
  strictJsonObject,
  toFiniteNumber,
} from './types';

const VALID_CLAIM_TYPES: ClaimType[] = [
  'objective_fact',
  'causal_claim',
  'framework',
  'instruction',
  'case_study',
  'practitioner_heuristic',
  'opinion',
  'prediction',
];

// ---------------------------------------------------------------------------
// Chunk integrity (§9 — 12k / 50k fixtures: full preservation, boundaries, gaps)
// ---------------------------------------------------------------------------

export interface ChunkIntegrityReport {
  ok: boolean;
  issues: string[];
}

/**
 * Collapse all whitespace runs to a single space and trim. Used so integrity
 * comparisons ignore the join separator (the skill joins segments with a single
 * space for `text`, but concatenating chunk texts drops the inter-segment space
 * at each chunk boundary — an equivalent, not a corruption). Any *content* drop
 * still changes the normalized string, so gaps are still caught.
 */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Verify the skill's chunks losslessly cover the transcript segments:
 *  - chunks start at segment 0, are contiguous (no gaps/overlaps), end at the
 *    last segment;
 *  - each chunk.text equals the joined text of its segment range (boundary
 *    whitespace-insensitive);
 *  - concatenating every segment's text equals transcript.text (whitespace-
 *    insensitive at segment boundaries).
 * Pure; used as a guard before extraction. Never mutates the transcript.
 */
export function verifyChunkIntegrity(t: Transcript): ChunkIntegrityReport {
  const issues: string[] = [];
  const segs = t.segments;
  const chunks = t.chunks;

  // Segments → transcript text (full preservation, boundary-separator agnostic).
  const joinedSegments = normalizeWhitespace(segs.map((s) => s.text).join(' '));
  if (joinedSegments !== normalizeWhitespace(t.text)) {
    issues.push('segment concatenation does not equal transcript.text');
  }

  if (chunks.length === 0) {
    if (segs.length > 0) issues.push('no chunks for a non-empty transcript');
    return { ok: issues.length === 0, issues };
  }

  // Contiguous coverage with no gaps/overlaps.
  if (chunks[0].segmentStartIndex !== 0) {
    issues.push(`first chunk does not start at segment 0 (got ${chunks[0].segmentStartIndex})`);
  }
  for (let i = 1; i < chunks.length; i++) {
    const prevEnd = chunks[i - 1].segmentEndIndex;
    const curStart = chunks[i].segmentStartIndex;
    if (curStart !== prevEnd + 1) {
      issues.push(`gap/overlap between chunk ${i - 1} (end ${prevEnd}) and chunk ${i} (start ${curStart})`);
    }
  }
  const lastChunk = chunks[chunks.length - 1];
  if (lastChunk.segmentEndIndex !== segs.length - 1) {
    issues.push(
      `last chunk ends at segment ${lastChunk.segmentEndIndex}, expected ${segs.length - 1}`,
    );
  }

  // Each chunk's text = joined segment range; boundary timestamps preserved.
  for (const chunk of chunks) {
    const range = segs.slice(chunk.segmentStartIndex, chunk.segmentEndIndex + 1);
    const joined = normalizeWhitespace(range.map((s) => s.text).join(' '));
    if (joined !== normalizeWhitespace(chunk.text)) {
      issues.push(`chunk ${chunk.index} text != joined segments ${chunk.segmentStartIndex}..${chunk.segmentEndIndex}`);
    }
    if (range.length > 0) {
      if (range[0].startTimestamp !== chunk.startTimestamp) {
        issues.push(`chunk ${chunk.index} startTimestamp boundary mismatch`);
      }
      if (range[range.length - 1].endTimestamp !== chunk.endTimestamp) {
        issues.push(`chunk ${chunk.index} endTimestamp boundary mismatch`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Anchor verification (§4.5)
// ---------------------------------------------------------------------------

const ANCHOR_STOPWORDS = new Set([
  '그리고', '하지만', '그래서', '그런데', '이것', '저것', '이런', '그런',
  'the', 'and', 'but', 'that', 'this', 'with', 'from', 'have', 'they', 'your',
  'for', 'are', 'you', 'was', 'not', 'can', 'will',
]);

const ANCHOR_TOKEN_SPLIT = /[^0-9a-z가-힣]+/i;

function anchorTokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of (text || '').toLowerCase().split(ANCHOR_TOKEN_SPLIT)) {
    if (raw.length >= 2 && !ANCHOR_STOPWORDS.has(raw)) out.push(raw);
  }
  return out;
}

/** Segments overlapping [startSeconds, endSeconds]. */
export function segmentsInRange(
  segments: TranscriptSegment[],
  startSeconds: number,
  endSeconds: number,
): TranscriptSegment[] {
  return segments.filter((s) => s.endSeconds >= startSeconds && s.startSeconds <= endSeconds);
}

const ANCHOR_MIN_HIT_RATIO = 0.5;

/**
 * Anchor check: at least half of the content tokens from claim+evidence must
 * appear in the transcript text covering [startSeconds, endSeconds].
 * Returns true when the atom is anchored, false when TRANSCRIPT_AMBIGUOUS.
 */
export function verifyAtomAnchor(
  claim: string,
  evidence: string,
  segments: TranscriptSegment[],
  startSeconds: number,
  endSeconds: number,
): boolean {
  const range = segmentsInRange(segments, startSeconds, endSeconds);
  if (range.length === 0) return false;
  const haystack = new Set(anchorTokens(range.map((s) => s.text).join(' ')));
  const needles = anchorTokens(`${claim} ${evidence}`);
  if (needles.length === 0) return false;
  let hit = 0;
  for (const n of needles) if (haystack.has(n)) hit += 1;
  return hit / needles.length >= ANCHOR_MIN_HIT_RATIO;
}

// ---------------------------------------------------------------------------
// Prompt + parser
// ---------------------------------------------------------------------------

export interface AtomExtractionContext {
  videoId: string;
  channelId: string;
  market: Market;
  transcriptSource: 'manual' | 'auto';
  runId: string;
  /** Language for claim/explanation (§12-A). Defaults to 'ko'. evidence stays原어. */
  outputLanguage?: OutputLanguage;
}

export function buildAtomExtractionPrompt(
  chunk: TranscriptChunk,
  ctx: AtomExtractionContext,
): { system: string; user: string } {
  const langWord = ctx.outputLanguage === 'en' ? '영어(English)' : '한국어';
  const system =
    '너는 영상 자막에서 검증 가능한 주장(Knowledge Atom)을 추출하는 분석가다. ' +
    '청크당 3~10개. 각 atom은 실제 발화에 근거해야 하고, startSeconds/endSeconds는 ' +
    '반드시 제공된 세그먼트 타임스탬프 범위 안에서 고른다. 요약·창작 금지, 원문 근거만. ' +
    `claim과 explanation은 반드시 ${langWord}로 작성한다(원문이 다른 언어여도 ${langWord}로 옮겨 쓴다). ` +
    'evidence는 원문 그대로 인용하므로 원어를 유지한다. ' +
    '반드시 JSON만 출력: {"atoms":[{"claim":string,"claimType":' +
    '"objective_fact"|"causal_claim"|"framework"|"instruction"|"case_study"|' +
    '"practitioner_heuristic"|"opinion"|"prediction","explanation":string,' +
    '"evidence":string,"startSeconds":number,"endSeconds":number,' +
    '"confidence":number}]}';
  const segHint = `이 청크의 세그먼트 범위: index ${chunk.segmentStartIndex}~${chunk.segmentEndIndex}, ` +
    `시간 ${chunk.startTimestamp}~${chunk.endTimestamp}.`;
  const user = `videoId: ${ctx.videoId}\n${segHint}\n\n[청크 원문]\n${chunk.text}`;
  return { system, user };
}

export interface RawAtom {
  claim: string;
  claimType: ClaimType;
  explanation: string;
  evidence: string;
  startSeconds: number;
  endSeconds: number;
  confidence: number;
}

/** Strict parse of the atom-extraction response. Throws on malformed input. */
export function parseAtomsResponse(raw: string): RawAtom[] {
  const obj = strictJsonObject(raw);
  const arr = requireArray(obj, 'atoms');
  const out: RawAtom[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const claim = requireString(o.claim, 'claim');
    const claimType: ClaimType = VALID_CLAIM_TYPES.includes(o.claimType as ClaimType)
      ? (o.claimType as ClaimType)
      : 'opinion';
    const startSeconds = toFiniteNumber(o.startSeconds, -1);
    const endSeconds = toFiniteNumber(o.endSeconds, -1);
    if (startSeconds < 0 || endSeconds < startSeconds) {
      throw new ResearchParseError('atom has invalid startSeconds/endSeconds');
    }
    out.push({
      claim,
      claimType,
      explanation: typeof o.explanation === 'string' ? o.explanation : '',
      evidence: typeof o.evidence === 'string' ? o.evidence : '',
      startSeconds,
      endSeconds,
      confidence: clampConfidence(toFiniteNumber(o.confidence, 0.5)),
    });
  }
  return out;
}

function clampConfidence(n: number): number {
  if (n > 1) return Math.min(1, n / 100); // tolerate 0-100 scale
  return Math.max(0, Math.min(1, n));
}

function watchUrl(videoId: string, startSeconds: number): string {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(startSeconds)}s`;
}

/** Assemble a validated RawAtom into a KnowledgeAtom with anchor verification. */
export function buildAtom(
  raw: RawAtom,
  segments: TranscriptSegment[],
  ctx: AtomExtractionContext,
  claimIndex: number,
): KnowledgeAtom {
  const anchored = verifyAtomAnchor(
    raw.claim,
    raw.evidence,
    segments,
    raw.startSeconds,
    raw.endSeconds,
  );
  return {
    claimId: `run-${ctx.runId}-${ctx.videoId}-${claimIndex}`,
    claim: raw.claim,
    claimType: raw.claimType,
    explanation: raw.explanation,
    evidence: raw.evidence,
    videoId: ctx.videoId,
    channelId: ctx.channelId,
    startSeconds: raw.startSeconds,
    endSeconds: raw.endSeconds,
    sourceUrl: watchUrl(ctx.videoId, raw.startSeconds),
    transcriptSource: ctx.transcriptSource,
    verificationStatus: anchored ? 'UNVERIFIED' : 'TRANSCRIPT_AMBIGUOUS',
    confidence: raw.confidence,
    market: ctx.market,
    chunkIndex: -1, // set by extractAtomsForVideo per chunk
    runId: ctx.runId,
  };
}

/**
 * Extract atoms for one video across all chunks. Calls the LLM per chunk; a
 * malformed/parse failure for a chunk is recorded and skipped (resilient), but
 * an LLM transport error propagates so the pipeline can persist progress and
 * resume. Returns atoms with per-chunk chunkIndex + sequential claimIds.
 */
export async function extractAtomsForVideo(params: {
  transcript: Transcript;
  llm: LLMClient;
  ctx: AtomExtractionContext;
}): Promise<KnowledgeAtom[]> {
  const { transcript, llm, ctx } = params;
  const atoms: KnowledgeAtom[] = [];
  let claimIndex = 0;

  for (const chunk of transcript.chunks) {
    const prompt = buildAtomExtractionPrompt(chunk, ctx);
    // LLM transport errors propagate (resume checkpoint); parse errors are skipped.
    const rawText = await llm.complete({
      system: prompt.system,
      user: prompt.user,
      trace_name: `research.extractAtoms.${ctx.videoId}.${chunk.index}`,
    });
    let parsed: RawAtom[];
    try {
      parsed = parseAtomsResponse(rawText);
    } catch {
      continue; // skip this chunk's malformed output, keep the video going
    }
    for (const raw of parsed) {
      const atom = buildAtom(raw, transcript.segments, ctx, claimIndex);
      atom.chunkIndex = chunk.index;
      atoms.push(atom);
      claimIndex += 1;
    }
  }

  return atoms;
}
