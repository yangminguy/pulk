// S2 — evidence 기반 복잡도 분류 테스트.

import { classifyComplexityWithEvidence } from '../complexity-evidence';
import type { RepoScoutReport } from '../../cto-planning/scout';

const scoutWith = (paths: string[]): RepoScoutReport => ({
  repo_path: '/r',
  modules: [],
  keyword_matches: paths.map((p) => ({ path: p, reason: 'test' })),
  warnings: [],
});

describe('classifyComplexityWithEvidence', () => {
  it('경로 근거 없는 위험 키워드는 승격하지 않는다 (구버전은 C4)', () => {
    const r = classifyComplexityWithEvidence({
      keywords: ['env'],
      expectedFiles: ['docs/setup-guide.md'],
    });
    expect(r.complexity).not.toBe('C4');
    expect(r.evidence.some((e) => e.kind === 'discounted' && e.note.includes("'env'"))).toBe(true);
  });

  it('경로 근거가 있는 위험 키워드는 C4로 승격한다', () => {
    const r = classifyComplexityWithEvidence({
      keywords: ['auth'],
      expectedFiles: ['src/auth/login.ts'],
    });
    expect(r.complexity).toBe('C4');
    expect(r.evidence.some((e) => e.kind === 'used' && e.note.includes("'auth'"))).toBe(true);
  });

  it('scout 매칭 경로도 키워드 근거로 인정한다', () => {
    const r = classifyComplexityWithEvidence({
      keywords: ['payment'],
      scout: scoutWith(['services/billing/payment-api.ts']),
    });
    expect(r.complexity).toBe('C4');
  });

  it('expectedFiles 개수로 fileCount를 실측 추정한다 (3개 → C2)', () => {
    const r = classifyComplexityWithEvidence({
      expectedFiles: ['a.ts', 'b.ts', 'c.ts'],
    });
    expect(r.complexity).toBe('C2');
    expect(r.evidence.some((e) => e.note.includes('fileCount=3'))).toBe(true);
  });

  it('명시 fileCount가 expectedFiles보다 우선한다', () => {
    const r = classifyComplexityWithEvidence({
      fileCount: 1,
      expectedFiles: ['a.ts', 'b.ts', 'c.ts'],
    });
    expect(r.complexity).toBe('C1');
  });

  it('touches* 명시 플래그는 그대로 존중한다', () => {
    const r = classifyComplexityWithEvidence({ touchesAuth: true, expectedFiles: ['x.md'] });
    expect(r.complexity).toBe('C4');
  });

  it('위험 목록 밖 키워드는 영향 없이 통과한다', () => {
    const r = classifyComplexityWithEvidence({
      keywords: ['notion'],
      expectedFiles: ['a.ts'],
    });
    expect(r.complexity).toBe('C1');
  });

  it('신호 없음 → 기본 C1 + 최종 evidence 기록', () => {
    const r = classifyComplexityWithEvidence({});
    expect(r.complexity).toBe('C1');
    expect(r.evidence.some((e) => e.note.includes('최종 복잡도 C1'))).toBe(true);
  });
});
