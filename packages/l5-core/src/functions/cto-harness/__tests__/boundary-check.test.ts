import { matchGlob, checkBoundary, DEFAULT_BLOCKED } from '../boundary-check';

describe('matchGlob', () => {
  describe('리터럴 매칭', () => {
    it('정확히 일치하는 경로는 매칭된다', () => {
      expect(matchGlob('src/index.ts', 'src/index.ts')).toBe(true);
    });

    it('다른 경로는 매칭되지 않는다', () => {
      expect(matchGlob('src/index.ts', 'src/main.ts')).toBe(false);
    });

    it('부분 일치는 앵커링으로 거부된다', () => {
      expect(matchGlob('a/src/index.ts', 'src/index.ts')).toBe(false);
      expect(matchGlob('src/index.ts.bak', 'src/index.ts')).toBe(false);
    });

    it('정규식 메타문자는 리터럴로 처리된다', () => {
      expect(matchGlob('a.b', 'a.b')).toBe(true);
      expect(matchGlob('axb', 'a.b')).toBe(false);
    });
  });

  describe("'*' (슬래시 제외)", () => {
    it('슬래시 없는 임의 문자에 매칭된다', () => {
      expect(matchGlob('src/index.ts', 'src/*.ts')).toBe(true);
      expect(matchGlob('src/main.ts', 'src/*.ts')).toBe(true);
    });

    it('슬래시를 넘어가지 않는다', () => {
      expect(matchGlob('src/sub/index.ts', 'src/*.ts')).toBe(false);
    });

    it('빈 문자열에도 매칭된다(0개 이상)', () => {
      expect(matchGlob('src/.ts', 'src/*.ts')).toBe(true);
    });
  });

  describe("'**' (임의 경로 세그먼트들)", () => {
    it('슬래시를 포함한 임의 경로에 매칭된다', () => {
      expect(matchGlob('a/b/c/index.ts', '**/index.ts')).toBe(true);
      expect(matchGlob('index.ts', '**/index.ts')).toBe(true);
    });

    it('중간 세그먼트 와일드카드', () => {
      expect(matchGlob('packages/l5-core/src/x.ts', 'packages/**/x.ts')).toBe(true);
    });

    it('매칭되지 않는 경우', () => {
      expect(matchGlob('a/b/c/main.ts', '**/index.ts')).toBe(false);
    });
  });

  describe('.env 패턴', () => {
    it("'.env' 리터럴 매칭", () => {
      expect(matchGlob('.env', '.env')).toBe(true);
      expect(matchGlob('.env.local', '.env')).toBe(false);
    });

    it("'.env.*' 는 접미사 변형에 매칭", () => {
      expect(matchGlob('.env.local', '.env.*')).toBe(true);
      expect(matchGlob('.env.production', '.env.*')).toBe(true);
      expect(matchGlob('.env', '.env.*')).toBe(false);
    });

    it("'**/.env' 는 하위 경로의 .env 에 매칭", () => {
      expect(matchGlob('apps/web/.env', '**/.env')).toBe(true);
      expect(matchGlob('.env', '**/.env')).toBe(true);
    });
  });
});

describe('checkBoundary', () => {
  it('일반 파일은 .env/lockfile/node_modules 차단 패턴에 걸리지 않고 pass (범위 미지정)', () => {
    const result = checkBoundary(['src/index.ts'], [], []);
    expect(result.status).toBe('pass');
    expect(result.blocked).toEqual([]);
    expect(result.outOfScope).toEqual([]);
    expect(result.violations).toEqual([]);
  });

  describe('DEFAULT_BLOCKED 자동 차단', () => {
    it('.env 는 항상 차단', () => {
      const result = checkBoundary(['.env'], [], []);
      expect(result.status).toBe('fail');
      expect(result.blocked).toEqual(['.env']);
    });

    it('.env.local 은 .env.* 로 차단', () => {
      const result = checkBoundary(['.env.local'], [], []);
      expect(result.blocked).toEqual(['.env.local']);
    });

    it('하위 경로의 .env 는 **/.env 로 차단', () => {
      const result = checkBoundary(['apps/web/.env'], [], []);
      expect(result.blocked).toEqual(['apps/web/.env']);
    });

    it('node_modules 내부 파일은 차단', () => {
      const result = checkBoundary(['x/node_modules/pkg/index.js'], [], []);
      expect(result.blocked).toEqual(['x/node_modules/pkg/index.js']);
    });

    it('.git 내부 파일은 차단', () => {
      const result = checkBoundary(['repo/.git/config'], [], []);
      expect(result.blocked).toEqual(['repo/.git/config']);
    });

    it('lockfile 들은 차단', () => {
      const files = [
        'pnpm-lock.yaml',
        'apps/web/package-lock.json',
        'pkg/yarn.lock',
      ];
      const result = checkBoundary(files, [], []);
      expect(result.blocked).toEqual(files);
      expect(result.status).toBe('fail');
    });

    it('DEFAULT_BLOCKED 상수가 export 되어 있다', () => {
      expect(DEFAULT_BLOCKED).toContain('**/node_modules/**');
      expect(DEFAULT_BLOCKED).toContain('.env');
    });
  });

  describe('allowedFiles 범위 검사', () => {
    it('allowedFiles 밖 파일은 outOfScope', () => {
      const result = checkBoundary(
        ['src/other.ts'],
        ['src/feature/**'],
        [],
      );
      expect(result.outOfScope).toEqual(['src/other.ts']);
      expect(result.blocked).toEqual([]);
      expect(result.status).toBe('fail');
    });

    it('allowed 안 파일은 pass', () => {
      const result = checkBoundary(
        ['src/feature/a.ts', 'src/feature/b.ts'],
        ['src/feature/**'],
        [],
      );
      expect(result.status).toBe('pass');
      expect(result.outOfScope).toEqual([]);
      expect(result.violations).toEqual([]);
    });

    it('빈 allowedFiles 면 범위 검사를 스킵한다', () => {
      const result = checkBoundary(['anywhere/at/all.ts'], [], []);
      expect(result.outOfScope).toEqual([]);
      expect(result.status).toBe('pass');
    });
  });

  describe('blocked 가 outOfScope 보다 우선한다', () => {
    it('allowed 밖이면서 차단 패턴이면 blocked 에만 들어간다', () => {
      const result = checkBoundary(
        ['.env'],
        ['src/**'],
        [],
      );
      expect(result.blocked).toEqual(['.env']);
      expect(result.outOfScope).toEqual([]);
    });

    it('커스텀 blockedFiles 도 적용된다', () => {
      const result = checkBoundary(
        ['src/secret.ts'],
        ['src/**'],
        ['**/secret.ts'],
      );
      expect(result.blocked).toEqual(['src/secret.ts']);
      expect(result.outOfScope).toEqual([]);
    });
  });

  describe('혼합 시 violations 는 blocked ∪ outOfScope', () => {
    it('차단·범위이탈·정상 파일이 섞이면 정확히 분류된다', () => {
      const result = checkBoundary(
        ['.env', 'src/feature/ok.ts', 'src/other/bad.ts'],
        ['src/feature/**'],
        [],
      );
      expect(result.blocked).toEqual(['.env']);
      expect(result.outOfScope).toEqual(['src/other/bad.ts']);
      expect(result.violations).toEqual(['.env', 'src/other/bad.ts']);
      expect(result.status).toBe('fail');
    });
  });
});
