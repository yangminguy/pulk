/**
 * verify-harvest.ts — T7 Part B(harvest) 완료 조건 자동 판정. **네트워크 0회**(DI 로컬 env/어댑터).
 *
 * fixtures/align-project 의 timeline/edit-profile/frame 을 복사·확장해 fixtures/harvest-project 를 만들고
 * ffmpeg 로 더미 소스 mp4 를 생성한다. 검증:
 *  (a) 전 비트 프록시 생성 + probe 재생 가능
 *  (b) 사진은 critical 비트에만 + parallax 초기값 + 15분당 상한 준수
 *  (c) 용량 예산 초과 → 경고(무단 절단 금지)
 *  (d) critical 후보 0 → blocked + exit1 + 7단계 대안 동봉
 *  (e) --only 범위 밖 critical 미달 → deferred_blocked + exit0
 *  (f) 캐시 히트(재실행) → 어댑터/다운로드 호출 0 (카운터 실증)
 *  (g) rg 'api_key|Bearer' → 0건 (비밀값 미기록)
 *  (h) t0b 픽스처 5의도에 프로덕션 인덱스 → hit@5 ≥ 1.0 (프로토타입 점수 회귀)
 *  (i) 고화질(stage hires) → manifest 생성 + shot-plan.json 무변경(해시 비교)
 *
 * 실행:  npx tsx scripts/verify-harvest.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { runHarvest } from '../src/commands/harvest.js'
import { loadProfile, type EditProfile } from '../src/lib/profile.js'
import { ffmpegBin } from '../src/lib/probe.js'
import { run } from '../src/lib/proc.js'
import { sha256File } from '../src/lib/canonical.js'
import { buildIndex, search, type Transcript, type SearchConfig } from '../src/harvest/index.js'
import type { HarvestEnv, HarvestAdapter } from '../src/harvest/types.js'

const ROOT = resolve(import.meta.dirname, '..')
const BASE = resolve(ROOT, 'fixtures', 'harvest-project')
const MEDIA = resolve(ROOT, 'fixtures', 'harvest-media')
const ALIGN = resolve(ROOT, 'fixtures', 'align-project')
const CFG = resolve(ROOT, 'config')

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

/* ─────────────── 소스 mp4 생성 ─────────────── */
function genVideo(out: string, size: string, durSec: number): void {
  const r = spawnSync(ffmpegBin(), ['-y', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=15:duration=${durSec}`, '-pix_fmt', 'yuv420p', out], { encoding: 'utf8' })
  if (r.status !== 0) { process.stderr.write(`${r.stderr ?? ''}\n`); throw new Error(`ffmpeg 생성 실패: ${out}`) }
}

/* ─────────────── 자막 ─────────────── */
const SENTENCES = [
  '브랜드보이가 새로운 광고를 공개했습니다',
  '매출이 크게 늘었습니다',
  '그 광고는 1988년에 처음 나왔습니다',
  '많은 사람들이 아직도 그것을 기억합니다',
  '결국 그 브랜드는 크게 성장했습니다',
  '그것이 우리가 배운 교훈입니다',
  '진행자가 마무리 정리를 합니다',
  '브랜드 이야기의 배경을 설명합니다',
]
const SEG_DUR = 0.3
function transcriptSegments(): { start: number; end: number; text: string }[] {
  return SENTENCES.map((t, i) => ({ start: Number((i * SEG_DUR).toFixed(3)), end: Number((i * SEG_DUR + SEG_DUR).toFixed(3)), text: t }))
}

/* ─────────────── 비트/샷 ─────────────── */
interface BeatDef { beat_id: string; segment_id: string; importance: string; visual_function: string; intent: string }
const BEATS: BeatDef[] = [
  { beat_id: 'b001', segment_id: 'g01', importance: 'critical', visual_function: 'evidence', intent: '새로운 광고 공개' },
  { beat_id: 'b002', segment_id: 'g02', importance: 'critical', visual_function: 'evidence', intent: '매출이 크게 늘었' },
  { beat_id: 'b003', segment_id: 'g02', importance: 'normal', visual_function: 'literal', intent: '1988년 광고' },
  { beat_id: 'b004', segment_id: 'g02', importance: 'normal', visual_function: 'literal', intent: '사람들이 기억' },
  { beat_id: 'b005', segment_id: 'g03', importance: 'normal', visual_function: 'evidence', intent: '브랜드가 크게 성장' },
  { beat_id: 'b006', segment_id: 'g03', importance: 'normal', visual_function: 'literal', intent: '우리가 배운 교훈' },
  { beat_id: 'b007', segment_id: 'g03', importance: 'bridge', visual_function: 'reset', intent: '진행자 마무리 정리' },
  { beat_id: 'b008', segment_id: 'g03', importance: 'bridge', visual_function: 'context', intent: '브랜드 이야기 배경' },
]

function buildProject(dir: string, opts: { images: number; blocked: boolean }): void {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'sources', 'transcripts'), { recursive: true })
  cpSync(join(ALIGN, 'edit-profile.json'), join(dir, 'edit-profile.json'))
  cpSync(join(ALIGN, 'frame.md'), join(dir, 'frame.md'))
  cpSync(join(ALIGN, 'timeline.json'), join(dir, 'timeline.json'))

  const beats = BEATS.map((b) => ({
    beat_id: b.beat_id, segment_id: b.segment_id, narration: `n-${b.beat_id}`, start: 0, end: 3,
    visual_function: b.visual_function, importance: b.importance, search_intent: b.intent,
    anchor: { sentence_key: 's0000001', offset_sec: 0 }, timing_rev: 1,
  }))
  const shots: Record<string, unknown>[] = beats.map((b, i) => ({
    shot_id: `sh${String(i + 1).padStart(4, '0')}`, beat_ids: [b.beat_id], start: 0, end: 3,
    asset_kind: 'official_video', purpose: `p-${b.beat_id}`, selection_status: 'need', rights_status: 'unknown',
    anchor: { sentence_key: 's0000001', offset_sec: 0 }, timing_rev: 1,
  }))
  // 승인 샷(고화질용)
  shots.push(
    { shot_id: 'sh0090', beat_ids: ['b001'], start: 0, end: 3, asset_kind: 'official_video', purpose: '승인1', selection_status: 'approved', rights_status: 'licensed', source_id: 'src_001', source_in: 0.5, source_out: 2.5, anchor: { sentence_key: 's0000001', offset_sec: 0 }, timing_rev: 1, locked_selection: true },
    { shot_id: 'sh0091', beat_ids: ['b002'], start: 0, end: 3, asset_kind: 'interview', purpose: '승인2', selection_status: 'approved', rights_status: 'permission', source_id: 'src_002', source_in: 0.5, source_out: 2.5, anchor: { sentence_key: 's0000001', offset_sec: 0 }, timing_rev: 1, locked_selection: true },
  )
  if (opts.blocked) {
    beats.push({ beat_id: 'b099', segment_id: 'g03', narration: 'n-b099', start: 0, end: 3, visual_function: 'evidence', importance: 'critical', search_intent: 'zqx nonexistent alien spaceship xyzzy', anchor: { sentence_key: 's0000001', offset_sec: 0 }, timing_rev: 1 })
    shots.push({ shot_id: 'sh0099', beat_ids: ['b099'], start: 0, end: 3, asset_kind: 'official_video', purpose: 'p-b099', selection_status: 'need', rights_status: 'unknown', anchor: { sentence_key: 's0000001', offset_sec: 0 }, timing_rev: 1 })
  }
  writeFileSync(join(dir, 'shot-plan.json'), JSON.stringify({
    project: 'harvest-project', revision: 1, profile_rev: 1, frame_rev: 1,
    writers: { plan_rev: 1, review_rev: 1, reanchor_rev: 1, seal: 'x' },
    coverage_gap: [], segments: [{ segment_id: 'g01', act: 'hook' }, { segment_id: 'g02', act: 'build' }, { segment_id: 'g03', act: 'reveal' }],
    beats, shots,
  }, null, 2))

  // 카탈로그: 로컬 2 + 원격 1(DI 어댑터) + 이미지 N
  const catalog: Record<string, unknown>[] = [
    { source_id: 'src_001', title: 'official 1', publisher: 'brand', original_url: 'https://brand.example.com/v1', kind: 'official_video', rights_status: 'licensed', is_official: true, has_evidence: true, visual_topics: ['a', 'b'], width: 640, height: 360, local_path: join(MEDIA, 'src_001.mp4') },
    { source_id: 'src_002', title: 'interview 1', publisher: 'press', original_url: 'https://press.example.com/i1', kind: 'interview', rights_status: 'quotation_review', width: 640, height: 360, local_path: join(MEDIA, 'src_002.mp4') },
    { source_id: 'src_rem1', title: 'remote yt', publisher: 'yt', original_url: 'https://youtube.com/watch?v=remote1', kind: 'official_video', rights_status: 'unknown' },
  ]
  for (let i = 0; i < opts.images; i++) {
    catalog.push({ source_id: `src_img${i + 1}`, title: `photo ${i + 1}`, publisher: 'archive', original_url: `https://archive.example.com/p${i + 1}.jpg`, kind: 'image', rights_status: 'public_domain' })
  }
  writeFileSync(join(dir, 'sources', 'catalog.json'), JSON.stringify(catalog, null, 2))

  const segs = transcriptSegments()
  writeFileSync(join(dir, 'sources', 'transcripts', 'src_001.json'), JSON.stringify({ source_id: 'src_001', segments: segs }))
  writeFileSync(join(dir, 'sources', 'transcripts', 'src_002.json'), JSON.stringify({ source_id: 'src_002', segments: segs }))
  writeFileSync(join(dir, 'sources', 'transcripts', 'src_rem1.json'), JSON.stringify({ source_id: 'src_rem1', segments: [{ start: 0, end: SEG_DUR, text: '결국 그 브랜드는 크게 성장했습니다' }] }))
}

/* ─────────────── DI env / 어댑터 (네트워크 0회) ─────────────── */
function countingEnv(counter: { proc: number }): HarvestEnv {
  return {
    async runProc(cmd, args, o) { counter.proc++; return run(cmd, args, o) },
    async fetchUrl() { return { ok: false, status: 0, body: '' } },
    async capturePage() { return { ok: false, error: 'no-browser-in-verify' } },
  }
}
function fakeAdapters(counter: { adapter: number }, dummy: string): Record<string, HarvestAdapter> {
  const mk = (name: string): HarvestAdapter => ({
    name,
    async fetchProxy(req) { counter.adapter++; copyFileSync(dummy, req.outPath); return { ok: true, path: req.outPath, bytes: statSync(req.outPath).size } },
    async fetchOriginal(req) { counter.adapter++; copyFileSync(dummy, req.outPath); return { ok: true, path: req.outPath, bytes: statSync(req.outPath).size } },
  })
  return { youtube: mk('youtube'), web: mk('web'), page: mk('page') }
}

function readCandidates(dir: string, beatId: string): { candidates: { proxy_path: string | null; proxy_ok: boolean; asset_kind: string; score_source: string; rights_status: string; photo_motion?: { type: string } }[] } {
  return JSON.parse(readFileSync(join(dir, 'candidates', beatId, 'candidates.json'), 'utf8'))
}

async function main(): Promise<void> {
  // 소스 mp4 생성(절대경로 공유)
  mkdirSync(MEDIA, { recursive: true })
  genVideo(join(MEDIA, 'src_001.mp4'), '640x360', 4)
  genVideo(join(MEDIA, 'src_002.mp4'), '640x360', 4)
  const dummy = join(MEDIA, 'dummy.mp4')
  genVideo(dummy, '320x240', 2)

  const profile = loadProfile(CFG)
  const stillCap = profile.sources.still_image_max_per_15min[1]

  /* ── (a)(b)(f)(i): 메인 프로젝트 ── */
  buildProject(BASE, { images: stillCap + 2, blocked: false })
  const c1 = { proc: 0 }
  const a1 = { adapter: 0 }
  const r1 = await runHarvest({ projectDir: BASE, only: [], evalMode: true, human: false, env: countingEnv(c1), adapters: fakeAdapters(a1, dummy) })

  // (a) 전 비트 프록시 재생 가능
  let allProxied = r1.exitCode === 0
  for (const b of BEATS) {
    const cands = readCandidates(BASE, b.beat_id).candidates
    const playable = cands.filter((c) => c.proxy_path !== null && c.proxy_ok && existsSync(join(BASE, c.proxy_path!)))
    if (playable.length < 1) { allProxied = false; process.stderr.write(`  (a) ${b.beat_id} 재생가능 프록시 0개\n`) }
  }
  record('a-all-beats-proxy', allProxied, `exit=${r1.exitCode} 프록시생성=${r1.summary.proxies_generated} 어댑터호출=${a1.adapter}`)

  // (b) 사진 critical 전용 + parallax + 상한
  const criticalIds = new Set(BEATS.filter((b) => b.importance === 'critical').map((b) => b.beat_id))
  let photoOnCriticalOnly = true
  let allParallax = true
  for (const b of BEATS) {
    const imgs = readCandidates(BASE, b.beat_id).candidates.filter((c) => c.asset_kind === 'image')
    if (imgs.length > 0 && !criticalIds.has(b.beat_id)) photoOnCriticalOnly = false
    if (imgs.some((c) => c.photo_motion?.type !== profile.photo_motion.default)) allParallax = false
  }
  const capOk = r1.summary.photo_candidates <= stillCap && r1.summary.photo_candidates > 0
  record('b-photo-critical-parallax-cap', photoOnCriticalOnly && allParallax && capOk, `critical전용=${photoOnCriticalOnly} parallax=${allParallax} 사진수=${r1.summary.photo_candidates}≤상한${stillCap}=${capOk}`)

  // DI 어댑터 실증(원격 소스가 어댑터를 탔다)
  record('di-adapter-used', a1.adapter > 0, `run1 원격 어댑터 호출=${a1.adapter}(>0)`)

  // (f) 캐시 히트: 재실행 → 어댑터/다운로드 0
  const c2 = { proc: 0 }
  const a2 = { adapter: 0 }
  const r2 = await runHarvest({ projectDir: BASE, only: [], evalMode: true, human: false, env: countingEnv(c2), adapters: fakeAdapters(a2, dummy) })
  record('f-cache-hit-zero-calls', r2.exitCode === 0 && c2.proc === 0 && a2.adapter === 0 && r2.summary.proxies_skipped > 0, `재실행 runProc=${c2.proc} 어댑터=${a2.adapter} skip=${r2.summary.proxies_skipped}`)

  // (i) 고화질 stage → manifest + shot-plan 무변경
  const planHashBefore = sha256File(join(BASE, 'shot-plan.json'))
  const c3 = { proc: 0 }
  const rh = await runHarvest({ projectDir: BASE, only: [], evalMode: true, human: false, stage: 'hires', env: countingEnv(c3), adapters: fakeAdapters({ adapter: 0 }, dummy) })
  const manifestPath = join(BASE, 'assets', 'selected', 'manifest.json')
  const planHashAfter = sha256File(join(BASE, 'shot-plan.json'))
  const manifest = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { items: unknown[] }) : { items: [] }
  record('i-hires-manifest-plan-unchanged', rh.exitCode === 0 && manifest.items.length === 2 && planHashBefore === planHashAfter && !existsSync(join(BASE, 'shot-plan.json.bak')), `exit=${rh.exitCode} manifest항목=${manifest.items.length} shot-plan무변경=${planHashBefore === planHashAfter}`)

  /* ── (c) 예산 초과 ── */
  const budgetDir = resolve(ROOT, 'fixtures', 'harvest-budget')
  buildProject(budgetDir, { images: 0, blocked: false })
  const tinyProfile = structuredClone(profile) as EditProfile
  tinyProfile.harvest.proxy_budget_gb = profile.harvest.proxy_budget_gb / 1e12 // 극소 예산
  const rc = await runHarvest({ projectDir: budgetDir, only: [], evalMode: true, human: false, profileOverride: tinyProfile, env: countingEnv({ proc: 0 }), adapters: fakeAdapters({ adapter: 0 }, dummy) })
  const budgetWarn = rc.summary.budget_exceeded && rc.summary.warnings.some((w) => w.reason.includes('예산'))
  record('c-budget-warning', budgetWarn, `budget_exceeded=${rc.summary.budget_exceeded} 경고=${rc.summary.warnings.filter((w) => w.reason.includes('예산')).length}건`)
  rmSync(budgetDir, { recursive: true, force: true })

  /* ── (d) critical 0 → blocked exit1 + 7단계 ── */
  const blockedDir = resolve(ROOT, 'fixtures', 'harvest-blocked')
  buildProject(blockedDir, { images: 0, blocked: true })
  const rb = await runHarvest({ projectDir: blockedDir, only: [], evalMode: true, human: false, env: countingEnv({ proc: 0 }), adapters: fakeAdapters({ adapter: 0 }, dummy) })
  const b099Blocked = rb.summary.blocked.find((x) => x.beat_id === 'b099')
  const sevenSteps = b099Blocked !== undefined && Array.isArray(b099Blocked.alternatives) && b099Blocked.alternatives.length === 7
  record('d-blocked-exit1-7steps', rb.exitCode === 1 && b099Blocked !== undefined && sevenSteps, `exit=${rb.exitCode} blocked=${rb.summary.blocked.map((x) => x.beat_id).join(',')} 7단계=${sevenSteps}`)

  /* ── (e) --only 밖 critical → deferred_blocked exit0 ── */
  const re = await runHarvest({ projectDir: blockedDir, only: ['b001'], evalMode: true, human: false, env: countingEnv({ proc: 0 }), adapters: fakeAdapters({ adapter: 0 }, dummy) })
  const deferred = re.summary.deferred_blocked.some((d) => d.beat_id === 'b099')
  record('e-deferred-blocked-exit0', re.exitCode === 0 && deferred && re.summary.blocked.length === 0, `exit=${re.exitCode} deferred=${re.summary.deferred_blocked.map((d) => d.beat_id).join(',')} blocked=${re.summary.blocked.length}`)
  rmSync(blockedDir, { recursive: true, force: true })

  /* ── (g) 비밀값 미기록 ── */
  const rg = spawnSync('rg', ['-i', 'api[_-]?key|Bearer ', BASE], { encoding: 'utf8' })
  // rg exit 1 = 매치 없음(성공). exit 0 = 매치 있음(실패).
  record('g-no-secrets', rg.status === 1, `rg status=${rg.status}(1=매치없음) 매치=${(rg.stdout ?? '').trim().split('\n').filter((l) => l).length}건`)

  /* ── (h) t0b 회귀: 프로덕션 인덱스 hit@5 ≥ 1.0 ── */
  const h = profile.harvest
  const t0bTranscripts = JSON.parse(readFileSync(join(ROOT, 'fixtures', 't0b', 'transcripts.json'), 'utf8')) as Transcript[]
  const t0bIntents = JSON.parse(readFileSync(join(ROOT, 'fixtures', 't0b', 'intents.json'), 'utf8')) as { intent_id: string; intent: string }[]
  const t0bTruth = (JSON.parse(readFileSync(join(ROOT, 'fixtures', 't0b', 'expected-verdicts.json'), 'utf8')) as { truth: { intent_id: string; source_id: string; start: number; end: number }[] }).truth
  const cfg: SearchConfig = { ngramMin: h.search.ngram_min, ngramMax: h.search.ngram_max, previewPad: h.preview_context_sec[1], weights: h.score_weights, resolutionMinShortSide: h.resolution_min_short_side }
  const idx = buildIndex(t0bTranscripts, cfg, new Map())
  let hits = 0
  for (const it of t0bIntents) {
    const cands = search(idx, it.intent, h.search.top_n)
    const windows = t0bTruth.filter((w) => w.intent_id === it.intent_id)
    const usable = cands.some((c) => windows.some((w) => w.source_id === c.source_id && c.source_in < w.end && w.start < c.source_out))
    if (usable) hits++
  }
  const hitAt5 = hits / t0bIntents.length
  record('h-t0b-regression', hitAt5 >= 1.0, `hit@5=${hitAt5} (의도 ${t0bIntents.length}건 중 ${hits}건 적중, 기준 ≥1.0)`)

  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
  if (!allPass) process.exitCode = 1
}

main().catch((err: unknown) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`)
  process.exitCode = 1
})
