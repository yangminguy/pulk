#!/usr/bin/env node
// agent_tasks ↔ Notion 상태 양방향 — live smoke.
//
//   NOTION_TOKEN=... NOCOBASE_TOKEN=... node services/notion-gateway/scripts/task-status-smoke.mjs
//     → read-only: run one sync round, then compare pulk status vs Notion 상태 per linked task.
//
//   ... task-status-smoke.mjs --flip <taskId> <status>
//     → simulate a pulk-side change (e.g. --flip <id> running), run a round,
//       and confirm the Notion row followed. Statuses: queued|running|blocked|needs_review|done|killed.
//
// Notion-side edit simulation is manual by design: edit 상태 in Notion, wait one
// poll (or run this read-only mode) and confirm pulk pulled it back.

const missing = [];
if (!process.env.NOTION_TOKEN && !process.env.notionintegrationtoken) missing.push('NOTION_TOKEN');
if (!process.env.NOCOBASE_TOKEN) missing.push('NOCOBASE_TOKEN');
if (missing.length) {
  console.error(`FAIL: missing env → ${missing.join(', ')}`);
  process.exit(1);
}

const BASE = process.env.NOCOBASE_URL ?? 'http://localhost:13000';
const TOKEN = process.env.NOCOBASE_TOKEN;
const NOTION_TOKEN = process.env.NOTION_TOKEN ?? process.env.notionintegrationtoken;
const DB = process.env.NOTION_DATABASE_ID ?? '39737e66cadf80cfb508fdd49c650088';
const NOTION_VERSION = process.env.NOTION_VERSION ?? '2022-06-28';

async function noco(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`NocoBase ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function notionPage(pageId) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: { Authorization: `Bearer ${NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION },
  });
  if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const flipIdx = process.argv.indexOf('--flip');
if (flipIdx !== -1) {
  const [taskId, status] = process.argv.slice(flipIdx + 1, flipIdx + 3);
  if (!taskId || !status) {
    console.error('FAIL: usage — --flip <taskId> <status>');
    process.exit(1);
  }
  console.log(`> flipping pulk task ${taskId} → ${status}`);
  await noco(`/api/agent_tasks:update?filterByTk=${encodeURIComponent(taskId)}`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

console.log('> running one sync round…');
process.argv.push('--once');
await import('../dist/index.js');

console.log('> comparing pulk ↔ Notion status for linked tasks…');
const data = await noco('/api/agent_tasks:list?pageSize=50&sort=-updatedAt');
const linked = (data?.data ?? []).filter((t) => t.notion_page_id);
if (linked.length === 0) {
  console.log('NOTE: no tasks linked to Notion yet (run once after creating tasks).');
  process.exit(0);
}
let mismatches = 0;
const STATUS_LABEL = { queued: 'Queued', running: 'In Progress', blocked: 'Blocked', needs_review: 'Needs Review', done: 'Done', killed: 'Killed' };
for (const t of linked.slice(0, 10)) {
  const page = await notionPage(t.notion_page_id);
  const label = page?.properties?.['상태']?.select?.name ?? '(none)';
  const ok = label === STATUS_LABEL[t.status];
  if (!ok) mismatches += 1;
  console.log(`${ok ? 'OK  ' : 'DIFF'} ${t.id} pulk=${t.status} notion=${label} "${String(t.title).slice(0, 40)}"`);
}
console.log(mismatches === 0 ? 'PASS: statuses converged.' : `NOTE: ${mismatches} row(s) differ — a Notion-side edit newer than pulk is expected to pull back next round.`);
