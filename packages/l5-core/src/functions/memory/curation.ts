// P3-2 — Knowledge Auto-Curation (replaces manual Memory Review).
//
// Pure l5-core rules deciding keep / auto-save / auto-discard for a candidate
// insight. NO IO: embedding similarity (`maxSimilarity`) and any existing-card
// data are INJECTED by the caller (the plugin computes them via the Second Brain
// transport). This keeps every branch deterministic & unit-testable.
//
// Decision order (first match wins): pii_high → too_short → duplicate →
// score band (high→save, low→discard, middle→needs_review/LLM).
// See docs/specs/P3-2-memory-curation.md §3.

export type CurationDecision = 'auto_save' | 'auto_discard' | 'needs_review';
export type DiscardReason =
  | 'duplicate'
  | 'too_short'
  | 'low_specificity'
  | 'pii_high'
  | 'low_value';

export interface CurationInput {
  insight: string;
  pii_level: 'none' | 'low' | 'high';
  workflow_improvement?: string;
  phase?: string;
  source_agent?: string;
  /** Max cosine similarity vs existing Second Brain cards, 0..1.
   *  Supplied by the plugin from transport.query embeddings; undefined if the
   *  store is unavailable (then dedup is skipped, fail-open to keep). */
  maxSimilarity?: number;
}

export interface CurationScore {
  specificity: number; // 0..1 — has numbers / named entities / causal words
  reuse_value: number; // 0..1 — generalizable, has workflow_improvement, etc.
  length_ok: boolean;
}

export interface CurationResult {
  decision: CurationDecision;
  reason?: DiscardReason; // set when auto_discard
  score: CurationScore;
  needs_llm: boolean; // true only in the borderline band
  explanation: string; // short KO string for the weekly summary
}

/** Thresholds — exported so they can be tuned / asserted in tests. */
export const CURATION = {
  MIN_LENGTH: 25, // chars; below → too_short (collector already drops <10)
  DUP_SIMILARITY: 0.92, // >= → duplicate auto_discard
  AUTO_SAVE_SCORE: 0.62, // combined score >= → auto_save
  AUTO_DISCARD_SCORE: 0.3, // combined score <  → auto_discard low_value
  // band in between → needs_review (optionally LLM-assisted, see §3.4)
} as const;

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

const CAUSAL_MARKERS = ['때문', '덕분', '결과', '왜냐', '→', 'because', 'so that'];

/**
 * §3.1 — pure heuristic scoring, no LLM. Each branch adds a fixed weight and the
 * result is clamped to 0..1 so every heuristic has a deterministic unit test.
 */
export function scoreInsight(input: CurationInput): CurationScore {
  const text = (input.insight ?? '').trim();
  const length_ok = text.length >= CURATION.MIN_LENGTH;

  let specificity = 0;
  // contains a digit / % / currency
  if (/[0-9%$€£₩¥]/.test(text)) specificity += 0.3;
  // contains a causal / lesson marker
  if (CAUSAL_MARKERS.some((m) => text.includes(m))) specificity += 0.3;
  // contains a proper-noun-ish token (capitalized latin word or quoted phrase)
  if (/\b[A-Z][a-zA-Z]+\b/.test(text) || /["'“”『「][^"'”』」]+["'“”』」]/.test(text)) {
    specificity += 0.2;
  }
  // length 60..400 chars → substantive but not a dump
  if (text.length >= 60 && text.length <= 400) specificity += 0.2;
  specificity = clamp01(specificity);

  let reuse_value = 0;
  if ((input.workflow_improvement ?? '').trim().length > 0) reuse_value += 0.4;
  if ((input.phase ?? '').trim().length > 0) reuse_value += 0.2;
  // generalizable phrasing — not purely first-person "내가 X 했다"
  if (!/내가\s.*했다/.test(text)) reuse_value += 0.2;
  // not a known duplicate
  if (input.maxSimilarity === undefined || input.maxSimilarity < CURATION.DUP_SIMILARITY) {
    reuse_value += 0.2;
  }
  reuse_value = clamp01(reuse_value);

  return { specificity, reuse_value, length_ok };
}

/**
 * §3.2 — deterministic decision. Order of checks (first match wins):
 *   1. pii_high   → auto_discard (hard governance: never reaches LLM / Second Brain)
 *   2. too_short  → auto_discard
 *   3. duplicate  → auto_discard (only when similarity is supplied; fail-open)
 *   4. score band → auto_save / auto_discard(low_value) / needs_review
 */
export function curateInsight(input: CurationInput): CurationResult {
  const score = scoreInsight(input);

  if (input.pii_level === 'high') {
    return {
      decision: 'auto_discard',
      reason: 'pii_high',
      score,
      needs_llm: false,
      explanation: 'PII 높음 → 자동 폐기',
    };
  }

  if (!score.length_ok) {
    return {
      decision: 'auto_discard',
      reason: 'too_short',
      score,
      needs_llm: false,
      explanation: `너무 짧음(${(input.insight ?? '').trim().length}자 < ${CURATION.MIN_LENGTH}자) → 자동 폐기`,
    };
  }

  if (input.maxSimilarity !== undefined && input.maxSimilarity >= CURATION.DUP_SIMILARITY) {
    return {
      decision: 'auto_discard',
      reason: 'duplicate',
      score,
      needs_llm: false,
      explanation: `중복(유사도 ${input.maxSimilarity.toFixed(2)}) — 기존 카드와 거의 동일`,
    };
  }

  const combined = 0.5 * score.specificity + 0.5 * score.reuse_value;

  if (combined >= CURATION.AUTO_SAVE_SCORE) {
    return {
      decision: 'auto_save',
      score,
      needs_llm: false,
      explanation: `구체성/재사용성 높음(${combined.toFixed(2)}) → 자동 저장`,
    };
  }

  if (combined < CURATION.AUTO_DISCARD_SCORE) {
    return {
      decision: 'auto_discard',
      reason: 'low_value',
      score,
      needs_llm: false,
      explanation: `구체성/재사용성 낮음(${combined.toFixed(2)}) → 자동 폐기`,
    };
  }

  return {
    decision: 'needs_review',
    score,
    needs_llm: true,
    explanation: `애매한 구간(${combined.toFixed(2)}) → 검토 필요`,
  };
}

