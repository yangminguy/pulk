// tiger-watch-loop — 호랑이 실시간 장애 감시 진입점(launchd 1~2분 주기).
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (실시간 감시·자동복구).
//
// runLivenessWatcher(deps 주입)를 호출하고 LoopResult로 환원. 실제 어댑터(native_phase_runs/
// agent_tasks 조회 + tiger_incidents :create)는 Live 래퍼(runner.ts)가 주입한다. never-throw.

import { runLivenessWatcher, type LivenessWatcherDeps } from '../tiger/liveness-watcher.js';
import type { LoopContext, LoopResult } from './types.js';

export async function runTigerWatchLoop(
  context: LoopContext,
  deps: LivenessWatcherDeps,
): Promise<LoopResult> {
  void context;
  let res;
  try {
    res = await runLivenessWatcher(deps);
  } catch (err) {
    return {
      loop: 'tiger-watch',
      status: 'error',
      summary: `호랑이 실시간 감시 예외: ${(err as Error).message}`,
      actions: [],
    };
  }

  const status: LoopResult['status'] =
    res.new_incidents > 0 ? 'ok' : res.errors.length > 0 ? 'error' : 'skipped';
  const summary =
    res.new_incidents > 0
      ? `장애 ${res.incidents_total}건 감지(새 알림 ${res.new_incidents}건, 영속화 ${res.persisted}). 평가 ${res.evaluated}건 중 정상 ${res.healthy}.`
      : res.incidents_total > 0
        ? `장애 ${res.incidents_total}건(전부 이미 알림됨 — 재알림 안 함).`
        : `정상 — 평가 ${res.evaluated}건 모두 진행 중/완료.`;

  return {
    loop: 'tiger-watch',
    status,
    summary,
    actions: res.new_incidents > 0 ? ['await-founder-approval'] : [],
  };
}
