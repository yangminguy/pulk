import {
  BPRPhase,
  BPRPhaseState,
  BPRTransitionRequest,
  BPRTransitionResult,
  BPR_PHASE_ORDER,
} from './types';

export function getCurrentPhase(phases: BPRPhaseState[]): BPRPhase | null {
  const current = phases.find((p) => p.is_current);
  return current ? current.phase : null;
}

export function validateTransition(
  from: BPRPhase,
  to: BPRPhase
): { valid: boolean; reason: string } {
  const fromIndex = BPR_PHASE_ORDER.indexOf(from);
  const toIndex = BPR_PHASE_ORDER.indexOf(to);

  if (fromIndex === -1 || toIndex === -1) {
    return { valid: false, reason: 'Unknown phase' };
  }

  if (toIndex < fromIndex) {
    return {
      valid: false,
      reason: 'Backward transition requires founder approval',
    };
  }

  if (toIndex - fromIndex > 1) {
    return { valid: false, reason: 'Can only advance one phase at a time' };
  }

  return { valid: true, reason: 'Transition is valid' };
}

export function buildTransitionResult(
  req: BPRTransitionRequest
): BPRTransitionResult {
  const validation = validateTransition(req.from_phase, req.to_phase);
  const fromIndex = BPR_PHASE_ORDER.indexOf(req.from_phase);
  const toIndex = BPR_PHASE_ORDER.indexOf(req.to_phase);
  const isBackward = toIndex < fromIndex;

  return {
    ok: validation.valid,
    from_phase: req.from_phase,
    to_phase: req.to_phase,
    requires_approval: true, // phase 전환은 항상 D5 수준
    message: isBackward
      ? `Backward transition from ${req.from_phase} to ${req.to_phase} requires founder approval`
      : validation.valid
      ? `Transition from ${req.from_phase} to ${req.to_phase} requires founder approval (D5)`
      : validation.reason,
  };
}

export function derivePhaseFromTasks(
  tasks: Array<{ phase?: string }>
): BPRPhase {
  if (tasks.length === 0) {
    return 'direction_alignment';
  }

  const counts: Record<string, number> = {};
  for (const task of tasks) {
    if (task.phase) {
      counts[task.phase] = (counts[task.phase] ?? 0) + 1;
    }
  }

  let topPhase: string | null = null;
  let topCount = 0;
  for (const [phase, count] of Object.entries(counts)) {
    if (count > topCount) {
      topCount = count;
      topPhase = phase;
    }
  }

  if (topPhase && BPR_PHASE_ORDER.includes(topPhase as BPRPhase)) {
    return topPhase as BPRPhase;
  }

  return 'direction_alignment';
}
