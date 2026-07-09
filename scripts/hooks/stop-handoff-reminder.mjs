#!/usr/bin/env node
// stop-handoff-reminder.mjs — Claude Code Stop hook.
// src 변경이 있는데 docs/HANDOFF.md·docs/TASKS.md가 미변경이면 리마인드 텍스트를
// additionalContext로 출력한다. 세션을 절대 막지 않는다(실패 시 조용히 exit 0).

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

    const isDoc = (p) => p === 'docs/HANDOFF.md' || p === 'docs/TASKS.md';
    // src 변경 = 코드/구현 산출물. docs·lockfile 자체는 제외.
    const isSrc = (p) =>
      /\.(ts|tsx|js|mjs|cjs|jsx|py|sql|json)$/.test(p) &&
      !isDoc(p) &&
      !p.startsWith('docs/');

    const hasSrc = paths.some(isSrc);
    const handoffTouched = paths.includes('docs/HANDOFF.md');
    const tasksTouched = paths.includes('docs/TASKS.md');

    if (hasSrc && !(handoffTouched && tasksTouched)) {
      const missing = [
        !handoffTouched ? 'docs/HANDOFF.md' : null,
        !tasksTouched ? 'docs/TASKS.md' : null,
      ]
        .filter(Boolean)
        .join(', ');
      const msg =
        `소스 변경이 있는데 ${missing}가 아직 갱신되지 않았습니다. ` +
        `CLAUDE.md "Done When" 규칙에 따라 작업 완료 전 ${missing}를 갱신하세요.`;
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
