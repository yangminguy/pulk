// tiger-recovery-loop — 호랑이 실시간 자동복구(reactive). 승인된 장애를 CTO가 고치고 호랑이가 검증.
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (실시간 감시·자동복구 §복구 루프).
//
// 사장님이 설계한 흐름(승인 이후 부분):
//   5. 사장님 승인 → tiger_incidents.status=approved
//   6. CTO가 전후 사정(오류/스택/진단/대상repo)을 받아 수정 (status=fixing, attempt++)
//   7. 호랑이가 직접 테스트(실패했던 verify_command 재현·검증; native-orchestrator가 worktree에서
//      verify_command를 돌려 통과해야만 merge → merge 성공 = 검증 통과)  (status=testing)
//   8. 통과 → status=resolved + 텔레그램 "고쳤어요, 다시 시도하세요"
//      실패 → attempt_count++ 후 6번으로 (6↔7 루프)
//   9. 4회 실패 → status=escalated + 텔레그램 "완전히 막혔어요, 사람이 봐야 해요" + 시도 내역
//
// 판단(전이/상한/intent 빌드)은 전부 @l5/core recovery 상태머신. 이 파일은 배선(조회→dispatch→
// 검증결과 환원→패치→알림)만. 승인 전(detected) 행은 절대 dispatch하지 않는다(승인 게이트 보존 —
// fetchApprovedIncidents가 status=approved만 반환). never-throw.

import {
  decideRecoveryAction,
  startFix,
  applyTestResult,
  buildRecoveryFixIntent,
  MAX_RECOVERY_ATTEMPTS,
  type RecoveryIncident,
  type RecoveryStatus,
  type RecoveryTestResult,
  type ACRIntent,
} from '@l5/core';
import { createTelegramClient } from '../notifier/telegram.js';
import type { TelegramClient } from '../notifier/telegram.js';
import type { LoopContext, LoopResult } from './types.js';

/** dispatch 결과(native-orchestrator NativeRunSummary의 소비 부분만 — agent-runtime 비의존 테스트). */
export interface RecoveryDispatchResult {
  /** verify_command 통과 후 merge까지 성공한 phase 수. >0 + !waited = 검증 통과. */
  mergedPhases: number;
  /** 토큰 소진/풀 불가용으로 보류된 phase가 있었는지(있으면 재시도 대상으로 본다). */
  waited: boolean;
  /** 실패/보류 사유(있으면 evidence에 실음). */
  reason?: string;
}

/** 복구 루프 deps(테스트 주입형). 모든 IO/실행은 여기로 주입 → 결정론 단위테스트. */
export interface TigerRecoveryDeps {
  /** status=approved incident만 조회(승인 게이트 — 승인 전 코딩 금지). */
  fetchApprovedIncidents: () => Promise<RecoveryIncident[]>;
  /**
   * CTO 수정 + 호랑이 검증을 한 번에 수행하는 실행기.
   * native-orchestrator(batch-runner)에 intent를 넘기면 worktree에서 verify_command를
   * 돌려 통과해야만 merge → 그 결과(NativeRunSummary 일부)를 RecoveryDispatchResult로 환원.
   */
  dispatchFix: (intent: ACRIntent) => Promise<RecoveryDispatchResult>;
  /** tiger_incidents 상태 패치(:update). status + attempt_count. */
  updateIncident: (id: string, patch: { status: RecoveryStatus; attempt_count: number }) => Promise<void>;
  /** 호랑이 테스트로 쓸 검증 명령(intent.verify_command). 미지정 시 보수적 typecheck. */
  verifyCommand?: string;
  telegram?: TelegramClient;
  founderUIBaseUrl?: string;
  /** 결정론용 현재시각. 기본 now. */
  now?: string;
  /** 한 번에 처리할 최대 incident 수(토큰 폭주 방지). 기본 5. */
  maxPerRun?: number;
}

export interface TigerRecoveryResult {
  run_at: string;
  approved_loaded: number;
  attempted: number;
  resolved: number;
  retried: number;
  escalated: number;
  notified: number;
  errors: string[];
}

const STATUS_KO: Record<RecoveryStatus, string> = {
  detected: '감지',
  approved: '승인됨',
  fixing: '수정 중',
  testing: '검증 중',
  resolved: '해결됨',
  escalated: '에스컬레이션',
};

