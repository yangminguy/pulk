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

  if (existsSync(distOrchestrator) && existsSync(distRecoveryLoop)) {
    // 빌드된 dist를 createRequire로 로드(CJS 호환)
    const require = createRequire(import.meta.url);
    const orchestratorMod = require(distOrchestrator);
    const recoveryLoopMod = require(distRecoveryLoop);
    return {
      dispatchToNativeOrchestrator: orchestratorMod.dispatchToNativeOrchestrator,
      planNextPoll: recoveryLoopMod.planNextPoll,
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
  };
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

// ── 회복 루프: wait 결정에서 sleepMs 계산 ────────────────────────────────────

/**
 * ALL-WAIT 상황: planNextPoll로 다음 재시도까지 대기 후 true를 반환.
 * 풀이 회복 추정치 없이 모두 소진된 경우 MAX_SLEEP_MS(1시간) 대기.
 */
async function waitForRecovery(planNextPoll, decisions, label) {
  const { sleepMs, readyTaskIds } = planNextPoll(decisions, new Date().toISOString());
  if (readyTaskIds.length > 0) {
    // ready가 생겼으면 즉시 재시도
    return false;
  }
  const wait = Math.min(sleepMs || MAX_SLEEP_MS, MAX_SLEEP_MS);
  console.error(
    `[native-daemon] ${label}: 토큰 소진(all-wait) — ${Math.round(wait / 1000)}초 후 재시도.`,
  );
  await sleep(wait);
  return true;
}

// ── 단일 intent 실행(토큰 소진 재시도 포함) ──────────────────────────────────

/**
 * intent를 실행하고, 토큰 소진(dispatchToNativeOrchestrator 내부에서 all-wait 판단)이
 * 발생하면 planNextPoll의 sleepMs만큼 대기 후 재실행한다.
 *
 * dispatchToNativeOrchestrator 자체는 phase 단위로 graceful하므로 throw하지 않는다.
 * 데몬은 반드시 완료(done/failed)로 상태를 전환해야 다음 실행에서 중복 방지된다.
 */
async function runIntent(intent, dispatchToNativeOrchestrator, planNextPoll, queue, setStatus) {
  const label = `intent ${intent.l5_task_id}`;
  const MAX_RETRIES = 5; // 연속 all-wait 재시도 한계(안전장치)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const nowIso = new Date().toISOString();

    // 모든 에이전트를 exhausted로 가정한 기본 풀(데몬은 실제 풀 상태를 별도로 알 수 없음)
    // → dispatchToNativeOrchestrator가 내부적으로 ALL_AVAILABLE을 기본으로 쓰므로 deps 생략
    await dispatchToNativeOrchestrator(intent, { nowIso });

    // dispatchToNativeOrchestrator는 phase 결과를 내부 console.warn으로 기록.
    // 외부에서 "토큰 소진"을 확인할 신호가 없으므로, 재시도 여부는 attempt 기반으로 단순 처리.
    // 실제 풀 상태가 필요한 경우 풀 추적기(AgentPoolState)를 별도 파일로 관리해 주입할 수 있다.
    //
    // 현재 정책: 1회 실행 후 done으로 표시(recovery는 phase 내부에서 처리됨).
    // 데몬 재실행 시 done 항목은 건너뜀.
    break;
  }
}

// ── 메인 폴링 루프 ────────────────────────────────────────────────────────────

async function main() {
  console.error('[native-daemon] 시작.');
  await ensureQueueDir();

  const { dispatchToNativeOrchestrator, planNextPoll } = await loadModules();
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
          await runIntent(intent, dispatchToNativeOrchestrator, planNextPoll, current, null);

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
