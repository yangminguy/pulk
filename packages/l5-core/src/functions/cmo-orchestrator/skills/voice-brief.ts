import type { AgentSkill, SkillResult, SkillExecutionContext } from '../types';
import type {
  CmoVideoStrategyBrief,
  IntegratedScript,
} from '../../video-room/types';
import {
  transformToFounderVoice,
  type VoiceSource,
  type FounderVoiceProfile,
} from '../../video-room/founder-voice';
import { buildVideoExecutionBrief } from '../../video-room/video-execution-brief';

/**
 * Thin adapter skill for the CMO founder-voice + execution-brief step
 * (PRD v3 §6 — after script writing).
 *
 * It composes two video-room domain functions:
 *   transformToFounderVoice → buildVideoExecutionBrief
 * and never reimplements their logic.
 *
 * The integrated script comes from the upstream `cmo.script.write` skill via
 * `ctx.prior_results`; `args` can override any input so the skill stays
 * deterministic and runnable without an LLM. Voice transformation gracefully
 * falls back to the original script when no voice sources/profile are given.
 */
export function createVoiceBriefSkill(
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: 'cmo.voice.brief',
    skill_id: 'cmo.voice.brief',
    category: 'content',
    depends_on: ['cmo.script.write'],
    default_risk: 'D2',
    description:
      "Match the integrated script to the founder's voice, then assemble a VideoExecutionBrief for the AI Slide Factory.",
    parameters: {
      brief: 'CmoVideoStrategyBrief — strategy + logic blocks for the video',
      integrated_script:
        'IntegratedScript — defaults to the cmo.script.write result',
      voice_sources: 'VoiceSource[] — founder tone samples from the Second Brain',
      voice_profile: 'optional FounderVoiceProfile override',
      title: 'string — video title for the execution brief',
      intro_30s: 'string — 30s intro text for the execution brief',
      content_card_id: 'string — stable content card id (caller-injected)',
      content_type: "'key' | 'pulling'",
    },
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (args, ctx): Promise<SkillResult> => {
      const skillCtx = ctx as SkillExecutionContext | undefined;
      const prior = skillCtx?.prior_results?.get('cmo.script.write');
      const priorData = (prior?.data ?? {}) as {
        integrated_script?: IntegratedScript;
        intro?: { script?: string };
      };

      const brief = (args.brief as CmoVideoStrategyBrief) ?? defaultBrief();
      const integrated =
        (args.integrated_script as IntegratedScript) ??
        priorData.integrated_script ??
        defaultIntegratedScript(brief);

      const voiceSources = (args.voice_sources as VoiceSource[]) ?? [];
      const voiceProfile = args.voice_profile as FounderVoiceProfile | undefined;

      const voiceMatched = transformToFounderVoice({
        script: integrated,
        voiceSources,
        voiceProfile,
      });

      const title = (args.title as string) ?? brief.thumbnail_direction;
      const intro30s =
        (args.intro_30s as string) ?? priorData.intro?.script ?? '';

      const executionBrief = buildVideoExecutionBrief({
        content_card_id:
          (args.content_card_id as string) ?? brief.content_id,
        content_type:
          (args.content_type as 'key' | 'pulling') ?? brief.content_type,
        title,
        strategy_brief: brief,
        voice_matched_script: voiceMatched,
        intro_30s: intro30s,
      });

      return {
        ok: true,
        skill_id: 'cmo.voice.brief',
        data: {
          task_id: skillCtx?.task_id,
          voice_matched_script: voiceMatched,
          execution_brief: executionBrief,
        },
        insight:
          voiceMatched.changed_phrases.length > 0
            ? `Script adapted to founder voice (${voiceMatched.changed_phrases.length} phrase changes) and packaged as an execution brief.`
            : 'No voice sources available; original script packaged as an execution brief unchanged.',
        suggested_next: [],
      };
    },
    ...overrides,
  };
}

// ── Deterministic fallbacks (no LLM) ─────────────────────────────────────────

function defaultIntegratedScript(brief: CmoVideoStrategyBrief): IntegratedScript {
  return {
    full_script: `${brief.video_promise}. ${brief.core_message}.`,
    section_map: brief.logic_blocks.map((b) => b.block_id),
    removed_repetition: [],
    added_transitions: [],
    strategy_alignment_notes: [],
  };
}

function defaultBrief(): CmoVideoStrategyBrief {
  return {
    content_id: 'key-001',
    content_type: 'key',
    topic: '작은 브랜드가 콘텐츠로 손님을 만드는 법',
    channel_context: {
      current_position: '신규 채널',
      content_pillar: '콘텐츠 마케팅 시스템',
      role_in_content_set: 'key',
      bridge_from_previous_content: '',
      bridge_to_next_content: '',
    },
    target_viewer: {
      who: '작은 브랜드 대표',
      current_belief: '콘텐츠를 많이 올리면 손님이 온다',
      hidden_desire: '꾸준히 손님이 오는 구조',
      main_pain: '인스타를 열심히 해도 손님이 안 온다',
      objection: '시간이 없다',
      language_style: ['솔직한', '현실적인'],
    },
    consumer_desire_coverage: {
      covered_stages: ['phenomenon', 'desire', 'plan'],
      primary_stage: 'plan',
      stage_explanation: '문제 인식부터 해결 계획까지 연결한다.',
    },
    video_promise: '콘텐츠가 매출로 이어지는 구조를 보여준다',
    core_message: '양이 아니라 구매 흐름이 문제다',
    strategic_angle: '콘텐츠 양 늘리기의 한계를 깨는 관점',
    logic_blocks: [
      {
        block_id: 'b1',
        role: 'problem',
        covered_stages: ['phenomenon'],
        main_claim: '콘텐츠를 많이 올려도 손님이 안 온다',
        supporting_materials: [],
        viewer_emotion: '답답함',
        transition_to_next_block: '그럼 왜 그럴까?',
      },
      {
        block_id: 'b2',
        role: 'solution',
        covered_stages: ['plan'],
        main_claim: '구매 흐름에 맞춘 콘텐츠 구조가 필요하다',
        supporting_materials: [],
        viewer_emotion: '납득',
        transition_to_next_block: '',
      },
    ],
    intro_direction: '손실을 자극하는 도입 (loss)',
    thumbnail_direction: '인스타 열심히 해도 손님이 안 오는 이유',
    script_tone_direction: '솔직하고 단정적인 말투',
    cta: '무료 콘텐츠 구조 진단 받기',
    risk_notes: [],
  };
}
