// Stalled Task Detector
// Runs every hour via cronTrigger. Finds AgentTask records with status='blocked'
// or last_activity older than 24h, then alerts CEO.

import type { AgentTask } from "@l5/core";
import { createTelegramClient } from "../notifier/telegram.js";
import type { TelegramClient } from "../notifier/telegram.js";

export interface StalledTaskReport {
  task_id: string;
  title: string;
  assigned_agent: string;
  status: string;
  blocker?: string;
  last_activity_at: string;
  stall_reason: "blocked" | "overdue";
}

export interface StalledTaskDetectorResult {
  checked_at: string;
  stalled_count: number;
  stalled_tasks: StalledTaskReport[];
  alerts_sent: string[];
}

const OVERDUE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

export async function runStalledTaskDetector(
  tasks: AgentTask[],
  notifier: (report: StalledTaskReport[]) => Promise<string[]>,
  telegram?: TelegramClient,
): Promise<StalledTaskDetectorResult> {
  const now = new Date();

  const stalled = tasks
    .filter((t) => t.status !== "done" && t.status !== "killed")
    .reduce<StalledTaskReport[]>((acc, t) => {
      const lastActivityAt = t.updated_at ?? t.created_at;

      if (t.status === "blocked") {
        acc.push({
          task_id: t.id,
          title: t.title,
          assigned_agent: t.assigned_agent,
          status: t.status,
          blocker: t.blocker,
          last_activity_at: lastActivityAt,
          stall_reason: "blocked",
        });
        return acc;
      }

      const lastActivity = new Date(lastActivityAt).getTime();
      if (now.getTime() - lastActivity > OVERDUE_THRESHOLD_MS) {
        acc.push({
          task_id: t.id,
          title: t.title,
          assigned_agent: t.assigned_agent,
          status: t.status,
          blocker: t.blocker,
          last_activity_at: lastActivityAt,
          stall_reason: "overdue",
        });
      }

      return acc;
    }, []);

  const alerts_sent = stalled.length > 0 ? await notifier(stalled) : [];

  // Send Telegram alert for each newly detected stalled task.
  if (stalled.length > 0) {
    const tg = telegram ?? createTelegramClient();
    const founderUIBase = process.env.FOUNDER_UI_BASE_URL ?? 'http://localhost:3002';
    for (const report of stalled) {
      const stalledForMinutes = Math.round(
        (now.getTime() - new Date(report.last_activity_at).getTime()) / 60_000,
      );
      // Extract business_id from task if available — not present in StalledTaskReport,
      // so link falls back to base URL.
      const link = `${founderUIBase}/`;
      await tg.send({
        title: `정체 감지 — ${report.assigned_agent}`,
        body: `${report.title}\n${stalledForMinutes}분 동안 진행 없음`,
        level: 'warn',
        link,
        dedupKey: `stalled:${report.task_id}`,
      });
    }
  }

  return {
    checked_at: now.toISOString(),
    stalled_count: stalled.length,
    stalled_tasks: stalled,
    alerts_sent,
  };
}
