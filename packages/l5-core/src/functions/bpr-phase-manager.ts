import { OrchestrationPhase, PhaseTransition } from '../types/orchestration';

export function transitionPhase(
  currentPhase: OrchestrationPhase | 'none',
  targetPhase: OrchestrationPhase,
  reason: string,
  triggeredBy: string,
  riskQaBlock: boolean
): PhaseTransition {
  if (riskQaBlock) {
    throw new Error('Transition blocked by RiskQA.');
  }

  const approval_required = targetPhase === 'productization_review' || targetPhase === 'scale_automation';

  return {
    id: `pt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    from_phase: currentPhase,
    to_phase: targetPhase,
    reason,
    triggered_by: triggeredBy,
    approval_required,
    approved_by_founder: false,
    created_at: new Date().toISOString()
  };
}
