// Chief of Staff — Founder Synthesis Deliverable (P1.1).
//
// After every executive task of one founder instruction reaches a terminal
// status, the Chief of Staff synthesizes ONE founder-facing deliverable from the
// collected task outputs + handoffs.
//
// Pure l5-core: no NocoBase, no direct I/O. The LLM transport is injected via
// LLMClient so this is fully testable offline. The per-agent `contributions[]`
// list is CODE-owned — the LLM only fills each `summary` text and can never
// corrupt the structure (agent / status / task_title). A deterministic non-LLM
// fallback keeps the card deliverable even when the model is down.
// See docs/specs/P1-synthesis.md §2.

import type { LLMClient } from '../ceo-orchestration/types';
import type { AgentTask, AgentHandoff, AgentRole } from '../../types/orchestration';

export interface TaskOutcome {
  task: Pick<
    AgentTask,
    'id' | 'assigned_agent' | 'title' | 'expected_output' | 'status' | 'risk_level'
  >;
  /** The executive work-product handoff (from_agent === assigned_agent), if present. */
  work_handoff?: Pick<
    AgentHandoff,
    'what_was_completed' | 'what_remains_open' | 'next_action' | 'context'
  >;
  /** The CEO review handoff (from_agent === 'CEO'), if present. */
  ceo_handoff?: Pick<AgentHandoff, 'what_was_completed' | 'next_action' | 'blocker'>;
  /**
   * The executive's full work product (agent_tasks.output). This is the real
   * deliverable — recommendation, options, action items — and is what the
   * founder needs to judge the result. Inlined (not the AgentOutput type) to
   * keep this module free of executive-runtime imports.
   */
  output?: {
    goal?: string;
    bottleneck?: string;
    recommendation?: string;
    options?: string[];
    action_items?: string[];
    insight_to_record?: string;
    current_situation?: string;
  };
}

export interface SynthesisInput {
  instruction_text: string; // founder_instructions.raw_text
  ceo_goal: string; // ceo_interpretations.goal
  outcomes: TaskOutcome[]; // one per non-killed task, in creation order
}

export interface Contribution {
  agent: AgentRole;
  task_id: string; // so the founder can open this exec's full work in the inbox
  task_title: string;
  summary: string; // 1–2 sentence Korean summary of what this agent delivered
  status: AgentTask['status']; // 'done' | 'killed'
}

export type NextActionKind = 'approve' | 'delegate' | 'hold';
export interface NextAction {
  kind: NextActionKind;
  label: string; // Korean button label
  /** For 'delegate': which agent the gap should route to. Optional otherwise. */
  target_agent?: AgentRole;
  /** Short Korean reason shown under the button. */
  reason: string;
}

export interface SynthesisResult {
  decision_summary: string; // Korean, 2–4 sentences: what was decided/produced overall
  contributions: Contribution[];
  open_gaps: string[]; // Korean bullets: unresolved questions / missing pieces
  next_actions: NextAction[]; // 1–3, always includes one 'approve' and one 'hold'
}

const SYSTEM_PROMPT = `You are the Chief of Staff of L5 Business OS. The CEO assigned several executives to one founder instruction; they have all finished. Synthesize ONE founder-facing deliverable.

Return ONLY valid JSON (no markdown, no prose outside JSON):
{
  "decision_summary": string,           // 한국어 2-4문장: 전체적으로 무엇이 결정/산출되었는가
  "contribution_summaries": [           // 입력 task 순서와 1:1, 같은 길이
    { "task_id": string, "summary": string }   // 한국어 1-2문장
  ],
  "open_gaps": string[],                // 한국어, 미해결 질문/누락. 없으면 []
  "next_actions": [                     // 1-3개
    { "kind": "approve"|"delegate"|"hold",
      "label": string, "target_agent": string|null, "reason": string }
  ]
}
Rules:
- decision_summary: 파운더가 다음 세션으로 넘어갈 수 있게 핵심 판단을 요약. 각 임원의 '핵심 산출물(권고)'·'실행 항목'을 근거로 구체적으로.
- contribution_summary: 각 임원이 실제로 내놓은 '핵심 산출물(권고)'·'실행 항목'의 **구체적 내용**을 담아라. "완료했으나 구체적 결과가 명시되지 않음" 같은 메타 설명은 금지 — 입력에 제공된 권고/선택지/실행 항목을 그대로 요약하라.
- next_actions는 'approve'(이대로 채택)와 'hold'(보류) 두 가지만 둔다. 추가 작업이 필요해 보여도 여기서 새 작업을 만들지 마라(파운더가 채팅으로 직접 지시한다). open_gaps는 남은 공백으로 '서술'만 하고 새 task로 위임하지 않는다.
[OUTPUT LANGUAGE — STRICT] 모든 문자열 값은 한국어. JSON 키/enum 값은 영어.`;

