import {
  createScriptPlan,
  createScriptDraft,
  approveScriptDraft,
  requestScriptRevision,
  toReadingScript,
  createVoiceRecording,
  attachVoiceFile,
  markVoiceQuality,
  buildSlideDeckSpec,
  slideDeckToVideoJob,
  createRenderJob,
  submitRenderJob,
  completeRenderJob,
  failRenderJob,
} from '../production';
import { createInMemoryVideoFactoryTransport } from '../../memory/video-factory';
import type { SlideSpec } from '../types';

// ── ScriptPlan ────────────────────────────────────────────────────────────────

describe('createScriptPlan', () => {
  it('creates a ScriptPlan with sections', () => {
    const plan = createScriptPlan({
      id: 'p1',
      video_project_id: 'vp1',
      approved_title: '마케팅 3단계',
      sections: ['섹션1', '섹션2'],
    });
    expect(plan.id).toBe('p1');
    expect(plan.approved_title).toBe('마케팅 3단계');
    expect(plan.sections).toHaveLength(2);
  });

  it('throws when approved_title is empty', () => {
    expect(() =>
      createScriptPlan({ id: 'p1', video_project_id: 'vp1', approved_title: '  ', sections: [] }),
    ).toThrow('approved_title');
  });

  it('throws when approved_title is missing', () => {
    expect(() =>
      createScriptPlan({
        id: 'p1',
        video_project_id: 'vp1',
        approved_title: '',
        sections: [],
      }),
    ).toThrow('approved_title');
  });
});

// ── ScriptDraft ───────────────────────────────────────────────────────────────

describe('createScriptDraft', () => {
  it('creates a draft with approval_status draft', () => {
    const draft = createScriptDraft({
      id: 'd1',
      video_project_id: 'vp1',
      script_plan_id: 'p1',
      full_script: '전체 원고',
    });
    expect(draft.approval_status).toBe('draft');
    expect(draft.full_script).toBe('전체 원고');
  });

  it('throws when full_script is empty', () => {
    expect(() =>
      createScriptDraft({
        id: 'd1',
        video_project_id: 'vp1',
        script_plan_id: 'p1',
        full_script: '',
      }),
    ).toThrow('full_script');
  });
});

describe('approveScriptDraft / requestScriptRevision', () => {
  const base = createScriptDraft({
    id: 'd1',
    video_project_id: 'vp1',
    script_plan_id: 'p1',
    full_script: '원고 내용',
  });

  it('approves a draft', () => {
    expect(approveScriptDraft(base).approval_status).toBe('approved');
  });

  it('requests revision', () => {
    expect(requestScriptRevision(base).approval_status).toBe('needs_revision');
  });

  it('does not mutate the original', () => {
    approveScriptDraft(base);
    expect(base.approval_status).toBe('draft');
  });
});

// ── ReadingScript ─────────────────────────────────────────────────────────────

describe('toReadingScript', () => {
  it('creates a ReadingScript with slide sections', () => {
    const rs = toReadingScript({
      id: 'rs1',
      video_project_id: 'vp1',
      script_draft_id: 'd1',
      slides: [
        { slide: 1, lines: ['작은 브랜드가 / 마케팅할 때'], emphasis: ['광고부터 켜는 겁니다.'] },
        { slide: 2, lines: ['그런데 문제는 / 광고가 아닙니다.'] },
      ],
    });
    expect(rs.slides).toHaveLength(2);
    expect(rs.slides[0].slide).toBe(1);
    expect(rs.slides[0].emphasis).toEqual(['광고부터 켜는 겁니다.']);
    expect(rs.slides[1].emphasis).toBeUndefined();
  });
});

// ── VoiceRecording ────────────────────────────────────────────────────────────

describe('VoiceRecording', () => {
  it('creates a recording with quality_status unchecked and null file_ref', () => {
    const rec = createVoiceRecording({ id: 'vr1', video_project_id: 'vp1' });
    expect(rec.quality_status).toBe('unchecked');
    expect(rec.file_ref).toBeNull();
  });

  it('attachVoiceFile sets file_ref and duration', () => {
    const rec = createVoiceRecording({ id: 'vr1', video_project_id: 'vp1' });
    const updated = attachVoiceFile(rec, 'recordings/audio.mp3', 252);
    expect(updated.file_ref).toBe('recordings/audio.mp3');
    expect(updated.duration_seconds).toBe(252);
  });

  it('attachVoiceFile throws on empty file_ref', () => {
    const rec = createVoiceRecording({ id: 'vr1', video_project_id: 'vp1' });
    expect(() => attachVoiceFile(rec, '  ', 100)).toThrow('file_ref');
  });

  it('markVoiceQuality updates quality_status', () => {
    const rec = createVoiceRecording({ id: 'vr1', video_project_id: 'vp1' });
    expect(markVoiceQuality(rec, 'pass').quality_status).toBe('pass');
    expect(markVoiceQuality(rec, 'needs_rerecording').quality_status).toBe('needs_rerecording');
  });
});

