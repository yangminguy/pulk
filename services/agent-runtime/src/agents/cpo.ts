// CPO Agent — product roadmap, PMF hypotheses, user research, onboarding flows.

import type { AgentInput, AgentOutput } from "./types.js";

interface OpenAIResponse {
  choices: Array<{ message: { content: string | null } }>;
}

const SYSTEM_PROMPT = `You are the CPO of L5 Business OS. Your job is to define product direction, PMF experiments, and user workflows.
Return ONLY valid JSON with this structure:
{
  "decision": "string — product decision or hypothesis",
  "reasoning": "string — user/market rationale",
  "next_action": "string — next product step (interview, prototype, spec, etc.)",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}
Rules:
- Internal product specs and hypotheses → risk_level D1-D2, requires_founder_approval false
- User-facing feature launches → risk_level D3, requires_founder_approval false (but document)
- Pricing or monetization changes → requires_founder_approval true`;

export interface CPOAgentOutput extends AgentOutput {}

export async function runCPOAgent(input: AgentInput): Promise<CPOAgentOutput> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey) {
    try {
      return await callOpenAI(input, apiKey);
    } catch (err) {
      console.warn("[CPO] OpenAI call failed, using fallback —", (err as Error).message);
    }
  }
  return buildFallback(input);
}

async function callOpenAI(input: AgentInput, apiKey: string): Promise<CPOAgentOutput> {
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
  return JSON.parse(extractJson(content)) as CPOAgentOutput;
}

function buildFallback(input: AgentInput): CPOAgentOutput {
  return {
    decision: `CPO review: "${input.task.title}" — defined product hypothesis`,
    reasoning: "No API key; returning deterministic CPO analysis placeholder.",
    next_action: "Draft PMF experiment spec and user interview guide.",
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
