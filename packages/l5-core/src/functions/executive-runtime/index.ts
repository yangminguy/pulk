// Executive Agent Runtime — entry point

import type { AgentTask, AgentHandoff } from '../../types/orchestration';
import type { RiskLevel } from '../../types/entities';
import type { HandlerResult, AgentOutput } from './protocol';
import { validateOutput, buildHandoff } from './protocol';
import type { LLMClient } from '../ceo-orchestration/types';
import { reviewExecutiveOutput, type CEOReviewVerdict } from '../ceo-orchestration/review';
import { runExecutive } from './executive-llm';
import { runExecutiveWithTools as _runExecutiveWithTools } from './tool-loop';
import type { ExecutiveTool } from './tools/types';
import { cmoHandler } from './handlers/cmo-handler';
import { croHandler } from './handlers/cro-handler';
import { cpoHandler } from './handlers/cpo-handler';
import { ctoHandler } from './handlers/cto-handler';
import { cooHandler } from './handlers/coo-handler';
import { cfoHandler } from './handlers/cfo-handler';
import { riskHandler } from './handlers/risk-handler';
import { chiefOfStaffHandler } from './handlers/chief-of-staff-handler';

export type { AgentOutput, HandlerInput, HandlerResult } from './protocol';
export type { ExecutiveTool, ToolResult, ToolPermission, ToolCallRequest, ToolRunContext } from './tools/types';
export { ToolRegistry, createToolRegistry } from './tools/registry';
export { runExecutiveWithTools } from './tool-loop';

export type ApprovalRouting = 'D3_auto_24h' | 'D4_manual' | 'D5_double_gate' | null;

export interface ExecuteAgentTaskResult {
  task_id: string;
  status: HandlerResult['status'];
  created_tasks: HandlerResult['created_tasks'];
  approval_required: boolean;
  blocked: boolean;
  reason: string;
  risk_level: HandlerResult['risk_level'];
  source_ref?: string;
  updated_status: AgentTask['status'];
  output: HandlerResult['output'];
  handoff: Omit<AgentHandoff, 'id' | 'created_at'> | undefined;
  validation_errors: string[];
  approval_routing?: ApprovalRouting;
}

function resolveApprovalRouting(riskLevel: RiskLevel): ApprovalRouting {
  switch (riskLevel) {
    case 'D3': return 'D3_auto_24h';
    case 'D4': return 'D4_manual';
    case 'D5': return 'D5_double_gate';
    default:   return null;
  }
}

export function executeAgentTask(
  task: AgentTask,
  context?: Record<string, unknown>
): ExecuteAgentTaskResult {
  const input = { task, context };

  let result: HandlerResult;

  switch (task.assigned_agent) {
    case 'CMO':
      result = cmoHandler(input);
      break;
    case 'CRO':
      result = croHandler(input);
      break;
    case 'CPO':
      result = cpoHandler(input);
      break;
    case 'CTO':
      result = ctoHandler(input);
      break;
    case 'COO':
      result = cooHandler(input);
      break;
    case 'CFO':
      result = cfoHandler(input);
      break;
    case 'RiskQA':
      result = riskHandler(input);
      break;
    case 'ChiefOfStaff':
      result = chiefOfStaffHandler(input);
      break;
    default:
      result = {
        status: 'blocked',
        created_tasks: [],
        approval_required: false,
        blocked: true,
        reason: `Agent ${task.assigned_agent} has no registered handler`,
        risk_level: 'D1',
        source_ref: task.source_ref,
        output: {
          current_situation: `No handler for agent: ${task.assigned_agent}`,
          source_instruction: task.rationale,
          goal: task.expected_output,
          why_now: '',
          bottleneck: `Agent ${task.assigned_agent} has no registered handler`,
          root_cause: 'Handler not implemented',
          options: [],
          recommendation: 'Assign task to a supported agent role',
          action_items: ['Register handler for this agent role'],
          next_owner: 'ceo',
          required_tools: [],
          approval_required: false,
          insight_to_record: '',
          workflow_improvement_suggestion: `Add handler for ${task.assigned_agent}`,
          confidence_level: 'low',
          risk_level: 'D1',
        },
        updated_status: 'blocked',
        handoff: undefined,
      };
  }

  const validation_errors = validateOutput(result.output);

  const approval_routing = resolveApprovalRouting(result.risk_level);

  // High risk (D3-D5) routes to the CEO review loop (needs_review), NOT the
  // Founder approval queue. The Founder gate (approval_required) is owned by the
  // handler/interpreter and fires ONLY for outbound messages / payments.
  // D5 additionally blocks until the CEO clears it.
  const approval_required = result.approval_required;
  let updated_status = result.updated_status;
  let blocked = result.blocked;

  if (result.risk_level === 'D3' || result.risk_level === 'D4') {
    if (updated_status !== 'blocked') {
      updated_status = 'needs_review';
    }
  } else if (result.risk_level === 'D5') {
    blocked = true;
    if (updated_status !== 'blocked') {
      updated_status = 'needs_review';
    }
  }

  return {
    task_id: task.id,
    status: result.status,
    created_tasks: result.created_tasks,
    approval_required,
    blocked,
    reason: result.reason,
    risk_level: result.risk_level,
    source_ref: result.source_ref,
    updated_status,
    output: result.output,
    handoff: result.handoff,
    validation_errors,
    approval_routing,
  };
}

// ── Live execution (Haiku executive → Haiku CEO review) ─────────────────────
// This is the real CEO-orchestration path. The sync executeAgentTask above stays
// for offline/back-compat callers; live callers (the orchestration plugin) use
// this so executives do real work and the CEO closes the loop to "done".

