import { VideoQAAnswerSchema } from '../../schemas/videoqa-result';
import type { CheckFn } from './types';

export const formatSchemaCheck: CheckFn = {
  name: 'format_schema',
  run(answers) {
    let valid = 0;
    for (const a of answers) {
      const result = VideoQAAnswerSchema.safeParse(a);
      if (result.success) valid++;
    }
    const score = answers.length > 0 ? (valid / answers.length) * 100 : 0;
    return {
      check: 'format_schema',
      passed: score === 100,
      score,
      reason: score < 100 ? `${answers.length - valid}/${answers.length} failed schema validation` : undefined,
    };
  },
};
