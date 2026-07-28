// CMO Video Room — VideoExecutionBrief builder.
//
// Converts a CmoVideoStrategyBrief + VoiceMatchedScript + supporting inputs
// into a VideoExecutionBrief ready to hand to AI Slide Factory.
//
// Constraints (per CMO_TO_FACTORY_CONTRACT.md):
//   - schema_version is always 'cmo_to_factory_v2'
//   - BriefLogicBlock must NOT contain scene_type / best_medium / duration
//   - ConsumerStage (Korean) is mapped to ConsumerStageEn (English) via CONSUMER_STAGE_EN
//   - id / timestamps must be injected by caller; this function never calls Date or randomUUID
//
// Throws for:
//   - empty core_message on the strategy brief
//   - empty title
//   - empty full_script on the voice_matched_script
//   - empty logic_blocks on the strategy brief

import type {
  VideoExecutionBrief,
  CmoVideoStrategyBrief,
  VoiceMatchedScript,
  ConsumerStage,
  ConsumerStageEn,
  BriefLogicBlock,
  PreferredAssetType,
} from './types';
import { CONSUMER_STAGE_EN } from './types';

// ── Public re-export so callers can import the mapping from one place ────────

export { CONSUMER_STAGE_EN };
export type { ConsumerStageEn };

// ── Input shape ───────────────────────────────────────────────────────────────

export interface BuildVideoExecutionBriefInput {
  /** Stable content card id injected by caller (never generated here). */
  content_card_id: string;
  content_type: 'key' | 'pulling';
  title: string;

  /** Fully populated CMO strategy brief. */
  strategy_brief: CmoVideoStrategyBrief;

  /** Founder-voice-matched script (full_script used for logic block speaker_text extraction). */
  voice_matched_script: VoiceMatchedScript;

  /** 30-second intro script text. */
  intro_30s: string;

  /** Pack ids for source materials (all optional). */
  source_pack_ids?: {
    market_research_pack_id?: string;
    voc_pack_id?: string;
    claim_evidence_report_id?: string;
    script_material_pack_id?: string;
  };

  /** Insight ids actually used, keyed by usage area. */
  used_insights?: {
    thumbnail?: string[];
    script?: string[];
    founder_voice?: string[];
  };

  /** Asset requests to pass through to the factory. */
  asset_requests?: {
    need: string;
    preferred_asset_type: PreferredAssetType;
    reason: string;
  }[];

  /** Tone/constraint overrides. */
  constraints?: {
    tone?: string;
    avoid?: string[];
    format?: 'youtube_16_9' | 'shorts_9_16';
    production?: VideoExecutionBrief['constraints']['production'];
  };
}

// ── ConsumerStage mapping helpers ─────────────────────────────────────────────

/** Maps an array of Korean ConsumerStage values to English equivalents. */
export function mapStagesToEn(stages: ConsumerStage[]): ConsumerStageEn[] {
  return stages.map((s) => CONSUMER_STAGE_EN[s]);
}

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Builds a VideoExecutionBrief from CMO strategy + voice-matched script inputs.
 *
 * id / timestamps are the caller's responsibility — this function is pure and
 * side-effect free (no Date, no randomUUID).
 */
