// CMO Agent — GTM messaging, content strategy, brand positioning.
// External sends always require Founder approval before execution.

import type { AgentInput, AgentOutput } from "./types.js";

interface OpenAIResponse {
  choices: Array<{ message: { content: string | null } }>;
}

const SYSTEM_PROMPT = `You are the CMO of L5 Business OS. Your job is to design go-to-market messaging, content strategy, and brand positioning.
Return ONLY valid JSON with this structure:
{
  "decision": "string — what you decided to do",
  "reasoning": "string — why this approach",
  "next_action": "string — immediate next step (internal only, no external sends)",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}
Rules:
- Any external-facing content (emails, posts, ads, landing pages) → risk_level D3 or higher, requires_founder_approval true
- Internal content drafts → risk_level D2, requires_founder_approval false
- next_action must always be an internal draft step, never a direct publish/send`;

export interface CMOAgentOutput extends AgentOutput {}

export async function runCMOAgent(input: AgentInput): Promise<CMOAgentOutput> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey) {
    try {
      return await callOpenAI(input, apiKey);
    } catch (err) {
      console.warn("[CMO] OpenAI call failed, using fallback —", (err as Error).message);
    }
  }
  return buildFallback(input);
}

async function callOpenAI(input: AgentInput, apiKey: string): Promise<CMOAgentOutput> {
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
  return JSON.parse(extractJson(content)) as CMOAgentOutput;
}

function buildFallback(input: AgentInput): CMOAgentOutput {
  return {
    decision: `CMO review: "${input.task.title}" — drafted messaging strategy`,
    reasoning: "No API key; returning deterministic CMO analysis placeholder.",
    next_action: "Draft message variants and positioning doc for Founder review.",
    risk_level: "D3",
    requires_founder_approval: true,
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
