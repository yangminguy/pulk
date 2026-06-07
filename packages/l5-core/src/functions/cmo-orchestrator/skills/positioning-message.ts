import type { AgentSkill, SkillResult } from '../types';

export function createPositioningMessageSkill(
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: 'cmo.positioning.message',
    skill_id: 'cmo.positioning.message',
    category: 'positioning',
    depends_on: ['cmo.research.market'],
    default_risk: 'D2',
    description: 'Create PMF positioning message variants from market research.',
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (_args, ctx): Promise<SkillResult> => ({
      ok: true,
      skill_id: 'cmo.positioning.message',
      data: {
        task_id: ctx?.task_id,
        variants: [
          'Run the business without losing the founder in operational noise.',
          'Turn founder decisions into an execution system your team can trust.',
        ],
      },
      insight: 'Positioning should emphasize decision-to-execution continuity.',
    }),
    ...overrides,
  };
}
