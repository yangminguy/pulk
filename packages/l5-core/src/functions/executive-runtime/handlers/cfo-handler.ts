// CFO Agent Handler — cost review and financial planning

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

export function cfoHandler(input: HandlerInput): HandlerResult {
  const { task } = input;
  const financialRisk = /(spend|budget|cost|margin|pricing|payment|invoice|subscription|hire|scale|contract)/i.test(
    `${task.title} ${task.rationale} ${task.expected_output}`,
  );
  const riskLevel = financialRisk ? 'D5' : 'D3';

  const output = {
    current_situation: `CFO task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Review financial implications and flag commitments requiring Founder approval',
    why_now: 'Financial commitments must be reviewed before any spend or contract',
    bottleneck: 'Pricing hypothesis not yet validated through PMF experiment',
    root_cause: 'No validated revenue model means financial planning is speculative',
    options: [
      'Model unit economics for current offer hypothesis',
      'Flag any tool subscriptions or contracts for Founder approval',
      'Define minimum revenue threshold to justify next investment',
    ],
    recommendation: 'Model unit economics and flag any financial commitments — all D5 decisions require Founder approval',
    action_items: [
      'Review current cost structure',
      'Model pricing hypothesis against unit economics',
      'Flag any subscription or contract commitments to Founder',
      'Define break-even signal for current offer',
    ],
    next_owner: 'founder' as const,
    required_tools: [],
    approval_required: true,
    insight_to_record: 'CFO must escalate all financial commitments to Founder — no autonomous spend',
    workflow_improvement_suggestion: 'Add CFO cost review step before any tool subscription approval',
    confidence_level: 'medium' as const,
    risk_level: riskLevel as 'D3' | 'D5',
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'Unit economics model drafted and financial flags identified',
    what_remains_open: 'Founder approval for any financial commitment',
    why_next_agent_needed: 'Founder must approve all financial commitments — CFO cannot authorize spend',
    must_not_lose: 'Cost structure, pricing hypothesis, and flagged commitment items',
  });

  return {
    status: 'needs_review',
    created_tasks: [{
      title: `Cost/margin/budget review: ${task.title}`,
      assigned_agent: 'CFO' as const,
      expected_output: 'Financial risk review with explicit cost, margin, and budget flags',
      details: {
        cost_risk: financialRisk ? 'flagged' : 'not detected',
        margin_risk: financialRisk ? 'review required before scaling' : 'monitor only',
        budget_risk: financialRisk ? 'Founder approval required before commitment' : 'no spend commitment detected',
      },
      approval_required: financialRisk,
      risk_level: riskLevel,
    }],
    approval_required: financialRisk,
    blocked: false,
    reason: financialRisk
      ? 'Task implies spending, margin, budget, or scaling risk and must enter approval review.'
      : 'No explicit spend commitment detected; CFO review remains advisory.',
    risk_level: riskLevel,
    source_ref: task.source_ref,
    output,
    updated_status: 'needs_review',
    handoff,
  };
}
