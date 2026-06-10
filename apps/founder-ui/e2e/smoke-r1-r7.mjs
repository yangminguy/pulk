// R1~R7 API 스모크: 새 프로젝트를 생성해 상태머신을 끝까지 주행하며
// 신규 액션(R1 풀링 / R4 썸네일·원고 / R6 brief·factory / R7 성과)을 실제 호출,
// HTTP 상태 + 응답 shape를 검증한다. 실패해도 멈추지 않고 전부 기록(결함 지도).
// 실행: corepack pnpm exec node e2e/smoke-r1-r7.mjs

const API = 'http://localhost:13000'
let token

async function signIn() {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  })
  const j = await r.json()
  return j?.data?.token
}

async function call(action, body) {
  try {
    const r = await fetch(`${API}/api/cmo:${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
    })
    const text = await r.text()
    let json
    try { json = JSON.parse(text) } catch { json = null }
    const data = json?.data?.data ?? json?.data ?? null
    return { ok: r.ok, status: r.status, data, err: r.ok ? null : text.slice(0, 240) }
  } catch (e) {
    return { ok: false, status: 0, data: null, err: String(e).slice(0, 240) }
  }
}

const getProject = async (pid) => (await call('getProject', { project_id: pid })).data
const cardId = (d, stage) => d?.cards?.find((c) => c.stage === stage)?.id
const pendingGate = (d) => d?.gates?.find((g) => g.status === 'pending')

const results = []
function rec(step, ok, info) {
  results.push({ step, ok, info })
  console.log(`${ok ? '✅' : '❌'} ${step} — ${info}`)
}

const token0 = await signIn()
if (!token0) { console.error('signIn 실패'); process.exit(1) }
token = token0
console.log('signed in')

// 1) createProject
const cp = await call('createProject', {
  title: `SMOKE R1-R7 ${Date.now()}`,
  product: 'AI 자동화 마케팅 프로그램',
  target_audience: '작은 브랜드 대표',
  business_goal: 'consulting_lead',
  customer_problem: '콘텐츠가 매출로 안 이어진다',
  core_offer: '콘텐츠 기획을 자동으로 구조화',
})
const pid = cp.data?.project_id
rec('createProject', cp.ok && !!pid, `${cp.status} project=${pid} ${cp.err ?? ''}`)
if (!pid) { console.error('프로젝트 생성 실패 — 중단'); process.exit(1) }

// 2) 상태머신 주행
const done = new Set()
let lastStatus = ''
let stuck = 0
for (let i = 0; i < 80; i++) {
  const d = await getProject(pid)
  const st = d?.project?.status
  if (!st) { rec('getProject', false, 'status 없음 — 중단'); break }
  if (st === lastStatus) { stuck++ } else { stuck = 0; lastStatus = st }
  if (stuck > 3) { rec('driver', false, `상태 ${st}에서 진행 불가(stuck)`); break }
  console.log(`  [${i}] status=${st}`)

  if (st === 'completed') break

  // 키 콘텐츠: 분석 초안 → 후보 → 택1
  if (st === 'key_content_ideation' && !done.has('kc')) {
    done.add('kc')
    const r = await call('proposeKeyContentDraft', { project_id: pid })
    rec('prep proposeKeyContentDraft', r.ok && (r.data?.candidates?.length > 0), `${r.status} cands=${r.data?.candidates?.length ?? '-'} ${r.err ?? ''}`)
    const s = await call('selectKeyContentCandidate', { project_id: pid, candidate_id: 'cand-0' })
    rec('prep selectKeyContentCandidate', s.ok, `${s.status} ${s.err ?? ''}`)
    continue
  }

  // R1 풀링: 후보 세트 → 확정
  if (st === 'pulling_content_set_selection' && !done.has('pull')) {
    done.add('pull')
    const r = await call('proposePullingCandidates', { project_id: pid })
    rec('R1 proposePullingCandidates', r.ok && (r.data?.candidates?.length > 0), `${r.status} cands=${r.data?.candidates?.length ?? '-'} ${r.err ?? ''}`)
    const c = await call('commitPullingPlan', { project_id: pid })
    rec('R1 commitPullingPlan', c.ok && (c.data?.pulling_topics?.length > 0), `${c.status} topics=${c.data?.pulling_topics?.length ?? '-'} ${c.err ?? ''}`)
    continue
  }

  // R4 썸네일: 후보 → 택1
  if (st === 'thumbnail_pattern_extraction' && !done.has('thumb')) {
    done.add('thumb')
    const r = await call('proposeThumbnailPlanDraft', { project_id: pid })
    const cand = r.data?.candidates?.[0]
    const candId = cand?.id ?? cand?.candidate_id ?? 'cand-0'
    rec('R4 proposeThumbnailPlanDraft', r.ok && !!cand, `${r.status} cands=${r.data?.candidates?.length ?? '-'} ${r.err ?? ''}`)
    const c = await call('commitThumbnailPlan', { project_id: pid, candidate_id: candId })
    rec('R4 commitThumbnailPlan', c.ok, `${c.status} ${c.err ?? ''}`)
    continue
  }

  // R4 원고 + R6 brief/factory
  if ((st === 'script_planning' || st === 'script_draft') && !done.has('script')) {
    done.add('script')
    const r = await call('proposeScriptDraft', { project_id: pid })
    rec('R4 proposeScriptDraft', r.ok, `${r.status} ${r.err ?? ''}`)
    const d2 = await getProject(pid)
    const cid = cardId(d2, 'script_draft') ?? cardId(d2, 'script')
    const b = await call('generateVideoExecutionBrief', { project_id: pid, card_id: cid, content_card_id: cid })
    rec('R6 generateVideoExecutionBrief', b.ok && !!b.data?.brief_id, `${b.status} brief_id=${b.data?.brief_id ?? '-'} ${b.err ?? ''}`)
    const f = await call('sendBriefToFactory', { project_id: pid, content_card_id: cid, brief_id: b.data?.brief_id, brief: b.data?.brief })
    rec('R6 sendBriefToFactory', f.ok, `${f.status} handoff=${f.data?.handoff_status ?? '-'} ${f.err ?? ''}`)
    const c = await call('commitScriptDraft', { project_id: pid })
    rec('R4 commitScriptDraft', c.ok, `${c.status} ${c.err ?? ''}`)
    continue
  }

  // 게이트면 승인
  const g = pendingGate(d)
  if (g) {
    const r = await call('decideGate', { gate_id: g.id, decision: 'approved' })
    rec(`gate ${g.gate_type ?? g.status}`, r.ok, `${r.status} → ${r.data?.status ?? '-'} ${r.err ?? ''}`)
    continue
  }

  // 아니면 한 칸 전진. 승인 게이트라 막히면 approveStageGate로 통과(새 보드 흐름).
  const a = await call('advanceStatus', { project_id: pid })
  if (!a.ok) {
    const ag = await call('approveStageGate', { project_id: pid })
    rec(`approveStageGate@${st}`, ag.ok, `${ag.status} → ${ag.data?.status ?? '-'} ${ag.err ?? ''}`)
    if (!ag.ok) break
  }
}

// R7 성과 (completed 도달 여부와 무관하게 시도 — 액션 자체 검증)
const finalD = await getProject(pid)
console.log(`  final status=${finalD?.project?.status}`)
const perf = await call('recordVideoPerformance', {
  project_id: pid,
  performance_data: { view_count: 5000, completion_rate: 0.55, ctr: 0.06, retention_notes: '도입부 이탈 보통', feedback: '반응 좋음' },
})
rec('R7 recordVideoPerformance', perf.ok, `${perf.status} insights=${perf.data?.insights?.length ?? '-'} ${perf.err ?? ''}`)
const ins = await call('getCompletedVideoInsights', { project_id: pid })
rec('R7 getCompletedVideoInsights', ins.ok, `${ins.status} insights=${ins.data?.insights?.length ?? '-'} ${ins.err ?? ''}`)

// 요약
const fails = results.filter((r) => !r.ok)
console.log('\n=== SUMMARY ===')
console.log(`${results.length} steps · ${results.length - fails.length} PASS · ${fails.length} FAIL · project=${pid}`)
if (fails.length) { console.log('FAILURES:'); fails.forEach((f) => console.log(`  ❌ ${f.step} :: ${f.info}`)) }
process.exit(fails.length ? 2 : 0)
