import type { CheckFn } from './types';

export const robustnessCheck: CheckFn = {
  name: 'robustness',
  run(answers) {
    let robust = 0;
    for (const a of answers) {
      if (a.confidence >= 0.5 && a.answer.trim().length > 0) robust++;
    }
    const score = answers.length > 0 ? (robust / answers.length) * 100 : 0;
    return {
      check: 'robustness',
      passed: score >= 80,
      score,
      reason: score < 80 ? `${answers.length - robust}/${answers.length} low-confidence or empty` : undefined,
    };
  },
};
