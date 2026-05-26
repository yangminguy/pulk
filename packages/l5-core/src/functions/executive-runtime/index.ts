// Executive Agent Runtime — entry point

import type { AgentTask, AgentHandoff } from '../../types/orchestration';
import type { HandlerResult } from './protocol';
import { validateOutput } from './protocol';
import { cmoHandler } from './handlers/cmo-handler';
import { croHandler } from './handlers/cro-handler';
import { cpoHandler } from './handlers/cpo-handler';
import { ctoHandler } from './handlers/cto-handler';
import { cooHandler } from './handlers/coo-handler';
import { cfoHandler } from './handlers/cfo-handler';
import { riskHandler } from './handlers/risk-handler';

export type { AgentOutput, HandlerInput, HandlerResult } from './protocol';

export interface ExecuteAgentTaskResult {
  task_id: string;
  updated_status: AgentTask['status'];
  output: HandlerResult['output'];
  handoff: Omit<AgentHandoff, 'id' | 'created_at'> | undefined;
  validation_errors: string[];
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
    default:
      result = {
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

  return {
    task_id: task.id,
    updated_status: result.updated_status,
    output: result.output,
    handoff: result.handoff,
    validation_errors,
  };
}
