#!/usr/bin/env node
// command-guard.mjs — Claude Code PreToolUse(Bash) 가드.
// stdin으로 {tool_name, tool_input:{command}} JSON을 받아 §19.1(.claude/rules/00-global.md)
// 금지 패턴이면 exit 2 + stderr에 한국어 차단 사유, 아니면 exit 0.
//
// 트레이드오프: 정규식은 명령 문자열 전체를 본다. `grep -r "rm -rf" src` 처럼
// 인용문 안에 금지어가 등장하는 경우도 차단될 수 있다(false positive). 안전(fail-closed)을
// 우선해 그대로 차단한다 — 오탐이 나면 사용자가 명령을 바꾸면 되지만, 놓치면 파괴적이다.

const FORBIDDEN = [
  {
    re: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i,
    reason: 'rm -rf (재귀 강제 삭제)는 §19.1 금지 명령입니다.',
  },
  {
    re: /git\s+push\s+.*(--force\b|--force-with-lease\b|-f\b)/i,
    reason: 'git push --force(-f)는 §19.1 금지 명령입니다. 원격 히스토리를 덮어씁니다.',
  },
  {
    re: /git\s+reset\s+--hard\s+(main|origin\/main)\b/i,
    reason: 'git reset --hard main|origin/main은 §19.1 금지 명령입니다. 로컬 변경을 파괴합니다.',
  },
  {
    // .env 파일에 대한 쓰기(redirect, sed -i, tee, cp/mv 대상). 단순 read/cat/grep은 허용.
    re: />>?\s*[^\s|;&]*\.env\b|(sed\s+-i|tee|cp|mv)\s+[^\n;|&]*\.env(\b|$)/i,
    reason: '.env 파일 수정은 §19.1 금지 명령입니다. 시크릿/설정 파일은 손대지 않습니다.',
  },
  {
    re: /vercel\s+.*--prod\b|--prod\b.*vercel|(netlify\s+deploy\s+.*--prod)|(wrangler\s+(deploy|publish)\b)/i,
    reason: 'production deploy(vercel --prod 등)는 §19.1 금지 명령입니다.',
  },
  {
    re: /(migrate:(up|apply|deploy))|(migration\s+(apply|up))|(prisma\s+migrate\s+deploy)|(knex\s+migrate:latest)|(:migrate\b)/i,
    reason: 'DB migration apply(migrate:up/apply 류)는 §19.1 금지 명령입니다.',
  },
];

function check(command) {
  if (typeof command !== 'string') return null;
  for (const rule of FORBIDDEN) {
    if (rule.re.test(command)) return rule.reason;
  }
  return null;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    // stdin이 없으면 곧바로 빈 문자열
    if (process.stdin.isTTY) resolve('');
  });
}

function selfTest() {
  const blocked = [
    'rm -rf /tmp/x',
    'rm -fr build',
    'sudo rm -rf /',
    'git push --force origin main',
    'git push -f origin feat/x',
    'git reset --hard main',
    'git reset --hard origin/main',
    'echo FOO=bar > .env',
    'sed -i "" s/a/b/ .env',
    'vercel deploy --prod',
    'pnpm db:migrate:up',
    'prisma migrate deploy',
  ];
  const allowed = [
    'pnpm build',
    'pnpm test',
    'git commit -m "feat: x"',
    'cat .env.example',
    'grep FOO .env',
    'git status',
    'ls -la',
    'node scripts/hooks/command-guard.mjs --self-test',
    'git push origin feat/x',
    'pnpm typecheck',
  ];
  let fail = 0;
  for (const c of blocked) {
    if (!check(c)) {
      console.log(`FAIL(차단돼야 함): ${c}`);
      fail++;
    }
  }
  for (const c of allowed) {
    const r = check(c);
    if (r) {
      console.log(`FAIL(허용돼야 함): ${c} -> ${r}`);
      fail++;
    }
  }
  if (fail === 0) {
    console.log(`PASS: 차단 ${blocked.length}건, 허용 ${allowed.length}건 모두 통과`);
    process.exit(0);
  } else {
    console.log(`FAIL: ${fail}건 불일치`);
    process.exit(1);
  }
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // 파싱 실패 시 게이트를 막지 않는다(hook 오작동이 세션을 막으면 안 됨).
    process.exit(0);
  }
  const command = payload?.tool_input?.command;
  const reason = check(command);
  if (reason) {
    process.stderr.write(`[command-guard] 차단됨: ${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

main();
