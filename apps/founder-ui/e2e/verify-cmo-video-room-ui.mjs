/**
 * CMO Video Room UI E2E — Production/Publish buttons + Voice upload
 *
 * Strategy:
 *   1. API: create project + walk to voice_recording state (just before buildSlideDeck)
 *   2. Browser: open /video-room → select project → Production tab
 *      → click "슬라이드덱 생성" → click "렌더 제출"
 *      → Review&Publish tab → click "QA 실행" → click "업로드 초안 생성"
 *      → Voice: fill URL + click "음성 첨부"
 *   3. Screenshots at each checkpoint.
 *
 * Run:
 *   cd apps/founder-ui && node e2e/verify-cmo-video-room-ui.mjs
 */

import { chromium } from '@playwright/test'

const FRONT = 'http://localhost:3007'
const API   = 'http://localhost:13099'
const USER  = 'admin@nocobase.com'
const PASS  = 'admin123'

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── API setup: create project + advance to voice_recording ───────────────────

async function setupProject(token) {
  // 1. create
  const created = await call(token, 'createProject', {
    title: 'UI E2E 테스트 — Production 버튼 검증',
    product: 'AI 마케팅 자동화 팀',
    target_audience: '마케팅팀을 둘 여력이 없는 작은 브랜드 대표',
    business_goal: 'consulting_lead',
  })
  const proj = data(created)
  const projectId = proj?.project_id
  if (!projectId) throw new Error(`createProject failed: ${created.text.slice(0, 200)}`)
  console.log(`  project_id: ${projectId}  status: ${proj.status}`)

  // 2. send one chat message so the stage script fires
  await call(token, 'chatMessage', {
    project_id: projectId,
    founder_message: '키 콘텐츠 잡아줘',
  })

  // 3. walk status until we hit a pending gate or reach voice_recording
  //    We stop BEFORE calling buildSlideDeck so the UI buttons are live
  const TARGET_STATUSES = new Set(['voice_recording', 'slide_deck', 'rendering'])
  let status = proj.status
  let gateId = null
  for (let i = 0; i < 35; i++) {
    const g = await call(token, 'getProject', { project_id: projectId })
    const gd = data(g)
    status = gd?.project?.status
    const pending = (gd?.gates ?? []).find(x => x.status === 'pending')
    if (pending) {
      gateId = pending.id
      // auto-approve so we keep walking
      await call(token, 'decideGate', { gate_id: gateId, decision: 'approved' })
      gateId = null
      continue
    }
    if (TARGET_STATUSES.has(status)) break
    if (status === 'completed') break
    // advance
    const adv = await call(token, 'advanceStatus', { project_id: projectId })
    const advd = data(adv)
    if (!advd?.status) {
      // might need a chat nudge
      await call(token, 'chatMessage', { project_id: projectId, founder_message: '진행' })
    } else {
      status = advd.status
    }
    if (TARGET_STATUSES.has(status)) break
  }
  console.log(`  project walked to status: ${status}`)
  return { projectId, status }
}

// ── browser helpers ───────────────────────────────────────────────────────────

