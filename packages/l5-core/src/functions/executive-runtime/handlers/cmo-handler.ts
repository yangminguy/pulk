// CMO Agent Handler — PMF message/content experiment plan

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

export function cmoHandler(input: HandlerInput): HandlerResult {
  const { task } = input;

  const output = {
    current_situation: `CMO task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Create PMF message experiment plan that tests positioning and demand signals',
    why_now: 'PMF message validation must precede any external content publishing',
    bottleneck: 'Awaiting PMF hypothesis from CPO before channel selection',
    root_cause: 'No validated message exists yet for target segment',
    options: [
      'A/B test two positioning angles via cold outreach draft',
      'Run waitlist landing page with two headline variants',
      'Conduct 5 customer discovery calls to validate core message',
    ],
    recommendation: 'Draft two positioning variants for CEO review before any external send',
    action_items: [
      'Draft PMF message variant A and variant B',
      'Define target segment and success signal',
      'Submit to CEO for review — do not publish without approval',
    ],
    next_owner: 'ceo' as const,
    required_tools: [],
    approval_required: true,
    insight_to_record: 'CMO must validate message hypothesis before channel execution',
    workflow_improvement_suggestion: 'Add PMFExperiment record creation to CMO output contract',
    confidence_level: 'medium' as const,
    risk_level: 'D3' as const,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'PMF message experiment plan drafted with two positioning variants',
    what_remains_open: 'CEO review and approval before external send',
    why_next_agent_needed: 'CEO must approve positioning direction before CMO proceeds to channel',
    must_not_lose: 'Both positioning variants and the target segment definition',
  });

  return {
    output,
    updated_status: 'needs_review',
    handoff,
  };
}
