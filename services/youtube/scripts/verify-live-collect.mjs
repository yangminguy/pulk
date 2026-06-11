#!/usr/bin/env node
// Live verification for CMO M5 — collectVideoPerformance against the real dripda channel.
// Collects per-video performance for the last 28 days (video dimension; falls back to
// channel total if the video dimension is rejected). Usage:
//   pnpm --filter @l5/youtube build && node services/youtube/scripts/verify-live-collect.mjs

import { loadCredentials, YouTubeClient, collectVideoPerformance } from '../dist/index.js';

const creds = loadCredentials();
const client = new YouTubeClient(creds);

const end = new Date();
const start = new Date(end.getTime() - 28 * 24 * 3600 * 1000);
const fmt = (d) => d.toISOString().slice(0, 10);

const result = await collectVideoPerformance(client, {
  startDate: fmt(start),
  endDate: fmt(end),
});

console.log(`[M5] channel "${creds.channel.title}" ${fmt(start)}..${fmt(end)}`);
console.log(`     scope=${result.scope} metrics=[${result.metrics.join(', ')}]`);
if (result.note) console.log(`     note: ${result.note}`);
console.log(`     records (${result.records.length}):`);
for (const r of result.records) {
  console.log('       ' + JSON.stringify(r));
}
if (result.records.length === 0) {
  throw new Error('collectVideoPerformance returned no rows');
}
console.log('M5 LIVE COLLECT OK');
