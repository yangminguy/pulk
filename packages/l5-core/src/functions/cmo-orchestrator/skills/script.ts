import type { AgentSkill, SkillResult } from '../types';
import type {
  CmoVideoStrategyBrief,
  ScriptMaterialPack,
  VoiceOfCustomerPack,
  ScriptPart,
  ConsumerStageEn,
} from '../../video-room/types';
import { buildIntro30s } from '../../video-room/intro-writer';
import { integrateScript } from '../../video-room/script-integrator';
import { evaluateScriptQa } from '../../video-room/script-qa';

/**
 * Thin adapter skill for the CMO script-writing step (PRD v3 §6 step 8).
 *
 * It composes three video-room domain functions:
 *   buildIntro30s → integrateScript → evaluateScriptQa
 * and never reimplements their logic.
 *
 * Inputs are read from `args` (so the skill is deterministic) and fall back to
 * minimal scaffolding so the skill can run without an LLM. The real wiring of
 * upstream skill outputs (cmo.strategy.package / cmo.title.thumbnail) into these
 * args is the orchestrator's responsibility.
 */
export function createScriptWriteSkill(
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: 'cmo.script.write',
    skill_id: 'cmo.script.write',
    category: 'content',
    depends_on: ['cmo.strategy.package', 'cmo.title.thumbnail'],
    default_risk: 'D2',
    description:
      'Write a full CMO video script by integrating a 30s intro with logic-block parts and running script QA.',
    parameters: {
      brief: 'CmoVideoStrategyBrief — strategy + logic blocks for the video',
      materials: 'ScriptMaterialPack — usable lines, scenes, proof points',
      voc: 'VoiceOfCustomerPack — real customer language',
      parts: 'ScriptPart[] — one draft per logic block',
      qa_scores: 'optional ScriptQa numeric scores override',
    },
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (args, ctx): Promise<SkillResult> => {
      const brief = (args.brief as CmoVideoStrategyBrief) ?? defaultBrief();
      const materials =
        (args.materials as ScriptMaterialPack) ?? defaultMaterials(brief);
      const voc = (args.voc as VoiceOfCustomerPack) ?? defaultVoc();
      const parts = (args.parts as ScriptPart[]) ?? defaultParts(brief);

      const intro = buildIntro30s({ brief, materials, voc });
      const integrated = integrateScript({ intro, parts, brief });

      const qaScores =
        (args.qa_scores as Partial<{
          strategy_fit_score: number;
          audience_fit_score: number;
          voice_fit_score: number;
          sales_logic_score: number;
          fact_safety_score: number;
        }>) ?? {};

      const qa = evaluateScriptQa({
        strategy_fit_score: qaScores.strategy_fit_score ?? 85,
        audience_fit_score: qaScores.audience_fit_score ?? 85,
        voice_fit_score: qaScores.voice_fit_score ?? 80,
        sales_logic_score: qaScores.sales_logic_score ?? 85,
        fact_safety_score: qaScores.fact_safety_score ?? 95,
        desire_stage_coverage: stageCoverage(brief),
        logic_block_alignment: integrated.strategy_alignment_notes,
        missing_parts: [],
        revision_requests: [],
      });

      return {
        ok: true,
        skill_id: 'cmo.script.write',
        data: {
          task_id: ctx?.task_id,
          intro,
          integrated_script: integrated,
          qa_report: qa,
        },
        insight: qa.overall_pass
          ? 'Script integrates intro promise with logic blocks and passes QA.'
          : 'Script drafted but QA flagged revisions before recording.',
        suggested_next: ['cmo.voice.style'],
      };
    },
    ...overrides,
  };
}

// ── Deterministic fallbacks (no LLM) ─────────────────────────────────────────

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

function defaultMaterials(brief: CmoVideoStrategyBrief): ScriptMaterialPack {
  return {
    topic: brief.topic,
    target_viewer: brief.target_viewer.who,
    core_message_candidates: [brief.core_message],
    viewer_language: brief.target_viewer.language_style,
    pain_scenes: [brief.target_viewer.main_pain],
    desire_scenes: [brief.target_viewer.hidden_desire],
    proof_points: [],
    examples: [],
    counterarguments: [],
    metaphors: [],
    story_candidates: [],
    must_use_lines: ['콘텐츠를 아무리 많이 올려도 손님이 안 오는 이유가 있습니다'],
    must_avoid_lines: [],
    safe_claims: [],
    cta_materials: [brief.cta],
  };
}

function defaultVoc(): VoiceOfCustomerPack {
  return {
    repeated_phrases: ['손님이 안 와요'],
    pain_expressions: ['인스타 열심히 하는데 매출이 없어요'],
    desire_expressions: ['꾸준히 손님이 왔으면 좋겠어요'],
    objection_expressions: [],
    realistic_situations: [],
    must_use_language: ['열심히 했는데 왜 안 될까'],
    avoid_language: [],
  };
}

function defaultParts(brief: CmoVideoStrategyBrief): ScriptPart[] {
  return brief.logic_blocks.map((block) => ({
    block_id: block.block_id,
    draft: `${block.main_claim}.`,
    used_materials: [],
    used_voc_lines: [],
    used_claims: [],
    transition_out: block.transition_to_next_block,
    risk_notes: [],
  }));
}

function stageCoverage(
  brief: CmoVideoStrategyBrief,
): Record<ConsumerStageEn, boolean> {
  const covered = new Set(brief.consumer_desire_coverage.covered_stages);
  return {
    phenomenon: covered.has('phenomenon'),
    desire: covered.has('desire'),
    plan: covered.has('plan'),
    action: covered.has('action'),
    reward: covered.has('reward'),
  };
}
