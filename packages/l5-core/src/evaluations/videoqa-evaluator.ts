import type { VideoQAAnswer, EvalReport, CheckResult } from '../schemas/videoqa-result';
import type { GroundTruth } from './checks/types';
import {
  formatSchemaCheck,
  temporalGroundingCheck,
  contextualRelevanceCheck,
  factualConsistencyCheck,
  completenessCheck,
  robustnessCheck,
  guardrailSafetyCheck,
} from './checks';

const ALL_CHECKS = [
  formatSchemaCheck,
  temporalGroundingCheck,
  contextualRelevanceCheck,
  factualConsistencyCheck,
  completenessCheck,
  robustnessCheck,
  guardrailSafetyCheck,
] as const;

const PASS_THRESHOLD = 80;

export function evaluateVideoQA(
  answers: VideoQAAnswer[],
  groundTruths: GroundTruth[],
): EvalReport {
  const checks: CheckResult[] = ALL_CHECKS.map((c) => c.run(answers, groundTruths));

  const overall_score = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;

  const formatPassed = checks.find((c) => c.check === 'format_schema')!.passed;
  const guardrailPassed = checks.find((c) => c.check === 'guardrail_safety')!.passed;

  const passed = formatPassed && guardrailPassed && overall_score >= PASS_THRESHOLD;

  return {
    overall_score: Math.round(overall_score * 100) / 100,
    passed,
    checks,
    evaluated_at: new Date().toISOString(),
    sample_count: answers.length,
  };
}
