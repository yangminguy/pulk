import type { VideoQAAnswer, CheckResult, CheckName } from '../../schemas/videoqa-result';

export interface GroundTruth {
  question_id: string;
  expected_answer: string;
  timestamp_start: number;
  timestamp_end: number;
  sub_questions?: string[];
}

export interface CheckFn {
  name: CheckName;
  run(answers: VideoQAAnswer[], groundTruths: GroundTruth[]): CheckResult;
}
