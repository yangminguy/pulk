/**
 * verify-review.ts — T4(review) 완료 조건 자동 판정. Playwright 로 실브라우저(chromium) 구동.
 *
 * 입력: fixtures/harvest-project (T7 이 생성. `npx tsx scripts/verify-harvest.ts` 로 재생성됨).
 *       이 스크립트는 그 사본(fixtures/review-run)에서만 작업하고 원본은 건드리지 않는다.
 *
 * 브라우저(chromium, file://):
 *  (a) 후보 video 가 지정 source_in 으로 seek
 *  (b) source_out 에서 정지(timeupdate)
 *  (c) 결정 5건 입력 → 다운로드 파일 파싱(5건 · revision 일치)
 *  (d) 10건째에 자동 다운로드 제안 발동(body.dataset.autosave)
 *  (e) 선택(Enter) 후 자동 비트 이동 없음(cursor 유지)
 *  (f) lazy 렌더 — 뷰포트 밖 카드 video 미로드(src 없음)
 * 마우스 퍼스트 상호작용(UX2, 2026-07-25 사장님 피드백):
 *  (g) 카드 클릭 선택 → 기록 + is-selected + 자동 이동 없음
 *  (h) 클릭 선택 ↔ Enter 선택 결정 로그 형식 동일
 *  (i) 인−/아웃+ 버튼 → [ ] 와 동일 인·아웃 기록 + locked_selection:true
 *  (j) 촬영모션 드롭다운 변경 → M 키와 동일 기록
 *  (k) «AI 추천» 배지가 각 비트 점수 1위에만 존재
 *  (l) «결정 저장» 버튼 상시 노출 + 클릭 다운로드
 *  (m) «?» 도움말 오버레이 열림/닫힘
 *  (n) 진행 바 x/y가 선택에 따라 갱신 + UX2 스크린샷 3장
 * 병합(--apply):
 *  (2a) Z2만 반영 + Z1/Z3 canonical 해시 불변
 *  (2b) revision 불일치 거부 + diff / --force 강행
 *  (2c) 로그 2개 순서 뒤집어도 결과 동일(타임스탬프 순)
 *  (2d) apply 사이 harvest 재실행(candidates 재작성)해도 결정 비소실
 * 경고(순수 함수 + HTML):
 *  (3) 자동 경고 7종이 각각 발생 + 렌더 HTML 에 반영
 * 키:
 *  (4) A/C/M 키 결과가 Z2 필드로 기록 + usage.json 생성
 * 보안:
 *  (5) rg api_key|Bearer → 0건
 * 사람 판정(human_required): 전 비트 실재생 육안 + 스토리보드 승인 ② → 스크린샷 3장 첨부
 *
 * 실행:  npx tsx scripts/verify-review.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import { chromium, type Browser } from 'playwright'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadReviewInput, renderReviewHtml } from '../src/review/render.js'
import { applyDecisions } from '../src/review/apply.js'
import { computeWarnings, type TimelineShot } from '../src/review/warnings.js'
import { loadProfile } from '../src/lib/profile.js'
import { canonicalJSON } from '../src/lib/canonical.js'

// page.evaluate 콜백은 브라우저에서 실행된다. tsconfig 에 dom lib 이 없으므로(의도) 여기서 ambient 선언.
declare const document: any // eslint-disable-line
declare const window: any // eslint-disable-line

const ROOT = resolve(import.meta.dirname, '..')
const HARVEST = resolve(ROOT, 'fixtures', 'harvest-project')
const RUN = resolve(ROOT, 'fixtures', 'review-run')
const SHOTS = resolve(ROOT, 'fixtures', 'review-screenshots')
const CFG = resolve(ROOT, 'config')

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
const humanRequired: string[] = []
const screenshots: string[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

function readPlan(dir: string): { revision: number; shots: Record<string, unknown>[]; beats: Record<string, unknown>[]; segments: unknown[]; coverage_gap: unknown[] } {
  return JSON.parse(readFileSync(join(dir, 'shot-plan.json'), 'utf8'))
}

/** Z2 가 건드리면 안 되는 필드만 뽑아 canonical 직렬화(Z1 비공유 + Z3). asset_kind·emphasis_caption 은 Z1/Z2 공유라 제외. */
const Z2_FIELDS = new Set(['selection_status', 'source_id', 'source_in', 'source_out', 'file', 'rights_status',
  'locked_selection', 'asset_kind', 'source_audio', 'source_audio_in', 'source_audio_out', 'photo_motion', 'emphasis_caption'])
function nonZ2Hash(dir: string): string {
  const p = readPlan(dir)
  const shots = p.shots.map((s) => {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(s)) if (!Z2_FIELDS.has(k)) o[k] = s[k]
    return o
  }).sort((a, b) => String(a['shot_id']).localeCompare(String(b['shot_id'])))
  return canonicalJSON({ segments: p.segments, beats: p.beats, coverage_gap: p.coverage_gap ?? [], shots })
}

