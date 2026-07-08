// Bidirectional map between pulk task status and the Notion "Status" select label.
// Kept explicit (not derived) so an unknown Notion label is skipped, never guessed.

import type { TaskStatus } from './types';

/** pulk status → human-readable Notion select label. */
const TO_LABEL: Record<TaskStatus, string> = {
  queued: 'Queued',
  running: 'In Progress',
  blocked: 'Blocked',
  needs_review: 'Needs Review',
  done: 'Done',
  killed: 'Killed',
};

/** Notion label → pulk status (reverse of TO_LABEL). */
const FROM_LABEL: Record<string, TaskStatus> = Object.fromEntries(
  (Object.entries(TO_LABEL) as Array<[TaskStatus, string]>).map(([status, label]) => [label, status]),
) as Record<string, TaskStatus>;

/** All valid Notion select option names — used when creating the DB schema. */
export const NOTION_STATUS_OPTIONS: string[] = Object.values(TO_LABEL);

export function statusToNotionLabel(status: TaskStatus): string {
  return TO_LABEL[status];
}

/** Returns the pulk status for a Notion label, or null if unrecognized (skip, don't guess). */
export function notionLabelToStatus(label: string | null | undefined): TaskStatus | null {
  if (!label) return null;
  return FROM_LABEL[label] ?? null;
}
