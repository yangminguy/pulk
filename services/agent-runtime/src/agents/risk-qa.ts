// RiskQA Agent — D1-D5 risk assessment, PII detection, approval gate decisions.
// SYSTEM_PROMPT derived from docs/AGENT_PROTOCOL.md (Risk/QA Agent section).
// Backed by Claude Haiku via local `claude` CLI.

import type { AgentInput, AgentOutput } from "./types.js";
import { callHaikuJson } from "../llm/haiku-llm.js";

const SYSTEM_PROMPT = `You are the RiskQA agent of L5 Business OS.

Role: review external execution, data usage, PII exposure, LLM traces, and automation risk. Final safety verdict for D3–D5 items. You can BLOCK unsafe items.

Must Check:
- PII exposure (anything user-identifiable → D4 minimum)
- Legal / compliance concerns (privacy, contracts, financial regulation)
- External-facing actions and consent scope
- Data minimization compliance
- Reversibility of the action

Return ONLY valid JSON in this exact schema:
{
  "decision": "PASS | BLOCK | CONDITIONAL — followed by a one-sentence verdict",
  "reasoning": "string — specific risks identified and why; cite PII / legal / external-impact concerns",
  "next_action": "string — what must happen before proceeding (e.g., remove PII field X, get Founder sign-off, narrow consent scope)",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}

Risk scale:
- D1: internal read-only, no external impact
- D2: internal write, no customer data, reversible
- D3: touches customer data or external systems, reversible with effort
- D4: irreversible or customer-facing, significant compliance risk
- D5: legal / PII / financial exposure, must not proceed without explicit Founder sign-off

Rules:
- Any PII involved → D4 minimum, requires_founder_approval true
- Legal / compliance concerns → D4–D5, requires_founder_approval true
- When in doubt, escalate risk level`;

export interface RiskQAAgentOutput extends AgentOutput {}

export async function runRiskQAAgent(input: AgentInput): Promise<RiskQAAgentOutput> {
  const userPrompt = `Task: ${input.task.title}\nRationale: ${input.task.rationale}\nExpected output: ${input.task.expected_output}`;
  try {
    return await callHaikuJson<RiskQAAgentOutput>(SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    console.warn("[RiskQA] Haiku call failed, using fallback —", (err as Error).message);
    return buildFallback(input);
  }
}

function buildFallback(input: AgentInput): RiskQAAgentOutput {
  return {
    decision: `RiskQA: "${input.task.title}" — requires manual risk review`,
    reasoning: "Claude CLI unavailable; conservative fallback: flagging for Founder review.",
    next_action: "Founder must review risk level and consent scope before proceeding.",
    risk_level: "D4",
    requires_founder_approval: true,
  };
}
