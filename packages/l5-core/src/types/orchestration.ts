// L5 Business OS - Orchestration Type Definitions
// CEO Agent coordination substrate: instruction → interpretation → task → handoff

import type { RiskLevel } from './entities';

export type AgentRole =
  | 'CEO'
  | 'ChiefOfStaff'
  | 'CMO'
  | 'CRO'
  | 'CPO'
  | 'CTO'
  | 'COO'
  | 'CFO'
  | 'RiskQA'
  | 'Culture';

export type OrchestrationPhase =
  | 'direction_alignment'
  | 'market_pmf_diagnosis'
  | 'offer_workflow_redesign'
  | 'execution_system_build'
  | 'monitoring_optimization';

export interface FounderInstruction {
  id: string;
  raw_text: string;
  source: 'chat' | 'manual' | 'import';
  intent?: string;
  constraints?: string[];
  requested_phase?: string;
  status: 'new' | 'interpreted' | 'in_progress' | 'closed';
  created_at: string;
}

export interface CEOInterpretation {
  id: string;
  instruction_id: string;
  goal: string;
  assumptions: string[];
  phase: OrchestrationPhase;
  success_criteria: string[];
  risk_level: RiskLevel;
  approval_required: boolean;
  created_at: string;
}

export interface AgentTask {
  id: string;
  instruction_id: string;
  interpretation_id?: string;
  assigned_agent: AgentRole;
  title: string;
  rationale: string;
  expected_output: string;
  status: 'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed';
  approval_required: boolean;
  blocker?: string;
  due_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentHandoff {
  id: string;
  task_id: string;
  from_agent: string;
  to_agent?: string;
  context: string;
  next_action: string;
  blocker?: string;
  approval_required: boolean;
  what_was_completed?: string;
  what_remains_open?: string;
  why_next_agent_needed?: string;
  must_not_lose?: string;
  created_at: string;
}
