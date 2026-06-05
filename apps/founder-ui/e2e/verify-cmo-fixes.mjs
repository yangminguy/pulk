/**
 * CMO Video Room — Fix 1 + Fix 2 verification
 *
 * Fix 1: 업로드 초안 생성 — title input filled → 200 (was 400)
 * Fix 2: QA 실행 후 탭이 Review&Publish에 유지되는지 확인
 *
 * Run:
 *   cd apps/founder-ui && node e2e/verify-cmo-fixes.mjs
 */

import { chromium } from '@playwright/test'

const FRONT = 'http://localhost:3007'
const API   = 'http://localhost:13099'
const USER  = 'admin@nocobase.com'
const PASS  = 'admin123'

async function signIn() {
  const res = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: USER, password: PASS }),
  })
  if (!res.ok) throw new Error(`auth:signIn failed ${res.status}`)
  const payload = await res.json()
  const token = payload?.data?.token
  if (!token) throw new Error('no token from auth:signIn')
  return token
}

async function call(token, action, body) {
  const res = await fetch(`${API}/api/cmo:${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* leave null */ }
  return { status: res.status, json, text }
}

function data(r) {
  return r.json?.data?.data ?? r.json?.data ?? r.json
}

// Walk project to rendering stage so QA + upload buttons are live
async function setupProject(token) {
  const created = await call(token, 'createProject', {
    title: 'Fix 검증 E2E — ' + Date.now(),
    product: 'AI 마케팅 자동화 팀',
    target_audience: '마케팅팀을 둘 여력이 없는 작은 브랜드 대표',
    business_goal: 'consulting_lead',
  })
  const proj = data(created)
  const projectId = proj?.project_id
  if (!projectId) throw new Error(`createProject failed: ${created.text.slice(0, 200)}`)
  console.log(`  project_id: ${projectId}  status: ${proj.status}`)

  await call(token, 'chatMessage', { project_id: projectId, founder_message: '키 콘텐츠 잡아줘' })

  const TARGET = new Set(['voice_recording', 'slide_deck', 'rendering'])
  let status = proj.status
  for (let i = 0; i < 35; i++) {
    const g = await call(token, 'getProject', { project_id: projectId })
    const gd = data(g)
    status = gd?.project?.status
    const pending = (gd?.gates ?? []).find(x => x.status === 'pending')
    if (pending) {
      await call(token, 'decideGate', { gate_id: pending.id, decision: 'approved' })
      continue
    }
    if (TARGET.has(status)) break
    if (status === 'completed') break
    const adv = await call(token, 'advanceStatus', { project_id: projectId })
    const advd = data(adv)
    if (!advd?.status) {
      await call(token, 'chatMessage', { project_id: projectId, founder_message: '진행' })
    } else {
      status = advd.status
    }
    if (TARGET.has(status)) break
  }
  console.log(`  project walked to status: ${status}`)
  return { projectId, status }
}

async function newPage(browser, token) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(t => {
    try { localStorage.setItem('l5_token', t) } catch {}
  }, token)
  const page = await ctx.newPage()
  const consoleErrors = []
  const networkErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => { consoleErrors.push('PAGEERR: ' + e.message) })
  page.on('response', r => {
    const url = r.url()
    const st = r.status()
    if (st >= 400 && !url.includes('roadmap:list') && !url.includes('discovery:today') && !url.includes('favicon')) {
      networkErrors.push(`${st} ${url.replace(API, '[API]').replace(FRONT, '[FRONT]')}`)
    }
  })
  return { ctx, page, consoleErrors, networkErrors }
}

async function main() {
  console.log('CMO Video Room Fix Verification E2E')
  console.log(`  FRONT: ${FRONT}`)
  console.log(`  API:   ${API}\n`)

  console.log('[0] Auth + API setup')
  const token = await signIn()
  console.log('  token acquired')
  const { projectId } = await setupProject(token)
  console.log(`  ready: project ${projectId}\n`)

  const browser = await chromium.launch({ headless: true })
  const results = []
  const { ctx, page, consoleErrors, networkErrors } = await newPage(browser, token)

  try {
    // Navigate to video-room
    console.log('[1] Navigate to /video-room')
    await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle', timeout: 40000 })
    await page.waitForTimeout(2000)

    // Select project
    console.log('[2] Select project')
    const projectBtn = page.locator('button', { hasText: 'Fix 검증 E2E' }).first()
    await projectBtn.waitFor({ timeout: 10000 }).catch(() => {})
    await projectBtn.click().catch(async () => {
      await page.locator('.j-card').first().click().catch(() => {})
    })
    await page.waitForTimeout(2500)

    // Navigate to Review & Publish tab
    console.log('[3] Click Review & Publish tab')
    await page.getByText('Review & Publish', { exact: true }).first().click()
    await page.waitForTimeout(1500)

    const bodyOnReview = await page.evaluate(() => document.body.innerText).catch(() => '')
    const onReviewBefore = bodyOnReview.includes('Publish Board') || bodyOnReview.includes('게시 파이프라인')
    console.log(`  Review&Publish tab active before QA: ${onReviewBefore}`)

    // ── Fix 2: QA 실행 → tab must stay on Review&Publish ──────────────────────
    console.log('[4] Click QA 실행 (Fix 2: tab should NOT reset)')
    const qaNetCalls = []
    page.on('response', r => {
      if (r.url().includes('runQA')) qaNetCalls.push(`${r.status()} ${r.url().replace(API, '[API]')}`)
    })

    const qaBtn = page.getByText('QA 실행', { exact: true }).first()
    await qaBtn.waitFor({ timeout: 8000 }).catch(() => {})
    await qaBtn.click().catch(e => console.log(`  WARN QA click: ${e.message}`))
    // wait for the API + onRefresh cycle to complete
    await page.waitForTimeout(5000)

    // Check which tab is visually active now
    const activeTabText = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button'))
      const active = tabs.find(b => b.style.borderBottom && b.style.borderBottom.includes('solid') && b.style.fontWeight === '600')
      return active?.textContent?.trim() ?? null
    }).catch(() => null)

    const bodyAfterQA = await page.evaluate(() => document.body.innerText).catch(() => '')
    const tabStillReview = bodyAfterQA.includes('Publish Board') || bodyAfterQA.includes('게시 파이프라인')
    console.log(`  active tab element text: ${activeTabText}`)
    console.log(`  Publish Board content still visible: ${tabStillReview}`)
    console.log(`  QA network calls: ${qaNetCalls.join(', ') || '(none)'}`)

    await page.screenshot({ path: '/tmp/cmo-fix-2-tab.png', fullPage: true })
    console.log('  screenshot: /tmp/cmo-fix-2-tab.png')

    results.push({
      name: 'Fix2 탭 유지',
      pass: tabStillReview,
      detail: `tabContent=${tabStillReview} activeTab=${activeTabText} qa_net=${qaNetCalls.join('|') || 'none'}`,
    })

    // ── Fix 1: 업로드 초안 — fill title → 200 ─────────────────────────────────
    console.log('[5] Fill 제목 input + click 업로드 초안 생성 (Fix 1: must be 200)')

    // Ensure we're still on Review&Publish (in case tab DID reset, re-click for fix1 test)
    const bodyCheck = await page.evaluate(() => document.body.innerText).catch(() => '')
    if (!bodyCheck.includes('게시 파이프라인')) {
      await page.getByText('Review & Publish', { exact: true }).first().click()
      await page.waitForTimeout(1000)
    }

    // Fill title input
    const titleInput = page.locator('input[placeholder*="업로드 제목"]').first()
    await titleInput.waitFor({ timeout: 8000 }).catch(() => {})
    await titleInput.fill('E2E 테스트 업로드 초안 제목')
    await page.waitForTimeout(300)

    const uploadNetCalls = []
    page.on('response', r => {
      if (r.url().includes('createUploadDraft')) uploadNetCalls.push(`${r.status()} ${r.url().replace(API, '[API]')}`)
    })

    const uploadBtn = page.getByText('업로드 초안 생성', { exact: true }).first()
    await uploadBtn.waitFor({ timeout: 8000 }).catch(() => {})

    const isDisabled = await uploadBtn.evaluate(el => /** @type {HTMLButtonElement} */(el).disabled).catch(() => true)
    console.log(`  button disabled (should be false): ${isDisabled}`)

    await uploadBtn.click({ force: !isDisabled, timeout: 8000 }).catch(e => console.log(`  WARN upload click: ${e.message}`))
    await page.waitForTimeout(4000)

    const bodyAfterUpload = await page.evaluate(() => document.body.innerText).catch(() => '')
    const uploadSuccessText = bodyAfterUpload.includes('업로드 초안 생성 완료')
    const upload200 = uploadNetCalls.some(c => c.startsWith('200'))
    console.log(`  success text visible: ${uploadSuccessText}`)
    console.log(`  upload network calls: ${uploadNetCalls.join(', ') || '(none)'}`)

    await page.screenshot({ path: '/tmp/cmo-fix-1-upload.png', fullPage: true })
    console.log('  screenshot: /tmp/cmo-fix-1-upload.png')

    results.push({
      name: 'Fix1 업로드 초안 200',
      pass: upload200 || uploadSuccessText,
      detail: `200=${upload200} successText=${uploadSuccessText} net=${uploadNetCalls.join('|') || 'none'}`,
    })

  } catch (err) {
    console.error('Unexpected error:', err.message)
    await page.screenshot({ path: '/tmp/cmo-fix-error.png', fullPage: true }).catch(() => {})
    results.push({ name: 'CRASH', pass: false, detail: err.message })
  } finally {
    await ctx.close()
    await browser.close()
  }

  console.log('\n========== CMO Fix Verification RESULTS ==========')
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass).length
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(24)} ${r.detail}`)
  }
  console.log(`\nconsole errors: ${consoleErrors.length}`)
  if (consoleErrors.length) consoleErrors.forEach(e => console.log('  ERR:', e.slice(0, 160)))
  console.log(`network errors: ${networkErrors.length}`)
  if (networkErrors.length) networkErrors.forEach(e => console.log('  NET:', e.slice(0, 160)))
  console.log(`\nscreenshots: /tmp/cmo-fix-1-upload.png  /tmp/cmo-fix-2-tab.png`)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
  console.log('ALL PASSED')
}

main().catch(e => {
  console.error('E2E crashed:', e?.message ?? e)
  process.exit(1)
})
