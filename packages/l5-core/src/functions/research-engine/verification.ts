// research-engine — verification (VERIFY phase, §4.7).
//
// Two deterministic-but-LLM-assisted paths:
//   1. deriveVerificationStatus — pure status mapping from evidence structure
//      + optional fresh-context / docs signals ("많이 언급됨 ≠ 검증됨").
//   2. fresh-context verifier — prompt builder + strict parser over a principle
//      and its supporting atoms + raw segments (NO synthesis context leaked).
//   3. docs-verify integration — merge DocsVerifyPort results into statuses.

import type { LLMClient } from '../ceo-orchestration/types';
import {
  DocsVerificationResult,
  KnowledgeAtom,
  PrincipleKind,
  ResearchParseError,
  SynthesizedPrinciple,
  TranscriptSegment,
  VerificationStatus,
  strictJsonObject,
} from './types';

// ---------------------------------------------------------------------------
// Deterministic status derivation
// ---------------------------------------------------------------------------

export interface StatusSignals {
  kind: PrincipleKind;
  mentionVideoCount: number;
  independentChannelCount: number;
  hasCounter: boolean;
  /** every supporting atom failed its anchor check. */
  allAmbiguous: boolean;
  /** docs-verify confirmed against official source. */
  docsVerified?: boolean;
  /** docs-verify found a conflict with official source. */
  docsConflict?: boolean;
  /** docs-verify marked the claim as outdated / deprecated. */
  docsOutdated?: boolean;
}

/**
 * Map evidence structure to a verification status. Mention count alone never
 * upgrades to VERIFIED — only official-docs confirmation does. Pure + testable.
 */
export function deriveVerificationStatus(s: StatusSignals): VerificationStatus {
  if (s.allAmbiguous) return 'TRANSCRIPT_AMBIGUOUS';
  if (s.docsOutdated) return 'OUTDATED';
  if (s.docsVerified && !s.docsConflict) return 'VERIFIED';
  if (s.docsConflict) return 'CONTESTED';
  if (s.kind === 'conflict' || s.kind === 'kr_us_diff' || s.hasCounter) return 'CONTESTED';
  if (s.independentChannelCount >= 3) return 'SUPPORTED';
  if (s.independentChannelCount === 2) return 'PRACTITIONER_CONSENSUS';
  return 'ANECDOTAL';
}

// ---------------------------------------------------------------------------
// Fresh-context verifier (§4.7) — prompt + parser
// ---------------------------------------------------------------------------

export interface VerifierVerdict {
  /** claim vocabulary actually present in the cited segments. */
  presentInTranscript: boolean;
  /** timestamps line up with the cited segments. */
  timestampAccurate: boolean;
  /** an opinion was promoted to fact. */
  opinionAsFact: boolean;
  /** same source double-counted as independent. */
  doubleCounted: boolean;
  /** suspicious auto-caption numbers / proper nouns. */
  suspectAutoCaption: boolean;
  note: string;
}

/**
 * Build a fresh-context verification prompt. Only the principle statement, its
 * atoms and the raw cited segments are provided — NOT the synthesis reasoning,
 * so the verifier cannot rubber-stamp its own conclusion.
 */
export function buildVerifierPrompt(
  principle: SynthesizedPrinciple,
  atoms: KnowledgeAtom[],
  segments: TranscriptSegment[],
): { system: string; user: string } {
  const system =
    '너는 독립 검증자다. 주어진 주장과 원문 자막 세그먼트만 보고 판정한다(합성 근거 없음). ' +
    '판정 항목: 자막에 실재하는가, 타임스탬프가 정확한가, 의견을 사실로 승격했는가, ' +
    '같은 원본을 독립 출처로 중복 계산했는가, 자동자막 숫자/고유명사가 의심스러운가. ' +
    '반드시 JSON만 출력: {"presentInTranscript":bool,"timestampAccurate":bool,' +
    '"opinionAsFact":bool,"doubleCounted":bool,"suspectAutoCaption":bool,"note":string}';
  const atomLines = atoms.map(
    (a) => `- [${a.claimId}] (${a.startSeconds}s~${a.endSeconds}s) ${a.claim} :: 근거: ${a.evidence}`,
  );
  const segLines = segments.map(
    (s) => `(${s.startSeconds}s~${s.endSeconds}s) ${s.text}`,
  );
  const user = [
    `주장: ${principle.statement}`,
    '',
    '[아톰]',
    ...atomLines,
    '',
    '[원문 세그먼트]',
    ...segLines,
  ].join('\n');
  return { system, user };
}

/** Strict parse of the verifier response. Throws on malformed input. */
export function parseVerifierResponse(raw: string): VerifierVerdict {
  const obj = strictJsonObject(raw);
  const bool = (v: unknown): boolean => v === true;
  // require at least the presence flag to exist to consider it a real verdict
  if (typeof obj.presentInTranscript !== 'boolean') {
    throw new ResearchParseError('verifier response missing presentInTranscript');
  }
  return {
    presentInTranscript: bool(obj.presentInTranscript),
    timestampAccurate: bool(obj.timestampAccurate),
    opinionAsFact: bool(obj.opinionAsFact),
    doubleCounted: bool(obj.doubleCounted),
    suspectAutoCaption: bool(obj.suspectAutoCaption),
    note: typeof obj.note === 'string' ? obj.note : '',
  };
}

/**
 * Fold a fresh-context verdict into the principle's status. A verdict that finds
 * the claim absent, opinion-as-fact, or double-counted downgrades to CONTESTED /
 * TRANSCRIPT_AMBIGUOUS. Otherwise the deterministic status is kept.
 */
export function applyVerifierVerdict(
  base: VerificationStatus,
  verdict: VerifierVerdict,
): VerificationStatus {
  if (!verdict.presentInTranscript) return 'TRANSCRIPT_AMBIGUOUS';
  if (verdict.opinionAsFact || verdict.doubleCounted) return 'CONTESTED';
  return base;
}

// ---------------------------------------------------------------------------
// docs-verify merge
// ---------------------------------------------------------------------------

/** Index docs-verify results by claim text for merge. */
export function indexDocsResults(
  results: DocsVerificationResult[],
): Map<string, DocsVerificationResult> {
  const m = new Map<string, DocsVerificationResult>();
  for (const r of results) m.set(r.claim.trim(), r);
  return m;
}

/**
 * Run the fresh-context verifier for one principle. Never throws: LLM/parse
 * failure returns the deterministic base status unchanged.
 */
export async function verifyPrincipleFreshContext(params: {
  principle: SynthesizedPrinciple;
  atoms: KnowledgeAtom[];
  segments: TranscriptSegment[];
  llm: LLMClient;
}): Promise<VerificationStatus> {
  const { principle, atoms, segments, llm } = params;
  const prompt = buildVerifierPrompt(principle, atoms, segments);
  try {
    const raw = await llm.complete({
      system: prompt.system,
      user: prompt.user,
      trace_name: `research.verify.${principle.id}`,
    });
    const verdict = parseVerifierResponse(raw);
    return applyVerifierVerdict(principle.verificationStatus, verdict);
  } catch {
    return principle.verificationStatus;
  }
}
