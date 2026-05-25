// Shared agent runtime types
// Risk levels D1-D5 follow docs/AGENT_PROTOCOL.md (D1 = lowest risk, D5 = highest)

export type RiskLevel = "D1" | "D2" | "D3" | "D4" | "D5";

export interface AgentInput {
  // Founder direction, company context, and accumulated insight references.
  // TODO: replace `unknown` with concrete L5 context schema once defined.
  context?: unknown;
}

export interface AgentOutput {
  decision: string;
  reasoning: string;
  risk_level: RiskLevel;
  requires_founder_approval: boolean;
}