function freshCopy(dest: string): string {
  rmSync(dest, { recursive: true, force: true })
  cpSync(HARVEST, dest, { recursive: true })
  return dest
}

function writeLog(path: string, revision: number, decisions: unknown[], generatedAt: string): void {
  writeFileSync(path, JSON.stringify({ revision, generated_at: generatedAt, decisions }, null, 2))
}

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms: number): Promise<T> {
  const start = Date.now()
  let last = await fn()
  while (!ok(last) && Date.now() - start < ms) {
    await new Promise((r) => setTimeout(r, 100))
    last = await fn()
  }
  return last
}

/* ─────────────── 브라우저 검증 ─────────────── */

async function browserChecks(browser: Browser): Promise<void> {
  // 사본 준비 + seek/stop 관찰용으로 c001 구간을 0.8~1.6 으로 패치(프록시 2.4초 이내)
  freshCopy(RUN)
  const candPath = join(RUN, 'candidates', 'b001', 'candidates.json')
  const cands = JSON.parse(readFileSync(candPath, 'utf8')) as { candidates: Record<string, unknown>[] }
  const first = cands.candidates.find((c) => c['cand_id'] === 'c001')!
  first['source_in'] = 0.8
  first['source_out'] = 1.6
  writeFileSync(candPath, JSON.stringify(cands, null, 2))

  const input = loadReviewInput(RUN)
  const html = renderReviewHtml(input)
  const htmlPath = join(RUN, 'review.html')
  writeFileSync(htmlPath, html)
  const rev = input.revision

  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true })
  const page = await context.newPage()
  await page.goto(pathToFileURL(htmlPath).href)

  // (f) lazy — 마지막 카드는 뷰포트 밖 → video src 없음 (내비게이션 전에 먼저 검사)
  const lastSrc = await page.evaluate(() => {
    const cards = document.querySelectorAll('.shot-card')
    const last = cards[cards.length - 1]!
    const v = last.querySelector('video.cand-video')
    return v ? v.getAttribute('src') : 'no-video'
  })
  record('f-lazy-offscreen-no-src', lastSrc === null, `마지막 카드 video src=${lastSrc}(null 기대)`)

  // (a) seek to in — 첫 카드 후보 video 가 0.8 로 seek
  const seek = await waitFor(
    () => page.evaluate(() => {
      const c = document.querySelector('.shot-card[data-shot="sh0001"] .cand')
      const v = c ? c.querySelector('video.cand-video') : null
      return v ? { src: v.getAttribute('src'), rs: v.readyState, ct: v.currentTime, in: Number(c.dataset.in) } : null
    }),
    (v) => v !== null && v.src !== null && v.rs >= 1 && Math.abs(v.ct - v.in) < 0.2,
    8000,
  )
  record('a-seek-to-in', seek !== null && Math.abs(seek.ct - seek.in) < 0.2, `currentTime=${seek?.ct} in=${seek?.in} readyState=${seek?.rs}`)

  // (b) stop at out — 재생하면 1.6 에서 정지
  await page.evaluate(() => {
    const v = document.querySelector('.shot-card[data-shot="sh0001"] video.cand-video')
    const p = v.play(); if (p && p.catch) p.catch(() => {})
  })
  const stop = await waitFor(
    () => page.evaluate(() => {
      const c = document.querySelector('.shot-card[data-shot="sh0001"] .cand')
      const v = c.querySelector('video.cand-video')
      return { paused: v.paused, ct: v.currentTime, out: Number(c.dataset.out) }
    }),
    (v) => v.paused && Math.abs(v.ct - v.out) < 0.3,
    6000,
  )
  record('b-stop-at-out', stop.paused && Math.abs(stop.ct - stop.out) < 0.3, `paused=${stop.paused} currentTime=${stop.ct} out=${stop.out}`)

  // (e) 선택 후 자동 이동 없음 — Enter 전후 cursor 유지
  const before = await page.evaluate(() => window.__review.cursorShot())
  await page.keyboard.press('1')
  await page.keyboard.press('Enter')
  const after = await page.evaluate(() => window.__review.cursorShot())
  record('e-no-auto-advance', before === after && before === 'sh0001', `Enter 전=${before} 후=${after}(유지 기대)`)

  // (c) 결정 5건 → 다운로드 파싱. 이미 1건(위 e) 있으므로 4건 더 → 5건.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('k')
    await page.keyboard.press('1')
    await page.keyboard.press('Enter')
  }
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')])
  const dlPath = await dl.path()
  const parsed = JSON.parse(readFileSync(dlPath, 'utf8')) as { revision: number; decisions: unknown[] }
  record('c-download-5-decisions', parsed.decisions.length === 5 && parsed.revision === rev,
    `다운로드 decisions=${parsed.decisions.length}(5 기대) revision=${parsed.revision}(=${rev})`)

  // (d) 10건째에 자동 다운로드 발동. 현재 5건, cursor=card4. 5건 더(card5~9) → 10건.
  let autoDownloadFired = false
  page.on('download', () => { autoDownloadFired = true })
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('k')
    await page.keyboard.press('1')
    await page.keyboard.press('Enter')
  }
  const autosaveFlag = await page.evaluate(() => document.body.dataset.autosave)
  const total = await page.evaluate(() => window.__review.log.length)
  await new Promise((r) => setTimeout(r, 300))
  record('d-autosave-at-10', autosaveFlag === '10' && total === 10 && autoDownloadFired,
    `log=${total} body.autosave=${autosaveFlag}(10 기대) 자동다운로드이벤트=${autoDownloadFired}`)

  // 스크린샷 3장(사장님 검토용) — human_required
  mkdirSync(SHOTS, { recursive: true })
  const full = join(SHOTS, 'storyboard-full.png')
  await page.screenshot({ path: full, fullPage: true })
  screenshots.push(full)
  const cardEl = await page.$('.shot-card[data-shot="sh0001"]')
  if (cardEl) { const p = join(SHOTS, 'candidate-card.png'); await cardEl.screenshot({ path: p }); screenshots.push(p) }
  const photoEl = await page.$('.shot-card[data-shot="sh0001"] .cand[data-kind="image"]')
  if (photoEl) { await photoEl.scrollIntoViewIfNeeded(); const p = join(SHOTS, 'photo-motion-selector.png'); await photoEl.screenshot({ path: p }); screenshots.push(p) }
  record('screenshots-3', screenshots.length === 3, `저장 ${screenshots.length}장 → ${SHOTS}`)

  await context.close()
}

