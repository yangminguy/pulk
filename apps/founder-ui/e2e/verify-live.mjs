import { chromium } from '@playwright/test'
const BASE = 'http://localhost:3002', API = 'http://localhost:13000'
const token = (await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) }).then(r => r.json())).data.token
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.addInitScript(t => { try { localStorage.setItem('l5_token', t) } catch {} }, token)
const page = await ctx.newPage()
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', e => errs.push('PAGEERR ' + e.message))

await page.goto(BASE + '/chat', { waitUntil: 'networkidle', timeout: 35000 })
await page.waitForTimeout(1500)
await page.getByText('세컨브레인', { exact: true }).first().click().catch(() => {})
await page.waitForTimeout(1200)
// select the project that holds the tasks (세컨브레인 안정화 제품 빌딩)
await page.getByText('세컨브레인 안정화 제품 빌딩', { exact: false }).first().click().catch(() => {})
await page.waitForTimeout(2500)
let body = await page.evaluate(() => document.body.innerText).catch(() => '')
await page.screenshot({ path: '/tmp/live_synthesis.png', fullPage: true }).catch(() => {})
const synthesisOk = body.includes('Chief of Staff') || body.includes('운영 종합') || body.includes('옵션 B')

// inbox → COO task → real output
await page.getByText('인박스', { exact: false }).first().click().catch(() => {})
await page.waitForTimeout(1800)
await page.getByText(/COO Agent/i).first().click().catch(() => {})
await page.waitForTimeout(1800)
body = await page.evaluate(() => document.body.innerText).catch(() => '')
await page.screenshot({ path: '/tmp/live_inbox_coo.png', fullPage: true }).catch(() => {})
const inboxOk = body.includes('핵심 권고') && (body.includes('옵션 B') || body.includes('action') || body.includes('실행 항목'))

await browser.close()
console.log('synthesis card visible:', synthesisOk)
console.log('inbox COO real output:', inboxOk, '| 핵심권고=' + body.includes('핵심 권고'), '실행항목=' + body.includes('실행 항목'))
console.log('console/page errors:', errs.length, errs.slice(0, 3))
console.log('screenshots: /tmp/live_synthesis.png, /tmp/live_inbox_coo.png')
