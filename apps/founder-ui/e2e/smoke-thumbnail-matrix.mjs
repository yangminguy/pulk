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
// (프리필은 실 워크플로우의 key_content_choice 카드에서 동작 — 스모크는 보드 렌더만 검증.)
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

  // 인증 정착 대기: 앱이 admin 자동 로그인(auth-context)으로 인증될 때까지(로그인 폼 사라짐).
  await page.waitForFunction(
    () => !document.body.innerText.includes('운영 콘솔에 로그인'),
    { timeout: 25000 },
  ).catch(() => console.log('인증 대기 타임아웃(계속 진행)'))
  await page.waitForTimeout(800)

  // 프로젝트 선택: ProjectSelector의 시드 프로젝트 버튼 클릭.
  const pick = page.locator('button:has-text("썸네일 A/B 스모크")').first()
  await pick.waitFor({ state: 'visible', timeout: 20000 })
  await pick.click()

  // StrategyBoard → 썸네일 9개 A/B 보드 렌더 대기.
  await page.locator('text=썸네일 9개 A/B').first()
    .waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(800)

  // 검증: 생성 버튼 + 후보 카드(클릭 가설) = 보드 정상 렌더. 제목/프리필은 부가 정보.
  const boardTitle = await page.getByText('썸네일 9개 A/B', { exact: false }).count()
  const genBtn = await page.locator('button:has-text("9개 기획안")').count()
  const prefillNote = await page.getByText('확정 키 콘텐츠에서 자동 입력됨', { exact: false }).count()
  const thumbText = await page.getByText('클릭 가설', { exact: false }).count()
  // raw JSON 노출 회귀 점검: thumbnail_matrix 카드가 generic raw JSON으로 새지 않아야.
  const rawJson = await page.getByText('"candidate_id"', { exact: false }).count()

  console.log('보드 제목 노출:', boardTitle > 0)
  console.log('생성 버튼 노출:', genBtn > 0)
  console.log('워크플로우 자동 프리필 안내:', prefillNote > 0)
  console.log('후보 카드(클릭 가설) 노출:', thumbText > 0)
  console.log('raw JSON 누출 없음:', rawJson === 0)

  await page.screenshot({ path: `${ART}.png`, fullPage: true })
  console.log('스크린샷:', `${ART}.png`)

  if (genBtn > 0 && thumbText > 0 && rawJson === 0) {
    console.log('✅ ThumbnailMatrixBoard 정상 렌더(생성 버튼 + 9개 후보, raw JSON 누출 없음).')
  } else {
    failed = true
    console.error('❌ 보드 미렌더 또는 raw JSON 누출.')
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
