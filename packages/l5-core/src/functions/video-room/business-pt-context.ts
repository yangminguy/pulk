// CMO Video Room — BusinessPTContextSnapshot builder and validators (PRD §7.0).
//
// Pure functions only. No Date.now(), new Date(), or randomUUID() calls inside.
// All id and timestamp values must be injected by the caller.

import type { BusinessPTContextSnapshot, BusinessPTSourceRef } from './types';

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must not be empty`);
  }
  return value.trim();
}

export interface CreateBusinessPTContextSnapshotInput {
  id: string;
  video_project_id: string;
  loaded_at: string;
  source_refs: BusinessPTSourceRef[];
  key_principles?: string[];
  key_content_rules: string[];
  pulling_content_rules: string[];
  thumbnail_intro_rules?: string[];
  script_structure_rules?: string[];
  caution_notes?: string[];
  freshness_status: 'fresh' | 'stale' | 'needs_refresh';
}

export function createBusinessPTContextSnapshot(
  input: CreateBusinessPTContextSnapshotInput,
): BusinessPTContextSnapshot {
  requireNonEmpty(input.id, 'id');
  requireNonEmpty(input.video_project_id, 'video_project_id');
  requireNonEmpty(input.loaded_at, 'loaded_at');

  return {
    id: input.id.trim(),
    video_project_id: input.video_project_id.trim(),
    loaded_at: input.loaded_at.trim(),
    source_refs: input.source_refs,
    key_principles: input.key_principles ?? [],
    key_content_rules: input.key_content_rules,
    pulling_content_rules: input.pulling_content_rules,
    thumbnail_intro_rules: input.thumbnail_intro_rules ?? [],
    script_structure_rules: input.script_structure_rules ?? [],
    caution_notes: input.caution_notes ?? [],
    freshness_status: input.freshness_status,
  };
}

/**
 * PRD §7.0 completion check:
 * - source_refs must have at least 3 entries
 * - key_content_rules must be non-empty
 * - pulling_content_rules must be non-empty
 *
 * Throws an Error with a descriptive message if any condition is not met.
 */
export function assertContextLoadingComplete(snapshot: BusinessPTContextSnapshot): void {
  if (snapshot.source_refs.length < 3) {
    throw new Error(
      `context loading incomplete: at least 3 source_refs required (got ${snapshot.source_refs.length})`,
    );
  }
  if (snapshot.key_content_rules.length === 0) {
    throw new Error('context loading incomplete: key_content_rules must not be empty');
  }
  if (snapshot.pulling_content_rules.length === 0) {
    throw new Error('context loading incomplete: pulling_content_rules must not be empty');
  }
}

export function isContextFresh(snapshot: BusinessPTContextSnapshot): boolean {
  return snapshot.freshness_status === 'fresh';
}