// ── SlideDeckSpec ─────────────────────────────────────────────────────────────

const sampleSlides: SlideSpec[] = [
  { index: 0, headline: '제목1', speaker_text: '발화1', visual_type: 'text' },
  { index: 1, headline: '제목2', speaker_text: '발화2', visual_type: 'bridge' },
];

describe('buildSlideDeckSpec', () => {
  it('builds a spec with default aspect_ratio 16:9', () => {
    const spec = buildSlideDeckSpec({
      id: 's1',
      video_project_id: 'vp1',
      script_draft_id: 'd1',
      voice_recording_id: 'vr1',
      design_theme: 'Pulk Clean',
      slides: sampleSlides,
    });
    expect(spec.aspect_ratio).toBe('16:9');
    expect(spec.slides).toHaveLength(2);
  });

  it('respects explicit 9:16 aspect_ratio', () => {
    const spec = buildSlideDeckSpec({
      id: 's1',
      video_project_id: 'vp1',
      script_draft_id: 'd1',
      voice_recording_id: 'vr1',
      aspect_ratio: '9:16',
      design_theme: 'Pulk Clean',
      slides: sampleSlides,
    });
    expect(spec.aspect_ratio).toBe('9:16');
  });

  it('throws when script_draft_id is empty', () => {
    expect(() =>
      buildSlideDeckSpec({
        id: 's1',
        video_project_id: 'vp1',
        script_draft_id: '',
        voice_recording_id: 'vr1',
        design_theme: 'Pulk Clean',
        slides: sampleSlides,
      }),
    ).toThrow('script_draft_id');
  });

  it('throws when voice_recording_id is empty', () => {
    expect(() =>
      buildSlideDeckSpec({
        id: 's1',
        video_project_id: 'vp1',
        script_draft_id: 'd1',
        voice_recording_id: '  ',
        design_theme: 'Pulk Clean',
        slides: sampleSlides,
      }),
    ).toThrow('voice_recording_id');
  });

  it('throws when slide index is non-consecutive', () => {
    const badSlides: SlideSpec[] = [
      { index: 0, headline: 'H', speaker_text: 'S', visual_type: 'text' },
      { index: 2, headline: 'H2', speaker_text: 'S2', visual_type: 'text' },
    ];
    expect(() =>
      buildSlideDeckSpec({
        id: 's1',
        video_project_id: 'vp1',
        script_draft_id: 'd1',
        voice_recording_id: 'vr1',
        design_theme: 'Pulk Clean',
        slides: badSlides,
      }),
    ).toThrow('index');
  });

  it('throws when slide headline is empty', () => {
    const badSlides: SlideSpec[] = [
      { index: 0, headline: '', speaker_text: 'S', visual_type: 'text' },
    ];
    expect(() =>
      buildSlideDeckSpec({
        id: 's1',
        video_project_id: 'vp1',
        script_draft_id: 'd1',
        voice_recording_id: 'vr1',
        design_theme: 'Pulk Clean',
        slides: badSlides,
      }),
    ).toThrow('headline');
  });

  it('throws when slide speaker_text is empty', () => {
    const badSlides: SlideSpec[] = [
      { index: 0, headline: 'H', speaker_text: '', visual_type: 'text' },
    ];
    expect(() =>
      buildSlideDeckSpec({
        id: 's1',
        video_project_id: 'vp1',
        script_draft_id: 'd1',
        voice_recording_id: 'vr1',
        design_theme: 'Pulk Clean',
        slides: badSlides,
      }),
    ).toThrow('speaker_text');
  });
});

// ── slideDeckToVideoJob ───────────────────────────────────────────────────────

describe('slideDeckToVideoJob', () => {
  it('converts spec to video job payload', () => {
    const spec = buildSlideDeckSpec({
      id: 's1',
      video_project_id: 'vp1',
      script_draft_id: 'd1',
      voice_recording_id: 'vr1',
      design_theme: 'Pulk Clean',
      slides: sampleSlides,
    });
    const payload = slideDeckToVideoJob(spec, 'audio/ref.mp3');
    expect(payload.slides).toHaveLength(2);
    expect(payload.aspect_ratio).toBe('16:9');
    expect(payload.design_theme).toBe('Pulk Clean');
    expect(payload.audio_ref).toBe('audio/ref.mp3');
  });

  it('defaults audio_ref to null', () => {
    const spec = buildSlideDeckSpec({
      id: 's1',
      video_project_id: 'vp1',
      script_draft_id: 'd1',
      voice_recording_id: 'vr1',
      design_theme: 'Pulk Clean',
      slides: sampleSlides,
    });
    expect(slideDeckToVideoJob(spec).audio_ref).toBeNull();
  });
});

