// Executive LLM runner — turns a queued task into a REAL work product via Haiku.
//
// This replaces the deterministic stub handlers for live execution. Each
// executive role gets a focused prompt describing its mandate; the LLM returns
// a structured AgentOutput (the actual analysis/plan/draft/assessment for the
// role). The sync stub handlers remain for offline/back-compat callers.

import type { LLMClient } from '../ceo-orchestration/types';
import type { AgentRole } from '../../types/orchestration';
import type { AgentOutput, HandlerInput, HandlerResult } from './protocol';
import { buildHandoff } from './protocol';

interface RoleDef {
  /** Short mandate describing what real work this executive produces. */
  mandate: string;
}

// Role mandates. English is fine here (inter-agent/internal), but the LLM is
// instructed below to write founder-readable free text in Korean.
const ROLE_DEFS: Partial<Record<AgentRole, RoleDef>> = {
  CEO: { mandate: 'Set direction and make the final call across the company.' },
  CMO: { mandate: 'Own growth, brand, and demand. Produce concrete marketing analysis, positioning, channel and campaign plans.' },
  CRO: { mandate: 'Own revenue, sales, and conversion. Produce funnel analysis, pricing/sales-motion recommendations, and concrete experiments.' },
  CPO: { mandate: 'Own product and UX. Produce product direction, prioritized scope, and validation plans grounded in user value.' },
  COO: { mandate: 'Own operations and process. Produce process maps, automation/streamlining plans, and execution checklists.' },
  CFO: { mandate: 'Own finance and unit economics. Produce models, budget/burn analysis, and viability assessments.' },
  CTO: { mandate: 'Own technology. Produce technical plans, architecture decisions, and build sequencing.' },
  RiskQA: { mandate: 'Own risk, compliance, and QA. Produce risk assessments, severity, and mitigation plans.' },
  ChiefOfStaff: { mandate: 'Own coordination and prioritization. Produce dependency maps, sequencing, and resource allocation.' },
};

function buildSystemPrompt(role: AgentRole): string {
  const def = ROLE_DEFS[role] ?? ROLE_DEFS.ChiefOfStaff;
  const mandate = def?.mandate ?? 'Do the real work for this task and produce a finished deliverable.';
  return `You are the ${role} of L5 Business OS, an AI-run company. ${mandate}

You have been handed a task by the CEO. Do the REAL work for this task now: actually analyze, plan, draft, or assess — do not merely describe that work is "required". Your output is a finished work product the CEO will review.

Return ONLY valid JSON matching this schema (no markdown, no prose outside JSON):
{
  "current_situation": string,        // what is actually going on, grounded in the task
  "goal": string,                     // the concrete outcome you are producing
  "why_now": string,
  "bottleneck": string,               // the real blocker you found, "" if none
  "root_cause": string,
  "options": string[],                // options you genuinely considered
  "recommendation": string,           // your decision / the substantive work product
  "action_items": string[],           // concrete next steps you produced
  "insight_to_record": string,        // reusable insight, no customer PII
  "workflow_improvement_suggestion": string,
  "confidence_level": "low" | "medium" | "high",
  "risk_level": "D1" | "D2" | "D3" | "D4" | "D5",   // INTERNAL severity only
  "needs_outbound_or_payment": boolean // true ONLY if completing this requires sending a message/document OUT to a customer/partner/public, OR spending money / paying / signing a contract
}

Rules:
- Produce substantive, role-specific work. The "recommendation" + "action_items" must be the actual deliverable, not a promise to deliver later.
- risk_level is an INTERNAL signal. It NEVER requires founder approval on its own.
- needs_outbound_or_payment: set true ONLY for genuine outbound-customer/partner/public messages or real payments/spending. Internal planning, research, prototypes, technical builds, infra — all false.
- Never invent customer PII. Never include secrets.

[OUTPUT LANGUAGE — STRICT]
All free-text string values (current_situation, goal, why_now, bottleneck, root_cause, options[], recommendation, action_items[], insight_to_record, workflow_improvement_suggestion) MUST be written in 한국어. JSON keys, enum values, and identifiers stay English.`;
}

