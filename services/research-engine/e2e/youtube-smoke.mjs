// Live YouTube smoke — one real search + one real transcript through the adapter.
//   node e2e/youtube-smoke.mjs "<optional query>"
// Requires: YOUTUBE_API_KEY or services/youtube/.credentials.json, yt-dlp installed.

import { requireBuilt, requireYouTubeKey, SERVICE_ROOT, REPO_ROOT } from './_guard.mjs';
import { join } from 'node:path';

requireBuilt();
requireYouTubeKey();

const { YouTubeCliAdapter } = await import('../dist/adapters/youtube-cli.js');

const query = process.argv[2] ?? '콘텐츠 마케팅 전략';
const yt = new YouTubeCliAdapter({
  vendorPath: join(SERVICE_ROOT, 'vendor', 'youtube-research', 'youtube.mjs'),
  cwd: REPO_ROOT,
});

console.log(`[e2e] search: "${query}"`);
const hits = await yt.search({ q: query, market: 'KR', lang: 'ko', max: 5, order: 'relevance' });
console.log(`[e2e] got ${hits.length} hits`);
if (hits.length === 0) {
  console.error('[e2e] no hits — cannot continue');
  process.exit(1);
}
for (const h of hits.slice(0, 5)) console.log(`  - ${h.videoId}  ${h.title}`);

const stats = await yt.stats(hits.map((h) => h.videoId));
console.log(`[e2e] stats for ${stats.length} videos`);

const first = hits[0].videoId;
console.log(`[e2e] transcript: ${first}`);
const t = await yt.fetchTranscript(first, { langs: ['ko', 'en'], chunkChars: 7000 });
if (t.available) {
  console.log(`[e2e] transcript OK — ${t.charCount} chars, ${t.chunks.length} chunks, sha=${t.sha256.slice(0, 12)}, source=${t.source}`);
} else {
  console.log(`[e2e] transcript skipped: ${t.note}`);
}
console.log('[e2e] youtube-smoke DONE');