/* ─────────────── 마우스 퍼스트 상호작용(UX2) ─────────────── */
// 사장님 실사용 피드백(2026-07-25): 클릭 선택·버튼 완주·추천 배지·진행 바·도움말.
// 기존 검증 사본(review.html)을 새 컨텍스트(로그 초기 상태)에서 열어 클릭 동선을 실증한다.
async function interactionChecks(browser: Browser): Promise<void> {
  const htmlPath = join(RUN, 'review.html')
  const context = await browser.newContext({ viewport: { width: 1200, height: 950 }, acceptDownloads: true })
  const page = await context.newPage()
  await page.goto(pathToFileURL(htmlPath).href)

  // (g) 클릭 선택 — «이 장면 선택» 버튼 클릭 → 선택 기록 + is-selected + 커서 유지(자동 이동 없음)
  const beforeShot = await page.evaluate(() => window.__review.cursorShot())
  await page.click('.shot-card[data-shot="sh0001"] .cand .select-btn')
  const g = await page.evaluate(() => {
    const c = document.querySelector('.shot-card[data-shot="sh0001"] .cand')
    const l = window.__review.log
    const last = l[l.length - 1]
    return { selected: c.classList.contains('is-selected'), len: l.length, cursor: window.__review.cursorShot(),
      status: last?.selection_status, locked: last?.locked_selection }
  })
  record('g-click-select', g.selected && g.len === 1 && g.cursor === beforeShot && g.status === 'approved' && g.locked === false,
    `is-selected=${g.selected} log=${g.len} 커서유지=${g.cursor === beforeShot}(${g.cursor}) approved=${g.status === 'approved'} locked=${g.locked}(false 기대)`)

  // (h) 클릭 선택 ↔ Enter 선택 결정 로그 형식 동일 — 다음 카드로 이동해 Enter 선택 후 키 집합 비교
  await page.keyboard.press('k')
  await page.keyboard.press('1')
  await page.keyboard.press('Enter')
  const h = await page.evaluate(() => {
    const l = window.__review.log
    const click = l[0], enter = l[l.length - 1]
    return {
      clickKeys: Object.keys(click).sort().join(','),
      enterKeys: Object.keys(enter).sort().join(','),
      clickLocked: click.locked_selection, enterLocked: enter.locked_selection,
    }
  })
  record('h-click-enter-same-format', h.clickKeys === h.enterKeys && h.clickLocked === false && h.enterLocked === false,
    `클릭키=[${h.clickKeys}] Enter키=[${h.enterKeys}] 동일=${h.clickKeys === h.enterKeys}`)

  // (i) 인·아웃 버튼(인− / 아웃+) → [ ] 와 동일 결정(locked_selection:true) + 값 조정.
  //     sh0001 최상위 후보(browserChecks 가 in=0.8/out=1.6 로 패치)라 0 클램프 없이 실제 이동 관찰.
  const iBefore = await page.evaluate(() => {
    const c = document.querySelector('.shot-card[data-shot="sh0001"] .cand')
    return { in: Number(c.dataset.in), out: Number(c.dataset.out) }
  })
  await page.click('.shot-card[data-shot="sh0001"] .cand [data-trim="in"]')
  await page.click('.shot-card[data-shot="sh0001"] .cand [data-trim="out"]')
  const i = await page.evaluate(() => {
    const l = window.__review.log
    const inE = l[l.length - 2], outE = l[l.length - 1]
    const c = document.querySelector('.shot-card[data-shot="sh0001"] .cand')
    return { inNow: Number(c.dataset.in), outNow: Number(c.dataset.out),
      inLocked: inE.locked_selection, outLocked: outE.locked_selection, inStatus: inE.selection_status,
      inHasBounds: inE.source_in !== undefined && inE.source_out !== undefined, inRecorded: inE.source_in }
  })
  const expectIn = Math.max(0, iBefore.in - 0.1) // adjustEl 의 max(0,...) 클램프 반영
  const iOk = i.inLocked === true && i.outLocked === true && i.inStatus === 'approved' && i.inHasBounds
    && Math.abs(i.inNow - expectIn) < 1e-6 && Math.abs(i.outNow - (iBefore.out + 0.1)) < 1e-6
    && Math.abs(i.inRecorded - i.inNow) < 1e-6
  record('i-trim-buttons', iOk, `인−:${iBefore.in}->${i.inNow}(기대 ${expectIn}) 아웃+:${iBefore.out}->${i.outNow} locked=${i.inLocked}/${i.outLocked} status=${i.inStatus}`)

  // (j) 촬영모션 드롭다운 변경 → M 키와 동일 기록(asset_kind:image, photo_motion.type, locked:true)
  const motionSel = '.shot-card[data-shot="sh0001"] .cand[data-kind="image"] select.motion'
  const other = (await page.evaluate((sel: string) => {
    const s = document.querySelector(sel)
    const cur = s.value
    const vals = Array.prototype.map.call(s.options, (o: any) => o.value) as string[] // eslint-disable-line
    return vals.find((v) => v !== cur)
  }, motionSel)) as string
  const jBefore = await page.evaluate(() => window.__review.log.length)
  await page.selectOption(motionSel, other)
  const j = await page.evaluate(() => {
    const l = window.__review.log
    const e = l[l.length - 1]
    return { len: l.length, asset: e.asset_kind, motion: e.photo_motion && e.photo_motion.type, locked: e.locked_selection, status: e.selection_status }
  })
  record('j-motion-dropdown', j.len === jBefore + 1 && j.asset === 'image' && !!j.motion && j.locked === true && j.status === 'approved',
    `record asset=${j.asset} motion=${j.motion} locked=${j.locked} status=${j.status}`)

  // (k) «AI 추천» 배지 — 후보가 있는 각 비트에서 점수 1위(첫 후보)에만 정확히 1개
  const k = await page.evaluate(() => {
    const cards = Array.prototype.slice.call(document.querySelectorAll('.shot-card'))
    let allOk = true, count = 0, withCands = 0
    cards.forEach((card: any) => {
      const cands = Array.prototype.slice.call(card.querySelectorAll('.cand'))
      const badges = card.querySelectorAll('.ai-badge')
      count += badges.length
      if (cands.length === 0) return
      withCands++
      const firstHasBadge = cands[0].querySelector('.ai-badge') !== null
      const othersHave = cands.slice(1).some((c: any) => c.querySelector('.ai-badge') !== null)
      if (badges.length !== 1 || !firstHasBadge || othersHave) allOk = false
    })
    return { allOk, count, withCands }
  })
  record('k-ai-badge-top-only', k.allOk && k.count === k.withCands && k.withCands > 0,
    `배지 ${k.count}개 / 후보있는카드 ${k.withCands} · 각 1위에만=${k.allOk}`)

  // (n) 진행 바 x/y 갱신 — 미선택 카드 하나를 클릭 선택 → 카운트 +1, 텍스트 반영
  const target = await page.evaluate(() => {
    const cards = Array.prototype.slice.call(document.querySelectorAll('.shot-card'))
    const c = cards.find((card: any) => !card.querySelector('.cand.is-selected') && card.querySelector('.select-btn'))
    return c ? c.dataset.shot : null
  })
  const nBefore = await page.evaluate(() => window.__review.selectedCount())
  if (target) await page.click(`.shot-card[data-shot="${target}"] .cand .select-btn`)
  const n = await page.evaluate(() => ({
    cnt: window.__review.selectedCount(), txt: document.getElementById('progress').textContent,
    total: document.querySelectorAll('.shot-card').length }))
  const nOk = target !== null && n.cnt === nBefore + 1 && n.txt === `선택 완료 ${n.cnt}/${n.total} 비트`
  record('n-progress-updates', nOk, `before=${nBefore} after=${n.cnt} progress="${n.txt}"`)

  // (l) «결정 저장» 버튼 상시 노출 + 클릭 다운로드 동작
  const lVis = await page.evaluate(() => {
    const b = document.getElementById('download'); const r = b.getBoundingClientRect()
    return { visible: r.width > 0 && r.height > 0, text: b.textContent }
  })
  const [ldl] = await Promise.all([page.waitForEvent('download'), page.click('#download')])
  const lParsed = JSON.parse(readFileSync(await ldl.path(), 'utf8')) as { decisions: unknown[] }
  record('l-save-button-always', lVis.visible && Array.isArray(lParsed.decisions) && lParsed.decisions.length > 0,
    `저장버튼표시=${lVis.visible} 라벨="${lVis.text}" 다운로드 decisions=${lParsed.decisions.length}`)

  // (m) «?» 도움말 오버레이 열림/닫힘
  const mClosed0 = await page.evaluate(() => document.getElementById('help').hasAttribute('hidden'))
  await page.click('#help-btn')
  const mOpen = await page.evaluate(() => !document.getElementById('help').hasAttribute('hidden'))
  await page.click('#help-close')
  const mClosed1 = await page.evaluate(() => document.getElementById('help').hasAttribute('hidden'))
  record('m-help-overlay', mClosed0 && mOpen && mClosed1, `초기닫힘=${mClosed0} 열림=${mOpen} 재닫힘=${mClosed1}`)

  // UX2 스크린샷 3장(사장님 재확인용) — human_required
  mkdirSync(SHOTS, { recursive: true })
  const beforeCount = screenshots.length
  const hdr = await page.$('header')
  if (hdr) { const p = join(SHOTS, 'ux2-progress-save.png'); await hdr.screenshot({ path: p }); screenshots.push(p) }
  const selCard = await page.$('.shot-card[data-shot="sh0001"]')
  if (selCard) { await selCard.scrollIntoViewIfNeeded(); const p = join(SHOTS, 'ux2-selected-card.png'); await selCard.screenshot({ path: p }); screenshots.push(p) }
  await page.click('#help-btn')
  const pHelp = join(SHOTS, 'ux2-help-overlay.png'); await page.screenshot({ path: pHelp }); screenshots.push(pHelp)
  await page.click('#help-close')
  record('screenshots-ux2-3', screenshots.length - beforeCount === 3, `UX2 저장 ${screenshots.length - beforeCount}장 → ${SHOTS}`)

  await context.close()
}

