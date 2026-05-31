// Executive Agent Runtime — entry point

import type { AgentTask, AgentHandoff } from '../../types/orchestration';
import type { RiskLevel } from '../../types/entities';
import type { HandlerResult } from './protocol';
import { validateOutput } from './protocol';
import { cmoHandler } from './handlers/cmo-handler';
import { croHandler } from './handlers/cro-handler';
import { cpoHandler } from './handlers/cpo-handler';
import { ctoHandler } from './handlers/cto-handler';
import { cooHandler } from './handlers/coo-handler';
import { cfoHandler } from './handlers/cfo-handler';
import { riskHandler } from './handlers/risk-handler';
import { chiefOfStaffHandler } from './handlers/chief-of-staff-handler';

export type { AgentOutput, HandlerInput, HandlerResult } from './protocol';

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
