// 호랑이(Tiger) 수집기 — 오케스트레이션 (hermes task).
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (§4.4).
//
// cmo-strategy-watch와 동형: deps 주입 + 경로 env override + never-throw + 상태파일 + 알림 1건.
// 흐름:
//   1. 레지스트리 순회 → 도구 로그 collect (graceful, errors 누적)
//   2. 수동 제보 jsonl 읽기
//   3. fetchAgentTasks() 1회
//   4. collectBottlenecks(...)  ← l5-core 순수함수
//   5. tiger-candidates.json + since 스냅샷 영속화
//   6. 텔레그램 요약 1건(D1)
//   7. (다음 단계) night-bpr-loop가 tiger-candidates.json을 읽어 카드 작성
//
// 위험도 D1: 읽기 + 상태파일 쓰기 + 알림 1건. 코드 변경 없음.

import { promises as fs } from 'fs';
import { join } from 'path';
import {
  collectBottlenecks,
  type AgentTask,
  type CollectBottlenecksResult,
  type RawSignal,
} from '@l5/core';
import { collectToolLogs, type LogCollectCtx, type LogCollectOutput } from './log-adapter.js';
import { readManualReports } from './manual-reports.js';
import { createTelegramClient } from '../notifier/telegram.js';
import type { TelegramClient } from '../notifier/telegram.js';

export interface TigerCollectorDeps {
  /** pulk DB의 agent_tasks 전체(1회 fetch). 기존 fetchAgentTasks 주입. */
  fetchAgentTasks: () => Promise<AgentTask[]>;
  /** Telegram client(기본 env-configured). */
  telegram?: TelegramClient;
  /** state dir override(tests). 기본 HERMES_DIR/.omc/state. */
  stateDir?: string;
  /** pulk 레포 루트. 기본 PULK_ROOT env 또는 cwd의 두 단계 위. */
  pulkRoot?: string;
  /** 결정론용 현재시각(tests). 기본 now. */
  now?: string;
  /** 도구 로그 수집기 override(tests에서 실제 파일시스템 격리용). 기본 collectToolLogs. */
  collectLogs?: (ctx: LogCollectCtx) => Promise<LogCollectOutput>;
}

export interface TigerCollectorResult {
  run_at: string;
  total_signals: number;
  candidate_count: number;
  tools_scanned: number;
  notification_sent: boolean;
  errors: string[];
}

interface Snapshot {
  last_run_at?: string;
}

function resolvePulkRoot(deps: TigerCollectorDeps): string {
  if (deps.pulkRoot) return deps.pulkRoot;
  if (process.env.PULK_ROOT) return process.env.PULK_ROOT;
  // hermes는 보통 services/hermes-runtime에서 돈다 → 두 단계 위가 pulk 루트.
  return join(process.cwd(), '..', '..');
}

async function loadSnapshot(snapshotPath: string): Promise<Snapshot> {
  try {
    const raw = await fs.readFile(snapshotPath, 'utf-8');
    const parsed = JSON.parse(raw) as Snapshot;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 호랑이 수집기 본체. 어떤 단계가 실패해도 throw하지 않고 errors에 누적,
 * 부분 결과라도 영속화한다(무인 자율).
 */
export async function runTigerCollector(
  deps: TigerCollectorDeps,
): Promise<TigerCollectorResult> {
  const runAt = deps.now ?? new Date().toISOString();
  const date = runAt.slice(0, 10);
  const errors: string[] = [];

  const hermesDir = process.env.HERMES_DIR ?? process.cwd();
  const stateDir = deps.stateDir ?? join(hermesDir, '.omc', 'state');
  const snapshotPath = join(stateDir, 'tiger-collector-snapshot.json');
  const candidatesPath = join(stateDir, 'tiger-candidates.json');
  const pulkRoot = resolvePulkRoot(deps);

  const base: TigerCollectorResult = {
    run_at: runAt,
    total_signals: 0,
    candidate_count: 0,
    tools_scanned: 0,
    notification_sent: false,
    errors,
  };

  // since 윈도우: 마지막 수집 이후. 첫 실행이면 24h 전.
  const snapshot = await loadSnapshot(snapshotPath);
  const lastRunMs = snapshot.last_run_at ? Date.parse(snapshot.last_run_at) : NaN;
  const sinceMs = Number.isFinite(lastRunMs)
    ? lastRunMs
    : Date.parse(runAt) - 24 * 60 * 60 * 1000;

  // 1. 도구 로그 수집(graceful).
  let logSignals: RawSignal[] = [];
  try {
    const collect = deps.collectLogs ?? collectToolLogs;
    const out = await collect({ sinceMs, pulkRoot });
    logSignals = out.signals;
    base.tools_scanned = out.toolsScanned;
    errors.push(...out.errors);
  } catch (err) {
    errors.push(`collectToolLogs failed: ${(err as Error).message}`);
  }

  // 2. 수동 제보.
  let manualSignals: RawSignal[] = [];
  try {
    manualSignals = await readManualReports({ stateDir, sinceMs });
  } catch (err) {
    errors.push(`readManualReports failed: ${(err as Error).message}`);
  }

  // 3. agent_tasks 1회.
  let agentTasks: AgentTask[] = [];
  try {
    agentTasks = await deps.fetchAgentTasks();
  } catch (err) {
    errors.push(`fetchAgentTasks failed: ${(err as Error).message}`);
  }

  // 4. 순수함수 호출.
  let result: CollectBottlenecksResult;
  try {
    result = collectBottlenecks({
      signals: [...logSignals, ...manualSignals],
      agentTasks,
      now: runAt,
    });
  } catch (err) {
    // collectBottlenecks는 never-throw지만 방어적으로.
    errors.push(`collectBottlenecks failed: ${(err as Error).message}`);
    result = {
      collected_at: runAt,
      total_signals: 0,
      candidates: [],
      by_executive: {},
      dropped_pii: 0,
    };
  }

  base.total_signals = result.total_signals;
  base.candidate_count = result.candidates.length;

  // 5. 영속화(부분 결과라도 저장). 다음 단계 night-bpr-loop의 입력.
  try {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(candidatesPath, JSON.stringify(result, null, 2), 'utf-8');
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({ last_run_at: runAt }, null, 2),
      'utf-8',
    );
  } catch (err) {
    errors.push(`state write failed: ${(err as Error).message}`);
  }

  // 6. 텔레그램 요약 1건(후보가 있을 때만). dedupKey로 하루 1건.
  if (result.candidates.length > 0) {
    const byExec = Object.entries(result.by_executive)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
    const top = result.candidates[0];
    const tg = deps.telegram ?? createTelegramClient();
    const tgRes = await tg.send({
      title: `🐯 호랑이 수집: 병목 후보 ${result.candidates.length}건`,
      body:
        `임원별: ${byExec || '-'}\n` +
        `최우선: [${top.executive}/${top.tool_id}] ${top.title} ` +
        `(${top.occurrences}회, score ${top.priority_score})\n` +
        (result.dropped_pii > 0 ? `PII 마스킹 ${result.dropped_pii}건. ` : '') +
        `\n새벽 분석(night-bpr-loop)이 개선 카드를 준비합니다.`,
      level: 'info',
      dedupKey: `tiger-collector:${date}`,
    });
    base.notification_sent = tgRes.ok;
    if (!tgRes.ok) errors.push(`telegram: ${tgRes.reason}`);
  } else {
    console.log(`[tiger-collector] ${date}: 병목 후보 0건 — 조용히 종료.`);
  }

  return base;
}
