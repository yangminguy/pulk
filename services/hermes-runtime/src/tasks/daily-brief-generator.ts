import type { AgentTask } from "@l5/core";
import { createTelegramClient } from "../notifier/telegram.js";
import type { TelegramClient } from "../notifier/telegram.js";

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
  telegram?: TelegramClient,
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

  // Also send to Telegram (best-effort, dual channel with console).
  const tg = telegram ?? createTelegramClient();
  const founderUIBase = process.env.FOUNDER_UI_BASE_URL ?? 'http://localhost:3002';
  const dateStr = briefDate;
  const timeSlot = now.getHours() < 12 ? 'morning' : 'evening';
  const TELEGRAM_MAX = 4096;
  let briefText =
    `active: ${brief.active_count}, blocked: ${brief.blocked_count}, ` +
    `approval_pending: ${brief.approval_pending_count}\n` +
    (brief.recommendations.length > 0
      ? `\n권고사항:\n${brief.recommendations.join('\n')}`
      : '');
  if (briefText.length > TELEGRAM_MAX - 3) {
    briefText = briefText.slice(0, TELEGRAM_MAX - 3) + '...';
  }
  console.log(`[daily-brief] ${dateStr} ${timeSlot}:`, briefText);
  await tg.send({
    title: `Daily Brief — ${dateStr}`,
    body: briefText,
    level: 'info',
    link: `${founderUIBase}/`,
    dedupKey: `brief:${dateStr}:${timeSlot}`,
  });

  return {
    generated_at: now.toISOString(),
    brief,
    notification_sent,
  };
}
