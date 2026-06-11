// Viewtrap 구글 OAuth 로그인 → 세션(storageState) 저장.
// 자격증명은 env(VTG_EMAIL/VTG_PASS)로만 받는다(파일/레포 저장 금지).
// 자동 입력을 시도하되, 구글이 자동화를 막으면 헤드드 창에서 사람이 직접 완료할 수 있게
// URL이 viewtrap으로 돌아올 때까지(최대 5분) 폴링한다. 성공 시 세션 저장.
import { chromium } from '@playwright/test'
import os from 'os'
import path from 'path'
import fs from 'fs'

const EMAIL = process.env.VTG_EMAIL
const PASS = process.env.VTG_PASS
const SESSION_PATH = process.env.VIEWTRAP_SESSION ?? path.join(os.homedir(), '.l5', 'viewtrap-session.json')
fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true })

// 영속(persistent) 프로필 + 실제 Chrome → 일회용 자동화 컨텍스트보다 구글 차단 가능성↓.
// 전용 디렉토리라 사장님 개인 Chrome 프로필은 건드리지 않는다. 세션이 이 프로필에 유지됨.
const PROFILE_DIR = process.env.VIEWTRAP_CHROME_PROFILE ?? path.join(os.homedir(), '.l5', 'viewtrap-chrome-profile')
fs.mkdirSync(PROFILE_DIR, { recursive: true })
async function launchPersistent() {
  const opts = {
    headless: false,
    viewport: { width: 1280, height: 900 },
    slowMo: 120,
    args: ['--disable-blink-features=AutomationControlled'],
  }
  try { return await chromium.launchPersistentContext(PROFILE_DIR, { ...opts, channel: 'chrome' }) }
  catch { return await chromium.launchPersistentContext(PROFILE_DIR, opts) }
}
const ctx = await launchPersistent()
// navigator.webdriver 흔적 제거(완전 우회는 아니지만 탐지 신호↓).
await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) } catch {} })
const browser = ctx.browser()
const page = ctx.pages()[0] ?? await ctx.newPage()
console.log('→ Viewtrap 로그인 페이지로 이동')
await page.goto('https://app.viewtrap.com/auth/login', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

// 구글 로그인 버튼: 명시적으로 최대 20초 대기 후 클릭(팝업/리다이렉트 모두 대응).
let gpage = page
const googleBtn = page.getByText('Google 계정으로 로그인', { exact: false }).first()
try {
  await googleBtn.waitFor({ state: 'visible', timeout: 20000 })
} catch {
  console.log('⚠ "Google 계정으로 로그인" 버튼을 못 찾음. 진단 캡처.')
  await page.screenshot({ path: '/tmp/viewtrap-google-nobtn.png' }).catch(() => {})
}
const popupP = page.waitForEvent('popup', { timeout: 10000 }).catch(() => null)
await googleBtn.click({ timeout: 8000 }).catch((e) => console.log('   버튼 클릭 실패:', String(e).slice(0, 80)))
console.log('→ "Google 계정으로 로그인" 클릭')
const popup = await popupP
if (popup) { gpage = popup; console.log('→ 구글 OAuth 팝업 감지'); await popup.waitForLoadState('domcontentloaded').catch(() => {}) }
else { console.log('→ 팝업 없음 — 같은 탭 리다이렉트로 진행'); await page.waitForTimeout(2500) }

// 현재 구글 OAuth 페이지 핸들을 ctx에서 다시 찾는다(팝업/리다이렉트 모두 대응).
function googlePage() {
  return ctx.pages().find(p => /accounts\.google\.com/i.test(p.url())) ?? gpage
}
async function diag(tag) {
  const gp = googlePage()
  try {
    await gp.screenshot({ path: `/tmp/viewtrap-google-${tag}.png` }).catch(() => {})
    const t = (await gp.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)
    console.log(`   [diag ${tag}] url=${gp.url()} | text="${t}"`)
  } catch {}
}
// 자동 입력: 한 글자씩 타이핑 + Enter. 실패 시 진단 스크린샷.
async function tryAutoFill() {
  // 1) 이메일
  const gp1 = googlePage()
  await gp1.waitForLoadState('domcontentloaded').catch(() => {})
  const email = gp1.locator('input[type="email"], input[name="identifier"]').first()
  if (await email.count().catch(() => 0)) {
    await email.click({ timeout: 8000 }).catch(() => {})
    await email.pressSequentially(EMAIL, { delay: 60 }).catch(() => {})
    await gp1.keyboard.press('Enter').catch(() => {})
    console.log('→ 이메일 입력·Enter')
    await gp1.waitForTimeout(4000)
  }
  // 2) 비밀번호 — 최대 25초 동안 보이길 기다림
  const gp2 = googlePage()
  await gp2.waitForLoadState('networkidle').catch(() => {})
  const pass = gp2.locator('input[type="password"]:visible, input[name="Passwd"]').first()
  try {
    await pass.waitFor({ state: 'visible', timeout: 25000 })
  } catch (e) {
    console.log('⚠ 비밀번호 칸이 안 보임 — 구글이 차단/추가확인을 띄웠을 수 있음. 진단 캡처 후 창에서 직접 진행 가능.')
    await diag('pass-missing')
    return
  }
  await pass.click({ timeout: 6000 }).catch(() => {})
  await pass.pressSequentially(PASS, { delay: 60 }).catch(() => {})
  await gp2.keyboard.press('Enter').catch(() => {})
  console.log('→ 비밀번호 입력·Enter')
  await gp2.waitForTimeout(4000)
  await diag('after-pass')
}
if (EMAIL && PASS) { try { await tryAutoFill() } catch (e) { console.log('⚠ 자동입력 예외:', String(e).slice(0, 120)); await diag('exc') } }
else console.log('⚠ VTG_EMAIL/VTG_PASS 미설정 — 직접 로그인해 주세요')

// 성공 판정(실검증): 메인 탭을 /video-search 로 보내 /auth/login 으로 리다이렉트되지
// 않으면 진짜 로그인. 비번/2단계 인증이 막히면 열린 창에서 직접 완료해 주세요(최대 5분).
console.log('→ 로그인 완료 대기(최대 5분). 구글이 비번/2단계/“안전하지 않은 브라우저”를 띄우면')
console.log('   열린 Chrome 창에서 직접 로그인을 끝까지 완료해 주세요. 완료되면 자동 감지합니다…')
const main = page
const deadline = Date.now() + 5 * 60 * 1000
let ok = false
while (Date.now() < deadline) {
  await main.waitForTimeout(6000)
  // 팝업이 떠 있으면(아직 OAuth 진행 중) 대기.
  const popupStillOpen = ctx.pages().some(p => p !== main && /accounts\.google\.com|oauth/i.test(p.url()))
  if (popupStillOpen) continue
  try {
    await main.goto('https://app.viewtrap.com/video-search', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await main.waitForTimeout(2000)
    if (!main.url().includes('/auth/login')) { ok = true; break }
  } catch { /* 재시도 */ }
  console.log('   …아직 로그인 미완료(현재 ' + main.url() + ') — 창에서 진행 중이면 계속 기다립니다.')
}

if (!ok) {
  console.log('❌ 로그인 미완료(타임아웃). 세션 저장 안 함. 창에서 직접 끝까지 로그인 후 다시 시도하세요.')
  await ctx.close(); process.exit(2)
}

await ctx.storageState({ path: SESSION_PATH })
console.log(`✅ 실로그인 확인(/video-search 접근 OK) → 세션 저장 완료: ${SESSION_PATH}`)
await ctx.close()
console.log('done')
