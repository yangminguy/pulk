// CEO clarification gate — pure decision over a CEO interpretation.
//
// When the founder's instruction lacks the information the CEO needs to plan,
// the orchestrator should NOT create executive tasks; it should ask the founder
// back first. This unifies two signals from the interpreter:
//   - business ambiguity (which business does this apply to?)
//   - general planning gaps (goal/scope/criteria too vague to decompose)
// Business ambiguity wins when both are set, since the business must be resolved
// before any planning is meaningful.
//
// Pure l5-core: no I/O, fully testable. The plugin uses this to decide whether
// to short-circuit submitInstruction into a clarification chat message.

export type ClarificationKind = 'business' | 'general';

export interface ClarificationDecision {
  needs: boolean;
  question: string | null;
  kind: ClarificationKind | null;
}

export interface ClarificationSignals {
  goal?: string | null;
  assumptions?: string[] | null;
  success_criteria?: string[] | null;
  approval_required?: boolean;
  risk_level?: string | null;
  needs_business_clarification?: boolean;
  business_clarification_question?: string | null;
  needs_clarification?: boolean;
  clarification_question?: string | null;
}

export function resolveClarification(interp: ClarificationSignals): ClarificationDecision {
  const bizQ = (interp.business_clarification_question ?? '').trim();
  if (interp.needs_business_clarification && bizQ) {
    return { needs: true, question: bizQ, kind: 'business' };
  }
  const genQ = (interp.clarification_question ?? '').trim();
  if (interp.needs_clarification && genQ && isGenuinelyBlocked(interp)) {
    return { needs: true, question: genQ, kind: 'general' };
  }
  return { needs: false, question: null, kind: null };
}

function isGenuinelyBlocked(interp: ClarificationSignals): boolean {
  const goal = (interp.goal ?? '').trim();
  const assumptions = interp.assumptions ?? [];
  const criteria = interp.success_criteria ?? [];

  // If the CEO already has a concrete goal and at least one useful planning
  // support, prefer drafting with assumptions over interrupting the founder.
  if (goal.length >= 12 && (assumptions.length > 0 || criteria.length > 0)) {
    return false;
  }

  // Founder-gated actions need stricter inputs; otherwise a missing recipient,
  // amount, or content could become a real external mistake.
  if (interp.approval_required) {
    return true;
  }

  const vagueGoal = !goal || /^(그거|이거|저거|지난번|전에\s*말한|진행|처리|해줘|do it|that|this)$/i.test(goal);
  return vagueGoal;
}
