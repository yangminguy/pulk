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
  'thumbnail_pattern_extraction',
  'intro_30s_analysis',
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
  'thumbnail_pattern_extraction',
  'intro_30s_analysis',
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

// ── 게이트 리포트 사전조건 (FR-4/FR-5/FR-6, 2026-07-12) ─────────────────────
//
// 사장님이 검토할 리포트 산출물(video_room_cards.stage)이 존재해야 게이트를
// 승인/전진할 수 있다. "리포트 없는 바로 승인"을 상태머신 수준에서 차단한다.
// stage 이름은 plugin upsertVideoRoomCard가 쓰는 정본과 동일해야 한다.

export const GATE_REQUIRED_REPORT_STAGES: Record<VideoRoomGateType, string[]> = {
  /** ① 키 콘텐츠 기획 승인 — HTML 기획서(선별 이유·벤치마킹·판매 논리·풀링 키워드 계획). */
  key_content_approval: ['key_content_plan_doc'],
  /** ② 풀링 콘텐츠 승인 — 풀링 리서치 HTML 리포트. */
  pulling_content_set_approval: ['pulling_plan_doc'],
  /** ③ 훅 승인 — 제목 디벨롭 + 썸네일 계획 시안. */
  hook_draft_approval: ['title_development', 'thumbnail_plan'],
  /** ④ 원고 승인 — 원고 전문(근거 서술 포함). */
  script_approval: ['script_draft'],
  /** ⑤ 영상 승인 — 렌더 QA 결과. */
  video_qa_approval: ['qa'],
  /** ⑥ 게시 승인 — 업로드 초안. */
  upload_approval: ['upload_draft'],
};

/** 해당 게이트 status가 요구하는 리포트 카드 stage 목록 (게이트가 아니면 []). */
export function requiredReportStages(status: VideoRoomStatus): string[] {
  const gate = GATE_BY_STATUS[status];
  return gate ? GATE_REQUIRED_REPORT_STAGES[gate] : [];
}

/** 게이트 status에서 아직 없는 리포트 stage 목록. 게이트가 아니면 []. */
export function missingGateReports(
  status: VideoRoomStatus,
  presentCardStages: string[],
): string[] {
  const present = new Set(presentCardStages);
  return requiredReportStages(status).filter((s) => !present.has(s));
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
  opts: { gateApproved?: boolean; presentCardStages?: string[] } = {},
): VideoRoomStatus {
  if (requiresApproval(current) && !opts.gateApproved) {
    throw new Error(`status ${current} requires founder approval before advancing`);
  }
  // FR-6: 승인됐더라도 검토 리포트 산출물이 없으면 전이 불가(리포트 없는 승인 차단).
  // presentCardStages 미제공(레거시 호출)이면 검사 생략 — 강제는 plugin 게이트 경로가 담당.
  if (requiresApproval(current) && opts.presentCardStages) {
    const missing = missingGateReports(current, opts.presentCardStages);
    if (missing.length > 0) {
      throw new Error(
        `status ${current} requires report card(s) before approval: ${missing.join(', ')}`,
      );
    }
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
  { key: 'thumbnail', label: '썸네일 구성', status: 'thumbnail_pattern_extraction' },
  { key: 'intro', label: '원고 도입부', status: 'intro_30s_analysis' },
  { key: 'hook_approval', label: '훅 승인', status: 'hook_draft_approval' },
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
