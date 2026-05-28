// Hermes Runner — wires pure task functions to real NocoBase data.
// Call these functions from Trigger.dev tasks, cron jobs, or HTTP triggers.

import { randomUUID } from "crypto";
import {
  fetchAgentTasks,
  fetchPendingApprovalTasks,
  createAgentTask,
  updateAgentTask,
} from "./api/nocobase-client.js";
import { runRepetitionAnalyzer } from "./tasks/repetition-analyzer.js";
import { runApprovalChecker } from "./tasks/approval-checker.js";
import { runStalledTaskDetector } from "./tasks/stalled-task-detector.js";
import { runCTOPhaseReview } from "./tasks/cto-phase-review.js";
import type { DailyApprovalBrief } from "./tasks/approval-checker.js";

const NOCOBASE_URL = process.env.NOCOBASE_URL ?? "http://localhost:13000";

export async function runRepetitionAnalyzerLive() {
  const tasks = await fetchAgentTasks();
  return runRepetitionAnalyzer(tasks, async (payload) => {
    return createAgentTask({
      ...payload,
      instruction_id: randomUUID(),
    });
  });
}

export async function runApprovalCheckerLive(
  notifier?: (brief: DailyApprovalBrief) => Promise<boolean>,
) {
  const tasks = await fetchPendingApprovalTasks();
  const defaultNotifier = async (brief: DailyApprovalBrief) => {
    console.log("[Hermes] Approval brief:", JSON.stringify(brief, null, 2));
    return true;
  };
  return runApprovalChecker(tasks, notifier ?? defaultNotifier);
}

export async function runStalledTaskDetectorLive() {
  const tasks = await fetchAgentTasks();
  return runStalledTaskDetector(tasks, async (report) => {
    console.log("[Hermes] Stalled task alert:", JSON.stringify(report, null, 2));
    return report.map((r) => r.task_id);
  });
}

export async function runCTOPhaseReviewLive() {
  const tasks = await fetchAgentTasks();
  return runCTOPhaseReview(tasks, async ({ from_phase, to_phase, reason }) => {
    const now = new Date().toISOString();
    const id = randomUUID();
    await createAgentTask({
      instruction_id: randomUUID(),
      assigned_agent: "CEO",
      title: `BPR 단계 전환 요청: ${from_phase} → ${to_phase}`,
      rationale: reason,
      expected_output: `${to_phase} 단계 전환 승인 및 실행`,
      status: "needs_review",
      approval_required: true,
      risk_level: "D5",
      phase: to_phase as import("@l5/core").OrchestrationPhase,
    });
    return id;
  });
}

// D3 태스크 24h 자동 승인 처리 - approval-checker가 감지한 만료 항목을 실제 DB에 반영
export async function syncD3AutoApprovals() {
  const tasks = await fetchPendingApprovalTasks();
  const now = new Date();
  const D3_MS = 24 * 60 * 60 * 1000;
  let count = 0;

  for (const t of tasks) {
    if (
      t.risk_level === "D3" &&
      t.status === "needs_review" &&
      t.approval_required
    ) {
      const expiry = new Date(t.created_at).getTime() + D3_MS;
      if (now.getTime() >= expiry) {
        await updateAgentTask(t.id, {
          status: "done",
          approval_required: false,
        });
        count++;
      }
    }
  }

  return { synced_at: now.toISOString(), auto_approved_count: count };
}
