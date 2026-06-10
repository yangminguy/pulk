import { chromium } from '@playwright/test'
const FRONT = 'http://localhost:3002', API = 'http://localhost:13000'
let token
const signIn = async () => (await (await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) })).json())?.data?.token
async function call(a, b) { const r = await fetch(`${API}/api/cmo:${a}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(b ?? {}) }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch {} return { ok: r.ok, data: j?.data?.data ?? j?.data ?? null } }
const getStatus = async (pid) => (await call('getProject', { project_id: pid })).data?.project?.status

token = await signIn()
const ts = Date.now(), title = `PULLRENDER ${ts}`
const pid = (await call('createProject', { title, product: `pr ${ts}`, target_audience: '대표', business_goal: 'consulting_lead', customer_problem: '매출 안됨', core_offer: '구조화' })).data?.project_id
console.log('project', pid)
// drive to pulling_content_set_selection
for (let i = 0; i < 40; i++) {
  const st = await getStatus(pid)
  if (st === 'pulling_content_set_selection') break
  if (st === 'key_content_ideation') { await call('proposeKeyContentDraft', { project_id: pid }); await call('selectKeyContentCandidate', { project_id: pid, candidate_id: 'cand-0' }); continue }
  const a = await call('advanceStatus', { project_id: pid }); if (!a.ok) await call('approveStageGate', { project_id: pid })
}
const r = await call('proposePullingCandidates', { project_id: pid })
console.log('proposePullingCandidates cands=', r.data?.candidates?.length)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.addInitScript(t => localStorage.setItem('l5_token', t), token)
const page = await ctx.newPage()
let proposeCalls = 0
page.on('request', req => { if (req.url().includes('cmo:proposePullingCandidates')) proposeCalls++ })
await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.locator(`button:has-text("${title}")`).first().click()
// 폴링: 카드(확정 버튼) 출현 vs 로딩
let outcome = 'timeout'
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(2000)
  const txt = await page.locator('body').innerText().catch(() => '')
  if (txt.includes('이 풀링 세트로 확정')) { outcome = `cards rendered @~${(i + 1) * 2}s`; break }
  if (txt.includes('후보가 생성되지 않았습니다')) { outcome = `empty @~${(i + 1) * 2}s`; break }
}
await page.screenshot({ path: '/tmp/check-pulling.png', fullPage: true }).catch(() => {})
console.log('OUTCOME:', outcome, '| UI proposePullingCandidates calls:', proposeCalls)
await browser.close()
process.exit(outcome.startsWith('cards') ? 0 : 2)
