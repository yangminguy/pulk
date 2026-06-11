// recovery.ts — 결정론적 회복/인계 판단.
// ACR recovery-scheduler(dry-run 제안)를 실행 결정으로 이식.
// 순수 함수: I/O·네트워크·git·child_process·Date.now 금지. 시각은 nowIso로 주입.

import type { DecideRecovery, DecideRecoveryInput, RecoveryDecision } from './types';
import { getFallbackChain } from './fallback';
import { modelForTask } from './model-map';

export const decideRecovery: DecideRecovery = (input: DecideRecoveryInput): RecoveryDecision => {
  const { task, pools, nowIso } = input;
  const nowMs = new Date(nowIso).getTime();

  const findPool = (agent: typeof task.primaryAgent) =>
    pools.find((p) => p.agent === agent);

  const primaryPool = findPool(task.primaryAgent);

  // (1) primary가 available → run
  if (primaryPool?.quotaStatus === 'available') {
    return {
      taskId: task.id,
      action: 'run',
      agent: task.primaryAgent,
      model: task.primaryModel ?? modelForTask(task.primaryAgent, task.taskKind),
      reason: `primary agent ${task.primaryAgent} is available`,
    };
  }

  // (2) primary가 rate_limited/exhausted → fallback 체인에서 available 첫 풀로 handoff
  const primaryStatus = primaryPool?.quotaStatus ?? 'exhausted';
  if (primaryStatus === 'rate_limited' || primaryStatus === 'exhausted') {
    const chain = getFallbackChain(task.primaryAgent);
    for (const fallbackAgent of chain) {
      const fallbackPool = findPool(fallbackAgent);
      if (fallbackPool?.quotaStatus === 'available') {
        return {
          taskId: task.id,
          action: 'handoff',
          agent: fallbackAgent,
          model: modelForTask(fallbackAgent, task.taskKind),
          reason: `primary agent ${task.primaryAgent} is ${primaryStatus}; handing off to ${fallbackAgent}`,
        };
      }
    }
  }

  // (3) 가용 풀 없음 → wait
  // 관련 풀(primary + fallback chain)의 nextRetryAt 중 nowIso보다 미래인 가장 이른 값
  const relevantAgents = [task.primaryAgent, ...getFallbackChain(task.primaryAgent)];
  const futureTimes = relevantAgents
    .map((a) => findPool(a)?.nextRetryAt)
    .filter((t): t is string => !!t && new Date(t).getTime() > nowMs)
    .sort();

  const estimatedReadyAt = futureTimes[0];

  return {
    taskId: task.id,
    action: 'wait',
    agent: task.primaryAgent,
    reason: `no available agent pool for task ${task.id}; all agents are ${pools.map((p) => `${p.agent}:${p.quotaStatus}`).join(', ')}`,
    estimatedReadyAt,
  };
};
