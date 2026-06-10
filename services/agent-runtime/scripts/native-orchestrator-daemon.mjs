#!/usr/bin/env node
// native-orchestrator-daemon.mjs — Native Orchestrator 상주 데몬.
//
// 동작 개요:
//   1. ~/.l5/native/queue.json을 폴링한다.
//      각 항목은 ACRIntent + 상태(status: 'pending'|'running'|'done'|'failed') 형식.
//   2. status='pending'인 intent들을 순서대로 dispatchToNativeOrchestrator로 실행한다.
//   3. 실행 중 토큰 소진(all-wait)이 감지되면 planNextPoll의 sleepMs만큼 sleep 후 재시도한다.
//   4. 큐가 비었으면 POLL_INTERVAL_MS(30초)마다 파일을 다시 확인한다.
//   5. 에러는 console.error로 기록하고 graceful exit(launchd KeepAlive가 재기동).
//
// 빌드 경로: dist/가 있으면 빌드된 JS를 import, 없으면 tsx로 TS를 직접 로드.
// 실행법:
//   node services/agent-runtime/scripts/native-orchestrator-daemon.mjs
//   또는 tsx services/agent-runtime/scripts/native-orchestrator-daemon.mjs
//
// 큐 파일 형식(~/.l5/native/queue.json):
//   [
//     {
//       "l5_task_id": "task-123",
//       "project_path": "/Users/wonminyang/Desktop/pulk",
//       "phases": [...],
//       "l5_approved": true,
//       "allowed_files": [],
//       "status": "pending"   // pending | running | done | failed
//     }
//   ]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// ── 경로 설정 ─────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const RUNTIME_DIST = join(__dirname, '..', 'dist');
const QUEUE_DIR = join(homedir(), '.l5', 'native');
const QUEUE_FILE = join(QUEUE_DIR, 'queue.json');
const POLL_INTERVAL_MS = 30_000; // 큐가 비었을 때 다음 폴링까지 대기
const MAX_SLEEP_MS = 60 * 60 * 1000; // recovery sleep 상한 1시간

// ── 모듈 동적 로드 ────────────────────────────────────────────────────────────

/**
 * dispatchToNativeOrchestrator와 planNextPoll을 동적으로 로드한다.
 * dist/가 있으면 빌드된 CJS를 require, 없으면 tsx가 TS를 직접 처리한다고 가정.
 */
async function loadModules() {
  const distOrchestrator = join(RUNTIME_DIST, 'orchestrator', 'native-orchestrator.js');
  const distRecoveryLoop = join(RUNTIME_DIST, 'orchestrator', 'recovery-loop.js');
  const require = createRequire(import.meta.url);

  // 순수 budget/recovery 판단은 @l5/core dist에서 로드(둘 다 CJS).
  const ctoNative = require('@l5/core/dist/functions/cto-native');

  if (existsSync(distOrchestrator) && existsSync(distRecoveryLoop)) {
    // 빌드된 dist를 createRequire로 로드(CJS 호환)
    const orchestratorMod = require(distOrchestrator);
    const recoveryLoopMod = require(distRecoveryLoop);
    return {
      dispatchToNativeOrchestrator: orchestratorMod.dispatchToNativeOrchestrator,
      planNextPoll: recoveryLoopMod.planNextPoll,
      applyPoolOutcome: ctoNative.applyPoolOutcome,
      decideRecovery: ctoNative.decideRecovery,
    };
  }

  // dist 없음 — tsx/ts-node 환경에서 직접 TS import(실행 시 tsx가 등록되어 있어야 함)
  const srcOrchestrator = join(__dirname, '..', 'src', 'orchestrator', 'native-orchestrator.ts');
  const srcRecoveryLoop = join(__dirname, '..', 'src', 'orchestrator', 'recovery-loop.ts');
  const [orchMod, rlMod] = await Promise.all([
    import(srcOrchestrator),
    import(srcRecoveryLoop),
  ]);
  return {
    dispatchToNativeOrchestrator: orchMod.dispatchToNativeOrchestrator,
    planNextPoll: rlMod.planNextPoll,
    applyPoolOutcome: ctoNative.applyPoolOutcome,
    decideRecovery: ctoNative.decideRecovery,
  };
}

