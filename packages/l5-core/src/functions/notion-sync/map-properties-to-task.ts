// Notion page → pulk task update (pull direction). Pure.
// Only Status is Notion-owned, so that's all we read back.

import { NOTION_PROP } from './types';
import type { NotionPage, TaskStatusUpdate } from './types';
import { notionLabelToStatus } from './status-map';

function readSelectName(page: NotionPage, prop: string): string | null {
  return page.properties?.[prop]?.select?.name ?? null;
}

function readRichText(page: NotionPage, prop: string): string {
  const parts = page.properties?.[prop]?.rich_text ?? [];
  return parts.map((p) => p.plain_text ?? '').join('').trim();
}

/** The pulk task id this Notion row maps to (empty string if missing). */
export function readPulkTaskId(page: NotionPage): string {
  return readRichText(page, NOTION_PROP.pulkTaskId);
}

/**
 * Extract a status write-back from a Notion page.
 * Returns null when the row has no pulk task id or an unrecognized status label
 * (skip rather than guess).
 */
export function mapPageToStatusUpdate(page: NotionPage): TaskStatusUpdate | null {
  const taskId = readPulkTaskId(page);
  if (!taskId) return null;
  const status = notionLabelToStatus(readSelectName(page, NOTION_PROP.status));
  if (!status) return null;
  return { task_id: taskId, status };
}
