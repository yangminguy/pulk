// CtoPlan/PRD → Notion PRD저장소 page (push direction, one-way). Pure.

import type { NotionPropertiesPayload } from '../notion-sync/types';
import type { TaskStatus } from '../notion-sync/types';
import {
  NOTION_PRD_PROP,
  PRD_PROP_TYPE,
  type NotionBlock,
  type NotionDatabaseSchema,
  type PrdDocument,
  type PrdStatus,
} from './types';

/** Notion rich_text/title caps content at 2000 chars per element. */
const MAX_TEXT = 2000;
/** Notion caps children at 100 blocks per create request. */
const MAX_BLOCKS = 95;

function text(content: string): Array<{ text: { content: string } }> {
  return [{ text: { content: (content ?? '').slice(0, MAX_TEXT) } }];
}

/** Human title for the PRD page: new-project title → first roadmap item →
 * first non-empty PRD line → fallback. */
export function derivePrdTitle(doc: PrdDocument): string {
  const proposal = doc.plan.project_proposal;
  if (proposal?.suggested_project_title) return proposal.suggested_project_title;
  const firstLine = (doc.plan.prd ?? '')
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  if (firstLine) return firstLine.slice(0, 100);
  if (doc.plan.roadmap_items?.[0]?.title) return doc.plan.roadmap_items[0].title;
  return `CTO 계획 ${doc.cto_message_id.slice(0, 8)}`;
}

/**
 * PRD lifecycle from plan_status + the linked tasks' statuses:
 * proposed → draft; approved with all tasks done → done; approved with any
 * task past 'queued' → executing; otherwise approved.
 */
export function derivePrdStatus(planStatus: string, taskStatuses: TaskStatus[] = []): PrdStatus {
  if (planStatus !== 'approved') return 'draft';
  if (taskStatuses.length > 0 && taskStatuses.every((s) => s === 'done')) return 'done';
  if (taskStatuses.some((s) => s !== 'queued' && s !== 'killed')) return 'executing';
  return 'approved';
}

/** The name of the (mandatory, but arbitrarily named) title property in the DB. */
export function findTitleProp(schema: NotionDatabaseSchema): string | null {
  for (const [name, def] of Object.entries(schema)) {
    if (def?.type === 'title') return name;
  }
  return null;
}

/**
 * Properties payload for the PRD page. The title property is discovered from
 * the live schema by type; optional pulk-managed columns are written only when
 * they exist with the expected type (skip, never guess). Founder-owned columns
 * are never touched.
 */
export function mapPrdToProperties(
  doc: PrdDocument,
  schema: NotionDatabaseSchema,
): NotionPropertiesPayload {
  const props: NotionPropertiesPayload = {};

  const titleProp = findTitleProp(schema);
  if (titleProp) props[titleProp] = { title: text(derivePrdTitle(doc)) };

  const has = (name: string) => schema[name]?.type === PRD_PROP_TYPE[name];
  if (has(NOTION_PRD_PROP.status)) {
    props[NOTION_PRD_PROP.status] = {
      select: { name: derivePrdStatus(doc.plan_status, doc.task_statuses ?? []) },
    };
  }
  if (has(NOTION_PRD_PROP.thread)) {
    props[NOTION_PRD_PROP.thread] = { rich_text: text(doc.thread_id) };
  }
  if (has(NOTION_PRD_PROP.messageId)) {
    props[NOTION_PRD_PROP.messageId] = { rich_text: text(doc.cto_message_id) };
  }
  if (has(NOTION_PRD_PROP.updatedAt)) {
    props[NOTION_PRD_PROP.updatedAt] = { date: doc.updated_at ? { start: doc.updated_at } : null };
  }
  return props;
}

function heading(content: string): NotionBlock {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: text(content) } };
}

function paragraph(content: string): NotionBlock {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: text(content) } };
}

function bullet(content: string): NotionBlock {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: text(content) },
  };
}

/** Split long text into ≤2000-char paragraph blocks (prefer newline boundaries). */
function paragraphs(body: string): NotionBlock[] {
  const out: NotionBlock[] = [];
  for (const chunk of (body ?? '').split(/\n{2,}/)) {
    const t = chunk.trim();
    if (!t) continue;
    for (let i = 0; i < t.length; i += MAX_TEXT) out.push(paragraph(t.slice(i, i + MAX_TEXT)));
  }
  return out;
}

/**
 * Page body blocks written on CREATE only (updates touch properties, not body,
 * so founder edits to the page body are never clobbered).
 */
export function buildPrdChildren(doc: PrdDocument): NotionBlock[] {
  const blocks: NotionBlock[] = [];

  blocks.push(heading('PRD'));
  blocks.push(...paragraphs(doc.plan.prd ?? '(PRD 본문 없음)'));

  const roadmap = doc.plan.roadmap_items ?? [];
  if (roadmap.length > 0) {
    blocks.push(heading('로드맵'));
    for (const it of roadmap) {
      blocks.push(bullet(`${it.sequence}. ${it.title} — ${it.summary ?? ''}`));
    }
  }

  const tasks = doc.plan.tasks ?? [];
  if (tasks.length > 0) {
    blocks.push(heading(`태스크 (${tasks.length}개)`));
    for (const tk of tasks) {
      blocks.push(bullet(`[R${tk.roadmap_sequence}] ${tk.title} → ${tk.expected_output ?? ''}`));
    }
  }

  blocks.push(heading('출처'));
  blocks.push(
    paragraph(
      `thread: ${doc.thread_id} / message: ${doc.cto_message_id} / created: ${doc.created_at}`,
    ),
  );

  return blocks.slice(0, MAX_BLOCKS);
}
