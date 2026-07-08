// PulkClient — thin NocoBase REST client for the CTO structured-planning bridge.
// Raw fetch, dependency-free (mirrors services/notion-gateway/nocobase-client).
// NocoBase/Postgres stays the source of truth; this client only drives the
// existing cto:planMessage / cto:approvePlan actions and reads the planning log.

export interface CtoPlanSummary {
  prd: string;
  roadmap_items: Array<{ title: string; summary?: string; sequence?: number }>;
  tasks: Array<{ title: string; expected_output?: string; roadmap_sequence?: number }>;
  project_proposal?: {
    is_new_project: boolean;
    suggested_project_title?: string;
    rationale?: string;
  } | null;
  token_estimate?: { total_tokens?: number } | null;
}

export interface PlanMessageResult {
  reply: string;
  plan: CtoPlanSummary | null;
  cto_message_id: string;
}

export interface ApprovePlanResult {
  new_project?: boolean;
  project_id: string | null;
  instruction_id?: string;
  roadmap_item_ids?: string[];
  task_ids?: string[];
  already_approved?: boolean;
}

export interface PendingPlanRef {
  cto_message_id: string;
}

/** Port used by the planning bridge (fake-able in tests). */
export interface PulkPlanningPort {
  planMessage(threadId: string, founderMessage: string): Promise<PlanMessageResult>;
  approvePlan(ctoMessageId: string): Promise<ApprovePlanResult>;
  latestProposedPlan(threadId: string): Promise<PendingPlanRef | null>;
}

export class PulkClient implements PulkPlanningPort {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async api(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(init.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      throw new Error(`NocoBase ${res.status} ${path}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json();
  }

  async planMessage(threadId: string, founderMessage: string): Promise<PlanMessageResult> {
    const data = await this.api('/api/cto:planMessage', {
      method: 'POST',
      body: JSON.stringify({ thread_id: threadId, founder_message: founderMessage }),
    });
    return data?.data?.data ?? data?.data;
  }

  async approvePlan(ctoMessageId: string): Promise<ApprovePlanResult> {
    const data = await this.api('/api/cto:approvePlan', {
      method: 'POST',
      body: JSON.stringify({ cto_message_id: ctoMessageId }),
    });
    return data?.data?.data ?? data?.data;
  }

  /** Most recent proposed (not yet approved) plan in this Slack-thread's planning log. */
  async latestProposedPlan(threadId: string): Promise<PendingPlanRef | null> {
    const filter = encodeURIComponent(
      JSON.stringify({ thread_id: threadId, role: 'cto', plan_status: 'proposed' }),
    );
    const data = await this.api(
      `/api/cto_planning_messages:list?pageSize=1&sort=-createdAt&filter=${filter}`,
    );
    const row = (data?.data ?? [])[0];
    return row ? { cto_message_id: String(row.id) } : null;
  }
}
