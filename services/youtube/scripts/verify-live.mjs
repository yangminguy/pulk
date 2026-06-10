#!/usr/bin/env node
// Live verification for @l5/youtube (CMO M2).
// Runs real API calls: search → stats + 50k filter → dripda channel analytics.
// Usage: node services/youtube/scripts/verify-live.mjs  (build first: pnpm --filter @l5/youtube build)

import { loadCredentials, YouTubeClient, filterByMinViews } from '../dist/index.js';

const creds = loadCredentials();
const client = new YouTubeClient(creds);

// (a) Search
const query = '인스타그램 릴스 만드는 방법';
const results = await client.searchVideos(query, { maxResults: 15 });
console.log(`[a] search "${query}" → ${results.length} results`);
for (const r of results.slice(0, 5)) {
  console.log(`    ${r.videoId} | ${r.channelTitle} | ${r.title}`);
}

// (b) Stats + 50k+ filter
const stats = await client.getVideoStats(results.map((r) => r.videoId));
const popular = filterByMinViews(stats);
console.log(`[b] stats for ${stats.length} videos → ${popular.length} with 50k+ views`);
for (const s of [...popular].sort((x, y) => y.viewCount - x.viewCount).slice(0, 5)) {
  console.log(`    ${s.videoId} | views=${s.viewCount.toLocaleString()} | ${s.title}`);
}

// (c) dripda channel analytics, last 28 days (OAuth refresh_token → access_token)
const end = new Date();
const start = new Date(end.getTime() - 28 * 24 * 3600 * 1000);
const fmt = (d) => d.toISOString().slice(0, 10);
const report = await client.getChannelAnalytics({
  startDate: fmt(start),
  endDate: fmt(end),
  metrics: ['views', 'estimatedMinutesWatched', 'averageViewDuration', 'subscribersGained'],
});
console.log(`[c] channel "${creds.channel.title}" analytics ${fmt(start)}..${fmt(end)}`);
console.log('    headers:', report.columnHeaders.map((h) => h.name).join(', '));
console.log('    record:', JSON.stringify(report.records[0] ?? null));
if (report.records.length === 0) {
  throw new Error('analytics returned no rows');
}

// (d) thumbnail impressions/CTR — NOT supported by the Analytics targeted-query API.
// Verified 2026-06-10: identifiers videoThumbnailImpressions / videoThumbnailImpressionsClickRate
// are recognized but every query shape returns 400 "query is not supported".
// Impressions/CTR live only in the Reporting API reach reports (channel_reach_basic_a1,
// added 2026-01-15), which requires enabling youtubereporting.googleapis.com on the project.
try {
  await client.getChannelAnalytics({
    startDate: fmt(start),
    endDate: fmt(end),
    metrics: ['videoThumbnailImpressions', 'videoThumbnailImpressionsClickRate'],
  });
  console.log('[d] impressions/CTR via targeted query → SUPPORTED (Google enabled it — update docs!)');
} catch (err) {
  console.log(`[d] impressions/CTR via targeted query → not supported, as documented (${err.message})`);
}

console.log('LIVE VERIFICATION OK');
