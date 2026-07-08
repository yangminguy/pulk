// reconcile — decide the sync actions for one polling round. Pure.
//
// Bidirectional with explicit conflict handling:
//   - pulk-owned fields (title/rationale/…) always flow pulk→Notion.
//   - Status is contested (both sides change it): last-writer-wins by timestamp,
//     comparing pulk task.updated_at vs Notion page.last_edited_time.

import type { AgentTask } from '../../types/orchestration';
import type { NotionPage, TaskStatusUpdate } from './types';
import { NOTION_PROP } from './types';
import { notionLabelToStatus } from './status-map';

/** A pulk task paired with the Notion page id it's currently linked to (if any). */
export interface TaskLink {
  task: AgentTask;
  notionPageId: string | null;
}

export interface CreateIntent {
  task: AgentTask;
}
export interface UpdateIntent {
  pageId: string;
  task: AgentTask;
  /** true → also push Status (pulk won the conflict); false → leave Notion's Status. */
  includeStatus: boolean;
}

export interface ReconcileResult {
  /** Tasks with no linked Notion row yet → create a page. */
  toCreate: CreateIntent[];
  /** Linked tasks → push pulk-owned fields (and Status when pulk is newer). */
  toUpdate: UpdateIntent[];
  /** Notion-side status edits that are newer → write back into pulk. */
  toPullBack: TaskStatusUpdate[];
}

function readNotionStatus(page: NotionPage): string | null {
  return page.properties?.[NOTION_PROP.status]?.select?.name ?? null;
}

/** ms since epoch, or 0 when the timestamp is missing/unparseable. */
function ts(iso: string | undefined | null): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * @param links   pulk tasks + their linked Notion page id
 * @param pages   current Notion rows, keyed for lookup by page id
 */
export function reconcile(links: TaskLink[], pages: NotionPage[]): ReconcileResult {
  const pageById = new Map<string, NotionPage>(pages.map((p) => [p.id, p]));
  const result: ReconcileResult = { toCreate: [], toUpdate: [], toPullBack: [] };

  for (const { task, notionPageId } of links) {
    const page = notionPageId ? pageById.get(notionPageId) : undefined;

    if (!page) {
      result.toCreate.push({ task });
      continue;
    }

    const notionStatus = notionLabelToStatus(readNotionStatus(page));
    const conflict = notionStatus !== null && notionStatus !== task.status;

    if (!conflict) {
      result.toUpdate.push({ pageId: page.id, task, includeStatus: false });
      continue;
    }

    // Both sides disagree on status → newer edit wins.
    const notionNewer = ts(page.last_edited_time) > ts(task.updated_at);
    if (notionNewer) {
      result.toPullBack.push({ task_id: task.id, status: notionStatus! });
      result.toUpdate.push({ pageId: page.id, task, includeStatus: false });
    } else {
      result.toUpdate.push({ pageId: page.id, task, includeStatus: true });
    }
  }

  return result;
}
