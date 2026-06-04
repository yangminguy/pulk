// D3 Judge — LLM-based autonomous decision gate for D3-risk tasks.
// Replaces the 24h timer auto-approve with per-task CTO reasoning.
// Falls back to deterministic hold when LLM is unavailable.

import type { LLMClient } from '../ceo-orchestration/types';

export type D3Verdict = 'pass' | 'hold' | 'escalate';

export interface D3JudgeInput {
  task: {
    id: string;
    title: string;
    description?: string;
    rationale?: string;
    expected_output?: string;
    risk_level: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
    assigned_agent: string;
    created_at: string;
  };
  context?: {
    business_id?: string;
    parent_handoff?: unknown;
    recent_decisions?: Array<{ task_id: string; verdict: string; rationale: string; at: string }>;
  };
}

export interface D3JudgeResult {
  verdict: D3Verdict;
  rationale: string;
  conditions?: string[];
  used_llm: boolean;
  raw?: string;
}

const VALID_VERDICTS: ReadonlySet<string> = new Set(['pass', 'hold', 'escalate']);

const SYSTEM_PROMPT =
  '당신은 L5 Business OS의 CTO다. 주어진 D3 태스크가 즉시 통과/추가 검토(hold)/Founder 승인(escalate) 중 무엇이 맞는지 판단한다. ' +
  '**반드시 JSON으로만 응답**: `{ "verdict": "pass|hold|escalate", "rationale": "...", "conditions": ["..."] }`. ' +
  '판단 기준: 작업 범위가 단일 모듈 내부이고 외부 의존성이 없으면 pass, 모호하거나 충돌 가능성이 있으면 hold, 회사/매출/외부 사용자에게 영향이 있으면 escalate.';

// Outward-facing / irreversible signals → escalate to Founder regardless of LLM.
const ESCALATE_SIGNAL =
  /매출|revenue|결제|payment|billing|구독|환불|refund|계약|contract|법적|legal|외부\s*(고객|사용자)|external\s+(customer|user)|고객\s*(메시지|이메일|발송)|production|prod\s*deploy|배포|마이그레이션|migration|드롭|drop\s+table|삭제\s*정책|rollback/i;
// Clearly-internal, low-blast-radius signals → safe to auto-pass. Deliberately
// strong/read-only terms only — generic words (test/type/spec) are excluded to
// avoid auto-passing on incidental mentions.
const INTERNAL_SAFE_SIGNAL =
  /조사|분석|비교|리뷰|\breview\b|\bdocs?\b|문서화|리팩터|\brefactor\b|내부\s*유틸|\bhelper\b/i;

/**
 * Deterministic D3 pre-judge. Returns a verdict for clear-cut cases (escalate on
 * outward-facing/irreversible signals, pass on clearly-internal work) so the LLM
 * is only consulted for the genuine gray zone. Returns null when undecided.
 */
export function judgeD3Deterministic(input: D3JudgeInput): D3JudgeResult | null {
  const t = input.task;
  const text = `${t.title} ${t.description ?? ''} ${t.rationale ?? ''} ${t.expected_output ?? ''}`;

  if (ESCALATE_SIGNAL.test(text)) {
    return {
      verdict: 'escalate',
      rationale: '외부/매출/비가역 신호 감지 — Founder 승인 필요',
      used_llm: false,
    };
  }
  if (INTERNAL_SAFE_SIGNAL.test(text)) {
    return {
      verdict: 'pass',
      rationale: '내부 범위·낮은 영향 신호 — 자동 통과',
      used_llm: false,
    };
  }
  return null;
}

export async function judgeD3Task(
  input: D3JudgeInput,
  llm: LLMClient | null,
): Promise<D3JudgeResult> {
  if (input.task.risk_level !== 'D3') {
    throw new Error('judgeD3Task: not a D3 task');
  }

  // Deterministic pre-judge first — escalate/pass clear cases without the LLM.
  const deterministic = judgeD3Deterministic(input);
  if (deterministic) {
    return deterministic;
  }

  if (llm === null) {
    return {
      verdict: 'hold',
      rationale: 'LLM 미설정 — 24h 타이머 fallback 대기',
      used_llm: false,
    };
  }

  const userContent = JSON.stringify(
    {
      task: input.task,
      ...(input.context !== undefined ? { context: input.context } : {}),
    },
    null,
    2,
  );

  let raw: string;
  try {
    raw = await llm.complete({ system: SYSTEM_PROMPT, user: userContent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      verdict: 'hold',
      rationale: `LLM 호출 실패: ${msg.slice(0, 200)}`,
      used_llm: false,
    };
  }

  // Extract JSON from the raw response — handles markdown code fences.
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      verdict: 'hold',
      rationale: `LLM 응답 파싱 실패: ${raw.slice(0, 200)}`,
      used_llm: false,
      raw,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return {
      verdict: 'hold',
      rationale: `LLM 응답 파싱 실패: ${raw.slice(0, 200)}`,
      used_llm: false,
      raw,
    };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('verdict' in parsed) ||
    typeof (parsed as Record<string, unknown>).verdict !== 'string' ||
    !VALID_VERDICTS.has((parsed as Record<string, unknown>).verdict as string)
  ) {
    return {
      verdict: 'hold',
      rationale: `LLM 응답 파싱 실패: ${raw.slice(0, 200)}`,
      used_llm: false,
      raw,
    };
  }

  const p = parsed as Record<string, unknown>;
  const verdict = p.verdict as D3Verdict;
  const rationale = typeof p.rationale === 'string' ? p.rationale : '';
  const conditions =
    Array.isArray(p.conditions) && p.conditions.every((c) => typeof c === 'string')
      ? (p.conditions as string[])
      : undefined;

  return {
    verdict,
    rationale,
    ...(conditions !== undefined ? { conditions } : {}),
    used_llm: true,
    raw,
  };
}
