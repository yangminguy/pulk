import {
  classifyComplexity,
  complexityToMode,
  complexityToHarnessMode,
  buildVerificationProfile,
} from '../complexity-router';
import type { Complexity } from '../types';

describe('classifyComplexity', () => {
  // ── C4: 위험 영역 터치 (가장 우선) ──
  it('touchesAuth → C4', () => {
    expect(classifyComplexity({ touchesAuth: true })).toBe('C4');
  });
  it('touchesPayment → C4', () => {
    expect(classifyComplexity({ touchesPayment: true })).toBe('C4');
  });
  it('touchesMigration → C4', () => {
    expect(classifyComplexity({ touchesMigration: true })).toBe('C4');
  });
  it('touchesDeploy → C4', () => {
    expect(classifyComplexity({ touchesDeploy: true })).toBe('C4');
  });
  it('touchesEnv → C4', () => {
    expect(classifyComplexity({ touchesEnv: true })).toBe('C4');
  });
  it('touchesRunner → C4', () => {
    expect(classifyComplexity({ touchesRunner: true })).toBe('C4');
  });

  // ── C4: 위험 플래그/키워드가 fileCount보다 우선 ──
  it('위험 플래그는 fileCount=1(C1 후보)보다 우선해 C4', () => {
    expect(classifyComplexity({ touchesAuth: true, fileCount: 1 })).toBe('C4');
  });
  it('위험 플래그는 doc-only보다 우선해 C4', () => {
    expect(classifyComplexity({ touchesEnv: true, isDocOnly: true })).toBe('C4');
  });
  it('위험 플래그는 isLargeRefactor(C5)보다 우선해 C4', () => {
    expect(
      classifyComplexity({ touchesDeploy: true, isLargeRefactor: true }),
    ).toBe('C4');
  });

  // ── C4: 위험 키워드 ──
  it.each([
    'auth',
    'payment',
    'migration',
    'deploy',
    'env',
    'secret',
    'credential',
    'runner',
  ])('위험 키워드 "%s" → C4', (kw) => {
    expect(classifyComplexity({ keywords: [kw], fileCount: 1 })).toBe('C4');
  });
  it('위험 키워드는 대소문자 무시 (AUTH) → C4', () => {
    expect(classifyComplexity({ keywords: ['AUTH'] })).toBe('C4');
  });
  it('위험 키워드가 fileCount=3(C2 후보)보다 우선해 C4', () => {
    expect(classifyComplexity({ keywords: ['secret'], fileCount: 3 })).toBe(
      'C4',
    );
  });
  it('비위험 키워드만 있으면 승격 안 됨', () => {
    expect(classifyComplexity({ keywords: ['button'], fileCount: 3 })).toBe(
      'C2',
    );
  });

  // ── C5: 대형 리팩터링 ──
  it('isLargeRefactor → C5', () => {
    expect(classifyComplexity({ isLargeRefactor: true })).toBe('C5');
  });
  it('isLargeRefactor는 doc-only보다 우선해 C5', () => {
    expect(
      classifyComplexity({ isLargeRefactor: true, isDocOnly: true }),
    ).toBe('C5');
  });
  it('isLargeRefactor는 fileCount=10보다 우선해 C5', () => {
    expect(
      classifyComplexity({ isLargeRefactor: true, fileCount: 10 }),
    ).toBe('C5');
  });

  // ── C0: 문서 전용 ──
  it('isDocOnly (위험 아님) → C0', () => {
    expect(classifyComplexity({ isDocOnly: true })).toBe('C0');
  });
  it('isDocOnly는 fileCount=20여도 C0', () => {
    expect(classifyComplexity({ isDocOnly: true, fileCount: 20 })).toBe('C0');
  });

  // ── C1: 1파일 이하 / 50줄 이하 ──
  it('fileCount=1 → C1', () => {
    expect(classifyComplexity({ fileCount: 1 })).toBe('C1');
  });
  it('fileCount=0 → C1', () => {
    expect(classifyComplexity({ fileCount: 0 })).toBe('C1');
  });
  it('changedLines=50 (경계) → C1', () => {
    expect(classifyComplexity({ changedLines: 50 })).toBe('C1');
  });
  it('changedLines<=50 이면 fileCount가 많아도 C1', () => {
    expect(classifyComplexity({ changedLines: 30, fileCount: 8 })).toBe('C1');
  });

  // ── C2: 2~5 파일 ──
  it('fileCount=2 (경계) → C2', () => {
    expect(classifyComplexity({ fileCount: 2 })).toBe('C2');
  });
  it('fileCount=5 (경계) → C2', () => {
    expect(classifyComplexity({ fileCount: 5 })).toBe('C2');
  });
  it('fileCount=3 → C2', () => {
    expect(classifyComplexity({ fileCount: 3 })).toBe('C2');
  });

  // ── C3: 6+ 파일 ──
  it('fileCount=6 (경계) → C3', () => {
    expect(classifyComplexity({ fileCount: 6 })).toBe('C3');
  });
  it('fileCount=20 → C3', () => {
    expect(classifyComplexity({ fileCount: 20 })).toBe('C3');
  });

  // ── C1 기본 ──
  it('빈 객체 → C1 기본', () => {
    expect(classifyComplexity({})).toBe('C1');
  });
  it('changedLines만 51이고 fileCount 없으면 신호 부족 → C1 기본', () => {
    expect(classifyComplexity({ changedLines: 51 })).toBe('C1');
  });
});

