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
} from "@l5/agent-runtime";

export interface TaskDispatcherResult {
  dispatched_at: string;
  processed: number;
  skipped: number;
  results: Array<{
    task_id: string;
    agent: string;
    status: "done" | "needs_review" | "blocked";
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

export async function runTaskDispatcher(
  tasks: AgentTask[],
  updater: (id: string, updates: Partial<Pick<AgentTask, "status" | "blocker">>) => Promise<void>
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

      const finalStatus = output.requires_founder_approval ? "needs_review" : "done";
      await updater(task.id, { status: finalStatus });
      results.push({ task_id: task.id, agent: task.assigned_agent, status: finalStatus, decision: output.decision });
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[Dispatcher] Task ${task.id} (${task.assigned_agent}) failed:`, msg);
      await updater(task.id, { status: "blocked", blocker: msg });
      results.push({ task_id: task.id, agent: task.assigned_agent, status: "blocked" });
    }
  }

  return {
    dispatched_at: dispatchedAt,
    processed: results.length,
    skipped,
    results,
  };
}
