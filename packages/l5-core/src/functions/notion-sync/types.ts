// Notion sync — types.
//
// pulk `agent_tasks` ↔ Notion database rows, bidirectional (workers 불필요).
// Field ownership is split to avoid write conflicts:
//   - pulk-owned  (push pulk→Notion): title, rationale, expected_output, agent, risk, phase, pulk task id
//   - Notion-owned (pull Notion→pulk): status
// The mapping logic here is pure — no @notionhq/client, so l5-core stays
// testable without external deps. The gateway service supplies the real client.

import type { AgentTask } from '../../types/orchestration';

/** pulk task status ('queued' | 'running' | …). */
export type TaskStatus = AgentTask['status'];

/** Minimal shape of a Notion "properties" payload we WRITE (create/update page).
 * Only the property kinds we use. */
export interface NotionTitleProperty {
  title: Array<{ text: { content: string } }>;
}
export interface NotionRichTextProperty {
  rich_text: Array<{ text: { content: string } }>;
}
export interface NotionSelectProperty {
  select: { name: string } | null;
}
export interface NotionDateProperty {
  date: { start: string } | null;
}
export type NotionWriteProperty =
  | NotionTitleProperty
  | NotionRichTextProperty
  | NotionSelectProperty
  | NotionDateProperty;

export type NotionPropertiesPayload = Record<string, NotionWriteProperty>;

/** Minimal shape of a Notion page we READ back when polling. */
export interface NotionPage {
  id: string;
  /** Notion's server-side last-edit time (ISO). Used for conflict ordering. */
  last_edited_time?: string;
  properties: Record<string, NotionReadProperty>;
}

/** Minimal shape of a property as Notion returns it on read. */
export interface NotionReadProperty {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name: string } | null;
}

/** Notion database property names — matches the founder's "코딩 워크플로우 로그" DB.
 * Reused existing columns (이름/무엇을 했나/날짜) + two pulk-managed columns
 * (상태/Pulk Task ID). The founder's other columns (단계/영역/워크플로우 태그/
 * PR·이슈 링크/메모) are never written — they stay founder-owned. */
export const NOTION_PROP = {
  title: '이름',
  status: '상태',
  rationale: '무엇을 했나',
  date: '날짜',
  pulkTaskId: 'Pulk Task ID',
} as const;

/** A partial pulk-task update produced by pulling a Notion edit back. */
export interface TaskStatusUpdate {
  task_id: string;
  status: TaskStatus;
}
