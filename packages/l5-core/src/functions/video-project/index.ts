export type VideoProjectStatus = 'draft' | 'generating' | 'completed' | 'failed';

export type VideoProjectConfigSnapshot = {
  strategy?: string;
  content_style?: string;
  notes?: string;
};

export interface VideoProject {
  id: string;
  business_id: string | null;
  topic: string;
  angle: string | null;
  format: string | null;
  status: VideoProjectStatus;
  config_snapshot: VideoProjectConfigSnapshot | null;
  output_url: string | null;
  output_metadata: unknown | null;
  error: string | null;
  job_path: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateVideoProjectRequest {
  id: string;
  business_id?: string | null;
  topic: string;
  angle?: string | null;
  format?: string | null;
  config_snapshot?: VideoProjectConfigSnapshot | null;
}

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must not be empty`);
  }
  return value.trim();
}

export function createVideoProject(req: CreateVideoProjectRequest): VideoProject {
  return {
    id: req.id,
    business_id: req.business_id ?? null,
    topic: requireNonEmpty(req.topic, 'topic'),
    angle: req.angle ?? null,
    format: req.format ?? null,
    status: 'draft',
    config_snapshot: req.config_snapshot ?? null,
    output_url: null,
    output_metadata: null,
    error: null,
    job_path: null,
  };
}

export function advanceToGenerating(project: VideoProject, job_path?: string | null): VideoProject {
  if (project.status !== 'draft') {
    throw new Error('only draft projects can advance to generating');
  }
  return {
    ...project,
    status: 'generating',
    job_path: job_path ?? project.job_path ?? null,
    output_url: null,
    error: null,
  };
}

export function completeVideoProject(
  project: VideoProject,
  output_url: string,
  output_metadata: unknown = null,
): VideoProject {
  if (project.status !== 'generating') {
    throw new Error('only generating projects can be completed');
  }
  return {
    ...project,
    status: 'completed',
    output_url: requireNonEmpty(output_url, 'output_url'),
    output_metadata,
    error: null,
  };
}

export function failVideoProject(project: VideoProject, error: string): VideoProject {
  if (project.status !== 'generating') {
    throw new Error('only generating projects can be failed');
  }
  return {
    ...project,
    status: 'failed',
    output_url: null,
    error: requireNonEmpty(error, 'error'),
  };
}
