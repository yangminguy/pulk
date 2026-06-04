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

  // Hard gates: all must pass for an idea to be a tool candidate.
  let gatesPassed = true;

  // Gate 1: PMF Signal
  if (input.pmf_score < 60) {
    gatesPassed = false;
    reasons.push(`Low PMF score (${input.pmf_score}). Need PMF >= 60.`);
  } else {
    score += 20;
    reasons.push(`Good PMF signal (${input.pmf_score}).`);
  }

  // Gate 2: Repetition
  if (input.repetition_count < 3) {
    gatesPassed = false;
    reasons.push(`Only ${input.repetition_count} repetitions. Need 3+ to justify tool.`);
  } else if (input.repetition_count >= 10) {
    score += 25;
    reasons.push(`Highly repetitive (${input.repetition_count} times). Strong candidate.`);
  } else {
    score += 15;
    reasons.push(`Moderately repetitive (${input.repetition_count} times).`);
  }

  // Gate 3: Time Investment
  if (input.time_to_complete < 5) {
    gatesPassed = false;
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

  // Final decision: all hard gates must pass, and combined score must clear the bar.
  const is_tool_candidate = gatesPassed && score >= 40;

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

// P3-4: deterministic acceptance criteria for a CTO self-modification task,
// derived from the originating Tool Request. Used both for the ACR phase
// expected_output and the M6 post-apply verification prompt. Pure.
export interface SelfModOrigin {
  task_title?: string;
  rationale?: string;
  source_ref?: string | null;
}

export function buildSelfModAcceptanceCriteria(origin: SelfModOrigin): string[] {
  const pattern =
    (origin.source_ref && origin.source_ref.replace(/^repetition-pattern:/, '')) ||
    origin.task_title ||
    '제안된 개선';
  return [
    '변경은 별도 브랜치에서만 이뤄지고 main에 직접 머지되지 않는다.',
    '기존 테스트가 모두 통과한다 (exit_code === 0).',
    `제안된 반복 작업/개선(${pattern})이 실제로 자동화·토큰 절감되었음을 diff가 보여준다.`,
    '변경 범위가 제안과 무관한 파일로 번지지 않는다 (surgical).',
    'self-modifying 변경이므로 founder 승인 전에는 적용되지 않는다.',
  ];
}

// ── Self-modification blast-radius guard ──────────────────────────────────────
// The OS must never let an agent edit its own "brain": the gate logic, secrets,
// approval code, or process control. This is enforced at TWO points:
//  - diff level (checkSelfModDiffForbidden): hard gate on the actual changed
//    files, at apply time AND when the diff first arrives (before founder review).
//  - intent level (checkSelfModIntentForbidden): an early NL check on a self-mod
//    task's title/rationale, so an obviously-forbidden request is blocked at
//    creation — before any CLI runs — not only after a branch is built.

/** Path/file patterns a self-mod diff must never touch (blast-radius guard). */
export const SELFMOD_DENY_PATHS: RegExp[] = [
  /plugin-orchestration\/.*plugin/i, // core orchestration plugin (the brain)
  /\.env/i, // secrets
  /launchd/i, // system process control
  /SECURITY_/i, // security constants
  /approval/i, // approval-gate code
  /selfmod|self-mod/i, // the self-mod guard itself
];

/** Intent keywords (Korean + English) signalling a request to modify the brain. */
export const SELFMOD_DENY_INTENT: RegExp[] = [
  /승인\s*게이트|approval\s*gate|게이트\s*로직/i,
  /\.env|환경\s*변수|시크릿|secret|api[\s_-]?key/i,
  /deny[\s_-]?list|차단\s*목록|허용\s*목록|allow[\s_-]?list/i,
  /launchd|시스템\s*프로세스|서비스\s*제어/i,
  /보안\s*상수|security\s*constant|권한\s*우회|bypass\s*(auth|approval|gate)/i,
  /자기\s*두뇌|자신의\s*두뇌|self[\s_-]?mod|자가\s*수정\s*가드|승인\s*우회/i,
];

export interface SelfModGuardResult {
  forbidden: boolean;
  pattern: string | null;
  reason: string | null;
}

function firstMatch(patterns: RegExp[], text: string): RegExp | null {
  return patterns.find((re) => re.test(text)) ?? null;
}

/** Hard gate on a diff/changed-file string. Used before apply and on diff arrival. */
export function checkSelfModDiffForbidden(diff: string): SelfModGuardResult {
  const hit = firstMatch(SELFMOD_DENY_PATHS, String(diff ?? ''));
  return hit
    ? { forbidden: true, pattern: String(hit), reason: `변경이 보호 영역(${hit})을 건드립니다` }
    : { forbidden: false, pattern: null, reason: null };
}

/** Early NL gate on a self-mod task's title/rationale, before any CLI runs. */
export function checkSelfModIntentForbidden(text: string): SelfModGuardResult {
  const hit = firstMatch(SELFMOD_DENY_INTENT, String(text ?? ''));
  return hit
    ? {
        forbidden: true,
        pattern: String(hit),
        reason: `요청이 보호 영역(승인·게이트·시크릿·프로세스 제어) 수정을 시사합니다`,
      }
    : { forbidden: false, pattern: null, reason: null };
}
