// R1~R7 보드 렌더 시각 검증: 프로젝트를 각 보드 상태로 API 주행(카드 미리 생성)한 뒤
// 브라우저로 로드해 스크린샷 + 콘솔/페이지 에러를 수집한다. 새 보드가 크래시 없이
// 렌더되는지 + 승인 버튼이 보이는지 확인. 실행: corepack pnpm exec node e2e/visual-r1-r7.mjs
import { chromium } from '@playwright/test'

const FRONT = 'http://localhost:3002'
const API = 'http://localhost:13000'
let token

async function signIn() {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  })
  return (await r.json())?.data?.token
}
async function call(action, body) {
  const r = await fetch(`${API}/api/cmo:${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  })
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch {}
  return { ok: r.ok, status: r.status, data: j?.data?.data ?? j?.data ?? null, err: r.ok ? null : t.slice(0, 200) }
}
const getStatus = async (pid) => (await call('getProject', { project_id: pid })).data?.project?.status

// 인터랙티브 상태에서 카드 생성 + 게이트/전진 처리하며 target까지 주행
async function driveTo(pid, target) {
  for (let i = 0; i < 60; i++) {
    const st = await getStatus(pid)
    if (st === target || st === 'completed') return st
    if (st === 'key_content_ideation') {
      await call('proposeKeyContentDraft', { project_id: pid })
      await call('selectKeyContentCandidate', { project_id: pid, candidate_id: 'cand-0' })
      continue
    }
    if (st === 'pulling_content_set_selection') {
      await call('proposePullingCandidates', { project_id: pid })
      if (target === 'pulling_content_set_selection') return st
      await call('commitPullingPlan', { project_id: pid }); continue
    }
    if (st === 'thumbnail_pattern_extraction') {
      const r = await call('proposeThumbnailPlanDraft', { project_id: pid })
      if (target === 'thumbnail_pattern_extraction') return st
      const cand = r.data?.candidates?.[0]
      await call('commitThumbnailPlan', { project_id: pid, candidate_id: cand?.id ?? cand?.candidate_id ?? 'cand-0' }); continue
    }
    if (st === 'script_planning') {
      await call('proposeScriptDraft', { project_id: pid })
      if (target === 'script_planning') return st
      await call('commitScriptDraft', { project_id: pid }); continue
    }
    const a = await call('advanceStatus', { project_id: pid })
    if (!a.ok) { const g = await call('approveStageGate', { project_id: pid }); if (!g.ok) return st }
  }
  return await getStatus(pid)
}

token = await signIn()
if (!token) { console.error('signIn 실패'); process.exit(1) }

const ts = Date.now()
const title = `VISUAL SMOKE ${ts}`
const cp = await call('createProject', {
  title, product: `시각검증상품 ${ts}`, target_audience: '작은 브랜드 대표',
  business_goal: 'consulting_lead', customer_problem: '콘텐츠가 매출로 안 이어진다', core_offer: '콘텐츠 기획 자동 구조화',
})
const pid = cp.data?.project_id
console.log('project', pid, cp.status)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.addInitScript(t => localStorage.setItem('l5_token', t), token)

const report = []
async function shot(name, { navPhaseIndex } = {}) {
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 160)))
  await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(800)
  const projBtn = page.locator(`button:has-text("${title}")`).first()
  if (await projBtn.count()) { await projBtn.click(); await page.waitForTimeout(2500) }
  if (navPhaseIndex != null) {
    // StepProgressRail phase 버튼(1.전략/2.제작/3.리뷰) 클릭
    const phaseBtn = page.locator('button').filter({ hasText: new RegExp(`^${navPhaseIndex}\\.`) }).first()
    if (await phaseBtn.count()) { await phaseBtn.click(); await page.waitForTimeout(2000) }
  }
  await page.waitForTimeout(1500)
  const path = `/tmp/visual-${name}.png`
  await page.screenshot({ path, fullPage: true }).catch(() => {})
  const bodyText = await page.locator('body').innerText().catch(() => '')
  report.push({ name, errors, path, hasContent: bodyText.length > 200 })
  console.log(`📸 ${name} → ${path} | console errors: ${errors.length}${errors.length ? ' :: ' + errors.join(' | ') : ''}`)
  await page.close()
}

// R1 풀링 보드
let st = await driveTo(pid, 'pulling_content_set_selection')
console.log('at', st)
await shot('R1-pulling')

// R4 썸네일 보드
st = await driveTo(pid, 'thumbnail_pattern_extraction')
console.log('at', st)
await shot('R4-thumbnail')

// R4 원고 패널 (production 페이지)
st = await driveTo(pid, 'script_planning')
console.log('at', st)
await shot('R4-script', { navPhaseIndex: 2 })

// R7 성과 보드 (review 페이지, completed)
st = await driveTo(pid, 'completed')
console.log('at', st)
await call('recordVideoPerformance', { project_id: pid, performance_data: { view_count: 5000, completion_rate: 0.55, ctr: 0.06 } })
await shot('R7-performance', { navPhaseIndex: 3 })

await browser.close()

console.log('\n=== VISUAL SUMMARY ===')
const bad = report.filter(r => r.errors.length > 0 || !r.hasContent)
report.forEach(r => console.log(`  ${r.errors.length === 0 && r.hasContent ? '✅' : '❌'} ${r.name} (errors=${r.errors.length}, content=${r.hasContent})`))
console.log(`project=${pid}`)
process.exit(bad.length ? 2 : 0)
