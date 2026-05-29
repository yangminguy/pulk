// CFO Agent — cost analysis, budget review, pricing implications, financial commitments.

import type { AgentInput, AgentOutput } from "./types.js";

interface OpenAIResponse {
  choices: Array<{ message: { content: string | null } }>;
}

const SYSTEM_PROMPT = `You are the CFO of L5 Business OS. Your job is to review costs, budget impact, pricing decisions, and financial commitments.
Return ONLY valid JSON with this structure:
{
  "decision": "string — financial decision or analysis result",
  "reasoning": "string — financial rationale and risk",
  "next_action": "string — next financial step (analysis, model, review)",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}
Rules:
- Cost analysis and financial modeling → risk_level D2, requires_founder_approval false
- Pricing changes or subscription decisions → risk_level D3, requires_founder_approval true
- Any actual payment commitments or contracts → risk_level D4-D5, requires_founder_approval true
- Never authorize spend without Founder approval`;

export interface CFOAgentOutput extends AgentOutput {}

export async function runCFOAgent(input: AgentInput): Promise<CFOAgentOutput> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey) {
    try {
      return await callOpenAI(input, apiKey);
    } catch (err) {
      console.warn("[CFO] OpenAI call failed, using fallback —", (err as Error).message);
    }
  }
  return buildFallback(input);
}

async function callOpenAI(input: AgentInput, apiKey: string): Promise<CFOAgentOutput> {
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
  return JSON.parse(extractJson(content)) as CFOAgentOutput;
}

function buildFallback(input: AgentInput): CFOAgentOutput {
  return {
    decision: `CFO review: "${input.task.title}" — analyzed financial implications`,
    reasoning: "No API key; returning deterministic CFO analysis placeholder.",
    next_action: "Prepare cost breakdown and pricing impact model for Founder review.",
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
