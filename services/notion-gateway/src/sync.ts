// One sync round: reconcile pulk agent_tasks against Notion rows, then apply.
// Ports are structural so this is unit-testable with fakes (no network).

import {
  reconcile,
  mapTaskToProperties,
  mapTaskToUpdateProperties,
} from '@l5/core';
import type { TaskLink, NotionPage, NotionPropertiesPayload, TaskStatus } from '@l5/core';

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

export async function runSyncRound(noco: NocoBasePort, notion: NotionPort): Promise<SyncSummary> {
  const [links, pages] = await Promise.all([noco.listTaskLinks(), notion.queryDatabase()]);
  const plan = reconcile(links, pages);

  // Pull Notion-side status edits back into pulk first (source of truth for status).
  for (const { task_id, status } of plan.toPullBack) {
    await noco.setStatus(task_id, status);
  }

  // Push pulk-owned fields to existing rows.
  for (const { pageId, task, includeStatus } of plan.toUpdate) {
    const props = includeStatus ? mapTaskToProperties(task) : mapTaskToUpdateProperties(task);
    await notion.updatePage(pageId, props);
  }

  // Create rows for tasks not yet in Notion, then persist the page id link.
  for (const { task } of plan.toCreate) {
    const pageId = await notion.createPage(mapTaskToProperties(task));
    await noco.setNotionPageId(task.id, pageId);
  }

  return {
    created: plan.toCreate.length,
    updated: plan.toUpdate.length,
    pulledBack: plan.toPullBack.length,
  };
}