const VALID_AGENT_ROLES = new Set<AgentRole>([
  'CEO',
  'ChiefOfStaff',
  'CMO',
  'CRO',
  'CPO',
  'CTO',
  'COO',
  'CFO',
  'RiskQA',
  'Culture',
]);

const VALID_KINDS = new Set<NextActionKind>(['approve', 'delegate', 'hold']);

const DEFAULT_APPROVE: NextAction = {
  kind: 'approve',
  label: '이대로 채택',
  reason: '산출물을 그대로 채택하고 마무리합니다.',
};
const DEFAULT_HOLD: NextAction = {
  kind: 'hold',
  label: '보류',
  reason: '보류하고 나중에 결정합니다.',
};

// LLMs sometimes wrap JSON in prose or fences; extract the first JSON object.
// (Copied locally from review.ts per spec §2.3 — no over-abstraction.)
function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s === -1 || e <= s) throw new Error('synthesis: no JSON object found');
  return raw.slice(s, e + 1);
}

// Build the code-owned contributions skeleton: one per outcome, with structure
// (agent / status / task_title) the LLM cannot touch. `summary` is a placeholder
// filled later by the model (or by the fallback chain).
function buildContributions(outcomes: TaskOutcome[]): Contribution[] {
  return outcomes.map((o) => ({
    agent: o.task.assigned_agent,
    task_id: o.task.id,
    task_title: o.task.title,
    status: o.task.status,
    summary: '',
  }));
}

// Default summary when the LLM provides none: prefer the real work product
// (the executive's recommendation), then the handoff note, then current
// situation, so the card shows substance rather than '(요약 없음)'.
function fallbackSummary(o: TaskOutcome): string {
  return (
    o.output?.recommendation?.trim() ||
    o.work_handoff?.what_was_completed?.trim() ||
    o.output?.current_situation?.trim() ||
    '(요약 없음)'
  );
}

function gapsFromOutcomes(outcomes: TaskOutcome[]): string[] {
  return outcomes
    .map((o) => o.work_handoff?.what_remains_open?.trim())
    .filter((g): g is string => !!g);
}

// Ensure next_actions always contains exactly one approve + one hold, with any
// valid delegate actions preserved. Clamps to the allowed enum.
function normalizeNextActions(raw: unknown): NextAction[] {
  const cleaned: NextAction[] = [];
  if (Array.isArray(raw)) {
    for (const a of raw) {
      if (!a || typeof a !== 'object') continue;
      const kind = (a as { kind?: unknown }).kind;
      if (typeof kind !== 'string' || !VALID_KINDS.has(kind as NextActionKind)) continue;
      const label = (a as { label?: unknown }).label;
      const reason = (a as { reason?: unknown }).reason;
      const target = (a as { target_agent?: unknown }).target_agent;
      const action: NextAction = {
        kind: kind as NextActionKind,
        label: typeof label === 'string' && label ? label : defaultLabel(kind as NextActionKind),
        reason: typeof reason === 'string' && reason ? reason : '',
      };
      if (
        action.kind === 'delegate' &&
        typeof target === 'string' &&
        VALID_AGENT_ROLES.has(target as AgentRole)
      ) {
        action.target_agent = target as AgentRole;
      }
      cleaned.push(action);
    }
  }
  // Only approve + hold. We intentionally DROP 'delegate' here: spawning a brand
  // new task from the synthesis card surprised the founder ("I wanted to see the
  // existing result in detail, not create more work"). The founder reads each
  // exec's full output in the inbox (click a contribution) and issues new
  // instructions explicitly via chat when needed.
  const approve = cleaned.find((a) => a.kind === 'approve') ?? DEFAULT_APPROVE;
  const hold = cleaned.find((a) => a.kind === 'hold') ?? DEFAULT_HOLD;
  return [approve, hold];
}

function defaultLabel(kind: NextActionKind): string {
  if (kind === 'approve') return DEFAULT_APPROVE.label;
  if (kind === 'hold') return DEFAULT_HOLD.label;
  return '위임';
}

