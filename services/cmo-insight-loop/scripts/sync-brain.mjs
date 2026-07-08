// CMO Insight Loop — 주간 세컨 브레인 동기화.
// data/brain-queue.jsonl의 claim들을 썸끝원끝 Supabase sc_brain_sync_queue로 적재.
// 자격증명은 썸끝원끝 .env.local에서 런타임에 읽는다(하드코딩 금지).
//
// jsonl 라인 형식: { "insight_id": "...", "claim": "...", "topics": [...],
//                   "memory_type": "procedural", "source_url": "..." }
//
// Usage: node scripts/sync-brain.mjs [--dry]
// 성공 라인은 data/brain-queue.synced.jsonl로 이동.

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
const QUEUE = join(ROOT, 'data', 'brain-queue.jsonl');
const SYNCED = join(ROOT, 'data', 'brain-queue.synced.jsonl');
const DRY = process.argv.includes('--dry');

function expandHome(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

function loadSupabaseCreds() {
  const envPath = expandHome(CONFIG.secondBrainEnvPath);
  const raw = readFileSync(envPath, 'utf8');
  const get = (k) => raw.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
  const url = get('NEXT_PUBLIC_SUPABASE_URL');
  const key = get('NEXT_PUBLIC_SUPABASE_ANON_KEY') || get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error(`Supabase creds not found in ${envPath}`);
  return { url, key };
}

async function main() {
  if (!existsSync(QUEUE)) {
    console.log(JSON.stringify({ ok: true, synced: 0, note: 'queue empty' }));
    return;
  }
  const lines = readFileSync(QUEUE, 'utf8').split('\n').filter((l) => l.trim());
  if (lines.length === 0) {
    console.log(JSON.stringify({ ok: true, synced: 0, note: 'queue empty' }));
    return;
  }

  const { url, key } = loadSupabaseCreds();
  const rows = lines.map((l) => {
    const r = JSON.parse(l);
    return {
      insight_id: r.insight_id,
      claim: r.claim,
      memory_type: r.memory_type ?? 'procedural',
      topics: r.topics ?? [],
      source_url: r.source_url ?? '',
      status: 'pending',
    };
  });

  if (DRY) {
    console.log(JSON.stringify({ ok: true, dry: true, wouldSync: rows.length }, null, 2));
    return;
  }

  const res = await fetch(`${url}/rest/v1/sc_brain_sync_queue`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert failed: HTTP ${res.status} ${await res.text()}`);
  }

  for (const l of lines) appendFileSync(SYNCED, l + '\n');
  writeFileSync(QUEUE, '');
  console.log(JSON.stringify({ ok: true, synced: rows.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
