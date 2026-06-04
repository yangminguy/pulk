import type { AgentTask } from "@l5/core";

export interface ArchivalResult {
  archived_at: string;
  archived_count: number;
  deleted_task_ids: string[];
}

export async function runTaskArchiver(
  tasks: AgentTask[],
  archiveTask: (task: AgentTask) => Promise<void>,
  deleteTask: (id: string) => Promise<void>
): Promise<ArchivalResult> {
  const now = new Date();
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  
  const tasksToArchive = tasks.filter((t) => {
    if (!["done", "killed"].includes(t.status)) return false;
    const date = t.updated_at ? new Date(t.updated_at) : new Date(t.created_at);
    return date.getTime() <= sevenDaysAgo;
  });

  const deletedIds: string[] = [];

  for (const t of tasksToArchive) {
    try {
      await archiveTask(t);
      await deleteTask(t.id);
      deletedIds.push(t.id);
    } catch (err) {
      console.error(`[task-archiver] Failed to archive and delete task ${t.id}:`, err);
    }
  }

  return {
    archived_at: now.toISOString(),
    archived_count: deletedIds.length,
    deleted_task_ids: deletedIds,
  };
}
