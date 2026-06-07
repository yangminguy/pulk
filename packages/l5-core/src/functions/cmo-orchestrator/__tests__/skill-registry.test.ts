import { createSkillRegistry } from '../skill-registry';
import type { AgentSkill } from '../types';

function makeSkill(overrides: Partial<AgentSkill> = {}): AgentSkill {
  const skillId = overrides.skill_id ?? 'cmo.research.market';

  return {
    name: skillId,
    skill_id: skillId,
    category: 'research',
    depends_on: [],
    default_risk: 'D2',
    description: 'Test CMO skill',
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async () => ({
      ok: true,
      skill_id: skillId,
      data: { skillId },
    }),
    ...overrides,
  };
}

describe('SkillRegistry', () => {
  it('registers and retrieves AgentSkill instances by skill_id', () => {
    const skill = makeSkill();
    const registry = createSkillRegistry([skill]);

    expect(registry.get('cmo.research.market')).toBe(skill);
    expect(registry.all()).toEqual([skill]);
  });

  it('filters skills by CMO skill category', () => {
    const researchSkill = makeSkill({ skill_id: 'cmo.research.market', name: 'cmo.research.market', category: 'research' });
    const positioningSkill = makeSkill({
      skill_id: 'cmo.positioning.message',
      name: 'cmo.positioning.message',
      category: 'positioning',
    });

    const registry = createSkillRegistry([researchSkill, positioningSkill]);

    expect(registry.byCategory('research')).toEqual([researchSkill]);
    expect(registry.byCategory('positioning')).toEqual([positioningSkill]);
  });

  it('orders requested skills after their dependencies', () => {
    const researchSkill = makeSkill({ skill_id: 'cmo.research.market', name: 'cmo.research.market' });
    const positioningSkill = makeSkill({
      skill_id: 'cmo.positioning.message',
      name: 'cmo.positioning.message',
      category: 'positioning',
      depends_on: ['cmo.research.market'],
    });

    const registry = createSkillRegistry([positioningSkill, researchSkill]);

    expect(registry.resolveDependencies(['cmo.positioning.message'])).toEqual([
      'cmo.research.market',
      'cmo.positioning.message',
    ]);
  });

  it('throws when dependency resolution finds an unknown skill id', () => {
    const positioningSkill = makeSkill({
      skill_id: 'cmo.positioning.message',
      name: 'cmo.positioning.message',
      category: 'positioning',
      depends_on: ['cmo.research.market'],
    });

    const registry = createSkillRegistry([positioningSkill]);

    expect(() => registry.resolveDependencies(['cmo.positioning.message'])).toThrow(
      /cmo\.research\.market/
    );
  });

  it('throws when dependency resolution detects a cycle', () => {
    const researchSkill = makeSkill({
      skill_id: 'cmo.research.market',
      name: 'cmo.research.market',
      depends_on: ['cmo.positioning.message'],
    });
    const positioningSkill = makeSkill({
      skill_id: 'cmo.positioning.message',
      name: 'cmo.positioning.message',
      category: 'positioning',
      depends_on: ['cmo.research.market'],
    });

    const registry = createSkillRegistry([researchSkill, positioningSkill]);

    expect(() => registry.resolveDependencies(['cmo.positioning.message'])).toThrow(/cycle|circular/i);
  });
});
