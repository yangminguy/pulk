// 관전용 headed 데모: 이미 후보 3개가 생성된 프로젝트를 열어
// 후보 카드 → 보고서 새창 → 1개 선택 흐름을 보여준다.
import { chromium } from '@playwright/test'

const FRONT = 'http://localhost:3002'
const API = 'http://localhost:13000'
const PROJECT_ID = '25b8b66d-59c2-4566-9567-82343888f17c'

async function signIn() {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  })
  return (await r.json())?.data?.token
}

const token = await signIn()

const browser = await chromium.launch({ headless: false, slowMo: 400 })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
await ctx.addInitScript(t => localStorage.setItem('l5_token', t), token)
const page = await ctx.newPage()

// 보고서 새 창 자동 캡처
ctx.on('page', async p => {
  await p.waitForLoadState('domcontentloaded').catch(() => {})
  await p.waitForTimeout(1000)
  await p.screenshot({ path: '/tmp/demo-report.png', fullPage: true }).catch(() => {})
  console.log('📄 보고서 새 창 캡처: /tmp/demo-report.png')
})

await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const card = page.locator(`button:has-text("AI 자동화 마케팅 프로그램")`).first()
if (await card.count()) { await card.click(); await page.waitForTimeout(3000) }
console.log('프로젝트 진입 — 주제 후보 3개 표시 확인')

const pick = page.locator('button:has-text("이 주제로 선택")').first()
try { await pick.waitFor({ timeout: 20000 }); console.log('✅ 후보 3개 카드 표시됨') }
catch { console.log('후보 카드 미표시 — 스크린샷 확인') }
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/demo-candidates.png', fullPage: true })

// 보고서 확인하기 → 새 창
const report = page.locator('button:has-text("보고서 확인")').first()
if (await report.count() && await report.isEnabled()) {
  await report.click(); await page.waitForTimeout(2500)
  console.log('보고서 버튼 클릭')
}

await page.waitForTimeout(20000)
await browser.close()
console.log('done — /tmp/demo-candidates.png, /tmp/demo-report.png')
