// Hermes Runner — wires pure task functions to real NocoBase data.
// Call these functions from cron jobs or HTTP triggers.

import { randomUUID } from "crypto";
import {
  fetchAgentTasks,
  fetchPendingApprovalTasks,
  fetchQueuedTasks,
  fetchBusinessRepoPaths,
  createAgentTask,
  updateAgentTask,
  createProjectRoadmapEvent,
  deleteAgentTask,
} from "./api/nocobase-client.js";
import { runRepetitionAnalyzer } from "./tasks/repetition-analyzer.js";
import { runApprovalChecker } from "./tasks/approval-checker.js";
import { runDailyBriefGenerator } from "./tasks/daily-brief-generator.js";
import { runStalledTaskDetector } from "./tasks/stalled-task-detector.js";
import { runCTOPhaseReview } from "./tasks/cto-phase-review.js";
import { runTaskDispatcher } from "./tasks/task-dispatcher.js";
import { runCTOVerificationLoop } from "./tasks/cto-verification-loop.js";
import { runModelVerify } from "./tasks/model-verify.js";
import { runSelfLearning } from "./tasks/self-learning.js";
import { runCmoStrategyWatch } from "./tasks/cmo-strategy-watch.js";
import { runTaskArchiver } from "./tasks/task-archiver.js";
import type { DailyApprovalBrief } from "./tasks/approval-checker.js";
import type { DailyBrief } from "./tasks/daily-brief-generator.js";

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

export async function runDailyBriefGeneratorLive() {
  const tasks = await fetchAgentTasks();
  return runDailyBriefGenerator(tasks, async (brief: DailyBrief) => {
    console.log("[Hermes] Daily brief:", JSON.stringify(brief, null, 2));
    return true;
  });
}

export async function runTaskDispatcherLive() {
  const tasks = await fetchQueuedTasks();
  // Resolve each task's dispatch cwd from the business→repo mapping. Tasks with a
  // business_id whose business has repo_path set run in that repo; everything else
  // falls back to L5_DEFAULT_PROJECT_PATH (sandbox) via the CTO agent's resolveProjectPath.
  let repoPaths: Record<string, string> = {};
  try {
    repoPaths = await fetchBusinessRepoPaths();
  } catch (err) {
    console.warn("[Dispatcher] business repo_path lookup failed — using sandbox fallback:", (err as Error).message);
  }
  const enriched = tasks.map((t) => {
    const bizId = (t as { business_id?: string | null }).business_id;
    const repo = bizId != null ? repoPaths[String(bizId)] : undefined;
    return repo ? { ...t, project_path: repo } : t;
  });
  return runTaskDispatcher(enriched, async (id, updates) => {
    await updateAgentTask(id, updates as any);
  });
}

export async function runCTOVerificationLoopLive() {
  const tasks = await fetchAgentTasks();
  return runCTOVerificationLoop(tasks, async (id, updates) => {
    await updateAgentTask(id, updates as any);
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

export async function runModelVerifyLive() {
  const result = await runModelVerify();
  if (result.deprecated_detected.length > 0) {
    const existing = await fetchAgentTasks();
    const hasDuplicate = existing.some(
      (t) => t.source_ref === "hermes:model-verify" && t.status === "needs_review"
    );
    if (!hasDuplicate) {
      const suggestionsBody =
        `Deprecated: ${result.deprecated_detected.join(', ')}\n\n` +
        result.remapping_suggestions
          .map((s) => `• ${s.deprecated_model} → ${s.suggested_replacement} (${s.tier})`)
          .join('\n');
      
      await createAgentTask({
        instruction_id: randomUUID(),
        assigned_agent: "CTO",
        title: "MODEL_ROSTER Deprecation & Remapping Proposal",
        rationale: "Hermes model-verify task detected deprecated models in the current MODEL_ROSTER: " + result.deprecated_detected.join(', '),
        expected_output: suggestionsBody,
        status: "needs_review",
        approval_required: true,
        risk_level: "D4",
        phase: "scale_automation",
        source_ref: "hermes:model-verify",
      });
    }
  }
  return result;
}

export async function runSelfLearningLive() {
  return runSelfLearning();
}

export async function runCmoStrategyWatchLive() {
  // Mirror repetition-analyzer: the card needs a fresh instruction FK, which
  // createAgentTask provisions when given an instruction_id.
  return runCmoStrategyWatch({
    createToolRequest: async (payload) =>
      createAgentTask({ ...payload, instruction_id: randomUUID() }),
  });
}

export async function runTaskArchiverLive() {
  const tasks = await fetchAgentTasks();
  return runTaskArchiver(
    tasks,
    async (t) => {
      await createProjectRoadmapEvent({
        project_id: (t as any).project_id ?? "common",
        task_id: t.id,
        title: t.title,
        assigned_agent: t.assigned_agent,
        status: t.status,
        risk_level: t.risk_level ?? "D1",
        phase: t.phase ?? "direction_alignment",
        rationale: t.rationale,
        output_summary: t.blocker ?? "Task archived after 1 week",
        completed_at: new Date().toISOString(),
      });
    },
    async (id) => {
      await deleteAgentTask(id);
    }
  );
}