describe('complexityToMode', () => {
  const cases: Array<[Complexity, ReturnType<typeof complexityToMode>]> = [
    ['C0', 'safe_solo'],
    ['C1', 'safe_solo'],
    ['C2', 'implement_verify'],
    ['C3', 'strict_sandbox'],
    ['C4', 'strict_sandbox'],
    ['C5', 'parallel_patch_queue'],
  ];
  it.each(cases)('%s → %s', (c, mode) => {
    expect(complexityToMode(c)).toBe(mode);
  });
});

describe('complexityToHarnessMode', () => {
  const cases: Array<[Complexity, ReturnType<typeof complexityToHarnessMode>]> = [
    ['C0', 'direct'],
    ['C1', 'safe_solo'],
    ['C2', 'standard'],
    ['C3', 'strict'],
    ['C4', 'strict'],
    ['C5', 'parallel_patch'],
  ];
  it.each(cases)('%s → %s', (c, mode) => {
    expect(complexityToHarnessMode(c)).toBe(mode);
  });
});

describe('buildVerificationProfile', () => {
  it('C0: boundary만 true', () => {
    expect(buildVerificationProfile('C0')).toEqual({
      typecheck: false,
      lint: false,
      test: false,
      build: false,
      playwright: false,
      boundary: true,
    });
  });

  it('C1: typecheck + boundary', () => {
    expect(buildVerificationProfile('C1')).toEqual({
      typecheck: true,
      lint: false,
      test: false,
      build: false,
      playwright: false,
      boundary: true,
    });
  });

  it('C2: typecheck + build + boundary (test 제외)', () => {
    expect(buildVerificationProfile('C2')).toEqual({
      typecheck: true,
      lint: false,
      test: false,
      build: true,
      playwright: false,
      boundary: true,
    });
  });

  it('C2 + isUI: playwright on', () => {
    expect(buildVerificationProfile('C2', { isUI: true }).playwright).toBe(true);
  });

  it('C3: typecheck + test + build + boundary', () => {
    expect(buildVerificationProfile('C3')).toEqual({
      typecheck: true,
      lint: false,
      test: true,
      build: true,
      playwright: false,
      boundary: true,
    });
  });

  it('C3 + isUI: playwright on', () => {
    expect(buildVerificationProfile('C3', { isUI: true }).playwright).toBe(true);
  });

  it('C4: typecheck + lint + test + build + boundary', () => {
    expect(buildVerificationProfile('C4')).toEqual({
      typecheck: true,
      lint: true,
      test: true,
      build: true,
      playwright: false,
      boundary: true,
    });
  });

  it('C4 + isUI: playwright on', () => {
    expect(buildVerificationProfile('C4', { isUI: true }).playwright).toBe(true);
  });

  it('C5: C4와 동일', () => {
    expect(buildVerificationProfile('C5')).toEqual(
      buildVerificationProfile('C4'),
    );
  });

  it('C5 + isUI: playwright on', () => {
    expect(buildVerificationProfile('C5', { isUI: true }).playwright).toBe(true);
  });

  it('isUI=false면 비-UI 복잡도에서 playwright off', () => {
    expect(buildVerificationProfile('C3', { isUI: false }).playwright).toBe(
      false,
    );
  });
});
