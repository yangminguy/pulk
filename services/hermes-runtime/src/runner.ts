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
  createMemoryEntry,
  fetchApprovedTigerProposals,
  updateWorkflowImprovementProposalStatus,
  fetchNativePhaseRuns,
  createTigerIncident,
  fetchApprovedTigerIncidents,
  updateTigerIncident,
} from "./api/nocobase-client.js";
import { runClaudeCommand } from "./api/claude-cli.js";
import { runApprovedBatch, dispatchToNativeOrchestrator } from "@l5/agent-runtime";
import {
  decodeTargetRef,
  getImprovementTarget,
  type TigerExecutiveRole,
} from "@l5/core";
import {
  runTigerDispatchLoop,
  type BatchRunResultShape,
} from "./loops/tiger-dispatch-loop.js";
import { runTigerWatchLoop } from "./loops/tiger-watch-loop.js";
import {
  runTigerRecoveryLoop,
  type RecoveryDispatchResult,
} from "./loops/tiger-recovery-loop.js";
import type { RecoveryIncident } from "@l5/core";
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

// 호랑이 일괄 승인분 → repo별 병렬 CTO 실행 + 학습축적. agent-runtime runApprovedBatch 주입.
// 디스패치(코딩)는 승인분만 처리(승인 전 코딩 금지 게이트 보존 — fetchApprovedTigerProposals).
const TIGER_EXECUTIVES = new Set(["CEO", "CMO", "CTO", "CFO", "CRO", "CPO", "COO"]);
function toTigerExecutive(role: string | undefined): TigerExecutiveRole {
  return role && TIGER_EXECUTIVES.has(role) ? (role as TigerExecutiveRole) : "CTO";
}

export async function runTigerDispatchLive() {
  return runTigerDispatchLoop(
    {},
    {
      fetchApproved: async () => {
        const proposals = await fetchApprovedTigerProposals();
        return proposals.map((p) => {
          const targetId = decodeTargetRef(p.source_ref) ?? "";
          const entry = targetId ? getImprovementTarget(targetId) : undefined;
          return {
            proposal_id: p.id,
            source_ref: p.source_ref,
            target_id: targetId,
            executive: toTigerExecutive(entry?.owner),
          };
        });
      },
      runBatch: async (plan): Promise<BatchRunResultShape> => {
        const res = await runApprovedBatch(plan);
        return {
          group_results: res.group_results.map((g) => ({
            project_path: g.project_path,
            card_ids: g.card_ids,
            status: g.status,
            reason: g.reason,
          })),
          exhausted_agents: res.exhausted_agents.map(String),
        };
      },
      createMemory: (payload) => createMemoryEntry(payload),
      patchProposal: (patch) =>
        updateWorkflowImprovementProposalStatus(patch.proposal_id, patch.status),
      pulkRoot: process.env.PULK_ROOT ?? process.cwd(),
    },
  );
}

// 호랑이 실시간 장애 감시(launchd 1~2분). 승인 대기 작업의 진행상태를 native_phase_runs/
// agent_tasks에서 읽어 liveness 판정 → 새 장애만 텔레그램 알림 + tiger_incidents 영속화.
// 코드 변경 없음(감지·알림). 복구(코딩)는 승인 후 tiger-dispatch가 — 승인 게이트 보존.
export async function runTigerWatchLive() {
  return runTigerWatchLoop(
    {},
    {
      fetchNativePhaseRuns: () => fetchNativePhaseRuns(),
      fetchAgentTasks: () => fetchAgentTasks() as unknown as Promise<any[]>,
      persistIncident: (rec) => createTigerIncident({ ...rec }),
      runClaude: (cmd, timeoutMs) =>
        runClaudeCommand(cmd, { timeoutMs, onLog: (l) => console.log("[tiger-watch]", l) }),
    },
  );
}

