// Task Dispatcher — picks up queued tasks and routes them to agent handlers.
// Runs every 60s via launchd. Only processes approval_required=false tasks (D1-D2).

import type { AgentTask } from "@l5/core";
import type { AgentOutput } from "@l5/agent-runtime";
import {
  runCMOAgent,
  runCROAgent,
  runCPOAgent,
  runCTOAgent,
  runCOOAgent,
  runCFOAgent,
  runRiskQAAgent,
  runChiefOfStaffAgent,
  healFailedTask,
} from "@l5/agent-runtime";

export interface TaskDispatcherResult {
  dispatched_at: string;
  processed: number;
  skipped: number;
  results: Array<{
    task_id: string;
    agent: string;
    status: "running" | "done" | "needs_review" | "blocked";
    decision?: string;
  }>;
}

type AgentRunner = (input: { task: { id: string; title: string; rationale: string; expected_output: string; phase?: string; risk_level?: string; project_path?: string } }) => Promise<AgentOutput>;

const AGENT_MAP: Record<string, AgentRunner> = {
  CMO: runCMOAgent as AgentRunner,
  CRO: runCROAgent as AgentRunner,
  CPO: runCPOAgent as AgentRunner,
  CTO: runCTOAgent as AgentRunner,
  COO: runCOOAgent as AgentRunner,
  CFO: runCFOAgent as AgentRunner,
  RiskQA: runRiskQAAgent as AgentRunner,
  ChiefOfStaff: runChiefOfStaffAgent as AgentRunner,
};

// The updater persists to NocoBase; it accepts the agent-output fields too so a
// self-healed retry can write back its decision/reasoning/next_action.
type TaskUpdate = Partial<Pick<AgentTask, "status" | "blocker">> & {
  decision?: string;
  reasoning?: string;
  next_action?: string;
  approval_required?: boolean;
  risk_level?: string;
  completed_at?: string;
};

export async function runTaskDispatcher(
  tasks: AgentTask[],
  updater: (id: string, updates: TaskUpdate) => Promise<void>
): Promise<TaskDispatcherResult> {
  const dispatchedAt = new Date().toISOString();
  const results: TaskDispatcherResult["results"] = [];
  let skipped = 0;

  for (const task of tasks) {
    if (task.status !== "queued" || task.approval_required) {
      skipped++;
      continue;
    }

    const runner = AGENT_MAP[task.assigned_agent];
    if (!runner) {
      console.warn(`[Dispatcher] No runner for agent: ${task.assigned_agent}, skipping task ${task.id}`);
      skipped++;
      continue;
    }

    await updater(task.id, { status: "running" });

    try {
      const output = await runner({
        task: {
          id: task.id,
          title: task.title,
          rationale: task.rationale,
          expected_output: task.expected_output,
          phase: task.phase,
          risk_level: task.risk_level,
          // project_path is injected by runTaskDispatcherLive from the business→repo
          // mapping; resolveProjectPath in the CTO agent consumes it as the dispatch cwd.
          project_path: (task as { project_path?: string }).project_path,
        },
      });

      // CTO tasks are dispatched to ACR for ASYNC execution (the runner only fires the
      // intent; ACR runs the phases over minutes). Leave them "running" (set above) so
      // the Control Room — which filters out done/killed — shows live ACR progress while
      // each phase runs. taskCallback(all_done) finishes them; the stalled-task-detector
      // catches any that never call back. Marking them "done" here hid all in-flight work.
      if (task.assigned_agent === "CTO" && !output.requires_founder_approval) {
        results.push({ task_id: task.id, agent: task.assigned_agent, status: "running", decision: output.decision });
      } else {
        const finalStatus = output.requires_founder_approval ? "needs_review" : "done";
        await updater(task.id, { status: finalStatus });
        results.push({ task_id: task.id, agent: task.assigned_agent, status: finalStatus, decision: output.decision });
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[Dispatcher] Task ${task.id} (${task.assigned_agent}) failed:`, msg);

      // Self-healing: route to CTO (technical) or CEO (planning/permission) before
      // giving up. Recovery either fixes it and the original agent retries, or — for
      // payment / external messaging / permission — escalates to founder approval.
      try {
        const heal = await healFailedTask(
          {
            agent: task.assigned_agent,
            task: {
              id: task.id,
              title: task.title,
              rationale: task.rationale,
              expected_output: task.expected_output,
              phase: task.phase,
              risk_level: task.risk_level,
              project_path: (task as { project_path?: string }).project_path,
            },
          },
          msg
        );

        if (heal.resolved && heal.retryOutput) {
          const finalStatus = heal.retryOutput.requires_founder_approval ? "needs_review" : "done";
          await updater(task.id, {
            status: finalStatus,
            blocker: undefined,
            decision: heal.retryOutput.decision,
            reasoning: `[${heal.healer} 자가복구 후 완료] ${heal.retryOutput.reasoning}`,
            next_action: heal.retryOutput.next_action,
            risk_level: heal.retryOutput.risk_level,
            approval_required: heal.retryOutput.requires_founder_approval,
          });
          results.push({ task_id: task.id, agent: task.assigned_agent, status: finalStatus, decision: heal.retryOutput.decision });
          continue;
        }

        if (heal.escalateToFounder) {
          await updater(task.id, {
            status: "needs_review",
            approval_required: true,
            risk_level: heal.guidance.risk_level || "D4",
            decision: heal.guidance.decision,
            reasoning: `[${heal.healer} 판단 — founder 승인 필요] ${heal.guidance.reasoning}`,
            next_action: heal.guidance.next_action,
            blocker: `${heal.healer}가 결제·외부 발송·권한 사유로 founder 승인을 요청했습니다.`,
          });
          results.push({ task_id: task.id, agent: task.assigned_agent, status: "needs_review", decision: heal.guidance.decision });
          continue;
        }

        await updater(task.id, {
          status: "blocked",
          blocker: `자가복구 실패 (${heal.healer} 경유): ${heal.retryError ?? msg}`,
        });
        results.push({ task_id: task.id, agent: task.assigned_agent, status: "blocked" });
      } catch (healErr) {
        console.error(`[Dispatcher] Self-heal infra failed for ${task.id}:`, (healErr as Error).message);
        await updater(task.id, { status: "blocked", blocker: msg });
        results.push({ task_id: task.id, agent: task.assigned_agent, status: "blocked" });
      }
    }
  }

  return {
    dispatched_at: dispatchedAt,
    processed: results.length,
    skipped,
    results,
  };
}