export function buildVideoExecutionBrief(
  input: BuildVideoExecutionBriefInput,
): VideoExecutionBrief {
  const { content_card_id, content_type, title, strategy_brief, voice_matched_script, intro_30s } =
    input;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!title || title.trim() === '') {
    throw new Error('buildVideoExecutionBrief: title must not be empty');
  }
  if (!strategy_brief.core_message || strategy_brief.core_message.trim() === '') {
    throw new Error('buildVideoExecutionBrief: strategy_brief.core_message must not be empty');
  }
  if (!voice_matched_script.full_script || voice_matched_script.full_script.trim() === '') {
    throw new Error(
      'buildVideoExecutionBrief: voice_matched_script.full_script must not be empty',
    );
  }
  if (!strategy_brief.logic_blocks || strategy_brief.logic_blocks.length === 0) {
    throw new Error('buildVideoExecutionBrief: strategy_brief.logic_blocks must not be empty');
  }

  // ── Logic block conversion ────────────────────────────────────────────────
  // speaker_text for each block is extracted from the voice_matched_script.
  // Because the full_script is a unified narrative, we attempt a best-effort
  // extraction: split by block_id marker lines if present, otherwise fall back
  // to the full_script for every block (factory will trim to needed portion).
  const fullScript = voice_matched_script.full_script;

  const logic_blocks: BriefLogicBlock[] = strategy_brief.logic_blocks.map((lb) => {
    // Attempt to find a section of the full script that mentions the block_id.
    // A common convention is "[block_id]" delimiters; we support that and plain text.
    const blockMarkerRe = new RegExp(
      `\\[${escapeRegExp(lb.block_id)}\\]([\\s\\S]*?)(?=\\[[^\\]]+\\]|$)`,
    );
    const match = blockMarkerRe.exec(fullScript);
    const speaker_text = match ? match[1].trim() : fullScript;

    // required_evidence comes from the strategy block's supporting_materials.
    const required_evidence =
      lb.supporting_materials && lb.supporting_materials.length > 0
        ? lb.supporting_materials
        : undefined;

    const block: BriefLogicBlock = {
      block_id: lb.block_id,
      role: lb.role,
      speaker_text,
      communication_goal: lb.main_claim,
      viewer_reaction_target: lb.viewer_emotion,
      ...(required_evidence !== undefined && { required_evidence }),
      ...(lb.visual_intent_hint !== undefined && { visual_intent_hint: lb.visual_intent_hint }),
    };

    return block;
  });

  // ── covered_stages: Korean → English ─────────────────────────────────────
  const covered_stages: ConsumerStageEn[] =
    strategy_brief.consumer_desire_coverage.covered_stages;
  // These are already ConsumerStageEn on the brief; pass through directly.
  // If the caller supplies Korean-keyed stages they must pre-convert via mapStagesToEn.

  // ── Assemble brief ────────────────────────────────────────────────────────
  const brief: VideoExecutionBrief = {
    schema_version: 'cmo_to_factory_v2',
    content_card_id,
    content_type,
    title: title.trim(),
    target_viewer: {
      who: strategy_brief.target_viewer.who,
      knowledge_level: strategy_brief.target_viewer.current_belief,
      pain: strategy_brief.target_viewer.main_pain,
      desired_reaction: strategy_brief.target_viewer.hidden_desire,
    },
    strategy: {
      core_message: strategy_brief.core_message,
      covered_stages,
      role_in_content_set: strategy_brief.channel_context.role_in_content_set,
      ...(content_type === 'pulling' && {
        bridge_to_key_content: strategy_brief.channel_context.bridge_to_next_content,
      }),
    },
    script: {
      full_script: fullScript,
      intro_30s: intro_30s,
      logic_blocks,
    },
    source_materials: {
      ...(input.source_pack_ids?.market_research_pack_id && {
        market_research_pack_id: input.source_pack_ids.market_research_pack_id,
      }),
      ...(input.source_pack_ids?.voc_pack_id && {
        voc_pack_id: input.source_pack_ids.voc_pack_id,
      }),
      ...(input.source_pack_ids?.claim_evidence_report_id && {
        claim_evidence_report_id: input.source_pack_ids.claim_evidence_report_id,
      }),
      ...(input.source_pack_ids?.script_material_pack_id && {
        script_material_pack_id: input.source_pack_ids.script_material_pack_id,
      }),
      used_insights: input.used_insights ?? {},
    },
    ...(input.asset_requests && input.asset_requests.length > 0 && {
      asset_requests: input.asset_requests,
    }),
    constraints: {
      tone: input.constraints?.tone ?? strategy_brief.script_tone_direction,
      ...(input.constraints?.avoid && { avoid: input.constraints.avoid }),
      format: input.constraints?.format ?? 'youtube_16_9',
      production: input.constraints?.production ?? {
        source_orientation: 'review_required',
        edit_unit: 'meaning_block',
        talking_head_policy: 'selective',
        caption_style: 'static_sentence',
        script_validation: 'already_approved',
        storyboard_approval_required: true,
        required_processes: [
          'lip_sync',
          'mistake_removal',
          'silence_trim',
          'color_management',
          'media_sourcing',
          'music_and_sfx',
          'editorial_qa',
        ],
      },
    },
  };

  return brief;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