// ── native_phase_runs 영속화 싱크(NocoBase REST) ─────────────────────────────

/** 사업별 모니터용 phase 실행 내역을 NocoBase native_phase_runs에 기록한다.
 *  표준 REST :create/:update 사용. 인증/URL은 hermes와 동일 규약(NOCOBASE_URL/NOCOBASE_TOKEN).
 *  모든 호출 graceful — 실패해도 실행 흐름을 막지 않는다(console.error 후 무시). */
function makeNocoSink() {
  const base = process.env.NOCOBASE_URL ?? 'http://localhost:13000';
  const token = process.env.NOCOBASE_TOKEN ?? '';
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return {
    async start(rec) {
      try {
        const res = await fetch(`${base}/api/native_phase_runs:create`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...rec }),
        });
        const json = await res.json();
        const id = json?.data?.id ?? json?.id;
        return id !== undefined && id !== null ? String(id) : undefined;
      } catch (err) {
        console.error('[native-daemon] sink.start 실패(무시):', err?.message ?? err);
        return undefined;
      }
    },
    async finish(id, patch) {
      if (id === undefined) return;
      try {
        await fetch(`${base}/api/native_phase_runs:update?filterByTk=${encodeURIComponent(id)}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...patch }),
        });
      } catch (err) {
        console.error('[native-daemon] sink.finish 실패(무시):', err?.message ?? err);
      }
    },
  };
}

// ── pool 상태 파일(~/.l5/native/pools.json) ──────────────────────────────────

const POOLS_FILE = join(QUEUE_DIR, 'pools.json');
const ALL_AVAILABLE_POOLS = [
  { agent: 'claude-code', quotaStatus: 'available' },
  { agent: 'codex', quotaStatus: 'available' },
  { agent: 'antigravity', quotaStatus: 'available' },
];

async function readPools() {
  try {
    const raw = await readFile(POOLS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : ALL_AVAILABLE_POOLS;
  } catch {
    return ALL_AVAILABLE_POOLS;
  }
}

async function writePools(pools) {
  try {
    await writeFile(POOLS_FILE, JSON.stringify(pools, null, 2), 'utf8');
  } catch (err) {
    console.error('[native-daemon] pools.json 쓰기 실패(무시):', err?.message ?? err);
  }
}

// ── 큐 파일 읽기/쓰기 ─────────────────────────────────────────────────────────

async function ensureQueueDir() {
  await mkdir(QUEUE_DIR, { recursive: true });
}

async function readQueue() {
  try {
    const raw = await readFile(QUEUE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    // 파일 없음 또는 파싱 오류 → 빈 큐
    return [];
  }
}

async function writeQueue(queue) {
  await writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
}

// ── sleep 유틸 ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 단일 intent 실행(budget 루프) ────────────────────────────────────────────

/**
 * intent를 실행하는 budget 루프.
 *  1. pools.json을 읽어 dispatchToNativeOrchestrator(intent, {pools, nowIso, persist}) 실행.
 *  2. 반환 NativeRunSummary의 exhaustedAgents를 applyPoolOutcome으로 pools에 반영(저장).
 *  3. summary.waited(=풀 소진으로 보류된 phase 있음)면 decideRecovery+planNextPoll로
 *     sleepMs 대기 후 재실행. 아니면 종료.
 * dispatchToNativeOrchestrator는 phase 단위 graceful(throw 금지)이라 안전하다.
 */
async function runIntent(intent, mods) {
  const { dispatchToNativeOrchestrator, planNextPoll, applyPoolOutcome, decideRecovery } = mods;
  const label = `intent ${intent.l5_task_id}`;
  const MAX_RETRIES = 5; // 연속 all-wait 재시도 한계(안전장치)
  const persist = makeNocoSink();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const nowIso = new Date().toISOString();
    let pools = await readPools();

    const summary = await dispatchToNativeOrchestrator(intent, { pools, nowIso, persist });

    // 소진 신호가 잡힌 에이전트는 exhausted로, 그 외 정상 실행자는 available로 갱신.
    const exhausted = new Set(summary?.exhaustedAgents ?? []);
    for (const agent of ['claude-code', 'codex', 'antigravity']) {
      pools = applyPoolOutcome(pools, agent, exhausted.has(agent) ? 'exhausted' : 'ok', nowIso);
    }
    await writePools(pools);

    if (!summary?.waited) {
      console.error(`[native-daemon] ${label}: 완주(merged ${summary?.mergedPhases ?? 0}).`);
      return;
    }

    // 풀 소진으로 보류된 phase가 있다 — 회복 추정 시각까지 대기 후 재시도.
    const decisions = [...exhausted].map((agent) =>
      decideRecovery({
        task: { id: `${intent.l5_task_id}:retry`, taskKind: 'implementation', primaryAgent: agent, reason: 'budget exhausted' },
        pools,
        nowIso,
      }),
    );
    const { sleepMs } = planNextPoll(decisions, nowIso);
    const wait = Math.min(sleepMs || POLL_INTERVAL_MS, MAX_SLEEP_MS);
    console.error(
      `[native-daemon] ${label}: 풀 소진 보류 — ${Math.round(wait / 1000)}초 후 재시도(attempt ${attempt + 1}/${MAX_RETRIES}).`,
    );
    await sleep(wait);
  }
  console.error(`[native-daemon] ${label}: 재시도 한계 도달 — 보류 종료.`);
}

// ── 메인 폴링 루프 ────────────────────────────────────────────────────────────

async function main() {
  console.error('[native-daemon] 시작.');
  await ensureQueueDir();

  const mods = await loadModules();
  console.error('[native-daemon] 모듈 로드 완료. 큐 폴링 시작.');

  // SIGTERM/SIGINT — graceful exit(launchd KeepAlive가 재기동)
  let stopping = false;
  process.on('SIGTERM', () => {
    console.error('[native-daemon] SIGTERM 수신 — 종료.');
    stopping = true;
  });
  process.on('SIGINT', () => {
    console.error('[native-daemon] SIGINT 수신 — 종료.');
    stopping = true;
  });

  while (!stopping) {
    try {
      const queue = await readQueue();
      const pending = queue.filter((item) => item.status === 'pending');

      if (pending.length === 0) {
        // 큐 비어있음 — 폴링 간격 대기
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      console.error(`[native-daemon] pending ${pending.length}건 처리 시작.`);

      for (const intent of pending) {
        if (stopping) break;

        // 상태를 running으로 업데이트
        const current = await readQueue();
        const idx = current.findIndex((i) => i.l5_task_id === intent.l5_task_id);
        if (idx !== -1) {
          current[idx].status = 'running';
          await writeQueue(current);
        }

        const label = `intent ${intent.l5_task_id}`;
        console.error(`[native-daemon] ${label}: 실행 시작.`);

        try {
          await runIntent(intent, mods);

          // 완료 — done으로 전환
          const after = await readQueue();
          const doneIdx = after.findIndex((i) => i.l5_task_id === intent.l5_task_id);
          if (doneIdx !== -1) {
            after[doneIdx].status = 'done';
            after[doneIdx].completedAt = new Date().toISOString();
            await writeQueue(after);
          }
          console.error(`[native-daemon] ${label}: 완료.`);
        } catch (err) {
          // dispatchToNativeOrchestrator는 throw하지 않지만 혹시 모를 예외 처리
          console.error(`[native-daemon] ${label}: 예외 — failed로 표시:`, err);
          const after = await readQueue();
          const failIdx = after.findIndex((i) => i.l5_task_id === intent.l5_task_id);
          if (failIdx !== -1) {
            after[failIdx].status = 'failed';
            after[failIdx].failedAt = new Date().toISOString();
            after[failIdx].error = String(err);
            await writeQueue(after);
          }
        }
      }
    } catch (err) {
      // 큐 읽기/쓰기 오류 등 — 기록 후 graceful exit(launchd가 재기동)
      console.error('[native-daemon] 치명적 오류 — 종료:', err);
      process.exit(1);
    }
  }

  console.error('[native-daemon] 정상 종료.');
  process.exit(0);
}

main();
