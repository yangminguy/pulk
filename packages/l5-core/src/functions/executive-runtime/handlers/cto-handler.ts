// CTO Agent Handler — tool request review and technical feasibility

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

export function ctoHandler(input: HandlerInput): HandlerResult {
  const { task } = input;

  const output = {
    current_situation: `CTO task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Evaluate tool request for technical feasibility and block premature builds',
    why_now: 'Tool requests must be reviewed before any build commitment is made',
    bottleneck: 'PMF signal required before approving any new tool build',
    root_cause: 'Building tools before PMF creates waste and technical debt',
    options: [
      'Approve tool request if PMF score and repetition signal exist',
      'Block tool request and redirect to manual workflow first',
      'Defer tool request pending CPO offer validation',
    ],
    recommendation: 'Block tool build until PMF criteria are confirmed — redirect to manual process first',
    action_items: [
      'Check PMF score for related business',
      'Verify repetition signal exists (task repeated 3+ times)',
      'Assess technical feasibility and build effort',
      'Return decision to CEO with block or approve rationale',
    ],
    next_owner: 'ceo' as const,
    required_tools: [],
    approval_required: false,
    insight_to_record: 'CTO must block premature tool builds — manual first, automate later',
    workflow_improvement_suggestion: 'Add PMF score gate check to CTO tool request review step',
    confidence_level: 'high' as const,
    risk_level: 'D2' as const,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'Tool request evaluated for technical feasibility and PMF gate',
    what_remains_open: 'PMF confirmation before build approval',
    why_next_agent_needed: 'CEO needs CTO decision to proceed or redirect workstream',
    must_not_lose: 'PMF gate status and technical feasibility notes',
  });

  return {
    output,
    updated_status: 'needs_review',
    handoff,
  };
}