/* ─────────────── 병합 검증 ─────────────── */

function needShots(dir: string): string[] {
  return readPlan(dir).shots.filter((s) => s['selection_status'] === 'need' && s['locked_selection'] !== true).map((s) => String(s['shot_id']))
}

function applyChecks(): void {
  const iso = (m: number) => new Date(Date.UTC(2026, 6, 25, 10, m, 0)).toISOString()

  // (2a) Z2만 반영 + Z1/Z3 해시 불변
  {
    const dir = freshCopy(resolve(ROOT, 'fixtures', 'review-apply'))
    const rev = readPlan(dir).revision
    const [s1, s2] = needShots(dir)
    const before = nonZ2Hash(dir)
    const log = join(dir, `review-decisions-${iso(0).replace(/[:.]/g, '-')}.json`)
    writeLog(log, rev, [
      { shot_id: s1, source_id: 'src_001', source_in: 0.5, source_out: 2.5, selection_status: 'approved', rights_status: 'licensed', asset_kind: 'official_video', locked_selection: true },
      { shot_id: s2, source_id: 'src_002', source_in: 0.4, source_out: 1.9, selection_status: 'approved', rights_status: 'permission', asset_kind: 'interview', locked_selection: true },
    ], iso(0))
    const r = applyDecisions(dir, { applyPaths: [log], force: false, human: false })
    const after = nonZ2Hash(dir)
    const plan = readPlan(dir)
    const sh = plan.shots.find((s) => s['shot_id'] === s1)!
    const z2ok = sh['selection_status'] === 'approved' && sh['source_id'] === 'src_001' && sh['locked_selection'] === true
    record('2a-z2-only-hash-stable', r.exitCode === 0 && before === after && z2ok,
      `exit=${r.exitCode} Z1/Z3해시불변=${before === after} Z2반영=${z2ok}`)
    rmSync(dir, { recursive: true, force: true })
  }

  // (2b) revision 불일치 거부 + diff / --force
  {
    const dir = freshCopy(resolve(ROOT, 'fixtures', 'review-revmis'))
    const rev = readPlan(dir).revision
    const [s1] = needShots(dir)
    const log = join(dir, `review-decisions-${iso(1).replace(/[:.]/g, '-')}.json`)
    writeLog(log, rev + 99, [{ shot_id: s1, source_id: 'src_001', source_in: 0, source_out: 2, selection_status: 'approved', rights_status: 'licensed', asset_kind: 'official_video' }], iso(1))
    const rejected = applyDecisions(dir, { applyPaths: [log], force: false, human: false })
    const forced = applyDecisions(dir, { applyPaths: [log], force: true, human: false })
    const hasDiff = rejected.summary.rejected !== undefined && rejected.summary.rejected.diff.length === 1
    record('2b-revision-reject-diff', rejected.exitCode === 1 && hasDiff && forced.exitCode === 0,
      `거부 exit=${rejected.exitCode} diff=${hasDiff} --force exit=${forced.exitCode}`)
    rmSync(dir, { recursive: true, force: true })
  }

  // (2c) 로그 2개 순서 뒤집어도 결과 동일(타임스탬프 순, 나중 승리)
  {
    const build = (dest: string, order: 'ab' | 'ba'): string => {
      const dir = freshCopy(resolve(ROOT, 'fixtures', dest))
      const rev = readPlan(dir).revision
      const [s1] = needShots(dir)
      const logA = join(dir, `review-decisions-${iso(0).replace(/[:.]/g, '-')}.json`) // 이른 시각
      const logB = join(dir, `review-decisions-${iso(5).replace(/[:.]/g, '-')}.json`) // 늦은 시각
      writeLog(logA, rev, [{ shot_id: s1, source_id: 'src_001', source_in: 0, source_out: 1, selection_status: 'approved', rights_status: 'licensed', asset_kind: 'official_video' }], iso(0))
      writeLog(logB, rev, [{ shot_id: s1, source_id: 'src_002', source_in: 2, source_out: 3, selection_status: 'approved', rights_status: 'permission', asset_kind: 'interview' }], iso(5))
      const paths = order === 'ab' ? [logA, logB] : [logB, logA]
      applyDecisions(dir, { applyPaths: paths, force: false, human: false })
      const sh = readPlan(dir).shots.find((s) => s['shot_id'] === s1)!
      const sig = `${sh['source_id']}/${sh['source_in']}/${sh['source_out']}`
      rmSync(dir, { recursive: true, force: true })
      return sig
    }
    const ab = build('review-order-ab', 'ab')
    const ba = build('review-order-ba', 'ba')
    record('2c-order-independent', ab === ba && ab === 'src_002/2/3', `[A,B]=${ab} [B,A]=${ba} (나중 B 승리 기대)`)
  }

  // (2d) apply 사이 harvest 재실행(candidates 재작성)해도 결정 비소실
  {
    const dir = freshCopy(resolve(ROOT, 'fixtures', 'review-harvestmid'))
    const rev0 = readPlan(dir).revision
    const need = needShots(dir)
    const shotA = need[0]!, shotB = need[1]!
    const logA = join(dir, `review-decisions-${iso(0).replace(/[:.]/g, '-')}.json`)
    writeLog(logA, rev0, [{ shot_id: shotA, source_id: 'src_001', source_in: 0, source_out: 2, selection_status: 'approved', rights_status: 'licensed', asset_kind: 'official_video' }], iso(0))
    applyDecisions(dir, { applyPaths: [logA], force: false, human: false })
    const logBytesBefore = readFileSync(logA, 'utf8')
    // harvest 재실행 시뮬 — candidates 파일 재작성(결정 로그·shot-plan Z2 는 건드리지 않음)
    const candFile = join(dir, 'candidates', 'b003', 'candidates.json')
    if (existsSync(candFile)) { const c = JSON.parse(readFileSync(candFile, 'utf8')); c.rerank_pending = true; writeFileSync(candFile, JSON.stringify(c, null, 2)) }
    const logBytesAfter = readFileSync(logA, 'utf8')
    const rev1 = readPlan(dir).revision
    const logB = join(dir, `review-decisions-${iso(9).replace(/[:.]/g, '-')}.json`)
    writeLog(logB, rev1, [{ shot_id: shotB, source_id: 'src_002', source_in: 0, source_out: 2, selection_status: 'approved', rights_status: 'permission', asset_kind: 'interview' }], iso(9))
    applyDecisions(dir, { applyPaths: [logB], force: false, human: false })
    const plan = readPlan(dir)
    const aKept = plan.shots.find((s) => s['shot_id'] === shotA)!['source_id'] === 'src_001'
    const bAdded = plan.shots.find((s) => s['shot_id'] === shotB)!['source_id'] === 'src_002'
    record('2d-harvest-mid-no-loss', logBytesBefore === logBytesAfter && aKept && bAdded,
      `결정로그불변=${logBytesBefore === logBytesAfter} A보존=${aKept} B추가=${bAdded}`)
    rmSync(dir, { recursive: true, force: true })
  }
}

