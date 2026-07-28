import { runContentPlanning, CONTENT_PLANNING_CHAIN } from './content-planning-runner';
import type { ProductionArtifactEnvelope, VideoProductionRun } from './runner';

const run: VideoProductionRun = {
  id: 'r1', project_id: 'p1', slug: 's', source_media_ref: 'n/a', status: 'planning',
  current_skill: null, progress: 0, blocker: null, active_versions: {},
  storyboard_approved_at: null, pilot_approved_at: null, factory_slug: null,
  created_at: 'now', updated_at: 'now',
};

function artifact(skill_id: string, gate_stage: string, status: 'draft' | 'blocked' = 'draft', issues: string[] = []): ProductionArtifactEnvelope {
  return {
    schema_version: 'content_planning_v1', artifact_type: gate_stage, gate_stage,
    project_id: run.project_id, run_id: run.id, version: 1, source_versions: {},
    status, issues, generated_by: skill_id, checksum: `sum-${skill_id}`, data: {},
  };
}

describe('runContentPlanning', () => {
  it('5개 스킬을 순서대로 실행하고 게이트 카드 stage를 수집한다', async () => {
    const seen: string[] = [];
    const result = await runContentPlanning({ run, context: { product: 'x' } }, {
      executeSkill: async ({ skill_id, prior_artifacts }) => {
        seen.push(skill_id);
        const step = CONTENT_PLANNING_CHAIN.find((s) => s.skill_id === skill_id)!;
        // prior가 누적 전달되는지: 첫 스킬 외에는 prior가 비어있지 않아야.
        if (skill_id !== 'content-key-plan') expect(prior_artifacts.length).toBeGreaterThan(0);
        return [artifact(skill_id, step.gate_stage)];
      },
    });
    expect(seen).toEqual(CONTENT_PLANNING_CHAIN.map((s) => s.skill_id));
    expect(result.presentCardStages).toEqual([
      'key_content_plan_doc', 'pulling_plan_doc', 'title_development', 'thumbnail_plan', 'script_draft',
    ]);
    expect(result.blocked).toHaveLength(0);
  });

  it('blocked 산출물은 체인을 멈추지 않고 기록하며, 그 stage는 presentCardStages에서 제외', async () => {
    const result = await runContentPlanning({ run, context: {} }, {
      executeSkill: async ({ skill_id }) => {
        const step = CONTENT_PLANNING_CHAIN.find((s) => s.skill_id === skill_id)!;
        if (skill_id === 'content-pulling-research') {
          return [artifact(skill_id, step.gate_stage, 'blocked', ['데이터 부족'])];
        }
        return [artifact(skill_id, step.gate_stage)];
      },
    });
    // 5개 다 실행됨(멈추지 않음)
    expect(result.artifacts).toHaveLength(5);
    // pulling만 blocked
    expect(result.blocked).toEqual([{ skill_id: 'content-pulling-research', gate_stage: 'pulling_plan_doc', issues: ['데이터 부족'] }]);
    // blocked stage는 present에서 빠짐
    expect(result.presentCardStages).not.toContain('pulling_plan_doc');
    expect(result.presentCardStages).toContain('key_content_plan_doc');
  });

  it('skill_ids로 일부만 재실행(리비전 라우팅)하고 prior를 유지', async () => {
    const prior = [artifact('content-key-plan', 'key_content_plan_doc')];
    const called: string[] = [];
    const result = await runContentPlanning(
      { run, context: {}, prior_artifacts: prior, skill_ids: ['content-thumbnail-develop'] },
      {
        executeSkill: async ({ skill_id }) => {
          called.push(skill_id);
          return [artifact(skill_id, 'thumbnail_plan')];
        },
      },
    );
    expect(called).toEqual(['content-thumbnail-develop']);
    expect(result.presentCardStages).toEqual(['key_content_plan_doc', 'thumbnail_plan']);
  });

  it('executeSkill이 throw하면 해당 스킬 이름과 함께 실패를 전파한다', async () => {
    await expect(runContentPlanning({ run, context: {} }, {
      executeSkill: async () => { throw new Error('claude died'); },
    })).rejects.toThrow(/content-key-plan failed: claude died/);
  });
});
