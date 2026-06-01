// CEO review of an executive's work product.
//
// After an executive (Haiku) produces a work product, the CEO (Haiku) reviews
// it and decides the outcome. This is the CEO↔executive communication loop —
// the founder is NOT in it, except for the two hard gates (outbound / payment).

import type { LLMClient } from './types';
import type { AgentOutput } from '../executive-runtime/protocol';
import type { AgentTask } from '../../types/orchestration';

export type CEODecision = 'approve' | 'revise' | 'escalate_founder';

export interface CEOReviewVerdict {
  /** approve = work is done & sound; revise = CEO gives direction, work finalized with it; escalate_founder = outbound/payment gate. */
  decision: CEODecision;
  /** CEO's review note (Korean) — recorded on the handoff so the chain is visible. */
  ceo_note: string;
  /** Present only when decision = escalate_founder: why the founder must look (outbound/payment). */
  founder_reason?: string;
}

const SYSTEM_PROMPT = `You are the CEO Agent of L5 Business OS, an AI-run company. One of your executives just produced a work product for a task you assigned. Review it and decide the outcome.

Return ONLY valid JSON (no markdown, no prose outside JSON):
{
  "decision": "approve" | "revise" | "escalate_founder",
  "ceo_note": string,            // your review note
  "founder_reason": string | null // ONLY when decision = "escalate_founder"
}

Decision rules:
- "approve": the work is complete and sound. The task is DONE. Record a short note on what is good / how it advances the goal.
- "revise": the work is basically usable but the executive hit ambiguity or needs your judgment. Give concrete direction in ceo_note; the executive's result is FINALIZED with your direction (task is done, with your steer). Use this for normal CEO↔executive course-correction — it does NOT involve the founder.
- "escalate_founder": choose this ONLY when actually completing the work requires (1) sending a message/document OUT to a customer/partner/public, or (2) spending money / paying / signing a contract. Set founder_reason to which gate applies. NOTHING ELSE escalates to the founder. A high internal risk_level does NOT escalate — you handle internal risk yourself.

You judge autonomously and approve most internal work. Only the two hard gates above reach the founder.

[OUTPUT LANGUAGE — STRICT]
ceo_note and founder_reason MUST be written in 한국어. JSON keys and enum values stay English.`;

// LLMs sometimes wrap JSON in prose or fences; extract the first JSON object.
function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s === -1 || e <= s) throw new Error('CEO review: no JSON object found');
  return raw.slice(s, e + 1);
}

const VALID_DECISIONS = new Set<CEODecision>(['approve', 'revise', 'escalate_founder']);

export function parseReviewVerdict(raw: string): CEOReviewVerdict {
  const obj = JSON.parse(extractJson(raw).replace(/:\s*undefined\b/g, ': null'));
  const decision: CEODecision = VALID_DECISIONS.has(obj.decision) ? obj.decision : 'approve';
  const verdict: CEOReviewVerdict = {
    decision,
    ceo_note: typeof obj.ceo_note === 'string' && obj.ceo_note ? obj.ceo_note : '검토 완료.',
  };
  if (decision === 'escalate_founder' && typeof obj.founder_reason === 'string' && obj.founder_reason) {
    verdict.founder_reason = obj.founder_reason;
  }
  return verdict;
}

/**
 * CEO reviews an executive's work product and returns a verdict.
 * Pure of NocoBase — testable in isolation with a stub LLMClient.
 */
export async function reviewExecutiveOutput(
  task: AgentTask,
  output: AgentOutput,
  llm: LLMClient
): Promise<CEOReviewVerdict> {
  const userPrompt =
    `Task (id=${task.id}): ${task.title}\n` +
    `Expected output: ${task.expected_output}\n` +
    `Assigned executive: ${task.assigned_agent}\n\n` +
    `Executive's work product:\n` +
    `- goal: ${output.goal}\n` +
    `- recommendation (deliverable): ${output.recommendation}\n` +
    `- action_items: ${output.action_items.join('; ')}\n` +
    `- bottleneck: ${output.bottleneck || '(none)'}\n` +
    `- internal risk_level: ${output.risk_level}\n` +
    `- executive flagged outbound/payment: ${output.approval_required}\n` +
    `- confidence: ${output.confidence_level}\n\n` +
    `Review and return JSON only.`;

  const raw = await llm.complete({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    trace_name: 'ceo.reviewExecutiveOutput',
    trace_metadata: { task_id: task.id, role: task.assigned_agent },
  });

  const verdict = parseReviewVerdict(raw);

  // Safety net: if the executive genuinely flagged outbound/payment, the founder
  // gate must fire regardless of what the CEO returned.
  if (output.approval_required && verdict.decision !== 'escalate_founder') {
    return {
      decision: 'escalate_founder',
      ceo_note: verdict.ceo_note,
      founder_reason: verdict.founder_reason ?? '외부 발신 또는 결제가 포함되어 파운더 확인이 필요합니다.',
    };
  }
  return verdict;
}
