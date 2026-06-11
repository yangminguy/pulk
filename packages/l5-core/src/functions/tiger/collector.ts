// 호랑이(Tiger) 자가개선 루프 — cross-repo 병목 수집기 (순수 도메인 로직).
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (§2 데이터흐름, §3 순수함수).
//
// 책임: 원시 신호(도구 로그 / agent_tasks / native_phase_runs / 수동제보)를
//   임원·도구·repo별 BottleneckCandidate[]로 정규화·dedup·집계·우선순위까지만.
//   판단(근본원인/해결안 작성)은 다음 단계(night-bpr-loop, Claude 두뇌)의 몫.
//
// 설계 원칙(CLAUDE.md): NocoBase/fs/fetch 비의존, 입력=배열·출력=배열, never-throw,
//   모든 집계/스코어 룰은 단위테스트. I/O는 hermes 어댑터(./adapters 경계).

import type { PIILevel } from '../../types/entities';
import type { AgentTask } from '../../types/orchestration';

/**
 * 호랑이 신호의 임원 role. 레지스트리 owner(AgentRole)의 부분집합 — 도구를 소유하는 7개
 * 핵심 임원. ceo-orchestration의 ExecutiveRole(CEO 제외·RiskQA 포함, 태스크 배정용)과는
 * 의미가 달라 이름을 분리한다(export 충돌·혼동 방지).
 */
export type TigerExecutiveRole = 'CEO' | 'CMO' | 'CTO' | 'CFO' | 'CRO' | 'CPO' | 'COO';

/**
 * 도구별 어댑터가 로그/실행기록을 정규화해 내보내는 단일 원시 신호.
 * 로그 경로/포맷이 제각각인 문제를 "어댑터가 RawSignal로 변환"하는 것으로 흡수한다.
 */
export interface RawSignal {
  source: 'tool_log' | 'agent_task' | 'native_phase_run' | 'manual_report';
  /** ImprovementTargetEntry.id (레지스트리). */
  tool_id: string;
  executive: TigerExecutiveRole;
  /** 절대경로 또는 'pulk' (project_path 매핑 키). */
  repo: string;
  kind: 'error' | 'bottleneck' | 'retry' | 'stall' | 'manual';
  /** 사람이 읽는 한 줄 요약. */
  message: string;
  /** 스택트레이스/추가맥락. PII 분리를 위해 raw 컨텍스트는 여기에만. */
  detail?: string;
  /** ISO. */
  occurred_at: string;
  /** 어댑터가 줄 수 있으면; 없으면 함수가 계산. */
  fingerprint?: string;
  /** 기본 'none'. high면 detail 마스킹 후 다음단계 전달. */
  pii_level?: PIILevel;
  /** 원본 위치(로그라인/task id/제보 id). */
  ref?: string;
  /**
   * 구조화 메트릭(어댑터가 줄 수 있으면). phase 실행기/도구 로그가 kind를 달고 와도
   * 실제 내용이 정상(경고 없음 + 실패 0)일 수 있다. 이 값으로 정상 신호를 가려낸다.
   * 없으면(undefined) 기존 동작과 동일(텍스트 신호로 취급).
   */
  metrics?: {
    /** 경고 목록. 빈 배열이면 경고 없음. */
    warnings?: unknown[];
    /** 실패 건수. 0이면 실패 없음. */
    fail_count?: number;
  };
}

export interface CollectBottlenecksInput {
  /** 모든 어댑터 출력 합본(tool_log / native_phase_run / manual_report 등). */
  signals: RawSignal[];
  /** 기존 fetchAgentTasks() 결과. 함수 내부에서 RawSignal로 변환. */
  agentTasks: AgentTask[];
  /** 결정론용 현재시각 ISO. */
  now: string;
  /** 미완료 task가 이 시간 이상 정체하면 stall. 기본 24h. */
  overdueThresholdMs?: number;
  /** 후보로 승격할 최소 발생 수. 기본 1. */
  minOccurrences?: number;
}