/* ─────────────── 경고 7종 ─────────────── */

function mkShot(o: Partial<TimelineShot> & { shot_id: string }): TimelineShot {
  return { start: 0, end: 3, asset_kind: 'official_video', beat_ids: ['b001'], ...o }
}

function warningChecks(): void {
  const profile = loadProfile(CFG)
  const critical = new Map([['bC', 'critical']])
  const normal = new Map([['bN', 'normal']])

  const cases: { code: string; input: Parameters<typeof computeWarnings>[0] }[] = [
    { code: 'w1', input: { profile, totalSec: 60, beatImportance: normal, shots: [
      mkShot({ shot_id: 's1', source_id: 'src_x', start: 0, end: 6 }),
      mkShot({ shot_id: 's2', source_id: 'src_x', start: 6, end: 12 }) ] } },
    { code: 'w2', input: { profile, totalSec: 60, beatImportance: normal, shots: [
      mkShot({ shot_id: 's1', framing: 'wide', start: 0, end: 2 }),
      mkShot({ shot_id: 's2', framing: 'wide', start: 2, end: 4 }),
      mkShot({ shot_id: 's3', framing: 'wide', start: 4, end: 6 }),
      mkShot({ shot_id: 's4', framing: 'wide', start: 6, end: 8 }) ] } },
    { code: 'w3', input: { profile, totalSec: 60, beatImportance: critical, shots: [
      mkShot({ shot_id: 's1', asset_kind: 'image', beat_ids: ['bC'], start: 0, end: 9 }) ] } },
    { code: 'w4', input: { profile, totalSec: 30, beatImportance: normal, shots: [
      mkShot({ shot_id: 's1', start: 0, end: 3 }) ] } },
    { code: 'w5', input: { profile, totalSec: 30, beatImportance: normal, shots: [
      mkShot({ shot_id: 's1', asset_kind: 'caption_card', start: 0, end: 2 }),
      mkShot({ shot_id: 's2', asset_kind: 'caption_card', start: 2, end: 4 }) ] } },
    { code: 'w6', input: { profile, totalSec: 60, beatImportance: normal, shots: [
      mkShot({ shot_id: 's1', source_audio: 'quote', start: 0, end: 2 }),
      mkShot({ shot_id: 's2', source_audio: 'quote', start: 5, end: 7 }) ] } },
    { code: 'w7', input: { profile, totalSec: 60, beatImportance: normal, shots: [
      mkShot({ shot_id: 's1', asset_kind: 'image', beat_ids: ['bN'], start: 0, end: 3 }) ] } },
  ]
  let allFired = true
  const fired: string[] = []
  for (const c of cases) {
    const codes = computeWarnings(c.input).map((w) => w.code)
    if (codes.includes(c.code as never)) fired.push(c.code)
    else { allFired = false; process.stderr.write(`  경고 ${c.code} 미발생 (실제: ${codes.join(',') || '없음'})\n`) }
  }
  record('3-warnings-7-fire', allFired && fired.length === 7, `발생 ${fired.join(',')} (7종 기대)`)

  // HTML 반영 — w1+w3 유발 픽스처를 렌더하고 클래스 grep
  const dir = resolve(ROOT, 'fixtures', 'review-warn')
  buildWarnFixture(dir)
  const input = loadReviewInput(dir)
  const html = renderReviewHtml(input)
  const codesInHtml = ['w1', 'w3'].filter((c) => html.includes(`warn ${c}`))
  record('3b-warnings-in-html', codesInHtml.length === 2, `HTML 경고 클래스=${codesInHtml.join(',')} (w1,w3 기대)`)
  rmSync(dir, { recursive: true, force: true })
}

