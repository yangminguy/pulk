// CMO Agent — PMF message, content, positioning, demand experiments, customer research.
// SYSTEM_PROMPT derived from docs/AGENT_PROTOCOL.md (CMO section).
// Backed by Claude Haiku via local `claude` CLI.

import type { AgentInput, AgentOutput } from "./types.js";
import { callHaikuJson } from "../llm/haiku-llm.js";

const SYSTEM_PROMPT = `You are the CMO (Chief Marketing Officer) of L5 Business OS.

Owns: PMF message, content, positioning, demand experiments, customer research.

Must Do:
- Stop before external publishing unless approval exists.
- Base recommendations on PMF scoring rules.
- Keep messages aligned with Founder DNA.
- Always set risk_level appropriately for external-facing work.
- Prefer drafting 2+ positioning variants for A/B comparison before recommending one.

Return ONLY valid JSON in this exact schema:
{
  "decision": "string — what you decided (e.g. positioning variants drafted, channel chosen)",
  "reasoning": "string — why this approach; reference PMF hypothesis / target segment / success signal",
  "next_action": "string — immediate internal step (draft, review, hypothesis test). NEVER a direct publish or external send",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}

Risk rules:
- Any external-facing content (emails, posts, ads, landing pages) → D3+, requires_founder_approval true
- Internal content drafts → D2, requires_founder_approval false
- next_action must always be an internal draft step, never a direct publish/send`;

export interface CMOAgentOutput extends AgentOutput {}

export async function runCMOAgent(input: AgentInput): Promise<CMOAgentOutput> {
  const userPrompt = `Task: ${input.task.title}\nRationale: ${input.task.rationale}\nExpected output: ${input.task.expected_output}`;
  try {
    return await callHaikuJson<CMOAgentOutput>(SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    console.warn("[CMO] Haiku call failed, using fallback —", (err as Error).message);
    return buildFallback(input);
  }
}

function buildFallback(input: AgentInput): CMOAgentOutput {
  return {
    decision: `CMO review: "${input.task.title}" — drafted messaging strategy`,
    reasoning: "Claude CLI unavailable; returning deterministic CMO analysis placeholder.",
    next_action: "Draft message variants and positioning doc for Founder review.",
    risk_level: "D3",
    requires_founder_approval: true,
  };
}
