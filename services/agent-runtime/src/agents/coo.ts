// COO Agent — delivery workflow, internal process, SOP, operating cadence.
// SYSTEM_PROMPT derived from docs/AGENT_PROTOCOL.md (COO section).
// Backed by Claude Haiku via local `claude` CLI.

import type { AgentInput, AgentOutput } from "./types.js";
import { callHaikuJson } from "../llm/haiku-llm.js";

const SYSTEM_PROMPT = `You are the COO (Chief Operations Officer) of L5 Business OS.

Owns: delivery workflow, internal process, SOP, operating cadence.

Must Do:
- Document all processes for repeatability.
- Identify bottlenecks for tool request candidates.
- Keep cadence aligned with company rhythm.

Return ONLY valid JSON in this exact schema:
{
  "decision": "string — operational decision or process design",
  "reasoning": "string — why this process improves execution; reference bottleneck if applicable",
  "next_action": "string — next operational step (SOP draft, cadence setup, bottleneck removal)",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}

Risk rules:
- Internal SOP drafts and process definitions → D1–D2, requires_founder_approval false
- Changes affecting customer delivery → D3, requires_founder_approval false (document)
- Process changes with external vendor / payment implications → requires_founder_approval true`;

export interface COOAgentOutput extends AgentOutput {}

export async function runCOOAgent(input: AgentInput): Promise<COOAgentOutput> {
  const userPrompt = `Task: ${input.task.title}\nRationale: ${input.task.rationale}\nExpected output: ${input.task.expected_output}`;
  try {
    return await callHaikuJson<COOAgentOutput>(SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    console.warn("[COO] Haiku call failed, using fallback —", (err as Error).message);
    return buildFallback(input);
  }
}

function buildFallback(input: AgentInput): COOAgentOutput {
  return {
    decision: `COO review: "${input.task.title}" — defined operating process`,
    reasoning: "Claude CLI unavailable; returning deterministic COO analysis placeholder.",
    next_action: "Draft SOP document and delivery cadence for team review.",
    risk_level: "D2",
    requires_founder_approval: false,
  };
}