export interface BottleneckCandidate {
  /** dedup 키 (tool_id + normalized message). */
  fingerprint: string;
  executive: TigerExecutiveRole;
  tool_id: string;
  repo: string;
  kind: RawSignal['kind'];
  /** 대표 메시지. */
  title: string;
  /** 묶인 신호 수. */
  occurrences: number;
  first_seen: string;
  last_seen: string;
  sources: Array<{ source: RawSignal['source']; ref?: string }>;
  /** PII 마스킹된 대표 detail (호랑이 분석 입력). */
  sample_detail?: string;
  max_pii_level: PIILevel;
  /** 0~100, 결정론적. */
  priority_score: number;
  related_task_ids: string[];
  related_business_ids: string[];
}

export interface CollectBottlenecksResult {
  collected_at: string;
  total_signals: number;
  /** priority_score desc 정렬. */
  candidates: BottleneckCandidate[];
  by_executive: Record<string, number>;
  /** pii_level=high로 detail 마스킹된 신호 수(관측용). */
  dropped_pii: number;
}

const DEFAULT_OVERDUE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const PII_RANK: Record<PIILevel, number> = { none: 0, low: 1, medium: 2, high: 3 };

// kind별 우선순위 가중(베이스 점수). error/stall이 가장 시급.
const KIND_WEIGHT: Record<RawSignal['kind'], number> = {
  error: 45,
  stall: 40,
  retry: 28,
  bottleneck: 22,
  manual: 30, // 사장님 제보는 노이즈 아님 → 중간 이상 보장(+ §3.3-6 가산).
};

/** AgentTask.assigned_agent → TigerExecutiveRole. 핵심 임원 외 role은 신호에서 제외(undefined). */
function roleToExecutive(role: AgentTask['assigned_agent']): TigerExecutiveRole | undefined {
  switch (role) {
    case 'CEO':
    case 'CMO':
    case 'CTO':
    case 'CFO':
    case 'CRO':
    case 'CPO':
    case 'COO':
      return role;
    default:
      return undefined; // ChiefOfStaff / RiskQA / Culture 등은 도구 owner가 아님.
  }
}

/**
 * 메시지 정규화: 소문자화 + 변수부(숫자/UUID/경로/타임스탬프/16진수)를 플레이스홀더로
 * 치환해 같은 근본원인 신호가 한 fingerprint로 묶이게 한다.
 */
export function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g,
      '<uuid>',
    )
    .replace(/\d{4}-\d{2}-\d{2}t[\d:.]+z?/g, '<ts>') // ISO 타임스탬프
    .replace(/(?:\/[\w.\-]+)+\/?/g, '<path>') // unix 경로
    .replace(/\b0x[0-9a-f]+\b/g, '<hex>')
    .replace(/\b\d+\b/g, '<n>') // 잔여 숫자
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 정상 신호 판별(오탐 방지). phase 실행기/도구 로그가 kind를 달고 와도 구조화 메트릭이
 * "경고 없음 + 실패 0"이면 병목이 아니라 정상이다 → 후보에서 제외한다.
 *
 * 규칙(보수적): metrics가 없으면 false(기존 텍스트 신호로 취급, 동작 불변).
 *   metrics가 있고, 경고가 없거나 빈 배열이며, 실패 건수가 없거나 0일 때만 정상으로 본다.
 *   (warnings/fail_count가 둘 다 미제공이면 판단 근거가 없으므로 정상으로 보지 않는다.)
 */
export function isHealthySignal(signal: RawSignal): boolean {
  const m = signal.metrics;
  if (!m) return false;

  const { warnings, fail_count } = m;
  // 메트릭 객체는 있으나 두 지표 모두 미제공 → 판단 보류(정상 단정 금지).
  if (warnings === undefined && fail_count === undefined) return false;

  const noWarnings =
    warnings === undefined || (Array.isArray(warnings) && warnings.length === 0);
  const noFailures = fail_count === undefined || fail_count === 0;

  return noWarnings && noFailures;
}

function fingerprintOf(signal: RawSignal): string {
  if (signal.fingerprint && signal.fingerprint.trim()) return signal.fingerprint.trim();
  return `${signal.tool_id}|${normalizeMessage(signal.message)}`;
}

// 간단한 detail PII 마스킹(email/phone). high 레벨이면 호출측이 dropped_pii로 카운트.
function maskDetail(detail: string): string {
  return detail
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/(\+?[\d\s\-().]{7,})/g, (m) =>
      m.replace(/\D/g, '').length >= 7 ? '[phone]' : m,
    );
}

