// Token-budget forecasting types.
//
// These are *estimates* (예상), not measured usage. They derive a rough token
// range from a task's classification → dev-workflow phase count → per-phase
// model tier. Real per-run usage lives in the hermes-agent CLI runtime and is
// not yet plumbed back to L5 (Phase 6 follow-up); until then these forecasts
// give the founder a relative sense of cost at plan-approval time.

import type { TaskClass } from '../cto-design';

export interface PhaseTokenEstimate {
  /** Phase kind (implement, spec, commit, …). */
  kind: string;
  /** Resolved model tier for this phase. */
  tier: 'T1' | 'T2' | 'T3';
  low: number;
  high: number;
}

export interface TaskTokenEstimate {
  task_class: TaskClass;
  phase_count: number;
  phases: PhaseTokenEstimate[];
  low: number;
  high: number;
  /** Midpoint, for a single headline number. */
  mid: number;
}

/** Coarse size the CTO judges per task during planning. Maps to a TaskClass so
 * the forecast reflects the CTO's actual judgment instead of keyword guessing. */
export type TaskSizeHint = 'tiny' | 'small' | 'feature' | 'big';

export interface PlanTaskInput {
  title: string;
  rationale?: string;
  /** CTO's size judgment; when present, drives classification directly. */
  size?: TaskSizeHint;
}

export interface PlanTokenEstimate {
  task_count: number;
  low: number;
  high: number;
  mid: number;
  /** Per-task breakdown, in input order. */
  tasks: TaskTokenEstimate[];
}
