import type { CheckFn } from './types';

const TOLERANCE_SEC = 3;

export const temporalGroundingCheck: CheckFn = {
  name: 'temporal_grounding',
  run(answers, groundTruths) {
    const gtMap = new Map(groundTruths.map((g) => [g.question_id, g]));
    let matched = 0;
    let total = 0;

    for (const a of answers) {
      const gt = gtMap.get(a.question_id);
      if (!gt) continue;
      total++;
      const startOk = Math.abs(a.timestamp_start - gt.timestamp_start) <= TOLERANCE_SEC;
      const endOk = Math.abs(a.timestamp_end - gt.timestamp_end) <= TOLERANCE_SEC;
      if (startOk && endOk) matched++;
    }

    const score = total > 0 ? (matched / total) * 100 : 0;
    return {
      check: 'temporal_grounding',
      passed: score >= 80,
      score,
      reason: score < 80 ? `${matched}/${total} within ${TOLERANCE_SEC}s tolerance` : undefined,
    };
  },
};
