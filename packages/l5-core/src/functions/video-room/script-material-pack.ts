// CMO Video Room — Script Material Pack Builder (PRD §3.5, §7).
//
// Pure function only. No Date.now(), new Date(), or randomUUID() calls inside.
// All id values must be injected by the caller if needed.

import type {
  MarketResearchPack,
  VoiceOfCustomerPack,
  ClaimEvidenceReport,
  AudienceFitReport,
  ScriptMaterialPack,
} from './types';

export interface BuildScriptMaterialPackInput {
  topic: string;
  target_viewer: string;
  market_research: MarketResearchPack;
  voc: VoiceOfCustomerPack;
  claim_evidence: ClaimEvidenceReport;
  audience_fit: AudienceFitReport;
}

/**
 * Synthesises a ScriptMaterialPack from the four upstream research packs.
 *
 * Mapping rules (PRD §3.5):
 * - viewer_language  ← voc.must_use_language (primary) + voc.repeated_phrases
 * - pain_scenes      ← voc.pain_expressions + voc.realistic_situations
 * - desire_scenes    ← voc.desire_expressions + audience_fit.what_target_wants_to_hear
 * - proof_points     ← claim_evidence.proof_points
 * - examples         ← market_research.example_materials
 * - counterarguments ← voc.objection_expressions + market_research.common_misunderstandings
 * - metaphors        ← [] (no upstream source; left for downstream agent to enrich)
 * - story_candidates ← voc.realistic_situations (doubled with pain for narrative seeds)
 * - must_use_lines   ← voc.must_use_language
 * - must_avoid_lines ← voc.avoid_language + claim_evidence.claims_to_avoid
 * - safe_claims      ← claim_evidence.safe_claims
 * - cta_materials    ← audience_fit.must_answer_questions (intent triggers)
 * - core_message_candidates ← market_research.content_opportunities
 */
export function buildScriptMaterialPack(
  input: BuildScriptMaterialPackInput,
): ScriptMaterialPack {
  const { topic, target_viewer, market_research, voc, claim_evidence, audience_fit } = input;

  if (!topic || topic.trim() === '') {
    throw new Error('topic must not be empty');
  }
  if (!target_viewer || target_viewer.trim() === '') {
    throw new Error('target_viewer must not be empty');
  }

  const viewer_language = dedupe([
    ...voc.must_use_language,
    ...voc.repeated_phrases,
  ]);

  const pain_scenes = dedupe([
    ...voc.pain_expressions,
    ...voc.realistic_situations,
  ]);

  const desire_scenes = dedupe([
    ...voc.desire_expressions,
    ...audience_fit.what_target_wants_to_hear,
  ]);

  const proof_points = dedupe([...claim_evidence.proof_points]);

  const examples = dedupe([...market_research.example_materials]);

  const counterarguments = dedupe([
    ...voc.objection_expressions,
    ...market_research.common_misunderstandings,
  ]);

  const metaphors: string[] = [];

  const story_candidates = dedupe([...voc.realistic_situations]);

  const must_use_lines = dedupe([...voc.must_use_language]);

  const must_avoid_lines = dedupe([
    ...voc.avoid_language,
    ...claim_evidence.claims_to_avoid,
  ]);

  const safe_claims = dedupe([...claim_evidence.safe_claims]);

  const cta_materials = dedupe([...audience_fit.must_answer_questions]);

  const core_message_candidates = dedupe([...market_research.content_opportunities]);

  return {
    topic: topic.trim(),
    target_viewer: target_viewer.trim(),
    core_message_candidates,
    viewer_language,
    pain_scenes,
    desire_scenes,
    proof_points,
    examples,
    counterarguments,
    metaphors,
    story_candidates,
    must_use_lines,
    must_avoid_lines,
    safe_claims,
    cta_materials,
  };
}

/** Remove duplicate strings while preserving order. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}
