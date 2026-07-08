#!/usr/bin/env node
// PRD저장소 + 코딩 워크플로우 로그 — live smoke (one full sync round).
//
//   NOTION_TOKEN=... NOTION_PRD_DATABASE_ID=... NOCOBASE_TOKEN=... \
//     node services/notion-gateway/scripts/prd-smoke.mjs
//
// Requires `pnpm --filter @l5/notion-gateway build` first (runs the built dist).
// Non-destructive: creates/updates Notion pages for existing pulk data only.

const missing = [];
if (!process.env.NOTION_TOKEN && !process.env.notionintegrationtoken) missing.push('NOTION_TOKEN');
if (!process.env.NOTION_PRD_DATABASE_ID) missing.push('NOTION_PRD_DATABASE_ID (PRD저장소 database id)');
if (!process.env.NOCOBASE_TOKEN) missing.push('NOCOBASE_TOKEN');
if (missing.length) {
  console.error(`FAIL: missing env → ${missing.join(', ')}`);
  console.error('Set them (e.g. source .env.local) and retry.');
  process.exit(1);
}

process.argv.push('--once');
console.log('> running one sync round (PRD round + task round)…');
try {
  await import('../dist/index.js');
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  console.error('Hint: run `corepack pnpm --filter @l5/notion-gateway build` first.');
  process.exit(1);
}