/** dispatch 결과 → 호랑이 테스트 결과(통과 여부 + 근거). merge>0 && !waited = 통과. */
function toTestResult(d: RecoveryDispatchResult): RecoveryTestResult {
  const passed = d.mergedPhases > 0 && !d.waited;
  const evidence = passed
    ? `검증 통과 — merge ${d.mergedPhases} phase(verify_command 재현·검증 OK)`
    : d.waited
      ? `보류(토큰 소진/풀 불가용)${d.reason ? ` — ${d.reason}` : ''}`
      : `검증 실패 — merge 0${d.reason ? ` — ${d.reason}` : ''}`;
  return { passed, evidence };
}

/**
 * 단일 incident 복구 1사이클: startFix(→fixing, attempt++) → dispatch → testing →
 * applyTestResult(→resolved | fixing 재시도 | escalated). 패치·알림 포함. never-throw(호출측 가드).
 */
async function recoverOne(
  incident: RecoveryIncident,
  deps: TigerRecoveryDeps,
  result: TigerRecoveryResult,
  tg: TelegramClient,
  founderUIBase: string,
): Promise<void> {
  // 1. dispatch 시작 전이(approved → fixing, attempt++).
  const started = startFix(incident);
  if (started.next_status !== 'fixing') {
    // 승인 전이거나 비정상 — dispatch 금지.
    result.errors.push(`${incident.id}: ${started.reason}`);
    return;
  }
  const fixing: RecoveryIncident = {
    ...incident,
    status: 'fixing',
    attempt_count: started.attempt_count,
  };
  try {
    await deps.updateIncident(incident.id, started.patch);
  } catch (err) {
    result.errors.push(`updateIncident(fixing,${incident.id}): ${(err as Error).message}`);
  }

  // 2. CTO 수정 + 호랑이 검증(intent에 verify_command 묶음 → native-orchestrator가 재현·검증).
  const intent = buildRecoveryFixIntent({
    incident: fixing,
    verify_command: fixing.verify_command ?? deps.verifyCommand,
    attempt: fixing.attempt_count,
    now: result.run_at,
  });
  result.attempted += 1;

  let dispatch: RecoveryDispatchResult;
  try {
    dispatch = await deps.dispatchFix(intent);
  } catch (err) {
    // dispatch 자체 예외 = 이번 시도 실패로 환산(상한 판정에 반영).
    dispatch = { mergedPhases: 0, waited: false, reason: `dispatch 예외: ${(err as Error).message}` };
  }

  // 3. testing 상태 기록(호랑이 검증 중) — 부가적, 실패해도 흐름 진행.
  try {
    await deps.updateIncident(incident.id, { status: 'testing', attempt_count: fixing.attempt_count });
  } catch {
    /* 부가 표시 — 무시 */
  }

  // 4. 테스트 결과 → 전이.
  const test = toTestResult(dispatch);
  const testingIncident: RecoveryIncident = { ...fixing, status: 'testing' };
  const after = applyTestResult(testingIncident, test);

  try {
    await deps.updateIncident(incident.id, after.patch);
  } catch (err) {
    result.errors.push(`updateIncident(${after.next_status},${incident.id}): ${(err as Error).message}`);
  }

  // 5. 카운트 + 알림.
  const label = incident.task_label ?? incident.id;
  const link = `${founderUIBase}/self-improve`;
  if (after.notify === 'resolved') {
    result.resolved += 1;
    const tgRes = await tg.send({
      title: `🐯 호랑이 복구 완료 — ${label}`,
      body: `고쳤어요. 다시 시도하세요.\n근거: ${test.evidence}\n시도 ${after.attempt_count}회.`,
      level: 'info',
      link,
      dedupKey: `tiger-recovery-resolved:${incident.id}:${after.attempt_count}`,
    });
    if (tgRes.ok) result.notified += 1;
  } else if (after.notify === 'escalated') {
    result.escalated += 1;
    const tgRes = await tg.send({
      title: `🚨 호랑이 복구 실패 — ${label} (사람이 봐야 해요)`,
      body:
        `${MAX_RECOVERY_ATTEMPTS}회 자동 수정 시도가 모두 실패했습니다.\n` +
        `장애 유형: ${incident.incident_type ?? 'unknown'}\n` +
        (incident.error_summary ? `오류: ${incident.error_summary}\n` : '') +
        `마지막 근거: ${test.evidence}\n` +
        `상태: ${STATUS_KO[after.next_status]}.`,
      level: 'urgent',
      link,
      dedupKey: `tiger-recovery-escalated:${incident.id}`,
    });
    if (tgRes.ok) result.notified += 1;
  } else {
    // fixing 재시도 — 다음 run에서 다시 approved? 아니다: status는 fixing.
    // 다음 run이 이 incident를 다시 잡으려면 approved여야 하므로, 재시도 대상으로 approved로
    // 되돌린다(같은 run에서 즉시 반복하지 않고 다음 폴링 사이클에 처리 — 토큰 폭주 방지).
    result.retried += 1;
    try {
      await deps.updateIncident(incident.id, { status: 'approved', attempt_count: after.attempt_count });
    } catch (err) {
      result.errors.push(`updateIncident(requeue,${incident.id}): ${(err as Error).message}`);
    }
  }
}

