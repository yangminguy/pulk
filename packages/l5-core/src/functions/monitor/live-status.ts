// P2.1a — deriveLiveStatus: pure live-status derivation for real-time agent monitoring.
//
// Pure l5-core, fully deterministic: no LLM, no I/O, no DB. The plugin reads the
// agent_task row plus its joined consultation/delegation rows and passes them in
// as plain data; this function maps (status, blocker prefix, join rows) → a live
// status enum + a one-line "current action" + the counterpart it is talking to.
//
// Derivation table is implemented EXACTLY per docs/specs/P2-monitoring.md §2.
// Keeping judgment logic here (not in the plugin/UI) satisfies CLAUDE.md rules
// 2 ("l5-core testable without NocoBase") and 3 ("every scoring rule has tests").

export type LiveStatus =
  | 'queued'
  | 'investigating'
  | 'talking'
  | 'awaiting_founder'
  | 'under_review'
  | 'done'
  | 'blocked';

/** Minimal shape of an agent_tasks row needed for derivation. */
export interface LiveStatusTask {
  status: 'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed';
  blocker?: string | null;
  assigned_agent?: string | null;
  approval_required?: boolean | null;
}

/** Latest executive_consultations row (status='awaiting_founder') for this task. */
export interface LiveStatusConsult {
  question?: string | null;
  from_agent?: string | null;
}

/**
 * An executive_delegations row joined to this task.
 * - as delegOut: this task is the requester (origin_task_id = t.id)
 * - as delegIn:  this task IS the delegated worker (work_task_id = t.id)
 */
export interface LiveStatusDeleg {
  from_agent?: string | null;
  to_agent?: string | null;
  objective?: string | null;
  round?: number | null;
  max_rounds?: number | null;
}

export interface LiveStatusJoins {
  /** latest awaiting_founder consultation for this task, or null */
  consult?: LiveStatusConsult | null;
  /** open/in_progress delegation where this task is the requester, or null */
  delegOut?: LiveStatusDeleg | null;
  /** open/in_progress delegation where this task is the delegated worker, or null */
  delegIn?: LiveStatusDeleg | null;
}

export interface LiveStatusResult {
  /** primary enum per spec §2 (UI key) */
  live_status: LiveStatus;
  /** alias of live_status for callers expecting `status` */
  status: LiveStatus;
  /** short ko label for the status */
  label: string;
  /** one-line "current action" string (never blank) */
  current_action: string;
  /** who this task is talking to: 'Founder' | 'CEO' | '<AGENT>' | null */
  counterpart: string | null;
  /** true for status='killed' — row should be excluded from the active view */
  hidden: boolean;
}

const LABELS: Record<LiveStatus, string> = {
  queued: '대기열',
  investigating: '조사 중',
  talking: '대화 중',
  awaiting_founder: '창업자 대기',
  under_review: 'CEO 검토',
  done: '완료',
  blocked: '차단됨',
};

function clip(s: string | null | undefined, n: number): string {
  const v = (s ?? '').trim();
  return v.length > n ? v.slice(0, n) : v;
}

/**
 * Parse the tail of a prefixed blocker, e.g.
 *   "awaiting_founder: 어떤 톤으로 보낼까요?" -> "어떤 톤으로 보낼까요?"
 * Returns '' when there is no prefix/tail.
 */
export function blockerTail(blocker: string | null | undefined): string {
  const v = (blocker ?? '').trim();
  const idx = v.indexOf(':');
  return idx >= 0 ? v.slice(idx + 1).trim() : v;
}

function result(
  live_status: LiveStatus,
  current_action: string,
  counterpart: string | null,
  hidden = false,
): LiveStatusResult {
  return {
    live_status,
    status: live_status,
    label: LABELS[live_status],
    current_action,
    counterpart,
    hidden,
  };
}

/**
 * Derive the live status of a single agent task from coarse DB state.
 * First-match-wins ordering, exactly per spec §2 derivation table (rows 1–10).
 *
 * Blocker prefix is the PRIMARY signal for rows 4/5; the join row enriches the
 * one-liner. If the join row is missing (read race), we fall back to the blocker
 * tail so the card never goes blank.
 */
export function deriveLiveStatus(
  task: LiveStatusTask,
  joins: LiveStatusJoins = {},
): LiveStatusResult {
  const blocker = task.blocker ?? '';
  const consult = joins.consult ?? null;
  const delegOut = joins.delegOut ?? null;
  const delegIn = joins.delegIn ?? null;

  // Row 1 — done
  if (task.status === 'done') {
    const note = blockerTail(blocker);
    const action = note ? `완료 — ${clip(note, 120)}` : '완료';
    return result('done', action, null);
  }

  // Row 2 — killed: hidden from active view
  if (task.status === 'killed') {
    return result('done', '종료됨', null, true);
  }

  // Row 3 — blocked (hard blocker)
  if (task.status === 'blocked') {
    return result('blocked', clip(blocker, 120) || '차단됨', null);
  }

  // Rows 4–6 — needs_review
  if (task.status === 'needs_review') {
    // Row 4 — awaiting founder (consultation)
    if (blocker.startsWith('awaiting_founder:') || consult) {
      const q = (consult?.question ?? '').trim() || blockerTail(blocker);
      return result(
        'awaiting_founder',
        `창업자 답변 대기: ${clip(q, 120) || '(질문 없음)'}`,
        'Founder',
      );
    }

    // Row 5 — delegating down to a delegate
    if (blocker.startsWith('awaiting_delegation:') || delegOut) {
      const to = (delegOut?.to_agent ?? '').trim();
      const objective = clip(delegOut?.objective, 60);
      const round = delegOut?.round;
      const max = delegOut?.max_rounds;
      const roundStr =
        typeof round === 'number' && typeof max === 'number'
          ? ` (round ${round}/${max})`
          : '';
      const target = to || '위임 대상';
      const objStr = objective || blockerTail(blocker) || '위임 작업';
      return result('talking', `${target}에게 위임 — ${objStr}${roundStr}`, to || null);
    }

    // Row 6 — any other blocker → CEO review lane
    return result('under_review', `CEO 검토 중: ${clip(blockerTail(blocker) || blocker, 80)}`, 'CEO');
  }

  // Rows 7–8 — running
  if (task.status === 'running') {
    // Row 7 — doing a peer's delegated work
    if (delegIn) {
      const from = (delegIn.from_agent ?? '').trim();
      const objective = clip(delegIn.objective, 60) || '위임 작업';
      const who = from || '동료';
      return result('talking', `${who}의 위임 수행 중 — ${objective}`, from || null);
    }
    // Row 8 — generic investigating
    return result('investigating', '작업 수행 중…', null);
  }

  // Rows 9–10 — queued
  if (task.status === 'queued') {
    // Row 9 — awaiting founder approval
    if (task.approval_required === true) {
      return result('awaiting_founder', '승인 대기 중', 'Founder');
    }
    // Row 10 — plain queued
    return result('queued', '대기열', null);
  }

  // Defensive fallback (unreachable given the enum) — treat as queued.
  return result('queued', '대기열', null);
}
