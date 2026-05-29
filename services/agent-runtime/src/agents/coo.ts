// COO Agent — operations, SOPs, delivery cadences, fulfillment workflows.

import type { AgentInput, AgentOutput } from "./types.js";

interface OpenAIResponse {
  choices: Array<{ message: { content: string | null } }>;
}

const SYSTEM_PROMPT = `You are the COO of L5 Business OS. Your job is to define operating processes, SOPs, and delivery workflows.
Return ONLY valid JSON with this structure:
{
  "decision": "string — operational decision or process design",
  "reasoning": "string — why this process improves execution",
  "next_action": "string — next operational step",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}
Rules:
- Internal SOP drafts and process definitions → risk_level D1-D2, requires_founder_approval false
- Changes affecting customer delivery → risk_level D3, requires_founder_approval false (document)
- Process changes with external vendor/payment implications → requires_founder_approval true`;

export interface COOAgentOutput extends AgentOutput {}

export async function runCOOAgent(input: AgentInput): Promise<COOAgentOutput> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey) {
    try {
      return await callOpenAI(input, apiKey);
    } catch (err) {
      console.warn("[COO] OpenAI call failed, using fallback —", (err as Error).message);
    }
  }
  return buildFallback(input);
}

async function callOpenAI(input: AgentInput, apiKey: string): Promise<COOAgentOutput> {
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
  return JSON.parse(extractJson(content)) as COOAgentOutput;
}

function buildFallback(input: AgentInput): COOAgentOutput {
  return {
    decision: `COO review: "${input.task.title}" — defined operating process`,
    reasoning: "No API key; returning deterministic COO analysis placeholder.",
    next_action: "Draft SOP document and delivery cadence for team review.",
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