export interface ExecuteAgentTaskLiveResult {
  task_id: string;
  /** Final task status the caller should persist. */
  updated_status: AgentTask['status'];
  /** Founder gate — true ONLY for genuine outbound-message / payment. */
  approval_required: boolean;
  blocked: boolean;
  reason: string;
  risk_level: HandlerResult['risk_level'];
  source_ref?: string;
  output: AgentOutput;
  ceo_decision: CEOReviewVerdict['decision'];
  ceo_note: string;
  founder_reason?: string;
  /** Executive work-product handoff + CEO review handoff, in chain order. */
  handoffs: Array<Omit<AgentHandoff, 'id' | 'created_at'>>;
  validation_errors: string[];
}

export interface ExecuteAgentTaskLiveOptions {
  context?: Record<string, unknown>;
  /** Formatted insight text from recallInsights+formatInsightsForPrompt. Injected into executive prompt. */
  recalledInsights?: string;
  /** M3: optional executive tools (e.g. secondbrain.read/write). Passed to the tool-calling loop. */
  tools?: ExecutiveTool[];
}

export async function executeAgentTaskLive(
  task: AgentTask,
  llm: LLMClient,
  options?: ExecuteAgentTaskLiveOptions | Record<string, unknown>
): Promise<ExecuteAgentTaskLiveResult> {
  // Support both old signature (context object) and new options object.
  // Distinguish by checking for known ExecuteAgentTaskLiveOptions keys.
  let context: Record<string, unknown> | undefined;
  let recalledInsights: string | undefined;
  let tools: ExecutiveTool[] | undefined;
  if (options !== undefined) {
    if ('recalledInsights' in options || 'context' in options || 'tools' in options) {
      const opts = options as ExecuteAgentTaskLiveOptions;
      context = opts.context;
      recalledInsights = opts.recalledInsights;
      tools = opts.tools;
    } else {
      // Legacy: plain context object passed directly
      context = options as Record<string, unknown>;
    }
  }

  // 1) Executive does the real work (with optional recalled insights and tools injected).
  let execResult: HandlerResult;
  try {
    execResult = await _runExecutiveWithTools({ task, context }, llm, { recalledInsights, tools });
  } catch (err) {
    const reason = `${task.assigned_agent} execution failed: ${(err as Error).message.slice(0, 200)}`;
    return {
      task_id: task.id,
      updated_status: 'blocked',
      approval_required: false,
      blocked: true,
      reason,
      risk_level: 'D2',
      source_ref: task.source_ref,
      output: failureOutput(task, reason),
      ceo_decision: 'revise',
      ceo_note: reason,
      handoffs: [],
      validation_errors: [],
    };
  }

  const validation_errors = validateOutput(execResult.output);
  const execHandoff = execResult.handoff;

  // 2) CEO reviews the work product and decides the outcome.
  let verdict: CEOReviewVerdict;
  try {
    verdict = await reviewExecutiveOutput(task, execResult.output, llm);
  } catch (err) {
    // CEO review failed → defer to founder rather than silently completing.
    verdict = {
      decision: 'escalate_founder',
      ceo_note: `CEO 검토 실패로 파운더 확인이 필요합니다: ${(err as Error).message.slice(0, 160)}`,
      founder_reason: 'CEO 자동 검토가 실패했습니다.',
    };
  }

  // 3) Map verdict → final status + founder gate.
  let updated_status: AgentTask['status'];
  let approval_required = false;
  switch (verdict.decision) {
    case 'approve':
    case 'revise':
      updated_status = 'done';
      break;
    case 'escalate_founder':
    default:
      updated_status = 'needs_review';
      approval_required = true;
      break;
  }

  const ceoHandoff: Omit<AgentHandoff, 'id' | 'created_at'> = {
    task_id: task.id,
    from_agent: 'CEO',
    to_agent: verdict.decision === 'escalate_founder' ? 'founder' : task.assigned_agent,
    context: `CEO review of ${task.assigned_agent} work: ${task.title}`,
    next_action:
      verdict.decision === 'approve'
        ? 'Task approved and marked done'
        : verdict.decision === 'revise'
          ? 'Finalized with CEO direction'
          : 'Escalated to founder',
    blocker: verdict.decision === 'escalate_founder' ? verdict.founder_reason : undefined,
    approval_required,
    what_was_completed: verdict.ceo_note,
    what_remains_open: verdict.decision === 'escalate_founder' ? (verdict.founder_reason ?? '') : '',
    why_next_agent_needed:
      verdict.decision === 'escalate_founder'
        ? '외부 발신 또는 결제는 파운더 승인이 필요합니다.'
        : 'CEO closed the loop on this task.',
  };

  const handoffs: Array<Omit<AgentHandoff, 'id' | 'created_at'>> = [];
  if (execHandoff) handoffs.push(execHandoff);
  handoffs.push(ceoHandoff);

  return {
    task_id: task.id,
    updated_status,
    approval_required,
    blocked: false,
    reason: verdict.ceo_note,
    risk_level: execResult.risk_level,
    source_ref: task.source_ref,
    output: execResult.output,
    ceo_decision: verdict.decision,
    ceo_note: verdict.ceo_note,
    founder_reason: verdict.founder_reason,
    handoffs,
    validation_errors,
  };
}

function failureOutput(task: AgentTask, reason: string): AgentOutput {
  return {
    current_situation: reason,
    source_instruction: task.rationale,
    goal: task.expected_output,
    why_now: '',
    bottleneck: reason,
    root_cause: 'Executive LLM execution error',
    options: [],
    recommendation: '재시도가 필요합니다.',
    action_items: ['작업을 다시 큐에 넣어 재시도'],
    next_owner: 'ceo',
    required_tools: [],
    approval_required: false,
    insight_to_record: '',
    workflow_improvement_suggestion: '',
    confidence_level: 'low',
    risk_level: 'D2',
  };
}
