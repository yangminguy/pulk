import { createKeyContentSkill } from '../key-content';
import type { SkillExecutionContext, SkillResult } from '../../types';

function makeCtx(): SkillExecutionContext {
  return {
    role: 'CMO',
    task_id: 'task-kc-1',
    prior_results: new Map<string, SkillResult>(),
  };
}

describe('createKeyContentSkill', () => {
  it('exposes correct skill metadata', () => {
    const skill = createKeyContentSkill();
    expect(skill.skill_id).toBe('cmo.keycontent.plan');
    expect(skill.name).toBe('cmo.keycontent.plan');
    expect(skill.category).toBe('content');
    expect(skill.depends_on).toEqual([]);
    expect(skill.allowed_roles).toContain('CMO');
  });

  it('applies overrides', () => {
    const skill = createKeyContentSkill({ default_risk: 'D3' });
    expect(skill.default_risk).toBe('D3');
    expect(skill.skill_id).toBe('cmo.keycontent.plan');
  });

  it('run() returns ok:true with an assembled 11-step plan (deterministic fallback)', async () => {
    const skill = createKeyContentSkill();
    const result = (await skill.run({}, makeCtx())) as SkillResult;

    expect(result.ok).toBe(true);
    expect(result.skill_id).toBe('cmo.keycontent.plan');
    const plan = (result.data as { plan: Record<string, unknown> }).plan;
    expect(plan.step1_generalization).toBeDefined();
    expect(plan.step11_approved_topic).toBeDefined();
    expect(Array.isArray(plan.step9_viable_candidates)).toBe(true);
    expect((plan.step9_viable_candidates as unknown[]).length).toBeGreaterThan(0);
    expect(result.insight).toContain('진입 단계');
  });

  it('run() honors a supplied product brief', async () => {
    const skill = createKeyContentSkill();
    const result = await skill.run(
      { product: { product_name: '테스트상품', category: '테스트카테고리' } },
      makeCtx(),
    );
    expect(result.ok).toBe(true);
    const plan = (result.data as { plan: { step1_generalization: { item_name: string } } }).plan;
    expect(plan.step1_generalization.item_name).toBe('테스트상품');
  });
});
