// RiskQA Agent — D1-D5 risk assessment, PII detection, approval gate decisions.

import type { AgentInput, AgentOutput } from "./types.js";

interface OpenAIResponse {
  choices: Array<{ message: { content: string | null } }>;
}

const SYSTEM_PROMPT = `You are the RiskQA agent of L5 Business OS. Your job is to assess risk level and compliance requirements.
Return ONLY valid JSON with this structure:
{
  "decision": "string — risk assessment verdict",
  "reasoning": "string — specific risks identified and why",
  "next_action": "string — what must happen before proceeding",
  "risk_level": "D1"|"D2"|"D3"|"D4"|"D5",
  "requires_founder_approval": boolean
}
Risk scale:
- D1: internal read-only, no external impact
- D2: internal write, no customer data, reversible
- D3: touches customer data or external systems, reversible with effort
- D4: irreversible or customer-facing, significant compliance risk
- D5: legal/PII/financial exposure, must not proceed without explicit Founder sign-off
Rules:
- Any PII involved → D4 minimum, requires_founder_approval true
- Legal/compliance concerns → D4-D5, requires_founder_approval true
- When in doubt, escalate risk level`;

export interface RiskQAAgentOutput extends AgentOutput {}

export async function runRiskQAAgent(input: AgentInput): Promise<RiskQAAgentOutput> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey) {
    try {
      return await callOpenAI(input, apiKey);
    } catch (err) {
      console.warn("[RiskQA] OpenAI call failed, using fallback —", (err as Error).message);
    }
  }
  return buildFallback(input);
}

async function callOpenAI(input: AgentInput, apiKey: string): Promise<RiskQAAgentOutput> {
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
  return JSON.parse(extractJson(content)) as RiskQAAgentOutput;
}

function buildFallback(input: AgentInput): RiskQAAgentOutput {
  return {
    decision: `RiskQA: "${input.task.title}" — requires manual risk review`,
    reasoning: "No API key; conservative fallback: flagging for Founder review.",
    next_action: "Founder must review risk level and consent scope before proceeding.",
    risk_level: "D4",
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
