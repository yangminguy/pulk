import {
  advanceToGenerating,
  completeVideoProject,
  createVideoProject,
  failVideoProject,
  type VideoProject,
} from '../index';

function makeDraft(overrides: Partial<VideoProject> = {}): VideoProject {
  return createVideoProject({
    id: 'video-1',
    business_id: 'business-1',
    topic: 'AI founder operating system launch video',
    angle: 'show weekly decision velocity',
    format: 'short-form',
    config_snapshot: {
      strategy: 'PMF proof before tooling',
      content_style: 'direct founder memo',
      notes: 'Use real workflow evidence',
    },
    ...overrides,
  });
}

describe('createVideoProject', () => {
  it('creates a draft VideoProject from a valid brief', () => {
    const project = makeDraft();

    expect(project).toMatchObject({
      id: 'video-1',
      business_id: 'business-1',
      topic: 'AI founder operating system launch video',
      angle: 'show weekly decision velocity',
      format: 'short-form',
      status: 'draft',
      output_url: null,
      output_metadata: null,
      error: null,
      job_path: null,
    });
    expect(project.config_snapshot).toEqual({
      strategy: 'PMF proof before tooling',
      content_style: 'direct founder memo',
      notes: 'Use real workflow evidence',
    });
  });

  it('throws when topic is empty or whitespace', () => {
    expect(() => makeDraft({ topic: '' })).toThrow('topic must not be empty');
    expect(() => makeDraft({ topic: '   ' })).toThrow('topic must not be empty');
  });
});

describe('advanceToGenerating', () => {
  it('transitions draft to generating and stores the generated job path', () => {
    const project = advanceToGenerating(makeDraft(), '/tmp/video-jobs/video-1.json');

    expect(project.status).toBe('generating');
    expect(project.job_path).toBe('/tmp/video-jobs/video-1.json');
    expect(project.output_url).toBeNull();
    expect(project.error).toBeNull();
  });

  it.each(['generating', 'completed', 'failed'] as const)(
    'throws when advancing a %s project',
    (status) => {
      const project = { ...makeDraft(), status };

      expect(() => advanceToGenerating(project)).toThrow('only draft projects can advance to generating');
    },
  );
});

describe('completeVideoProject', () => {
  it('transitions generating to completed and stores output details', () => {
    const generating = advanceToGenerating(makeDraft(), '/tmp/video-jobs/video-1.json');
    const project = completeVideoProject(generating, 'https://cdn.example.com/video-1.mp4', {
      duration_seconds: 42,
      provider_job_id: 'job-1',
    });

    expect(project.status).toBe('completed');
    expect(project.output_url).toBe('https://cdn.example.com/video-1.mp4');
    expect(project.output_metadata).toEqual({
      duration_seconds: 42,
      provider_job_id: 'job-1',
    });
    expect(project.error).toBeNull();
  });

  it('throws when output_url is empty or whitespace', () => {
    const generating = advanceToGenerating(makeDraft());

    expect(() => completeVideoProject(generating, '')).toThrow('output_url must not be empty');
    expect(() => completeVideoProject(generating, '   ')).toThrow('output_url must not be empty');
  });

  it.each(['draft', 'completed', 'failed'] as const)(
    'throws when completing a %s project',
    (status) => {
      const project = { ...makeDraft(), status };

      expect(() => completeVideoProject(project, 'https://cdn.example.com/video-1.mp4')).toThrow(
        'only generating projects can be completed',
      );
    },
  );
});

describe('failVideoProject', () => {
  it('transitions generating to failed and stores the error', () => {
    const generating = advanceToGenerating(makeDraft(), '/tmp/video-jobs/video-1.json');
    const project = failVideoProject(generating, 'provider timed out');

    expect(project.status).toBe('failed');
    expect(project.error).toBe('provider timed out');
    expect(project.output_url).toBeNull();
  });

  it('throws when error is empty or whitespace', () => {
    const generating = advanceToGenerating(makeDraft());

    expect(() => failVideoProject(generating, '')).toThrow('error must not be empty');
    expect(() => failVideoProject(generating, '   ')).toThrow('error must not be empty');
  });

  it.each(['draft', 'completed', 'failed'] as const)(
    'throws when failing a %s project',
    (status) => {
      const project = { ...makeDraft(), status };

      expect(() => failVideoProject(project, 'provider timed out')).toThrow(
        'only generating projects can be failed',
      );
    },
  );
});
