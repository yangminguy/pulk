#!/usr/bin/env node
// stop-handoff-reminder.mjs — Claude Code Stop hook.
// src 변경이 있는데 docs/TASK.md가 미변경이면 리마인드 텍스트를 additionalContext로
// 출력한다. 세션을 절대 막지 않는다(실패 시 조용히 exit 0).
// 2026-07-17: 문서 재정리(2026-07-15)로 HANDOFF.md/TASKS.md는 아카이브됨 →
// 정본 docs/TASK.md(단수) 하나만 검사하도록 갱신.

import { execSync } from 'node:child_process';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) resolve('');
  });
}

async function main() {
  try {
    const raw = await readStdin();
    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      /* stdin이 비었거나 깨져도 계속 진행 */
    }
    const repo = payload?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

    const out = execSync(`git -C "${repo}" status --porcelain`, {
      encoding: 'utf8',
    });
    const lines = out.split('\n').filter(Boolean);

    // 변경 파일 경로만 추출(상태코드 3칸 제거, rename의 -> 처리).
    const paths = lines.map((l) => {
      const p = l.slice(3);
      const arrow = p.indexOf(' -> ');
      return arrow >= 0 ? p.slice(arrow + 4) : p;
    });

    // src 변경 = 코드/구현 산출물. docs·lockfile 자체는 제외.
    const isSrc = (p) =>
      /\.(ts|tsx|js|mjs|cjs|jsx|py|sql|json)$/.test(p) &&
      !p.startsWith('docs/');

    const hasSrc = paths.some(isSrc);
    const taskTouched = paths.includes('docs/TASK.md');

    if (hasSrc && !taskTouched) {
      const msg =
        `소스 변경이 있는데 docs/TASK.md가 아직 갱신되지 않았습니다. ` +
        `CLAUDE.md "Done When" 규칙에 따라 작업 완료 전 docs/TASK.md를 갱신하세요.`;
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: msg,
          },
        }) + '\n',
      );
    }
  } catch {
    /* 어떤 실패도 세션을 막지 않는다 */
  }
  process.exit(0);
}

main();
