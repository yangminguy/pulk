// COO Agent Handler — delivery workflow and internal process

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

export function cooHandler(input: HandlerInput): HandlerResult {
  const { task } = input;

  const output = {
    current_situation: `COO task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Optimize delivery workflow and define internal operating SOP',
    why_now: 'Operational process must be documented before scaling delivery',
    bottleneck: 'Delivery steps are informal and not yet captured as repeatable SOP',
    root_cause: 'No documented workflow means inconsistent delivery quality',
    options: [
      'Map current delivery steps into a repeatable checklist',
      'Identify highest-friction handoff point in current process',
      'Define operating cadence for weekly review and status update',
    ],
    recommendation: 'Document delivery workflow as SOP and identify first automation candidate',
    action_items: [
      'Map end-to-end delivery steps for current offer',
      'Identify bottleneck and owner for each step',
      'Draft SOP checklist',
      'Flag automation candidates to CTO',
    ],
    next_owner: 'ceo' as const,
    required_tools: [],
    approval_required: false,
    insight_to_record: 'COO should document before automating — SOP first, tool second',
    workflow_improvement_suggestion: 'Link COO SOP output to WorkflowStep records in NocoBase',
    confidence_level: 'medium' as const,
    risk_level: 'D2' as const,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'Delivery workflow mapped and SOP drafted',
    what_remains_open: 'CEO review and automation candidate handoff to CTO',
    why_next_agent_needed: 'CEO needs operational status to update company BPR log',
    must_not_lose: 'SOP draft and identified bottleneck',
  });

  return {
    output,
    updated_status: 'needs_review',
    handoff,
  };
}