export interface CurationSummaryItem {
  id: string;
  result: CurationResult;
  insight: string;
}

export interface CurationSummary {
  week_start: string; // ISO date — injected by caller (no Date inside pure fn)
  saved: Array<{ id: string; insight: string; explanation: string }>;
  discarded: Array<{
    id: string;
    insight: string;
    reason?: DiscardReason;
    explanation: string;
    discarded_at: string;
    purge_at: string;
  }>;
  needs_review: Array<{ id: string; insight: string; explanation: string }>;
  totals: { saved: number; discarded: number; needs_review: number };
}

export interface SummarizeOptions {
  week_start: string;
  /** Soft-delete timestamps for discarded rows, injected (no Date inside). */
  discarded_at?: string;
  purge_at?: string;
}

/**
 * §3.3 — fold a batch of curated items into the weekly summary buckets. Pure:
 * all timestamps are injected via `opts` so the same input yields the same output.
 */
export function summarizeCuration(
  items: CurationSummaryItem[],
  opts: SummarizeOptions,
): CurationSummary {
  const saved: CurationSummary['saved'] = [];
  const discarded: CurationSummary['discarded'] = [];
  const needs_review: CurationSummary['needs_review'] = [];

  for (const { id, result, insight } of items) {
    if (result.decision === 'auto_save') {
      saved.push({ id, insight, explanation: result.explanation });
    } else if (result.decision === 'auto_discard') {
      discarded.push({
        id,
        insight,
        reason: result.reason,
        explanation: result.explanation,
        discarded_at: opts.discarded_at ?? '',
        purge_at: opts.purge_at ?? '',
      });
    } else {
      needs_review.push({ id, insight, explanation: result.explanation });
    }
  }

  return {
    week_start: opts.week_start,
    saved,
    discarded,
    needs_review,
    totals: {
      saved: saved.length,
      discarded: discarded.length,
      needs_review: needs_review.length,
    },
  };
}

/**
 * §3.4 — optional borderline LLM assist. Pure prompt builder only: the plugin
 * runs the claude CLI (MCP off) and maps the verdict back to save/discard.
 * Governance: PII is never embedded — only `needs_review` items reach here, and
 * `pii_high` is already auto-discarded upstream.
 */
export function buildCurationLLMPrompt(input: CurationInput): {
  system: string;
  user: string;
} {
  const system =
    '당신은 회사의 지식 큐레이터입니다. 주어진 인사이트가 향후 재사용 가치가 있는지 판단합니다. ' +
    '반드시 JSON 한 개로만 답하십시오: {"keep": boolean, "reason": string}. ' +
    'reason은 한 줄로 작성하고, 고객 개인정보(PII)를 절대 그대로 옮겨 적지 마십시오.';

  const meta = [
    input.phase ? `phase: ${input.phase}` : null,
    input.source_agent ? `source: ${input.source_agent}` : null,
    (input.workflow_improvement ?? '').trim()
      ? `workflow_improvement: ${input.workflow_improvement}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const user =
    `# 인사이트\n${(input.insight ?? '').trim()}\n\n` +
    (meta ? `# 메타\n${meta}\n\n` : '') +
    '이 인사이트를 세컨 브레인에 저장할 가치가 있습니까? JSON으로만 답하십시오.';

  return { system, user };
}

export interface CurationLLMVerdict {
  decision: 'auto_save' | 'auto_discard';
  reason: string;
}

/**
 * Parse the borderline LLM reply. Conservative fail-open: any unparseable /
 * ambiguous reply keeps the item (auto_save) rather than silently discarding
 * knowledge — `needs_review` items are never auto-discarded by the rules.
 */
export function parseCurationLLMVerdict(text: string): CurationLLMVerdict {
  const head = (text ?? '').trim().slice(0, 200);
  const match = (text ?? '').match(/\{[\s\S]*\}/);
  if (!match) {
    return { decision: 'auto_save', reason: `큐레이션 응답 파싱 실패(JSON 없음): ${head}` };
  }
  try {
    const obj = JSON.parse(match[0]) as { keep?: unknown; reason?: unknown };
    const keep = obj.keep === true;
    const reason = typeof obj.reason === 'string' ? obj.reason : '';
    return {
      decision: keep ? 'auto_save' : 'auto_discard',
      reason: reason || (keep ? '재사용 가치 있음' : '재사용 가치 낮음'),
    };
  } catch {
    return { decision: 'auto_save', reason: `큐레이션 응답 파싱 실패(JSON 오류): ${head}` };
  }
}
