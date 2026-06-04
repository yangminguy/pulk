// CMO Agent Handler — PMF message/content experiment plan

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

export function cmoHandler(input: HandlerInput): HandlerResult {
  const { task } = input;
  const experiment = {
    title: `PMF message experiment: ${task.title}`,
    assigned_agent: 'CMO' as const,
    expected_output: 'PMF message experiment brief',
    details: {
      hypothesis: 'A sharper founder workflow message will produce qualified replies before product build.',
      target_segment: 'Founder-led operators with repeated manual workflow pain',
      channel: 'approved outreach draft or content test',
      success_signal: 'At least three qualified replies or interview accepts from the target segment',
    },
    approval_required: true,
    risk_level: 'D3' as const,
  };

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
      `Hypothesis: ${experiment.details.hypothesis}`,
      `Target segment: ${experiment.details.target_segment}`,
      `Channel: ${experiment.details.channel}`,
      `Success signal: ${experiment.details.success_signal}`,
      'Submit to CEO for review before any external send or publish',
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
    status: 'needs_review',
    created_tasks: [experiment],
    approval_required: true,
    blocked: false,
    reason: 'External-facing PMF message work is draft-only until approval.',
    risk_level: 'D3',
    source_ref: task.source_ref,
    output,
    updated_status: 'needs_review',
    handoff,
  };
}
