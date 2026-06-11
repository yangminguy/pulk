// 호랑이(Tiger) 실시간 장애 감시 — liveness 순수 도메인 로직 (reactive 모드).
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (실시간 감시·자동복구).
//
// 페인포인트: 사장님이 키콘텐츠/영상룸 등을 승인하고 기다리는데, 백그라운드 실행이
//   오류로 멈추면 사장님은 모른 채 무한 대기한다. → 호랑이가 감시하다 감지·알림·복구.
//
// 이 파일의 책임(NocoBase/fs/fetch/spawn 비의존):
//   1) WatchTarget 레지스트리: 감시 대상 "작업 유형"별로 heartbeat 종류·기대 max·repo·담당.
//   2) detectIncidents: 작업별 진행상태 스냅샷(배열) → 작업별 liveness probe 평가 →
//      Incident 후보 배열. 핵심 원칙(사장님 확정):
//        - "진행 없음"만으로 장애 판정 금지. heartbeat가 살아있으면(갱신중/프로세스 alive/
//          max 미초과) "지금 로딩/처리 중"으로 보고 정상 통과(non-intrusive).
//        - heartbeat 죽음 + 진행정지(또는 기대 max 초과)일 때만 stall 장애.
//        - status=failed/error는 즉시 장애.
//   never-throw. 모든 판단 룰은 단위테스트.

import type { TigerExecutiveRole } from './collector';

/** heartbeat(생존신호) 종류 — 작업 유형별로 "진행 중"을 어떻게 확인하는가. */
export type HeartbeatKind =
  /** native_phase_runs 행의 status/started_at/updatedAt 갱신(=phase 진행). */
  | 'native_phase_run'
  /** agent_tasks 행의 status/updated_at 변화. */
  | 'agent_task'
  /** OS 프로세스 생존(pid alive). */
  | 'process'
  /** 로그 파일의 라인 수 증가. */
  | 'log_growth';

/** repo_path 해석 규칙(tool-registry와 동일 규약). */
export type WatchRepoKind = 'pulk-relative' | 'absolute';

/**
 * 감시 대상 1유형 = "어떤 승인 대기 작업을, 누가 책임지고, 어떤 heartbeat로,
 * 얼마나 오래 걸려도 정상인지, 어느 repo에서 도는지".
 * 무인 자율 원칙: 새 감시 작업은 이 배열에 1줄 등록.
 */
export interface WatchTarget {
  /** 안정적 식별자(스네이크). Incident.target_id, dedup 키 구성요소. */
  id: string;
  /** 사람이 읽는 작업 이름(텔레그램/벨 카드 라벨). */
  label: string;
  /** 담당 임원(복구 디스패치 owner). */
  owner: TigerExecutiveRole;
  /** 진행 중 판정에 쓰는 heartbeat 종류. */
  heartbeat: HeartbeatKind;
  /**
   * 이 작업이 정상적으로 걸릴 수 있는 최대 시간(ms). started_at 이후 이 시간을 넘기면
   * heartbeat 갱신이 있더라도 "처리 지연"으로 보고 장애 후보로 올린다(무한 로딩 방지).
   */
  expectedMaxMs: number;
  /**
   * heartbeat가 "최근 갱신"으로 인정되는 허용 정지 구간(ms). 마지막 heartbeat 이후 이
   * 시간을 넘기면 heartbeat가 죽은 것으로 본다. 고정 글로벌 타임아웃이 아니라 작업별 값.
   */
  heartbeatStaleMs: number;
  repo_path_kind: WatchRepoKind;
  repo_path: string;
  /** 호랑이 복구 테스트로 쓸 검증 명령(작업 repo 기준, worktree 루트에서 실행).
   *  없으면 recovery가 루트 `npx tsc --noEmit` 폴백. 서브패키지는 `cd <pkg> && ...` 형태. */
  verify_command?: string;
}

/**
 * 확정 감시 레지스트리 — 승인 대기 작업 우선(키콘텐츠/영상룸/CMO 워크플로우/CTO phase).
 * 펄크 전체가 아니라 사장님이 승인하고 기다리는 작업만.
 */
