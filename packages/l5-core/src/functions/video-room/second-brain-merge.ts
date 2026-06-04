// CMO Video Room — Second Brain Insight Merge (PRD §7.10, §12.8).
//
// Pure functions only. No Date.now(), new Date(), or randomUUID() inside.
// All id values must be injected by the caller.

import type { SecondBrainInsightMerge } from './types';

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must not be empty`);
  }
  return value.trim();
}

export interface CreateSecondBrainInsightMergeInput {
  id: string;
  content_plan_id: string;
  retrieved_insights: SecondBrainInsightMerge['retrieved_insights'];
  applied_to_thumbnail: string[];
  applied_to_intro: string[];
  applied_to_script_structure: string[];
}

/**
 * Creates a SecondBrainInsightMerge record.
 * PRD rule: Second Brain 인사이트 검색 없이 원고 구조 확정 금지
 * — throws if retrieved_insights is empty.
 */
export function createSecondBrainInsightMerge(
  input: CreateSecondBrainInsightMergeInput,
): SecondBrainInsightMerge {
  requireNonEmpty(input.id, 'id');
  requireNonEmpty(input.content_plan_id, 'content_plan_id');

  if (input.retrieved_insights.length === 0) {
    throw new Error(
      'retrieved_insights must not be empty (PRD: Second Brain 인사이트 검색 없이 원고 구조 확정 금지)',
    );
  }

  return {
    id: input.id.trim(),
    content_plan_id: input.content_plan_id.trim(),
    retrieved_insights: input.retrieved_insights,
    applied_to_thumbnail: input.applied_to_thumbnail,
    applied_to_intro: input.applied_to_intro,
    applied_to_script_structure: input.applied_to_script_structure,
  };
}