/** AgentTask → RawSignal[] 변환(정규화 룰 §3.3-1). done/killed 제외. */
function agentTasksToSignals(
  tasks: AgentTask[],
  now: string,
  thresholdMs: number,
): RawSignal[] {
  const nowMs = Date.parse(now);
  const out: RawSignal[] = [];

  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'killed') continue;
    const exec = roleToExecutive(t.assigned_agent);
    if (!exec) continue;

    const lastActivityMs = Date.parse(t.updated_at);
    const overdue =
      Number.isFinite(lastActivityMs) &&
      Number.isFinite(nowMs) &&
      nowMs - lastActivityMs > thresholdMs;

    let kind: RawSignal['kind'] | undefined;
    let message: string;

    if (t.status === 'blocked') {
      kind = 'stall';
      message = t.blocker?.trim() || t.title;
    } else if (overdue) {
      kind = 'stall';
      message = `overdue: ${t.title}`;
    } else if (t.status === 'needs_review') {
      // 재검토 대기 = 재시도 흔적.
      kind = 'retry';
      message = t.title;
    } else {
      continue; // queued/running 정상 진행은 신호 아님.
    }

    out.push({
      source: 'agent_task',
      tool_id: `task:${t.assigned_agent}`,
      executive: exec,
      repo: 'pulk',
      kind,
      message,
      detail: t.rationale,
      occurred_at: t.updated_at,
      ref: t.id,
      pii_level: 'none',
    });
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * priority_score (결정론, 0~100). §3.3-4:
 *   kind 가중 + occurrences 로그스케일 + recency(now에 가까울수록↑) + high-PII 미세 감점.
 */
function priorityScore(
  c: {
    kind: RawSignal['kind'];
    occurrences: number;
    last_seen: string;
    max_pii_level: PIILevel;
    hasManual: boolean;
  },
  now: string,
  thresholdMs: number,
): number {
  let score = KIND_WEIGHT[c.kind];

  // occurrences 로그스케일: 1건=0, 그 이상 점증(최대 +20).
  score += clamp(Math.log2(c.occurrences) * 7, 0, 20);

  // recency: 임계시간 내 최신일수록 가산(최대 +25). 오래될수록 0으로 수렴.
  const nowMs = Date.parse(now);
  const lastMs = Date.parse(c.last_seen);
  if (Number.isFinite(nowMs) && Number.isFinite(lastMs)) {
    const ageMs = Math.max(0, nowMs - lastMs);
    const recency = clamp(1 - ageMs / thresholdMs, 0, 1);
    score += recency * 25;
  }

  // 수동 제보 가산(§3.3-6): 사장님 신호는 항상 무게.
  if (c.hasManual) score += 10;

  // high-PII 미세 감점(신중): LLM 전송 신중 신호.
  if (c.max_pii_level === 'high') score -= 5;

  return Math.round(clamp(score, 0, 100));
}

/**
 * 원시 신호 → 정규화·dedup·집계·우선순위된 BottleneckCandidate[].
 * never-throw: 입력이 비거나 형식이 일부 깨져도 빈/부분 결과를 돌려준다.
 */
