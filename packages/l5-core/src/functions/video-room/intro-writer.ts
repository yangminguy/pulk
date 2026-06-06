import type {
  CmoVideoStrategyBrief,
  ScriptMaterialPack,
  VoiceOfCustomerPack,
  Intro30s,
} from './types';

export interface BuildIntro30sInput {
  brief: CmoVideoStrategyBrief;
  materials: ScriptMaterialPack;
  voc: VoiceOfCustomerPack;
}

/**
 * PRD §9.1 / §5.1 Intro Writer
 *
 * Rules enforced:
 * 1. viewer_promise must equal brief.video_promise.
 * 2. At least one VOC real-language phrase must appear in the script.
 * 3. used_materials are drawn only from the ScriptMaterialPack fields.
 * 4. used_script_insights are drawn from brief.intro_direction.
 */
export function buildIntro30s(input: BuildIntro30sInput): Intro30s {
  const { brief, materials, voc } = input;

  // --- derive hook_type from brief intro_direction ---
  const hookType = deriveHookType(brief.intro_direction);

  // --- pick at least one VOC real-language phrase ---
  const vocCandidates = [
    ...voc.must_use_language,
    ...voc.pain_expressions,
    ...voc.desire_expressions,
    ...voc.repeated_phrases,
  ].filter((l) => l.trim().length > 0);

  if (vocCandidates.length === 0) {
    throw new Error('VOC pack must contain at least one real-language phrase');
  }

  const vocPhrase = vocCandidates[0];

  // --- build tension from viewer pain + main_pain ---
  const tension =
    materials.pain_scenes.length > 0
      ? materials.pain_scenes[0]
      : brief.target_viewer.main_pain;

  // --- first sentence: the sharpest hook from materials or intro_direction ---
  const firstSentence =
    materials.must_use_lines.length > 0
      ? materials.must_use_lines[0]
      : brief.intro_direction;

  // --- script body: combine first_sentence + tension + vocPhrase + viewer_promise ---
  const script = [
    firstSentence,
    tension,
    vocPhrase,
    brief.video_promise,
  ]
    .filter(Boolean)
    .join(' ');

  // --- used_materials: only from ScriptMaterialPack fields (no invented facts) ---
  const usedMaterials: string[] = [];
  if (materials.must_use_lines.length > 0) usedMaterials.push(materials.must_use_lines[0]);
  if (materials.pain_scenes.length > 0) usedMaterials.push(materials.pain_scenes[0]);
  if (materials.core_message_candidates.length > 0)
    usedMaterials.push(materials.core_message_candidates[0]);

  // --- used_script_insights from brief.intro_direction ---
  const usedScriptInsights: string[] = [brief.intro_direction].filter(Boolean);

  // --- why_it_works: brief.strategic_angle + hook_type ---
  const whyItWorks = `Hook type "${hookType}" based on brief strategic angle: ${brief.strategic_angle}`;

  return {
    first_sentence: firstSentence,
    hook_type: hookType,
    tension,
    viewer_promise: brief.video_promise, // must equal brief.video_promise
    script,
    used_materials: usedMaterials,
    used_script_insights: usedScriptInsights,
    why_it_works: whyItWorks,
  };
}

function deriveHookType(introDirection: string): string {
  const lower = introDirection.toLowerCase();
  if (lower.includes('loss') || lower.includes('잃') || lower.includes('못')) return 'loss';
  if (lower.includes('gain') || lower.includes('얻') || lower.includes('성공')) return 'gain';
  if (lower.includes('curiosity') || lower.includes('궁금') || lower.includes('why'))
    return 'curiosity';
  if (lower.includes('warn') || lower.includes('주의') || lower.includes('위험'))
    return 'warning';
  if (lower.includes('authority') || lower.includes('전문') || lower.includes('증거'))
    return 'authority';
  if (lower.includes('result') || lower.includes('결과') || lower.includes('사례'))
    return 'result';
  if (lower.includes('contrast') || lower.includes('반면') || lower.includes('차이'))
    return 'contrast';
  return 'curiosity';
}
