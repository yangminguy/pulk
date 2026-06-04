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
await page.waitForTimeout(1200)

// Open the CTO planning panel
await page.getByText('CTO와 기획하기', { exact: false }).first().click().catch(() => {})
await page.waitForTimeout(600)
const panelOpen = await page.getByPlaceholder('CTO에게 만들고 싶은 것을 이야기하세요...').isVisible().catch(() => false)

// Send an unambiguous request that should yield a plan in one turn
await page.getByPlaceholder('CTO에게 만들고 싶은 것을 이야기하세요...').fill('세컨브레인 설정 페이지에 다크모드 토글 버튼을 추가해줘. 단순한 작업이고 추가 질문 없이 바로 PRD·로드맵·작업 계획을 제안해줘.')
await page.getByRole('button', { name: '보내기' }).click().catch(() => {})

// CTO turn calls claude-cli — give it time
await page.waitForTimeout(45000)
const body = await page.evaluate(() => document.body.innerText).catch(() => '')
await page.screenshot({ path: '/tmp/cto_planning.png', fullPage: true }).catch(() => {})

const gotReply = body.includes('CTO 제안 계획') || body.includes('이 계획 승인') || body.length > 0
const gotPlanCard = body.includes('CTO 제안 계획')
const gotApproveBtn = body.includes('이 계획 승인')
const gotRoadmap = body.includes('로드맵')
const gotTokenEstimate = body.includes('예상 토큰')

await browser.close()
console.log('panel opened (input visible):', panelOpen)
console.log('plan card visible:', gotPlanCard)
console.log('approve button visible:', gotApproveBtn)
console.log('roadmap shown:', gotRoadmap)
console.log('token estimate shown:', gotTokenEstimate)
console.log('console/page errors:', errs.length, errs.slice(0, 4))
console.log('screenshot: /tmp/cto_planning.png')
