import { checkCommand, checkCommands } from '../command-guard';

describe('checkCommand — PRD §14.8 예시', () => {
  it("'pnpm typecheck' → safe / allowed", () => {
    const r = checkCommand('pnpm typecheck');
    expect(r.riskLevel).toBe('safe');
    expect(r.allowed).toBe(true);
  });

  it("'pnpm build' → safe", () => {
    const r = checkCommand('pnpm build');
    expect(r.riskLevel).toBe('safe');
    expect(r.allowed).toBe(true);
  });

  it("'pnpm add unknown-package' → blocked", () => {
    const r = checkCommand('pnpm add unknown-package');
    expect(r.riskLevel).toBe('blocked');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBeDefined();
  });

  it("'git push origin main' → blocked", () => {
    const r = checkCommand('git push origin main');
    expect(r.riskLevel).toBe('blocked');
    expect(r.allowed).toBe(false);
  });

  it("'rm -rf .' → blocked", () => {
    const r = checkCommand('rm -rf .');
    expect(r.riskLevel).toBe('blocked');
    expect(r.allowed).toBe(false);
  });
});

describe('checkCommand — safe 명령들', () => {
  it.each([
    'pnpm test',
    'pnpm lint',
    'git status',
    'git diff',
    'ls',
    'ls -la src',
  ])("'%s' → safe", (cmd) => {
    const r = checkCommand(cmd);
    expect(r.riskLevel).toBe('safe');
    expect(r.allowed).toBe(true);
  });

  it('빈 문자열 → safe', () => {
    const r = checkCommand('');
    expect(r.riskLevel).toBe('safe');
    expect(r.allowed).toBe(true);
  });

  it('공백만 → safe', () => {
    const r = checkCommand('   ');
    expect(r.riskLevel).toBe('safe');
    expect(r.allowed).toBe(true);
  });
});

describe('checkCommand — rm -rf 변형', () => {
  it.each([
    'rm -rf node_modules',
    'rm -fr build',
    'rm -r -f dist',
    'RM -RF /tmp/x', // 대소문자 유연
  ])("'%s' → blocked", (cmd) => {
    expect(checkCommand(cmd).riskLevel).toBe('blocked');
  });
});

describe('checkCommand — git push 계열', () => {
  it.each([
    'git push',
    'git push origin main',
    'git push --force',
    'git push -f origin feature',
    'git   push    --force-with-lease', // 공백 유연
  ])("'%s' → blocked", (cmd) => {
    const r = checkCommand(cmd);
    expect(r.riskLevel).toBe('blocked');
    expect(r.allowed).toBe(false);
  });
});

describe('checkCommand — git reset --hard', () => {
  it('reset --hard → blocked', () => {
    expect(checkCommand('git reset --hard HEAD~1').riskLevel).toBe('blocked');
  });

  it('reset --soft 는 reset --hard 가 아니므로 safe', () => {
    expect(checkCommand('git reset --soft HEAD~1').riskLevel).toBe('safe');
  });
});

describe('checkCommand — .env 수정', () => {
  it.each([
    'echo "SECRET=1" > .env',
    'echo "X=2" >> .env.local',
    'sed -i "s/a/b/" .env',
    'tee .env',
    'cat secrets > .env.production',
  ])("'%s' → blocked", (cmd) => {
    expect(checkCommand(cmd).riskLevel).toBe('blocked');
  });

  it('.env 읽기(cat .env)는 수정이 아니므로 차단 대상 아님', () => {
    expect(checkCommand('cat .env').riskLevel).toBe('safe');
  });
});

describe('checkCommand — 의존성 추가/설치', () => {
  it.each([
    'npm install',
    'npm i lodash',
    'npm add react',
    'pnpm add zod',
    'pnpm install',
    'yarn add express',
    'pnpm add unknown',
  ])("'%s' → blocked", (cmd) => {
    const r = checkCommand(cmd);
    expect(r.riskLevel).toBe('blocked');
    expect(r.allowed).toBe(false);
  });
});

describe('checkCommand — production deploy', () => {
  it.each([
    'vercel --prod',
    'production deploy',
    'deploy',
    'npm run deploy',
  ])("'%s' → blocked", (cmd) => {
    expect(checkCommand(cmd).riskLevel).toBe('blocked');
  });
});

describe('checkCommand — migration apply / db push', () => {
  it.each([
    'database migration apply',
    'migration apply',
    'prisma migrate deploy',
    'db push',
    'prisma db push',
  ])("'%s' → blocked", (cmd) => {
    expect(checkCommand(cmd).riskLevel).toBe('blocked');
  });

  it('migration status → warning (비실행 조회)', () => {
    const r = checkCommand('prisma migrate status');
    expect(r.riskLevel).toBe('warning');
    expect(r.allowed).toBe(true);
  });

  it('migration diff → warning', () => {
    expect(checkCommand('prisma migrate diff').riskLevel).toBe('warning');
  });
});

describe('checkCommand — node_modules / .git 직접 수정', () => {
  it.each([
    'rm node_modules/foo/index.js',
    'echo x > node_modules/.bin/y',
    'rm .git/config',
    'echo x > .git/HEAD',
  ])("'%s' → blocked", (cmd) => {
    expect(checkCommand(cmd).riskLevel).toBe('blocked');
  });
});

describe('checkCommands — 일괄 검사', () => {
  it('모두 safe면 allowed=true', () => {
    const r = checkCommands(['pnpm typecheck', 'pnpm build', 'git status']);
    expect(r.allowed).toBe(true);
    expect(r.results).toHaveLength(3);
    expect(r.results.every((x) => x.riskLevel === 'safe')).toBe(true);
  });

  it('하나라도 blocked면 allowed=false', () => {
    const r = checkCommands([
      'pnpm typecheck',
      'git push origin main',
      'pnpm test',
    ]);
    expect(r.allowed).toBe(false);
    expect(r.results[1].riskLevel).toBe('blocked');
    expect(r.results[1].cmd).toBe('git push origin main');
  });

  it('warning 만 있으면 allowed=true', () => {
    const r = checkCommands(['pnpm build', 'prisma migrate status']);
    expect(r.allowed).toBe(true);
    expect(r.results[1].riskLevel).toBe('warning');
  });

  it('빈 배열 → allowed=true, results 비어있음', () => {
    const r = checkCommands([]);
    expect(r.allowed).toBe(true);
    expect(r.results).toHaveLength(0);
  });
});
