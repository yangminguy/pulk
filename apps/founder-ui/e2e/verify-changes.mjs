import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3002', API = 'http://localhost:13000'
const token = (await fetch(`${API}/api/auth:signIn`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
}).then(r => r.json())).data.token

const browser = await chromium.launch({ headless: true })
const results = []

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(t => { try { localStorage.setItem('l5_token', t) } catch {} }, token)
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message))
  const net = []
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('roadmap:list') && !r.url().includes('discovery:today')) net.push(`${r.status()} ${r.url().replace(API, '')}`) })
  return { ctx, page, errors, net }
}

// ── 1. Inbox: select 세컨브레인 → 인박스 → CTO task → output 표시 ──
{
  const { ctx, page, errors, net } = await newPage()
  await page.goto(BASE + '/chat', { waitUntil: 'networkidle', timeout: 35000 })
  await page.waitForTimeout(1500)
  // pick the 세컨브레인 business in the sidebar
  await page.getByText('세컨브레인', { exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(1500)
  // open the 인박스 tab
  await page.getByText('인박스', { exact: false }).first().click().catch(() => {})
  await page.waitForTimeout(2000)
  // click the CTO task in the list (has injected output)
  await page.getByText(/CTO Agent/i).first().click().catch(() => {})
  await page.waitForTimeout(2000)
  const body = await page.evaluate(() => document.body.innerText).catch(() => '')
  await page.screenshot({ path: '/tmp/verify_inbox.png', fullPage: true }).catch(() => {})
  results.push({
    name: 'Inbox CTO output',
    pass: body.includes('핵심 권고') && body.includes('NocoBase RLS'),
    detail: `핵심권고=${body.includes('핵심 권고')} RLS텍스트=${body.includes('NocoBase RLS')} 실행항목=${body.includes('실행 항목') || body.includes('Action Items')} 상태칩=${body.includes('진행중') || body.includes('완료') || body.includes('검토필요')}`,
    errors: errors.length, net: net.length, netDetail: net.slice(0, 3),
  })
  await ctx.close()
}

// ── 2. Monitor: select 세컨브레인 → click agent card → drill-down modal ──
{
  const { ctx, page, errors, net } = await newPage()
  await page.goto(BASE + '/monitor', { waitUntil: 'networkidle', timeout: 35000 })
  await page.waitForTimeout(1500)
  await page.getByText('세컨브레인', { exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(2500) // wait for scoped reload + poll
  // click first agent card (the card is a role=button div with task title)
  const before = await page.evaluate(() => document.body.innerText).catch(() => '')
  await page.locator('[role="button"]').filter({ hasText: /Agent|workstream|진단|세컨/ }).first().click().catch(() => {})
  await page.waitForTimeout(2000)
  const body = await page.evaluate(() => document.body.innerText).catch(() => '')
  await page.screenshot({ path: '/tmp/verify_monitor_drill.png', fullPage: true }).catch(() => {})
  results.push({
    name: 'Monitor drill-down',
    pass: body.includes('에이전트 작업 상세') && (body.includes('핵심 권고') || body.includes('업무 이관') || body.includes('산출물')),
    detail: `모달=${body.includes('에이전트 작업 상세')} 산출물/이관=${body.includes('핵심 권고') || body.includes('업무 이관') || body.includes('산출물')} 세컨브레인task=${before.includes('세컨') || before.includes('CTO') || before.includes('RiskQA')}`,
    errors: errors.length, net: net.length, netDetail: net.slice(0, 3),
  })
  await ctx.close()
}

// ── 3. Integrity sweep: 6 pages, console/network errors ──
for (const path of ['/chat', '/monitor', '/memory', '/control-room', '/tool-requests', '/approval']) {
  const { ctx, page, errors, net } = await newPage()
  let http = 0
  try { const r = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 35000 }); http = r.status() } catch (e) { errors.push('GOTO ' + e.message) }
  await page.waitForTimeout(path === '/monitor' ? 9000 : 2000)
  results.push({ name: `integrity ${path}`, pass: http === 200 && errors.length === 0 && net.length === 0, detail: `http=${http}`, errors: errors.length, net: net.length, netDetail: net.slice(0, 3) })
  await ctx.close()
}

await browser.close()
console.log('\n===== VERIFY RESULTS =====')
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.name.padEnd(22)} ${r.detail}  [err=${r.errors} net=${r.net}]`)
  if (r.netDetail && r.netDetail.length) console.log('     net:', r.netDetail)
}
console.log('\nscreenshots: /tmp/verify_inbox.png, /tmp/verify_monitor_drill.png')
