// Approval Queue API
// Endpoints for Founder to review, approve, or reject tasks with approval_required=true.
// Designed to be mounted in a Node.js HTTP server or NocoBase action handler.

import type { AgentTask, RiskLevel } from "@l5/core";

// AgentTask does not carry risk_level; callers supply it from CEOInterpretation when available.
export interface ApprovalQueueItem {
  task_id: string;
  title: string;
  assigned_agent: string;
  rationale: string;
  expected_output: string;
  risk_level?: RiskLevel;
  approval_required: true;
  status: "needs_review";
  created_at: string;
  updated_at: string;
  /** ISO string: only present for D3 tasks. Timestamp after which auto-approval triggers. */
  auto_approve_at?: string;
}

export interface ApprovalQueueResponse {
  items: ApprovalQueueItem[];
  total: number;
}

export interface ApproveTaskRequest {
  task_id: string;
  notes?: string;
}

export interface RejectTaskRequest {
  task_id: string;
  explanation: string;
}

export interface ApprovalActionResponse {
  ok: boolean;
  task_id: string;
  new_status: "done" | "killed";
  message: string;
}

const D3_AUTO_APPROVE_MS = 24 * 60 * 60 * 1000;

export function getApprovalQueue(tasks: AgentTask[]): ApprovalQueueResponse {
  const items = tasks
    .filter((t) => t.approval_required && t.status === "needs_review")
    .map((t) => {
      const auto_approve_at =
        t.risk_level === "D3"
          ? new Date(new Date(t.created_at).getTime() + D3_AUTO_APPROVE_MS).toISOString()
          : undefined;

      return {
        task_id: t.id,
        title: t.title,
        assigned_agent: t.assigned_agent,
        rationale: t.rationale,
        expected_output: t.expected_output,
        risk_level: t.risk_level,
        approval_required: true as const,
        status: "needs_review" as const,
        created_at: t.created_at,
        updated_at: t.updated_at ?? t.created_at,
        ...(auto_approve_at !== undefined ? { auto_approve_at } : {}),
      };
    });

  return { items, total: items.length };
}

/** Pure function: auto-approve D3 tasks that have been pending for more than 24 hours. */
export function autoApproveExpiredD3Tasks(
  tasks: AgentTask[],
  now: Date,
): { updatedTasks: AgentTask[]; approved_count: number } {
  let approved_count = 0;

  const updatedTasks = tasks.map((t) => {
    if (
      t.risk_level === "D3" &&
      t.status === "needs_review" &&
      t.approval_required
    ) {
      const expiry = new Date(t.created_at).getTime() + D3_AUTO_APPROVE_MS;
      if (now.getTime() >= expiry) {
        const { updatedTask } = approveTask(t, {
          task_id: t.id,
          notes: "D3 24h 자동 승인",
        });
        approved_count += 1;
        return updatedTask;
      }
    }
    return t;
  });

  return { updatedTasks, approved_count };
}

// Pure function: apply an approval decision to a task.
// Returns the mutated task and a response payload.
export function approveTask(
  task: AgentTask,
  req: ApproveTaskRequest,
): { updatedTask: AgentTask; response: ApprovalActionResponse } {
  const updatedTask: AgentTask = {
    ...task,
    status: "done",
    updated_at: new Date().toISOString(),
  };

  return {
    updatedTask,
    response: {
      ok: true,
      task_id: req.task_id,
      new_status: "done",
      message: req.notes
        ? `승인 완료. 메모: ${req.notes}`
        : "승인 완료. 외부 실행 트리거 가능.",
    },
  };
}

// Pure function: apply a rejection decision to a task.
export function rejectTask(
  task: AgentTask,
  req: RejectTaskRequest,
): { updatedTask: AgentTask; response: ApprovalActionResponse } {
  const updatedTask: AgentTask = {
    ...task,
    status: "killed",
    updated_at: new Date().toISOString(),
  };

  return {
    updatedTask,
    response: {
      ok: true,
      task_id: req.task_id,
      new_status: "killed",
      message: `거절 완료. 사유: ${req.explanation}`,
    },
  };
}
