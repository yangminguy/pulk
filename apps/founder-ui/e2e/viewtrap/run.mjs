// Viewtrap 통합 러너: 로그인 확인 → (필요시) 구글 원탭/수동 로그인 → 검색 → 스크래핑을
// 한 세션에서 연속 수행한다. viewtrap 인증이 sessionStorage/인메모리라 "닫았다 다시 열기"가
// 안 되므로 로그인~스크래핑을 끊지 않는다. persistent 프로필의 구글 쿠키로 재로그인은 보통 원탭.
//
// 사용:
//   corepack pnpm exec node e2e/viewtrap/run.mjs "검색어"            (스크래핑 → JSON stdout)
//   corepack pnpm exec node e2e/viewtrap/run.mjs "검색어" --discover  (선택자 탐색 + 스크린샷)
//   corepack pnpm exec node e2e/viewtrap/run.mjs "검색어" --out /tmp/refs.json
import { chromium } from '@playwright/test'
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs'

const SEARCH_URL = 'https://app.viewtrap.com/video-search'
const LOGIN_URL = 'https://app.viewtrap.com/auth/login'
const PROFILE_DIR = process.env.VIEWTRAP_CHROME_PROFILE ?? path.join(os.homedir(), '.l5', 'viewtrap-chrome-profile')
fs.mkdirSync(PROFILE_DIR, { recursive: true })

const argv = process.argv.slice(2)
const query = argv.find(a => !a.startsWith('--'))
const discover = argv.includes('--discover')
const outIdx = argv.indexOf('--out')
const outFile = outIdx >= 0 ? argv[outIdx + 1] : null
if (!query) { console.error('검색어 필요. 예: run.mjs "마케팅 자동화"'); process.exit(1) }

// 검색결과 선택자 — discover로 확정. (현재 추정치; --discover로 갱신)
const SELECTORS = {
  searchBox: 'input[placeholder*="검색"], input[type="search"], input[type="text"], input:visible',
  resultItem: '[class*="card"], [class*="video"], [class*="result"], li, tr',
  title: '[class*="title"], h3, h4, a',
  views: '[class*="view"], [class*="조회"]',
  link: 'a[href*="youtube"], a[href*="watch"], a[href]',
}

async function launch() {
  const opts = { headless: false, viewport: { width: 1340, height: 940 }, args: ['--disable-blink-features=AutomationControlled'] }
  try { return await chromium.launchPersistentContext(PROFILE_DIR, { ...opts, channel: 'chrome' }) }
  catch { return await chromium.launchPersistentContext(PROFILE_DIR, opts) }
}

const ctx = await launch()
await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) } catch {} })
const page = ctx.pages()[0] ?? await ctx.newPage()

// 1) 로그인 확인 / 필요시 로그인
await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(2500)
if (page.url().includes('/auth/login') || (await page.url()) === LOGIN_URL) {
  console.log('→ 미로그인 — 구글 로그인 시도(원탭/수동). 창에서 필요시 직접 완료하세요.')
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
  const popupP = page.waitForEvent('popup', { timeout: 10000 }).catch(() => null)
  // 견고한 클릭: 보이는 "Google 계정으로 로그인" 요소를 스크롤 후 force 클릭(여러 후보 시도).
  let clicked = false
  for (const loc of [
    page.getByText('Google 계정으로 로그인', { exact: false }).last(),
    page.locator('button:has-text("Google"), [role="button"]:has-text("Google")').first(),
    page.locator('div:has-text("Google 계정으로 로그인")').last(),
  ]) {
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 })
      await loc.click({ timeout: 4000, force: true })
      clicked = true; break
    } catch {}
  }
  console.log(clicked ? '→ 구글 버튼 클릭됨' : '   (구글 버튼 자동클릭 실패 — 열린 창에서 직접 눌러주세요)')
  await popupP
  // 로그인 완료까지 대기(최대 4분). 같은 탭이 /video-search 접근되면 성공.
  const deadline = Date.now() + 4 * 60 * 1000
  let ok = false
  while (Date.now() < deadline) {
    await page.waitForTimeout(5000)
    const googleOpen = ctx.pages().some(p => /accounts\.google\.com/i.test(p.url()))
    if (googleOpen) continue
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)
    if (!page.url().includes('/auth/login')) { ok = true; break }
    console.log('   …로그인 대기 중(현재 ' + page.url() + ')')
  }
  if (!ok) { console.error('❌ 로그인 미완료(타임아웃).'); await ctx.close(); process.exit(2) }
  console.log('✅ 로그인 확인됨')
} else {
  console.log('✅ 기존 세션 로그인 상태')
}