export const WATCH_TARGET_REGISTRY: readonly WatchTarget[] = [
  {
    id: 'cmo_key_content_report',
    label: '키 콘텐츠 보고서',
    owner: 'CMO',
    heartbeat: 'native_phase_run',
    expectedMaxMs: 20 * 60 * 1000, // 보고서 생성 최대 20분
    heartbeatStaleMs: 5 * 60 * 1000, // 5분간 phase 무갱신 = heartbeat 죽음
    repo_path_kind: 'pulk-relative',
    repo_path: 'packages/l5-core',
    verify_command: 'cd packages/l5-core && npx tsc --noEmit',
  },
  {
    id: 'cmo_video_room',
    label: '영상룸',
    owner: 'CMO',
    heartbeat: 'native_phase_run',
    expectedMaxMs: 30 * 60 * 1000, // 영상 처리 최대 30분
    heartbeatStaleMs: 8 * 60 * 1000,
    repo_path_kind: 'pulk-relative',
    repo_path: 'apps/founder-ui',
    verify_command: 'cd apps/founder-ui && npx tsc --noEmit',
  },
  {
    id: 'cmo_workflow',
    label: 'CMO 마케팅 워크플로우',
    owner: 'CMO',
    heartbeat: 'agent_task',
    expectedMaxMs: 25 * 60 * 1000,
    heartbeatStaleMs: 6 * 60 * 1000,
    repo_path_kind: 'pulk-relative',
    repo_path: 'packages/l5-core',
    verify_command: 'cd packages/l5-core && npx tsc --noEmit',
  },
  {
    id: 'cto_phase_run',
    label: 'CTO phase 실행',
    owner: 'CTO',
    heartbeat: 'native_phase_run',
    expectedMaxMs: 40 * 60 * 1000, // 코딩/QA phase 최대 40분
    heartbeatStaleMs: 10 * 60 * 1000,
    repo_path_kind: 'pulk-relative',
    repo_path: 'services/agent-runtime',
    verify_command: 'cd services/agent-runtime && npx tsc --noEmit',
  },
];

/** 전체 감시 레지스트리(읽기 전용). */
export function listWatchTargets(): readonly WatchTarget[] {
  return WATCH_TARGET_REGISTRY;
}

/** id로 감시 대상 단건 조회. */
export function getWatchTarget(id: string): WatchTarget | undefined {
  return WATCH_TARGET_REGISTRY.find((t) => t.id === id);
}

/**
 * 감시 중인 "작업 한 건"의 진행상태 스냅샷. hermes 어댑터가 실제 소스
 * (native_phase_runs status/started_at, agent_tasks status/updated_at, pid alive,
 * 로그 라인 수)에서 읽어 채운다. l5-core는 이 사실들만 본다(IO 비의존).
 */
export interface WorkSnapshot {
  /** 어느 감시 대상 유형인지(WatchTarget.id). 레지스트리에 없으면 평가 제외. */
  target_id: string;
  /** 작업 인스턴스 식별자(예: l5_task_id, native_phase_run id, task id). dedup·역추적. */
  work_id: string;
  /** 사람이 읽는 작업 제목(있으면 알림에 노출). */
  work_title?: string;
  business_id?: string | null;
  /** 작업 시작 시각(ISO). 기대 max 초과 판정의 기준. */
  started_at?: string;
  /**
   * 작업 상태 문자열(소스 원본). 'failed'|'error'|'killed' 류면 즉시 장애.
   * native_phase_runs.status 또는 agent_tasks.status 등.
   */
  status?: string;
  /**
   * 마지막 heartbeat 시각(ISO). native_phase_run의 updatedAt/started_at, agent_task의
   * updated_at, 로그 마지막 라인 시각 등 "가장 최근 진행 흔적". 없으면 started_at로 폴백.
   */
  last_heartbeat_at?: string;
  /**
   * heartbeat='process'일 때 프로세스 생존 여부. true면 살아있음(정상 가능),
   * false면 죽음(진행정지 후보). undefined면 프로세스 신호 없음(다른 heartbeat로 판정).
   */
  process_alive?: boolean;
  /** 진단/카드용 짧은 오류 요지(있으면). PII 없는 요약만. */
  error_excerpt?: string;
}

/** 장애 유형. */
export type IncidentKind =
  /** status=failed/error/killed — 즉시 장애. */
  | 'failed'
  /** heartbeat 죽음 + 진행정지 — 진짜 멈춤. */
  | 'stall'
  /** heartbeat는 있으나 기대 max 초과 — 처리 지연(무한 로딩). */
  | 'overrun';

