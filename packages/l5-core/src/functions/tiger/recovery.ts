// 호랑이(Tiger) 실시간 복구 상태머신 — l5-core 순수 도메인 로직 (reactive 모드).
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (실시간 감시·자동복구).
//
// 사장님이 설계한 복구 흐름의 "판단" 부분(NocoBase/fetch/spawn 비의존):
//   detected → (사장님 승인) → approved → fixing(CTO 수정) → testing(호랑이 재현·검증)
//     → 통과 → resolved
//     → 실패 → attempt_count++ 후 다시 fixing (6↔7 루프)
//     → attempt_count 4 초과 → escalated ("사람이 봐야 해요" + 시도 내역)
//
// 이 파일의 책임:
//   1) RecoveryState 전이 함수(transitionRecovery) — 상태 + 테스트 결과 → 다음 상태/패치.
//   2) 다음 액션 결정(decideRecoveryAction) — 어느 상태에서 무엇을 할지(dispatch/test/notify/none).
//   3) 오류 컨텍스트 → CTO 수정 intent 빌더(buildRecoveryFixIntent) — 오류요지/진단/대상repo를 prompt로.
//   never-throw. 4회 루프 경계는 단위테스트 필수.

import type { TigerExecutiveRole } from './collector';
import type { ACRIntent, CTOPhase } from '../../types/acr-intent';

/** tiger_incidents.status 라이프사이클(NocoBase 컬렉션·UI와 계약 공유). */
export type RecoveryStatus =
  | 'detected' // 호랑이 감지, 사장님 승인 대기(코딩 금지 게이트)
  | 'approved' // 사장님 승인 → CTO 수정 dispatch 대상
  | 'fixing' // CTO가 수정 중
  | 'testing' // 호랑이가 실패 과정 재현·검증 중
  | 'resolved' // 통과 — 다시 시도 가능
  | 'escalated'; // 4회 실패 — 사람이 봐야 함

/** 재시도 상한(무한 루프·토큰 폭주 방지). 사장님 확정 = 4회. */
export const MAX_RECOVERY_ATTEMPTS = 4;

/** incident_type(감지 유형) — tiger_incidents.incident_type. */
export type RecoveryIncidentType = 'failed' | 'stalled' | 'error';

/**
 * 복구 상태머신이 보는 incident 1건(tiger_incidents 행의 read 뷰).
 * watcher가 적재한 detected 행에서 복구 루프가 읽어 채운다(IO는 hermes 어댑터가).
 */
export interface RecoveryIncident {
  id: string;
  status: RecoveryStatus;
  /** 6↔7 루프 누적 시도 횟수(상한 MAX_RECOVERY_ATTEMPTS). */
  attempt_count: number;
  /** 수정 대상 repo 절대경로(CTO dispatch cwd). */
  target_repo?: string | null;
  /** 사장님이 알아볼 작업명. */
  task_label?: string | null;
  /** 감시 대상 작업 식별자(역추적). */
  task_ref?: string | null;
  incident_type?: RecoveryIncidentType | null;
  /** 오류 요지(메시지/스택 발췌). CTO intent prompt 입력. */
  error_summary?: string | null;
  /** 호랑이 진단(있으면 prompt에 실음). */
  diagnosis?: string | null;
  /** "이렇게 고치게 하겠다" 수정 계획(있으면 prompt에 실음). */
  proposed_fix?: string | null;
  /** 작업 repo 기준 검증 명령(호랑이 테스트). 없으면 deps.verifyCommand/루트 tsc 폴백. */
  verify_command?: string | null;
}

/** 호랑이 테스트(실패 과정 재현·검증) 결과 — 통과 여부 + 근거. */
export interface RecoveryTestResult {
  passed: boolean;
  /** 통과/실패 근거(verify_command exit, 재현 로그 요지 등). */
  evidence: string;
}

/** 다음에 호랑이 복구 루프가 수행할 액션 종류. */
export type RecoveryActionKind =
  /** approved → CTO 수정 dispatch 시작(상태 fixing으로 전이 후 dispatch). */
  | 'dispatch_fix'
  /** fixing 끝난 뒤 호랑이 테스트(재현·검증) 수행(상태 testing). */
  | 'run_test'
  /** 종착(resolved/escalated) — 더 할 일 없음(알림만 별도). */
  | 'none';

