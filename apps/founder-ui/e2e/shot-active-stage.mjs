// Walk a fresh video project to the SCRIPT phase, then screenshot the
// production board to verify soft-gating: 원고 active, downstream locked.
import { chromium } from '@playwright/test'

const FRONT = 'http://127.0.0.1:3000'
const API = 'http://localhost:13000'
const USER = 'admin@nocobase.com'
const PASS = 'admin123'

async function signIn() {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: USER, password: PASS }),
  })
  const j = await r.json()
  return j?.data?.token
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
  title: '게이팅 검증 — 원고 단계',
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
const page = await ctx.newPage()
await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
// open this specific project by title
const card = page.locator('button:has-text("게이팅 검증")').first()
if (await card.count()) { await card.click(); await page.waitForTimeout(1500) }
// ensure on 원고/제작 page
const prod = page.locator('button:has-text("원고")').first()
if (await prod.count()) { await prod.click(); await page.waitForTimeout(1000) }
await page.screenshot({ path: '/tmp/vr-05-active-script.png', fullPage: true })
console.log('shot 05-active-script')
await browser.close()
