import { buildMemoryReviewBrief, applyMemoryDecision } from '../reviewer';
import type { MemoryCandidate } from '../types';

function makeCandidate(over: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    source_task_id: 'task-1',
    source_agent: 'CMO',
    insight: '고객 세그먼트별 반응 차이가 크다',
    workflow_improvement: '세그먼트 별도 실험 추가',
    pii_level: 'none',
    ...over,
  };
}

describe('buildMemoryReviewBrief', () => {
  it('sets total_count to the number of candidates', () => {
    const candidates = [makeCandidate(), makeCandidate({ source_task_id: 'task-2' })];
    const brief = buildMemoryReviewBrief(candidates);
    expect(brief.total_count).toBe(2);
  });

  it('includes all candidates in the brief', () => {
    const candidates = [makeCandidate()];
    const brief = buildMemoryReviewBrief(candidates);
    expect(brief.candidates).toHaveLength(1);
    expect(brief.candidates[0].source_task_id).toBe('task-1');
  });

  it('returns total_count of 0 for empty input', () => {
    const brief = buildMemoryReviewBrief([]);
    expect(brief.total_count).toBe(0);
    expect(brief.candidates).toHaveLength(0);
  });

  it('sets review_date as a date string', () => {
    const brief = buildMemoryReviewBrief([]);
    expect(brief.review_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('sets generated_at as an ISO string', () => {
    const brief = buildMemoryReviewBrief([]);
    expect(() => new Date(brief.generated_at)).not.toThrow();
    expect(new Date(brief.generated_at).toISOString()).toBe(brief.generated_at);
  });
});

describe('applyMemoryDecision', () => {
  it('returns ok=true and decision="saved" when saving', () => {
    const candidate = makeCandidate();
    const result = applyMemoryDecision(candidate, {
      source_task_id: 'task-1',
      decision: 'saved',
    });
    expect(result.ok).toBe(true);
    expect(result.decision).toBe('saved');
    expect(result.source_task_id).toBe('task-1');
  });

  it('returns ok=true and decision="discarded" when discarding', () => {
    const candidate = makeCandidate();
    const result = applyMemoryDecision(candidate, {
      source_task_id: 'task-1',
      decision: 'discarded',
    });
    expect(result.ok).toBe(true);
    expect(result.decision).toBe('discarded');
  });

  it('includes a non-empty message', () => {
    const candidate = makeCandidate();
    const result = applyMemoryDecision(candidate, {
      source_task_id: 'task-1',
      decision: 'saved',
    });
    expect(result.message.length).toBeGreaterThan(0);
  });
});
