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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 3200 } })
await ctx.addInitScript(t => localStorage.setItem('l5_token', t), token)
const page = await ctx.newPage()
await page.goto(`${APP}/video-room?project=${PROJECT_ID}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
// 제목이 동일한 프로젝트가 2개 — 4f35e802(보고서 보유)는 두 번째 행. 두 번째 행 클릭.
const rows = page.getByText('인스타그램 마케팅 자동화 상품 판매', { exact: true })
const cnt = await rows.count()
console.log('project title rows:', cnt)
if (cnt >= 2) { await rows.nth(1).click() } else if (cnt === 1) { await rows.nth(0).click() }
await page.waitForTimeout(5500)
// 보고서 빈상태(다른 프로젝트)면 첫 행으로 폴백 재시도
if ((await page.locator('text=키워드 시장성 요약').count()) === 0 && cnt >= 2) {
  await page.goto(`${APP}/video-room`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.getByText('인스타그램 마케팅 자동화 상품 판매', { exact: true }).nth(0).click()
  await page.waitForTimeout(5500)
}

const sections = ['키워드 시장성 요약', '최종 선별 콘텐츠', '수익화 구조', '현상 / 욕구 / 계획 / 행동 / 보상', '우리 상품에 적용할 판매 논리', '추천 콘텐츠 선정 이유', '확정해도 될까요']
const found = {}
for (const s of sections) found[s] = (await page.locator(`text=${s}`).count()) > 0
console.log('SECTIONS', JSON.stringify(found, null, 2))

await page.screenshot({ path: '/tmp/key-content-report.png', fullPage: true })
console.log('SHOT /tmp/key-content-report.png')
await browser.close()
