// Stalled Task Detector
// Runs every hour via cronTrigger. Finds AgentTask records with status='blocked'
// or last_activity older than 24h, then alerts CEO.

import type { AgentTask } from "@l5/core";

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
): Promise<StalledTaskDetectorResult> {
  const now = new Date();

  const stalled = tasks
    .filter((t) => t.status !== "done" && t.status !== "killed")
    .reduce<StalledTaskReport[]>((acc, t) => {
      if (t.status === "blocked") {
        acc.push({
          task_id: t.id,
          title: t.title,
          assigned_agent: t.assigned_agent,
          status: t.status,
          blocker: t.blocker,
          last_activity_at: t.updated_at,
          stall_reason: "blocked",
        });
        return acc;
      }

      const lastActivity = new Date(t.updated_at).getTime();
      if (now.getTime() - lastActivity > OVERDUE_THRESHOLD_MS) {
        acc.push({
          task_id: t.id,
          title: t.title,
          assigned_agent: t.assigned_agent,
          status: t.status,
          blocker: t.blocker,
          last_activity_at: t.updated_at,
          stall_reason: "overdue",
        });
      }

      return acc;
    }, []);

  const alerts_sent = stalled.length > 0 ? await notifier(stalled) : [];

  return {
    checked_at: now.toISOString(),
    stalled_count: stalled.length,
    stalled_tasks: stalled,
    alerts_sent,
  };
}