interface RawExecutiveOutput {
  current_situation: string;
  goal: string;
  why_now: string;
  bottleneck: string;
  root_cause: string;
  options: string[];
  recommendation: string;
  action_items: string[];
  insight_to_record: string;
  workflow_improvement_suggestion: string;
  confidence_level: 'low' | 'medium' | 'high';
  risk_level: AgentOutput['risk_level'];
  needs_outbound_or_payment: boolean;
}

const VALID_RISK = new Set(['D1', 'D2', 'D3', 'D4', 'D5']);
const VALID_CONF = new Set(['low', 'medium', 'high']);

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

// LLMs sometimes wrap JSON in prose or fences; extract the first JSON object.
function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s === -1 || e <= s) throw new Error('executive output: no JSON object found');
  return raw.slice(s, e + 1);
}

function parseExecutiveOutput(raw: string): RawExecutiveOutput {
  const obj = JSON.parse(extractJson(raw).replace(/:\s*undefined\b/g, ': null'));
  if (typeof obj.recommendation !== 'string' || !obj.recommendation) {
    throw new Error('executive output: missing recommendation');
  }
  return {
    current_situation: String(obj.current_situation ?? ''),
    goal: String(obj.goal ?? ''),
    why_now: String(obj.why_now ?? ''),
    bottleneck: String(obj.bottleneck ?? ''),
    root_cause: String(obj.root_cause ?? ''),
    options: asStringArray(obj.options),
    recommendation: obj.recommendation,
    action_items: asStringArray(obj.action_items),
    insight_to_record: String(obj.insight_to_record ?? ''),
    workflow_improvement_suggestion: String(obj.workflow_improvement_suggestion ?? ''),
    confidence_level: VALID_CONF.has(obj.confidence_level) ? obj.confidence_level : 'medium',
    risk_level: VALID_RISK.has(obj.risk_level) ? obj.risk_level : 'D2',
    needs_outbound_or_payment: Boolean(obj.needs_outbound_or_payment),
  };
}

/**
 * Run an executive agent against a task using the LLM and return a real
 * HandlerResult. The CEO review loop (reviewExecutiveOutput) decides the final
 * status; this function returns status 'completed' as the executive's own view.
 */
export async function runExecutive(input: HandlerInput, llm: LLMClient): Promise<HandlerResult> {
  const { task } = input;
  const role = task.assigned_agent;

  const userPrompt =
    `Task (id=${task.id}):\n` +
    `- title: ${task.title}\n` +
    `- expected_output: ${task.expected_output}\n` +
    `- rationale / source instruction: ${task.rationale}\n\n` +
    `Do the real work now and return JSON only.`;

  const rawText = await llm.complete({
    system: buildSystemPrompt(role),
    user: userPrompt,
    trace_name: `executive.${role}.run`,
    trace_metadata: { task_id: task.id, role },
  });

  const parsed = parseExecutiveOutput(rawText);

  // Founder gate fires ONLY for genuine outbound/payment — never on risk level.
  const approval_required = parsed.needs_outbound_or_payment;

  const output: AgentOutput = {
    current_situation: parsed.current_situation || `${role} reviewed: ${task.title}`,
    source_instruction: task.rationale,
    goal: parsed.goal || task.expected_output,
    why_now: parsed.why_now,
    bottleneck: parsed.bottleneck,
    root_cause: parsed.root_cause,
    options: parsed.options,
    recommendation: parsed.recommendation,
    action_items: parsed.action_items.length ? parsed.action_items : [parsed.recommendation],
    next_owner: 'ceo',
    required_tools: [],
    approval_required,
    insight_to_record: parsed.insight_to_record,
    workflow_improvement_suggestion: parsed.workflow_improvement_suggestion,
    confidence_level: parsed.confidence_level,
    risk_level: parsed.risk_level,
  };

  return {
    status: 'completed',
    created_tasks: [],
    approval_required,
    blocked: false,
    reason: `${role} produced work product`,
    risk_level: parsed.risk_level,
    source_ref: task.source_ref,
    output,
    updated_status: 'running',
    handoff: buildHandoff(task, output, {
      what_was_completed: output.recommendation,
      what_remains_open: output.bottleneck || 'CEO review',
      why_next_agent_needed: 'CEO reviews the work product and decides completion',
      must_not_lose: output.insight_to_record || output.goal,
    }),
  };
}
