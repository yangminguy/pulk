import type { CheckFn } from './types';

export const factualConsistencyCheck: CheckFn = {
  name: 'factual_consistency',
  run(answers, groundTruths) {
    const gtMap = new Map(groundTruths.map((g) => [g.question_id, g]));
    let consistent = 0;
    let total = 0;

    for (const a of answers) {
      const gt = gtMap.get(a.question_id);
      if (!gt) continue;
      total++;
      const expectedTokens = new Set(gt.expected_answer.toLowerCase().split(/\s+/));
      const answerTokens = a.answer.toLowerCase().split(/\s+/);
      const fabricated = answerTokens.filter((t) => t.length > 3 && !expectedTokens.has(t));
      if (fabricated.length / answerTokens.length < 0.5) consistent++;
    }

    const score = total > 0 ? (consistent / total) * 100 : 0;
    return {
      check: 'factual_consistency',
      passed: score >= 80,
      score,
      reason: score < 80 ? `${total - consistent}/${total} answers had potential hallucinations` : undefined,
    };
  },
};
