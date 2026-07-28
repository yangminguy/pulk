import { runVideoProductionPlanning, VIDEO_PLANNING_SKILLS, type ProductionArtifactEnvelope, type VideoProductionRun } from './runner';

const run: VideoProductionRun = {
  id: 'run-1', project_id: 'project-1', slug: 'slug', source_media_ref: 'source.mov', status: 'planning', current_skill: null,
  progress: 0, blocker: null, active_versions: {}, storyboard_approved_at: null, pilot_approved_at: null, factory_slug: null,
  created_at: 'now', updated_at: 'now',
};

describe('runVideoProductionPlanning', () => {
  it('executes the skill chain in order and validates identities', async () => {
    const order: string[] = [];
    const result = await runVideoProductionPlanning({ run, context: {} }, {
      async executeSkill({ skill_id }) {
        order.push(skill_id);
        return {
          schema_version: 'video_production_v1', artifact_type: skill_id === 'video-content-brief' ? '01_content_brief' : '02_scene_plan',
          project_id: run.project_id, run_id: run.id, version: 1, source_versions: {}, status: 'draft', issues: [], generated_by: skill_id,
          checksum: skill_id, data: {},
        } as ProductionArtifactEnvelope;
      },
    });
    expect(order).toEqual(VIDEO_PLANNING_SKILLS);
    expect(result).toHaveLength(VIDEO_PLANNING_SKILLS.length);
  });

  it('stops at the first invalid artifact', async () => {
    await expect(runVideoProductionPlanning({ run, context: {} }, {
      async executeSkill({ skill_id }) {
        return { schema_version: 'video_production_v1', artifact_type: '01_content_brief', project_id: 'wrong', run_id: run.id, version: 1, source_versions: {}, status: 'draft', issues: [], generated_by: skill_id, checksum: 'x', data: {} } as ProductionArtifactEnvelope;
      },
    })).rejects.toThrow(/identity mismatch/);
  });

  it('reruns only requested owning skills while retaining valid prior artifacts', async () => {
    const prior = { schema_version: 'video_production_v1', artifact_type: '01_content_brief', project_id: run.project_id, run_id: run.id, version: 1, source_versions: {}, status: 'draft', issues: [], generated_by: 'video-content-brief', checksum: 'prior', data: {} } as ProductionArtifactEnvelope;
    const called: string[] = [];
    const result = await runVideoProductionPlanning({ run, context: {}, prior_artifacts: [prior], skill_ids: ['video-caption-designer'] }, {
      async executeSkill({ skill_id, prior_artifacts }) {
        called.push(skill_id);
        expect(prior_artifacts).toContain(prior);
        return { ...prior, artifact_type: '08_caption_plan', version: 2, generated_by: skill_id, checksum: 'caption-v2' };
      },
    });
    expect(called).toEqual(['video-caption-designer']);
    expect(result.map((artifact) => artifact.artifact_type)).toEqual(['01_content_brief', '08_caption_plan']);
  });
});