/**
 * 현재 incident 상태에서 무엇을 해야 하는지 결정.
 * - detected: 사장님 승인 대기 → none(루프는 건드리지 않음).
 * - approved: CTO 수정 dispatch 시작.
 * - fixing: 직전 dispatch가 끝났다고 가정하고 호랑이 테스트(run_test). (루프가 dispatch→test를
 *   한 사이클로 수행하므로 보통 dispatch_fix 직후 run_test를 이어서 한다.)
 * - testing/resolved/escalated: none.
 */
export function decideRecoveryAction(incident: RecoveryIncident): RecoveryActionKind {
  switch (incident.status) {
    case 'approved':
      return 'dispatch_fix';
    case 'fixing':
      return 'run_test';
    default:
      return 'none';
  }
}

/** transitionRecovery가 돌려주는 다음 상태 + tiger_incidents 패치(:update 페이로드). */
export interface RecoveryTransition {
  /** 전이 후 상태. */
  next_status: RecoveryStatus;
  /** 전이 후 누적 시도 횟수. */
  attempt_count: number;
  /** tiger_incidents :update 페이로드(status + attempt_count). */
  patch: { status: RecoveryStatus; attempt_count: number };
  /** 텔레그램 알림이 필요한 종착인지("고쳤어요"/"막혔어요"). */
  notify: 'resolved' | 'escalated' | 'none';
  /** 판정 근거(로그/알림용). */
  reason: string;
}

/**
 * approved → fixing 전이(CTO 수정 dispatch 직전). attempt_count는 dispatch 시작 시점에 증가시켜
 * "이번이 N번째 시도"를 명확히 한다. detected/그 외에서 호출되면 no-op(상태 유지).
 */
export function startFix(incident: RecoveryIncident): RecoveryTransition {
  if (incident.status !== 'approved' && incident.status !== 'fixing') {
    return {
      next_status: incident.status,
      attempt_count: incident.attempt_count,
      patch: { status: incident.status, attempt_count: incident.attempt_count },
      notify: 'none',
      reason: `startFix: status=${incident.status} — 승인 전이므로 dispatch 금지`,
    };
  }
  const nextAttempt = incident.attempt_count + 1;
  return {
    next_status: 'fixing',
    attempt_count: nextAttempt,
    patch: { status: 'fixing', attempt_count: nextAttempt },
    notify: 'none',
    reason: `${nextAttempt}번째 수정 시도 시작`,
  };
}

/**
 * 호랑이 테스트 결과를 받아 전이(testing 판정).
 *   - passed=true → resolved + notify(resolved).
 *   - passed=false:
 *       attempt_count < MAX → fixing(재시도, 6↔7 루프). notify none.
 *       attempt_count >= MAX → escalated + notify(escalated, 시도 내역).
 * attempt_count는 startFix에서 이미 증가된 값을 그대로 사용(여기선 증가시키지 않음).
 * never-throw — incident가 깨져도 안전한 escalated로 보내지 않고 현 상태 기반 보수 판정.
 */
export function applyTestResult(
  incident: RecoveryIncident,
  test: RecoveryTestResult,
): RecoveryTransition {
  const attempts = Number.isFinite(incident.attempt_count) ? incident.attempt_count : 0;

  if (test.passed) {
    return {
      next_status: 'resolved',
      attempt_count: attempts,
      patch: { status: 'resolved', attempt_count: attempts },
      notify: 'resolved',
      reason: `테스트 통과(${attempts}번째 시도): ${test.evidence}`,
    };
  }

  // 실패. 상한 도달 여부로 재시도 vs 에스컬레이션.
  if (attempts >= MAX_RECOVERY_ATTEMPTS) {
    return {
      next_status: 'escalated',
      attempt_count: attempts,
      patch: { status: 'escalated', attempt_count: attempts },
      notify: 'escalated',
      reason: `${attempts}회 시도 모두 실패 — 사람 개입 필요. 마지막 근거: ${test.evidence}`,
    };
  }

  return {
    next_status: 'fixing',
    attempt_count: attempts,
    patch: { status: 'fixing', attempt_count: attempts },
    notify: 'none',
    reason: `${attempts}번째 시도 실패 — 재시도 예정: ${test.evidence}`,
  };
}

/**
 * 통합 전이: 상태 + (테스트 결과) → 다음 상태. 루프가 한 사이클(dispatch→test)을 돌린 뒤
 * 결과를 이걸로 환원해도 되도록, test 인자가 있으면 applyTestResult, 없으면 startFix를 위임.
 * never-throw.
 */
