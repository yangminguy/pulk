// CTO Agent Handler — tool request review and technical feasibility

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';
import type { RiskLevel } from '../../../types/entities';

export function ctoHandler(input: HandlerInput): HandlerResult {
  const { task, context } = input;
  const requestedBuild = /build|software|tool|automation|integration|api|app|platform/i.test(
    `${task.title} ${task.rationale} ${task.expected_output}`,
  );
  const phaseAllowsBuild = task.phase === 'execution_build' || task.phase === 'scale_automation';
  const manualValidation = Boolean(context?.manual_validation ?? context?.workflow_validated ?? context?.content_validated);
  const blocked = requestedBuild && !phaseAllowsBuild && !manualValidation;
  const approvalRequired = blocked || task.approval_required;
  const riskLevel: RiskLevel = blocked ? 'D4' : 'D2';

  const output = {
    current_situation: `CTO task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Evaluate tool request for technical feasibility and block premature builds',
    why_now: 'Tool requests must be reviewed before any build commitment is made',
    bottleneck: blocked
      ? 'Manual workflow/content validation is missing and phase does not allow software build'
      : 'PMF signal required before approving any new tool build',
    root_cause: 'Building tools before PMF creates waste and technical debt',
    options: [
      'Approve tool request if PMF score and repetition signal exist',
      'Block tool request and redirect to manual workflow first',
      'Defer tool request pending CPO offer validation',
    ],
    recommendation: blocked
      ? 'Block tool build and redirect to workflow/content/manual validation first'
      : 'Review feasibility without committing to build beyond the allowed phase',
    action_items: [
      'Check PMF score for related business',
      'Verify repetition signal exists (task repeated 3+ times)',
      'Assess technical feasibility and build effort',
      'Return decision to CEO with block or approve rationale',
    ],
    next_owner: (approvalRequired ? 'founder' : 'ceo') as 'founder' | 'ceo',
    required_tools: ['NocoBase'],
    approval_required: approvalRequired,
    insight_to_record: 'CTO must require PMF confirmation before execution build',
    workflow_improvement_suggestion: 'Inject PMF gate before CTO tasks',
    confidence_level: 'medium' as const,
    risk_level: riskLevel,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'Tool request evaluated for technical feasibility and PMF gate',
    what_remains_open: 'PMF confirmation before build approval',
    why_next_agent_needed: 'CEO needs CTO decision to proceed or redirect workstream',
    must_not_lose: 'PMF gate status and technical feasibility notes',
  });

  return {
    status: blocked ? 'blocked' : 'needs_review',
    created_tasks: blocked
      ? [{
          title: `Manual validation before build: ${task.title}`,
          assigned_agent: 'COO' as const,
          expected_output: 'Workflow/content/manual validation evidence before CTO build review',
          details: {
            validation_required: 'workflow/content/manual validation',
            build_request: 'blocked until validation or execution_build/scale_automation phase',
          },
          approval_required: false,
          risk_level: 'D2' as const,
        }]
      : [{
          title: `Technical feasibility review: ${task.title}`,
          assigned_agent: 'CTO' as const,
          expected_output: 'Tool request review with PMF/manual validation evidence',
          details: {
            phase: task.phase ?? 'unspecified',
            manual_validation: manualValidation ? 'present' : 'not required by current phase',
          },
          approval_required: approvalRequired,
          risk_level: riskLevel,
        }],
    approval_required: approvalRequired,
    blocked,
    reason: blocked
      ? 'Premature tool build blocked before workflow/content/manual validation.'
      : 'CTO review can proceed within current phase constraints.',
    risk_level: riskLevel,
    source_ref: task.source_ref,
    output,
    updated_status: blocked ? 'blocked' : 'needs_review',
    handoff,
  };
}
