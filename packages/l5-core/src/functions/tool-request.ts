// Tool Request Decision Logic
// Determines if a bottleneck or workflow should become a tool request

import type { ToolCandidateDecision } from '../types/entities';

export interface ToolRequestInput {
  pmf_score: number;
  repetition_count: number; // How many times this has been requested/attempted
  time_to_complete: number; // Minutes per instance
  error_risk: 'low' | 'medium' | 'high'; // Risk of human error
  impact_on_revenue: 'none' | 'low' | 'medium' | 'high'; // Revenue impact if automated
  bottleneck_severity: 'low' | 'medium' | 'high'; // Workflow impact
}

export function decideToolCandidate(input: ToolRequestInput): ToolCandidateDecision {
  // MVP Rules
  // 1. PMF must be >= 60 (proven demand)
  // 2. Must be repeated at least 3 times or more frequently
  // 3. Must take at least 5 minutes per instance
  // 4. High error risk OR high revenue impact
  // 5. NOT blocking critical workflow

  const reasons: string[] = [];
  let score = 0;

  // Check 1: PMF Signal
  if (input.pmf_score < 60) {
    reasons.push(`Low PMF score (${input.pmf_score}). Need PMF >= 60.`);
  } else {
    score += 20;
    reasons.push(`Good PMF signal (${input.pmf_score}).`);
  }

  // Check 2: Repetition
  if (input.repetition_count < 3) {
    reasons.push(`Only ${input.repetition_count} repetitions. Need 3+ to justify tool.`);
  } else if (input.repetition_count >= 10) {
    score += 25;
    reasons.push(`Highly repetitive (${input.repetition_count} times). Strong candidate.`);
  } else {
    score += 15;
    reasons.push(`Moderately repetitive (${input.repetition_count} times).`);
  }

  // Check 3: Time Investment
  if (input.time_to_complete < 5) {
    reasons.push(`Only ${input.time_to_complete} min per instance. ROI too low.`);
  } else if (input.time_to_complete >= 30) {
    score += 25;
    reasons.push(`Significant time investment (${input.time_to_complete} min). High ROI potential.`);
  } else {
    score += 10;
    reasons.push(`Moderate time per instance (${input.time_to_complete} min).`);
  }

  // Check 4: Risk & Impact
  const riskScore = {
    low: 0,
    medium: 10,
    high: 20
  }[input.error_risk];

  const impactScore = {
    none: 0,
    low: 5,
    medium: 15,
    high: 25
  }[input.impact_on_revenue];

  score += riskScore + impactScore;

  if (riskScore > 0 || impactScore > 0) {
    reasons.push(
      `Risk/impact justifies automation: ` +
      `${input.error_risk} error risk, ` +
      `${input.impact_on_revenue} revenue impact.`
    );
  }

  // Final decision
  const is_tool_candidate = score >= 40;

  const priorityMap = {
    high: score >= 80,
    medium: score >= 60,
    low: score >= 40
  };

  const priority = (
    priorityMap.high ? 'high' :
    priorityMap.medium ? 'medium' :
    'low'
  );

  return {
    is_tool_candidate,
    reasoning: reasons.join(' '),
    priority: is_tool_candidate ? priority : undefined
  };
}

export function estimateToolBuildingEffort(input: ToolRequestInput): string {
  // Estimate complexity based on repetition, time, and error risk
  const baseEffort = input.time_to_complete * input.repetition_count;

  if (input.error_risk === 'high') {
    return 'High - error prevention requires careful implementation';
  } else if (baseEffort > 300) {
    return 'High - significant time investment';
  } else if (baseEffort > 150) {
    return 'Medium - moderate scope';
  } else {
    return 'Low - simple automation';
  }
}
