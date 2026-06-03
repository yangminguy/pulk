// M6 — Executive-to-executive delegation (via CEO orchestration).
//
// Pure l5-core: types + request validation only. No I/O. The plugin layer
// injects a `propose` callback that persists the delegation record and pauses
// the requesting task (mirrors the M4 consultation pattern).

import type { AgentRole } from '../../types/orchestration';

// Re-export the tool factory, loop controller, and verifier so the plugin can
// require everything from `dist/functions/delegation` (mirrors consultation).
export * from './tool';
export * from './loop';
export * from './verify';

// Roles that can be a delegation target. CEO is excluded: it is the
// orchestrator/gate, not a delegatable worker.
const DELEGATABLE_ROLES: readonly AgentRole[] = [
  'ChiefOfStaff',
  'CMO',
  'CRO',
  'CPO',
  'CTO',
  'COO',
  'CFO',
  'RiskQA',
  'Culture',
];

export const MIN_ROUNDS = 1;
export const MAX_ROUNDS_LIMIT = 5;
export const DEFAULT_MAX_ROUNDS = 3;

export interface DelegationRequest {
  /** Requesting executive (filled from tool ctx.role). */
  from_agent: AgentRole;
  /** Executive that should do the work. */
  to_agent: AgentRole;
  /** Requesting executive's task that pauses until the delegation resolves. */
  origin_task_id: string;
  /** What the target executive must accomplish. */
  objective: string;
  /** Concrete pass/fail conditions the requester will verify against. Required. */
  acceptance_criteria: string[];
  /** Verification-loop budget. Clamped to [MIN_ROUNDS, MAX_ROUNDS_LIMIT]. */
  max_rounds: number;
  business_id?: string;
}

export interface DelegationValidation {
  ok: boolean;
  error?: string;
}

/**
 * Validate a delegation request. Returns the first failing reason, if any.
 * Kept pure so both the tool and the plugin can call it.
 */
export function validateDelegationRequest(req: DelegationRequest): DelegationValidation {
  if (!DELEGATABLE_ROLES.includes(req.to_agent)) {
    return { ok: false, error: `to_agent "${req.to_agent}"는 위임 가능한 역할이 아닙니다.` };
  }
  if (req.from_agent === req.to_agent) {
    return { ok: false, error: '자기 자신에게는 위임할 수 없습니다.' };
  }
  if (!req.objective || req.objective.trim() === '') {
    return { ok: false, error: 'objective(위임 목표)가 필요합니다.' };
  }
  if (!Array.isArray(req.acceptance_criteria) || req.acceptance_criteria.length === 0) {
    return { ok: false, error: 'acceptance_criteria(수용 기준)를 1개 이상 제시해야 합니다.' };
  }
  if (
    !Number.isInteger(req.max_rounds) ||
    req.max_rounds < MIN_ROUNDS ||
    req.max_rounds > MAX_ROUNDS_LIMIT
  ) {
    return {
      ok: false,
      error: `max_rounds는 ${MIN_ROUNDS}~${MAX_ROUNDS_LIMIT} 사이의 정수여야 합니다.`,
    };
  }
  return { ok: true };
}
