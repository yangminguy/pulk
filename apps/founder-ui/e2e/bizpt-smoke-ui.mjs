// bizpt-manager UI 스모크 — 3003 로드 · 사이드바 · 파이프라인 실데이터 · 슬라이드오버.
// 실행: cd apps/founder-ui && corepack pnpm exec node ../bizpt-manager/e2e/smoke-ui.mjs
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3003'
const out = (m) => console.log(`[smoke] ${m}`)
const fail = (m) => { console.error(`[FAIL] ${m}`); process.exitCode = 1 }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })

try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 })
  out(`타이틀: ${await page.title()}`)

  // 1. 사이드바 렌더
  const navCount = await page.locator('nav.side button').count()
  out(`사이드바 버튼 ${navCount}개`)
  if (navCount < 20) fail('사이드바 버튼 부족')

  // 2. 백엔드 연결 배지
  await page.waitForTimeout(2500)
  const conn = await page.locator('.top .acts .pill').last().innerText()
  out(`연결 배지: ${conn}`)
  if (!conn.includes('연결됨')) fail('백엔드 연결 안 됨: ' + conn)

  // 3. 파이프라인 뷰 — 실데이터 카드
  await page.locator('nav.side button', { hasText: '콘텐츠 파이프라인' }).click()
  await page.waitForTimeout(1200)
  const cards = await page.locator('.pc').count()
  out(`파이프라인 카드 ${cards}개 (실데이터)`)
  if (cards < 1) fail('파이프라인 카드 0개')
  const firstCard = await page.locator('.pc .tt').first().innerText()
  out(`첫 카드: ${firstCard}`)

  // 4. 슬라이드오버 — 여정 지도 한국어
  await page.locator('.pc').first().click()
  await page.waitForTimeout(1500)
  const soVisible = await page.locator('.so.on').count()
  if (!soVisible) fail('슬라이드오버 안 열림')
  const journey = await page.locator('.so .smv .rw').count()
  out(`여정 지도 단계 ${journey}개 (한국어)`)
  if (journey < 20) fail('여정 지도 단계 부족')
  const nowHere = await page.locator('.so .smv .tag', { hasText: '지금 여기' }).count()
  out(`"지금 여기" 마커: ${nowHere}`)
  await page.screenshot({ path: '/tmp/bizpt-smoke-slideover.png' })
  await page.locator('.so .x').click()

  // 5. 정적 뷰 시연 배너
  await page.locator('nav.side button', { hasText: '지식베이스' }).click()
  await page.waitForTimeout(500)
  const kbTable = await page.locator('.view.on table').count()
  out(`지식베이스 표: ${kbTable}`)

  // 6. 오늘 뷰 복귀 + 스크린샷
  await page.locator('nav.side button', { hasText: '오늘' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: '/tmp/bizpt-smoke-today.png', fullPage: false })
  out('스크린샷: /tmp/bizpt-smoke-today.png · /tmp/bizpt-smoke-slideover.png')

  if (errors.length) { out(`콘솔 에러 ${errors.length}건`); errors.slice(0, 5).forEach(e => out('  ' + e.slice(0, 160))) }
  else out('콘솔 에러 0건')
  out(process.exitCode ? 'RESULT: FAIL' : 'RESULT: PASS')
} catch (e) {
  fail(String(e).slice(0, 300))
  try { await page.screenshot({ path: '/tmp/bizpt-smoke-error.png' }) } catch {}
} finally {
  await browser.close()
}
