import type { AgentSkill, SkillResult, SkillExecutionContext } from '../types';
import type { VideoExecutionBrief } from '../../video-room/types';
import {
  prepareFactoryHandoff,
  type PrepareHandoffIds,
  type VideoExecutionBriefRecord,
} from '../../video-room/factory-handoff';
import {
  generateSlideDeckPipeline,
  type SlideDeckGenerationInput,
  type SlideDeckGenerationDeps,
} from '../../../services/slide-deck-generator';

/**
 * cmo.factory.handoff — experiment-category skill that prepares the CMO →
 * AI Slide Factory handoff (PRD v3 §6 step 7 "AI Slide Factory 전달").
 *
 * Thin adapter over two domain functions; it reimplements neither:
 *   1. video-room/factory-handoff.prepareFactoryHandoff — validates the
 *      VideoExecutionBrief and produces a VideoExecutionBriefRecord (valid /
 *      invalid, handoff_status='not_sent'). Outbound delivery (sendToFactory) is
 *      an approval-gated D3 action and is intentionally NOT performed here.
 *   2. services/slide-deck-generator.generateSlideDeckPipeline — optionally
 *      builds a fallback slide deck the Factory can use when an asset is missing
 *      (CMO_TO_FACTORY_CONTRACT.md §10). Off by default; enabled per-call.
 *
 * Inputs are read from `args` so the skill is deterministic. The brief comes from
 * the prior cmo.voice.brief result (via ctx.prior_results) or directly from args.
 * id / created_at are caller-injected (the domain function never calls Date or
 * randomUUID).
 */
export interface FactoryHandoffArgs {
  /** The brief to hand off. Falls back to the cmo.voice.brief prior result. */
  brief?: VideoExecutionBrief;
  /** Caller-injected stable record id + ISO-8601 created_at (never generated). */
  ids: PrepareHandoffIds;
  /** When true, also generate a fallback slide deck via the pipeline. */
  generate_slide_deck?: boolean;
  /** Slide deck pipeline input override (only used when generate_slide_deck). */
  slide_deck_input?: SlideDeckGenerationInput;
  /** Slide deck pipeline deps (injected llmComplete / retries). */
  slide_deck_deps?: SlideDeckGenerationDeps;
}

export function createFactoryHandoffSkill(
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: 'cmo.factory.handoff',
    skill_id: 'cmo.factory.handoff',
    category: 'experiment',
    depends_on: ['cmo.voice.brief'],
    default_risk: 'D2',
    description:
      'Prepare the CMO → AI Slide Factory handoff: validate the VideoExecutionBrief into a record (not sent — delivery is an approval-gated D3 action) and optionally build a fallback slide deck.',
    parameters: {
      brief: 'VideoExecutionBrief — falls back to the cmo.voice.brief prior result',
      ids: 'PrepareHandoffIds — caller-injected { id, created_at }',
      generate_slide_deck: 'boolean — also build a fallback slide deck',
      slide_deck_input: 'SlideDeckGenerationInput — override deck input',
      slide_deck_deps: 'SlideDeckGenerationDeps — injected llmComplete / retries',
    },
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (args, ctx): Promise<SkillResult> => {
      const a = args as unknown as FactoryHandoffArgs;

      // The orchestrator injects prior_results at runtime; the static
      // ToolRunContext type doesn't declare it yet (Stage 3 owns types.ts).
      const prior = (ctx as SkillExecutionContext | undefined)?.prior_results;
      const brief = a.brief ?? extractBriefFromPrior(prior);
      if (!brief) {
        throw new Error(
          'cmo.factory.handoff: no VideoExecutionBrief in args or cmo.voice.brief prior result',
        );
      }
      if (!a.ids?.id || !a.ids?.created_at) {
        throw new Error(
          'cmo.factory.handoff: ids.id and ids.created_at must be injected by the caller',
        );
      }

      const record: VideoExecutionBriefRecord = prepareFactoryHandoff(
        brief,
        a.ids,
      );

      let slide_deck: { source: string; slide_count: number } | undefined;
      if (a.generate_slide_deck) {
        const input: SlideDeckGenerationInput =
          a.slide_deck_input ?? {
            topic: brief.title,
            audience: brief.target_viewer.who,
            keyPoints: [brief.strategy.core_message],
            context: brief.script.intro_30s,
          };
        const deck = await generateSlideDeckPipeline(input, a.slide_deck_deps ?? {});
        if (deck.status === 'success') {
          slide_deck = { source: deck.source, slide_count: deck.spec.slides.length };
        }
      }

      return {
        ok: true,
        skill_id: 'cmo.factory.handoff',
        data: {
          task_id: ctx?.task_id,
          record,
          slide_deck,
        },
        insight:
          record.validation_status === 'valid'
            ? 'Brief validated and ready for the AI Slide Factory; delivery is the next approval-gated step.'
            : 'Brief is invalid and must be fixed before it can be sent to the Factory.',
      };
    },
    ...overrides,
  };
}

/** Pull a VideoExecutionBrief out of the cmo.voice.brief prior result, if present. */
function extractBriefFromPrior(
  prior?: Map<string, SkillResult>,
): VideoExecutionBrief | undefined {
  const result = prior?.get('cmo.voice.brief');
  const brief = (result?.data as { brief?: VideoExecutionBrief } | undefined)
    ?.brief;
  return brief;
}
