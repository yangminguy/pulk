// llm-json — S4: LLM 구조화 출력 강제 + 자동 재시도.
//
// CTO 판단 로직 전반(plan-turn/d3-judge/clarifier/verifier/critic)이 공유하는
// "JSON만 받아낸다" 유틸. 기존에는 각 모듈이 regex 파싱 후 실패 시 조용히
// deterministic fallback으로 떨어졌다(silent fallback). 이 모듈은:
//   1) 견고한 JSON 블록 추출(코드펜스/앞뒤 잡담 허용)
//   2) 호출자 제공 validate 함수로 스키마 검증
//   3) 실패 시 원문+교정 지시를 붙여 자동 재호출(기본 1회 재시도)
// 를 표준화한다. never-throw — 최종 실패는 value:null로 반환하고 호출자가
// deterministic fallback을 선택한다(무성의 실패 제거, 게이트 보존).

import type { LLMClient } from '../ceo-orchestration/types';

/** 코드펜스/설명문 속에서 최외곽 JSON 오브젝트 문자열을 추출한다. */
export function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced && fenced[1] ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

/** 추출→파싱→검증을 한 번에. 어느 단계든 실패하면 null (never-throw). */
export function parseJsonWithValidator<T>(
  raw: string,
  validate: (v: unknown) => T | null,
): T | null {
  try {
    const parsed = JSON.parse(extractJsonBlock(raw)) as unknown;
    return validate(parsed);
  } catch {
    return null;
  }
}

export interface JsonCallSpec<T> {
  system: string;
  user: string;
  trace_name?: string;
  /** 파싱된 값을 검증·정규화해 T 또는 null을 반환. null = 스키마 불일치. */
  validate: (v: unknown) => T | null;
  /** 총 시도 횟수(기본 2 = 최초 1 + 재시도 1). */
  maxAttempts?: number;
}

export interface JsonCallResult<T> {
  value: T | null;
  attempts: number;
  /** 마지막 시도의 원문(디버깅/원장 기록용). LLM 호출 자체가 실패하면 null. */
  raw: string | null;
}

const RETRY_SUFFIX =
  '\n\n[재시도 지시] 직전 출력은 JSON 파싱 또는 스키마 검증에 실패했다. ' +
  '설명·마크다운·코드펜스 없이, 요구된 스키마에 정확히 맞는 JSON 오브젝트 하나만 출력하라.';

/**
 * 스키마 강제 LLM 호출. 파싱/검증 실패 시 직전 원문을 첨부해 재호출한다.
 * LLM 예외 포함 어떤 경우에도 throw하지 않는다.
 */
export async function completeJsonWithRetry<T>(
  llm: LLMClient,
  spec: JsonCallSpec<T>,
): Promise<JsonCallResult<T>> {
  const maxAttempts = Math.max(1, spec.maxAttempts ?? 2);
  let raw: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const user =
      attempt === 1 || raw == null
        ? spec.user
        : `${spec.user}\n\n[직전 실패 출력]\n${raw.slice(0, 2000)}${RETRY_SUFFIX}`;
    try {
      raw = await llm.complete({
        system: spec.system,
        user,
        trace_name: spec.trace_name
          ? attempt === 1
            ? spec.trace_name
            : `${spec.trace_name}.retry${attempt - 1}`
          : undefined,
      });
    } catch {
      // LLM 호출 자체 실패 — 재시도해도 같은 원인일 가능성이 높지만 1회는 더 시도.
      raw = null;
      continue;
    }
    const value = parseJsonWithValidator(raw, spec.validate);
    if (value !== null) return { value, attempts: attempt, raw };
  }

  return { value: null, attempts: maxAttempts, raw };
}
