// Phase 17 — CTO Verification Loop.
//
// Picks up CTO agent_tasks that the verifier flagged as 'verifier:fail' and
// re-dispatches them through runCTOAgent, up to MAX_RETRIES attempts. Retry
// count is encoded in the blocker text as `cto_retry=N` so we don't need a
// schema migration.
//
// Runs every ~10 minutes via launchd.

import type { AgentTask } from "@l5/core";
import { runCTOAgent } from "@l5/agent-runtime";

export const MAX_RETRIES = 2;

const RETRY_TAG = /cto_retry=(\d+)/;

export interface CTOVerificationLoopResult {
  ran_at: string;
  considered: number;
  retried: number;
  skipped: Array<{ task_id: string; reason: string }>;
  retries: Array<{ task_id: string; attempt: number }>;
}

export function parseRetryCount(blocker: string | null | undefined): number {
  if (!blocker) return 0;
  const m = RETRY_TAG.exec(blocker);
  return m ? Number(m[1]) : 0;
}

export function shouldRetry(task: AgentTask): boolean {
  if (task.assigned_agent !== "CTO") return false;
  if (task.status !== "needs_review") return false;
  const blocker = task.blocker ?? "";
  if (!blocker.includes("verifier:fail")) return false;
  if (!blocker.includes("retry=true")) return false;
  return parseRetryCount(blocker) < MAX_RETRIES;
}

export async function runCTOVerificationLoop(
  tasks: AgentTask[],
  updater: (
    id: string,
    updates: Partial<Pick<AgentTask, "status" | "blocker">>,
  ) => Promise<void>,
): Promise<CTOVerificationLoopResult> {
  const ranAt = new Date().toISOString();
  const skipped: CTOVerificationLoopResult["skipped"] = [];
  const retries: CTOVerificationLoopResult["retries"] = [];
  let considered = 0;

  for (const task of tasks) {
    if (task.assigned_agent !== "CTO") continue;
    considered += 1;

    if (!shouldRetry(task)) {
      skipped.push({ task_id: task.id, reason: "not-retryable" });
      continue;
    }

    const attempt = parseRetryCount(task.blocker) + 1;

    try {
      await runCTOAgent({
        task: {
          id: task.id,
          title: task.title,
          rationale: task.rationale,
          expected_output: task.expected_output,
          phase: task.phase,
          risk_level: task.risk_level,
        },
      });
      await updater(task.id, {
        status: "running",
        blocker: `cto_retry=${attempt}. re-dispatched after verifier fail.`,
      });
      retries.push({ task_id: task.id, attempt });
    } catch (err) {
      const msg = (err as Error).message;
      skipped.push({ task_id: task.id, reason: `dispatch-error: ${msg}` });
      await updater(task.id, {
        status: "needs_review",
        blocker: `cto_retry=${attempt}. dispatch failed: ${msg}`,
      });
    }
  }

  return { ran_at: ranAt, considered, retried: retries.length, skipped, retries };
}
