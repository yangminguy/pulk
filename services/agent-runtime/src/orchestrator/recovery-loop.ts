// recovery-loop.ts — 순수 폴링 간격 계산.
// 토큰 소진 시 다음 폴링까지 얼마나 기다릴지, 어떤 task를 즉시 실행할지를 결정한다.
// 순수 함수: 시각은 인자로만 주입(Date.now/new Date 직접 호출 금지).

import type { RecoveryDecision } from '@l5/core/dist/functions/cto-native';

/** planNextPoll의 반환값. */
export interface NextPollPlan {
  /**
   * 다음 폴링까지 대기할 밀리초.
   * - action='run'/'handoff'인 task가 1개 이상 있으면 0(즉시).
   * - 전부 'wait'이면 가장 이른 estimatedReadyAt까지의 차이(음수→0, 상한 1시간).
   * - estimatedReadyAt이 없으면 상한(1시간).
   */
  sleepMs: number;
  /**
   * 즉시 실행 가능한 task ID 목록(action='run' 또는 'handoff').
   * 순서는 입력 decisions 배열 순서를 유지한다.
   */
  readyTaskIds: string[];
}

const MAX_SLEEP_MS = 60 * 60 * 1000; // 1시간

/**
 * RecoveryDecision 배열과 현재 시각을 받아 다음 폴링 계획을 반환한다.
 *
 * @param decisions - decideRecovery 결과 배열. 빈 배열이면 MAX_SLEEP_MS 반환.
 * @param nowIso    - 현재 시각(ISO). 호출자가 주입(Date.now 직접 금지).
 */
export function planNextPoll(decisions: RecoveryDecision[], nowIso: string): NextPollPlan {
  if (decisions.length === 0) {
    return { sleepMs: MAX_SLEEP_MS, readyTaskIds: [] };
  }

  const readyTaskIds = decisions
    .filter((d) => d.action === 'run' || d.action === 'handoff')
    .map((d) => d.taskId);

  // run/handoff가 하나라도 있으면 즉시 실행
  if (readyTaskIds.length > 0) {
    return { sleepMs: 0, readyTaskIds };
  }

  // 전부 wait — 가장 이른 estimatedReadyAt까지 대기
  const nowMs = new Date(nowIso).getTime();
  const futureTimes = decisions
    .map((d) => d.estimatedReadyAt)
    .filter((t): t is string => !!t)
    .map((t) => new Date(t).getTime())
    .filter((ms) => ms > nowMs)
    .sort((a, b) => a - b);

  if (futureTimes.length === 0) {
    return { sleepMs: MAX_SLEEP_MS, readyTaskIds: [] };
  }

  const diffMs = futureTimes[0] - nowMs;
  const sleepMs = Math.min(Math.max(diffMs, 0), MAX_SLEEP_MS);
  return { sleepMs, readyTaskIds: [] };
}
