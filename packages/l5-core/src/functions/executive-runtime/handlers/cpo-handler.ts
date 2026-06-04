// CPO Agent Handler — productization judgment and offer shape

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

const PRODUCTIZATION_KEYWORDS = ['productiz', 'platform', 'scale product'];

function isProductizationTask(title: string): boolean {
  const lower = title.toLowerCase();
  return PRODUCTIZATION_KEYWORDS.some(kw => lower.includes(kw));
}

export function cpoHandler(input: HandlerInput): HandlerResult {
  const { task, context } = input;

  const pmfEvidence = context?.pmf_evidence as string | undefined;
  const isProductization = isProductizationTask(task.title);

  if (isProductization && pmfEvidence !== 'strong') {
    return {
      status: 'blocked',
      created_tasks: [],
      approval_required: true,
      blocked: true,
      reason: 'PMF evidence is required before productization. Validate product-market fit first.',
      risk_level: 'D4',
      source_ref: task.source_ref,
      output: {
        current_situation: `CPO blocked: ${task.title}`,
        source_instruction: task.rationale,
        goal: 'Productization requires PMF evidence',
        why_now: 'Premature productization without PMF evidence wastes resources',
        bottleneck: 'Missing PMF evidence',
        root_cause: 'No validated product-market fit yet',
        options: ['Run PMF validation experiments first', 'Collect and document PMF evidence'],
        recommendation: 'Block productization until PMF evidence is strong',
        action_items: ['Run PMF signal collection', 'Document customer evidence'],
        next_owner: 'ceo' as const,
        required_tools: [],
        approval_required: true,
        insight_to_record: 'Productization must follow PMF validation',
        workflow_improvement_suggestion: 'Add PMF gate check before productization tasks',
        confidence_level: 'high' as const,
        risk_level: 'D4' as const,
      },
      updated_status: 'blocked',
      handoff: undefined,
    };
  }

  const output = {
    current_situation: `CPO task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Define offer shape and productization path',
    why_now: 'Offer must be shaped before sales or marketing can operate effectively',
    bottleneck: 'Unclear offer scope and customer value mapping',
    root_cause: 'No documented offer shape or pricing hypothesis yet',
    options: [
      'Package current manual delivery as a repeatable service offer',
      'Define minimum viable offer with clear scope and pricing',
      'Map user workflow to identify highest-friction steps for future optimization',
    ],
    recommendation: 'Define minimum viable offer shape with scope and pricing clarity',
    action_items: [
      'Document current offer scope and delivery steps',
      'Identify highest-value outcome for target customer',
      'Define offer package with pricing hypothesis',
      'Map user workflow for efficiency improvements',
    ],
    next_owner: 'ceo' as const,
    required_tools: [],
    approval_required: false,
    insight_to_record: 'Offer shape and pricing clarity are prerequisites for sales and marketing alignment',
    workflow_improvement_suggestion: 'Create offer shape template for faster CPO analysis',
    confidence_level: 'medium' as const,
    risk_level: 'D2' as const,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'Offer shape and productization path defined',
    what_remains_open: 'Validation through early customer feedback',
    why_next_agent_needed: 'CEO needs offer definition to align sales and marketing workstreams',
    must_not_lose: 'Offer scope, pricing hypothesis, and customer value mapping',
  });

  return {
    status: 'needs_review',
    created_tasks: [{
      title: `Offer shape analysis: ${task.title}`,
      assigned_agent: 'CPO' as const,
      expected_output: 'Documented offer scope, pricing hypothesis, and delivery model',
      details: {
        offer_shape: 'To be defined',
        pricing_hypothesis: 'To be developed',
        delivery_model: 'To be documented',
      },
      approval_required: false,
      risk_level: 'D2' as const,
    }],
    approval_required: false,
    blocked: false,
    reason: 'Offer shaping is a standard CPO analysis task with no blocking constraints.',
    risk_level: 'D2',
    source_ref: task.source_ref,
    output,
    updated_status: 'needs_review',
    handoff,
  };
}
