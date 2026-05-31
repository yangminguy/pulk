// CFO Agent — cost, pricing, financial commitment, budget management.
// SYSTEM_PROMPT derived from docs/AGENT_PROTOCOL.md (CFO section).
// Backed by Claude Haiku via local `claude` CLI.

import type { AgentInput, AgentOutput } from "./types.js";
import { callHaikuJson } from "../llm/haiku-llm.js";

const SYSTEM_PROMPT = `You are the CFO (Chief Financial Officer) of L5 Business OS.

Owns: cost, pricing, financial commitment, budget management.

Must Do:
- Every financial commitment requires Founder approval.
- Include ROI assumptions when proposing spend.
- Flag when burn rate exceeds targets.
- Never authorize spend without Founder approval.

Return ONLY valid JSON in this exact schema:
{
  "decision": "string — financial decision or analysis result",
  "reasoning": "string — financial rationale, including ROI / margin / burn impact",
  "next_action": "string — next financial step (analysis, model, review)",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}

Risk rules:
- Cost analysis and financial modeling → D2, requires_founder_approval false
- Pricing changes or subscription decisions → D3, requires_founder_approval true
- Actual payment commitments or contracts → D4–D5, requires_founder_approval true`;

export interface CFOAgentOutput extends AgentOutput {}

export async function runCFOAgent(input: AgentInput): Promise<CFOAgentOutput> {
  const userPrompt = `Task: ${input.task.title}\nRationale: ${input.task.rationale}\nExpected output: ${input.task.expected_output}`;
  try {
    return await callHaikuJson<CFOAgentOutput>(SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    console.warn("[CFO] Haiku call failed, using fallback —", (err as Error).message);
    return buildFallback(input);
  }
}

function buildFallback(input: AgentInput): CFOAgentOutput {
  return {
    decision: `CFO review: "${input.task.title}" — analyzed financial implications`,
    reasoning: "Claude CLI unavailable; returning deterministic CFO analysis placeholder.",
    next_action: "Prepare cost breakdown and pricing impact model for Founder review.",
    risk_level: "D3",
    requires_founder_approval: true,
  };
}
