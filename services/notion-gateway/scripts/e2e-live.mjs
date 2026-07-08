// Live E2E: exercises the real mapping + Notion REST against DB1.
// Creates a row, reads it, flips status, verifies. Leaves a clearly-labeled row.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mapTaskToProperties, mapPageToStatusUpdate } from '@l5/core';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../../../.env.local');
const env = readFileSync(envPath, 'utf8');
const TOKEN = env.split('\n').find((l) => l.startsWith('notionintegrationtoken='))?.split('=').slice(1).join('=').trim();
const DB = '39737e66cadf80cfb508fdd49c650088';
const H = { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };

const task = {
  id: `e2e-${Date.now()}`,
  instruction_id: 'e2e',
  assigned_agent: 'CTO',
  title: '[pulk E2E 테스트] Notion 동기화 검증 — 삭제해도 됩니다',
  rationale: 'pulk agent_tasks ↔ Notion 양방향 동기화 라이브 검증용 임시 행',
  expected_output: '동기화 동작 확인',
  status: 'queued',
  approval_required: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

async function j(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } }

// 1. CREATE
const createRes = await fetch('https://api.notion.com/v1/pages', {
  method: 'POST', headers: H,
  body: JSON.stringify({ parent: { database_id: DB }, properties: mapTaskToProperties(task) }),
});
const created = await j(createRes);
if (created.object === 'error') { console.error('CREATE 실패:', created.message); process.exit(1); }
console.log('1) CREATE ok → page', created.id);

// 2. QUERY back and confirm mapping key + status
const qRes = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ filter: { property: 'Pulk Task ID', rich_text: { equals: task.id } } }),
});
const q = await j(qRes);
const row = q.results?.[0];
console.log('2) QUERY ok → 이름:', row?.properties?.['이름']?.title?.[0]?.plain_text);
console.log('   상태:', row?.properties?.['상태']?.select?.name, '| Pulk Task ID match:', mapPageToStatusUpdate({ id: row.id, properties: row.properties })?.task_id === task.id);

// 3. UPDATE status → Done (simulate a pulk-side change)
await fetch(`https://api.notion.com/v1/pages/${created.id}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ properties: { '상태': { select: { name: 'Done' } } } }),
});
const q2 = await j(await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
  method: 'POST', headers: H, body: JSON.stringify({ filter: { property: 'Pulk Task ID', rich_text: { equals: task.id } } }),
}));
const pull = mapPageToStatusUpdate({ id: q2.results[0].id, properties: q2.results[0].properties });
console.log('3) UPDATE→PULL ok → mapPageToStatusUpdate:', JSON.stringify(pull));
console.log(pull?.status === 'done' ? '\n✅ E2E PASS — create/query/update/pull 전부 동작' : '\n❌ status 불일치');
