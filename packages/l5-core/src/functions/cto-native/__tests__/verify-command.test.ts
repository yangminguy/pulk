import { buildVerifyCommand } from '../verify-command';

describe('buildVerifyCommand (디렉토리 기반 견고 검증)', () => {
  it('패키지 + 테스트 디렉토리', () => {
    expect(buildVerifyCommand({ packageDir: '/repo/pkg', testDir: 'src/foo' })).toBe(
      'cd /repo/pkg && corepack pnpm exec tsc --noEmit && corepack pnpm exec jest src/foo',
    );
  });

  it('testDir 생략 시 패키지 전체 jest', () => {
    expect(buildVerifyCommand({ packageDir: '/repo/pkg' })).toBe(
      'cd /repo/pkg && corepack pnpm exec tsc --noEmit && corepack pnpm exec jest',
    );
  });

  it('skipTypecheck면 tsc 제외(문서 phase)', () => {
    expect(buildVerifyCommand({ packageDir: '/repo/pkg', skipTypecheck: true })).toBe(
      'cd /repo/pkg && corepack pnpm exec jest',
    );
  });

  it('jestArgs(커스텀 config) 반영', () => {
    expect(
      buildVerifyCommand({ packageDir: '/repo/yt', testDir: 'src/__tests__', jestArgs: '--config jest.config.cjs' }),
    ).toBe('cd /repo/yt && corepack pnpm exec tsc --noEmit && corepack pnpm exec jest --config jest.config.cjs src/__tests__');
  });
});
