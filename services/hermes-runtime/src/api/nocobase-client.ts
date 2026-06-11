// NocoBase HTTP client for Hermes runtime tasks.
// Hermes tasks are pure functions; this module provides the real-data adapters
// that wire them to the running NocoBase instance.

import { randomUUID } from "crypto";
import type {
  AgentTask,
  BPRLog,
  WorkflowImprovementProposal,
  MemoryEntry,
} from "@l5/core";

const NOCOBASE_URL = process.env.NOCOBASE_URL ?? "http://localhost:13000";
const NOCOBASE_TOKEN = process.env.NOCOBASE_TOKEN ?? "";

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${NOCOBASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(NOCOBASE_TOKEN ? { Authorization: `Bearer ${NOCOBASE_TOKEN}` } : {}),
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NocoBase API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchAgentTasks(): Promise<AgentTask[]> {
  const data = await apiFetch("/api/agent_tasks:list?pageSize=500");
  return (data.data ?? []) as AgentTask[];
}

export async function createAgentTask(
  payload: Omit<AgentTask, "id" | "created_at" | "updated_at">,
): Promise<string> {
  const now = new Date().toISOString();
  let actualInstructionId = payload.instruction_id;
  let actualInterpretationId = (payload as any).interpretation_id;

  if (payload.instruction_id) {
    try {
      const checkRes = await apiFetch(`/api/founder_instructions:get?filterByTk=${payload.instruction_id}`);
      if (!checkRes || !checkRes.data) {
        throw new Error("not found");
      }
      actualInstructionId = checkRes.data.id;
    } catch {
      // Create a dummy instruction first to satisfy the DB foreign key constraint
      const createRes = await apiFetch("/api/founder_instructions:create", {
        method: "POST",
        body: JSON.stringify({
          raw_text: `Hermes automatically generated task: ${payload.title}`,
          source: "manual",
          status: "in_progress",
          createdAt: now,
          updatedAt: now,
          business_id: payload.business_id ?? null,
          project_id: (payload as any).project_id ?? null,
        }),
      });
      actualInstructionId = createRes.data?.id ?? createRes.id;
    }
  }

  if (!actualInterpretationId && actualInstructionId) {
    try {
      const createInterpRes = await apiFetch("/api/ceo_interpretations:create", {
        method: "POST",
        body: JSON.stringify({
          instruction_id: actualInstructionId,
          goal: `Interpretation for task: ${payload.title}`,
          phase: payload.phase ?? "scale_automation",
          risk_level: payload.risk_level ?? "D1",
          createdAt: now,
          updatedAt: now,
          business_id: payload.business_id ?? null,
          project_id: (payload as any).project_id ?? null,
        }),
      });
      actualInterpretationId = createInterpRes.data?.id ?? createInterpRes.id;
    } catch (err) {
      console.warn("[nocobase-client] ceo_interpretations creation failed:", (err as Error).message);
    }
  }

  const data = await apiFetch("/api/agent_tasks:create", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      instruction_id: actualInstructionId,
      interpretation_id: actualInterpretationId,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
    }),
  });
  return data.data?.id ?? data.id;
}

