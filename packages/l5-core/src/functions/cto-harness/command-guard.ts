// Command Guard — CTO Harness 실행 전 명령어 안전성 검사 (PRD §14.8 / §19.1).
//
// ACR Kernel이 worktree 안에서 CLI 명령을 실행하기 전에, pulk CTO가 이 순수 함수로
// 명령 문자열을 사전 분류한다. 실제 실행은 ACR Kernel 책임이고, 여기서는 "허용/경고/차단"
// 판단만 결정적으로 내린다.
//
// 정책 (주석으로 근거 명시):
//   - blocked: 되돌릴 수 없거나 시스템/원격/배포에 직접 영향을 주는 명령.
//       rm -rf, git push 계열(원격 변경), git reset --hard(작업 손실),
//       .env 파일 변경(시크릿), 의존성 추가/삭제(install/add), production deploy,
//       migration apply/deploy/db push, node_modules·.git 직접 수정.
//   - warning: 즉시 차단은 아니지만 승인 권장. (현 정책에서는 거의 blocked로 흡수되며,
//       명시적으로 안전 측에 둘 수 있는 비실행/조회성 migration 명령 등만 warning.)
//   - safe: 읽기/검증 전용 (typecheck, build, test, lint, git status/diff, ls 등).
//
// 근거: dependency 추가/삭제·migration·deploy·push origin main 은 위험도가 높아
//   blocked로 둔다. 단, 명령이 "단순 조회/계획" 단계(예: migration status, prisma migrate
//   diff)임이 명확하면 warning으로 완화한다. install/add는 unknown 여부와 무관하게
//   네트워크/공급망 위험이 있어 blocked, 'unknown' 명시 시에도 동일하게 blocked.

import type { CommandGuardResult } from './types';

/** 공백을 정규화한 소문자 명령 문자열. 패턴 매칭의 입력으로 사용. */
function normalize(cmd: string): string {
  return cmd.trim().replace(/\s+/g, ' ').toLowerCase();
}

interface Rule {
  /** 매칭 정규식 (정규화된 소문자 문자열 대상). */
  pattern: RegExp;
  riskLevel: 'warning' | 'blocked';
  reason: string;
}

// ───────────────────────────── BLOCKED 규칙 ─────────────────────────────
// 순서 주의: 더 구체적/위험한 규칙을 먼저 둔다 (첫 매칭이 결과를 결정).
const BLOCKED_RULES: Rule[] = [
  {
    // rm -rf (옵션 순서/결합 유연: -rf, -fr, -r -f 등)
    pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\s+-f|-f\s+-r)\b/,
    riskLevel: 'blocked',
    reason: 'rm -rf: 되돌릴 수 없는 강제 재귀 삭제',
  },
  {
    // git push --force / push -f / git push (원격 변경은 모두 차단)
    pattern: /\bgit\s+push\b/,
    riskLevel: 'blocked',
    reason: 'git push: 원격 브랜치 변경은 승인 없이 차단',
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    riskLevel: 'blocked',
    reason: 'git reset --hard: 워킹트리/스테이징 변경 손실',
  },
  {
    // .env 파일을 변경하는 리디렉션/인플레이스 편집 (>, >>, sed -i, tee)
    // 예) echo X > .env, sed -i ... .env, tee .env, cat > .env.local
    pattern: /(>>?\s*[^\s|&;]*\.env|sed\s+-i[^\n]*\.env|\btee\s+[^\n]*\.env)/,
    riskLevel: 'blocked',
    reason: '.env 시크릿 파일 변경 금지',
  },
  {
    // 의존성 추가/설치: npm install, pnpm add, yarn add (공급망/네트워크 위험)
    // 단순 add라도 blocked. 'unknown' 명시 여부와 무관.
    pattern: /\b(npm\s+(install|i|add)|pnpm\s+(add|install|i)|yarn\s+add)\b/,
    riskLevel: 'blocked',
    reason: '의존성 추가/설치: 공급망 위험으로 승인 전 차단',
  },
  {
    // production deploy / vercel --prod / deploy
    pattern: /(\bvercel\b[^\n]*--prod\b|production\s+deploy|\bdeploy\b)/,
    riskLevel: 'blocked',
    reason: 'production 배포는 승인 없이 차단',
  },
  {
    // database migration apply / prisma migrate deploy / db push
    pattern: /(migration\s+apply|prisma\s+migrate\s+deploy|\bdb\s+push\b|\bdb:push\b)/,
    riskLevel: 'blocked',
    reason: '마이그레이션 적용/DB push는 스키마 파괴 위험으로 차단',
  },
  {
    // node_modules 직접 수정 (리디렉션/sed -i/rm/mv 등으로 경로 조작)
    pattern: /(>>?\s*[^\s|&;]*node_modules|sed\s+-i[^\n]*node_modules|\b(rm|mv|cp)\s+[^\n]*node_modules)/,
    riskLevel: 'blocked',
    reason: 'node_modules 직접 수정 금지',
  },
  {
    // .git 디렉토리 직접 수정
    pattern: /(>>?\s*[^\s|&;]*\.git\/|sed\s+-i[^\n]*\.git\/|\b(rm|mv|cp)\s+[^\n]*\.git\/)/,
    riskLevel: 'blocked',
    reason: '.git 내부 직접 수정 금지',
  },
];

// ───────────────────────────── WARNING 규칙 ─────────────────────────────
// blocked에 걸리지 않은 명령 중, 승인 권장이지만 즉시 차단은 아닌 것.
const WARNING_RULES: Rule[] = [
  {
    // 비실행/조회성 migration 명령: status / diff / create(파일 생성만) 등.
    // apply/deploy/db push 는 위 BLOCKED에서 이미 걸러진 뒤이므로 여기엔 안전한 것만 남는다.
    pattern: /(prisma\s+migrate\s+(dev|diff|status|resolve)|migration\s+(status|create|generate|diff))/,
    riskLevel: 'warning',
    reason: 'migration 비실행 명령: 승인 권장',
  },
];

/** 단일 명령 문자열을 검사한다. 빈 문자열/공백은 safe. */
export function checkCommand(cmd: string): CommandGuardResult {
  const norm = normalize(cmd);
  if (norm === '') {
    return { allowed: true, riskLevel: 'safe' };
  }

  for (const rule of BLOCKED_RULES) {
    if (rule.pattern.test(norm)) {
      return { allowed: false, riskLevel: 'blocked', reason: rule.reason };
    }
  }

  for (const rule of WARNING_RULES) {
    if (rule.pattern.test(norm)) {
      return { allowed: true, riskLevel: 'warning', reason: rule.reason };
    }
  }

  return { allowed: true, riskLevel: 'safe' };
}

/**
 * 여러 명령을 일괄 검사한다.
 * 하나라도 blocked면 allowed=false.
 */
export function checkCommands(cmds: string[]): {
  allowed: boolean;
  results: Array<{ cmd: string } & CommandGuardResult>;
} {
  const results = cmds.map((cmd) => ({ cmd, ...checkCommand(cmd) }));
  const allowed = results.every((r) => r.riskLevel !== 'blocked');
  return { allowed, results };
}
