import type { AgentSkill, SkillResult } from '../types';

export function createMarketResearchSkill(
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: 'cmo.research.market',
    skill_id: 'cmo.research.market',
    category: 'research',
    depends_on: [],
    default_risk: 'D2',
    description: 'Create a compact market research pack for a CMO task.',
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (_args, ctx): Promise<SkillResult> => ({
      ok: true,
      skill_id: 'cmo.research.market',
      data: {
        task_id: ctx?.task_id,
        segments: ['founder-led operators', 'workflow-heavy solo teams'],
        competitors: ['spreadsheet workflows', 'generic task managers'],
        buying_trigger: 'Repeated execution bottlenecks without a dedicated operator',
      },
      insight: 'Founder-led operators need sharper execution visibility before adding tools.',
      suggested_next: ['cmo.positioning.message'],
    }),
    ...overrides,
  };
}