export async function updateAgentTask(
  taskId: string,
  updates: Partial<AgentTask>,
): Promise<void> {
  await apiFetch(`/api/agent_tasks:update?filterByTk=${taskId}`, {
    method: "POST",
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
}

export async function fetchPendingApprovalTasks(): Promise<AgentTask[]> {
  const data = await apiFetch(
    "/api/agent_tasks:list?filter[approval_required]=true&filter[status][$notIn][]=done&filter[status][$notIn][]=killed&pageSize=200",
  );
  return (data.data ?? []) as AgentTask[];
}

export interface FounderMemoryEntry {
  insight: string;
  workflow_improvement?: string;
  phase?: string;
}

export async function fetchFounderMemories(limit = 10): Promise<FounderMemoryEntry[]> {
  const data = await apiFetch(
    `/api/founder_memory:list?filter[approval_status]=saved&sort=-createdAt&pageSize=${limit}`,
  );
  return (data.data ?? []).map((m: any) => ({
    insight: m.insight as string,
    workflow_improvement: m.workflow_improvement as string | undefined,
    phase: m.phase as string | undefined,
  }));
}

export async function fetchQueuedTasks(): Promise<AgentTask[]> {
  const data = await apiFetch(
    "/api/agent_tasks:list?filter[status]=queued&filter[approval_required]=false&pageSize=200",
  );
  return (data.data ?? []) as AgentTask[];
}

// business_id → repo_path lookup for CTO dispatch cwd resolution.
// Returns a map of String(id) → repo_path for businesses that have one set.
export async function fetchBusinessRepoPaths(): Promise<Record<string, string>> {
  const data = await apiFetch("/api/businesses:list?pageSize=200");
  const map: Record<string, string> = {};
  for (const b of (data.data ?? []) as any[]) {
    if (b?.id != null && typeof b.repo_path === "string" && b.repo_path.trim()) {
      map[String(b.id)] = b.repo_path.trim();
    }
  }
  return map;
}

export async function saveFounderMemory(entry: {
  insight: string;
  workflow_improvement?: string;
  source_agent: string;
  source_task_id?: string;
  pii_level?: string;
  phase?: string;
}): Promise<string> {
  const data = await apiFetch("/api/founder_memory:create", {
    method: "POST",
    body: JSON.stringify({
      id: randomUUID(),
      approval_status: "pending",
      pii_level: "none",
      ...entry,
    }),
  });
  return data.data?.id ?? data.id;
}

export async function createProjectRoadmapEvent(event: {
  project_id: string;
  task_id: string;
  title: string;
  assigned_agent: string;
  status: string;
  risk_level: string;
  phase: string;
  rationale: string;
  output_summary: string;
  completed_at: string;
}): Promise<void> {
  await apiFetch("/api/project_roadmap_events:create", {
    method: "POST",
    body: JSON.stringify({
      id: randomUUID(),
      ...event,
    }),
  });
}

export async function deleteAgentTask(taskId: string): Promise<void> {
  await apiFetch(`/api/agent_tasks:destroy?filterByTk=${taskId}`, {
    method: "POST",
  });
}

// ── 호랑이(Tiger) 자가개선 카드 영속화 ───────────────────────────────────────
// night-bpr-loop가 호랑이 분석 카드를 BPRLog/WorkflowImprovementProposal/MemoryEntry로 적재한다.
// NocoBase camelCase 함정 회피: created_at/updated_at + createdAt/updatedAt를 함께 보낸다.

export async function createBPRLog(
  payload: Omit<BPRLog, "id" | "created_at" | "updated_at">,
): Promise<string> {
  const now = new Date().toISOString();
  const data = await apiFetch("/api/bpr_logs:create", {
    method: "POST",
    body: JSON.stringify({
      id: randomUUID(),
      ...payload,
      created_at: now,
      updated_at: now,
      createdAt: now,
      updatedAt: now,
    }),
  });
  return data.data?.id ?? data.id;
}

export async function createWorkflowImprovementProposal(
  payload: Omit<WorkflowImprovementProposal, "id" | "created_at" | "updated_at">,
): Promise<string> {
  const now = new Date().toISOString();
  const data = await apiFetch("/api/workflow_improvement_proposals:create", {
    method: "POST",
    body: JSON.stringify({
      id: randomUUID(),
      ...payload,
      created_at: now,
      updated_at: now,
      createdAt: now,
      updatedAt: now,
    }),
  });
  return data.data?.id ?? data.id;
}

export async function createMemoryEntry(
  payload: Omit<MemoryEntry, "id" | "created_at" | "updated_at">,
): Promise<string> {
  const now = new Date().toISOString();
  const data = await apiFetch("/api/memory_entries:create", {
    method: "POST",
    body: JSON.stringify({
      id: randomUUID(),
      ...payload,
      created_at: now,
      updated_at: now,
      createdAt: now,
      updatedAt: now,
    }),
  });
  return data.data?.id ?? data.id;
}

/** 호랑이가 발행하고 사장님이 일괄 승인한(status=approved) proposal만. tiger-dispatch 입력. */
export async function fetchApprovedTigerProposals(): Promise<
  Array<{ id: string; source_ref?: string }>
> {
  const data = await apiFetch(
    "/api/workflow_improvement_proposals:list?filter[status]=approved&filter[suggested_by_agent_id]=Tiger&sort=-createdAt&pageSize=200",
  );
  return ((data.data ?? []) as any[]).map((p) => ({
    id: String(p.id),
    source_ref: (p.source_ref as string | undefined) ?? undefined,
  }));
}

/** proposal status 패치(실행 결과 회수: 성공=implemented, 보류/실패=proposed 잔류). */
export async function updateWorkflowImprovementProposalStatus(
  id: string,
  status: WorkflowImprovementProposal["status"],
): Promise<void> {
  const now = new Date().toISOString();
  await apiFetch(`/api/workflow_improvement_proposals:update?filterByTk=${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ status, updated_at: now, updatedAt: now }),
  });
}

