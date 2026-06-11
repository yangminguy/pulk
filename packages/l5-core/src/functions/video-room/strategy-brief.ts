// strategy-brief.ts — CMO Video Strategy Brief builder + Gate 3 validator.
// Pure TypeScript, no NocoBase dependency.
// PRD §4 (buildCmoVideoStrategyBrief) + PRD §16.14 (evaluateStrategyGate).

import {
  CmoVideoStrategyBrief,
  ScriptMaterialPack,
  AudienceFitReport,
  ConsumerStageEn,
  LogicBlock,
} from './types';

// ── Input contract ──────────────────────────────────────────────────────────

export interface StrategyBriefInput {
  content_id: string;
  content_type: 'key' | 'pulling';
  channel_context: {
    current_position: string;
    content_pillar: string;
    role_in_content_set: string;
    bridge_from_previous_content: string;
    bridge_to_next_content: string;
  };
  script_material_pack: ScriptMaterialPack | null | undefined;
  audience_fit_report: AudienceFitReport;
}

// ── Gate 3 result ───────────────────────────────────────────────────────────

export interface StrategyGateResult {
  passed: boolean;
  reasons: string[];
}

// ── Helper ──────────────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function pickMaterials(pack: ScriptMaterialPack, count: number): string[] {
  const candidates = [
    ...pack.pain_scenes,
    ...pack.desire_scenes,
    ...pack.proof_points,
    ...pack.examples,
    ...pack.metaphors,
    ...pack.story_candidates,
  ];
  return candidates.slice(0, count);
}

// ── buildCmoVideoStrategyBrief ───────────────────────────────────────────────

/**
 * Builds a CmoVideoStrategyBrief from research packs and content metadata.
 *
 * Throws if script_material_pack is absent or empty (PRD §1.10 / test-7).
 * covered_stages on each LogicBlock are derived freely from the material pack;
 * no stage is hard-assigned to a fixed block position (PRD §1.2 / §1.18).
 */
export function buildCmoVideoStrategyBrief(input: StrategyBriefInput): CmoVideoStrategyBrief {
  const pack = input.script_material_pack;

  // Test-7:조사/재료표 선행 없이 기획서 생성 금지
  if (
    pack == null ||
    (pack.core_message_candidates.length === 0 &&
      pack.pain_scenes.length === 0 &&
      pack.desire_scenes.length === 0 &&
      pack.proof_points.length === 0 &&
      pack.examples.length === 0 &&
      pack.viewer_language.length === 0 &&
      pack.cta_materials.length === 0)
  ) {
    throw new Error('조사/재료표 선행 필요');
  }

  const fit = input.audience_fit_report;

  // Derive target viewer from pack + audience fit
  const target_viewer = {
    who: pack.target_viewer,
    current_belief:
      pack.counterarguments.length > 0
        ? pack.counterarguments[0]
        : '현재 문제를 인식하지 못하고 있음',
    hidden_desire:
      pack.desire_scenes.length > 0 ? pack.desire_scenes[0] : fit.recommended_angle,
    main_pain: pack.pain_scenes.length > 0 ? pack.pain_scenes[0] : pack.topic,
    objection:
      pack.counterarguments.length > 1
        ? pack.counterarguments[1]
        : pack.must_avoid_lines.length > 0
          ? pack.must_avoid_lines[0]
          : '효과가 없을 것이다',
    language_style: pack.viewer_language.slice(0, 5),
  };

  // Core message: first candidate or topic
  const core_message =
    pack.core_message_candidates.length > 0
      ? pack.core_message_candidates[0]
      : pack.topic;

  // CTA from pack
  const cta =
    pack.cta_materials.length > 0
      ? pack.cta_materials[0]
      : '더 알고 싶다면 댓글로 질문해주세요';

  // ── Logic blocks (minimum 3, covered_stages freely assigned per PRD §1.2) ──

  // Block 1: 현상/욕구 — surface the viewer's pain and desire
  const block1Materials = pickMaterials(pack, 3);
  const block1: LogicBlock = {
    block_id: 'block_1',
    role: '현상 자각 및 욕구 촉발',
    covered_stages: (['phenomenon', 'desire'] as ConsumerStageEn[]).filter(
      () => true,
    ),
    main_claim:
      pack.pain_scenes.length > 0
        ? pack.pain_scenes[0]
        : core_message,
    supporting_materials: block1Materials,
    viewer_emotion: '공감과 불편함',
    transition_to_next_block: '그렇다면 왜 이런 일이 생기는 걸까요?',
    visual_intent_hint: '시청자가 공감할 수 있는 구체적 상황 묘사',
  };

  // Block 2: 계획/욕구 — explain the mechanism or framework
  const block2Materials = [
    ...pack.proof_points.slice(0, 2),
    ...pack.examples.slice(0, 2),
  ];
  const block2: LogicBlock = {
    block_id: 'block_2',
    role: '핵심 메커니즘 설명',
    covered_stages: (['desire', 'plan'] as ConsumerStageEn[]).filter(() => true),
    main_claim:
      pack.core_message_candidates.length > 1
        ? pack.core_message_candidates[1]
        : core_message,
    supporting_materials: block2Materials.length > 0 ? block2Materials : block1Materials,
    viewer_emotion: '이해와 통찰',
    transition_to_next_block: '이제 실제로 어떻게 적용할 수 있는지 보겠습니다.',
    visual_intent_hint: '구조 또는 프레임워크를 시각적으로 표현',
  };

  // Block 3: 행동/보상 — move viewer toward action and paint reward
  const block3Materials = [
    ...pack.story_candidates.slice(0, 2),
    ...pack.metaphors.slice(0, 1),
    ...pack.cta_materials.slice(0, 1),
  ];
  const block3: LogicBlock = {
    block_id: 'block_3',
    role: '행동 유도 및 보상 상상',
    covered_stages: (['action', 'reward'] as ConsumerStageEn[]).filter(() => true),
    main_claim:
      pack.must_use_lines.length > 0
        ? pack.must_use_lines[0]
        : cta,
    supporting_materials:
      block3Materials.length > 0
        ? block3Materials
        : pack.safe_claims.slice(0, 2),
    viewer_emotion: '희망과 결심',
    transition_to_next_block: '',
    visual_intent_hint: '긍정적 미래 상태를 상상하게 하는 장면',
  };

  // Derive consumer_desire_coverage from all blocks
  const allBlockStages: ConsumerStageEn[] = [
    ...block1.covered_stages,
    ...block2.covered_stages,
    ...block3.covered_stages,
  ];
  const uniqueStages = Array.from(new Set(allBlockStages));

  // Primary stage: highest-scoring fit dimension maps to a stage
  const fitScores: Record<ConsumerStageEn, number> = {
    phenomenon: fit.pain_fit,
    desire: fit.desire_fit,
    plan: fit.action_fit,
    action: fit.action_fit,
    reward: fit.trust_fit,
  };
  const primary_stage = (Object.entries(fitScores) as [ConsumerStageEn, number][]).reduce(
    (best, [stage, score]) =>
      uniqueStages.includes(stage) && score > fitScores[best] ? stage : best,
    uniqueStages[0] ?? 'desire',
  );

  // Risk notes: use audience fit warnings + pack avoid lines
  const risk_notes: string[] = [
    ...pack.must_avoid_lines.slice(0, 2),
    ...(fit.what_target_does_not_want_to_hear.length > 0
      ? [`타깃이 듣기 싫어하는 표현 주의: ${fit.what_target_does_not_want_to_hear[0]}`]
      : []),
  ];
  if (risk_notes.length === 0) {
    risk_notes.push('주장 근거 출처 명시 필요');
  }

  return {
    content_id: input.content_id,
    content_type: input.content_type,
    topic: pack.topic,
    channel_context: input.channel_context,
    target_viewer,
    consumer_desire_coverage: {
      covered_stages: uniqueStages,
      primary_stage,
      stage_explanation: fit.recommended_angle,
    },
    video_promise:
      fit.what_target_wants_to_hear.length > 0
        ? fit.what_target_wants_to_hear[0]
        : core_message,
    core_message,
    strategic_angle: fit.recommended_angle,
    logic_blocks: [block1, block2, block3],
    intro_direction:
      pack.must_use_lines.length > 0
        ? pack.must_use_lines[0]
        : `${pack.topic}에 대한 강력한 첫 문장으로 시청자의 현실을 짚는다`,
    thumbnail_direction:
      pack.core_message_candidates.length > 0
        ? `핵심 메시지 "${pack.core_message_candidates[0]}"을 시각화`
        : `${pack.topic} 핵심 결과를 직접적으로 보여주는 썸네일`,
    script_tone_direction:
      pack.viewer_language.length > 0
        ? `타깃 언어 반영: "${pack.viewer_language[0]}"`
        : '명확하고 신뢰감 있는 설명체',
    cta,
    risk_notes,
  };
}

