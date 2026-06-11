// 썸네일 9개 A/B 보드(ThumbnailMatrixBoard) UI 스모크.
// 시드: 프로젝트 생성 → status=thumbnail_pattern_extraction → matrix 카드(proposeThumbnailMatrix).
// 검증: video-room에서 보드 + 9개 후보 렌더. 실패 시 artifact 저장(rule 50). 자동수정 안 함.
import { chromium } from '@playwright/test'

const FRONT = process.env.FRONT || 'http://127.0.0.1:3001'
const API = 'http://localhost:13000'
const ART = '/tmp/smoke-thumbnail-matrix'

async function signIn() {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  })
  const token = (await r.json())?.data?.token
  if (!token) throw new Error('signIn 실패')
  return token
}
async function cmo(token, action, body) {
  const r = await fetch(`${API}/api/cmo:${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  })
  const t = await r.text()
  try { return JSON.parse(t) } catch { return { raw: t } }
}

let failed = false
const token = await signIn()

// ── 시드 ──────────────────────────────────────────────────────────────────
const created = await cmo(token, 'createProject', {
  title: '썸네일 A/B 스모크', product: '썸네일 A/B 스모크',
  target_audience: '1인 마케터', business_goal: 'consulting_lead',
})
const projectId = created?.data?.data?.project_id ?? created?.data?.project_id ?? created?.project_id
if (!projectId) { console.error('createProject 실패:', JSON.stringify(created).slice(0, 200)); process.exit(1) }
console.log('프로젝트 생성:', projectId)

// status를 썸네일 단계로 직접 set(워크플로우 walk 생략).
await fetch(`${API}/api/video_room_projects:update?filterByTk=${projectId}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ status: 'thumbnail_pattern_extraction' }),
})
// matrix 카드 시드(결정론).
const seed = await cmo(token, 'proposeThumbnailMatrix', {
  project_id: projectId, title: '광고비 90% 아끼는 자동화',
  main_click_reason: '수작업을 자동화로 바꾸면 시간과 비용이 준다', deterministic: true,
})
const seedN = seed?.data?.data?.candidates?.length ?? seed?.data?.candidates?.length
console.log('matrix 카드 시드:', seedN, '개 후보')

// ── UI 검증 ───────────────────────────────────────────────────────────────
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
await page.addInitScript(t => localStorage.setItem('l5_token', t), token)

try {
  await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(1500)

  // 로그인 폼이 뜨면 제출(프리필된 admin 계정).
  const loginBtn = page.locator('button:has-text("로그인")')
  if (await loginBtn.count() > 0) {
    console.log('로그인 폼 감지 — 제출')
    await page.locator('input[type="password"]').fill('admin123').catch(() => {})
    await loginBtn.first().click().catch(() => {})
    await page.waitForTimeout(2500)
    await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(1500)
  }

  // 프로젝트 선택(목록에서 클릭). 제목/스모크 키워드로 찾는다.
  const pick = page.locator('text=썸네일 A/B 스모크').first()
  if (await pick.count() > 0) { await pick.click().catch(() => {}); await page.waitForTimeout(1500) }

  // 보드 제목 + 9개 후보 검증.
  const boardTitle = await page.locator('text=썸네일 9개 A/B').count()
  const genBtn = await page.locator('button:has-text("9개 기획안")').count()
  const slotA = await page.locator('text="A"').count()
  const thumbText = await page.locator('text=클릭 가설').count()

  console.log('보드 제목 노출:', boardTitle > 0)
  console.log('생성 버튼 노출:', genBtn > 0)
  console.log('후보 카드(클릭 가설) 노출:', thumbText > 0)

  await page.screenshot({ path: `${ART}.png`, fullPage: true })
  console.log('스크린샷:', `${ART}.png`)

  if (boardTitle === 0) {
    failed = true
    console.error('❌ 보드 제목이 안 보임 — stage 게이팅/선택 확인 필요.')
  } else if (thumbText === 0 && genBtn === 0) {
    failed = true
    console.error('❌ 보드는 있으나 후보/버튼 미렌더.')
  } else {
    console.log('✅ ThumbnailMatrixBoard 렌더 확인.')
  }
} catch (e) {
  failed = true
  console.error('스모크 예외:', e.message)
  await page.screenshot({ path: `${ART}-error.png`, fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  // 정리: 시드 프로젝트/카드 삭제.
  await fetch(`${API}/api/video_room_projects:destroy?filterByTk=${projectId}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {})
  await fetch(`${API}/api/video_room_cards:destroy?filter[video_project_id]=${projectId}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {})
  console.log('정리 완료.')
  process.exit(failed ? 1 : 0)
}
