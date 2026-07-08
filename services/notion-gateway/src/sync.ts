// One sync round: reconcile pulk agent_tasks against Notion rows, then apply.
// Ports are structural so this is unit-testable with fakes (no network).

import {
  reconcile,
  mapTaskToProperties,
  mapTaskToUpdateProperties,
} from '@l5/core';
import type { TaskLink, NotionPage, NotionPropertiesPayload, TaskStatus, TaskSyncExtras } from '@l5/core';

export interface NotionPort {
  queryDatabase(): Promise<NotionPage[]>;
  createPage(properties: NotionPropertiesPayload): Promise<string>;
  updatePage(pageId: string, properties: NotionPropertiesPayload): Promise<void>;
}

export interface NocoBasePort {
  listTaskLinks(): Promise<TaskLink[]>;
  setNotionPageId(taskId: string, pageId: string): Promise<void>;
  setStatus(taskId: string, status: TaskStatus): Promise<void>;
}

export interface SyncSummary {
  created: number;
  updated: number;
  pulledBack: number;
}

export interface SyncRoundOptions {
  /** Optional pulk-managed columns present in the live Notion DB (schema-checked).
   * Undefined → core columns only (backward compatible). */
  availableProps?: ReadonlySet<string>;
  /** instruction_id → Notion PRD page id (from the PRD sync round). */
  prdPageByInstruction?: ReadonlyMap<string, string>;
}

export async function runSyncRound(
  noco: NocoBasePort,
  notion: NotionPort,
  opts: SyncRoundOptions = {},
): Promise<SyncSummary> {
  const [links, pages] = await Promise.all([noco.listTaskLinks(), notion.queryDatabase()]);
  const plan = reconcile(links, pages);

  const extrasFor = (task: TaskLink['task']): TaskSyncExtras => ({
    availableProps: opts.availableProps,
    sourcePrdPageId: opts.prdPageByInstruction?.get(task.instruction_id) ?? null,
  });

  // Pull Notion-side status edits back into pulk first (source of truth for status).
  for (const { task_id, status } of plan.toPullBack) {
    await noco.setStatus(task_id, status);
  }

  // Push pulk-owned fields to existing rows.
  for (const { pageId, task, includeStatus } of plan.toUpdate) {
    const props = includeStatus
      ? mapTaskToProperties(task, extrasFor(task))
      : mapTaskToUpdateProperties(task, extrasFor(task));
    await notion.updatePage(pageId, props);
  }

  // Create rows for tasks not yet in Notion, then persist the page id link.
  for (const { task } of plan.toCreate) {
    const pageId = await notion.createPage(mapTaskToProperties(task, extrasFor(task)));
    await noco.setNotionPageId(task.id, pageId);
  }

  return {
    created: plan.toCreate.length,
    updated: plan.toUpdate.length,
    pulledBack: plan.toPullBack.length,
  };
}
