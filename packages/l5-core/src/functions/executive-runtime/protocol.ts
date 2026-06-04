// Standard Agent Work Protocol — AGENT_PROTOCOL.md 기준 구현

import type { AgentTask, AgentHandoff, AgentRole } from '../../types/orchestration';
import type { RiskLevel } from '../../types/entities';

export interface CreatedTaskCandidate {
  title: string;
  assigned_agent: AgentRole;
  expected_output: string;
  details: Record<string, string>;
  approval_required: boolean;
  risk_level: RiskLevel;
}

export interface AgentOutput {
  current_situation: string;
  source_instruction: string;
  goal: string;
  why_now: string;
  bottleneck: string;
  root_cause: string;
  options: string[];
  recommendation: string;
  action_items: string[];
  next_owner: AgentRole | 'founder' | 'ceo';
  required_tools: string[];
  approval_required: boolean;
  insight_to_record: string;
  workflow_improvement_suggestion: string;
  confidence_level: 'low' | 'medium' | 'high';
  risk_level: RiskLevel;
}

export interface HandlerInput {
  task: AgentTask;
  context?: Record<string, unknown>;
}

export interface HandlerResult {
  status: 'completed' | 'needs_review' | 'blocked';
  created_tasks: CreatedTaskCandidate[];
  approval_required: boolean;
  blocked: boolean;
  reason: string;
  risk_level: RiskLevel;
  source_ref?: string;
  output: AgentOutput;
  updated_status: AgentTask['status'];
  handoff?: Omit<AgentHandoff, 'id' | 'created_at'>;
}

export function buildHandoff(
  task: AgentTask,
  output: AgentOutput,
  params: {
    what_was_completed: string;
    what_remains_open: string;
    why_next_agent_needed: string;
    must_not_lose: string;
  }
): Omit<AgentHandoff, 'id' | 'created_at'> {
  return {
    task_id: task.id,
    from_agent: task.assigned_agent,
    to_agent: output.next_owner,
    context: output.current_situation,
    next_action: output.action_items[0] ?? 'No immediate action required',
    blocker: output.bottleneck || undefined,
    approval_required: output.approval_required,
    ...params,
  };
}

export function validateOutput(output: AgentOutput): string[] {
  const missing: string[] = [];
  if (!output.current_situation) missing.push('current_situation');
  if (!output.goal) missing.push('goal');
  if (!output.recommendation) missing.push('recommendation');
  if (!output.next_owner) missing.push('next_owner');
  if (!output.action_items.length) missing.push('action_items');
  return missing;
}
