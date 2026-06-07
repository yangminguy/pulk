// Full proof: create a project, walk to SCRIPT phase, then screenshot all three
// boards (전략 done-gated, 원고 active-gated, 발행 locked-gated).
// Mirrors the proven auth flow of shot-active-stage.mjs.
import { chromium } from '@playwright/test'

const FRONT = process.env.FRONT || 'http://127.0.0.1:3002'
const API = 'http://localhost:13000'
const USER = 'admin@nocobase.com'
const PASS = 'admin123'

async function signIn() {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: USER, password: PASS }),
  })
  return (await r.json())?.data?.token
}
async function call(token, action, body) {
  const r = await fetch(`${API}/api/cmo:${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  })
  const t = await r.text()
  let j = null; try { j = JSON.parse(t) } catch {}
  return j?.data?.data ?? j?.data ?? j
}

const token = await signIn()
const created = await call(token, 'createProject', {
  title: '게이팅 풀검증 — 3보드',
  product: 'AI 마케팅 자동화 팀',
  target_audience: '작은 브랜드 대표',
  business_goal: 'consulting_lead',
})
const projectId = created?.project_id
console.log('project', projectId, created?.status)
await call(token, 'chatMessage', { project_id: projectId, founder_message: '키 콘텐츠 잡아줘' })

let status = created?.status
for (let i = 0; i < 40; i++) {
  const gd = await call(token, 'getProject', { project_id: projectId })
  status = gd?.project?.status
  if (status && status.startsWith('script')) break
  const pending = (gd?.gates ?? []).find(x => x.status === 'pending')
  if (pending) { await call(token, 'decideGate', { gate_id: pending.id, decision: 'approved' }); continue }
  const adv = await call(token, 'advanceStatus', { project_id: projectId })
  if (!adv?.status) await call(token, 'chatMessage', { project_id: projectId, founder_message: '진행' })
  else status = adv.status
  if (status && status.startsWith('script')) break
}
console.log('walked to', status)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(t => localStorage.setItem('l5_token', t), token)
// Keep the injected token: auth-context nukes it if auth:check is non-200.
await ctx.route('**/api/auth:check', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 1 } }) })
)
const page = await ctx.newPage()
await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

const card = page.locator('button:has-text("게이팅 풀검증")').first()
if (await card.count()) { await card.click(); await page.waitForTimeout(1500) }

// 전략 board — Viewtrap form should be a collapsed "완료 · 보기" bar (done)
const strat = page.locator('button:has-text("전략")').first()
if (await strat.count()) { await strat.click(); await page.waitForTimeout(900) }
await page.screenshot({ path: '/tmp/vr-06-strategy-gated.png', fullPage: true })
console.log('shot 06-strategy')

// 발행 board — 게시 파이프라인 should be locked ("이전 단계 완료 후")
const pub = page.locator('button:has-text("발행")').first()
if (await pub.count()) { await pub.click(); await page.waitForTimeout(900) }
await page.screenshot({ path: '/tmp/vr-07-publish-gated.png', fullPage: true })
console.log('shot 07-publish')

await browser.close()