// 진단: 인증 토큰이 어디 있는지(sessionStorage/localStorage 키만)
try {
  const where = await page.evaluate(() => ({
    ls: Object.keys(localStorage), ss: Object.keys(sessionStorage),
  }))
  console.log('   [auth 위치 단서] localStorage:', where.ls.join(','), '| sessionStorage:', where.ss.join(','))
} catch {}

// 2) 검색 — ⚠ viewtrap 인증은 인메모리라 page.goto(재로드) 금지. 현재(로그인된) 페이지에서
// SPA 내 인터랙션으로만 검색한다. 이미 /video-search SPA 위에 있다(step1에서 도달).
console.log(`→ 검색: "${query}" (현재 URL ${page.url()})`)
await page.waitForTimeout(2000)
if (page.url().includes('/auth/login')) {
  console.error('❌ 검색 직전 로그아웃 상태(인메모리 인증 소실). 재시도 필요.'); await ctx.close(); process.exit(2)
}
let searchOk = false
try {
  const box = page.locator(SELECTORS.searchBox).first()
  await box.click({ timeout: 10000 })
  await box.fill(query, { timeout: 8000 })
  await box.press('Enter')
  await page.waitForTimeout(5000)
  searchOk = true
} catch (e) {
  console.log('⚠ 검색창 입력 실패:', String(e).slice(0, 100), '— discover로 input 구조 확인.')
}

// 3) discover 또는 스크래핑
if (discover) {
  await page.screenshot({ path: '/tmp/viewtrap-search.png', fullPage: true }).catch(() => {})
  // 반복 구조 후보 탐색: class 빈도 상위
  const info = await page.evaluate(() => {
    const counts = {}
    document.querySelectorAll('*').forEach(el => {
      const c = (el.className && typeof el.className === 'string') ? el.className.trim() : ''
      if (c) counts[c] = (counts[c] || 0) + 1
    })
    const top = Object.entries(counts).filter(([, n]) => n >= 4 && n <= 60).sort((a, b) => b[1] - a[1]).slice(0, 25)
    const inputs = [...document.querySelectorAll('input')].map(i => ({ type: i.type, ph: i.placeholder, name: i.name }))
    return { url: location.href, top, inputs, bodyLen: document.body.innerText.length }
  })
  console.log('=== DISCOVER ===')
  console.log('url:', info.url, '| bodyLen:', info.bodyLen)
  console.log('inputs:', JSON.stringify(info.inputs))
  console.log('반복 class 후보(개수):')
  info.top.forEach(([c, n]) => console.log(`  ${n}\t${c.slice(0, 90)}`))
  console.log('스크린샷: /tmp/viewtrap-search.png')
} else {
  const items = await page.locator(SELECTORS.resultItem).evaluateAll((els, sel) => {
    return els.slice(0, 30).map((el, i) => {
      const q = s => { const e = el.querySelector(s); return e ? (e.textContent || '').trim() : '' }
      const a = el.querySelector('a[href]')
      return { id: `vt-${i}`, title: q(sel.title), views_text: q(sel.views), url: a ? a.href : '', source: 'viewtrap' }
    }).filter(r => r.title)
  }, SELECTORS)
  const out = JSON.stringify(items, null, 2)
  if (outFile) { fs.writeFileSync(outFile, out); console.log(`✅ ${items.length}건 → ${outFile}`) }
  console.log(out)
}

await ctx.close()
console.log('done')
