// budget.ts — pool 소진 상태 추적(순수 함수).
// CLI는 토큰 수를 직접 반환하지 않으므로 실행 결과 신호(outcome)로 pool 가용성을
// 근사한다. 데몬이 실행 후 이 함수로 pools.json을 갱신하고, decideRecovery/planNextPoll이
// 그 상태로 인계/대기를 판단한다. 시각은 nowIso 주입(Date.now 직접 호출 금지).

import type { AgentPoolState, MainAgent, QuotaStatus } from './types';

/** 한 pool의 실행 결과. 'exhausted'=토큰 소진/연속 실패, 'ok'=정상 완료. */
export type PoolOutcome = 'ok' | 'exhausted';

/** 소진 시 다음 재시도까지 기본 백오프(분). */
export const DEFAULT_BACKOFF_MINUTES = 15;

/**
 * 한 pool의 실행 결과를 반영해 새 pools 배열을 반환한다(입력 불변).
 *  - 'exhausted': 해당 agent를 quotaStatus='exhausted' + nextRetryAt=now+백오프.
 *  - 'ok':        해당 agent를 available 복원(nextRetryAt 제거).
 * pools에 없던 agent면 새 항목으로 추가한다.
 */
export function applyPoolOutcome(
  pools: AgentPoolState[],
  agent: MainAgent,
  outcome: PoolOutcome,
  nowIso: string,
  backoffMinutes: number = DEFAULT_BACKOFF_MINUTES,
): AgentPoolState[] {
  const nextStatus: QuotaStatus = outcome === 'exhausted' ? 'exhausted' : 'available';
  const nextRetryAt =
    outcome === 'exhausted'
      ? new Date(new Date(nowIso).getTime() + backoffMinutes * 60_000).toISOString()
      : undefined;

  const make = (): AgentPoolState =>
    nextRetryAt
      ? { agent, quotaStatus: nextStatus, nextRetryAt }
      : { agent, quotaStatus: nextStatus };

  let found = false;
  const next = pools.map((p) => {
    if (p.agent !== agent) return p;
    found = true;
    return make();
  });
  if (!found) next.push(make());
  return next;
}
