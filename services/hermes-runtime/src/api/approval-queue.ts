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

export function getApprovalQueue(tasks: AgentTask[]): ApprovalQueueResponse {
  const items = tasks
    .filter((t) => t.approval_required && t.status === "needs_review")
    .map((t) => ({
      task_id: t.id,
      title: t.title,
      assigned_agent: t.assigned_agent,
      rationale: t.rationale,
      expected_output: t.expected_output,
      risk_level: t.risk_level,
      approval_required: true as const,
      status: "needs_review" as const,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));

  return { items, total: items.length };
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
