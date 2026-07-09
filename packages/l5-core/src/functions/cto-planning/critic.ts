// cto-planning/critic — S3: Plan Critic 패널(계획 확정 전 다관점 교차검증).
//
// plan 초안이 승인 큐에 올라가기 전, 3개 관점(단순화/리스크/검증가능성)의
// critic이 병렬로 채점한다. 결과는 plan을 자동 수정하지 않고(보수적) 승인
// 카드에 첨부할 요약과 must_fix 목록으로 만든다 — 판단은 사장님이 한다.
// LLM 실패는 해당 관점만 누락(graceful), 전체 패널 실패 시 null 요약.

import type { LLMClient } from '../ceo-orchestration/types';
import type { CtoPlan } from './types';
import { completeJsonWithRetry } from '../llm-json';

export type CriticLens = 'simplify' | 'risk' | 'verifiability';

export interface CriticIssue {
  severity: 'must_fix' | 'warn';
  note: string;
  /** 어느 태스크/로드맵을 겨냥한 지적인지(있으면). */
  target?: string;
}

export interface CriticVerdict {
  lens: CriticLens;
  /** 1(심각) ~ 5(우수). */
  score: number;
  issues: CriticIssue[];
}

const LENS_SYSTEM: Record<CriticLens, string> = {
  simplify:
    '너는 시니어 엔지니어 critic이다. 주어진 개발 계획을 "단순화" 관점에서만 검토한다: ' +
    '더 적은 태스크/더 작은 범위로 같은 목표를 달성할 수 있는가? 과분해·불필요한 추상화·요청 밖 기능을 지적하라.',
  risk:
    '너는 시니어 엔지니어 critic이다. 주어진 개발 계획을 "리스크" 관점에서만 검토한다: ' +
    '놓친 위험(데이터 손상, 외부 영향, 되돌리기 어려움), 숨은 의존성, 순서 오류를 지적하라.',
  verifiability:
    '너는 시니어 엔지니어 critic이다. 주어진 개발 계획을 "검증가능성" 관점에서만 검토한다: ' +
    '각 태스크의 완료를 객관적으로 판정할 수 있는가? acceptance_criteria가 측정 가능한가? 모호한 완료 조건을 지적하라.',
};

const OUTPUT_SCHEMA =
  '반드시 JSON만 출력: {"score": 1-5, "issues": [{"severity": "must_fix"|"warn", "note": string, "target": string|null}]}. ' +
  'must_fix = 이대로 승인되면 실패/사고로 이어질 항목만. 과한 지적 금지(최대 5개).';

function formatPlanForCritic(plan: CtoPlan): string {
  const lines: string[] = ['[PRD]', plan.prd || '(없음)', '', '[태스크]'];
  for (const t of plan.tasks) {
    lines.push(`- ${t.title}: ${t.rationale} → 산출물: ${t.expected_output}`);
    if (t.acceptance_criteria?.length) {
      lines.push(`  완료조건: ${t.acceptance_criteria.join(' / ')}`);
    }
  }
  return lines.join('\n');
}

function validateVerdict(lens: CriticLens) {
  return (v: unknown): CriticVerdict | null => {
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    const score = typeof o.score === 'number' ? Math.min(5, Math.max(1, Math.round(o.score))) : null;
    if (score === null) return null;
    const issues: CriticIssue[] = Array.isArray(o.issues)
      ? o.issues
          .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
          .filter((it) => typeof it.note === 'string' && (it.note as string).trim())
          .slice(0, 5)
          .map((it) => ({
            severity: it.severity === 'must_fix' ? 'must_fix' as const : 'warn' as const,
            note: String(it.note).trim(),
            ...(typeof it.target === 'string' && it.target ? { target: it.target } : {}),
          }))
      : [];
    return { lens, score, issues };
  };
}

export interface CriticPanelResult {
  verdicts: CriticVerdict[];
  /** 승인 카드에 붙일 한국어 요약. 패널 전체 실패 시 null. */
  summary: string | null;
  must_fix_count: number;
}

/** critic 패널 실행 — 3관점 병렬. 어떤 실패에도 throw하지 않는다. */
export async function runCriticPanel(
  plan: CtoPlan,
  llm: LLMClient,
  opts?: { lenses?: CriticLens[] },
): Promise<CriticPanelResult> {
  const lenses = opts?.lenses ?? (['simplify', 'risk', 'verifiability'] as CriticLens[]);
  const planText = formatPlanForCritic(plan);

  const results = await Promise.all(
    lenses.map((lens) =>
      completeJsonWithRetry(llm, {
        system: `${LENS_SYSTEM[lens]}\n${OUTPUT_SCHEMA}`,
        user: planText,
        trace_name: `cto.criticPanel.${lens}`,
        validate: validateVerdict(lens),
      }).then((r) => r.value),
    ),
  );

  const verdicts = results.filter((v): v is CriticVerdict => v !== null);
  const must_fix_count = verdicts.reduce(
    (n, v) => n + v.issues.filter((i) => i.severity === 'must_fix').length,
    0,
  );
  return { verdicts, summary: buildCriticSummary(verdicts), must_fix_count };
}

/** 판정 목록 → 승인 카드용 한국어 요약(순수, 테스트 가능). */
export function buildCriticSummary(verdicts: CriticVerdict[]): string | null {
  if (!verdicts.length) return null;
  const LENS_KO: Record<CriticLens, string> = {
    simplify: '단순화',
    risk: '리스크',
    verifiability: '검증가능성',
  };
  const lines: string[] = ['🔍 CTO critic 패널 검토:'];
  for (const v of verdicts) {
    lines.push(`- ${LENS_KO[v.lens]} ${v.score}/5`);
    for (const i of v.issues) {
      lines.push(`  ${i.severity === 'must_fix' ? '⛔' : '⚠️'} ${i.note}${i.target ? ` (${i.target})` : ''}`);
    }
  }
  const mustFix = verdicts.flatMap((v) => v.issues.filter((i) => i.severity === 'must_fix'));
  if (mustFix.length) {
    lines.push(`must_fix ${mustFix.length}건 — 승인 전 계획 보완을 권장합니다.`);
  }
  return lines.join('\n');
}
