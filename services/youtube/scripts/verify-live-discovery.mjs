#!/usr/bin/env node
// Live verification for M1~M3 통합 발굴 파이프라인 (CDP 없이 부분 파이프라인).
// 흐름: searchVideos → getVideoStats + 5만+ 필터 → Sonnet 분류 → 후보 산출.
// build first: (cd packages/l5-core && npx tsc) && (cd services/youtube && npx tsc)
// Usage: node services/youtube/scripts/verify-live-discovery.mjs

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// @l5/youtube (ESM)
const { loadCredentials, YouTubeClient, createLiveDiscoveryDeps } = await import(
  path.resolve(__dirname, '../dist/index.js')
);
// l5-core video-room (CommonJS)
const vr = require(
  path.resolve(__dirname, '../../../packages/l5-core/dist/functions/video-room/index.js'),
);
const { runDiscoveryPipeline, classifyDiscoveredVideos, buildSelectionReason } = vr;
const { createClaudeCLIClient } = require(
  path.resolve(__dirname, '../../../packages/l5-core/dist/llm/claude-cli-client.js'),
);

const creds = loadCredentials();
const client = new YouTubeClient(creds);

const product = {
  product_name: '릴스 자동 편집 SaaS',
  category: '영상 편집 도구',
  target_audience: '인스타 릴스를 직접 만드는 1인 사업자/크리에이터',
  core_offer: '클릭 몇 번으로 릴스 편집 자동화',
  business_goal: 'brand_growth',
};
const target = product.target_audience;
const query = '인스타그램 릴스 만드는 방법';

const sonnet = createClaudeCLIClient({ model: 'sonnet' });
const classify = (videos, mode) =>
  classifyDiscoveredVideos({ product, target, videos, mode }, { llm: sonnet });

const deps = createLiveDiscoveryDeps({ client, searchMaxResults: 15, classify });

console.log(`[run] mode=key query="${query}" (CDP 미주입 → stats+Sonnet 부분 파이프라인)`);
const result = await runDiscoveryPipeline({ query, product, target, mode: 'key' }, deps);

console.log('[provenance]', JSON.stringify(result.provenance));
console.log(`[videos] 분류 통과 ${result.videos.length}건`);
console.log(`[candidates] fit+성과좋음 ${result.candidates.length}건`);
for (const c of result.candidates.slice(0, 5)) {
  console.log(`  ${c.videoId} | views=${c.viewCount.toLocaleString()} | verdict=${c.classification?.verdict}`);
  console.log(`    선정이유: ${buildSelectionReason(c)}`);
}

if (!result.provenance.searched) throw new Error('search 단계 실패');
if (!result.provenance.stats) throw new Error('stats 단계 실패');
if (result.videos.length === 0) throw new Error('분류 통과 영상 0건 — Sonnet 분류 실패 의심');
console.log('[OK] 부분 파이프라인 실행 성공 (search+stats 실데이터 + Sonnet 분류)');