// ── RenderJob state machine ───────────────────────────────────────────────────

describe('RenderJob', () => {
  it('createRenderJob starts with status queued', () => {
    const job = createRenderJob({
      id: 'rj1',
      video_project_id: 'vp1',
      slide_deck_spec_id: 's1',
      created_at: '2026-06-05T00:00:00Z',
    });
    expect(job.status).toBe('queued');
  });

  it('submitRenderJob transitions queued → rendering via transport', async () => {
    const transport = createInMemoryVideoFactoryTransport();
    const job = createRenderJob({
      id: 'rj1',
      video_project_id: 'vp1',
      slide_deck_spec_id: 's1',
      created_at: '2026-06-05T00:00:00Z',
    });
    const submitted = await submitRenderJob(job, transport);
    expect(submitted.status).toBe('rendering');
    // transport.generate was called with slide_deck_spec_id as topic
    expect(transport._store.generated[0].topic).toBe('s1');
  });

  it('submitRenderJob throws if not queued', async () => {
    const transport = createInMemoryVideoFactoryTransport();
    const job = createRenderJob({
      id: 'rj1',
      video_project_id: 'vp1',
      slide_deck_spec_id: 's1',
      created_at: '2026-06-05T00:00:00Z',
    });
    const submitted = await submitRenderJob(job, transport);
    await expect(submitRenderJob(submitted, transport)).rejects.toThrow('queued');
  });

  it('completeRenderJob transitions rendering → completed with outputs', async () => {
    const transport = createInMemoryVideoFactoryTransport();
    const job = createRenderJob({
      id: 'rj1',
      video_project_id: 'vp1',
      slide_deck_spec_id: 's1',
      created_at: '2026-06-05T00:00:00Z',
    });
    const rendering = await submitRenderJob(job, transport);
    const completed = completeRenderJob(rendering, {
      output_video_ref: 'videos/out.mp4',
      thumbnail_ref: 'thumbs/t.png',
      completed_at: '2026-06-05T01:00:00Z',
    });
    expect(completed.status).toBe('completed');
    expect(completed.output_video_ref).toBe('videos/out.mp4');
    expect(completed.thumbnail_ref).toBe('thumbs/t.png');
    expect(completed.completed_at).toBe('2026-06-05T01:00:00Z');
  });

  it('completeRenderJob throws if not rendering', () => {
    const job = createRenderJob({
      id: 'rj1',
      video_project_id: 'vp1',
      slide_deck_spec_id: 's1',
      created_at: '2026-06-05T00:00:00Z',
    });
    expect(() =>
      completeRenderJob(job, {
        output_video_ref: 'videos/out.mp4',
        completed_at: '2026-06-05T01:00:00Z',
      }),
    ).toThrow('rendering');
  });

  it('failRenderJob transitions rendering → failed', async () => {
    const transport = createInMemoryVideoFactoryTransport();
    const job = createRenderJob({
      id: 'rj1',
      video_project_id: 'vp1',
      slide_deck_spec_id: 's1',
      created_at: '2026-06-05T00:00:00Z',
    });
    const rendering = await submitRenderJob(job, transport);
    const failed = failRenderJob(rendering, 'render engine error');
    expect(failed.status).toBe('failed');
    expect(failed.error_message).toBe('render engine error');
  });

  it('failRenderJob throws if not rendering', () => {
    const job = createRenderJob({
      id: 'rj1',
      video_project_id: 'vp1',
      slide_deck_spec_id: 's1',
      created_at: '2026-06-05T00:00:00Z',
    });
    expect(() => failRenderJob(job, 'error')).toThrow('rendering');
  });

  it('failRenderJob throws on empty error message', async () => {
    const transport = createInMemoryVideoFactoryTransport();
    const job = createRenderJob({
      id: 'rj1',
      video_project_id: 'vp1',
      slide_deck_spec_id: 's1',
      created_at: '2026-06-05T00:00:00Z',
    });
    const rendering = await submitRenderJob(job, transport);
    expect(() => failRenderJob(rendering, '  ')).toThrow('error');
  });
});
