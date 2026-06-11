// Hermes Gateway CLI — runs a single Hermes task by name.
// Usage: node dist/gateway.js <task-name>
//
// Supported tasks:
//   repetition-analyzer   — detect repeated work patterns (every 2h)
//   approval-checker      — daily approval queue brief (09:00)
//   daily-brief           — end-of-day status brief (18:00)
//   cto-weekly-review     — BPR phase transition check (Monday 10:00)
//   model-verify          — model roster deprecation check (08:55)
//   self-learning         — changelog diff + catalog update (09:00)
//   cmo-strategy-watch    — biz Second Brain PT-change watcher (09:05)

import {
  runRepetitionAnalyzerLive,
  runApprovalCheckerLive,
  runDailyBriefGeneratorLive,
  runCTOPhaseReviewLive,
  runTaskDispatcherLive,
  runCTOVerificationLoopLive,
  runModelVerifyLive,
  runSelfLearningLive,
  runCmoStrategyWatchLive,
  runTaskArchiverLive,
  runTigerDispatchLive,
} from "./runner.js";
import { runNightBPRLoop } from "./loops/night-bpr-loop.js";

const TASK_RUNNERS: Record<string, () => Promise<unknown>> = {
  "repetition-analyzer": runRepetitionAnalyzerLive,
  "approval-checker": runApprovalCheckerLive,
  "daily-brief": runDailyBriefGeneratorLive,
  "cto-weekly-review": runCTOPhaseReviewLive,
  "task-dispatcher": runTaskDispatcherLive,
  "cto-verification-loop": runCTOVerificationLoopLive,
  "model-verify": runModelVerifyLive,
  "self-learning": runSelfLearningLive,
  "cmo-strategy-watch": runCmoStrategyWatchLive,
  "task-archiver": runTaskArchiverLive,
  // 호랑이 야간 분석(수집분 → 개선 카드 발행, 코드 변경 없음 — 승인 게이트 이전).
  "night-bpr-loop": () => runNightBPRLoop({}),
  // 호랑이 디스패치(일괄 승인분 → repo별 병렬 실행 + 학습축적). 승인분만 처리.
  "tiger-dispatch": runTigerDispatchLive,
};


async function main() {
  const taskName = process.argv[2];

  if (!taskName) {
    console.error("[Hermes] Usage: node gateway.js <task-name>");
    console.error("[Hermes] Available tasks:", Object.keys(TASK_RUNNERS).join(", "));
    process.exit(1);
  }

  const runner = TASK_RUNNERS[taskName];
  if (!runner) {
    console.error(`[Hermes] Unknown task: ${taskName}`);
    console.error("[Hermes] Available tasks:", Object.keys(TASK_RUNNERS).join(", "));
    process.exit(1);
  }

  const start = Date.now();
  console.log(`[Hermes] Starting task: ${taskName} at ${new Date().toISOString()}`);

  try {
    const result = await runner();
    const elapsed = Date.now() - start;
    console.log(`[Hermes] Task ${taskName} completed in ${elapsed}ms:`, JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`[Hermes] Task ${taskName} failed after ${elapsed}ms:`, (err as Error).message);
    process.exit(1);
  }
}

main();