// Deterministic, no-LLM result. Used when the model throws or its output is
// unrecoverable so the founder always gets a usable card.
function buildFallback(input: SynthesisInput): SynthesisResult {
  const { outcomes, ceo_goal } = input;
  const doneCount = outcomes.filter((o) => o.task.status === 'done').length;
  const contributions = buildContributions(outcomes).map((c, i) => ({
    ...c,
    summary: fallbackSummary(outcomes[i]),
  }));
  return {
    decision_summary: `${ceo_goal} — ${doneCount}개 작업 완료`.trim(),
    contributions,
    open_gaps: gapsFromOutcomes(outcomes),
    next_actions: [DEFAULT_APPROVE, DEFAULT_HOLD],
  };
}

function buildUserPrompt(input: SynthesisInput): string {
  const lines: string[] = [
    `# 파운더 지시\n${input.instruction_text}`,
    `# CEO 목표\n${input.ceo_goal}`,
    `# 작업 결과 (순서대로 ${input.outcomes.length}개)`,
  ];
  input.outcomes.forEach((o, i) => {
    const out = o.output;
    const opts = out?.options?.length ? out.options.join(' / ') : '(없음)';
    const acts = out?.action_items?.length ? out.action_items.join(' / ') : '(없음)';
    lines.push(
      `\n## 작업 ${i + 1}\n` +
        `- task_id: ${o.task.id}\n` +
        `- agent: ${o.task.assigned_agent}\n` +
        `- title: ${o.task.title}\n` +
        `- expected_output: ${o.task.expected_output}\n` +
        `- status: ${o.task.status}\n` +
        // The real work product — synthesize MUST reflect these concrete results.
        `- 목표: ${out?.goal ?? '(없음)'}\n` +
        `- 핵심 산출물(권고): ${out?.recommendation ?? o.work_handoff?.what_was_completed ?? '(없음)'}\n` +
        `- 검토한 선택지: ${opts}\n` +
        `- 실행 항목: ${acts}\n` +
        `- 병목: ${out?.bottleneck ?? '(없음)'}\n` +
        `- 학습 인사이트: ${out?.insight_to_record ?? '(없음)'}\n` +
        `- what_remains_open: ${o.work_handoff?.what_remains_open ?? '(없음)'}\n` +
        `- ceo_note: ${o.ceo_handoff?.what_was_completed ?? o.ceo_handoff?.next_action ?? '(없음)'}\n` +
        `- ceo_blocker: ${o.ceo_handoff?.blocker ?? '(없음)'}`
    );
  });
  lines.push('\n위 결과를 종합해 JSON으로만 답하십시오.');
  return lines.join('\n');
}

/**
 * Synthesize one founder-facing deliverable from collected task outcomes.
 *
 * The contributions list is built deterministically from `outcomes` BEFORE the
 * LLM call; the model only supplies each contribution's `summary` text (merged
 * by index). Any LLM/parse failure falls back to a deterministic result.
 */
export async function synthesizeDeliverable(
  input: SynthesisInput,
  llm: LLMClient
): Promise<SynthesisResult> {
  // Code-owned structure — independent of whatever the LLM returns.
  const contributions = buildContributions(input.outcomes);

  let raw: string;
  try {
    raw = await llm.complete({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(input),
      trace_name: 'chiefOfStaff.synthesize',
      trace_metadata: { instruction_text_len: input.instruction_text.length },
    });
  } catch {
    return buildFallback(input);
  }

  let obj: {
    decision_summary?: unknown;
    contribution_summaries?: unknown;
    open_gaps?: unknown;
    next_actions?: unknown;
  };
  try {
    obj = JSON.parse(extractJson(raw).replace(/:\s*undefined\b/g, ': null'));
  } catch {
    return buildFallback(input);
  }

  // Merge summaries onto the code-built contributions by index.
  const summaries = Array.isArray(obj.contribution_summaries)
    ? (obj.contribution_summaries as Array<{ summary?: unknown }>)
    : [];
  const mergedContributions = contributions.map((c, i) => {
    const s = summaries[i]?.summary;
    const summary =
      typeof s === 'string' && s.trim() ? s.trim() : fallbackSummary(input.outcomes[i]);
    return { ...c, summary };
  });

  const decision_summary =
    typeof obj.decision_summary === 'string' && obj.decision_summary.trim()
      ? obj.decision_summary.trim()
      : `${input.ceo_goal} — ${input.outcomes.filter((o) => o.task.status === 'done').length}개 작업 완료`.trim();

  const open_gaps = Array.isArray(obj.open_gaps)
    ? (obj.open_gaps as unknown[]).filter((g): g is string => typeof g === 'string' && !!g.trim())
    : [];

  const next_actions = normalizeNextActions(obj.next_actions);

  return {
    decision_summary,
    contributions: mergedContributions,
    open_gaps,
    next_actions,
  };
}
