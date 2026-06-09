import { recordVideoPerformance } from '../performance-ingestion';

describe('recordVideoPerformance', () => {
  it('유효 입력 → 검증된 PerformanceRecord + 결정론 summary', () => {
    const rec = recordVideoPerformance({
      project_id: 'p1',
      view_count: 12345,
      completion_rate: 0.42,
      ctr: 0.06,
      retention_notes: '  도입 30초 이탈 큼  ',
      feedback: '댓글 호응 좋음',
    });
    expect(rec.project_id).toBe('p1');
    expect(rec.completion_rate).toBe(0.42);
    expect(rec.retention_notes).toBe('도입 30초 이탈 큼'); // trim
    expect(rec.summary).toContain('완료율 42%');
    expect(rec.summary).toContain('CTR 6%');
  });

  it('선택 필드 미입력 → record에서 생략', () => {
    const rec = recordVideoPerformance({ project_id: 'p1', view_count: 0, completion_rate: 0, ctr: 0 });
    expect(rec.retention_notes).toBeUndefined();
    expect(rec.feedback).toBeUndefined();
  });

  it('비율이 범위를 벗어나면 throw', () => {
    expect(() =>
      recordVideoPerformance({ project_id: 'p1', view_count: 1, completion_rate: 1.5, ctr: 0.1 }),
    ).toThrow();
  });

  it('음수 조회수는 throw', () => {
    expect(() =>
      recordVideoPerformance({ project_id: 'p1', view_count: -1, completion_rate: 0.1, ctr: 0.1 }),
    ).toThrow();
  });
});
