// bizpt-manager 쓰기 경로 스모크 — 실제 UI 클릭으로 상태 전진 (대상: tiger-smoke 테스트 프로젝트).
import { chromium } from '@playwright/test'

const out = (m) => console.log(`[write-smoke] ${m}`)
const fail = (m) => { console.error(`[FAIL] ${m}`); process.exitCode = 1 }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto('http://localhost:3003', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.locator('nav.side button', { hasText: '콘텐츠 파이프라인' }).click()
  await page.waitForTimeout(1000)

  const card = page.locator('.pc', { hasText: 'tiger-smoke' }).first()
  if (!(await card.count())) { fail('tiger-smoke 카드 없음'); process.exit(1) }
  const beforeNow = await card.locator('.now').innerText()
  out(`카드 상태(전): ${beforeNow.trim().slice(0, 60)}`)

  await card.click()
  await page.waitForTimeout(1500)
  const btn = page.locator('.so button', { hasText: '다음 단계로' })
  if (!(await btn.count())) { fail('수동 전진 버튼 없음'); process.exit(1) }
  const beforePill = await page.locator('.so .st1 .pill').innerText()
  await btn.click()
  await page.waitForTimeout(1200)
  const toast = await page.locator('.toast').innerText().catch(() => '')
  out(`토스트: ${toast || '(이미 사라짐)'}`)
  await page.waitForTimeout(2000)
  const headerPill = await page.locator('.so .st1 .pill').innerText()
  out(`슬라이드오버 상태: ${beforePill} → ${headerPill}`)
  if (headerPill === beforePill) fail('상태 미변경 — 백엔드 전진 실패')
  await page.screenshot({ path: '/tmp/bizpt-write-smoke.png' })
  out(process.exitCode ? 'RESULT: FAIL' : 'RESULT: PASS — UI 클릭 → 백엔드 상태 전진 → 화면 갱신 관통')
} catch (e) {
  fail(String(e).slice(0, 250))
} finally {
  await browser.close()
}
