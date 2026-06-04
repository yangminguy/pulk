// CMO Video Room — workflow state machine (PRD §10, §11).
//
// Pure, NocoBase-free logic: the ordered status flow, legal transitions, which
// page owns each status, the approval gates, and the mini-roadmap projection.

import type { VideoRoomStatus, VideoRoomPage, VideoRoomGateType } from './types';

// Ordered happy-path flow (PRD §10). `paused` is an out-of-band side state.
export const VIDEO_ROOM_FLOW: VideoRoomStatus[] = [
  'strategy_chat',
  'business_pt_context_loading',
  'product_defined',
  'key_content_ideation',
  'viewtrap_key_research',
  'key_content_approval',
  'viewtrap_pulling_research',
  'pulling_content_set_selection',
  'pulling_content_set_approval',
  'reference_analysis',
  'thumbnail_pattern_extraction',
  'intro_30s_analysis',
  'second_brain_insight_merge',
  'hook_draft_approval',
  'script_planning',
  'script_draft',
  'script_approval',
  'voice_recording',
  'slide_deck',
  'rendering',
  'qa',
  'video_qa_approval',
  'upload_draft',
  'upload_approval',
  'completed',
];

// Page ownership (PRD §11).
const STRATEGY_STATES: VideoRoomStatus[] = [
  'strategy_chat',
  'business_pt_context_loading',
  'product_defined',
  'key_content_ideation',
  'viewtrap_key_research',
  'key_content_approval',
  'viewtrap_pulling_research',
  'pulling_content_set_selection',
  'pulling_content_set_approval',
  'reference_analysis',
  'thumbnail_pattern_extraction',
  'intro_30s_analysis',
  'second_brain_insight_merge',
  'hook_draft_approval',
];

const PRODUCTION_STATES: VideoRoomStatus[] = [
  'script_planning',
  'script_draft',
  'script_approval',
  'voice_recording',
  'slide_deck',
  'rendering',
];

const REVIEW_STATES: VideoRoomStatus[] = [
  'qa',
  'video_qa_approval',
  'upload_draft',
  'upload_approval',
  'completed',
];

export function pageForStatus(status: VideoRoomStatus): VideoRoomPage {
  if (PRODUCTION_STATES.includes(status)) return 'production';
  if (REVIEW_STATES.includes(status)) return 'review_publish';
  return 'strategy';
}

// Statuses that require a founder approval gate before advancing.
export const GATE_BY_STATUS: Partial<Record<VideoRoomStatus, VideoRoomGateType>> = {
  key_content_approval: 'key_content_approval',
  pulling_content_set_approval: 'pulling_content_set_approval',
  hook_draft_approval: 'hook_draft_approval',
  script_approval: 'script_approval',
  video_qa_approval: 'video_qa_approval',
  upload_approval: 'upload_approval',
};

export function requiresApproval(status: VideoRoomStatus): boolean {
  return status in GATE_BY_STATUS;
}

export function nextStatus(status: VideoRoomStatus): VideoRoomStatus | null {
  const i = VIDEO_ROOM_FLOW.indexOf(status);
  if (i < 0 || i === VIDEO_ROOM_FLOW.length - 1) return null;
  return VIDEO_ROOM_FLOW[i + 1];
}

export function canAdvance(from: VideoRoomStatus, to: VideoRoomStatus): boolean {
  if (from === 'paused') return true; // resuming is allowed to any prior point
  return nextStatus(from) === to;
}

/**
 * Advance to the next status. Throws when the move is illegal or when the
 * current status is an unsatisfied approval gate (callers must clear the gate
 * via `approveGate` first). Returns the new status.
 */
export function advanceStatus(
  current: VideoRoomStatus,
  opts: { gateApproved?: boolean } = {},
): VideoRoomStatus {
  if (requiresApproval(current) && !opts.gateApproved) {
    throw new Error(`status ${current} requires founder approval before advancing`);
  }
  const next = nextStatus(current);
  if (!next) throw new Error(`no transition available from ${current}`);
  return next;
}

// ── Mini roadmap (PRD §5.3) ─────────────────────────────────────────────────

export type RoadmapNodeState = 'done' | 'active' | 'pending';

export interface RoadmapNode {
  key: string;
  label: string;
  /** First status (inclusive) this node represents. */
  status: VideoRoomStatus;
  state: RoadmapNodeState;
}

const ROADMAP_NODES: { key: string; label: string; status: VideoRoomStatus }[] = [
  { key: 'pt_context', label: 'PT 컨텍스트', status: 'business_pt_context_loading' },
  { key: 'product', label: '상품정의', status: 'product_defined' },
  { key: 'key_ideation', label: '키콘텐츠 후보', status: 'key_content_ideation' },
  { key: 'viewtrap_key', label: 'Viewtrap 키 리서치', status: 'viewtrap_key_research' },
  { key: 'key_approval', label: '키콘텐츠 승인', status: 'key_content_approval' },
  { key: 'pulling', label: '풀링 5개', status: 'pulling_content_set_selection' },
  { key: 'hook', label: 'Hook 승인', status: 'hook_draft_approval' },
  { key: 'script', label: '원고', status: 'script_planning' },
  { key: 'recording', label: '녹음', status: 'voice_recording' },
  { key: 'render', label: '렌더', status: 'rendering' },
  { key: 'qa', label: 'QA', status: 'qa' },
  { key: 'upload', label: '업로드', status: 'upload_draft' },
];

/** Project the current status onto the mini roadmap nodes (done/active/pending). */
export function buildMiniRoadmap(current: VideoRoomStatus): RoadmapNode[] {
  const currentIndex =
    current === 'completed'
      ? VIDEO_ROOM_FLOW.length
      : current === 'paused'
        ? -1
        : VIDEO_ROOM_FLOW.indexOf(current);

  return ROADMAP_NODES.map((node, idx) => {
    const nodeIndex = VIDEO_ROOM_FLOW.indexOf(node.status);
    const nextNode = ROADMAP_NODES[idx + 1];
    const nextNodeIndex = nextNode ? VIDEO_ROOM_FLOW.indexOf(nextNode.status) : VIDEO_ROOM_FLOW.length;

    let state: RoadmapNodeState;
    if (currentIndex >= nextNodeIndex) state = 'done';
    else if (currentIndex >= nodeIndex) state = 'active';
    else state = 'pending';

    return { ...node, state };
  });
}
