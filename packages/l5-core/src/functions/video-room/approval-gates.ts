// CMO Video Room — VideoRoomApprovalGate builder (PRD §12.9, §4.3).
//
// Pure functions only. No Date.now(), new Date(), or randomUUID() inside.
// All id values must be injected by the caller.

import type {
  VideoRoomApprovalGate,
  VideoRoomGateType,
  VideoRoomGateStatus,
  VideoRoomPage,
} from './types';

// ── Page mapping ───────────────────────────────────────────────────────────

const GATE_PAGE_MAP: Record<VideoRoomGateType, VideoRoomPage> = {
  key_content_approval: 'strategy',
  pulling_content_set_approval: 'strategy',
  hook_draft_approval: 'strategy',
  script_approval: 'production',
  storyboard_approval: 'production',
  pilot_approval: 'production',
  video_qa_approval: 'review_publish',
  upload_approval: 'review_publish',
};

// ── createApprovalGate ─────────────────────────────────────────────────────

export interface CreateApprovalGateInput {
  id: string;
  video_project_id: string;
  gate_type: VideoRoomGateType;
  title: string;
  context: string;
  options: string[];
  recommended_option?: string;
}

/**
 * Creates a VideoRoomApprovalGate.
 * - status defaults to 'pending'.
 * - page is derived automatically from gate_type.
 * - options must not be empty (PRD §4.3: 승인 없는 자동화 금지 — a gate with no options is invalid).
 */
export function createApprovalGate(input: CreateApprovalGateInput): VideoRoomApprovalGate {
  if (typeof input.id !== 'string' || input.id.trim() === '') {
    throw new Error('id must not be empty');
  }
  if (typeof input.video_project_id !== 'string' || input.video_project_id.trim() === '') {
    throw new Error('video_project_id must not be empty');
  }
  if (typeof input.title !== 'string' || input.title.trim() === '') {
    throw new Error('title must not be empty');
  }
  if (typeof input.context !== 'string' || input.context.trim() === '') {
    throw new Error('context must not be empty');
  }
  if (!Array.isArray(input.options) || input.options.length === 0) {
    throw new Error('options must not be empty (PRD §4.3: approval gate requires at least one option)');
  }

  return {
    id: input.id.trim(),
    video_project_id: input.video_project_id.trim(),
    gate_type: input.gate_type,
    page: GATE_PAGE_MAP[input.gate_type],
    title: input.title.trim(),
    context: input.context.trim(),
    options: input.options,
    recommended_option: input.recommended_option,
    status: 'pending',
  };
}

// ── decideGate ─────────────────────────────────────────────────────────────

export type GateDecision = 'approved' | 'rejected' | 'needs_revision';

/**
 * Applies a founder/ceo decision to a gate.
 * Throws if the gate has already been decided (status !== 'pending').
 */
export function decideGate(
  gate: VideoRoomApprovalGate,
  decision: GateDecision,
  decidedBy: 'founder' | 'ceo',
  decidedAt: string,
): VideoRoomApprovalGate {
  if (gate.status !== 'pending') {
    throw new Error(
      `gate ${gate.id} has already been decided (status="${gate.status}"); cannot re-decide`,
    );
  }

  const nextStatus: VideoRoomGateStatus = decision;

  return {
    ...gate,
    status: nextStatus,
    decided_by: decidedBy,
    decided_at: decidedAt,
  };
}

// ── isGateCleared ──────────────────────────────────────────────────────────

/** Returns true only when the gate has been approved. */
export function isGateCleared(gate: VideoRoomApprovalGate): boolean {
  return gate.status === 'approved';
}
