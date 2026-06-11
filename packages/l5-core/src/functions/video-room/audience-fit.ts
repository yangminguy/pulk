// Audience Fit Validator — PRD §3.4 / §9 Gate 1
// Scoring rules:
//   overall_score = weighted average of the 6 dimension scores
//   weights: pain_fit=25, desire_fit=20, language_fit=20, curiosity_fit=10, trust_fit=15, action_fit=10
//   sum of weights = 100 → overall_score = sum(weight_i * score_i) / 100
// Gate 1 pass (PRD §9 / §16.14):
//   overall_score >= 80 AND language_fit >= 75 AND trust_fit >= 80

import type { AudienceFitReport } from './types';

export interface AudienceFitInput {
  pain_fit: number;
  desire_fit: number;
  language_fit: number;
  curiosity_fit: number;
  trust_fit: number;
  action_fit: number;
  what_target_wants_to_hear: string[];
  what_target_does_not_want_to_hear: string[];
  must_answer_questions: string[];
  recommended_angle: string;
}

// Dimension weights (sum = 100)
export const AUDIENCE_FIT_WEIGHTS = {
  pain_fit: 25,
  desire_fit: 20,
  language_fit: 20,
  curiosity_fit: 10,
  trust_fit: 15,
  action_fit: 10,
} as const;

// Gate 1 thresholds (PRD §9 Gate 1 / §16.14)
export const AUDIENCE_FIT_GATE = {
  overall_min: 80,
  language_fit_min: 75,
  trust_fit_min: 80,
} as const;

export function computeOverallScore(dimensions: {
  pain_fit: number;
  desire_fit: number;
  language_fit: number;
  curiosity_fit: number;
  trust_fit: number;
  action_fit: number;
}): number {
  const weighted =
    dimensions.pain_fit * AUDIENCE_FIT_WEIGHTS.pain_fit +
    dimensions.desire_fit * AUDIENCE_FIT_WEIGHTS.desire_fit +
    dimensions.language_fit * AUDIENCE_FIT_WEIGHTS.language_fit +
    dimensions.curiosity_fit * AUDIENCE_FIT_WEIGHTS.curiosity_fit +
    dimensions.trust_fit * AUDIENCE_FIT_WEIGHTS.trust_fit +
    dimensions.action_fit * AUDIENCE_FIT_WEIGHTS.action_fit;
  return Math.round(weighted / 100);
}

export function evaluateAudienceFit(input: AudienceFitInput): AudienceFitReport {
  const overall_score = computeOverallScore(input);
  return {
    overall_score,
    pain_fit: input.pain_fit,
    desire_fit: input.desire_fit,
    language_fit: input.language_fit,
    curiosity_fit: input.curiosity_fit,
    trust_fit: input.trust_fit,
    action_fit: input.action_fit,
    what_target_wants_to_hear: input.what_target_wants_to_hear,
    what_target_does_not_want_to_hear: input.what_target_does_not_want_to_hear,
    must_answer_questions: input.must_answer_questions,
    recommended_angle: input.recommended_angle,
  };
}

export function isAudienceFitPass(report: AudienceFitReport): boolean {
  return (
    report.overall_score >= AUDIENCE_FIT_GATE.overall_min &&
    report.language_fit >= AUDIENCE_FIT_GATE.language_fit_min &&
    report.trust_fit >= AUDIENCE_FIT_GATE.trust_fit_min
  );
}
