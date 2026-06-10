import { createScriptWriteSkill } from '../script';
import type { SkillResult } from '../../types';

describe('createScriptWriteSkill', () => {
  it('exposes correct skill metadata', () => {
    const skill = createScriptWriteSkill();
    expect(skill.skill_id).toBe('cmo.script.write');
    expect(skill.name).toBe('cmo.script.write');
    expect(skill.category).toBe('content');
    expect(skill.depends_on).toEqual([
      'cmo.strategy.package',
      'cmo.title.thumbnail',
    ]);
    expect(skill.default_risk).toBe('D2');
    expect(skill.allowed_roles).toContain('CMO');
    expect(skill.permission).toBe('read');
  });

  it('applies overrides', () => {
    const skill = createScriptWriteSkill({ default_risk: 'D3' });
    expect(skill.default_risk).toBe('D3');
    expect(skill.skill_id).toBe('cmo.script.write');
  });

  it('runs and returns ok:true with an integrated script and QA report', async () => {
    const skill = createScriptWriteSkill();
    const result = (await skill.run(
      {},
      { role: 'CMO', task_id: 'task-script-001' },
    )) as SkillResult;

    expect(result.ok).toBe(true);
    expect(result.skill_id).toBe('cmo.script.write');

    const data = result.data as {
      task_id?: string;
      intro: { script: string; viewer_promise: string };
      integrated_script: { full_script: string; section_map: string[] };
      qa_report: { overall_pass: boolean };
    };

    expect(data.task_id).toBe('task-script-001');
    expect(data.intro.script.length).toBeGreaterThan(0);
    expect(data.integrated_script.full_script).toContain(data.intro.script.trim());
    expect(data.integrated_script.section_map.length).toBeGreaterThan(0);
    expect(typeof data.qa_report.overall_pass).toBe('boolean');
    expect(data.qa_report.overall_pass).toBe(true);
  });

  it('honours qa_scores override to fail QA', async () => {
    const skill = createScriptWriteSkill();
    const result = (await skill.run(
      { qa_scores: { fact_safety_score: 10 } },
      { role: 'CMO', task_id: 'task-script-002' },
    )) as SkillResult;

    const data = result.data as { qa_report: { overall_pass: boolean } };
    expect(result.ok).toBe(true);
    expect(data.qa_report.overall_pass).toBe(false);
  });
});
