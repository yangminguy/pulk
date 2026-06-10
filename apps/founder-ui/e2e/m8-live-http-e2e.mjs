// M8 — 라이브 HTTP E2E (NocoBase 실 엔드포인트)
// 1) cmo:sendBriefToFactory — 승인된 brief를 factory briefs/ 인박스에 실제 전달(R6 경로) 확인.
// 2) cmo:runDiscovery — YouTube 검색 + Sonnet 분류(CDP 불필요) 1회 HTTP 호출 → 200 + 후보 응답.
//
// 실행: corepack pnpm exec node e2e/m8-live-http-e2e.mjs
// 또는: node e2e/m8-live-http-e2e.mjs  (node18+ 전역 fetch)
//
// 인증: auth:signIn (admin@nocobase.com / admin123) → token → Bearer.
// 결과는 stdout JSON. factory briefs/ 경로는 응답 brief_path에서 확인.

import fs from 'node:fs';

const API = process.env.NOCOBASE_API || 'http://localhost:13000';
// E2E 대상: 기존 brief가 있는 프로젝트/카드(R6 검증분 재전송).
const BRIEF_PROJECT_ID = process.env.M8_PROJECT_ID || '38832b12-99ea-48b1-80e8-bef296d2ef82';
const BRIEF_CARD_ID = process.env.M8_CARD_ID || '1b0c2e9c-b0cc-46d8-a805-ac46a10f1fc2';
// runDiscovery 대상: 상품/타깃이 채워진 키콘텐츠 프로젝트.
const DISCOVERY_PROJECT_ID =
  process.env.M8_DISCOVERY_PROJECT_ID || '25b8b66d-59c2-4566-9567-82343888f17c';
const DISCOVERY_QUERY = process.env.M8_DISCOVERY_QUERY || '인스타그램 릴스 만드는 방법';

async function signIn() {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  });
  const j = await r.json();
  const token = j?.data?.token;
  if (!token) throw new Error(`signIn failed: ${JSON.stringify(j).slice(0, 200)}`);
  return token;
}

async function callAction(token, action, body) {
  const started = Date.now();
  const r = await fetch(`${API}/api/cmo:${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  // NocoBase는 액션 ctx.body를 { data: <body> }로 한 번 더 감싼다.
  // 우리 액션은 { ok, data } 형태라 실 payload는 json.data.data 에 위치.
  const payload = json?.data?.data ?? json?.data ?? json;
  return { status: r.status, ms: Date.now() - started, json, payload };
}

const out = { api: API, steps: {} };
const token = await signIn();
out.signedIn = true;

// --- Step 1: sendBriefToFactory (R6 path) ---
{
  const res = await callAction(token, 'sendBriefToFactory', {
    project_id: BRIEF_PROJECT_ID,
    content_card_id: BRIEF_CARD_ID,
  });
  const briefPath = res.payload?.brief_path;
  out.steps.sendBriefToFactory = {
    status: res.status,
    ms: res.ms,
    handoff_status: res.payload?.handoff_status,
    stub: res.payload?.stub,
    brief_path: briefPath,
    brief_file_exists: briefPath ? fs.existsSync(briefPath) : null,
    error: res.status === 200 ? undefined : res.json,
  };
}

// --- Step 2: runDiscovery (YouTube + Sonnet 분류, CDP 불필요) ---
{
  const res = await callAction(token, 'runDiscovery', {
    project_id: DISCOVERY_PROJECT_ID,
    query: DISCOVERY_QUERY,
    mode: 'key',
  });
  const cands = res.payload?.candidates;
  out.steps.runDiscovery = {
    status: res.status,
    ms: res.ms,
    mode: res.payload?.mode,
    provenance: res.payload?.provenance,
    candidate_count: Array.isArray(cands) ? cands.length : null,
    top_candidate: cands?.[0]
      ? {
          title: cands[0].title,
          viewCount: cands[0].viewCount,
          verdict: cands[0].verdict,
        }
      : null,
    error: res.status === 200 ? undefined : res.json,
  };
}

console.log(JSON.stringify(out, null, 2));

const ok =
  out.steps.sendBriefToFactory.status === 200 && out.steps.runDiscovery.status === 200;
process.exit(ok ? 0 : 1);