/**
 * 호랑이 복구 본체(deps 주입형). never-throw — 모든 IO try/guard, errors 누적.
 */
export async function runTigerRecovery(deps: TigerRecoveryDeps): Promise<TigerRecoveryResult> {
  const runAt = deps.now ?? new Date().toISOString();
  const result: TigerRecoveryResult = {
    run_at: runAt,
    approved_loaded: 0,
    attempted: 0,
    resolved: 0,
    retried: 0,
    escalated: 0,
    notified: 0,
    errors: [],
  };

  let approved: RecoveryIncident[];
  try {
    approved = await deps.fetchApprovedIncidents();
  } catch (err) {
    result.errors.push(`fetchApprovedIncidents: ${(err as Error).message}`);
    return result;
  }
  result.approved_loaded = approved.length;
  if (approved.length === 0) return result;

  const tg = deps.telegram ?? createTelegramClient();
  const founderUIBase = deps.founderUIBaseUrl ?? process.env.FOUNDER_UI_BASE_URL ?? 'http://localhost:3002';
  const cap = deps.maxPerRun ?? 5;

  for (const incident of approved.slice(0, cap)) {
    // 승인 게이트 재확인 — approved만 처리(decideRecoveryAction='dispatch_fix').
    if (decideRecoveryAction(incident) !== 'dispatch_fix') continue;
    try {
      await recoverOne(incident, deps, result, tg, founderUIBase);
    } catch (err) {
      result.errors.push(`recoverOne(${incident.id}): ${(err as Error).message}`);
    }
  }

  return result;
}

/**
 * launchd/gateway 진입점. 실제 어댑터로 runTigerRecovery를 호출하고 LoopResult로 환원.
 * dispatchFix(agent-runtime runApprovedBatch/native-orchestrator)·fetchApprovedIncidents·
 * updateIncident는 Live 래퍼(runner.ts)가 주입한다. never-throw.
 */
export async function runTigerRecoveryLoop(
  context: LoopContext,
  deps: TigerRecoveryDeps,
): Promise<LoopResult> {
  void context;
  let res: TigerRecoveryResult;
  try {
    res = await runTigerRecovery(deps);
  } catch (err) {
    return {
      loop: 'tiger-recovery',
      status: 'error',
      summary: `호랑이 복구 예외: ${(err as Error).message}`,
      actions: [],
    };
  }

  const acted = res.resolved + res.retried + res.escalated;
  const status: LoopResult['status'] =
    acted > 0 ? 'ok' : res.errors.length > 0 ? 'error' : 'skipped';
  const summary =
    acted > 0
      ? `복구 시도 ${res.attempted}: 해결 ${res.resolved}, 재시도 ${res.retried}, 에스컬 ${res.escalated}. 알림 ${res.notified}.`
      : res.approved_loaded === 0
        ? '승인된 장애 없음 — skip.'
        : `처리 0건(errors ${res.errors.length}).`;

  return {
    loop: 'tiger-recovery',
    status,
    summary,
    actions: res.escalated > 0 ? ['await-human-review'] : res.retried > 0 ? ['retry-next-cycle'] : [],
  };
}
