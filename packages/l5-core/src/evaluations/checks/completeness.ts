import type { CheckFn } from './types';

export const completenessCheck: CheckFn = {
  name: 'completeness',
  run(answers, groundTruths) {
    const gtMap = new Map(groundTruths.map((g) => [g.question_id, g]));
    let complete = 0;
    let total = 0;

    for (const a of answers) {
      const gt = gtMap.get(a.question_id);
      if (!gt || !gt.sub_questions || gt.sub_questions.length === 0) continue;
      total++;
      const answerLower = a.answer.toLowerCase();
      const covered = gt.sub_questions.filter((sq) =>
        sq.toLowerCase().split(/\s+/).some((w) => w.length > 3 && answerLower.includes(w)),
      );
      if (covered.length === gt.sub_questions.length) complete++;
    }

    const score = total > 0 ? (complete / total) * 100 : 0;
    return {
      check: 'completeness',
      passed: score >= 80,
      score,
      reason: score < 80 ? `${complete}/${total} answers fully complete` : undefined,
    };
  },
};
