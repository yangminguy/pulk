// NocoBase HTTP client for Hermes runtime tasks.
// Hermes tasks are pure functions; this module provides the real-data adapters
// that wire them to the running NocoBase instance.

import { randomUUID } from "crypto";
import type { AgentTask } from "@l5/core";

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
  const data = await apiFetch("/api/agent_tasks:create", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
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
    "/api/agent_tasks:list?filter[approval_required]=true&filter[status][notIn][]=done&filter[status][notIn][]=killed&pageSize=200",
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
