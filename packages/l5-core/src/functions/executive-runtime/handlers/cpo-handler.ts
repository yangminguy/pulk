// CPO Agent Handler — productization judgment and offer shape

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

export function cpoHandler(input: HandlerInput): HandlerResult {
  const { task } = input;

  const output = {
    current_situation: `CPO task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Define offer shape and productization path based on existing PMF signals',
    why_now: 'Offer must be shaped before sales or marketing can operate effectively',
    bottleneck: 'PMF criteria must exist before any tool or product build is recommended',
    root_cause: 'Premature productization without signal leads to wasted build effort',
    options: [
      'Package current manual delivery as a repeatable service offer',
      'Define minimum viable offer with clear scope and pricing',
      'Map user workflow to identify highest-friction steps for future automation',
    ],
    recommendation: 'Define minimum viable offer shape — do not recommend tool build until PMF signal is confirmed',
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
    output,
    updated_status: 'needs_review',
    handoff,
  };
}
