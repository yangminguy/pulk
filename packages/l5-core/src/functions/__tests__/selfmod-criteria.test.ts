import { buildSelfModAcceptanceCriteria } from '../tool-request';

describe('buildSelfModAcceptanceCriteria', () => {
  it('always includes branch-isolation and approval-gate criteria', () => {
    const c = buildSelfModAcceptanceCriteria({ task_title: 'X' });
    expect(c.length).toBe(5);
    expect(c.some(x => x.includes('브랜치'))).toBe(true);
    expect(c.some(x => x.includes('founder 승인'))).toBe(true);
  });
  it('extracts the pattern from source_ref', () => {
    const c = buildSelfModAcceptanceCriteria({ source_ref: 'repetition-pattern:abc-123' });
    expect(c.some(x => x.includes('abc-123'))).toBe(true);
  });
  it('falls back to task_title then default', () => {
    expect(buildSelfModAcceptanceCriteria({ task_title: '영상 자동화' }).some(x => x.includes('영상 자동화'))).toBe(true);
    expect(buildSelfModAcceptanceCriteria({}).some(x => x.includes('제안된 개선'))).toBe(true);
  });
  it('strips secondbrain-watch source_ref (date suffix) and falls back to title', () => {
    const c = buildSelfModAcceptanceCriteria({
      source_ref: 'secondbrain-watch:2026-06-06',
      task_title: 'CMO 운영전략 업그레이드',
    });
    expect(c.some(x => x.includes('CMO 운영전략 업그레이드'))).toBe(true);
    expect(c.some(x => x.includes('2026-06-06'))).toBe(false);
  });
});
