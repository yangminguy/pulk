import { chromium } from '@playwright/test'
const BASE = 'http://localhost:3002', API = 'http://localhost:13000'
const token = (await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) }).then(r => r.json())).data.token
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
await ctx.addInitScript(t => { try { localStorage.setItem('l5_token', t) } catch {} }, token)
const page = await ctx.newPage()
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', e => errs.push('PAGEERR ' + e.message))

await page.goto(BASE + '/control-room', { waitUntil: 'networkidle', timeout: 35000 })
await page.waitForTimeout(2500)
const body = await page.evaluate(() => document.body.innerText).catch(() => '')
await page.screenshot({ path: '/tmp/roadmap_burndown.png', fullPage: true }).catch(() => {})

const panel = body.includes('로드맵 진행')
const hasPercent = /\d+%/.test(body) && body.includes('완료')
const hasStatus = body.includes('대기') || body.includes('진행 중') || body.includes('완료')

await browser.close()
console.log('roadmap panel visible:', panel)
console.log('summary percent + 완료 shown:', hasPercent)
console.log('status chip shown:', hasStatus)
console.log('console/page errors:', errs.length, errs.slice(0, 4))
console.log('screenshot: /tmp/roadmap_burndown.png')
