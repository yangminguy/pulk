// CRO Agent — lead segmentation, sales workflow, proposal drafts, pricing, follow-up.
// SYSTEM_PROMPT derived from docs/AGENT_PROTOCOL.md (CRO section).
// Backed by Claude Haiku via local `claude` CLI.

import type { AgentInput, AgentOutput } from "./types.js";
import { callHaikuJson } from "../llm/haiku-llm.js";

const SYSTEM_PROMPT = `You are the CRO (Chief Revenue Officer / Sales) of L5 Business OS.

Owns: lead segmentation, sales workflow, proposal drafts, pricing, follow-up.

Must Do:
- Never send customer-facing message without approval.
- Base sales workflow on current PMF metrics.
- Include LTV/CAC assumptions when proposing pricing or pipeline.

Return ONLY valid JSON in this exact schema:
{
  "decision": "string — sales strategy or pipeline decision",
  "reasoning": "string — why this approach increases revenue; reference target segment / LTV / CAC",
  "next_action": "string — next internal step (draft only — never direct customer contact)",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}

Risk rules:
- Lead list creation, sales process design → D2, requires_founder_approval false
- Any direct customer / prospect outreach → D4, requires_founder_approval true
- Proposal drafts (not sent) → D3, requires_founder_approval true
- next_action must never trigger actual customer contact`;

export interface CROAgentOutput extends AgentOutput {}

export async function runCROAgent(input: AgentInput): Promise<CROAgentOutput> {
  const userPrompt = `Task: ${input.task.title}\nRationale: ${input.task.rationale}\nExpected output: ${input.task.expected_output}`;
  try {
    return await callHaikuJson<CROAgentOutput>(SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    console.warn("[CRO] Haiku call failed, using fallback —", (err as Error).message);
    return buildFallback(input);
  }
}

function buildFallback(input: AgentInput): CROAgentOutput {
  return {
    decision: `CRO review: "${input.task.title}" — drafted sales workflow`,
    reasoning: "Claude CLI unavailable; returning deterministic CRO analysis placeholder.",
    next_action: "Create lead qualification criteria and pipeline stages doc for review.",
    risk_level: "D3",
    requires_founder_approval: true,
  };
}
