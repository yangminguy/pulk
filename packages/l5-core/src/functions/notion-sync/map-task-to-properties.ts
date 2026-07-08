// pulk AgentTask → Notion page properties (push direction). Pure.

import type { AgentTask } from '../../types/orchestration';
import { NOTION_PROP, NOTION_OPTIONAL_PROP } from './types';
import type { NotionPropertiesPayload, NotionWriteProperty, TaskSyncExtras } from './types';
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
export function mapTaskToProperties(task: AgentTask, extras?: TaskSyncExtras): NotionPropertiesPayload {
  return {
    [NOTION_PROP.title]: { title: text(task.title) },
    [NOTION_PROP.status]: select(statusToNotionLabel(task.status)),
    [NOTION_PROP.rationale]: { rich_text: text(task.rationale) },
    [NOTION_PROP.date]: date(task.created_at || null),
    [NOTION_PROP.pulkTaskId]: { rich_text: text(task.id) },
    ...optionalProperties(task, extras),
  };
}

/**
 * Optional pulk-managed metadata columns. Written only for columns present in
 * extras.availableProps (the live DB schema intersection) — a Notion DB without
 * a column rejects the write, so missing columns are skipped, never guessed.
 * No availableProps → no optional columns (core-only, today's behavior).
 */
function optionalProperties(task: AgentTask, extras?: TaskSyncExtras): NotionPropertiesPayload {
  const avail = extras?.availableProps;
  if (!avail || avail.size === 0) return {};

  const candidates: Record<string, NotionWriteProperty | null> = {
    [NOTION_OPTIONAL_PROP.assignedAgent]: task.assigned_agent
      ? select(String(task.assigned_agent))
      : null,
    [NOTION_OPTIONAL_PROP.phase]: task.phase ? select(String(task.phase)) : null,
    [NOTION_OPTIONAL_PROP.riskLevel]: task.risk_level ? select(String(task.risk_level)) : null,
    [NOTION_OPTIONAL_PROP.expectedOutput]: task.expected_output
      ? { rich_text: text(task.expected_output) }
      : null,
    // Blocker is cleared (not skipped) once resolved, so stale blockers don't linger.
    [NOTION_OPTIONAL_PROP.blocker]: { rich_text: text(task.blocker ?? '') },
    [NOTION_OPTIONAL_PROP.acrBranch]: task.acr_branch
      ? { rich_text: text(task.acr_branch) }
      : null,
    [NOTION_OPTIONAL_PROP.acrPrUrl]: task.acr_pr_url ? { url: task.acr_pr_url } : null,
    [NOTION_OPTIONAL_PROP.updatedAt]: task.updated_at ? date(task.updated_at) : null,
    [NOTION_OPTIONAL_PROP.sourcePrd]: extras?.sourcePrdPageId
      ? { rich_text: text(extras.sourcePrdPageId) }
      : null,
  };

  const out: NotionPropertiesPayload = {};
  for (const [name, prop] of Object.entries(candidates)) {
    if (prop !== null && avail.has(name)) out[name] = prop;
  }
  return out;
}

/**
 * Properties to write on UPDATE (pulk→Notion). Excludes Status so a founder's
 * Notion-side status edit is never clobbered by a pulk push.
 */
export function mapTaskToUpdateProperties(task: AgentTask, extras?: TaskSyncExtras): NotionPropertiesPayload {
  const all = mapTaskToProperties(task, extras);
  const { [NOTION_PROP.status]: _status, ...pulkOwned } = all;
  return pulkOwned;
}
