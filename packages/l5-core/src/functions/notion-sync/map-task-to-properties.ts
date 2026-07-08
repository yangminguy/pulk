// pulk AgentTask → Notion page properties (push direction). Pure.

import type { AgentTask } from '../../types/orchestration';
import { NOTION_PROP } from './types';
import type { NotionPropertiesPayload } from './types';
import { statusToNotionLabel } from './status-map';

/** Notion rich_text/title caps content at 2000 chars per element. */
const MAX_TEXT = 2000;

function text(content: string): Array<{ text: { content: string } }> {
  return [{ text: { content: (content ?? '').slice(0, MAX_TEXT) } }];
}

function select(name: string | null | undefined) {
  return { select: name ? { name } : null };
}

function date(iso: string | null | undefined) {
  return { date: iso ? { start: iso } : null };
}

/**
 * Build the Notion properties payload for a task.
 * Includes Status (상태), written on CREATE to seed the row; on subsequent pulls
 * Notion owns it. The gateway decides create vs update.
 */
export function mapTaskToProperties(task: AgentTask): NotionPropertiesPayload {
  return {
    [NOTION_PROP.title]: { title: text(task.title) },
    [NOTION_PROP.status]: select(statusToNotionLabel(task.status)),
    [NOTION_PROP.rationale]: { rich_text: text(task.rationale) },
    [NOTION_PROP.date]: date(task.created_at || null),
    [NOTION_PROP.pulkTaskId]: { rich_text: text(task.id) },
  };
}

/**
 * Properties to write on UPDATE (pulk→Notion). Excludes Status so a founder's
 * Notion-side status edit is never clobbered by a pulk push.
 */
export function mapTaskToUpdateProperties(task: AgentTask): NotionPropertiesPayload {
  const all = mapTaskToProperties(task);
  const { [NOTION_PROP.status]: _status, ...pulkOwned } = all;
  return pulkOwned;
}
