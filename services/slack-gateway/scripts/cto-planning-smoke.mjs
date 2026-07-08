#!/usr/bin/env node
// CTO planning bridge — live smoke against a running NocoBase (no Slack needed).
//
//   NOCOBASE_URL=http://localhost:13000 NOCOBASE_TOKEN=... \
//     node services/slack-gateway/scripts/cto-planning-smoke.mjs "결제 기능 PRD 만들어줘"
//
//   --approve   additionally approves the thread's latest proposed plan
//               (creates REAL roadmap_items + agent_tasks — use a test idea).
//
// Uses a clearly-labeled test thread id; safe to re-run (each run = new thread).

const BASE = process.env.NOCOBASE_URL ?? 'http://localhost:13000';
const TOKEN = process.env.NOCOBASE_TOKEN ?? '';

if (!TOKEN) {
  console.error('FAIL: NOCOBASE_TOKEN is not set. Export NOCOBASE_TOKEN (NocoBase API key) and retry.');
  process.exit(1);
}

const approve = process.argv.includes('--approve');
const message = process.argv.filter((a) => !a.startsWith('--')).slice(2).join(' ')
  || '[SMOKE TEST] 테스트용: 간단한 방문자 카운터 위젯 PRD를 만들어줘. 로드맵 1개, 태스크 1~2개면 충분.';
const threadId = `smoke-cto-planning-${Date.now()}`;

async function api(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

console.log(`thread_id=${threadId}`);
console.log(`> cto:planMessage "${message.slice(0, 60)}…"`);
const planRes = await api('/api/cto:planMessage', { thread_id: threadId, founder_message: message });
const data = planRes?.data?.data ?? planRes?.data;
console.log(`reply: ${String(data?.reply ?? '').slice(0, 200)}`);
console.log(`plan: ${data?.plan ? `roadmap=${data.plan.roadmap_items?.length ?? 0} tasks=${data.plan.tasks?.length ?? 0}` : '(not yet — conversational turn)'}`);
console.log(`cto_message_id: ${data?.cto_message_id}`);

if (approve) {
  if (!data?.plan) {
    console.error('FAIL: --approve requested but the CTO did not propose a plan on this turn.');
    process.exit(1);
  }
  console.log('> cto:approvePlan');
  const apRes = await api('/api/cto:approvePlan', { cto_message_id: data.cto_message_id });
  const ap = apRes?.data?.data ?? apRes?.data;
  console.log(`approved: roadmap_items=${ap?.roadmap_item_ids?.length ?? 0} tasks=${ap?.task_ids?.length ?? 0} instruction=${ap?.instruction_id}`);
}

console.log('PASS: cto planning smoke completed.');
