// 호랑이(Tiger) 실시간 장애 감시 — hermes watcher 어댑터 (reactive 모드).
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (실시간 감시·자동복구).
//
// 짧은 주기(launchd 1~2분)로:
//   1. 승인 대기 작업의 진행상태를 실제 소스에서 읽어 WorkSnapshot[] 구성
//      (native_phase_runs status/started_at/updatedAt, agent_tasks status/updated_at, pid alive).
//   2. detectIncidents(@l5/core 순수) 호출 → Incident 후보.
//   3. dedup(같은 작업 이미 알린 incident는 재알림 금지) — 상태파일.
//   4. 새 incident만: 텔레그램 알림(🔔 founder-ui 벨과 동일 채널) + tiger_incidents REST :create.
//
// never-throw. 모든 IO/판단 소스는 deps로 주입 → 결정론 단위테스트.
// 코드 변경 없음(감지·알림·영속화만). 복구(코딩)는 승인 후 tiger-dispatch-loop가.

import { promises as fs } from 'fs';
import { join } from 'path';
import {
  detectIncidents,
  WATCH_TARGET_REGISTRY,
  selectDiagnosisModel,
  buildIncidentDiagnosisPrompt,
  parseIncidentDiagnosis,
  type Incident,
  type WorkSnapshot,
  type WatchTarget,
} from '@l5/core';
import { createTelegramClient } from '../notifier/telegram.js';
import type { TelegramClient } from '../notifier/telegram.js';
import type { ClaudeCliCommand, RunClaudeResult } from '../api/claude-cli.js';

/** 장애 1건당 Claude 정밀 진단 타임아웃. */
const DIAG_TIMEOUT_MS = 120_000;

/** native_phase_runs 1행(읽기 — 어댑터가 필요로 하는 필드만). */
export interface NativePhaseRunRow {
  id: string;
  l5_task_id?: string | null;
  task_title?: string | null;
  business_id?: string | null;
  phase_name?: string | null;
  status?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  updatedAt?: string | null;
  output?: string | null;
}

/** agent_tasks 1행(읽기 — 승인 대기/진행 중 작업). */
export interface AgentTaskRow {
  id: string;
  title?: string;
  assigned_agent?: string;
  status?: string;
  business_id?: string | null;
  blocker?: string;
  started_at?: string | null;
  updated_at?: string;
  created_at?: string;
  source_ref?: string;
}

/** Incident를 tiger_incidents 컬렉션에 영속화하는 페이로드. 컬렉션 스키마(plugin-executive-monitor)
 *  및 복구 루프(RecoveryIncident)와 필드명을 통일한다. UI(monitor:incidents)가 이 행을 읽어 표시. */
export interface TigerIncidentRecord {
  /** 감시 대상 작업 식별. */
  task_ref: string;
  /** 사장님이 알아볼 작업명. */
  task_label: string;
  incident_type: 'failed' | 'stalled' | 'error';
  /** 오류 요지(메시지/스택 발췌). */
  error_summary?: string;
  /** 호랑이 진단(감지 단계 기본; 정밀 분석은 승인 후 CTO). */
  diagnosis: string;
  /** "CTO에게 이렇게 고치게 하겠다" 수정 계획. */
  proposed_fix: string;
  /** 수정 대상 repo 절대경로. */
  target_repo: string;
  /** 라이프사이클: 감지 직후 detected(미승인). 승인 시 approved, 복구 후 resolved 등. */
  status: 'detected';
  attempt_count: number;
  detected_at: string;
  /** dedup·복구 추적 키(=incident_key). */
  source_ref: string;
}

