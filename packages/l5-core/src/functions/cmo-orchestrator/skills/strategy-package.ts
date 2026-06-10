import type { AgentSkill, SkillResult } from '../types';
import {
  assembleContentStrategyPackage,
  type AssembleContentStrategyPackageInput,
} from '../../video-room/content-strategy-package';

/**
 * cmo.strategy.package — analysis skill that merges a finalized key content
 * topic and a finalized pulling content set into one
 * ApprovedContentStrategyPackage.
 *
 * Thin adapter over video-room/content-strategy-package.assembleContentStrategyPackage.
 * The full AssembleContentStrategyPackageInput is supplied via `args` by the
 * caller (assembled from the prior cmo.keycontent.plan / cmo.pulling.plan
 * results). The skill performs no domain logic itself; PRD-forbidden states are
 * enforced (by throwing) inside the domain function.
 */
export function createStrategyPackageSkill(
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: 'cmo.strategy.package',
    skill_id: 'cmo.strategy.package',
    category: 'analysis',
    depends_on: ['cmo.keycontent.plan', 'cmo.pulling.plan'],
    default_risk: 'D2',
    description:
      'Assemble the finalized key content topic and pulling content set into a single approved content strategy package.',
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (args, ctx): Promise<SkillResult> => {
      const input = args as unknown as AssembleContentStrategyPackageInput;
      const pkg = assembleContentStrategyPackage(input);

      return {
        ok: true,
        skill_id: 'cmo.strategy.package',
        data: {
          task_id: ctx?.task_id,
          package: pkg,
        },
        insight:
          'One coherent content strategy: key content drives, pulling content covers the full consumer journey.',
      };
    },
    ...overrides,
  };
}
