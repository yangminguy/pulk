export interface ProductionArtifactEnvelope<T = unknown> {
  schema_version: 'video_production_v1' | 'content_planning_v1'; artifact_type: string; project_id: string; run_id: string; version: number;
  source_versions: Record<string, number>; status: 'draft' | 'approved' | 'blocked'; issues: string[]; generated_by: string; checksum: string; data: T;
  /** content_planning_v1 전용: 이 아티팩트가 채우는 게이트 리포트 stage. */
  gate_stage?: string;
}

export interface VideoProductionRun {
  id: string; project_id: string; slug: string; source_media_ref: string; status: string; current_skill: string | null;
  progress: number; blocker: string | null; active_versions: Record<string, number>; storyboard_approved_at: string | null;
  pilot_approved_at: string | null; factory_slug: string | null; created_at: string; updated_at: string;
}

export const VIDEO_PLANNING_SKILLS = [
  'video-content-brief',
  'video-scene-planner',
  'video-slide-worker',
  'video-media-prep',
  'video-rough-cut-planner',
  'video-asset-director',
  'video-motion-graphics',
  'video-sound-designer',
  'video-caption-designer',
] as const;

export type VideoPlanningSkillId = (typeof VIDEO_PLANNING_SKILLS)[number];

export interface VideoSkillExecutionInput {
  run: VideoProductionRun;
  skill_id: VideoPlanningSkillId;
  context: Record<string, unknown>;
  prior_artifacts: ProductionArtifactEnvelope[];
}

export interface VideoProductionRunnerDeps {
  executeSkill(input: VideoSkillExecutionInput): Promise<ProductionArtifactEnvelope | ProductionArtifactEnvelope[]>;
  onProgress?(event: { skill_id: VideoPlanningSkillId; status: 'running' | 'completed' | 'failed'; completed: number; total: number; error?: string }): Promise<void> | void;
}

function validateArtifact(run: VideoProductionRun, artifact: ProductionArtifactEnvelope): void {
  if (artifact.schema_version !== 'video_production_v1') throw new Error(`${artifact.artifact_type}: unsupported schema_version`);
  if (artifact.run_id !== run.id || artifact.project_id !== run.project_id) throw new Error(`${artifact.artifact_type}: run identity mismatch`);
  if (!Number.isInteger(artifact.version) || artifact.version < 1) throw new Error(`${artifact.artifact_type}: invalid version`);
  if (!artifact.checksum) throw new Error(`${artifact.artifact_type}: checksum is required`);
}

/**
 * Execute the planning chain while preserving explicit dependency boundaries.
 * The slide worker can return many per-scene fragments in one invocation; media
 * and editorial planning then consume the fixed scene structure.
 */
export async function runVideoProductionPlanning(
  input: {
    run: VideoProductionRun;
    context: Record<string, unknown>;
    prior_artifacts?: ProductionArtifactEnvelope[];
    skill_ids?: VideoPlanningSkillId[];
  },
  deps: VideoProductionRunnerDeps,
): Promise<ProductionArtifactEnvelope[]> {
  const artifacts: ProductionArtifactEnvelope[] = [...(input.prior_artifacts ?? [])];
  const skills = input.skill_ids ?? [...VIDEO_PLANNING_SKILLS];
  const total = skills.length;
  for (const [index, skill_id] of skills.entries()) {
    await deps.onProgress?.({ skill_id, status: 'running', completed: index, total });
    try {
      const result = await deps.executeSkill({ ...input, skill_id, prior_artifacts: [...artifacts] });
      const next = Array.isArray(result) ? result : [result];
      next.forEach((artifact) => validateArtifact(input.run, artifact));
      artifacts.push(...next);
      await deps.onProgress?.({ skill_id, status: 'completed', completed: index + 1, total });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.onProgress?.({ skill_id, status: 'failed', completed: index, total, error: message });
      throw new Error(`${skill_id} failed: ${message}`);
    }
  }
  return artifacts;
}