// 호랑이 실시간 자동복구(launchd 2~5분). 사장님이 승인한(status=approved) tiger_incidents만:
// CTO 수정(native-orchestrator가 worktree에서 verify_command 재현·검증, 통과해야 merge) →
// 통과=resolved("고쳤어요"), 실패=재시도, 4회 초과=escalated("막혔어요"). 승인 게이트 보존
// (fetchApprovedTigerIncidents가 approved만 반환 — 승인 전 코딩 금지).
export async function runTigerRecoveryLive() {
  return runTigerRecoveryLoop(
    {},
    {
      fetchApprovedIncidents: async (): Promise<RecoveryIncident[]> => {
        const rows = await fetchApprovedTigerIncidents();
        return rows.map((r) => ({
          id: r.id,
          status: r.status as RecoveryIncident["status"],
          attempt_count: r.attempt_count,
          target_repo: r.target_repo,
          task_label: r.task_label,
          task_ref: r.task_ref,
          incident_type: (r.incident_type as RecoveryIncident["incident_type"]) ?? null,
          error_summary: r.error_summary,
          diagnosis: r.diagnosis,
          proposed_fix: r.proposed_fix,
          verify_command: r.verify_command,
        }));
      },
      dispatchFix: async (intent): Promise<RecoveryDispatchResult> => {
        const summary = await dispatchToNativeOrchestrator(intent);
        return {
          mergedPhases: summary.mergedPhases,
          waited: summary.waited,
          reason:
            summary.exhaustedAgents.length > 0
              ? `소진 에이전트: ${summary.exhaustedAgents.map(String).join(",")}`
              : undefined,
        };
      },
      updateIncident: (id, patch) => updateTigerIncident(id, patch),
    },
  );
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


// ── 영상 일괄 렌더 (video-batch-render) ──────────────────────────────────────
// 승인 게이트를 모두 통과해 'rendering' 상태로 모인 프로젝트들의 factory 잡을
// 순차 렌더하고(잡 내부는 Remotion이 CPU 병렬화), 끝나면 텔레그램 요약 알림.
// 외부 액션(YouTube 업로드 등)은 절대 수행하지 않는다 — 기존 승인 게이트 그대로.

import { spawn } from "node:child_process";
import { runVideoBatchRender } from "./tasks/video-batch-render.js";
import type { VideoBatchRenderDeps } from "./tasks/video-batch-render.js";
import { createTelegramClient } from "./notifier/telegram.js";
import {
  fetchRenderingVideoProjects,
  fetchCmoRenderStatus,
} from "./api/nocobase-client.js";
import type { BatchRenderCandidate } from "@l5/core";

const VIDEO_FACTORY_DIR =
  process.env.VIDEO_FACTORY_DIR ?? "/Users/wonminyang/ai-slide-video-factory";
// remotion 렌더는 수 분 — 기본 30분 타임아웃.
const RENDER_TIMEOUT_MS = Number(process.env.VIDEO_RENDER_TIMEOUT_MS ?? 30 * 60 * 1000);

/** factory에서 잡 1건 렌더: `npx tsx scripts/render-final-v2.ts --job <path>` (cwd=factory). */
function renderFactoryJob(jobPath: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn("npx", ["tsx", "scripts/render-final-v2.ts", "--job", jobPath], {
      cwd: VIDEO_FACTORY_DIR,
      env: process.env,
    });
    let tail = "";
    const keepTail = (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-1000);
    };
    proc.stdout.on("data", keepTail);
    proc.stderr.on("data", keepTail);

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({ ok: false, error: `render timeout ${RENDER_TIMEOUT_MS}ms` });
    }, RENDER_TIMEOUT_MS);

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: `render exit ${code}: ${tail.slice(-300)}` });
    });
  });
}

export async function runVideoBatchRenderLive() {
  const projects = await fetchRenderingVideoProjects();

  const deps: VideoBatchRenderDeps = {
    batchId: new Date().toISOString(),

    fetchCandidates: async (): Promise<BatchRenderCandidate[]> => {
      const candidates: BatchRenderCandidate[] = [];
      for (const p of projects) {
        try {
          const snap = await fetchCmoRenderStatus(p.id);
          candidates.push({
            project_id: p.id,
            project_title: p.title,
            project_status: p.status,
            factory_slug: snap.slug,
            job_path: snap.job_path,
            observed_status: (snap.status ?? null) as BatchRenderCandidate["observed_status"],
          });
        } catch (err) {
          // slug 미존재(submitRender 미실행) 등 — 관찰 실패로 기록, 스킵 처리는 l5-core가.
          console.warn(`[video-batch-render] ${p.id} 상태 조회 실패:`, (err as Error).message);
          candidates.push({
            project_id: p.id,
            project_title: p.title,
            project_status: p.status,
            observed_status: null,
          });
        }
      }
      return candidates;
    },

    renderJob: (item) => renderFactoryJob(item.job_path),

    reconcile: async (item) => {
      const snap = await fetchCmoRenderStatus(item.project_id);
      return {
        status: (snap.status ?? "not_found") as
          | "not_found" | "queued" | "rendering" | "completed" | "failed",
        total_seconds: snap.total_seconds,
        qa_result: snap.qa_result ?? null,
      };
    },

    notify: (msg) => createTelegramClient().send(msg),
  };

  return runVideoBatchRender(deps);
}
