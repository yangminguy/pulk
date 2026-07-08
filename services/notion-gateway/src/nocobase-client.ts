// NocoBase adapter for agent_tasks — raw fetch (mirrors hermes-runtime pattern).
// Note: NocoBase auto-timestamps are camelCase (createdAt/updatedAt); we map them
// to the AgentTask snake_case shape used by l5-core (see rules/60-nocobase).

import type { AgentTask, TaskStatus, TaskLink, PrdDocument } from '@l5/core';
import type { NotionGatewayConfig } from './config.js';

export class NocoBaseClient {
  constructor(private readonly cfg: NotionGatewayConfig) {}

  private async api(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`${this.cfg.nocobaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.cfg.nocobaseToken ? { Authorization: `Bearer ${this.cfg.nocobaseToken}` } : {}),
        ...(init.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      throw new Error(`NocoBase ${res.status} ${path}: ${await res.text()}`);
    }
    return res.json();
  }

  /** All agent_tasks as task+link pairs (link carries the stored notion_page_id). */
  async listTaskLinks(): Promise<TaskLink[]> {
    const data = await this.api('/api/agent_tasks:list?pageSize=200');
    const rows: any[] = data?.data ?? [];
    return rows.map((row) => ({
      task: rowToTask(row),
      notionPageId: row.notion_page_id ?? null,
    }));
  }

  async setNotionPageId(taskId: string, pageId: string): Promise<void> {
    await this.api(`/api/agent_tasks:update?filterByTk=${encodeURIComponent(taskId)}`, {
      method: 'POST',
      body: JSON.stringify({ notion_page_id: pageId }),
    });
  }

  async setStatus(taskId: string, status: TaskStatus): Promise<void> {
    await this.api(`/api/agent_tasks:update?filterByTk=${encodeURIComponent(taskId)}`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  /** CTO planning turns that carry a plan (proposed/approved) → PRD candidates.
   * task_statuses is filled by the PRD sync round from the task links. */
  async listPrdDocuments(): Promise<PrdDocument[]> {
    const filter = encodeURIComponent(
      JSON.stringify({ role: 'cto', plan_status: { $in: ['proposed', 'approved'] } }),
    );
    const data = await this.api(`/api/cto_planning_messages:list?pageSize=200&filter=${filter}`);
    const rows: any[] = data?.data ?? [];
    return rows
      .filter((row) => row.plan)
      .map((row) => ({
        cto_message_id: String(row.id),
        thread_id: String(row.thread_id ?? ''),
        plan: typeof row.plan === 'string' ? JSON.parse(row.plan) : row.plan,
        plan_status: String(row.plan_status ?? 'proposed'),
        instruction_id: row.instruction_id ?? null,
        notion_prd_page_id: row.notion_prd_page_id ?? null,
        created_at: row.createdAt ?? row.created_at ?? '',
        updated_at: row.updatedAt ?? row.updated_at ?? '',
      }));
  }

  async setNotionPrdPageId(ctoMessageId: string, pageId: string): Promise<void> {
    await this.api(
      `/api/cto_planning_messages:update?filterByTk=${encodeURIComponent(ctoMessageId)}`,
      { method: 'POST', body: JSON.stringify({ notion_prd_page_id: pageId }) },
    );
  }
}

function rowToTask(row: any): AgentTask {
  return {
    id: row.id,
    instruction_id: row.instruction_id,
    interpretation_id: row.interpretation_id ?? undefined,
    assigned_agent: row.assigned_agent,
    title: row.title,
    rationale: row.rationale,
    expected_output: row.expected_output,
    status: row.status,
    approval_required: !!row.approval_required,
    risk_level: row.risk_level ?? undefined,
    phase: row.phase ?? undefined,
    source_ref: row.source_ref ?? undefined,
    blocker: row.blocker ?? undefined,
    due_at: row.due_at ?? undefined,
    business_id: row.business_id ?? undefined,
    acr_branch: row.acr_branch ?? undefined,
    acr_pr_url: row.acr_pr_url ?? undefined,
    created_at: row.createdAt ?? row.created_at ?? '',
    updated_at: row.updatedAt ?? row.updated_at ?? '',
  };
}
