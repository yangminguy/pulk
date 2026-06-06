// CTO Harness — 복잡도 라우터 (PRD §6).
//
// 작업 입력 신호(파일 수/변경 라인/위험 영역 터치/키워드 등)를 받아 복잡도(C0~C5)로
// 분류하고, 이를 ExecutionMode / HarnessMode / VerificationProfile로 매핑하는 순수
// 함수 모음. I/O·네트워크 없이 결정적으로 동작한다.

import type {
  Complexity,
  ExecutionMode,
  HarnessMode,
  VerificationProfile,
} from './types';

/** classifyComplexity 입력 신호. 모두 optional이며 빈 객체는 C1 기본. */
export interface ComplexityInput {
  fileCount?: number;
  changedLines?: number;
  touchesAuth?: boolean;
  touchesPayment?: boolean;
  touchesMigration?: boolean;
  touchesDeploy?: boolean;
  touchesEnv?: boolean;
  touchesRunner?: boolean;
  isDocOnly?: boolean;
  isLargeRefactor?: boolean;
  keywords?: string[];
}

/** 키워드에 등장하면 C4로 승격시키는 위험 단어 목록 (PRD §6.1). */
const RISK_KEYWORDS = [
  'auth',
  'payment',
  'migration',
  'deploy',
  'env',
  'secret',
  'credential',
  'runner',
];

/**
 * 작업 복잡도 분류 (PRD §6.1 표).
 *
 * 우선순위:
 *  1. 위험 영역 터치(auth/payment/migration/deploy/env/runner) 또는 위험 키워드 → C4
 *  2. 대형 리팩터링 → C5
 *  3. 문서 전용 → C0
 *  4. 파일 1개 이하 또는 변경 50줄 이하 → C1
 *  5. 파일 2~5개 → C2
 *  6. 파일 5개 초과(여러 모듈) → C3
 *  7. 그 외(빈 객체 포함) → C1 기본
 */
export function classifyComplexity(input: ComplexityInput): Complexity {
  // 1. 위험 영역 터치 플래그 — 가장 우선해서 C4.
  const touchesRisk =
    input.touchesAuth === true ||
    input.touchesPayment === true ||
    input.touchesMigration === true ||
    input.touchesDeploy === true ||
    input.touchesEnv === true ||
    input.touchesRunner === true;

  // 위험 키워드도 touches 플래그처럼 C4로 승격.
  const hasRiskKeyword = (input.keywords ?? []).some((kw) =>
    RISK_KEYWORDS.includes(kw.toLowerCase()),
  );

  if (touchesRisk || hasRiskKeyword) {
    return 'C4';
  }

  // 2. 대형 리팩터링 → C5.
  if (input.isLargeRefactor === true) {
    return 'C5';
  }

  // 3. 문서 전용 (위험 아님) → C0.
  if (input.isDocOnly === true) {
    return 'C0';
  }

  // 4. 파일 1개 이하 또는 변경 50줄 이하 → C1.
  const hasFileCount = typeof input.fileCount === 'number';
  const hasChangedLines = typeof input.changedLines === 'number';

  if (
    (hasFileCount && (input.fileCount as number) <= 1) ||
    (hasChangedLines && (input.changedLines as number) <= 50)
  ) {
    return 'C1';
  }

  // 5. 파일 2~5개 → C2.
  if (hasFileCount && (input.fileCount as number) >= 2 && (input.fileCount as number) <= 5) {
    return 'C2';
  }

  // 6. 파일 5개 초과(여러 모듈) → C3.
  if (hasFileCount && (input.fileCount as number) > 5) {
    return 'C3';
  }

  // 7. 신호 없음(빈 객체 등) → C1 기본.
  return 'C1';
}

/** 복잡도 → ExecutionRun 실행 모드 (PRD §6.2). */
export function complexityToMode(c: Complexity): ExecutionMode {
  switch (c) {
    case 'C0':
    case 'C1':
      return 'safe_solo';
    case 'C2':
      return 'implement_verify';
    case 'C3':
    case 'C4':
      return 'strict_sandbox';
    case 'C5':
      return 'parallel_patch_queue';
  }
}

/** 복잡도 → Harness 실행 레일 (PRD §14.4 / §14.10). */
export function complexityToHarnessMode(c: Complexity): HarnessMode {
  switch (c) {
    case 'C0':
      return 'direct';
    case 'C1':
      return 'safe_solo';
    case 'C2':
      return 'standard';
    case 'C3':
    case 'C4':
      return 'strict';
    case 'C5':
      return 'parallel_patch';
  }
}

/**
 * 복잡도 → 검증 프로파일 (PRD §13.1, §14.10).
 *
 * - C0: boundary만 true (나머지 false).
 * - C1: typecheck + boundary.
 * - C2: typecheck + build + boundary (test 제외), UI면 playwright.
 * - C3: typecheck + test + build + boundary, UI면 playwright.
 * - C4: typecheck + lint + test + build + boundary, UI면 playwright.
 * - C5: C4와 동일.
 */
export function buildVerificationProfile(
  c: Complexity,
  opts?: { isUI?: boolean },
): VerificationProfile {
  const isUI = opts?.isUI === true;

  switch (c) {
    case 'C0':
      return {
        typecheck: false,
        lint: false,
        test: false,
        build: false,
        playwright: false,
        boundary: true,
      };
    case 'C1':
      return {
        typecheck: true,
        lint: false,
        test: false,
        build: false,
        playwright: false,
        boundary: true,
      };
    case 'C2':
      return {
        typecheck: true,
        lint: false,
        test: false,
        build: true,
        playwright: isUI,
        boundary: true,
      };
    case 'C3':
      return {
        typecheck: true,
        lint: false,
        test: true,
        build: true,
        playwright: isUI,
        boundary: true,
      };
    case 'C4':
    case 'C5':
      return {
        typecheck: true,
        lint: true,
        test: true,
        build: true,
        playwright: isUI,
        boundary: true,
      };
  }
}
