// Approval Checker
// Runs daily at 09:00 via cronTrigger. Finds tasks with approval_required=true
// and status='needs_review', then sends Founder daily brief.

import type { AgentTask } from "@l5/core";

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
}

export interface ApprovalCheckerResult {
  checked_at: string;
  brief: DailyApprovalBrief;
  notification_sent: boolean;
}

export async function runApprovalChecker(
  tasks: AgentTask[],
  notifier: (brief: DailyApprovalBrief) => Promise<boolean>,
): Promise<ApprovalCheckerResult> {
  const now = new Date();
  const briefDate = now.toISOString().split("T")[0];

  const pending: PendingApprovalItem[] = tasks
    .filter((t) => t.approval_required && t.status === "needs_review")
    .map((t) => ({
      task_id: t.id,
      title: t.title,
      assigned_agent: t.assigned_agent,
      rationale: t.rationale,
      expected_output: t.expected_output,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));

  const brief: DailyApprovalBrief = {
    brief_date: briefDate,
    pending_count: pending.length,
    items: pending,
    message:
      pending.length === 0
        ? "오늘 승인 대기 항목이 없습니다."
        : `${pending.length}개 task가 승인을 기다리고 있습니다: ${pending.map((i) => i.title).join(", ")}`,
  };

  const notification_sent =
    pending.length > 0 ? await notifier(brief) : false;

  return {
    checked_at: now.toISOString(),
    brief,
    notification_sent,
  };
}
