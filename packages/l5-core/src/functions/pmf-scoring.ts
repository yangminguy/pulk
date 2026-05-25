// PMF Scoring Logic
// Evaluates product-market fit signals from experiments

import type { PMFExperimentMetric, PMFScoreResult } from '../types/entities';

export function calculatePmfScore(metrics: PMFExperimentMetric[]): PMFScoreResult {
  if (!metrics || metrics.length === 0) {
    return {
      pmf_score: 0,
      signal_strength: 'weak',
      evidence_count: 0,
      recommendation: 'No PMF metrics available. Start collecting signals.'
    };
  }

  // Group metrics by type
  const groupedMetrics = groupMetricsByType(metrics);
  const signals = calculateSignals(groupedMetrics);

  // Calculate weighted score
  const pmf_score = calculateWeightedScore(signals);
  const signal_strength = determineSignalStrength(pmf_score, metrics.length);
  const recommendation = generateRecommendation(pmf_score, signals);

  return {
    pmf_score: Math.round(pmf_score),
    signal_strength,
    evidence_count: metrics.length,
    recommendation
  };
}

interface GroupedMetrics {
  [key: string]: PMFExperimentMetric[];
}

interface SignalEvaluation {
  type: string;
  strength: number; // 0-100
  weight: number; // importance multiplier
  count: number;
  average_level: number; // 1-5
}

function groupMetricsByType(metrics: PMFExperimentMetric[]): GroupedMetrics {
  return metrics.reduce((acc, metric) => {
    if (!acc[metric.metric_name]) {
      acc[metric.metric_name] = [];
    }
    acc[metric.metric_name].push(metric);
    return acc;
  }, {} as GroupedMetrics);
}

function calculateSignals(grouped: GroupedMetrics): SignalEvaluation[] {
  const signals: SignalEvaluation[] = [];

  // Define importance weights for different signal types
  const weights: Record<string, number> = {
    'waitlist_conversion': 1.5,
    'interview_requests': 1.3,
    'purchase_intent': 1.5,
    'customer_calls': 1.2,
    'survey_responses': 0.8,
    'email_engagement': 0.7,
    'revenue_generated': 2.0,
    'customer_retention': 1.8
  };

  for (const [type, metrics] of Object.entries(grouped)) {
    const average_level = metrics.reduce((sum, m) => sum + m.signal_level, 0) / metrics.length;
    const strength = Math.min(100, (average_level / 5) * 100 * (metrics.length > 5 ? 1 : 0.8));
    const weight = weights[type] || 1.0;

    signals.push({
      type,
      strength: Math.round(strength),
      weight,
      count: metrics.length,
      average_level: Math.round(average_level * 10) / 10
    });
  }

  return signals;
}

function calculateWeightedScore(signals: SignalEvaluation[]): number {
  if (signals.length === 0) return 0;

  let totalWeightedScore = 0;
  let totalWeight = 0;

  signals.forEach(signal => {
    totalWeightedScore += signal.strength * signal.weight;
    totalWeight += signal.weight;
  });

  return totalWeightedScore / totalWeight;
}

function determineSignalStrength(
  score: number,
  evidenceCount: number
): 'weak' | 'medium' | 'strong' {
  // Consider both score and sample size
  if (score >= 70 && evidenceCount >= 10) {
    return 'strong';
  } else if (score >= 50 && evidenceCount >= 5) {
    return 'medium';
  } else {
    return 'weak';
  }
}

function generateRecommendation(score: number, signals: SignalEvaluation[]): string {
  if (score >= 70) {
    return 'Strong PMF signals detected. Consider scaling this experiment and moving toward tool candidate evaluation.';
  } else if (score >= 50) {
    return 'Moderate PMF signals. Gather more evidence, refine messaging, and test with broader audience.';
  } else if (score >= 30) {
    return 'Weak PMF signals. Re-evaluate target segment, value proposition, or delivery format.';
  } else {
    return 'No PMF signals. This idea may not have market demand. Consider pivoting or killing.';
  }
}

export function isToolCandidate(pmfScore: number, metrics?: PMFExperimentMetric[]): boolean {
  // Rule: Need score >= 60 to consider as tool candidate
  return pmfScore >= 60;
}
