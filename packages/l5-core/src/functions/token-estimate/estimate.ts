// estimateTaskTokens / estimatePlanTokens — rough token forecasts for dev work.
//
// Grounded in the same model the CTO actually runs: classifyTask picks a
// TaskClass, DEV_WORKFLOW_TEMPLATES gives the phases, and selectModelTier picks
// the model tier per phase. We sum a per-tier token range across the phases.
//
// The per-tier ranges below model one agentic CLI round (cold start + context
// read + work + output). They are deliberately coarse — the point is *relative*
// comparison (a TINY task costs far less than a BIG_CHANGE), and a labeled
// "추정" range the founder can weigh before approving a plan. Once hermes-agent
// reports measured usage back to ACR, callers should prefer the actuals.

import {
  classifyTask,
  selectModelTier,
  DEV_WORKFLOW_TEMPLATES,
  type TaskClass,
  type DevPhaseKind,
} from '../cto-design';
import type {
  PhaseTokenEstimate,
  PlanTaskInput,
  PlanTokenEstimate,
  TaskSizeHint,
  TaskTokenEstimate,
} from './types';

/** Map the CTO's coarse size judgment to a dev-workflow TaskClass. */
const SIZE_TO_CLASS: Record<TaskSizeHint, TaskClass> = {
  tiny: 'TINY',
  small: 'SMALL_FIX',
  feature: 'FEATURE',
  big: 'BIG_CHANGE',
};

/** Per-phase token range by model tier (one agentic CLI round). Coarse by design. */
const TIER_PHASE_TOKENS: Record<'T1' | 'T2' | 'T3', { low: number; high: number }> = {
  T1: { low: 15000, high: 40000 }, // top reasoning — heavy context + deliberation
  T2: { low: 10000, high: 25000 }, // balanced — implementation rounds
  T3: { low: 5000, high: 12000 }, // light — mechanical (commit, regress, smoke)
};

function midOf(low: number, high: number): number {
  return Math.round((low + high) / 2);
}

/** Forecast the token range for one dev task by classifying it and summing
 * phases. When the CTO supplied a size judgment, use it directly; otherwise fall
 * back to keyword classification (which defaults non-trivial work to FEATURE). */
export function estimateTaskTokens(
  title: string,
  rationale = '',
  size?: TaskSizeHint,
): TaskTokenEstimate {
  const task_class: TaskClass = size ? SIZE_TO_CLASS[size] : classifyTask(title, rationale);
  const templates = DEV_WORKFLOW_TEMPLATES[task_class] ?? [];
  const phases: PhaseTokenEstimate[] = templates.map((t) => {
    const tier = selectModelTier(task_class, t.kind as DevPhaseKind);
    const range = TIER_PHASE_TOKENS[tier];
    return { kind: t.kind, tier, low: range.low, high: range.high };
  });
  const low = phases.reduce((s, p) => s + p.low, 0);
  const high = phases.reduce((s, p) => s + p.high, 0);
  return {
    task_class,
    phase_count: phases.length,
    phases,
    low,
    high,
    mid: midOf(low, high),
  };
}

/** Sum task forecasts into a single plan-level token range. */
export function estimatePlanTokens(tasks: PlanTaskInput[]): PlanTokenEstimate {
  const per = tasks.map((t) => estimateTaskTokens(t.title, t.rationale ?? '', t.size));
  const low = per.reduce((s, t) => s + t.low, 0);
  const high = per.reduce((s, t) => s + t.high, 0);
  return {
    task_count: per.length,
    low,
    high,
    mid: midOf(low, high),
    tasks: per,
  };
}

/** Compact human label, e.g. "약 45k–110k 토큰". Rounds to the nearest 1k. */
export function formatTokenRange(low: number, high: number): string {
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  return `약 ${k(low)}–${k(high)} 토큰`;
}