/** w1(같은 원본 12초)+w3(정지 9초) 유발용 최소 프로젝트. */
function buildWarnFixture(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'sources'), { recursive: true })
  copyFileSync(join(CFG, 'edit-profile.json'), join(dir, 'edit-profile.json'))
  copyFileSync(join(CFG, 'frame.md'), join(dir, 'frame.md'))
  writeFileSync(join(dir, 'sources', 'catalog.json'), JSON.stringify([
    { source_id: 'src_x', title: 'x', publisher: 'p', original_url: 'https://e.example.com/x', kind: 'official_video', rights_status: 'licensed' },
    { source_id: 'src_img', title: 'img', publisher: 'p', original_url: 'https://e.example.com/i', kind: 'image', rights_status: 'public_domain' },
  ], null, 2))
  const anchor = { sentence_key: 's0000001', offset_sec: 0 }
  const beats = [
    { beat_id: 'b001', segment_id: 'g01', narration: 'n1', start: 0, end: 6, visual_function: 'evidence', importance: 'critical', search_intent: 'i1', anchor, timing_rev: 1 },
    { beat_id: 'b002', segment_id: 'g01', narration: 'n2', start: 6, end: 12, visual_function: 'evidence', importance: 'critical', search_intent: 'i2', anchor, timing_rev: 1 },
    { beat_id: 'b003', segment_id: 'g01', narration: 'n3', start: 12, end: 21, visual_function: 'literal', importance: 'critical', search_intent: 'i3', anchor, timing_rev: 1 },
  ]
  const shots = [
    { shot_id: 'sh0001', beat_ids: ['b001'], start: 0, end: 6, asset_kind: 'official_video', purpose: 'p1', selection_status: 'approved', rights_status: 'licensed', source_id: 'src_x', source_in: 0, source_out: 6, anchor, timing_rev: 1 },
    { shot_id: 'sh0002', beat_ids: ['b002'], start: 6, end: 12, asset_kind: 'official_video', purpose: 'p2', selection_status: 'approved', rights_status: 'licensed', source_id: 'src_x', source_in: 6, source_out: 12, anchor, timing_rev: 1 },
    { shot_id: 'sh0003', beat_ids: ['b003'], start: 12, end: 21, asset_kind: 'image', purpose: 'p3', selection_status: 'approved', rights_status: 'public_domain', source_id: 'src_img', source_in: 0, source_out: 9, anchor, timing_rev: 1, photo_motion: { type: 'parallax', focal: [0.5, 0.5], zoom: [1, 1.18], duration_sec: 9 } },
  ]
  writeFileSync(join(dir, 'shot-plan.json'), JSON.stringify({
    project: 'review-warn', revision: 1, profile_rev: 1, frame_rev: 1,
    writers: { plan_rev: 1, review_rev: 1, reanchor_rev: 1, seal: 'x' }, coverage_gap: [],
    segments: [{ segment_id: 'g01', act: 'hook' }], beats, shots,
  }, null, 2))
}

