import type { AgentTask } from "@l5/core";

export interface DailyBrief {
  brief_date: string;
  active_count: number;
  blocked_count: number;
  approval_pending_count: number;
  blocked_tasks: { task_id: string; title: string; assigned_agent: string; blocker?: string }[];
  approval_items: { task_id: string; title: string; assigned_agent: string; risk_level?: string }[];
  recommendations: string[];
  generated_at: string;
}

export interface DailyBriefResult {
  generated_at: string;
  brief: DailyBrief;
  notification_sent: boolean;
}

export async function runDailyBriefGenerator(
  tasks: AgentTask[],
  notifier: (brief: DailyBrief) => Promise<boolean>,
): Promise<DailyBriefResult> {
  const now = new Date();
  const briefDate = now.toISOString().split("T")[0];

  const currentTasks = tasks.filter((t) =>
    ["queued", "running", "needs_review"].includes(t.status),
  );
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const approvalQueue = tasks.filter(
    (t) => t.approval_required && t.status === "needs_review",
  );

  const recommendations: string[] = [];
  if (blockedTasks.length > 0) recommendations.push("CEO 검토 필요: blocked task 존재");
  if (approvalQueue.length > 0) recommendations.push("Founder 승인 대기 항목 처리 필요");

  const brief: DailyBrief = {
    brief_date: briefDate,
    active_count: currentTasks.length,
    blocked_count: blockedTasks.length,
    approval_pending_count: approvalQueue.length,
    blocked_tasks: blockedTasks.map((t) => ({
      task_id: t.id,
      title: t.title,
      assigned_agent: t.assigned_agent,
      blocker: t.blocker,
    })),
    approval_items: approvalQueue.map((t) => ({
      task_id: t.id,
      title: t.title,
      assigned_agent: t.assigned_agent,
      risk_level: t.risk_level,
    })),
    recommendations,
    generated_at: now.toISOString(),
  };

  const shouldNotify = blockedTasks.length > 0 || approvalQueue.length > 0;
  const notification_sent = shouldNotify ? await notifier(brief) : false;

  return {
    generated_at: now.toISOString(),
    brief,
    notification_sent,
  };
}
