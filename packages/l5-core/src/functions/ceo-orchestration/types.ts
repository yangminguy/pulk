// Re-exports from the canonical orchestration types (Task #1, data-architect),
// plus internal helpers used only by the CEO orchestration pipeline.

import type { RiskLevel } from '../../types/entities';
import type { AgentRole } from '../../types/orchestration';

export type {
  FounderInstruction,
  CEOInterpretation,
  AgentTask,
  AgentHandoff,
  AgentRole,
  OrchestrationPhase,
} from '../../types/orchestration';

// Executive roles eligible for task assignment (excludes CEO, ChiefOfStaff, Culture).
export type ExecutiveRole = Extract<
  AgentRole,
  'CMO' | 'CRO' | 'CPO' | 'CTO' | 'COO' | 'CFO' | 'RiskQA'
>;

// Internal intermediate representation between interpretation and task assignment.
export interface Workstream {
  id: string;
  instruction_id: string;
  interpretation_id: string;
  domain: ExecutiveRole;
  title: string;
  rationale: string;
  expected_output: string;
  approval_required: boolean;
  risk_level: RiskLevel;
}

export interface CompanyStatusSummary {
  generated_at: string;
  total_tasks: number;
  by_status: Record<
    'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed',
    number
  >;
  by_agent: Record<ExecutiveRole, number>;
  pending_approvals: number;
  blockers: Array<{ task_id: string; reason: string }>;
  brief: string;
}

// LLM transport abstraction so the package stays testable without a real model.
export interface LLMClient {
  complete(args: {
    system: string;
    user: string;
    trace_name?: string;
    trace_metadata?: Record<string, unknown>;
  }): Promise<string>;
}
