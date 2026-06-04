// CRO Agent Handler — sales workflow and proposal draft

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

export function croHandler(input: HandlerInput): HandlerResult {
  const { task } = input;
  const sourceRef = task.source_ref ?? `task:${task.id}`;
  const salesTask = {
    title: `Sales workflow/proposal draft: ${task.title}`,
    assigned_agent: 'CRO' as const,
    expected_output: 'Sales workflow or proposal draft stopped before customer send',
    details: {
      lead: 'Target lead from CEO instruction or PMF experiment segment',
      source_ref: sourceRef,
      offer_angle: 'Manual founder workflow relief before software commitment',
      next_action: 'Draft proposal and route to approval before external send',
    },
    approval_required: true,
    risk_level: 'D3' as const,
  };

  const output = {
    current_situation: `CRO task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Create sales workflow and proposal draft for target segment',
    why_now: 'Sales workflow must be defined before lead outreach begins',
    bottleneck: 'Lead segment not yet confirmed by CMO message validation',
    root_cause: 'PMF message must be validated before sales approach is finalized',
    options: [
      'Draft outbound sequence for warm leads (3-step email)',
      'Create proposal template based on current offer',
      'Map existing pipeline stages to L5 workflow',
    ],
    recommendation: 'Draft proposal template and sales sequence — stop before sending to any customer without approval',
    action_items: [
      `Lead/source_ref: ${salesTask.details.lead} (${salesTask.details.source_ref})`,
      `Offer angle: ${salesTask.details.offer_angle}`,
      'Map 3-step follow-up sequence',
      `Next action: ${salesTask.details.next_action}`,
    ],
    next_owner: 'ceo' as const,
    required_tools: [],
    approval_required: true,
    insight_to_record: 'CRO must stop before customer-facing send until D4 approval exists',
    workflow_improvement_suggestion: 'Link CRO proposal draft to PMFExperiment so signal feeds back automatically',
    confidence_level: 'medium' as const,
    risk_level: 'D3' as const,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'Sales workflow draft and proposal template created',
    what_remains_open: 'Founder/CEO approval before any customer-facing send',
    why_next_agent_needed: 'CEO must review sales approach and approve before customer contact',
    must_not_lose: 'Lead segment definition and proposal template',
  });

  return {
    status: 'needs_review',
    created_tasks: [salesTask],
    approval_required: true,
    blocked: false,
    reason: 'Customer-facing sales work is draft-only until approval.',
    risk_level: 'D3',
    source_ref: sourceRef,
    output,
    updated_status: 'needs_review',
    handoff,
  };
}
