// CMO Video Room — Production pipeline domain logic.
// PRD §8 (Script, SlideDeck, Render). Pure functions; no internal randomUUID/Date.
// Transport injection required for submitRenderJob.

import type {
  ScriptPlan,
  ScriptDraft,
  ReadingScript,
  VoiceRecording,
  VideoRoomSlideDeckSpec,
  SlideSpec,
  RenderJob,
} from './types';
import type { VideoFactoryTransport } from '../memory/video-factory';

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireNonEmpty(value: string | undefined | null, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must not be empty`);
  }
  return value.trim();
}

// ── ScriptPlan ────────────────────────────────────────────────────────────────

export interface CreateScriptPlanInput {
  id: string;
  video_project_id: string;
  approved_title: string;
  sections: string[];
}

export function createScriptPlan(input: CreateScriptPlanInput): ScriptPlan {
  requireNonEmpty(input.approved_title, 'approved_title');
  return {
    id: input.id,
    video_project_id: input.video_project_id,
    approved_title: input.approved_title.trim(),
    sections: input.sections,
  };
}

// ── ScriptDraft ───────────────────────────────────────────────────────────────

export interface CreateScriptDraftInput {
  id: string;
  video_project_id: string;
  script_plan_id: string;
  full_script: string;
}

export function createScriptDraft(input: CreateScriptDraftInput): ScriptDraft {
  requireNonEmpty(input.full_script, 'full_script');
  return {
    id: input.id,
    video_project_id: input.video_project_id,
    script_plan_id: input.script_plan_id,
    full_script: input.full_script.trim(),
    approval_status: 'draft',
  };
}

export function approveScriptDraft(draft: ScriptDraft): ScriptDraft {
  return { ...draft, approval_status: 'approved' };
}

export function requestScriptRevision(draft: ScriptDraft): ScriptDraft {
  return { ...draft, approval_status: 'needs_revision' };
}

// ── ReadingScript ─────────────────────────────────────────────────────────────
// PRD §8.6: [Slide N] sections + [강조] emphasis lines.

export interface ReadingScriptSlideInput {
  slide: number;
  lines: string[];
  emphasis?: string[];
}

export interface CreateReadingScriptInput {
  id: string;
  video_project_id: string;
  script_draft_id: string;
  slides: ReadingScriptSlideInput[];
}

export function toReadingScript(input: CreateReadingScriptInput): ReadingScript {
  return {
    id: input.id,
    video_project_id: input.video_project_id,
    script_draft_id: input.script_draft_id,
    slides: input.slides.map((s) => ({
      slide: s.slide,
      lines: s.lines,
      emphasis: s.emphasis,
    })),
  };
}

// ── VoiceRecording ────────────────────────────────────────────────────────────

export interface CreateVoiceRecordingInput {
  id: string;
  video_project_id: string;
}

export function createVoiceRecording(input: CreateVoiceRecordingInput): VoiceRecording {
  return {
    id: input.id,
    video_project_id: input.video_project_id,
    file_ref: null,
    quality_status: 'unchecked',
  };
}

export function attachVoiceFile(
  rec: VoiceRecording,
  file_ref: string,
  duration: number,
): VoiceRecording {
  requireNonEmpty(file_ref, 'file_ref');
  return { ...rec, file_ref, duration_seconds: duration };
}

export function markVoiceQuality(
  rec: VoiceRecording,
  status: VoiceRecording['quality_status'],
): VoiceRecording {
  return { ...rec, quality_status: status };
}

// ── SlideDeckSpec ─────────────────────────────────────────────────────────────

export interface BuildSlideDeckSpecInput {
  id: string;
  video_project_id: string;
  script_draft_id: string;
  voice_recording_id: string;
  aspect_ratio?: '16:9' | '9:16';
  design_theme: string;
  slides: SlideSpec[];
}

export function buildSlideDeckSpec(input: BuildSlideDeckSpecInput): VideoRoomSlideDeckSpec {
  requireNonEmpty(input.script_draft_id, 'script_draft_id');
  requireNonEmpty(input.voice_recording_id, 'voice_recording_id');

  // Validate slides: consecutive index, headline and speaker_text required.
  for (let i = 0; i < input.slides.length; i++) {
    const slide = input.slides[i];
    if (slide.index !== i) {
      throw new Error(`slides[${i}].index must be ${i} (consecutive from 0)`);
    }
    requireNonEmpty(slide.headline, `slides[${i}].headline`);
    requireNonEmpty(slide.speaker_text, `slides[${i}].speaker_text`);
  }

  return {
    id: input.id,
    video_project_id: input.video_project_id,
    script_draft_id: input.script_draft_id,
    voice_recording_id: input.voice_recording_id,
    aspect_ratio: input.aspect_ratio ?? '16:9',
    design_theme: input.design_theme,
    slides: input.slides,
  };
}

// ── SlideDeckSpec → VideoJob payload ─────────────────────────────────────────

export interface SlideDeckVideoJobPayload {
  slides: SlideSpec[];
  aspect_ratio: '16:9' | '9:16';
  design_theme: string;
  audio_ref: string | null;
}

export function slideDeckToVideoJob(
  spec: VideoRoomSlideDeckSpec,
  audioRef: string | null = null,
): SlideDeckVideoJobPayload {
  return {
    slides: spec.slides,
    aspect_ratio: spec.aspect_ratio,
    design_theme: spec.design_theme,
    audio_ref: audioRef,
  };
}

// ── RenderJob ─────────────────────────────────────────────────────────────────

export interface CreateRenderJobInput {
  id: string;
  video_project_id: string;
  slide_deck_spec_id: string;
  created_at: string;
}

export function createRenderJob(input: CreateRenderJobInput): RenderJob {
  return {
    id: input.id,
    video_project_id: input.video_project_id,
    slide_deck_spec_id: input.slide_deck_spec_id,
    status: 'queued',
    created_at: input.created_at,
  };
}

export async function submitRenderJob(
  job: RenderJob,
  transport: VideoFactoryTransport,
): Promise<RenderJob> {
  if (job.status !== 'queued') {
    throw new Error('only queued jobs can be submitted');
  }
  await transport.generate({ topic: job.slide_deck_spec_id });
  return { ...job, status: 'rendering' };
}

export interface RenderOutputs {
  output_video_ref: string;
  thumbnail_ref?: string;
  qa_report_ref?: string;
  youtube_metadata_ref?: string;
  completed_at: string;
}

export function completeRenderJob(job: RenderJob, outputs: RenderOutputs): RenderJob {
  if (job.status !== 'rendering') {
    throw new Error('only rendering jobs can be completed');
  }
  return {
    ...job,
    status: 'completed',
    output_video_ref: outputs.output_video_ref,
    thumbnail_ref: outputs.thumbnail_ref,
    qa_report_ref: outputs.qa_report_ref,
    youtube_metadata_ref: outputs.youtube_metadata_ref,
    completed_at: outputs.completed_at,
    error_message: undefined,
  };
}

export function failRenderJob(job: RenderJob, error: string): RenderJob {
  if (job.status !== 'rendering') {
    throw new Error('only rendering jobs can be failed');
  }
  return {
    ...job,
    status: 'failed',
    error_message: requireNonEmpty(error, 'error'),
  };
}
