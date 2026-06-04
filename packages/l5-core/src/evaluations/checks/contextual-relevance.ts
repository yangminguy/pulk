import type { CheckFn } from './types';

function wordOverlap(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

export const contextualRelevanceCheck: CheckFn = {
  name: 'contextual_relevance',
  run(answers, groundTruths) {
    const gtMap = new Map(groundTruths.map((g) => [g.question_id, g]));
    let totalScore = 0;
    let count = 0;

    for (const a of answers) {
      const gt = gtMap.get(a.question_id);
      if (!gt) continue;
      count++;
      totalScore += wordOverlap(a.answer, gt.expected_answer);
    }

    const score = count > 0 ? (totalScore / count) * 100 : 0;
    return {
      check: 'contextual_relevance',
      passed: score >= 80,
      score,
      reason: score < 80 ? `Average WUPS-like similarity: ${score.toFixed(1)}%` : undefined,
    };
  },
};
