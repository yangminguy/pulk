// CMO Video Room — KeyContent candidate builder and selection logic (PRD §7.2, §7.4).
//
// Pure functions only. No Date.now(), new Date(), or randomUUID() calls inside.
// All id values must be injected by the caller.

import type {
  KeyContentCandidate,
  SelectedKeyContent,
  ConsumerStage,
  ViewtrapReference,
  ApprovalStatus,
} from './types';

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must not be empty`);
  }
  return value.trim();
}

export interface CreateKeyContentCandidateInput {
  id: string;
  title: string;
  target_problem: string;
  consumer_stages: ConsumerStage[];
  sales_logic: string;
  cta: string;
  why_this_can_sell: string;
  research_status?: KeyContentCandidate['research_status'];
}

export function createKeyContentCandidate(
  input: CreateKeyContentCandidateInput,
): KeyContentCandidate {
  requireNonEmpty(input.id, 'id');
  requireNonEmpty(input.title, 'title');
  requireNonEmpty(input.target_problem, 'target_problem');
  requireNonEmpty(input.sales_logic, 'sales_logic');
  requireNonEmpty(input.cta, 'cta');
  requireNonEmpty(input.why_this_can_sell, 'why_this_can_sell');

  return {
    id: input.id.trim(),
    title: input.title.trim(),
    target_problem: input.target_problem.trim(),
    consumer_stages: input.consumer_stages,
    sales_logic: input.sales_logic.trim(),
    cta: input.cta.trim(),
    why_this_can_sell: input.why_this_can_sell.trim(),
    research_status: input.research_status ?? 'not_researched',
  };
}

export interface SelectKeyContentOpts {
  id: string;
  viewtrap_evidence: ViewtrapReference[];
  selected_reason: string;
}

/**
 * Promotes a KeyContentCandidate to SelectedKeyContent.
 * PRD rule: Viewtrap 리서치 없이 키 콘텐츠 확정 금지 — throws if viewtrap_evidence is empty.
 */
export function selectKeyContent(
  candidate: KeyContentCandidate,
  opts: SelectKeyContentOpts,
): SelectedKeyContent {
  if (opts.viewtrap_evidence.length === 0) {
    throw new Error(
      'cannot select key content without viewtrap_evidence (PRD: Viewtrap 리서치 없이 키 콘텐츠 확정 금지)',
    );
  }
  requireNonEmpty(opts.id, 'id');
  requireNonEmpty(opts.selected_reason, 'selected_reason');

  return {
    id: opts.id.trim(),
    title: candidate.title,
    core_problem: candidate.target_problem,
    consumer_stages: candidate.consumer_stages,
    sales_logic: candidate.sales_logic,
    cta: candidate.cta,
    selected_reason: opts.selected_reason.trim(),
    viewtrap_evidence: opts.viewtrap_evidence,
    approval_status: 'draft',
  };
}

export function approveKeyContent(selected: SelectedKeyContent): SelectedKeyContent {
  return { ...selected, approval_status: 'approved' };
}

export function requestKeyContentRevision(selected: SelectedKeyContent): SelectedKeyContent {
  return { ...selected, approval_status: 'needs_revision' };
}
