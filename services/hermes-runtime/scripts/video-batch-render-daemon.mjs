#!/usr/bin/env node
// video-batch-render daemon — 승인 완료분(상태=rendering) 영상 일괄 렌더 폴러.
//
// 동작: 주기적으로 runVideoBatchRenderLive()를 호출. 렌더 대상이 없으면 조용히
// 넘어가고(status=skipped, 알림 없음), 있으면 순차 렌더 후 텔레그램 요약 1건.
// 반복 사이 겹침 없음(await) — 잡 단위 동시 렌더 금지 정책과 일치.
//
// 실행:
//   node services/hermes-runtime/scripts/video-batch-render-daemon.mjs          # 데몬(기본 5분 주기)
//   node services/hermes-runtime/scripts/video-batch-render-daemon.mjs --once   # 1회 실행
//
// 필요 ENV: NOCOBASE_URL, NOCOBASE_TOKEN, VIDEO_FACTORY_DIR(기본 ~/ai-slide-video-factory),
//           TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, VIDEO_BATCH_RENDER_INTERVAL_MS(기본 300000).
//
// 사전 조건: hermes-runtime이 빌드되어 있어야 한다 — `pnpm --filter @l5/hermes-runtime build`.

import { runVideoBatchRenderLive } from "../dist/runner.js";

const ONCE = process.argv.includes("--once");
const INTERVAL_MS = Number(process.env.VIDEO_BATCH_RENDER_INTERVAL_MS ?? 5 * 60 * 1000);

const ts = () => new Date().toISOString();

async function tick() {
  try {
    const res = await runVideoBatchRenderLive();
    if (res.status === "skipped") {
      console.log(`[${ts()}] 렌더 대상 없음 (skipped=${res.plan.skipped.length})`);
    } else {
      const ok = res.results.filter((r) => r.status === "completed").length;
      const failed = res.results.length - ok;
      console.log(
        `[${ts()}] 일괄 렌더 완료: 성공 ${ok} · 실패 ${failed} · 알림 ${res.notified ? "발송" : "미발송"}`,
      );
      for (const r of res.results) {
        console.log(`  - [${r.status}] ${r.project_title} (${r.factory_slug})${r.error ? ` :: ${r.error}` : ""}`);
      }
    }
  } catch (err) {
    console.error(`[${ts()}] video-batch-render 오류:`, err?.message ?? err);
  }
}

if (ONCE) {
  await tick();
} else {
  console.log(`[${ts()}] video-batch-render daemon 시작 (interval=${INTERVAL_MS}ms)`);
  // 겹침 없는 단순 루프: 한 사이클(렌더 포함, 수십 분 가능)이 끝나야 다음 대기 시작.
  for (;;) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}
