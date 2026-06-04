// Shared agent runtime types
// Risk levels D1-D5 follow docs/AGENT_PROTOCOL.md (D1 = lowest risk, D5 = highest)

export type RiskLevel = "D1" | "D2" | "D3" | "D4" | "D5";

export interface AgentTask {
  id: string;
  title: string;
  rationale: string;
  expected_output: string;
  phase?: string;
  risk_level?: RiskLevel;
}

export interface AgentInput {
  task: AgentTask;
  context?: unknown;
}

export interface AgentOutput {
  decision: string;
  reasoning: string;
  next_action: string;
  risk_level: RiskLevel;
  requires_founder_approval: boolean;
}
