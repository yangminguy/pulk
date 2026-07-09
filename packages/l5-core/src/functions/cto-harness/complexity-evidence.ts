// cto-harness/complexity-evidence — S2: evidence 기반 복잡도·위험 분류.
//
// 기존 classifyComplexity의 약점: fileCount/changedLines는 실행 전엔 알 수
// 없어 사실상 키워드 휴리스틱만 동작하고, 'env' 같은 단어 하나로 C4 승격되는
// 과승격이 발생한다. 이 모듈은 (a) S1 스카우트 실측으로 fileCount를 근거 있는
// 추정치로 채우고, (b) 위험 키워드는 "실제 해당 영역 터치 예상"이 뒷받침될
// 때만 승격시키며, (c) 모든 판단에 evidence[]를 남겨 승인 카드와 결정 원장이
// 근거를 확인할 수 있게 한다. classifyComplexity 자체는 수정하지 않는다(외과적).

import { classifyComplexity, type ComplexityInput } from './complexity-router';
import type { Complexity } from './types';
import type { RepoScoutReport } from '../cto-planning/scout';

export interface ComplexityEvidence {
  /** 판단에 사용(used) / 근거 부족으로 무시(discounted) / 참고(info). */
  kind: 'used' | 'discounted' | 'info';
  note: string;
}

export interface EvidenceBasedComplexityInput extends ComplexityInput {
  /** S1 스카우트 결과(있으면 keyword_matches로 터치 추정). */
  scout?: RepoScoutReport | null;
  /** 계획 단계에서 명시된 산출 파일 목록(expected_output 파싱 등). */
  expectedFiles?: string[];
}

export interface EvidenceBasedComplexityResult {
  complexity: Complexity;
  evidence: ComplexityEvidence[];
}

/** 위험 키워드 → 그 키워드가 "진짜 그 영역 터치"임을 뒷받침할 경로 신호. */
const RISK_PATH_SIGNALS: Record<string, RegExp> = {
  auth: /auth|login|session|token/i,
  payment: /payment|billing|checkout|stripe/i,
  migration: /migration|migrate/i,
  deploy: /deploy|infra|\.github|launchd|plist/i,
  env: /\.env|config\/env|environment/i,
  secret: /secret|credential|vault/i,
  credential: /secret|credential|vault/i,
  runner: /runner|orchestrat|dispatch/i,
};

/**
 * evidence 기반 분류. 키워드 승격은 (expectedFiles 또는 scout 매칭 경로)가
 * 해당 위험 영역 신호를 실제로 포함할 때만 유지한다 — 단어 존재만으로는
 * 승격하지 않는다(discounted evidence로 기록). touches* 명시 플래그는
 * 호출자가 이미 근거를 갖고 준 것으로 보고 그대로 존중한다.
 */
export function classifyComplexityWithEvidence(
  input: EvidenceBasedComplexityInput,
): EvidenceBasedComplexityResult {
  const evidence: ComplexityEvidence[] = [];
  const paths = [
    ...(input.expectedFiles ?? []),
    ...(input.scout?.keyword_matches?.map((m) => m.path) ?? []),
  ];

  // (a) fileCount 보강 — 명시값 > expectedFiles 실측.
  let fileCount = input.fileCount;
  if (typeof fileCount !== 'number' && input.expectedFiles?.length) {
    fileCount = input.expectedFiles.length;
    evidence.push({
      kind: 'used',
      note: `fileCount=${fileCount} — 계획의 산출 파일 목록에서 실측 추정`,
    });
  }

  // (b) 키워드 필터 — 경로 신호가 뒷받침되는 키워드만 유지.
  const keptKeywords: string[] = [];
  for (const kw of input.keywords ?? []) {
    const signal = RISK_PATH_SIGNALS[kw.toLowerCase()];
    if (!signal) {
      keptKeywords.push(kw); // 위험 목록 밖 키워드는 판단에 영향 없음 — 통과.
      continue;
    }
    const backed = paths.some((p) => signal.test(p));
    if (backed) {
      keptKeywords.push(kw);
      evidence.push({
        kind: 'used',
        note: `위험 키워드 '${kw}' 유지 — 터치 예상 경로에서 해당 영역 확인`,
      });
    } else {
      evidence.push({
        kind: 'discounted',
        note: `위험 키워드 '${kw}' 무시 — 터치 예상 경로에 해당 영역 없음(단어만 등장)`,
      });
    }
  }

  const refined: ComplexityInput = {
    ...input,
    ...(typeof fileCount === 'number' ? { fileCount } : {}),
    keywords: keptKeywords,
  };
  const complexity = classifyComplexity(refined);

  if (input.scout?.keyword_matches?.length) {
    evidence.push({
      kind: 'info',
      note: `scout 매칭 ${input.scout.keyword_matches.length}건을 근거로 사용`,
    });
  }
  evidence.push({ kind: 'info', note: `최종 복잡도 ${complexity}` });

  return { complexity, evidence };
}
