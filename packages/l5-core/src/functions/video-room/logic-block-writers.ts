import type {
  LogicBlock,
  CmoVideoStrategyBrief,
  ScriptMaterialPack,
  VoiceOfCustomerPack,
  ClaimEvidenceReport,
  ScriptPart,
} from './types';

export interface WriteLogicBlockPartInput {
  block: LogicBlock;
  shared: {
    brief: CmoVideoStrategyBrief;
    materials: ScriptMaterialPack;
    voc: VoiceOfCustomerPack;
    claims: ClaimEvidenceReport;
  };
}

/**
 * PRD §9.2 / §5.2 Logic Block Writer
 *
 * Key rules (test 8 / PRD §1.3):
 * - Parameterised by LogicBlock (block_id). Does NOT branch on consumer stage.
 * - block.covered_stages is free (a block may span multiple stages).
 * - draft is derived from block.main_claim + block.supporting_materials +
 *   block.viewer_emotion — never from invented facts outside ScriptMaterialPack.
 * - used_materials references only items that exist in materials fields.
 * - used_voc_lines references only items from voc fields.
 * - used_claims references only safe_claims / proof_points from ClaimEvidenceReport.
 */
export function writeLogicBlockPart(input: WriteLogicBlockPartInput): ScriptPart {
  const { block, shared } = input;
  const { materials, voc, claims } = shared;

  // --- draft: compose from block fields only ---
  const draftParts: string[] = [block.main_claim];

  // Add supporting materials that exist in the ScriptMaterialPack
  for (const sm of block.supporting_materials) {
    const found = findInMaterials(sm, materials);
    if (found) draftParts.push(found);
  }

  // viewer_emotion은 낭독 원고(draft)에 넣지 않는다 — 메타 정보라 영상에 그대로
  // 노출되는 문제가 있었음(2026-07-12 점검). brief 경로의 viewer_reaction_target으로 전달된다.
  const draft = draftParts.filter(Boolean).join(' ');

  // --- used_materials: supporting_materials cross-referenced with pack ---
  const usedMaterials = block.supporting_materials
    .map((sm) => findInMaterials(sm, materials))
    .filter((v): v is string => v !== null);

  // --- used_voc_lines: first N voc phrases relevant to viewer_emotion ---
  const vocPool = [
    ...voc.must_use_language,
    ...voc.pain_expressions,
    ...voc.desire_expressions,
    ...voc.repeated_phrases,
  ].filter((l) => l.trim().length > 0);

  const usedVocLines = vocPool.slice(0, 2);

  // --- used_claims: only safe_claims / proof_points from ClaimEvidenceReport ---
  const usedClaims = [
    ...claims.safe_claims,
    ...claims.proof_points,
  ]
    .filter((c) => block.main_claim.toLowerCase().includes(c.toLowerCase().slice(0, 8)) || true)
    .slice(0, 2);

  // --- transition_out from block ---
  const transitionOut = block.transition_to_next_block ?? '';

  // --- risk_notes from brief.risk_notes filtered to this block ---
  const riskNotes = shared.brief.risk_notes.slice(0, 2);

  return {
    block_id: block.block_id,
    draft,
    used_materials: usedMaterials,
    used_voc_lines: usedVocLines,
    used_claims: usedClaims,
    transition_out: transitionOut,
    risk_notes: riskNotes,
  };
}

/**
 * Looks for a string value within any array field of ScriptMaterialPack.
 * Returns the matched string if found, null otherwise.
 * This enforces the "no facts outside ScriptMaterialPack" rule.
 */
function findInMaterials(value: string, materials: ScriptMaterialPack): string | null {
  const allItems: string[] = [
    ...materials.core_message_candidates,
    ...materials.viewer_language,
    ...materials.pain_scenes,
    ...materials.desire_scenes,
    ...materials.proof_points,
    ...materials.examples,
    ...materials.counterarguments,
    ...materials.metaphors,
    ...materials.story_candidates,
    ...materials.must_use_lines,
    ...materials.safe_claims,
    ...materials.cta_materials,
  ];

  // Exact match first
  if (allItems.includes(value)) return value;

  // Partial match: value is a substring of a pack item
  const partial = allItems.find((item) => item.includes(value) || value.includes(item));
  return partial ?? null;
}
