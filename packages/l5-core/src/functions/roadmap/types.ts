// Roadmap domain types — PRD → plain-language roadmap milestones.
//
// A roadmap item is a founder-facing milestone (NOT a developer phase). It
// describes a chunk of product value in plain language so a non-developer can
// see "what is being built and where each task fits". CTO dev-tasks link to a
// roadmap item via roadmap_item_id; the Control Room groups tasks under their
// item so the founder reads "이 작업은 [로드맵 항목]의 일부".

export type RoadmapItemStatus = 'planned' | 'active' | 'done';

/** One milestone derived from the PRD. Pure data — no ids/timestamps (the
 * persistence layer assigns those). */
export interface RoadmapItemDraft {
  /** Plain milestone title a founder understands (e.g. "회원 가입 흐름"). */
  title: string;
  /** One-line plain description of the value (non-developer language). */
  summary: string;
  /** What "done" looks like for this milestone, in plain terms. */
  objective: string;
  /** 1-based order in the roadmap. */
  sequence: number;
}

export interface GenerateRoadmapInput {
  /** The product requirements document text (founder- or CEO-authored). */
  prd: string;
  /** Project title for context. */
  project_title?: string;
  /** Optional business/company context to ground the milestones. */
  business_context?: string;
}

export interface GenerateRoadmapOptions {
  /** When provided, the LLM breaks the PRD into milestones; otherwise the
   * deterministic fallback runs. */
  llm?: import('../ceo-orchestration/types').LLMClient;
  /** Cap on milestone count (default 6). The roadmap should stay scannable. */
  max_items?: number;
}