/* ─────────────── A/C/M → Z2 + usage ─────────────── */

function keyChecks(): void {
  const dir = freshCopy(resolve(ROOT, 'fixtures', 'review-keys'))
  const rev = readPlan(dir).revision
  const need = needShots(dir)
  const [sA, sC, sM, sV] = need
  const iso = new Date(Date.UTC(2026, 6, 25, 11, 0, 0)).toISOString()
  const log = join(dir, `review-decisions-${iso.replace(/[:.]/g, '-')}.json`)
  writeLog(log, rev, [
    { shot_id: sA, asset_kind: 'a_roll', selection_status: 'approved', rights_status: 'owned', locked_selection: true },
    { shot_id: sC, asset_kind: 'caption_card', selection_status: 'approved', rights_status: 'owned', emphasis_caption: '45만 원', locked_selection: true },
    { shot_id: sM, source_id: 'src_img1', source_in: 0, source_out: 3, asset_kind: 'image', selection_status: 'approved', rights_status: 'public_domain', photo_motion: { type: 'ken_burns' }, locked_selection: true },
    { shot_id: sV, source_id: 'src_001', source_in: 0.5, source_out: 2.5, asset_kind: 'official_video', selection_status: 'approved', rights_status: 'licensed', locked_selection: true },
  ], iso)
  const r = applyDecisions(dir, { applyPaths: [log], force: false, human: false })
  const plan = readPlan(dir)
  const g = (id: string) => plan.shots.find((s) => s['shot_id'] === id)!
  const aOk = g(sA!)['asset_kind'] === 'a_roll'
  const cOk = g(sC!)['asset_kind'] === 'caption_card' && g(sC!)['emphasis_caption'] === '45만 원'
  const mShot = g(sM!)
  const mOk = mShot['asset_kind'] === 'image' && (mShot['photo_motion'] as { type: string }).type === 'ken_burns'
  const usagePath = join(dir, 'sources', 'usage.json')
  const usage = existsSync(usagePath) ? (JSON.parse(readFileSync(usagePath, 'utf8')) as unknown[]) : []
  const usageHasV = usage.some((u) => (u as { shot_id: string }).shot_id === sV && (u as { source_id: string }).source_id === 'src_001')
  record('4-keys-z2-usage', r.exitCode === 0 && aOk && cOk && mOk && usage.length > 0 && usageHasV,
    `A=a_roll:${aOk} C=caption+cap:${cOk} M=image+ken_burns:${mOk} usage=${usage.length}건 V포함=${usageHasV}`)
  rmSync(dir, { recursive: true, force: true })
}

