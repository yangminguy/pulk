// verify-command.ts — 견고한 verify_command 생성기(순수).
// 실전 교훈(2026-06-11): verify_command에 정확한 테스트 파일 경로를 하드코딩하면,
// 에이전트가 파일명을 조금 다르게 지을 때 jest "0 matches(No tests found)"로 실패해
// 멀쩡한 작업이 통째로 버려진다. → 항상 디렉토리(또는 패키지 전체)로 돌린다.

export interface BuildVerifyCommandInput {
  /** tsc/jest를 돌릴 패키지 디렉토리(절대경로). */
  packageDir: string;
  /** jest 대상 디렉토리(생략 시 패키지 전체). ★파일 경로 금지 — 디렉토리만. */
  testDir?: string;
  /** 추가 jest 인자(예: '--config jest.config.cjs'). */
  jestArgs?: string;
  /** tsc 생략(문서 등 비코드 phase). */
  skipTypecheck?: boolean;
}

/**
 * `cd <packageDir> && tsc --noEmit && jest [testDir]` 형태의 verify_command를 만든다.
 * testDir은 디렉토리만 받는다(파일명 하드코딩 방지). 비면 패키지 전체 jest.
 */
export function buildVerifyCommand(input: BuildVerifyCommandInput): string {
  const parts: string[] = [`cd ${input.packageDir}`];
  if (!input.skipTypecheck) parts.push('corepack pnpm exec tsc --noEmit');
  const args = [input.jestArgs, input.testDir].filter(Boolean).join(' ');
  parts.push(`corepack pnpm exec jest${args ? ` ${args}` : ''}`);
  return parts.join(' && ');
}
