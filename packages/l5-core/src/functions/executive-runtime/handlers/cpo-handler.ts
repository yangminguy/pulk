// CPO Agent Handler — productization judgment and offer shape

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

export function cpoHandler(input: HandlerInput): HandlerResult {
  const { task, context } = input;
  const pmfEvidence = String(context?.pmf_evidence ?? context?.pmfEvidence ?? '').toLowerCase();
  const pmfScore = typeof context?.pmf_score === 'number' ? context.pmf_score : undefined;
  const hasStrongEvidence = pmfEvidence === 'strong' || (pmfScore !== undefined && pmfScore >= 4);
  const productizationRequested = /producti[sz]e|software|tool|build|platform|app|scale/i.test(
    `${task.title} ${task.rationale} ${task.expected_output}`,
  );
  const blocked = productizationRequested && !hasStrongEvidence;
  const approvalRequired = blocked || task.approval_required;

  const output = {
    current_situation: `CPO task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Define offer shape and productization path based on existing PMF signals',
    why_now: 'Offer must be shaped before sales or marketing can operate effectively',
    bottleneck: blocked
      ? 'PMF evidence is weak or missing, so productization cannot proceed autonomously'
      : 'PMF criteria must stay attached to any productization recommendation',
    root_cause: 'Premature productization without signal leads to wasted build effort',
    options: [
      'Package current manual delivery as a repeatable service offer',
      'Define minimum viable offer with clear scope and pricing',
      'Map user workflow to identify highest-friction steps for future automation',
    ],
    recommendation: blocked
      ? 'Block productization and require Founder approval until PMF evidence is strong'
      : 'Define minimum viable offer shape with PMF evidence attached',
    action_items: [
      'Document current offer scope and delivery steps',
      'Identify highest-value outcome for target customer',
      'Define offer package with pricing hypothesis',
      'Flag any tool build suggestions to CTO only after PMF confirmation',
    ],
    next_owner: 'ceo' as const,
    required_tools: [],
    approval_required: false,
    insight_to_record: 'CPO must not recommend tool build before PMF criteria are met',
    workflow_improvement_suggestion: 'Gate CPO tool recommendations behind PMF score threshold check',
    confidence_level: 'medium' as const,
    risk_level: 'D2' as const,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'Offer shape and productization path defined',
    what_remains_open: 'PMF validation before any tool build recommendation',
    why_next_agent_needed: 'CEO needs offer definition to align sales and marketing workstreams',
    must_not_lose: 'Offer scope, pricing hypothesis, and PMF gate criteria',
  });

  return {
    status: blocked ? 'blocked' : 'needs_review',
    created_tasks: blocked
      ? []
      : [{
          title: `Offer/productization gate: ${task.title}`,
          assigned_agent: 'CPO' as const,
          expected_output: 'Productization decision with PMF evidence attached',
          details: {
            pmf_evidence: hasStrongEvidence ? 'strong' : 'not requested',
            productization_gate: 'PMF evidence required before tool or product build',
          },
          approval_required: false,
          risk_level: 'D2' as const,
        }],
    approval_required: approvalRequired,
    blocked,
    reason: blocked
      ? 'Productization requested before strong PMF evidence; route to Founder approval.'
      : 'Offer shaping can proceed because no premature productization block was detected.',
    risk_level: blocked ? 'D4' : 'D2',
    source_ref: task.source_ref,
    output,
    updated_status: blocked ? 'blocked' : 'needs_review',
    handoff,
  };
}
