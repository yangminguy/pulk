// phase-prompt.ts — phase 실행 프롬프트 합성(순수 함수, 부작용 없음).
// CTO가 만든 phase.prompt_packet 앞뒤로 실행 지시/경계를 주입한다. 토큰 풀 분산을 위해
// QA·테스트는 codex로, UI는 agy로 위임하라는 지시를 포함한다.

import type { CTOPhase } from '@l5/core';

export interface BuildPhasePromptOptions {
  cwd: string;
  allowedFiles?: string[];
}

const HEADER = [
  '이 phase의 작업을 실행하라. 무거운 설계/구현은 직접 수행하고, QA·테스트는 codex를',
  '[codex exec --cd <cwd> "..." < /dev/null] 로, UI는 agy를',
  '[agy --sandbox --add-dir <cwd> -p "..."] 로 호출해 토큰 풀을 분산하라.',
  'allowedFiles 밖 파일 수정 금지. 완료 기준 충족까지.',
  '',
  '작업을 마치면 마지막 출력에 전체 작업 보고서 본문을 담아라:',
  '(1) 무엇을 했는지 (2) 변경/생성한 파일 목록 (3) 검증 방법과 결과.',
  "'위에 작성함/요약함' 식 참조 금지 — 보고서 본문 자체를 마지막 출력에 써라.",
].join('\n');

/**
 * phase 실행 프롬프트를 합성한다.
 *  - 앞: 실행 지시 헤더(<cwd> 자리표시자를 실제 cwd로 치환)
 *  - 중: phase.prompt_packet 원문
 *  - 뒤: cwd / allowedFiles 목록
 */
export function buildPhaseExecutionPrompt(
  phase: CTOPhase,
  opts: BuildPhasePromptOptions,
): string {
  const { cwd, allowedFiles } = opts;
  const header = HEADER.replace(/<cwd>/g, cwd);

  const footerLines: string[] = ['', `cwd: ${cwd}`];
  if (allowedFiles && allowedFiles.length > 0) {
    footerLines.push('allowedFiles:');
    for (const f of allowedFiles) {
      footerLines.push(`  - ${f}`);
    }
  } else {
    footerLines.push('allowedFiles: (제한 없음)');
  }

  return [header, '', phase.prompt_packet, footerLines.join('\n')].join('\n');
}
