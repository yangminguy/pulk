import { createTitleThumbnailSkill } from '../title-thumbnail';
import type { SkillExecutionContext, SkillResult } from '../../types';

describe('createTitleThumbnailSkill', () => {
  it('exposes correct skill metadata', () => {
    const skill = createTitleThumbnailSkill();

    expect(skill.skill_id).toBe('cmo.title.thumbnail');
    expect(skill.name).toBe('cmo.title.thumbnail');
    expect(skill.category).toBe('content');
    expect(skill.depends_on).toEqual(['cmo.strategy.package']);
    expect(skill.default_risk).toBe('D2');
    expect(skill.allowed_roles).toContain('CMO');
    expect(skill.permission).toBe('read');
  });

  it('runs and returns a thumbnail plan from explicit args', async () => {
    const skill = createTitleThumbnailSkill();

    const result = (await skill.run(
      {
        content_id: 'content-42',
        thumbnail_direction: '구독자 1만 돌파 전략',
      },
      { role: 'CMO', task_id: 'task-1' },
    )) as SkillResult;

    expect(result.ok).toBe(true);
    expect(result.skill_id).toBe('cmo.title.thumbnail');
    const data = result.data as { content_id: string; candidates: unknown[]; recommended: string };
    expect(data.content_id).toBe('content-42');
    expect(data.candidates.length).toBeGreaterThanOrEqual(3);
    expect(typeof data.recommended).toBe('string');
    expect(result.insight).toBeTruthy();
  });

  it('pulls content_id and direction from prior cmo.strategy.package result', async () => {
    const skill = createTitleThumbnailSkill();

    const prior = new Map<string, SkillResult>();
    prior.set('cmo.strategy.package', {
      ok: true,
      skill_id: 'cmo.strategy.package',
      data: { content_id: 'content-from-upstream', thumbnail_direction: '실수 피하는 법' },
    });

    const ctx: SkillExecutionContext = {
      role: 'CMO',
      task_id: 'task-2',
      prior_results: prior,
    };

    const result = await skill.run({}, ctx);

    expect(result.ok).toBe(true);
    const data = result.data as { content_id: string; thumbnail_direction: string };
    expect(data.content_id).toBe('content-from-upstream');
    expect(data.thumbnail_direction).toBe('실수 피하는 법');
  });

  it('honors overrides', () => {
    const skill = createTitleThumbnailSkill({ default_risk: 'D3' });
    expect(skill.default_risk).toBe('D3');
    expect(skill.skill_id).toBe('cmo.title.thumbnail');
  });
});