// ── evaluateStrategyGate ─────────────────────────────────────────────────────

/**
 * Gate 3 validator (PRD §16.14).
 * Returns { passed, reasons } where reasons lists all failed conditions.
 */
export function evaluateStrategyGate(brief: CmoVideoStrategyBrief): StrategyGateResult {
  const reasons: string[] = [];

  // content_type 명확
  if (brief.content_type !== 'key' && brief.content_type !== 'pulling') {
    reasons.push('content_type이 명확하지 않음 (key 또는 pulling 이어야 함)');
  }

  // covered_stages 명확
  const stages = brief.consumer_desire_coverage?.covered_stages;
  if (!Array.isArray(stages) || stages.length === 0) {
    reasons.push('consumer_desire_coverage.covered_stages가 비어 있음');
  }

  // logic_blocks 3개 이상
  if (!Array.isArray(brief.logic_blocks) || brief.logic_blocks.length < 3) {
    reasons.push('logic_blocks가 3개 미만');
  } else {
    // 각 block에 main_claim, supporting_materials 존재
    for (const block of brief.logic_blocks) {
      if (!isNonEmptyString(block.main_claim)) {
        reasons.push(`block ${block.block_id}: main_claim 없음`);
      }
      if (!Array.isArray(block.supporting_materials) || block.supporting_materials.length === 0) {
        reasons.push(`block ${block.block_id}: supporting_materials 없음`);
      }
    }
  }

  // intro_direction, thumbnail_direction, cta 존재
  if (!isNonEmptyString(brief.intro_direction)) {
    reasons.push('intro_direction 없음');
  }
  if (!isNonEmptyString(brief.thumbnail_direction)) {
    reasons.push('thumbnail_direction 없음');
  }
  if (!isNonEmptyString(brief.cta)) {
    reasons.push('cta 없음');
  }

  // risk_notes 존재
  if (!Array.isArray(brief.risk_notes) || brief.risk_notes.length === 0) {
    reasons.push('risk_notes 없음');
  }

  return { passed: reasons.length === 0, reasons };
}
