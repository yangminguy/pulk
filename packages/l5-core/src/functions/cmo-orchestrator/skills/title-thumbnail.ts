import type { AgentSkill, SkillResult, SkillExecutionContext } from '../types';
import {
  buildThumbnailPlan,
  type BuildThumbnailPlanInput,
} from '../../video-room/thumbnail-plan';
import type {
  ThumbnailPattern,
  ReferenceCandidate,
} from '../../video-room/types';

/**
 * createTitleThumbnailSkill — thin orchestration adapter over the video-room
 * domain function buildThumbnailPlan (PRD §16.8). Depends on the upstream
 * strategy package skill for content_id / thumbnail_direction context.
 */
export function createTitleThumbnailSkill(
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: 'cmo.title.thumbnail',
    skill_id: 'cmo.title.thumbnail',
    category: 'content',
    depends_on: ['cmo.strategy.package'],
    default_risk: 'D2',
    description: 'Generate thumbnail candidates and a recommended pick for a key content.',
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (args, ctx): Promise<SkillResult> => {
      const a = (args ?? {}) as Partial<BuildThumbnailPlanInput>;
      const prior = (ctx as SkillExecutionContext | undefined)?.prior_results;
      const upstream = prior?.get('cmo.strategy.package')?.data as
        | Record<string, unknown>
        | undefined;

      const input: BuildThumbnailPlanInput = {
        content_id:
          a.content_id ??
          (upstream?.content_id as string | undefined) ??
          ctx?.task_id ??
          'content-unknown',
        thumbnail_direction:
          a.thumbnail_direction ??
          (upstream?.thumbnail_direction as string | undefined) ??
          (a.brief?.thumbnail_direction as string | undefined) ??
          '클릭을 유도하는 핵심 메시지',
        reference_patterns: (a.reference_patterns ?? []) as ThumbnailPattern[],
        reference_candidates: (a.reference_candidates ?? []) as ReferenceCandidate[],
        brief: a.brief,
        extra_insights: a.extra_insights,
      };

      const plan = buildThumbnailPlan(input);

      return {
        ok: true,
        skill_id: 'cmo.title.thumbnail',
        data: plan,
        insight: plan.why_recommended,
      };
    },
    ...overrides,
  };
}
