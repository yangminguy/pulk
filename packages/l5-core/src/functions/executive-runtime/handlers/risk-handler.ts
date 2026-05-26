// Risk/QA Agent Handler — risk level, PII, approval gate validation

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

export function riskHandler(input: HandlerInput): HandlerResult {
  const { task } = input;

  const output = {
    current_situation: `Risk/QA task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Validate risk level, PII handling, approval gates, and LLM trace safety',
    why_now: 'Every external action must pass risk review before execution',
    bottleneck: 'Risk flags must be resolved before any D3-D5 action proceeds',
    root_cause: 'Unreviewed external actions expose company to legal and reputational risk',
    options: [
      'Approve action with documented risk level and approval gate',
      'Block action and require additional approval or PII review',
      'Downgrade action scope to reduce risk level',
    ],
    recommendation: 'Block any action missing risk_level, pii_level, or approval gate — do not allow D3-D5 without explicit sign-off',
    action_items: [
      'Verify risk_level is assigned to the action',
      'Verify pii_level is assigned to any customer data used',
      'Verify approval gate exists for D3-D5 actions',
      'Verify LLM trace does not include unnecessary PII',
      'Return review result to CEO with pass/block decision',
    ],
    next_owner: 'ceo' as const,
    required_tools: [],
    approval_required: false,
    insight_to_record: 'Risk/QA must check risk_level, pii_level, approval gate, and trace safety on every external action',
    workflow_improvement_suggestion: 'Automate Risk/QA checklist as a pre-flight gate in Hermes runtime',
    confidence_level: 'high' as const,
    risk_level: 'D2' as const,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'Risk review completed — flags documented and pass/block decision issued',
    what_remains_open: 'CEO must act on any blocked items before external execution',
    why_next_agent_needed: 'CEO needs risk review result to proceed or halt workstream',
    must_not_lose: 'Risk flags, PII issues, and approval gate status',
  });

  return {
    output,
    updated_status: 'needs_review',
    handoff,
  };
}
