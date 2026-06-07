// CMO Video Room — Founder Voice Agent (PRD §5.4).
//
// Transforms an IntegratedScript's tone/phrasing to match the founder's voice
// while preserving ALL logic. Logic blocks are identified by section_map order
// (block_id references from CmoVideoStrategyBrief). The function NEVER reorders
// sections or alters claims — only surface-level phrasing changes.
//
// voice sources are queried via secondBrainQueryForStatus (reused from
// second-brain-query.ts). The caller passes pre-resolved voiceSources; this
// module is pure and makes no I/O calls.

import type { IntegratedScript, VoiceMatchedScript } from './types';

// ── Public input type ─────────────────────────────────────────────────────────

/** A single voice source entry pulled from the Second Brain. */
export interface VoiceSource {
  source_id: string;
  title: string;
  /** Representative excerpts that reflect the founder's tone/style. */
  sample_phrases: string[];
  /** Stylistic traits extracted from the source (e.g. "짧은 문장", "직설적"). */
  style_traits: string[];
}

/** Voice profile synthesised from all voice sources. */
export interface FounderVoiceProfile {
  /** Aggregate style traits deduplicated across sources. */
  style_traits: string[];
  /** All sample phrases collected from sources. */
  sample_phrases: string[];
  /** Source IDs used to build this profile. */
  source_ids: string[];
}

export interface TransformToFounderVoiceInput {
  script: IntegratedScript;
  /** Pre-resolved voice sources from the Second Brain (may be empty). */
  voiceSources: VoiceSource[];
  /** Optional caller-provided profile; takes precedence over derived one. */
  voiceProfile?: FounderVoiceProfile;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a FounderVoiceProfile from voice source entries. */
function buildVoiceProfile(sources: VoiceSource[]): FounderVoiceProfile {
  const traitSet = new Set<string>();
  const phrases: string[] = [];
  const ids: string[] = [];

  for (const src of sources) {
    ids.push(src.source_id);
    for (const t of src.style_traits) traitSet.add(t);
    phrases.push(...src.sample_phrases);
  }

  return {
    style_traits: Array.from(traitSet),
    sample_phrases: phrases,
    source_ids: ids,
  };
}

/**
 * Apply founder-voice style traits to a single sentence.
 *
 * Rules (conservative — logic must remain unchanged):
 * - "~합니다" → "~해요"  (존댓말 softening, common founder style)
 * - "~입니다" → "~예요" / "~이에요"
 * - "~하십시오" → "~하세요"
 * - "그러므로" → "그래서"  (formal conjunctions → casual)
 * - "따라서" → "그래서"
 * - "~하여야" → "~해야"
 *
 * When no voiceProfile style_traits are present the sentence is returned as-is.
 */
function applyStyling(sentence: string, profile: FounderVoiceProfile): string {
  if (profile.style_traits.length === 0) return sentence;

  let s = sentence;

  // Formal → conversational verb endings
  s = s.replace(/합니다/g, '해요');
  s = s.replace(/입니다/g, '예요');
  s = s.replace(/이입니다/g, '이에요');
  s = s.replace(/하십시오/g, '하세요');
  s = s.replace(/그러므로/g, '그래서');
  s = s.replace(/따라서/g, '그래서');
  s = s.replace(/하여야/g, '해야');

  return s;
}

/**
 * Transform a full script text sentence-by-sentence, recording only sentences
 * that actually changed.
 *
 * Returns { transformed, changedPhrases }.
 */
function transformScript(
  fullScript: string,
  profile: FounderVoiceProfile,
): { transformed: string; changedPhrases: string[] } {
  if (profile.style_traits.length === 0) {
    return { transformed: fullScript, changedPhrases: [] };
  }

  // Split on sentence boundaries (마침표/물음표/느낌표 뒤 공백 또는 줄바꿈)
  const sentenceRegex = /([^.!?\n]+[.!?]?)(\s*\n?)/g;
  const changedPhrases: string[] = [];
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = sentenceRegex.exec(fullScript)) !== null) {
    const sentence = match[1];
    const separator = match[2];
    const styled = applyStyling(sentence, profile);
    if (styled !== sentence) {
      changedPhrases.push(`"${sentence}" → "${styled}"`);
    }
    result += styled + separator;
    lastIndex = match.index + match[0].length;
  }

  // Append any trailing text not captured by the regex
  if (lastIndex < fullScript.length) {
    result += fullScript.slice(lastIndex);
  }

  return { transformed: result, changedPhrases };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Transform an IntegratedScript to match the founder's voice.
 *
 * Invariants:
 * - section_map order is preserved verbatim (logic block sequence is immutable).
 * - preserved_logic is always true (this function never mutates claims/logic).
 * - When voiceSources is empty and no voiceProfile is provided, full_script is
 *   returned unchanged (graceful fallback).
 * - changed_phrases records before/after pairs for every modified sentence.
 */
export function transformToFounderVoice(
  input: TransformToFounderVoiceInput,
): VoiceMatchedScript {
  const { script, voiceSources, voiceProfile: callerProfile } = input;

  const profile: FounderVoiceProfile =
    callerProfile ?? buildVoiceProfile(voiceSources);

  const { transformed, changedPhrases } = transformScript(script.full_script, profile);

  return {
    full_script: transformed,
    voice_profile_used: profile as unknown as Record<string, unknown>,
    changed_phrases: changedPhrases,
    preserved_logic: true,
  };
}
