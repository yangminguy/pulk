// Roadmap burndown — derive per-milestone progress from its linked dev-tasks.
//
// The Control Room shows the founder the overall plan "burning down": each
// roadmap item carries a done/total task count and a status, so as the CTO's
// tasks complete the plan visibly shrinks. Pure derivation — the plugin runs the
// SQL (roadmap_items LEFT JOIN agent_tasks) and passes the counts in.

import type { RoadmapItemStatus } from './types';

export interface RoadmapItemCounts {
  /** Tasks linked to this roadmap item. */
  total: number;
  /** Tasks in a terminal-success state (done). */
  done: number;
  /** Tasks actively in flight (running / needs_review / blocked — not queued/done). */
  running: number;
}

/**
 * Derive a milestone's status from its task counts:
 * - done       — has tasks and all are done
 * - active     — at least one task done or in flight
 * - planned    — no tasks yet, or all still queued
 */
export function deriveRoadmapItemStatus(c: RoadmapItemCounts): RoadmapItemStatus {
  if (c.total > 0 && c.done >= c.total) return 'done';
  if (c.done > 0 || c.running > 0) return 'active';
  return 'planned';
}

export interface RoadmapProgressItem {
  id: string;
  title: string;
  sequence: number;
  project_id: string | null;
  business_id: string | null;
  total: number;
  done: number;
  status: RoadmapItemStatus;
}

/** Overall completion across a set of roadmap items (by task count). */
export interface RoadmapProgressSummary {
  item_count: number;
  done_items: number;
  total_tasks: number;
  done_tasks: number;
  /** 0–100, by task count (0 when there are no tasks). */
  percent: number;
}

export function summarizeRoadmap(items: RoadmapProgressItem[]): RoadmapProgressSummary {
  const total_tasks = items.reduce((s, it) => s + it.total, 0);
  const done_tasks = items.reduce((s, it) => s + it.done, 0);
  return {
    item_count: items.length,
    done_items: items.filter((it) => it.status === 'done').length,
    total_tasks,
    done_tasks,
    percent: total_tasks > 0 ? Math.round((done_tasks / total_tasks) * 100) : 0,
  };
}