export interface LivenessWatcherDeps {
  /** native_phase_runs 전체(또는 미종료분) 조회. */
  fetchNativePhaseRuns: () => Promise<NativePhaseRunRow[]>;
  /** agent_tasks 전체 조회(승인 대기/진행 중 필터는 어댑터가 수행). */
  fetchAgentTasks: () => Promise<AgentTaskRow[]>;
  /** Incident 1건 영속화(tiger_incidents :create). 기본 no-op(테스트). */
  persistIncident?: (rec: TigerIncidentRecord) => Promise<void>;
  /** Telegram client. 기본 env-configured. */
  telegram?: TelegramClient;
  /** state dir override(tests). 기본 HERMES_DIR/.omc/state. */
  stateDir?: string;
  /** 감시 레지스트리 override(tests). 기본 WATCH_TARGET_REGISTRY. */
  registry?: readonly WatchTarget[];
  /** 결정론용 현재시각. 기본 now. */
  now?: string;
  /** founder-ui base(알림 링크). 기본 FOUNDER_UI_BASE_URL env. */
  founderUIBaseUrl?: string;
  /** Claude CLI 실행기(정밀 진단용). 주입 시 감지 incident를 Claude로 진단해 diagnosis/proposed_fix를
   *  채운다. 미주입/실패 시 룰 기반 기본 진단 유지(never-throw). */
  runClaude?: (cmd: ClaudeCliCommand, timeoutMs: number) => Promise<RunClaudeResult>;
  /** Claude 실행 cwd(진단은 repo 무관). 기본 PULK_ROOT/cwd. */
  cwd?: string;
}

export interface LivenessWatcherResult {
  run_at: string;
  snapshots_built: number;
  evaluated: number;
  healthy: number;
  incidents_total: number;
  /** dedup 통과한 새 incident(알림·영속화 대상). */
  new_incidents: number;
  notified: number;
  persisted: number;
  errors: string[];
}

/** dedup 상태파일: 이미 알린 incident_key → 최초 알림 시각. */
interface WatcherState {
  alerted: Record<string, string>;
}

const ALERTED_TTL_MS = 6 * 60 * 60 * 1000; // 6h 후 같은 키 재알림 허용(장기 미해결 리마인드)

async function loadState(path: string): Promise<WatcherState> {
  try {
    const raw = await fs.readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as WatcherState;
    if (parsed && typeof parsed === 'object' && parsed.alerted) return parsed;
    return { alerted: {} };
  } catch {
    return { alerted: {} };
  }
}

/** 종료된 native_phase_run인지(감시 제외). */
function isPhaseRunTerminal(row: NativePhaseRunRow): boolean {
  if (row.ended_at) return true;
  const s = (row.status ?? '').toLowerCase();
  return s === 'done' || s === 'completed' || s === 'passed' || s === 'merged';
}

/**
 * native_phase_runs → WorkSnapshot. l5_task_id가 감시 대상에 매핑되도록 task_title/phase로
 * target_id를 추정한다. CTO phase는 cto_phase_run, 그 외는 task_title 기반 매핑이 없으면
 * cto_phase_run(기본 phase 작업)으로 둔다. heartbeat=updatedAt(없으면 started_at).
 */
function phaseRunToSnapshot(
  row: NativePhaseRunRow,
  registry: readonly WatchTarget[],
): WorkSnapshot | undefined {
  if (isPhaseRunTerminal(row)) return undefined;
  const targetId = inferPhaseRunTarget(row, registry);
  if (!targetId) return undefined;
  return {
    target_id: targetId,
    work_id: String(row.id),
    work_title: row.task_title ?? row.phase_name ?? undefined,
    business_id: row.business_id ?? null,
    started_at: row.started_at ?? undefined,
    status: row.status ?? undefined,
    last_heartbeat_at: row.updatedAt ?? row.started_at ?? undefined,
    error_excerpt: extractErrorExcerpt(row.output),
  };
}

/** task_title/phase 키워드로 감시 대상 유형 추정. 매핑 없으면 cto_phase_run 폴백. */
function inferPhaseRunTarget(
  row: NativePhaseRunRow,
  registry: readonly WatchTarget[],
): string | undefined {
  const ids = new Set(registry.map((t) => t.id));
  const hay = `${row.task_title ?? ''} ${row.phase_name ?? ''}`.toLowerCase();
  if (ids.has('cmo_key_content_report') && (hay.includes('키 콘텐츠') || hay.includes('key content') || hay.includes('키콘텐츠'))) {
    return 'cmo_key_content_report';
  }
  if (ids.has('cmo_video_room') && (hay.includes('영상룸') || hay.includes('video room') || hay.includes('영상'))) {
    return 'cmo_video_room';
  }
  if (ids.has('cto_phase_run')) return 'cto_phase_run';
  return undefined;
}

