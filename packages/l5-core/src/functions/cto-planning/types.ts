// CTO planning conversation — types.
//
// The founder talks with the CTO in the Control Room to shape a product idea
// into a PRD → roadmap → tasks (and, when the idea is genuinely new, a proposal
// for which business/project to file it under). The conversation runs turn by
// turn; when the CTO has enough, it returns a single PLAN the founder approves
// in one go (go/no-go), which then creates the roadmap + tasks (+ project).

import type { RoadmapItemDraft } from '../roadmap/types';

export interface CtoPlanningMessage {
  role: 'founder' | 'cto';
  text: string;
}

/** A business/project the CTO can place work under (for new-project proposals). */
export interface PlanningProjectRef {
  id: string;
  title: string;
  business_id: string;
}

export interface PlanningBusinessRef {
  id: string;
  title: string;
}

export interface CtoPlanningContext {
  /** Business the conversation is scoped to (if any). */
  business_id?: string | null;
  /** Existing project the planning targets (if continuing one). */
  project_id?: string | null;
  project_title?: string | null;
  /** Catalog the CTO uses to decide placement / detect "this is a new project". */
  businesses?: PlanningBusinessRef[];
  existing_projects?: PlanningProjectRef[];
}

/** When the CTO judges the idea is a NEW project (not a fit for an existing one),
 * it proposes where to file it — the founder approves the placement. */
export interface ProjectProposal {
  is_new_project: boolean;
  /** Suggested business to file the new project under (null = needs founder pick). */
  business_id: string | null;
  suggested_project_title: string;
  /** Plain reason it's a separate/new project vs an existing one. */
  rationale: string;
}

export interface CtoPlanTaskDraft {
  title: string;
  /** Plain "what & why" a non-developer reads. */
  rationale: string;
  expected_output: string;
  /** 1-based index of the roadmap item this task serves. */
  roadmap_sequence: number;
}

/** The full plan the CTO proposes at the end of planning — approved as one unit. */
export interface CtoPlan {
  prd: string;
  roadmap_items: RoadmapItemDraft[];
  tasks: CtoPlanTaskDraft[];
  /** Present only when the CTO thinks this should be a new project. */
  project_proposal?: ProjectProposal | null;
}

export interface CtoPlanningTurnResult {
  /** The CTO's conversational message back to the founder. */
  reply: string;
  /** Present when the CTO is ready to propose a plan for approval; else null. */
  plan: CtoPlan | null;
}

export interface CtoPlanningOptions {
  llm?: import('../ceo-orchestration/types').LLMClient;
  /** Cap roadmap items in a proposed plan (default 6). */
  max_roadmap_items?: number;
}
