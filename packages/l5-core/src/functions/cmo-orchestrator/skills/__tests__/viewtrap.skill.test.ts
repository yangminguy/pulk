import { createViewtrapValidateSkill } from '../viewtrap';
import type { SkillResult } from '../../types';

const baseCandidate = {
  validated_keywords: ['kw1'],
  candidate_titles: ['title 1'],
  performance_score: 'good' as const,
  contribution_score: 'normal' as const,
  growth_status: 'growing' as const,
  channel_value_risk: false,
  person_value_risk: false,
};

const ctx = {
  task_id: 'task-viewtrap-1',
  role: 'CMO' as const,
};

describe('createViewtrapValidateSkill', () => {
  it('exposes the correct skill metadata', () => {
    const skill = createViewtrapValidateSkill();
    expect(skill.skill_id).toBe('cmo.viewtrap.validate');
    expect(skill.name).toBe('cmo.viewtrap.validate');
    expect(skill.category).toBe('research');
    expect(skill.depends_on).toEqual([]);
    expect(skill.default_risk).toBe('D2');
    expect(skill.allowed_roles).toEqual(['CMO']);
    expect(skill.permission).toBe('read');
  });

  it('validates candidates and keeps sales-viable verdicts via domain functions', async () => {
    const skill = createViewtrapValidateSkill();
    const result = (await skill.run({ candidates: [baseCandidate] }, ctx)) as SkillResult;

    expect(result.ok).toBe(true);
    expect(result.skill_id).toBe('cmo.viewtrap.validate');
    const data = result.data as {
      validated: Array<{ verdict: string }>;
      viable_candidates: unknown[];
      viable_count: number;
      task_id?: string;
    };
    // 'good' performance_score -> verdict 'use' -> sales-viable
    expect(data.validated[0].verdict).toBe('use');
    expect(data.viable_count).toBe(1);
    expect(data.viable_candidates).toHaveLength(1);
    expect(data.task_id).toBe('task-viewtrap-1');
  });

  it('reports zero viable candidates when domain rules reject', async () => {
    const skill = createViewtrapValidateSkill();
    const rejected = {
      ...baseCandidate,
      channel_value_risk: true, // domain rule: any value risk -> reject
    };
    const result = await skill.run({ candidates: [rejected] }, ctx);

    expect(result.ok).toBe(true);
    const data = result.data as { validated: Array<{ verdict: string }>; viable_count: number };
    expect(data.validated[0].verdict).toBe('reject');
    expect(data.viable_count).toBe(0);
  });

  it('handles missing candidates arg with an empty result', async () => {
    const skill = createViewtrapValidateSkill();
    const result = await skill.run({}, ctx);
    expect(result.ok).toBe(true);
    const data = result.data as { viable_count: number; validated: unknown[] };
    expect(data.validated).toEqual([]);
    expect(data.viable_count).toBe(0);
  });
});
