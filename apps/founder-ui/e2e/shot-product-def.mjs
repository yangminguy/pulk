import { chromium } from '@playwright/test'

const API = 'http://localhost:13000'
const APP = 'http://localhost:3002'
const PROJECT_ID = '4f35e802-556c-4adf-85f7-175ed02e5dec'

async function signIn() {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  })
  return (await r.json())?.data?.token
}

const token = await signIn()
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 2400 } })
await ctx.addInitScript(t => localStorage.setItem('l5_token', t), token)
const page = await ctx.newPage()
await page.goto(`${APP}/video-room?project=${PROJECT_ID}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
// 프로젝트 선택 목록이면 '상품 정의 완료' 배지가 달린 행을 클릭해 진입
const badge = page.locator('text=상품 정의 완료').first()
if (await badge.count()) { await badge.click(); await page.waitForTimeout(4000) }
await page.waitForTimeout(2000)

const sections = ['상품 한 줄 정의', '핵심 타깃', '기능 / 특징 / 장점', '실제 사용자 문제', '현상 / 욕구 / 계획 / 행동 / 보상', '뷰트랩 검색 전 키워드', '뷰트랩 검색용 최종 키워드', '이대로 승인']
const found = {}
for (const s of sections) found[s] = (await page.locator(`text=${s}`).count()) > 0
console.log('SECTIONS', JSON.stringify(found, null, 2))

await page.screenshot({ path: '/tmp/product-def-board.png', fullPage: true })
console.log('SHOT /tmp/product-def-board.png')
await browser.close()
