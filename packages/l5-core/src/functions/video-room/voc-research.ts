import type { VoiceOfCustomerPack } from './types';

/**
 * Builds a VoiceOfCustomerPack from raw input.
 *
 * All fields must contain actual customer utterances — not abstract summaries.
 * Empty or missing arrays are normalised to [].
 */
export function buildVoiceOfCustomerPack(
  input: Partial<VoiceOfCustomerPack>,
): VoiceOfCustomerPack {
  return {
    repeated_phrases: input.repeated_phrases ?? [],
    pain_expressions: input.pain_expressions ?? [],
    desire_expressions: input.desire_expressions ?? [],
    objection_expressions: input.objection_expressions ?? [],
    realistic_situations: input.realistic_situations ?? [],
    must_use_language: input.must_use_language ?? [],
    avoid_language: input.avoid_language ?? [],
  };
}

/**
 * Counts the total number of real language entries across all expression fields.
 *
 * Used by Gate 1 to verify VOC real language count >= 5.
 * Counts: repeated_phrases + pain_expressions + desire_expressions +
 *         objection_expressions + realistic_situations + must_use_language
 * (avoid_language is excluded — it is a constraint list, not a real language sample)
 */
export function countRealLanguage(pack: VoiceOfCustomerPack): number {
  return (
    pack.repeated_phrases.length +
    pack.pain_expressions.length +
    pack.desire_expressions.length +
    pack.objection_expressions.length +
    pack.realistic_situations.length +
    pack.must_use_language.length
  );
}
