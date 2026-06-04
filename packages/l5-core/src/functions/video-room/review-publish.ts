// CMO Video Room — Review & Publish pipeline domain logic.
// PRD §9 (VideoQA, UploadDraft, Memory). Pure functions; no internal randomUUID/Date.

import type { VideoQAResult, UploadDraft } from './types';

// ── VideoQAResult ─────────────────────────────────────────────────────────────

export interface EvaluateVideoRoomQAInput {
  id: string;
  video_project_id: string;
  render_job_id: string;
  checks: VideoQAResult['checks'];
  notes?: string;
}

/**
 * Evaluate 7 PRD §9.4 QA checks. overall_status is 'pass' only when all
 * checks are 'pass'; otherwise 'needs_revision'.
 */
export function evaluateVideoRoomQA(input: EvaluateVideoRoomQAInput): VideoQAResult {
  const allPass = Object.values(input.checks).every((v) => v === 'pass');
  return {
    id: input.id,
    video_project_id: input.video_project_id,
    render_job_id: input.render_job_id,
    checks: { ...input.checks },
    overall_status: allPass ? 'pass' : 'needs_revision',
    notes: input.notes,
  };
}

// ── UploadDraft ───────────────────────────────────────────────────────────────

export interface CreateUploadDraftInput {
  id: string;
  video_project_id: string;
  render_job_id: string;
  title: string;
  description: string;
  tags: string[];
  thumbnail_ref?: string;
}

/**
 * Create an UploadDraft. Default visibility is 'private' (PRD §9.6).
 * approval_status starts as 'pending'.
 */
export function createUploadDraft(input: CreateUploadDraftInput): UploadDraft {
  return {
    id: input.id,
    video_project_id: input.video_project_id,
    render_job_id: input.render_job_id,
    title: input.title,
    description: input.description,
    tags: input.tags,
    visibility: 'private',
    thumbnail_ref: input.thumbnail_ref,
    approval_status: 'pending',
  };
}

/**
 * Approve an UploadDraft for publishing.
 * visibility is kept 'private' — public promotion is a separate explicit action.
 * Optional scheduledAt for scheduled upload.
 */
export function approveUploadDraft(draft: UploadDraft, scheduledAt?: string): UploadDraft {
  return {
    ...draft,
    // Enforce private until an explicit public-promotion call; approval alone
    // does NOT change visibility (PRD §9.6: 공개는 별도 명시적 호출 필요).
    visibility: 'private',
    approval_status: 'approved',
    scheduled_at: scheduledAt,
  };
}

export function requestUploadRevision(draft: UploadDraft): UploadDraft {
  return { ...draft, approval_status: 'needs_revision' };
}

// ── Memory candidate (PRD §9.7) ───────────────────────────────────────────────

export interface CreateMemoryCandidateInput {
  product: string;
  key_content_title: string;
  bridge_description: string;
}

/**
 * Generate a short memory candidate string for post-upload recording.
 * Returns plain text; persistence is the caller's responsibility.
 */
export function createMemoryCandidate(input: CreateMemoryCandidateInput): string {
  return (
    `이 콘텐츠는 ${input.product} 상품의 풀링 콘텐츠로 제작됨. ` +
    `키 콘텐츠(${input.key_content_title})로 이동시키기 위한 브릿지는 ${input.bridge_description}.`
  );
}