/** liveness probe가 "정상"으로 통과시킨 사유(장애 아님, 디버그용). */
export type LivenessVerdict =
  | 'healthy_progressing' // heartbeat 최근 갱신 → 처리 중
  | 'healthy_process_alive' // 프로세스 살아있음 → 처리 중
  | 'healthy_within_max'; // max 미초과 + heartbeat 미확정 → 아직 정상 범위

/**
 * 감지된 장애 1건. 진단·복구 디스패치·알림의 입력.
 * heartbeat_evidence: "왜 멈춤으로 판정했나"의 근거(비침습 확인 결과).
 */
export interface Incident {
  /** 안정적 dedup 키: `${target_id}:${work_id}`. */
  incident_key: string;
  target_id: string;
  /** 사람이 읽는 작업 유형 라벨(레지스트리). */
  target_label: string;
  owner: TigerExecutiveRole;
  work_id: string;
  work_title?: string;
  business_id?: string | null;
  kind: IncidentKind;
  /** 오류 요지(있으면). */
  error_excerpt?: string;
  /** 감지 시각(ISO). */
  detected_at: string;
  /** 판정 근거(heartbeat 평가 결과). */
  heartbeat_evidence: string;
  /** 복구 디스패치용 repo 정보(레지스트리에서 복사). */
  repo_path_kind: WatchRepoKind;
  repo_path: string;
}

/** detectIncidents 결과(요약 + 후보). */
export interface DetectIncidentsResult {
  detected_at: string;
  /** 평가한 스냅샷 수. */
  evaluated: number;
  /** 정상 통과(장애 아님) 수. */
  healthy: number;
  /** 감지된 장애 후보. */
  incidents: Incident[];
  /** 레지스트리에 없어 건너뛴 target_id 수. */
  skipped_unknown: number;
}

export interface DetectIncidentsInput {
  /** 감시 중 작업들의 진행상태 스냅샷. */
  snapshots: WorkSnapshot[];
  /** 현재 시각(ISO). 결정론용. 기본 now. */
  now?: string;
  /** 레지스트리 override(tests). 기본 WATCH_TARGET_REGISTRY. */
  registry?: readonly WatchTarget[];
}

/** status 문자열이 즉시 장애(failed류)인지. 소스마다 표기가 달라 관대하게 매칭. */
function isFailedStatus(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s === 'failed' ||
    s === 'error' ||
    s === 'errored' ||
    s === 'killed' ||
    s === 'crashed' ||
    s === 'aborted'
  );
}

/** status 문자열이 종료완료(정상 종료)인지 — 감시 대상 아님. */
function isTerminalOk(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === 'done' || s === 'completed' || s === 'merged' || s === 'passed';
}

