// Memory Review Generator
// Runs weekly on Friday at 17:00 via cronTrigger. Collects MemoryCandidates
// from completed agent tasks and sends a review brief to the Founder.

import type { MemoryCandidate, MemoryReviewBrief } from '@l5/core';
import { buildMemoryReviewBrief } from '@l5/core';

export interface MemoryReviewGeneratorResult {
  generated_at: string;
  candidate_count: number;
  brief: MemoryReviewBrief;
  notification_sent: boolean;
}

export async function runMemoryReviewGenerator(
  candidates: MemoryCandidate[],
  notifier: (brief: MemoryReviewBrief) => Promise<boolean>,
): Promise<MemoryReviewGeneratorResult> {
  const brief = buildMemoryReviewBrief(candidates);

  const notification_sent =
    candidates.length > 0 ? await notifier(brief) : false;

  return {
    generated_at: brief.generated_at,
    candidate_count: candidates.length,
    brief,
    notification_sent,
  };
}