/** agent_tasks → WorkSnapshot(승인 대기 / 진행 중 CMO 워크플로우). */
function agentTaskToSnapshot(
  row: AgentTaskRow,
  registry: readonly WatchTarget[],
): WorkSnapshot | undefined {
  const status = (row.status ?? '').toLowerCase();
  // 종료/킬은 제외. 감시는 진행 중(running) + 정체(blocked) + 검토대기(needs_review).
  if (status === 'done' || status === 'killed') return undefined;
  const targetId = inferAgentTaskTarget(row, registry);
  if (!targetId) return undefined;
  return {
    target_id: targetId,
    work_id: String(row.id),
    work_title: row.title,
    business_id: row.business_id ?? null,
    started_at: row.started_at ?? row.created_at ?? undefined,
    status: row.status ?? undefined,
    last_heartbeat_at: row.updated_at ?? row.created_at ?? undefined,
    error_excerpt: row.blocker,
  };
}

/** CMO 담당 작업만 cmo_workflow로 감시(승인 대기 CMO 워크플로우 우선). */
function inferAgentTaskTarget(
  row: AgentTaskRow,
  registry: readonly WatchTarget[],
): string | undefined {
  const ids = new Set(registry.map((t) => t.id));
  if (ids.has('cmo_workflow') && row.assigned_agent === 'CMO') return 'cmo_workflow';
  return undefined;
}

/** output에서 짧은 오류 요지 추출(PII 마스킹은 telegram이 별도 수행). */
function extractErrorExcerpt(output: string | null | undefined): string | undefined {
  if (!output) return undefined;
  const line = output
    .split('\n')
    .find((l) => /error|fail|exception|throw|stack/i.test(l));
  const picked = (line ?? output).trim();
  return picked.length > 200 ? picked.slice(0, 200) + '…' : picked || undefined;
}

const KIND_LABEL: Record<Incident['kind'], string> = {
  failed: '실패/오류',
  stall: '멈춤(heartbeat 죽음)',
  overrun: '처리 지연(무한 로딩)',
};

/**
 * 실시간 watcher 본체(deps 주입형). never-throw.
 */