function parseMs(iso: string | undefined): number {
  if (!iso) return NaN;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * 단일 스냅샷을 평가해 Incident 또는 정상 판정을 반환.
 * 판정 순서(사장님 확정 원칙):
 *   0. 정상 종료(done 등) → 장애 아님(null).
 *   1. failed/error/killed → 즉시 'failed' 장애.
 *   2. heartbeat 살아있음(프로세스 alive / 최근 갱신) → 정상 통과(처리 중).
 *      단, 기대 max 초과면 'overrun' 장애(무한 로딩 방지).
 *   3. heartbeat 죽음(stale) + 진행정지 → 'stall' 장애.
 *   4. 그 외(아직 max 미초과 + heartbeat 미확정) → 정상 통과(로딩 중일 수 있음).
 */
function evaluateSnapshot(
  snap: WorkSnapshot,
  target: WatchTarget,
  nowMs: number,
): { incident?: Incident; verdict?: LivenessVerdict } {
  const base = {
    incident_key: `${snap.target_id}:${snap.work_id}`,
    target_id: snap.target_id,
    target_label: target.label,
    owner: target.owner,
    work_id: snap.work_id,
    work_title: snap.work_title,
    business_id: snap.business_id ?? null,
    error_excerpt: snap.error_excerpt,
    detected_at: new Date(nowMs).toISOString(),
    repo_path_kind: target.repo_path_kind,
    repo_path: target.repo_path,
  };

  // 0. 정상 종료 → 감시 종료(장애 아님).
  if (isTerminalOk(snap.status)) {
    return { verdict: 'healthy_progressing' };
  }

  // 1. 즉시 장애.
  if (isFailedStatus(snap.status)) {
    return {
      incident: {
        ...base,
        kind: 'failed',
        heartbeat_evidence: `status=${snap.status} → 즉시 장애`,
      },
    };
  }

  const startedMs = parseMs(snap.started_at);
  const elapsedMs = Number.isFinite(startedMs) ? nowMs - startedMs : NaN;

  // heartbeat 평가: 마지막 진행 흔적이 얼마나 됐나.
  // process heartbeat는 alive 플래그를 우선 신뢰, 아니면 last_heartbeat_at로 폴백.
  const lastHbMs = parseMs(snap.last_heartbeat_at ?? snap.started_at);
  const hbAgeMs = Number.isFinite(lastHbMs) ? nowMs - lastHbMs : NaN;
  const heartbeatFresh =
    Number.isFinite(hbAgeMs) && hbAgeMs >= 0 && hbAgeMs <= target.heartbeatStaleMs;
  const processAlive = target.heartbeat === 'process' && snap.process_alive === true;
  const processDead = target.heartbeat === 'process' && snap.process_alive === false;

  // 2. 기대 max 초과 → overrun(heartbeat가 살아있어도 무한 로딩 방지).
  if (Number.isFinite(elapsedMs) && elapsedMs > target.expectedMaxMs) {
    return {
      incident: {
        ...base,
        kind: 'overrun',
        heartbeat_evidence:
          `경과 ${Math.round(elapsedMs / 60000)}분 > 기대 max ` +
          `${Math.round(target.expectedMaxMs / 60000)}분 → 처리 지연/무한 로딩`,
      },
    };
  }

  // 3. heartbeat 살아있음 → 정상(처리 중). 진행 없음만으로 장애 판정 금지.
  if (processAlive) {
    return { verdict: 'healthy_process_alive' };
  }
  if (heartbeatFresh && !processDead) {
    return { verdict: 'healthy_progressing' };
  }

  // 4. heartbeat 죽음 + 진행정지 → stall 장애.
  //    근거: 프로세스 죽음(processDead) 또는 heartbeat가 stale(hbAge > staleMs).
  const heartbeatStale = Number.isFinite(hbAgeMs) && hbAgeMs > target.heartbeatStaleMs;
  if (processDead || heartbeatStale) {
    const reasonParts: string[] = [];
    if (processDead) reasonParts.push('프로세스 죽음');
    if (heartbeatStale) {
      reasonParts.push(
        `heartbeat ${Math.round(hbAgeMs / 60000)}분 정지 > 허용 ` +
          `${Math.round(target.heartbeatStaleMs / 60000)}분`,
      );
    }
    return {
      incident: {
        ...base,
        kind: 'stall',
        heartbeat_evidence: reasonParts.join(', '),
      },
    };
  }

  // 5. 그 외 — heartbeat 정보 부족 + max 미초과 → 아직 정상(로딩 중일 수 있음).
  return { verdict: 'healthy_within_max' };
}

/**
 * 감시 대상 작업들의 진행상태 스냅샷을 평가해 Incident 후보를 추린다.
 * never-throw — 어떤 스냅샷이 깨져도 그 한 건만 건너뛰고 계속.
 */
export function detectIncidents(input: DetectIncidentsInput): DetectIncidentsResult {
  const nowIso = input.now ?? new Date().toISOString();
  const nowMs = parseMs(nowIso) || Date.now();
  const registry = input.registry ?? WATCH_TARGET_REGISTRY;
  const byId = new Map(registry.map((t) => [t.id, t]));

  const result: DetectIncidentsResult = {
    detected_at: nowIso,
    evaluated: 0,
    healthy: 0,
    incidents: [],
    skipped_unknown: 0,
  };

  for (const snap of input.snapshots ?? []) {
    if (!snap || typeof snap.target_id !== 'string' || typeof snap.work_id !== 'string') {
      continue;
    }
    const target = byId.get(snap.target_id);
    if (!target) {
      result.skipped_unknown += 1;
      continue;
    }
    result.evaluated += 1;
    try {
      const { incident } = evaluateSnapshot(snap, target, nowMs);
      if (incident) {
        result.incidents.push(incident);
      } else {
        result.healthy += 1;
      }
    } catch {
      // 한 건 평가 실패는 무시(never-throw). 보수적으로 healthy로 치지 않고 건너뜀.
      result.evaluated -= 1;
    }
  }

  return result;
}
