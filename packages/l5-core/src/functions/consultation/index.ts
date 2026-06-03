// M4: Founder ↔ Executive consultation — pure state machine.
// No I/O. All persistence lives in the plugin layer.

import type { AgentRole } from '../../types/orchestration';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConsultationStatus = 'awaiting_founder' | 'resolved';

export interface ConsultationRecord {
  id: string;
  task_id: string;
  business_id: string | null;
  from_agent: AgentRole;
  question: string;
  /** Optional answer choices. null means free-text expected. */
  options: string[] | null;
  status: ConsultationStatus;
  founder_response: string | null;
  resolved_at: string | null;
  /** ISO timestamp — managed by NocoBase (camelCase createdAt). */
  createdAt?: string;
}

export interface ConsultationRequest {
  from_agent: AgentRole;
  task_id: string;
  question: string;
  options?: string[];
  business_id?: string;
}

// ── openConsultation ──────────────────────────────────────────────────────────

/**
 * Create a new consultation record in awaiting_founder state.
 * Throws if question is empty.
 * id is caller-supplied (e.g. randomUUID from the plugin layer).
 */
export function openConsultation(req: ConsultationRequest & { id: string }): ConsultationRecord {
  if (!req.question || req.question.trim() === '') {
    throw new Error('consultation question must not be empty');
  }
  return {
    id: req.id,
    task_id: req.task_id,
    business_id: req.business_id ?? null,
    from_agent: req.from_agent,
    question: req.question.trim(),
    options: req.options && req.options.length > 0 ? req.options : null,
    status: 'awaiting_founder',
    founder_response: null,
    resolved_at: null,
  };
}

// ── resolveConsultation ───────────────────────────────────────────────────────

/**
 * Transition a consultation from awaiting_founder → resolved.
 *
 * Policy: if already resolved, this is a no-op (idempotent) — returns the
 * record unchanged. This avoids duplicate-resolve errors on retries.
 */
export function resolveConsultation(
  rec: ConsultationRecord,
  founder_response: string,
): ConsultationRecord {
  // Idempotent: already resolved → no-op
  if (rec.status === 'resolved') {
    return rec;
  }
  return {
    ...rec,
    status: 'resolved',
    founder_response: founder_response.trim(),
    resolved_at: new Date().toISOString(),
  };
}

// ── formatConsultationForPrompt ───────────────────────────────────────────────

/**
 * Build a Korean-language text block injected into the executive's prompt
 * when re-running a task after founder consultation.
 *
 * Expected use: concatenate into recalledInsights before executeAgentTaskLive.
 */
export function formatConsultationForPrompt(rec: ConsultationRecord): string {
  if (rec.status !== 'resolved' || !rec.founder_response) {
    return '';
  }
  const optionLine =
    rec.options && rec.options.length > 0
      ? `\n선택지: [${rec.options.join(', ')}]`
      : '';
  return (
    `[창업자 협의 결과]\n` +
    `${rec.from_agent}가 창업자에게 "${rec.question}"라고 물었고,${optionLine}\n` +
    `창업자 답변: "${rec.founder_response}".\n` +
    `이 답변을 반영해 작업을 완료하라.`
  );
}