export async function runLivenessWatcher(
  deps: LivenessWatcherDeps,
): Promise<LivenessWatcherResult> {
  const runAt = deps.now ?? new Date().toISOString();
  const errors: string[] = [];
  const registry = deps.registry ?? WATCH_TARGET_REGISTRY;

  const hermesDir = process.env.HERMES_DIR ?? process.cwd();
  const stateDir = deps.stateDir ?? join(hermesDir, '.omc', 'state');
  const statePath = join(stateDir, 'tiger-watcher-state.json');

  const result: LivenessWatcherResult = {
    run_at: runAt,
    snapshots_built: 0,
    evaluated: 0,
    healthy: 0,
    incidents_total: 0,
    new_incidents: 0,
    notified: 0,
    persisted: 0,
    errors,
  };

  // 1. 진행상태 스냅샷 구성(소스별 graceful).
  const snapshots: WorkSnapshot[] = [];
  try {
    const runs = await deps.fetchNativePhaseRuns();
    for (const row of runs) {
      const s = phaseRunToSnapshot(row, registry);
      if (s) snapshots.push(s);
    }
  } catch (err) {
    errors.push(`fetchNativePhaseRuns: ${(err as Error).message}`);
  }
  try {
    const tasks = await deps.fetchAgentTasks();
    for (const row of tasks) {
      const s = agentTaskToSnapshot(row, registry);
      if (s) snapshots.push(s);
    }
  } catch (err) {
    errors.push(`fetchAgentTasks: ${(err as Error).message}`);
  }
  result.snapshots_built = snapshots.length;

  // 2. 순수 판정.
  const detected = detectIncidents({ snapshots, now: runAt, registry });
  result.evaluated = detected.evaluated;
  result.healthy = detected.healthy;
  result.incidents_total = detected.incidents.length;

  // 3. dedup — 이미 알린(TTL 내) incident_key 제외.
  const state = await loadState(statePath);
  const nowMs = Date.parse(runAt) || Date.now();
  // 만료된 alerted 정리(리마인드 허용).
  for (const [key, at] of Object.entries(state.alerted)) {
    const atMs = Date.parse(at);
    if (Number.isFinite(atMs) && nowMs - atMs > ALERTED_TTL_MS) delete state.alerted[key];
  }
  const fresh = detected.incidents.filter((inc) => !state.alerted[inc.incident_key]);
  result.new_incidents = fresh.length;

  // 4. 새 incident만 영속화 + 알림.
  const tg = deps.telegram ?? createTelegramClient();
  const persist = deps.persistIncident;
  const founderUIBase = deps.founderUIBaseUrl ?? process.env.FOUNDER_UI_BASE_URL ?? 'http://localhost:3002';

  for (const inc of fresh) {
    const incidentType: 'failed' | 'stalled' | 'error' =
      inc.kind === 'failed' ? 'failed' : inc.kind === 'stall' ? 'stalled' : 'error';
    // 룰 기반 기본 진단(Claude 미주입/실패 시 폴백).
    let diagnosis =
      `${inc.target_label}이(가) ${KIND_LABEL[inc.kind]} 상태로 진행이 멈췄습니다. ` +
      `감지 근거: ${inc.heartbeat_evidence}.` +
      (inc.error_excerpt ? ` 오류: ${inc.error_excerpt}` : '');
    let proposedFix =
      `CTO가 ${inc.repo_path}에서 원인을 분석해 ${inc.target_label}이(가) 다시 진행되도록 수정합니다. ` +
      `승인 시 오류 전후 사정을 전달받아 코딩하고, 호랑이가 테스트로 검증합니다.`;
    // 호랑이(Claude) 정밀 진단 — 주입 시 룰 기본값을 대체. 실패해도 never-throw.
    if (deps.runClaude) {
      try {
        const dInc = {
          target_label: inc.target_label,
          incident_type: incidentType,
          error_summary: inc.error_excerpt,
          heartbeat_evidence: inc.heartbeat_evidence,
          target_repo: inc.repo_path,
        };
        const cwd = deps.cwd ?? process.env.PULK_ROOT ?? process.cwd();
        const res = await deps.runClaude(
          {
            cmd: 'claude',
            args: ['-p', buildIncidentDiagnosisPrompt(dInc), '--model', selectDiagnosisModel(dInc)],
            cwd,
            stdinNull: false,
          },
          DIAG_TIMEOUT_MS,
        );
        const parsed = parseIncidentDiagnosis(res.stdout ?? '');
        if (parsed) {
          diagnosis = parsed.diagnosis;
          proposedFix = parsed.proposed_fix;
        }
      } catch (err) {
        errors.push(`diagnose(${inc.incident_key}): ${(err as Error).message}`);
      }
    }
    // 영속화(tiger_incidents). 실패해도 알림은 진행.
    if (persist) {
      try {
        await persist({
          task_ref: inc.work_id,
          task_label: inc.target_label,
          incident_type: incidentType,
          error_summary: inc.error_excerpt,
          diagnosis,
          proposed_fix: proposedFix,
          target_repo: inc.repo_path,
          status: 'detected',
          attempt_count: 0,
          detected_at: inc.detected_at,
          source_ref: inc.incident_key,
        });
        result.persisted += 1;
      } catch (err) {
        errors.push(`persistIncident(${inc.incident_key}): ${(err as Error).message}`);
      }
    }

    // 텔레그램 알림(🔔 founder-ui 벨과 동일 사건). 승인 카드로 유도.
    const link = `${founderUIBase}/self-improve`;
    const tgRes = await tg.send({
      title: `🔔 호랑이 장애 감지 — ${inc.target_label} [${KIND_LABEL[inc.kind]}]`,
      body:
        `${inc.work_title ?? inc.work_id}\n` +
        `근거: ${inc.heartbeat_evidence}\n` +
        (inc.error_excerpt ? `오류: ${inc.error_excerpt}\n` : '') +
        `\n호랑이가 수정 계획을 준비했습니다. 승인하면 CTO가 고칩니다.`,
      level: inc.kind === 'failed' ? 'urgent' : 'warn',
      link,
      dedupKey: `tiger-incident:${inc.incident_key}`,
    });
    if (tgRes.ok) {
      result.notified += 1;
      state.alerted[inc.incident_key] = runAt;
    } else {
      errors.push(`telegram(${inc.incident_key}): ${tgRes.reason}`);
    }
  }

  // 5. 상태 영속화(부분이라도).
  try {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    errors.push(`state write: ${(err as Error).message}`);
  }

  return result;
}
