// 2026-06-11 — pulling_plan 카드 백필 (1회용)
// 구 dist 시절 생성된 pulling_content_report에서 topics를 읽어,
// 새 proposePullingReport 자동 커밋과 동일한 변환으로 pulling_plan 카드를 saveCard로 커밋한다.
// (이후 생성되는 보고서는 서버가 자동 커밋하므로 이 스크립트는 다시 필요 없음.)
//
// 실행: node apps/founder-ui/e2e/backfill-pulling-plan.mjs
// 옵션: VERIFY_PROJECT_ID=<id> (미지정 시 최신 프로젝트)

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
  const j = await r.json().catch(() => ({}));
  return { status: r.status, payload: j?.data?.data ?? j?.data ?? j };
}

const token = await signIn();

let projectId = process.env.VERIFY_PROJECT_ID || '';
if (!projectId) {
  const res = await call(token, 'listProjects', {});
  const projects = Array.isArray(res.payload?.projects) ? res.payload.projects : (Array.isArray(res.payload) ? res.payload : []);
  projectId = projects[0]?.id ?? '';
}
if (!projectId) throw new Error('프로젝트 없음');

const detail = await call(token, 'getProject', { project_id: projectId });
const cards = Array.isArray(detail.payload?.cards) ? detail.payload.cards : [];

const existing = cards.filter((c) => c.stage === 'pulling_plan');
if (existing.length > 0) {
  console.log(JSON.stringify({ projectId, skipped: 'pulling_plan 카드가 이미 있음', count: existing.length }, null, 2));
  process.exit(0);
}

const reportCard = cards
  .filter((c) => c.stage === 'pulling_content_report')
  .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
if (!reportCard) throw new Error('pulling_content_report 카드 없음 — 보고서를 먼저 생성하세요');

const report = typeof reportCard.data === 'string' ? JSON.parse(reportCard.data) : reportCard.data;
const reportTopics = Array.isArray(report?.topics) ? report.topics : [];
if (reportTopics.length === 0) throw new Error('보고서에 topics 없음');

// 서버 자동 커밋(plugin proposePullingReport)과 동일한 변환.
const planTopics = reportTopics
  .slice()
  .sort((a, b) => Number(a?.rank ?? 0) - Number(b?.rank ?? 0))
  .map((t, i) => ({
    id: `pulling-content-${Number(t?.rank ?? i + 1)}`,
    order: Number(t?.rank ?? i + 1),
    title: String(t?.topic_name ?? '').trim(),
    selection_reasons: {
      consumer_stage: String(t?.funnel?.phenomenon ?? t?.target_phenomenon ?? '현상'),
      bridge_to_key: String(
        t?.created_desire
          ? `${t.created_desire} → 키 콘텐츠 "${t?.linked_key_content ?? report?.key_content_title ?? ''}"로 연결`
          : `키 콘텐츠 "${t?.linked_key_content ?? report?.key_content_title ?? ''}"로 연결`,
      ),
      search_demand: String(t?.selection_reason ?? '실데이터 발굴 기반'),
      problem_addressed: String(t?.target_phenomenon ?? t?.selection_reason ?? ''),
    },
  }))
  .filter((t) => t.title);

if (planTopics.length === 0) throw new Error('변환된 주제 0개');

const res = await call(token, 'saveCard', {
  project_id: projectId,
  stage: 'pulling_plan',
  summary: `pulling_plan: ${planTopics.length}개 주제 (보고서 백필)`,
  data: {
    key_topic_title: String(report?.key_content_title ?? ''),
    pulling_topics: planTopics,
    source: 'pulling_content_report(backfill)',
  },
});

console.log(JSON.stringify({
  projectId,
  saveCard_status: res.status,
  key_topic_title: String(report?.key_content_title ?? ''),
  topics: planTopics.map((t) => `${t.order}. ${t.title}`),
}, null, 2));
