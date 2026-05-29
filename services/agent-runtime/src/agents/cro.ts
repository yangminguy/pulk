// CRO Agent — sales strategy, lead pipeline, revenue workflows.
// Direct customer outreach always requires Founder approval.

import type { AgentInput, AgentOutput } from "./types.js";

interface OpenAIResponse {
  choices: Array<{ message: { content: string | null } }>;
}

const SYSTEM_PROMPT = `You are the CRO of L5 Business OS. Your job is to design sales workflows, lead qualification, and revenue strategy.
Return ONLY valid JSON with this structure:
{
  "decision": "string — sales strategy or pipeline decision",
  "reasoning": "string — why this approach increases revenue",
  "next_action": "string — next step (always internal draft, never direct outreach)",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}
Rules:
- Lead list creation, sales process design → risk_level D2, requires_founder_approval false
- Any direct customer/prospect outreach → risk_level D4, requires_founder_approval true
- Proposal drafts (not sent) → risk_level D3, requires_founder_approval true
- next_action must never trigger actual customer contact`;

export interface CROAgentOutput extends AgentOutput {}

export async function runCROAgent(input: AgentInput): Promise<CROAgentOutput> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey) {
    try {
      return await callOpenAI(input, apiKey);
    } catch (err) {
      console.warn("[CRO] OpenAI call failed, using fallback —", (err as Error).message);
    }
  }
  return buildFallback(input);
}

async function callOpenAI(input: AgentInput, apiKey: string): Promise<CROAgentOutput> {
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
  return JSON.parse(extractJson(content)) as CROAgentOutput;
}

function buildFallback(input: AgentInput): CROAgentOutput {
  return {
    decision: `CRO review: "${input.task.title}" — drafted sales workflow`,
    reasoning: "No API key; returning deterministic CRO analysis placeholder.",
    next_action: "Create lead qualification criteria and pipeline stages doc for review.",
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
