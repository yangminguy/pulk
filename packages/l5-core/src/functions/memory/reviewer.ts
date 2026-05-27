import type { MemoryCandidate, MemoryReviewBrief, MemorySaveRequest, MemorySaveResult } from './types';

export function buildMemoryReviewBrief(candidates: MemoryCandidate[]): MemoryReviewBrief {
  const now = new Date();
  return {
    review_date: now.toISOString().split('T')[0],
    candidates,
    total_count: candidates.length,
    generated_at: now.toISOString(),
  };
}

export function applyMemoryDecision(
  candidate: MemoryCandidate,
  req: MemorySaveRequest,
): MemorySaveResult {
  const label = req.decision === 'saved' ? '저장' : '폐기';
  return {
    ok: true,
    source_task_id: req.source_task_id,
    decision: req.decision,
    message: `인사이트가 ${label}되었습니다: ${candidate.source_task_id}`,
  };
}
