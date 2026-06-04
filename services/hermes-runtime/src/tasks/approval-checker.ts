// Approval Checker
// Runs daily at 09:00 via cronTrigger. Finds tasks with approval_required=true
// and status='needs_review', then sends Founder daily brief.
// D3 tasks are first evaluated by LLM judge (judgeNeedsReviewD3Tasks).
// Tasks not resolved by LLM are then subject to 24h timer auto-approval (autoApproveExpiredD3Tasks).

import type { AgentTask, LLMClient } from "@l5/core";
import type { D3JudgeInput, D3JudgeResult } from "@l5/core";
import { judgeD3Task } from "@l5/core";
import { autoApproveExpiredD3Tasks, approveTask } from "../api/approval-queue.js";
import { createTelegramClient } from "../notifier/telegram.js";
import type { TelegramClient } from "../notifier/telegram.js";

export interface PendingApprovalItem {
  task_id: string;
  title: string;
  assigned_agent: string;
  rationale: string;
  expected_output: string;
  created_at: string;
  updated_at: string;
}

export interface DailyApprovalBrief {
  brief_date: string;
  pending_count: number;
  items: PendingApprovalItem[];
  message: string;
  auto_approved_count: number;
}

export interface ApprovalCheckerResult {
  checked_at: string;
  brief: DailyApprovalBrief;
  notification_sent: boolean;
  auto_approved_count: number;
}

export interface JudgeD3Result {
  updatedTasks: AgentTask[];
  judged_count: number;
  passed_count: number;
  escalated_count: number;
  held_count: number;
}

/** LLM-based judge for D3 needs_review tasks. Returns updated task array. */
export async function judgeNeedsReviewD3Tasks(
  tasks: AgentTask[],
  llm: LLMClient | null,
  now: Date,
): Promise<JudgeD3Result> {
  let judged_count = 0;
  let passed_count = 0;
  let escalated_count = 0;
  let held_count = 0;

  const updatedTasks = await Promise.all(
    tasks.map(async (task) => {
      if (
        task.risk_level !== "D3" ||
        task.status !== "needs_review" ||
        !task.approval_required
      ) {
        return task;
      }

      const input: D3JudgeInput = {
        task: {
          id: task.id,
          title: task.title,
          rationale: task.rationale,
          expected_output: task.expected_output,
          risk_level: "D3",
          assigned_agent: task.assigned_agent,
          created_at: task.created_at,
        },
      };

      let result: D3JudgeResult;
      try {
        result = await judgeD3Task(input, llm);
      } catch (err) {
        console.warn(`[approval-checker] judgeD3Task error for ${task.id}:`, err);
        return task;
      }

      judged_count += 1;
      const judgeMetaEntry = {
        verdict: result.verdict,
        rationale: result.rationale,
        conditions: result.conditions,
        used_llm: result.used_llm,
        at: now.toISOString(),
      };

      if (result.verdict === "pass") {
        passed_count += 1;
        const { updatedTask } = approveTask(task, {
          task_id: task.id,
          notes: `CTO LLM 자율 승인: ${result.rationale}`,
        });
        return {
          ...updatedTask,
          source_ref: JSON.stringify({ judge: judgeMetaEntry, previous_source_ref: task.source_ref }),
        };
      }

      if (result.verdict === "escalate") {
        escalated_count += 1;
        return {
          ...task,
          updated_at: now.toISOString(),
          source_ref: JSON.stringify({
            judge: judgeMetaEntry,
            escalated_from_d3: true,
            escalated_approval_level: "founder_only",
            previous_source_ref: task.source_ref,
          }),
        };
      }

      // verdict === 'hold': leave status unchanged, record judge result.
      held_count += 1;
      return {
        ...task,
        updated_at: now.toISOString(),
        source_ref: JSON.stringify({ judge: judgeMetaEntry, previous_source_ref: task.source_ref }),
      };
    }),
  );

  return { updatedTasks, judged_count, passed_count, escalated_count, held_count };
}

