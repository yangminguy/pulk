// Notion PRD sync — types.
//
// CTO 승인 플로우에서 나온 PRD(CtoPlan)를 Notion "PRD저장소" 데이터베이스에
// 사람이 읽는 문서 페이지로 투영한다. 코딩 워크플로우 로그(agent_tasks 동기화)와
// 별개의 DB이고 매핑도 분리한다. NocoBase/Postgres가 source of truth이며 Notion은
// 프로젝션이다 — Notion 쪽 PRD 편집은 pulk로 되돌려 읽지 않는다(단방향 push).
//
// PRD저장소의 컬럼 구성은 사장님 소유라 확정할 수 없으므로 schema adapter 방식:
// GET /databases/:id 스키마에서 title 타입 프로퍼티를 찾아 제목을 쓰고, 그 외에는
// "Pulk " 네임스페이스의 컬럼이 실제 존재+타입 일치할 때만 쓴다(skip, never guess).

import type { CtoPlan } from '../cto-planning/types';
import type { TaskStatus, NotionDatabaseSchema } from '../notion-sync/types';

/** PRD lifecycle status projected to Notion. */
export type PrdStatus = 'draft' | 'approved' | 'executing' | 'done';

/** One PRD row candidate — a cto_planning_messages row that carries a plan. */
export interface PrdDocument {
  /** cto_planning_messages.id (the CTO turn that proposed the plan). */
  cto_message_id: string;
  thread_id: string;
  plan: CtoPlan;
  /** cto_planning_messages.plan_status: 'proposed' | 'approved'. */
  plan_status: string;
  /** founder_instructions.id set at approval — links the created agent_tasks. */
  instruction_id?: string | null;
  notion_prd_page_id?: string | null;
  created_at: string;
  updated_at: string;
  /** Statuses of the agent_tasks created from this plan (for executing/done). */
  task_statuses?: TaskStatus[];
}

/** Optional pulk-managed columns in the PRD database (schema-checked). */
export const NOTION_PRD_PROP = {
  status: 'Pulk Status',
  thread: 'Pulk Thread',
  messageId: 'Pulk Message ID',
  updatedAt: 'Pulk Updated',
} as const;

/** Expected Notion property type for each optional PRD column. */
export const PRD_PROP_TYPE: Record<string, string> = {
  [NOTION_PRD_PROP.status]: 'select',
  [NOTION_PRD_PROP.thread]: 'rich_text',
  [NOTION_PRD_PROP.messageId]: 'rich_text',
  [NOTION_PRD_PROP.updatedAt]: 'date',
};

/** Notion page content block we WRITE (children on page create). Minimal. */
export interface NotionBlock {
  object: 'block';
  type: string;
  [key: string]: unknown;
}

export type { NotionDatabaseSchema };