export function transitionRecovery(
  incident: RecoveryIncident,
  test?: RecoveryTestResult,
): RecoveryTransition {
  try {
    if (test) return applyTestResult(incident, test);
    return startFix(incident);
  } catch {
    // 어떤 입력이 깨져도 현 상태 유지(보수적). 종착으로 강제하지 않음.
    return {
      next_status: incident.status,
      attempt_count: incident.attempt_count,
      patch: { status: incident.status, attempt_count: incident.attempt_count },
      notify: 'none',
      reason: 'transition error — 상태 유지',
    };
  }
}

/** buildRecoveryFixIntent 입력(전후 사정). */
export interface RecoveryFixContext {
  incident: RecoveryIncident;
  /** dispatch owner(레지스트리 owner). 기본 CTO. */
  owner?: TigerExecutiveRole;
  /** 직전 입력/재현 단서(있으면 prompt에 실음). 예: 실패한 phase 입력 요지. */
  prior_input?: string;
  /** 호랑이 테스트로 쓸 검증 명령(있으면 phase.verify_command). 미지정 시 보수적 typecheck. */
  verify_command?: string;
  /** intent.created_at(결정론). 기본 now. */
  now?: string;
  /** 현재 시도 회차(prompt 표기용). 기본 incident.attempt_count. */
  attempt?: number;
}

/** 짧게 자르기(프롬프트 토큰 보호). */
function clip(s: string | null | undefined, n: number): string {
  if (!s) return '';
  const t = String(s).trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/**
 * 오류 전후 사정(오류요지/스택/진단/직전입력/대상repo)을 CTO가 받아 고칠 수 있는
 * ACRIntent로 빌드한다. native-orchestrator(batch-runner)가 그대로 실행할 수 있는 형태.
 *   - code phase(claude): 수정. verify_command로 호랑이 테스트(실패 과정 재현·검증)를 묶는다.
 *   - never-throw: 입력이 비어도 안전한 기본 prompt로 intent를 만든다.
 * ★ OpenAI 절대 미사용 — code phase runtime은 claude 고정.
 */
export function buildRecoveryFixIntent(ctx: RecoveryFixContext): ACRIntent {
  const inc = ctx.incident;
  const now = ctx.now ?? new Date().toISOString();
  const attempt = Number.isFinite(ctx.attempt as number)
    ? (ctx.attempt as number)
    : inc.attempt_count;
  const verify = ctx.verify_command && ctx.verify_command.trim()
    ? ctx.verify_command.trim()
    : 'npx tsc --noEmit';

  const label = clip(inc.task_label, 80) || inc.id;
  const parts: string[] = [
    `[호랑이 실시간 복구] "${label}" 작업이 멈췄거나 실패했습니다. 사장님이 승인했으니 고쳐주세요.`,
    `시도 회차: ${attempt}/${MAX_RECOVERY_ATTEMPTS}`,
  ];
  if (inc.incident_type) parts.push(`장애 유형: ${inc.incident_type}`);
  if (inc.error_summary) parts.push(`오류 요지/스택:\n${clip(inc.error_summary, 1200)}`);
  if (inc.diagnosis) parts.push(`호랑이 진단:\n${clip(inc.diagnosis, 800)}`);
  if (inc.proposed_fix) parts.push(`제안된 수정 방향:\n${clip(inc.proposed_fix, 800)}`);
  if (ctx.prior_input) parts.push(`직전 입력/재현 단서:\n${clip(ctx.prior_input, 800)}`);
  parts.push(
    `수정 후 반드시 검증을 통과시켜야 합니다(호랑이가 \`${verify}\`로 재현·검증합니다).`,
  );

  const code: CTOPhase = {
    name: 'recover',
    runtime: 'claude',
    prompt_packet: parts.join('\n\n'),
    expected_output: '실패 원인을 제거한 코드 수정 + 통과하는 검증',
    risk_level: 'D1',
    release_gate_type: 'none',
    l5_approval_required: false,
    auto_execute: true,
    depends_on: [],
    verify_command: verify,
  };

  return {
    l5_task_id: `tiger-recovery:${inc.id}:attempt${attempt}`,
    task_title: `[호랑이 복구] ${label} (시도 ${attempt})`,
    phases: [code],
    created_at: now,
    project_path: inc.target_repo ?? undefined,
    l5_approved: true,
  };
}
