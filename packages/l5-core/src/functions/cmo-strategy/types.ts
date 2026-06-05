// CMO Video Room — strategy conversation turn contract.
//
// Mirrors the CTO planning turn (../cto-planning) but is *stage-aware*: the CMO
// drives the founder through the Video Room state machine, proposing a
// stage-specific artifact (a "card") and, at gate stages, an approval request.

import type { VideoRoomStatus, VideoRoomGateType } from '../video-room/types';

export interface CmoStrategyMessage {
  role: 'founder' | 'cmo';
  text: string;
}

export interface CmoStrategyContext {
  /** Current workflow status — decides which stage the CMO is operating in. */
  status: VideoRoomStatus;
  project_title?: string | null;
  product?: string | null;
  target_audience?: string | null;
  business_goal?: string | null;
  /** Whether the Business PT context snapshot has been loaded for this project. */
  context_loaded?: boolean;
  /** Title of the key content already selected, if any. */
  selected_key_content_title?: string | null;
  /** How many pulling contents have been selected so far (target: 5). */
  pulling_set_size?: number;
  /** Free-form notes summarising prior cards so the CMO keeps continuity. */
  notes?: string[];
  /** Insights from the Second Brain (Business PT lecture methodology) to inject into prompts. */
  second_brain_insights?: string[];
}

/** A stage-specific artifact the CMO proposes — stored as a Strategy Board card. */
export interface CmoStageProposal {
  stage: VideoRoomStatus;
  /** Human-readable summary, always present. */
  summary: string;
  /** Structured payload whose shape varies by stage (candidates, pulling set, …). */
  data?: unknown;
}

/** A founder approval request the CMO raises at a gate stage. */
export interface CmoApprovalProposal {
  gate_type: VideoRoomGateType;
  title: string;
  context: string;
  options: string[];
  recommended_option?: string;
}

export interface CmoStrategyTurnResult {
  /** What the CMO says to the founder (PRD §6.4 format). */
  reply: string;
  /** Stage artifact to persist, or null when the CMO is still gathering input. */
  proposal: CmoStageProposal | null;
  /** Approval request at a gate stage, or null. */
  gate: CmoApprovalProposal | null;
  /** Whether the CMO believes the current stage is complete. */
  ready_to_advance: boolean;
}

export interface CmoLLM {
  complete(args: { system: string; user: string; trace_name?: string }): Promise<string>;
}

export interface CmoStrategyOptions {
  llm?: CmoLLM;
}
