// 키 콘텐츠 기획만 같은 프로젝트에서 코드로 재실행 (UI 클릭 없이).
//
// 용도: key-content-report 로직/프롬프트를 고친 뒤, 브라우저 워크플로우를 다시 타지 않고
//       동일 project_id의 "키 콘텐츠 기획 보고서"만 재생성한다. 보고서 카드는 upsert(덮어쓰기)라
//       안전하며, 백엔드의 라이브 deps(CDP YouTube 성과도/기여도, Claude CLI LLM, DB)를 그대로 재사용한다.
//
// ⚠️ 선행조건: l5-core를 다시 빌드(packages/l5-core: tsc)한 뒤 백엔드를 1회 재시작해야 새 로직이 로드된다.
//             (플러그인이 l5-core/dist를 모듈 로드 시 require 하므로 캐시됨.)
//
// 실행 (founder-ui 디렉터리에서):
//   node e2e/rerun-key-content.mjs                       # 제목에 "E2E 풀 워크플로우" 포함된 최신 프로젝트
//   node e2e/rerun-key-content.mjs <project_id>          # 특정 프로젝트
//   node e2e/rerun-key-content.mjs --title "키워드"      # 제목 부분일치로 프로젝트 자동 선택
//
// 환경변수(선택): API_BASE(기본 http://localhost:13000), NB_ACCOUNT, NB_PASSWORD(기본 dev admin)

const API = process.env.API_BASE ?? 'http://localhost:13000'
const ACCOUNT = process.env.NB_ACCOUNT ?? 'admin@nocobase.com'
const PASSWORD = process.env.NB_PASSWORD ?? 'admin123'
const DEFAULT_TITLE = 'E2E 풀 워크플로우'

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

let token = ''
async function signIn() {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
  })
  const j = await r.json().catch(() => null)
  token = j?.data?.token
  if (!token) throw new Error(`signIn 실패 (account=${ACCOUNT}). NB_ACCOUNT/NB_PASSWORD 확인.`)
}

async function call(action, body, timeoutMs = 120000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(`${API}/api/cmo:${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}), signal: ctl.signal,
    })
    const text = await r.text()
    let json = null; try { json = JSON.parse(text) } catch { /* noop */ }
    const data = json?.data?.data ?? json?.data ?? null
    return { ok: r.ok, status: r.status, data, raw: text.slice(0, 600) }
  } finally { clearTimeout(t) }
}

// getProject로 키 콘텐츠 보고서 카드를 회수 (재생성 완료 폴링용).
async function getReportCard(projectId) {
  const res = await call('getProject', { project_id: projectId }, 30000)
  const cards = res.data?.cards ?? res.data?.data?.cards ?? []
  return cards.find((c) => c.stage === 'key_content_report') ?? null
}

async function resolveProjectId() {
  const arg = process.argv[2]
  if (arg && !arg.startsWith('--')) return arg
  const titleIdx = process.argv.indexOf('--title')
  const wanted = titleIdx >= 0 ? process.argv[titleIdx + 1] : DEFAULT_TITLE
  const res = await call('listProjects', {}, 30000)
  const list = res.data?.projects ?? res.data?.data ?? res.data ?? []
  const arr = Array.isArray(list) ? list : (list?.projects ?? [])
  const match = arr.filter((p) => String(p.title ?? '').includes(wanted))
  if (match.length === 0) throw new Error(`제목에 "${wanted}" 포함된 프로젝트 없음. project_id를 직접 넘기세요.`)
  // 최신순(생성시각/ id) 우선
  match.sort((a, b) => String(b.createdAt ?? b.id).localeCompare(String(a.createdAt ?? a.id)))
  log(`프로젝트 매칭: "${match[0].title}" (${match[0].id})`)
  return match[0].id
}

function printReport(data) {
  if (!data) { log('보고서 data 비어있음'); return }
  const market = data.market ?? []
  const cands = data.candidates ?? []
  log('── 키워드 시장성 판정 ──')
  for (const r of market) {
    log(`  · ${r.keyword}: ${r.verdict}  (롱폼 ${(Number(r.longformRatio ?? 0) * 100).toFixed(0)}% · 타깃 ${r.targetFit} · 판매 ${r.salesLink}) — ${r.verdictReason ?? ''}`)
  }
  log(`── 최종 선별 후보 (${cands.length}개) ──`)
  for (const c of cands) {
    log(`  #${c.rank}${c.topPick ? ' [최우선]' : ''} "${c.title}"  정체성=${c.identity_match ?? '-'} (${c.viewer_identity ?? '-'})`)
  }
  const applied = data.applied_sales_logic ?? data.applied ?? null
  if (applied?.content_topic) log(`── 우리 키 콘텐츠 주제: ${applied.content_topic}`)
  if (data.recommendation_reason) log(`── 추천 사유: ${data.recommendation_reason}`)
}

async function main() {
  await signIn()
  const projectId = await resolveProjectId()
  log(`키 콘텐츠 기획 재실행 시작 — project_id=${projectId} (보통 5~15분)`)

  const before = await getReportCard(projectId)
  const beforeAt = before?.updatedAt ?? before?.createdAt ?? null

  // 장시간 작업: HTTP가 keep-alive로 끊기거나 409(다른 발굴 진행중)일 수 있으므로,
  // 호출 후 카드 갱신을 폴링으로 회수한다.
  let kicked = false
  try {
    const res = await call('proposeKeyContentReport', { project_id: projectId }, 2400000)
    if (res.ok) { kicked = true; log('재생성 응답 수신 — 보고서 회수'); printReport(res.data); return }
    if (res.status === 409) log('409: 다른 발굴 진행중 — 완료까지 폴링')
    else log(`HTTP ${res.status} — 폴링으로 결과 회수 시도: ${res.raw}`)
  } catch (e) {
    log(`fetch 끊김(${String(e?.message ?? e)}) — 서버는 계속 작업중일 수 있어 폴링`)
  }

  // 폴링: 카드 updatedAt이 갱신되면 완료로 간주.
  const deadline = Date.now() + 2400000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15000))
    const card = await getReportCard(projectId)
    const at = card?.updatedAt ?? card?.createdAt ?? null
    if (card && at && at !== beforeAt) { log('보고서 갱신 확인'); printReport(card.data ?? card.report ?? null); return }
    process.stdout.write('.')
  }
  log('\n타임아웃 — 백엔드 로그를 확인하세요.')
}

main().catch((e) => { console.error('재실행 실패:', e); process.exit(1) })