/* ─────────────── 보안 ─────────────── */

function secretChecks(): void {
  const htmlPath = join(RUN, 'review.html')
  const rg = spawnSync('rg', ['-i', 'api[_-]?key|Bearer ', htmlPath], { encoding: 'utf8' })
  record('5-no-secrets', rg.status === 1, `rg status=${rg.status}(1=매치없음) review.html`)
}

/* ─────────────── main ─────────────── */

async function main(): Promise<void> {
  if (!existsSync(HARVEST) || !existsSync(join(HARVEST, 'candidates', 'b001', 'c001.mp4'))) {
    process.stderr.write('harvest-project 픽스처 없음 — 먼저 `npx tsx scripts/verify-harvest.ts` 실행\n')
    console.log(JSON.stringify({ pass: false, reason: 'no-fixture' }))
    process.exitCode = 1
    return
  }

  const browser = await chromium.launch()
  try {
    await browserChecks(browser)
    await interactionChecks(browser)
  } finally {
    await browser.close()
  }

  applyChecks()
  warningChecks()
  keyChecks()
  secretChecks()

  humanRequired.push('전 비트 동영상 후보를 실제 인·아웃 구간으로 육안 재생 확인 (스토리보드 승인 ②)')
  humanRequired.push('훅 30초 + reveal 전체 연속 재생 승인')
  humanRequired.push('스크린샷 3장 육안 검토: ' + screenshots.join(', '))

  rmSync(RUN, { recursive: true, force: true }) // 브라우저 작업 사본 정리(원본 harvest-project 는 불변)

  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks, human_required: humanRequired, screenshots }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
  process.stderr.write(`human_required(자동 통과 금지): ${humanRequired.length}건\n`)
  if (!allPass) process.exitCode = 1
}

main().catch((err: unknown) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`)
  process.exitCode = 1
})
