// CTO Phase Review
// Runs weekly. Evaluates completed tasks against BPR phase transition criteria
// and triggers a transition request task when conditions are met.

import type { AgentTask } from "@l5/core";

export interface CTOPhaseReviewResult {
  reviewed_at: string;
  current_phase: string;
  completed_task_count: number;
  transition_ready: boolean;
  suggested_next_phase: string | null;
  reason: string;
  transition_task_id: string | null;
}

const PHASE_ORDER = [
  "direction_alignment",
  "pmf_diagnosis",
  "execution_build",
  "sales_distribution_test",
  "productization_review",
  "scale_automation",
] as const;

const PHASE_DONE_THRESHOLD: Record<string, number> = {
  direction_alignment: 3,
  pmf_diagnosis: 5,
  execution_build: 5,
  sales_distribution_test: 4,
  productization_review: 4,
  scale_automation: 3,
};

function deriveCurrentPhase(tasks: AgentTask[]): string {
  const phaseCounts: Record<string, number> = {};
  for (const t of tasks) {
    if (t.phase) phaseCounts[t.phase] = (phaseCounts[t.phase] ?? 0) + 1;
  }
  // Return the phase with the most active tasks; default to first phase
  let best: string = PHASE_ORDER[0];
  let bestCount = 0;
  for (const phase of PHASE_ORDER) {
    if ((phaseCounts[phase] ?? 0) > bestCount) {
      best = phase;
      bestCount = phaseCounts[phase] ?? 0;
    }
  }
  return best;
}

export async function runCTOPhaseReview(
  tasks: AgentTask[],
  onTransitionReady: (params: {
    from_phase: string;
    to_phase: string;
    reason: string;
  }) => Promise<string | null>,
): Promise<CTOPhaseReviewResult> {
  const now = new Date();
  const doneTasks = tasks.filter((t) => t.status === "done");
  const currentPhase = deriveCurrentPhase(tasks.filter((t) => t.status !== "done" && t.status !== "killed"));

  const phaseIdx = PHASE_ORDER.indexOf(currentPhase as (typeof PHASE_ORDER)[number]);
  const nextPhase = phaseIdx >= 0 && phaseIdx < PHASE_ORDER.length - 1
    ? PHASE_ORDER[phaseIdx + 1]
    : null;

  const threshold = PHASE_DONE_THRESHOLD[currentPhase] ?? 3;
  const doneInPhase = doneTasks.filter((t) => t.phase === currentPhase).length;
  const transition_ready = nextPhase !== null && doneInPhase >= threshold;

  let transition_task_id: string | null = null;
  const reason = transition_ready
    ? `${doneInPhase}개 완료 태스크 (기준: ${threshold}개) — ${currentPhase} → ${nextPhase} 전환 조건 충족`
    : `완료 태스크 ${doneInPhase}/${threshold}개 — 아직 전환 기준 미달`;

  if (transition_ready && nextPhase) {
    transition_task_id = await onTransitionReady({
      from_phase: currentPhase,
      to_phase: nextPhase,
      reason,
    });
  }

  return {
    reviewed_at: now.toISOString(),
    current_phase: currentPhase,
    completed_task_count: doneInPhase,
    transition_ready,
    suggested_next_phase: nextPhase ?? null,
    reason,
    transition_task_id,
  };
}
