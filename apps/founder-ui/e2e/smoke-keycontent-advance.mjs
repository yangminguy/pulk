import { chromium } from '@playwright/test'

const FRONT = 'http://127.0.0.1:3002'
const API = 'http://localhost:13000'

const r = await fetch(`${API}/api/auth:signIn`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
})
const token = (await r.json())?.data?.token
if (!token) throw new Error('signIn failed')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const page = await ctx.newPage()
await page.addInitScript(t => localStorage.setItem('l5_token', t), token)

async function openByBadge(badge) {
  await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  // 프로젝트 카드 중 해당 상태 배지를 가진 카드 클릭
  const card = page.locator('button', { hasText: badge }).first()
  await card.click()
  await page.waitForTimeout(2500)
}

// 1) f791e8ea (키 콘텐츠 기획) → 자동초안 후보 카드 확인
await openByBadge('키 콘텐츠 기획')
const cand1 = await page.locator('text=마케팅 비용 90%').count()
const cand2 = await page.locator('text=가설을 AI가 자동 검증').count()
const cand3 = await page.locator('text=마케팅 경험 0인 대표').count()
console.log('[f791e8ea] 후보1 보임:', cand1 > 0)
console.log('[f791e8ea] 후보2 보임:', cand2 > 0)
console.log('[f791e8ea] 후보3 보임:', cand3 > 0)
await page.screenshot({ path: '/tmp/keycontent-board.png', fullPage: true })

// 2) 4f35e802 (전략 대화) → 전진 버튼 확인
await openByBadge('전략 대화')
const advBtn = page.locator('button', { hasText: '키 콘텐츠 기획 시작' })
console.log('[strategy_chat] 전진 버튼 보임:', (await advBtn.count()) > 0)
await page.screenshot({ path: '/tmp/strategy-advance-btn.png', fullPage: true })

await browser.close()
