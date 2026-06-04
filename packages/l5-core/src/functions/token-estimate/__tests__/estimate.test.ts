import { estimateTaskTokens, estimatePlanTokens, formatTokenRange } from '../estimate';

describe('estimateTaskTokens', () => {
  it('classifies a trivial task as TINY with 2 phases and a small budget', () => {
    const est = estimateTaskTokens('설정 페이지에 다크모드 토글 한 줄 추가', '간단한 추가');
    expect(est.task_class).toBe('TINY');
    expect(est.phase_count).toBe(2);
    expect(est.low).toBeGreaterThan(0);
    expect(est.high).toBeGreaterThan(est.low);
    expect(est.mid).toBe(Math.round((est.low + est.high) / 2));
  });

  it('gives a feature far more budget than a trivial task', () => {
    const tiny = estimateTaskTokens('오타 수정', '');
    const feature = estimateTaskTokens('검색 기능 구현', '전체 검색 파이프라인 구축');
    expect(feature.phase_count).toBeGreaterThan(tiny.phase_count);
    expect(feature.high).toBeGreaterThan(tiny.high);
  });

  it("uses the CTO's size judgment over keyword classification", () => {
    // Title would keyword-classify as FEATURE, but the CTO judged it tiny.
    const guessed = estimateTaskTokens('다크모드 토글 버튼 추가', '설정 페이지');
    const judged = estimateTaskTokens('다크모드 토글 버튼 추가', '설정 페이지', 'tiny');
    expect(guessed.task_class).toBe('FEATURE');
    expect(judged.task_class).toBe('TINY');
    expect(judged.high).toBeLessThan(guessed.high);
  });

  it('assigns a tier to every phase', () => {
    const est = estimateTaskTokens('검색 기능 구현', '신규 기능');
    expect(est.phases.length).toBe(est.phase_count);
    for (const p of est.phases) {
      expect(['T1', 'T2', 'T3']).toContain(p.tier);
      expect(p.high).toBeGreaterThanOrEqual(p.low);
    }
  });
});

describe('estimatePlanTokens', () => {
  it('sums per-task estimates into a plan total', () => {
    const plan = estimatePlanTokens([
      { title: '오타 수정', rationale: '' },
      { title: '검색 기능 구현', rationale: '신규 기능' },
    ]);
    expect(plan.task_count).toBe(2);
    expect(plan.tasks).toHaveLength(2);
    const expectedLow = plan.tasks.reduce((s, t) => s + t.low, 0);
    expect(plan.low).toBe(expectedLow);
    expect(plan.high).toBeGreaterThan(plan.low);
  });

  it('handles an empty plan', () => {
    const plan = estimatePlanTokens([]);
    expect(plan.task_count).toBe(0);
    expect(plan.low).toBe(0);
    expect(plan.high).toBe(0);
  });
});

describe('formatTokenRange', () => {
  it('rounds to k', () => {
    expect(formatTokenRange(45000, 110000)).toBe('약 45k–110k 토큰');
  });
});
