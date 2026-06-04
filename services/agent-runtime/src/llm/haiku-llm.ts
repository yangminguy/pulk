// Shared Claude Haiku LLM helper for executive agents (COO/CFO/CMO/CPO/CRO/RiskQA/ChiefOfStaff).
// Uses the local `claude` CLI (claude-haiku-4-5) — no API key required.

import { createClaudeCLIClient } from "@l5/core";

const client = createClaudeCLIClient({ model: "haiku" });

// All founder-facing fields (decision/reasoning/next_action and any free-text)
// must be Korean. JSON keys + technical identifiers stay English.
const KO_OUTPUT_RULE = `

[OUTPUT LANGUAGE — STRICT]
All free-text values in your JSON response (decision, reasoning, next_action, summaries, notes) MUST be written in 한국어. The JSON keys, enum values (e.g. "approve" / "D1"-"D5"), and technical identifiers (file paths, function names) stay in English. This output is read by a Korean founder; English prose is not acceptable.`;

// Self-healing: a malformed-JSON or empty response is the most common failure mode for
// a Haiku call. Retry once with explicit corrective context BEFORE bubbling up to the
// caller's buildFallback. Anything that survives both attempts is a real failure and
// should reach the agent's fallback (which marks the task as needing founder review).
export async function callHaikuJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const fullSystem = systemPrompt + KO_OUTPUT_RULE;
  try {
    const content = await client.complete({ system: fullSystem, user: userPrompt });
    return JSON.parse(extractJson(content)) as T;
  } catch (err) {
    const errMsg = (err as Error).message.slice(0, 200);
    const retryUser =
      `${userPrompt}\n\n` +
      `[이전 응답 실패 — error: ${errMsg}]\n` +
      `반드시 위 스키마를 따르는 valid JSON 1개만 응답하세요. 마크다운/주석/설명 금지. ` +
      `자유 텍스트 필드는 한국어로 작성하세요.`;
    const content = await client.complete({ system: fullSystem, user: retryUser });
    return JSON.parse(extractJson(content)) as T;
  }
}

function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s === -1 || e <= s) throw new Error("No JSON in response");
  return raw.slice(s, e + 1);
}
