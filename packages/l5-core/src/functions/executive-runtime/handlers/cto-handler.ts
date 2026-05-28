// CTO Agent Handler — tool request review and technical feasibility

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';
import type { RiskLevel } from '../../../types/entities';

const TOOL_BUILD_KEYWORDS = ['build', 'develop', 'create', 'implement', 'automat'];
const PMF_DIAGNOSIS_PHASES = ['pmf_diagnosis', 'problem_validation'];

function isPrematureToolBuild(title: string, phase?: string): boolean {
  const lower = title.toLowerCase();
  const hasToolKeyword = lower.includes('tool') || lower.includes('workflow automation') || lower.includes('platform');
  const hasBuildKeyword = TOOL_BUILD_KEYWORDS.some(kw => lower.includes(kw));
  const isEarlyPhase = phase ? PMF_DIAGNOSIS_PHASES.includes(phase) : false;
  return hasToolKeyword && hasBuildKeyword && isEarlyPhase;
}

export function ctoHandler(input: HandlerInput): HandlerResult {
  const { task } = input;

  if (isPrematureToolBuild(task.title, (task as any).phase)) {
    return {
      status: 'blocked',
      created_tasks: [{
        title: `Validate workflow manually before building: ${task.title}`,
        assigned_agent: 'COO' as const,
        expected_output: 'Manual workflow validation report',
        details: {
          reason: 'Tool build deferred until manual validation confirms value',
        },
        approval_required: false,
        risk_level: 'D2' as const,
      }],
      approval_required: false,
      blocked: true,
      reason: 'Tool building is premature before manual workflow validation in current phase.',
      risk_level: 'D3',
      source_ref: task.source_ref,
      output: {
        current_situation: `CTO blocked: ${task.title}`,
        source_instruction: task.rationale,
        goal: 'Defer tool build until validation confirms value',
        why_now: 'Building tools before validating manual workflow wastes resources',
        bottleneck: 'Missing manual workflow validation',
        root_cause: 'Premature tool build request before PMF validation phase',
        options: ['Validate manually first', 'Defer tool build to post-PMF phase'],
        recommendation: 'Route to COO for manual workflow validation',
        action_items: ['COO validates workflow manually', 'Document results before tool build'],
        next_owner: 'ceo' as const,
        required_tools: [],
        approval_required: false,
        insight_to_record: 'Tools should follow validated manual workflows, not precede them',
        workflow_improvement_suggestion: 'Add phase gate check before CTO tool build tasks',
        confidence_level: 'high' as const,
        risk_level: 'D3' as const,
      },
      updated_status: 'blocked',
      handoff: undefined,
    };
  }

  const output = {
    current_situation: `CTO task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Evaluate tool request for technical feasibility and build strategy',
    why_now: 'Tool requests must be reviewed for effort, architecture impact, and maintenance burden',
    bottleneck: 'Unclear tool scope, build effort, and integration complexity',
    root_cause: 'No documented technical approach or feasibility assessment yet',
    options: [
      'Build in-house with estimated effort and technical debt implications',
      'Integrate third-party tool to reduce complexity and time-to-market',
      'Defer tool build and optimize manual workflow first',
    ],
    recommendation: 'Assess technical feasibility and recommend build vs. integrate approach',
    action_items: [
      'Document tool scope and core functional requirements',
      'Estimate build effort and technical debt implications',
      'Identify third-party alternatives and integration complexity',
      'Recommend build strategy (in-house vs. integrate vs. defer)',
      'Map technical approach to business phase timeline',
    ],
    next_owner: 'ceo' as const,
    required_tools: [],
    approval_required: false,
    insight_to_record: 'Technical feasibility and tool strategy clarity enable faster execution',
    workflow_improvement_suggestion: 'Create tool request template with feasibility checklist',
    confidence_level: 'medium' as const,
    risk_level: 'D2' as const,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'Tool request evaluated for technical feasibility and build strategy',
    what_remains_open: 'Approval and scheduling of tool build within phase roadmap',
    why_next_agent_needed: 'CEO needs CTO feasibility recommendation to proceed with tool strategy',
    must_not_lose: 'Tool scope, build effort estimate, and recommended build approach',
  });

  return {
    status: 'needs_review',
    created_tasks: [{
      title: `Technical feasibility review: ${task.title}`,
      assigned_agent: 'CTO' as const,
      expected_output: 'Tool request assessment with build strategy, effort estimate, and recommendations',
      details: {
        tool_scope: 'To be defined',
        build_effort: 'To be estimated',
        build_strategy: 'To be recommended (in-house vs. integrate vs. defer)',
      },
      approval_required: false,
      risk_level: 'D2' as const,
    }],
    approval_required: false,
    blocked: false,
    reason: 'Tool feasibility assessment is a standard CTO analysis task with no blocking constraints.',
    risk_level: 'D2',
    source_ref: task.source_ref,
    output,
    updated_status: 'needs_review',
    handoff,
  };
}
