import type { AgentSkill, SkillResult, SkillExecutionContext } from '../types';
import {
  assemblePullingContentPlan,
  type PullingContentPlan,
} from '../../video-room/pulling-content-planning';

/**
 * cmo.pulling.plan — thin orchestration adapter over the video-room Pulling
 * Content Planning domain (PRD §4 Step 0–12).
 *
 * Domain logic lives in pulling-content-planning.ts. This skill only:
 *  1. reads the assembled PullingContentPlan from args (or the prior
 *     cmo.keycontent.plan result via ctx.prior_results),
 *  2. validates/finalizes it through assemblePullingContentPlan (which enforces
 *     the PRD-forbidden rules with throw), and
 *  3. returns the approved pulling content set.
 */
export function createPullingContentSkill(
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: 'cmo.pulling.plan',
    skill_id: 'cmo.pulling.plan',
    category: 'content',
    depends_on: ['cmo.keycontent.plan'],
    default_risk: 'D2',
    description:
      'Validate and finalize the pulling content plan that funnels viewers into the approved key content (PRD §4).',
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (args, ctx): Promise<SkillResult> => {
      const skillCtx = ctx as SkillExecutionContext | undefined;
      const priorData = skillCtx?.prior_results?.get('cmo.keycontent.plan')?.data as
        | { pulling_plan?: PullingContentPlan }
        | undefined;
      const plan = (args?.plan ?? priorData?.pulling_plan) as
        | PullingContentPlan
        | undefined;

      if (!plan) {
        return {
          ok: false,
          skill_id: 'cmo.pulling.plan',
          error:
            'No pulling content plan provided (args.plan or prior cmo.keycontent.plan result required).',
        };
      }

      const validated = assemblePullingContentPlan(plan);
      const set = validated.step12_approved_set;

      return {
        ok: true,
        skill_id: 'cmo.pulling.plan',
        data: {
          task_id: ctx?.task_id,
          approved_set: set,
          journey_coverage: validated.step11_journey_coverage,
          key_title: validated.step0_key_sales_logic.key_title,
          pulling_topic_count: set.pulling_topics.length,
        },
        insight: `${set.pulling_topics.length} pulling topics validated against the full consumer journey for "${validated.step0_key_sales_logic.key_title}".`,
      };
    },
    ...overrides,
  };
}
