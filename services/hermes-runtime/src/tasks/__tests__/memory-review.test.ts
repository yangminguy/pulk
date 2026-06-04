import { runMemoryReviewGenerator } from '../memory-review-generator';
import type { MemoryCandidate } from '@l5/core';

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

describe('runMemoryReviewGenerator', () => {
  it('does not call notifier when candidates list is empty', async () => {
    const notifier = jest.fn().mockResolvedValue(true);
    const result = await runMemoryReviewGenerator([], notifier);

    expect(notifier).not.toHaveBeenCalled();
    expect(result.notification_sent).toBe(false);
  });

  it('calls notifier when candidates are present', async () => {
    const notifier = jest.fn().mockResolvedValue(true);
    const result = await runMemoryReviewGenerator([makeCandidate()], notifier);

    expect(notifier).toHaveBeenCalledTimes(1);
    expect(result.notification_sent).toBe(true);
  });

  it('returns correct candidate_count', async () => {
    const notifier = jest.fn().mockResolvedValue(true);
    const candidates = [
      makeCandidate({ source_task_id: 'task-1' }),
      makeCandidate({ source_task_id: 'task-2' }),
      makeCandidate({ source_task_id: 'task-3' }),
    ];
    const result = await runMemoryReviewGenerator(candidates, notifier);

    expect(result.candidate_count).toBe(3);
  });

  it('passes the brief to the notifier', async () => {
    let capturedBrief: unknown;
    const notifier = jest.fn().mockImplementation(async (brief) => {
      capturedBrief = brief;
      return true;
    });

    const candidates = [makeCandidate()];
    await runMemoryReviewGenerator(candidates, notifier);

    expect(capturedBrief).toMatchObject({
      total_count: 1,
      candidates: expect.arrayContaining([
        expect.objectContaining({ source_task_id: 'task-1' }),
      ]),
    });
  });

  it('sets notification_sent to false when notifier returns false', async () => {
    const notifier = jest.fn().mockResolvedValue(false);
    const result = await runMemoryReviewGenerator([makeCandidate()], notifier);

    expect(result.notification_sent).toBe(false);
  });

  it('returns candidate_count of 0 and no notification for empty input', async () => {
    const notifier = jest.fn().mockResolvedValue(true);
    const result = await runMemoryReviewGenerator([], notifier);

    expect(result.candidate_count).toBe(0);
    expect(result.notification_sent).toBe(false);
  });
});
