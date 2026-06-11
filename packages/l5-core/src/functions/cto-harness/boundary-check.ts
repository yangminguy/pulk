// CTO Harness — Boundary Check (PRD §12.3).
//
// ExecutionRun이 변경한 파일들이 허용 범위(allowedFiles) 안에 있고 차단 패턴
// (blockedFiles)에 걸리지 않는지 결정적으로 검사한다. glob 매칭은 외부 의존성
// 없이 직접 구현한다. 순수 함수만 둔다 — I/O·네트워크·git 실행 없음.

import type { BoundaryCheckResult } from './types';

/**
 * 항상 차단되는 기본 패턴.
 * 비밀 파일(.env 계열), 의존성 디렉터리, 락파일, .git 내부.
 */
export const DEFAULT_BLOCKED: string[] = [
  '.env',
  '.env.*',
  '**/.env',
  '**/node_modules/**',
  '**/.git/**',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
];

/**
 * 간단한 glob 매칭.
 *
 * 규칙:
 * - '**' = 임의 경로 세그먼트들(슬래시 포함, 0개 이상).
 * - '*'  = 슬래시를 제외한 임의 문자(0개 이상).
 * - 그 외 모든 문자는 리터럴.
 *
 * 패턴 전체가 파일 경로 전체와 매칭되어야 한다(앵커링).
 */
export function matchGlob(filePath: string, pattern: string): boolean {
  const regex = globToRegExp(pattern);
  return regex.test(filePath);
}

/** glob 패턴을 앵커링된 정규식으로 변환한다. */
function globToRegExp(pattern: string): RegExp {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          // '**/' = 임의 경로 세그먼트들(0개 이상). 0개일 때 루트 파일도 매칭.
          // 예: '**/.env' 는 '.env' 와 'apps/web/.env' 둘 다 매칭.
          out += '(?:.*/)?';
          i += 2; // '**' 의 두 번째 '*' 와 이어지는 '/' 를 함께 소비.
        } else {
          // '**' = 임의 경로 세그먼트들(슬래시 포함).
          out += '.*';
          i++;
        }
      } else {
        // '*' = 슬래시 제외 임의 문자.
        out += '[^/]*';
      }
    } else {
      // 정규식 메타문자를 리터럴로 이스케이프.
      out += escapeRegExp(ch);
    }
  }
  out += '$';
  return new RegExp(out);
}

/** 정규식 메타문자 1글자를 이스케이프한다. */
function escapeRegExp(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 파일이 패턴 목록 중 하나라도 매칭되는지. */
function matchesAny(filePath: string, patterns: string[]): boolean {
  return patterns.some((p) => matchGlob(filePath, p));
}

/**
 * Boundary Check (PRD §12.3).
 *
 * - 각 changed 파일이 blockedFiles(+ DEFAULT_BLOCKED) 패턴 중 하나라도 매칭되면
 *   blocked 목록에 추가한다.
 * - blocked가 아니고, allowedFiles가 비어있지 않은데 어떤 allowed 패턴에도
 *   매칭되지 않으면 outOfScope에 추가한다.
 * - allowedFiles가 빈 배열이면 범위 제한이 없으므로 outOfScope 검사를 생략한다.
 * - violations = blocked ∪ outOfScope.
 * - status = violations가 있으면 'fail', 없으면 'pass'.
 */
export function checkBoundary(
  changedFiles: string[],
  allowedFiles: string[],
  blockedFiles: string[],
): BoundaryCheckResult {
  const effectiveBlocked = [...DEFAULT_BLOCKED, ...blockedFiles];
  const scopeRestricted = allowedFiles.length > 0;

  const blocked: string[] = [];
  const outOfScope: string[] = [];

  for (const file of changedFiles) {
    if (matchesAny(file, effectiveBlocked)) {
      blocked.push(file);
      continue;
    }
    if (scopeRestricted && !matchesAny(file, allowedFiles)) {
      outOfScope.push(file);
    }
  }

  const violations = [...blocked, ...outOfScope];

  return {
    status: violations.length > 0 ? 'fail' : 'pass',
    violations,
    blocked,
    outOfScope,
  };
}
