// 2026-06-11 — 풀링 이후 자동 진행 배선 검증 (읽기 전용 + 안전 호출만)
// 검증 항목:
//   1) 진행 중 프로젝트의 현재 status / 카드 인벤토리 (pulling_content_report, pulling_plan, thumbnail_plan, title_development 등)
//   2) 새 dist 로드 확인 — cmo:getRenderStatus가 "factory_slug를 알 수 없습니다" 400으로 응답(액션 미등록 404와 구별)
//   3) advanceProjectFrom 멱등 가드 — 현재 status가 아닌 단계 액션을 호출해도 status가 변하지 않음(상태 비파괴)
//
// 실행: node apps/founder-ui/e2e/verify-auto-advance.mjs
// 옵션: VERIFY_PROJECT_ID=<id> (미지정 시 최신 프로젝트 자동 선택)

const API = process.env.NOCOBASE_API || 'http://localhost:13000';

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

async function call(token, action, body) {
  const r = await fetch(`${API}/api/cmo:${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, payload: json?.data?.data ?? json?.data ?? json, errors: json?.errors };
}

const out = { api: API, checks: {} };
const token = await signIn();

// ── 0) 프로젝트 선택 ──────────────────────────────────────────────────────────
let projectId = process.env.VERIFY_PROJECT_ID || '';
{
  const res = await call(token, 'listProjects', {});
  const projects = Array.isArray(res.payload?.projects) ? res.payload.projects : (Array.isArray(res.payload) ? res.payload : []);
  out.checks.listProjects = { status: res.status, count: projects.length };
  if (!projectId && projects[0]) projectId = projects[0].id;
  out.projectId = projectId;
}
if (!projectId) {
  console.log(JSON.stringify({ ...out, error: '프로젝트가 없습니다' }, null, 2));
  process.exit(1);
}

// ── 1) 현재 status + 카드 인벤토리 ────────────────────────────────────────────
let statusBefore = null;
{
  const res = await call(token, 'getProject', { project_id: projectId });
  const proj = res.payload?.project ?? res.payload;
  const cards = Array.isArray(res.payload?.cards) ? res.payload.cards : [];
  statusBefore = proj?.status ?? null;
  const stages = [...new Set(cards.map((c) => c.stage))];
  const has = (s) => stages.includes(s);
  out.checks.project = {
    status: statusBefore,
    current_page: proj?.current_page,
    card_stages: stages,
    pulling_content_report: has('pulling_content_report'),
    pulling_plan: has('pulling_plan'), // ★ 새 배선: 보고서 저장 시 자동 커밋
    key_content_choice: has('key_content_choice'),
    thumbnail_plan: has('thumbnail_plan'),
    thumbnail_choice: has('thumbnail_choice'),
    title_development: has('title_development'),
    script_draft: has('script_draft'),
  };
  const planCard = cards.find((c) => c.stage === 'pulling_plan');
  if (planCard) {
    const d = typeof planCard.data === 'string' ? JSON.parse(planCard.data) : planCard.data;
    out.checks.pulling_plan_detail = {
      source: d?.source ?? '(legacy commitPullingPlan)',
      key_topic_title: d?.key_topic_title,
      topics: (d?.pulling_topics ?? []).map((t) => t.title),
    };
  }
}

// ── 2) 새 dist 로드 확인 — getRenderStatus 응답 형태 ──────────────────────────
{
  const res = await call(token, 'getRenderStatus', { project_id: projectId });
  const msg = res.errors?.[0]?.message ?? JSON.stringify(res.payload).slice(0, 160);
  out.checks.getRenderStatus_dist_loaded = {
    status: res.status,
    // 404(액션 미등록)면 재기동 안 된 것. 400 + slug 안내면 신규 dist 정상 로드.
    verdict: res.status === 404 ? 'DIST_NOT_LOADED(재기동 필요)' : 'OK(액션 등록됨)',
    message: msg,
  };
}

// ── 3) 멱등 가드 — 현재 단계가 아니면 status 불변이어야 함 ─────────────────────
// runQA는 카드만 추가될 뿐 status는 advanceProjectFrom(project, 'qa') 가드로 보호된다.
// 현재 status가 'qa'가 아닐 때만 안전하게 검증한다.
// 주의: runQA 프로브는 qa 카드 1장을 남긴다 → 기본 생략, VERIFY_PROBE=1일 때만 실행.
if (process.env.VERIFY_PROBE === '1' && statusBefore && statusBefore !== 'qa') {
  const res = await call(token, 'runQA', { project_id: projectId, render_job_id: 'verify-idempotency-probe' });
  const after = await call(token, 'getProject', { project_id: projectId });
  const statusAfter = (after.payload?.project ?? after.payload)?.status ?? null;
  out.checks.idempotency_guard = {
    runQA_status: res.status,
    advanced_status_field: res.payload?.status ?? null, // null이어야 정상(현재 단계가 qa가 아니므로)
    project_status_before: statusBefore,
    project_status_after: statusAfter,
    verdict: statusAfter === statusBefore && (res.payload?.status ?? null) === null ? 'PASS(가드 작동)' : 'FAIL(status 변동!)',
  };
} else {
  out.checks.idempotency_guard = { skipped: 'VERIFY_PROBE=1일 때만 실행 (qa 카드 1장 생성됨)' };
}

console.log(JSON.stringify(out, null, 2));
