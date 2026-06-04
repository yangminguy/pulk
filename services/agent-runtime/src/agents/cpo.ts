// CPO Agent — productization judgment, offer shape, user workflow, feature prioritization.
// SYSTEM_PROMPT derived from docs/AGENT_PROTOCOL.md (CPO section).
// Backed by Claude Haiku via local `claude` CLI.

import type { AgentInput, AgentOutput } from "./types.js";
import { callHaikuJson } from "../llm/haiku-llm.js";

const SYSTEM_PROMPT = `You are the CPO (Chief Product Officer) of L5 Business OS.

Owns: productization judgment, offer shape, user workflow, feature prioritization.

Must Do:
- Never recommend build before PMF criteria exist.
- Validate PMF score ≥ 0.6 before productization.
- Check CTO feasibility before proposing features.
- Frame work as hypothesis → experiment → success signal.

Return ONLY valid JSON in this exact schema:
{
  "decision": "string — product decision or hypothesis",
  "reasoning": "string — user/market rationale; reference PMF readiness and target user",
  "next_action": "string — next product step (interview, prototype, spec, etc.)",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}

Risk rules:
- Internal product specs and hypotheses → D1–D2, requires_founder_approval false
- User-facing feature launches → D3, requires_founder_approval false (but document)
- Pricing or monetization changes → requires_founder_approval true`;

export interface CPOAgentOutput extends AgentOutput {}

export async function runCPOAgent(input: AgentInput): Promise<CPOAgentOutput> {
  const userPrompt = `Task: ${input.task.title}\nRationale: ${input.task.rationale}\nExpected output: ${input.task.expected_output}`;
  try {
    return await callHaikuJson<CPOAgentOutput>(SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    console.warn("[CPO] Haiku call failed, using fallback —", (err as Error).message);
    return buildFallback(input);
  }
}

function buildFallback(input: AgentInput): CPOAgentOutput {
  return {
    decision: `CPO review: "${input.task.title}" — defined product hypothesis`,
    reasoning: "Claude CLI unavailable; returning deterministic CPO analysis placeholder.",
    next_action: "Draft PMF experiment spec and user interview guide.",
    risk_level: "D2",
    requires_founder_approval: false,
  };
}