/** Check whether source_ref (or its previous_source_ref) carries escalated_from_d3=true. */
function checkEscalatedFromD3(sourceRefStr: string | undefined | null): boolean {
  if (!sourceRefStr) return false;
  try {
    const ref = JSON.parse(sourceRefStr) as Record<string, unknown>;
    if (ref.escalated_from_d3 === true) return true;
    // judgeNeedsReviewD3Tasks wraps existing source_ref under previous_source_ref each cycle.
    if (typeof ref.previous_source_ref === 'string') {
      return checkEscalatedFromD3(ref.previous_source_ref);
    }
  } catch { /* ignore malformed */ }
  return false;
}

// In-process dedup set — avoids re-alerting the same task within a process lifetime.
// The telegram client's own 30s dedup also applies.
const notifiedApprovals = new Set<string>();

export async function runApprovalChecker(
  tasks: AgentTask[],
  notifier: (brief: DailyApprovalBrief) => Promise<boolean>,
  llm: LLMClient | null = null,
  telegram?: TelegramClient,
): Promise<ApprovalCheckerResult> {
  const now = new Date();
  const briefDate = now.toISOString().split("T")[0];

  // Step 1: LLM judge runs first on D3 needs_review tasks.
  let workingTasks = tasks;
  try {
    const judgeResult = await judgeNeedsReviewD3Tasks(workingTasks, llm, now);
    workingTasks = judgeResult.updatedTasks;
  } catch (err) {
    console.warn("[approval-checker] judgeNeedsReviewD3Tasks failed, falling back to 24h timer:", err);
  }

  // Step 2: 24h timer fallback for D3 tasks still in needs_review.
  const { updatedTasks, approved_count: auto_approved_count } =
    autoApproveExpiredD3Tasks(workingTasks, now);

  const pending: PendingApprovalItem[] = updatedTasks
    .filter((t) => t.approval_required && t.status === "needs_review")
    .map((t) => ({
      task_id: t.id,
      title: t.title,
      assigned_agent: t.assigned_agent,
      rationale: t.rationale,
      expected_output: t.expected_output,
      created_at: t.created_at,
      updated_at: t.updated_at ?? t.created_at,
    }));

  const brief: DailyApprovalBrief = {
    brief_date: briefDate,
    pending_count: pending.length,
    items: pending,
    message:
      pending.length === 0
        ? "오늘 승인 대기 항목이 없습니다."
        : `${pending.length}개 task가 승인을 기다리고 있습니다: ${pending.map((i) => i.title).join(", ")}`,
    auto_approved_count,
  };

  // Send Telegram alert for D4/D5 tasks requiring Founder approval.
  const tg = telegram ?? createTelegramClient();
  const founderUIBase = process.env.FOUNDER_UI_BASE_URL ?? 'http://localhost:3002';
  for (const t of updatedTasks) {
    if (
      t.approval_required &&
      t.status === 'needs_review' &&
      (t.risk_level === 'D4' || t.risk_level === 'D5')
    ) {
      if (notifiedApprovals.has(t.id)) continue;
      notifiedApprovals.add(t.id);

      // Also check for D3 tasks escalated to founder level via source_ref.
      const level = t.risk_level === 'D5' ? 'urgent' : 'warn';
      await tg.send({
        title: `승인 요청 — ${t.assigned_agent} ${t.risk_level}`,
        body: `${t.title}\n\n${(t.rationale ?? '').slice(0, 300)}`,
        level,
        link: `${founderUIBase}/approvals/${t.id}`,
        dedupKey: `approval:${t.id}`,
      });
    } else {
      // D3 escalated_from_d3 path — check top-level source_ref and one level of
      // previous_source_ref (judgeNeedsReviewD3Tasks wraps the ref on each cycle).
      if (t.approval_required && t.status === 'needs_review') {
        const isEscalated = checkEscalatedFromD3(t.source_ref);
        if (isEscalated) {
          if (notifiedApprovals.has(t.id)) continue;
          notifiedApprovals.add(t.id);
          await tg.send({
            title: `승인 요청 — ${t.assigned_agent} D3(escalated)`,
            body: `${t.title}\n\n${(t.rationale ?? '').slice(0, 300)}`,
            level: 'warn',
            link: `${founderUIBase}/approvals/${t.id}`,
            dedupKey: `approval:${t.id}`,
          });
        }
      }
    }
  }

  const notification_sent =
    pending.length > 0 ? await notifier(brief) : false;

  return {
    checked_at: now.toISOString(),
    brief,
    notification_sent,
    auto_approved_count,
  };
}
