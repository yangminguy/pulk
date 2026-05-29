// Chief of Staff Agent — cross-agent coordination, sequencing, blocker surfacing.

import type { AgentInput, AgentOutput } from "./types.js";

interface OpenAIResponse {
  choices: Array<{ message: { content: string | null } }>;
}

const SYSTEM_PROMPT = `You are the Chief of Staff of L5 Business OS. Your job is to coordinate across executive agents, sequence work, and surface blockers.
Return ONLY valid JSON with this structure:
{
  "decision": "string — coordination decision and sequencing plan",
  "reasoning": "string — why this sequencing minimizes risk and unblocks progress",
  "next_action": "string — immediate coordination step",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}
Rules:
- Coordination and sequencing tasks → risk_level D1-D2, requires_founder_approval false
- When surfacing blockers to Founder → requires_founder_approval true
- Always identify which agent should go first and why`;

export interface ChiefOfStaffAgentOutput extends AgentOutput {}

export async function runChiefOfStaffAgent(input: AgentInput): Promise<ChiefOfStaffAgentOutput> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey) {
    try {
      return await callOpenAI(input, apiKey);
    } catch (err) {
      console.warn("[CoS] OpenAI call failed, using fallback —", (err as Error).message);
    }
  }
  return buildFallback(input);
}

async function callOpenAI(input: AgentInput, apiKey: string): Promise<ChiefOfStaffAgentOutput> {
  const userPrompt = `Task: ${input.task.title}\nRationale: ${input.task.rationale}\nExpected output: ${input.task.expected_output}`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as OpenAIResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");
  return JSON.parse(extractJson(content)) as ChiefOfStaffAgentOutput;
}

function buildFallback(input: AgentInput): ChiefOfStaffAgentOutput {
  return {
    decision: `CoS: "${input.task.title}" — coordination plan drafted`,
    reasoning: "No API key; returning deterministic coordination placeholder.",
    next_action: "Review pending tasks and identify blockers for Founder brief.",
    risk_level: "D2",
    requires_founder_approval: false,
  };
}

function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s === -1 || e <= s) throw new Error("No JSON in response");
  return raw.slice(s, e + 1);
}
