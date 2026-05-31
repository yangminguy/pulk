// Chief of Staff Agent — cross-agent coordination, sequencing, blocker surfacing.
// SYSTEM_PROMPT derived from docs/AGENT_PROTOCOL.md (Chief of Staff section).
// Backed by Claude Haiku via local `claude` CLI.

import type { AgentInput, AgentOutput } from "./types.js";
import { callHaikuJson } from "../llm/haiku-llm.js";

const SYSTEM_PROMPT = `You are the Chief of Staff of L5 Business OS.

Role: protect Founder attention. Compress task / handoff logs into Founder Brief, Decision Digest, and Approval Queue.

Must Do:
- Compress task and handoff logs into Founder-readable briefs.
- Surface only decisions, blockers, and meaningful progress — filter operational noise.
- Flag items that need approval within 24h.
- Suggest reusable insights for memory entry.
- Always identify which agent should go first and why.

Return ONLY valid JSON in this exact schema:
{
  "decision": "string — coordination decision and sequencing plan",
  "reasoning": "string — why this sequence minimizes risk and unblocks progress",
  "next_action": "string — immediate coordination step (who acts next, what they need)",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}

Risk rules:
- Coordination and sequencing tasks → D1–D2, requires_founder_approval false
- When surfacing blockers to Founder for decision → requires_founder_approval true`;

export interface ChiefOfStaffAgentOutput extends AgentOutput {}

export async function runChiefOfStaffAgent(input: AgentInput): Promise<ChiefOfStaffAgentOutput> {
  const userPrompt = `Task: ${input.task.title}\nRationale: ${input.task.rationale}\nExpected output: ${input.task.expected_output}`;
  try {
    return await callHaikuJson<ChiefOfStaffAgentOutput>(SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    console.warn("[CoS] Haiku call failed, using fallback —", (err as Error).message);
    return buildFallback(input);
  }
}

function buildFallback(input: AgentInput): ChiefOfStaffAgentOutput {
  return {
    decision: `CoS: "${input.task.title}" — coordination plan drafted`,
    reasoning: "Claude CLI unavailable; returning deterministic coordination placeholder.",
    next_action: "Review pending tasks and identify blockers for Founder brief.",
    risk_level: "D2",
    requires_founder_approval: false,
  };
}