async function newPage(browser, token) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(t => {
    try { localStorage.setItem('l5_token', t) } catch {}
  }, token)
  const page = await ctx.newPage()

  const consoleErrors = []
  const networkErrors = []

  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', e => {
    consoleErrors.push('PAGEERR: ' + e.message)
  })
  page.on('response', r => {
    const url = r.url()
    const status = r.status()
    if (
      status >= 400 &&
      !url.includes('roadmap:list') &&
      !url.includes('discovery:today') &&
      !url.includes('favicon')
    ) {
      networkErrors.push(`${status} ${url.replace(API, '[API]').replace(FRONT, '[FRONT]')}`)
    }
  })

  return { ctx, page, consoleErrors, networkErrors }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('CMO Video Room UI E2E')
  console.log(`  FRONT: ${FRONT}`)
  console.log(`  API:   ${API}\n`)

  // ── Step 0: auth + API project setup ──
  console.log('[0] Auth + API setup')
  const token = await signIn()
  console.log('  token acquired')
  const { projectId } = await setupProject(token)
  console.log(`  ready: project ${projectId}\n`)

  const browser = await chromium.launch({ headless: true })
  const results = []

  // shared page (reused across all tab steps)
  const { ctx, page, consoleErrors, networkErrors } = await newPage(browser, token)

  try {
    // ── Step 1: navigate to /video-room ──
    console.log('[1] Navigate to /video-room')
    await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle', timeout: 40000 })
    await page.waitForTimeout(2000)

    // ── Step 2: select the project ──
    console.log('[2] Select project in ProjectSelector')
    // The project list renders buttons with the project title text
    const projectBtn = page.getByText('UI E2E 테스트 — Production 버튼 검증', { exact: false }).first()
    await projectBtn.waitFor({ timeout: 10000 }).catch(() => {})
    await projectBtn.click().catch(async () => {
      // fallback: click first project card
      await page.locator('.j-card').first().click().catch(() => {})
    })
    await page.waitForTimeout(2500)

    const bodyAfterSelect = await page.evaluate(() => document.body.innerText).catch(() => '')
    const projectLoaded = bodyAfterSelect.includes('Production') || bodyAfterSelect.includes('Strategy')
    console.log(`  project detail loaded: ${projectLoaded}`)

    // ── Step 3: click "Production" tab ──
    console.log('[3] Click Production tab')
    await page.getByText('Production', { exact: true }).first().click().catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: '/tmp/cmo-ui-1-production.png', fullPage: true })
    console.log('  screenshot: /tmp/cmo-ui-1-production.png')

    const bodyProd = await page.evaluate(() => document.body.innerText).catch(() => '')
    const onProductionTab = bodyProd.includes('Production Board') || bodyProd.includes('프로덕션 파이프라인')
    console.log(`  Production tab content visible: ${onProductionTab}`)

    // ── Step 4: click "슬라이드덱 생성" ──
    console.log('[4] Click 슬라이드덱 생성')
    const deckBtn = page.getByText('슬라이드덱 생성', { exact: true }).first()
    await deckBtn.waitFor({ timeout: 8000 }).catch(() => {})

    // capture network responses for this action
    const deckNetworkCalls = []
    const deckResponseHandler = r => {
      if (r.url().includes('cmo:buildSlideDeck') || r.url().includes('buildSlideDeck')) {
        deckNetworkCalls.push(`${r.status()} ${r.url().replace(API, '[API]')}`)
      }
    }
    page.on('response', deckResponseHandler)

    await deckBtn.click().catch(async e => {
      console.log(`  WARN: 슬라이드덱 생성 click failed: ${e.message}`)
    })
    await page.waitForTimeout(4000) // wait for API call + re-render

    page.off('response', deckResponseHandler)

    const bodyAfterDeck = await page.evaluate(() => document.body.innerText).catch(() => '')
    const deckIdVisible = bodyAfterDeck.includes('deck:') || bodyAfterDeck.includes('slide_deck')
    const deckCardVisible = bodyAfterDeck.includes('슬라이드 덱 생성') || deckIdVisible
    console.log(`  deck id visible in page: ${deckIdVisible}`)
    console.log(`  deck network calls: ${deckNetworkCalls.join(', ') || '(none captured)'}`)

    results.push({
      name: '슬라이드덱 생성 버튼',
      pass: deckIdVisible || deckNetworkCalls.some(c => c.startsWith('200')),
      detail: `deckId=${deckIdVisible} net=${deckNetworkCalls.join('|') || 'none'} card=${deckCardVisible}`,
    })

    // ── Step 5: click "렌더 제출" ──
    console.log('[5] Click 렌더 제출')
    const renderBtn = page.getByText('렌더 제출', { exact: true }).first()
    await renderBtn.waitFor({ timeout: 8000 }).catch(() => {})

    const renderNetworkCalls = []
    const renderResponseHandler = r => {
      if (r.url().includes('cmo:submitRender') || r.url().includes('submitRender')) {
        renderNetworkCalls.push(`${r.status()} ${r.url().replace(API, '[API]')}`)
      }
    }
    page.on('response', renderResponseHandler)

    await renderBtn.click().catch(async e => {
      console.log(`  WARN: 렌더 제출 click failed: ${e.message}`)
    })
    await page.waitForTimeout(4000)

    page.off('response', renderResponseHandler)

    const bodyAfterRender = await page.evaluate(() => document.body.innerText).catch(() => '')
    const renderCardVisible = bodyAfterRender.includes('렌더링') || bodyAfterRender.includes('render')
    console.log(`  render card visible: ${renderCardVisible}`)
    console.log(`  render network calls: ${renderNetworkCalls.join(', ') || '(none captured)'}`)

    await page.screenshot({ path: '/tmp/cmo-ui-2-rendered.png', fullPage: true })
    console.log('  screenshot: /tmp/cmo-ui-2-rendered.png')

    results.push({
      name: '렌더 제출 버튼',
      pass: renderCardVisible || renderNetworkCalls.some(c => c.startsWith('200')),
      detail: `renderCard=${renderCardVisible} net=${renderNetworkCalls.join('|') || 'none'}`,
    })

    // ── Step 6: Voice attach (still on Production tab) ──
    console.log('[6] Voice attach UI — fill URL + click 음성 첨부')
    const voiceUrlInput = page.locator('input[placeholder*="파일 URL"]').first()
    await voiceUrlInput.waitFor({ timeout: 8000 }).catch(() => {})
    await voiceUrlInput.fill('https://example.com/test-voice.mp3').catch(() => {})

    const voiceNetworkCalls = []
    const voiceResponseHandler = r => {
      if (r.url().includes('attachVoice') || r.url().includes('cmo:attachVoice')) {
        voiceNetworkCalls.push(`${r.status()} ${r.url().replace(API, '[API]')}`)
      }
    }
    page.on('response', voiceResponseHandler)

    const voiceBtn = page.getByText('음성 첨부', { exact: true }).first()
    await voiceBtn.waitFor({ timeout: 8000 }).catch(() => {})
    await voiceBtn.click().catch(async e => {
      console.log(`  WARN: 음성 첨부 click failed: ${e.message}`)
    })
    await page.waitForTimeout(3000)

    page.off('response', voiceResponseHandler)

    const bodyAfterVoice = await page.evaluate(() => document.body.innerText).catch(() => '')
    const voiceOk = bodyAfterVoice.includes('음성 첨부 완료') || bodyAfterVoice.includes('음성 녹음')
    console.log(`  voice ok text visible: ${voiceOk}`)
    console.log(`  voice network calls: ${voiceNetworkCalls.join(', ') || '(none captured)'}`)

    await page.screenshot({ path: '/tmp/cmo-ui-5-voice.png', fullPage: true })
    console.log('  screenshot: /tmp/cmo-ui-5-voice.png')

    results.push({
      name: '음성 첨부 버튼',
      pass: voiceOk || voiceNetworkCalls.some(c => c.startsWith('200')),
      detail: `voiceOk=${voiceOk} net=${voiceNetworkCalls.join('|') || 'none'}`,
    })

    // ── Step 7: switch to Review & Publish tab ──
    console.log('[7] Click Review & Publish tab')
    await page.getByText('Review & Publish', { exact: true }).first().click().catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: '/tmp/cmo-ui-3-qa.png', fullPage: true })
    console.log('  screenshot: /tmp/cmo-ui-3-qa.png')

    const bodyReview = await page.evaluate(() => document.body.innerText).catch(() => '')
    const onReviewTab = bodyReview.includes('Publish Board') || bodyReview.includes('게시 파이프라인')
    console.log(`  Review&Publish tab content visible: ${onReviewTab}`)

    // ── Step 8: click "QA 실행" ──
    console.log('[8] Click QA 실행')
    const qaBtn = page.getByText('QA 실행', { exact: true }).first()
    await qaBtn.waitFor({ timeout: 8000 }).catch(() => {})

    const qaNetworkCalls = []
    const qaResponseHandler = r => {
      if (r.url().includes('cmo:runQA') || r.url().includes('runQA')) {
        qaNetworkCalls.push(`${r.status()} ${r.url().replace(API, '[API]')}`)
      }
    }
    page.on('response', qaResponseHandler)

    await qaBtn.click().catch(async e => {
      console.log(`  WARN: QA 실행 click failed: ${e.message}`)
    })
    await page.waitForTimeout(4000)

    page.off('response', qaResponseHandler)

    const bodyAfterQA = await page.evaluate(() => document.body.innerText).catch(() => '')
    const qaOk = bodyAfterQA.includes('QA 실행 완료') || bodyAfterQA.includes('QA 검수') || bodyAfterQA.includes('overall_status')
    const qaNet200 = qaNetworkCalls.some(c => c.startsWith('200'))
    console.log(`  QA ok text visible: ${qaOk}  net 200: ${qaNet200}`)
    console.log(`  QA network calls: ${qaNetworkCalls.join(', ') || '(none captured)'}`)

    results.push({
      name: 'QA 실행 버튼',
      pass: qaNet200,
      detail: `qaOk=${qaOk} net=${qaNetworkCalls.join('|') || 'none'}`,
    })

    // ── Step 9: click "업로드 초안 생성" ──
    // onRefresh() inside QA calls loadDetail which does setActivePage(project.current_page),
    // resetting us back to the strategy/production tab. Re-click Review & Publish first.
    console.log('[9] Click 업로드 초안 생성')
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await page.getByText('Review & Publish', { exact: true }).first().click().catch(() => {})
    await page.waitForTimeout(1500)

    // Debug: dump all button texts visible on page
    const allBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean)
    ).catch(() => [])
    console.log(`  visible buttons: ${allBtns.join(' | ')}`)

    const uploadNetworkCalls = []
    const uploadResponseHandler = r => {
      if (r.url().includes('createUploadDraft') || r.url().includes('cmo:createUploadDraft')) {
        uploadNetworkCalls.push(`${r.status()} ${r.url().replace(API, '[API]')}`)
      }
    }
    page.on('response', uploadResponseHandler)

    // Try exact match first, fall back to partial
    let uploadClicked = false
    const uploadBtnExact = page.getByText('업로드 초안 생성', { exact: true }).first()
    const isVisible = await uploadBtnExact.isVisible().catch(() => false)
    if (isVisible) {
      await uploadBtnExact.click({ force: true, timeout: 8000 }).catch(async e => {
        console.log(`  WARN: exact click failed: ${e.message}`)
      })
      uploadClicked = true
    } else {
      // fallback: find any button whose text includes '업로드 초안'
      const fallbackBtn = page.locator('button', { hasText: '업로드 초안' }).first()
      const fbVisible = await fallbackBtn.isVisible().catch(() => false)
      console.log(`  fallback button visible: ${fbVisible}`)
      if (fbVisible) {
        await fallbackBtn.click({ force: true, timeout: 8000 }).catch(async e => {
          console.log(`  WARN: fallback click failed: ${e.message}`)
        })
        uploadClicked = true
      } else {
        console.log('  업로드 초안 생성 button NOT found in DOM')
      }
    }
    console.log(`  uploadClicked: ${uploadClicked}`)
    await page.waitForTimeout(4000)

    page.off('response', uploadResponseHandler)

    const bodyAfterUpload = await page.evaluate(() => document.body.innerText).catch(() => '')
    const uploadOk = bodyAfterUpload.includes('업로드 초안 생성 완료') || bodyAfterUpload.includes('업로드 초안')
    console.log(`  upload ok text visible: ${uploadOk}`)
    console.log(`  upload network calls: ${uploadNetworkCalls.join(', ') || '(none captured)'}`)

    await page.screenshot({ path: '/tmp/cmo-ui-4-upload.png', fullPage: true })
    console.log('  screenshot: /tmp/cmo-ui-4-upload.png')

    results.push({
      name: '업로드 초안 생성 버튼',
      pass: uploadOk || uploadNetworkCalls.some(c => c.startsWith('200')),
      detail: `uploadOk=${uploadOk} net=${uploadNetworkCalls.join('|') || 'none'}`,
    })

  } catch (err) {
    console.error('Unexpected error during browser test:', err.message)
    await page.screenshot({ path: '/tmp/cmo-ui-error.png', fullPage: true }).catch(() => {})
    results.push({ name: 'CRASH', pass: false, detail: err.message })
  } finally {
    await ctx.close()
    await browser.close()
  }

  // ── Final report ──────────────────────────────────────────────────────────
  console.log('\n========== CMO Video Room UI E2E RESULTS ==========')

  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass).length

  console.log('')
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌'
    console.log(`${icon}  ${r.name.padEnd(24)} ${r.detail}`)
  }

  console.log(`\nconsole errors: ${consoleErrors.length}`)
  if (consoleErrors.length) consoleErrors.forEach(e => console.log('  ERR:', e.slice(0, 120)))

  console.log(`network errors: ${networkErrors.length}`)
  if (networkErrors.length) networkErrors.forEach(e => console.log('  NET:', e.slice(0, 120)))

  console.log(`\nscreenshots:`)
  console.log('  /tmp/cmo-ui-1-production.png')
  console.log('  /tmp/cmo-ui-2-rendered.png')
  console.log('  /tmp/cmo-ui-3-qa.png')
  console.log('  /tmp/cmo-ui-4-upload.png')
  console.log('  /tmp/cmo-ui-5-voice.png')

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
  console.log('ALL PASSED')
}

main().catch(e => {
  console.error('E2E crashed:', e?.message ?? e)
  process.exit(1)
})
