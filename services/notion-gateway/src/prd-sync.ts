// One PRD sync round: project CTO plans (cto_planning_messages with a plan)
// into the Notion "PRD저장소" database. One-way push — NocoBase stays the source
// of truth; founder edits to the Notion PRD page body are never read back or
// overwritten (updates touch pulk-managed properties only, never children).
// Ports are structural so this is unit-testable with fakes (no network).

import { mapPrdToProperties, buildPrdChildren } from '@l5/core';
import type {
  NotionBlock,
  NotionDatabaseSchema,
  NotionPropertiesPayload,
  PrdDocument,
  TaskLink,
} from '@l5/core';

export interface PrdNotionPort {
  retrieveDatabaseSchema(databaseId: string): Promise<NotionDatabaseSchema>;
  createPage(
    properties: NotionPropertiesPayload,
    opts?: { databaseId?: string; children?: NotionBlock[] },
  ): Promise<string>;
  updatePage(pageId: string, properties: NotionPropertiesPayload): Promise<void>;
}

export interface PrdNocoBasePort {
  listPrdDocuments(): Promise<PrdDocument[]>;
  setNotionPrdPageId(ctoMessageId: string, pageId: string): Promise<void>;
}

export interface PrdSyncSummary {
  created: number;
  updated: number;
  /** instruction_id → Notion PRD page id, for linking tasks to their source PRD. */
  prdPageByInstruction: Map<string, string>;
}

export async function runPrdSyncRound(
  noco: PrdNocoBasePort,
  notion: PrdNotionPort,
  prdDatabaseId: string,
  taskLinks: TaskLink[] = [],
): Promise<PrdSyncSummary> {
  const docs = await noco.listPrdDocuments();
  const summary: PrdSyncSummary = { created: 0, updated: 0, prdPageByInstruction: new Map() };
  if (docs.length === 0) return summary;

  const schema = await notion.retrieveDatabaseSchema(prdDatabaseId);

  for (const doc of docs) {
    // Status derivation input: statuses of the agent_tasks born from this plan.
    doc.task_statuses = taskLinks
      .filter((l) => doc.instruction_id && l.task.instruction_id === doc.instruction_id)
      .map((l) => l.task.status);

    const props = mapPrdToProperties(doc, schema);
    if (Object.keys(props).length === 0) continue; // schema has nothing we can write

    if (doc.notion_prd_page_id) {
      await notion.updatePage(doc.notion_prd_page_id, props);
      summary.updated += 1;
    } else {
      const pageId = await notion.createPage(props, {
        databaseId: prdDatabaseId,
        children: buildPrdChildren(doc),
      });
      await noco.setNotionPrdPageId(doc.cto_message_id, pageId);
      doc.notion_prd_page_id = pageId;
      summary.created += 1;
    }

    if (doc.instruction_id && doc.notion_prd_page_id) {
      summary.prdPageByInstruction.set(doc.instruction_id, doc.notion_prd_page_id);
    }
  }

  return summary;
}