export function collectBottlenecks(
  input: CollectBottlenecksInput,
): CollectBottlenecksResult {
  const now = input?.now ?? new Date().toISOString();
  const thresholdMs = input?.overdueThresholdMs ?? DEFAULT_OVERDUE_THRESHOLD_MS;
  const minOccurrences = Math.max(1, input?.minOccurrences ?? 1);

  const baseResult: CollectBottlenecksResult = {
    collected_at: now,
    total_signals: 0,
    candidates: [],
    by_executive: {},
    dropped_pii: 0,
  };

  if (!input) return baseResult;

  const rawSignals = Array.isArray(input.signals) ? input.signals : [];
  const tasks = Array.isArray(input.agentTasks) ? input.agentTasks : [];

  // 1. agentTasks → RawSignal 변환 후 모든 신호 합본.
  let taskSignals: RawSignal[] = [];
  try {
    taskSignals = agentTasksToSignals(tasks, now, thresholdMs);
  } catch {
    taskSignals = [];
  }
  const allSignals = [...rawSignals, ...taskSignals];
  baseResult.total_signals = allSignals.length;

  if (allSignals.length === 0) return baseResult;

  // 2~3. fingerprint group → 집계.
  interface Group {
    fingerprint: string;
    executive: TigerExecutiveRole;
    tool_id: string;
    repo: string;
    kind: RawSignal['kind'];
    title: string;
    occurrences: number;
    first_seen: string;
    last_seen: string;
    sources: Array<{ source: RawSignal['source']; ref?: string }>;
    sample_detail?: string;
    max_pii_level: PIILevel;
    related_task_ids: Set<string>;
    related_business_ids: Set<string>;
    hasManual: boolean;
  }

  const groups = new Map<string, Group>();
  let droppedPii = 0;

  for (const s of allSignals) {
    if (!s || typeof s.message !== 'string') continue;
    // 정상 신호(빈 warnings + fail_count 0) 오탐 방지: 후보 집계에서 제외.
    if (isHealthySignal(s)) continue;
    const fp = fingerprintOf(s);
    const occurredAt = typeof s.occurred_at === 'string' ? s.occurred_at : now;
    const pii: PIILevel = s.pii_level ?? 'none';

    // PII 분리(§3.3-5): high면 detail을 마스킹해서만 싣는다.
    let detail = s.detail;
    if (detail) {
      if (pii === 'high') {
        detail = maskDetail(detail);
        droppedPii += 1;
      }
    }

    let g = groups.get(fp);
    if (!g) {
      g = {
        fingerprint: fp,
        executive: s.executive,
        tool_id: s.tool_id,
        repo: s.repo,
        kind: s.kind,
        title: s.message,
        occurrences: 0,
        first_seen: occurredAt,
        last_seen: occurredAt,
        sources: [],
        sample_detail: detail,
        max_pii_level: pii,
        related_task_ids: new Set(),
        related_business_ids: new Set(),
        hasManual: false,
      };
      groups.set(fp, g);
    }

    g.occurrences += 1;
    if (occurredAt < g.first_seen) g.first_seen = occurredAt;
    if (occurredAt > g.last_seen) g.last_seen = occurredAt;
    g.sources.push({ source: s.source, ref: s.ref });
    if (PII_RANK[pii] > PII_RANK[g.max_pii_level]) g.max_pii_level = pii;
    if (!g.sample_detail && detail) g.sample_detail = detail;
    if (s.source === 'manual_report' || s.kind === 'manual') g.hasManual = true;
    if (s.source === 'agent_task' && s.ref) g.related_task_ids.add(s.ref);
  }

  // 4. priority_score + minOccurrences 필터.
  const candidates: BottleneckCandidate[] = [];
  for (const g of groups.values()) {
    // 수동 신호는 항상 후보로 승격(§3.3-6) — minOccurrences 무시.
    if (!g.hasManual && g.occurrences < minOccurrences) continue;

    candidates.push({
      fingerprint: g.fingerprint,
      executive: g.executive,
      tool_id: g.tool_id,
      repo: g.repo,
      kind: g.kind,
      title: g.title,
      occurrences: g.occurrences,
      first_seen: g.first_seen,
      last_seen: g.last_seen,
      sources: g.sources,
      sample_detail: g.sample_detail,
      max_pii_level: g.max_pii_level,
      priority_score: priorityScore(
        {
          kind: g.kind,
          occurrences: g.occurrences,
          last_seen: g.last_seen,
          max_pii_level: g.max_pii_level,
          hasManual: g.hasManual,
        },
        now,
        thresholdMs,
      ),
      related_task_ids: [...g.related_task_ids],
      related_business_ids: [...g.related_business_ids],
    });
  }

  // priority desc, 동점은 occurrences desc, 그다음 fingerprint asc(결정론).
  candidates.sort(
    (a, b) =>
      b.priority_score - a.priority_score ||
      b.occurrences - a.occurrences ||
      a.fingerprint.localeCompare(b.fingerprint),
  );

  const byExecutive: Record<string, number> = {};
  for (const c of candidates) {
    byExecutive[c.executive] = (byExecutive[c.executive] ?? 0) + 1;
  }

  return {
    collected_at: now,
    total_signals: allSignals.length,
    candidates,
    by_executive: byExecutive,
    dropped_pii: droppedPii,
  };
}
