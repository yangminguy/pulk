/**
 * verify-t9d.ts — T9d 완료 조건 자동 판정: 프롬프트 3종 실주행 검증
 *
 * 에이전트 역할을 대신해 각 프롬프트가 지시하는 산출물(fixtures/t9d/*)을 저작해 두고,
 * 그 산출물이 실제 코드 게이트를 통과함을 실증한다. cli.ts 는 아래 run 함수들로 디스패치하므로
 * `pipeline plan --apply`·`pipeline validate`·harvest·motion bridge 를 함수 레벨로 실주행한다.
 *
 * 판정:
 *  1. plan-beats (prompts/plan-beats.md)
 *     1a. fixtures/align-project 의 timeline 위에 저작한 beat-plan → plan --apply exit0 + writeScoped abort 0
 *     1b. plan → reanchor 후 validate ok (fatal/blocked 0)   ※ V14b 는 plan 뒤 reanchor 를 요구한다
 *     1c. 재실행 동일성: 독립 temp 2회 → shot-plan.json 바이트 동일(결정론)
 *  2. harvest-sources (prompts/harvest-sources.md §B)
 *     2a. harvest 실주행 → candidates/<beat_id>/ 산출 + 모든 후보에 rights_status·score_source
 *     2b. shot-plan.json 무접촉 (harvest 전후 해시 동일)
 *     2c. validate ok (fatal/blocked 0)
 *     2d. 재실행 동일성: 캐시 히트(proxies_skipped>0, 신규 0) + candidates.json 바이트 동일
 *  3. motion-scene (prompts/motion-scene.md)
 *     3a. 저작한 motion request+composition → lint→check→render(mov) 체인 통과, 길이 duration±tolerance
 *     3b. 재실행 동일성: 캐시 히트(cached=true)
 *
 * 실행:  npx tsx scripts/t9d/verify-t9d.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1. 네트워크 0회(harvest DI · 로컬 소스).
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runPlan } from '../../src/commands/plan.js'
import { runReanchor } from '../../src/commands/reanchor.js'
import { validateProject, type ValidationResult } from '../../src/commands/validate.js'
import { runHarvest } from '../../src/commands/harvest.js'
import { ffmpegBin } from '../../src/lib/probe.js'
import { run } from '../../src/lib/proc.js'
import { sha256Hex, sha256File } from '../../src/lib/canonical.js'
import { runBridge, loadRequest, motionCacheKey, type MotionRequest, type BridgeOptions } from '../../src/motion/bridge.js'
import { loadProfile } from '../../src/lib/profile.js'
import type { HarvestEnv, HarvestAdapter } from '../../src/harvest/types.js'

const ROOT = resolve(import.meta.dirname, '..', '..')
const ALIGN = resolve(ROOT, 'fixtures', 'align-project')
const T9D = resolve(ROOT, 'fixtures', 't9d')
const BEAT_PLAN = resolve(T9D, 'plan', 'beat-plan.json')
const HARVEST_FIX = resolve(T9D, 'harvest')
const MOTION_REQ = resolve(T9D, 'motion', 'requests', 'b910.json')
const MOTION_COMPS = resolve(T9D, 'motion', 'compositions')

/** align 산출 프로젝트에서 재사용하는 상류 파일(사람/align 소관, plan 이전 단계). */
const ALIGN_INPUTS = ['edit-profile.json', 'frame.md', 'timeline.json', 'script-map.json', 'align-remap.json']

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

function tmp(tag: string): string {
  return mkdtempSync(join(tmpdir(), `t9d-${tag}-`))
}

/* ─────────────── 1. plan-beats ─────────────── */

interface PlanBeatsRun {
  planExit: number
  planViolations: number
  planMode: string
  needShots: number
  reanchored: number
  validate: ValidationResult
  shotPlanHash: string
}

/** 상류 파일 복사 → plan --apply(Z1) → reanchor(Z3) → validate. 실주행 1회. */
function planBeatsRun(): PlanBeatsRun {
  const dir = tmp('plan')
  try {
    for (const f of ALIGN_INPUTS) cpSync(join(ALIGN, f), join(dir, f))
    const p = runPlan(dir, { applyPath: BEAT_PLAN, only: [], human: false })
    const r = runReanchor(dir, { only: [], human: false })
    const v = validateProject(dir)
    return {
      planExit: p.exitCode,
      planViolations: p.summary.postcondition_violations.length,
      planMode: p.summary.mode,
      needShots: p.summary.need_shots,
      reanchored: r.summary.reanchored.length,
      validate: v.result,
      shotPlanHash: sha256File(join(dir, 'shot-plan.json')),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function sectionPlanBeats(): void {
  const a = planBeatsRun()
  record(
    '1a.plan-beats:plan--apply+no-abort',
    a.planExit === 0 && a.planViolations === 0 && a.planMode === 'initial' && a.needShots > 0,
    `exit=${a.planExit} writeScoped_abort=${a.planViolations} mode=${a.planMode} need=${a.needShots} reanchored=${a.reanchored}`,
  )
  const v = a.validate
  record(
    '1b.plan-beats:validate',
    v.ok && v.fatal.length === 0 && v.blocked.length === 0,
    `ok=${v.ok} fatal=${v.fatal.length} blocked=${v.blocked.length} warn=${v.warnings.length}`,
  )
  const b = planBeatsRun() // 완전 독립 실행 2회 → shot-plan.json 바이트 동일
  record(
    '1c.plan-beats:rerun-deterministic',
    a.shotPlanHash === b.shotPlanHash,
    `run1=${a.shotPlanHash.slice(0, 12)}… run2=${b.shotPlanHash.slice(0, 12)}… 동일=${a.shotPlanHash === b.shotPlanHash}`,
  )
}

/* ─────────────── 2. harvest-sources ─────────────── */

/** DI env — runProc 만 실제(ffmpeg 로컬 컷), fetch/browser 는 차단(네트워크 0회). */
function harvestEnv(): HarvestEnv {
  return {
    async runProc(cmd, args, o) { return run(cmd, args, o) },
    async fetchUrl() { return { ok: false, status: 0, body: '' } },
    async capturePage() { return { ok: false, error: 'no-network-in-verify' } },
  }
}
/** 로컬 소스만 쓰므로 어댑터는 타지 않는다(원격 요청 시 실패 반환 — 무단 네트워크 금지). */
function harvestAdapters(): Record<string, HarvestAdapter> {
  const mk = (name: string): HarvestAdapter => ({
    name,
    async fetchProxy() { return { ok: false, error: 'no-remote-in-verify' } },
    async fetchOriginal() { return { ok: false, error: 'no-remote-in-verify' } },
  })
  return { youtube: mk('youtube'), web: mk('web'), page: mk('page') }
}

function genVideo(out: string, durSec: number): void {
  const r = spawnSync(ffmpegBin(), ['-y', '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=15:duration=${durSec}`, '-pix_fmt', 'yuv420p', out], { encoding: 'utf8' })
  if (r.status !== 0) { process.stderr.write(`${r.stderr ?? ''}\n`); throw new Error(`ffmpeg 생성 실패: ${out}`) }
}

/** candidates/&lt;beat&gt;/candidates.json 전량의 정규화 해시 + 후보 계약 감사. */
function auditCandidates(dir: string): { beats: number; total: number; missingMeta: number; hash: string } {
  const candDir = join(dir, 'candidates')
  if (!existsSync(candDir)) return { beats: 0, total: 0, missingMeta: 0, hash: '' }
  let total = 0
  let missingMeta = 0
  const parts: string[] = []
  const beatDirs = readdirSync(candDir).sort()
  for (const b of beatDirs) {
    const file = join(candDir, b, 'candidates.json')
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    parts.push(`${b}:${text}`)
    const doc = JSON.parse(text) as { candidates: { rights_status?: string; score_source?: string }[] }
    for (const c of doc.candidates) {
      total++
      if (c.rights_status === undefined || c.rights_status === '' || c.score_source === undefined || c.score_source === '') missingMeta++
    }
  }
  return { beats: beatDirs.length, total, missingMeta, hash: sha256Hex(parts.join(' ')) }
}

async function sectionHarvest(): Promise<void> {
  const dir = tmp('harvest')
  try {
    // 상류(align) + 유효 shot-plan(plan→reanchor 로 봉인)
    for (const f of ALIGN_INPUTS) cpSync(join(ALIGN, f), join(dir, f))
    runPlan(dir, { applyPath: BEAT_PLAN, only: [], human: false })
    runReanchor(dir, { only: [], human: false })
    // 로컬 소스 미디어 + 카탈로그 + 자막(프롬프트 §B: candidates/·catalog 기입, shot-plan 무접촉)
    mkdirSync(join(dir, 'media'), { recursive: true })
    genVideo(join(dir, 'media', 'src_001.mp4'), 6)
    genVideo(join(dir, 'media', 'src_002.mp4'), 6)
    mkdirSync(join(dir, 'sources', 'transcripts'), { recursive: true })
    cpSync(join(HARVEST_FIX, 'catalog.json'), join(dir, 'sources', 'catalog.json'))
    for (const f of readdirSync(join(HARVEST_FIX, 'transcripts'))) {
      cpSync(join(HARVEST_FIX, 'transcripts', f), join(dir, 'sources', 'transcripts', f))
    }

    const planHashBefore = sha256File(join(dir, 'shot-plan.json'))
    const run1 = await runHarvest({ projectDir: dir, only: [], evalMode: true, human: false, env: harvestEnv(), adapters: harvestAdapters() })
    const planHashAfter = sha256File(join(dir, 'shot-plan.json'))
    const audit1 = auditCandidates(dir)
    record(
      '2a.harvest:candidates+rights/score_source',
      run1.exitCode === 0 && audit1.total > 0 && audit1.missingMeta === 0,
      `exit=${run1.exitCode} 후보=${audit1.total}(비트 ${audit1.beats}) 계약누락=${audit1.missingMeta} 프록시=${run1.summary.proxies_generated}`,
    )
    record(
      '2b.harvest:shot-plan-untouched',
      planHashBefore === planHashAfter,
      `before=${planHashBefore.slice(0, 12)}… after=${planHashAfter.slice(0, 12)}… 동일=${planHashBefore === planHashAfter}`,
    )
    const v = validateProject(dir)
    record(
      '2c.harvest:validate',
      v.result.ok && v.result.fatal.length === 0 && v.result.blocked.length === 0,
      `ok=${v.result.ok} fatal=${v.result.fatal.length} blocked=${v.result.blocked.length} warn=${v.result.warnings.length}`,
    )
    // 재실행: 캐시/멱등 → 신규 프록시 0, skip>0 + candidates.json 바이트 동일
    const run2 = await runHarvest({ projectDir: dir, only: [], evalMode: true, human: false, env: harvestEnv(), adapters: harvestAdapters() })
    const audit2 = auditCandidates(dir)
    record(
      '2d.harvest:rerun-cache+deterministic',
      run2.exitCode === 0 && run2.summary.proxies_generated === 0 && run2.summary.proxies_skipped > 0 && audit1.hash === audit2.hash,
      `재실행 신규프록시=${run2.summary.proxies_generated} skip=${run2.summary.proxies_skipped} candidates동일=${audit1.hash === audit2.hash}`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/* ─────────────── 3. motion-scene ─────────────── */

/** cache.ts 규칙으로 특정 키 캐시만 지운다(다른 캐시 불가침). */
function clearCacheKey(key: string): void {
  const p = join(ROOT, '.cache', `${sha256Hex(key)}.json`)
  if (existsSync(p)) rmSync(p)
}

async function sectionMotion(): Promise<void> {
  const outDir = tmp('motion')
  try {
    const profile = loadProfile('config')
    const opts: BridgeOptions = { compositionsDir: MOTION_COMPS, outDir, profile }
    const req = loadRequest(MOTION_REQ) as MotionRequest
    const tol = profile.motion.duration_tolerance_sec

    clearCacheKey(motionCacheKey(req)) // 결정론적 첫 렌더 강제
    const t0 = Date.now()
    const r1 = await runBridge([MOTION_REQ], opts)
    const renderSec = ((Date.now() - t0) / 1000).toFixed(1)
    const out1 = r1.outputs[0]
    const durOk = out1 !== undefined && Math.abs(out1.duration - req.duration) <= tol
    const isMov = out1 !== undefined && out1.file.endsWith('.mov')
    record(
      '3a.motion:lint→check→render(mov,dur)',
      r1.report.failed.length === 0 && out1 !== undefined && existsSync(out1.file) && isMov && durOk && out1.cached === false,
      `failed=${r1.report.failed.length} out=${out1 ? out1.file.split('/').pop() : '없음'} dur=${out1?.duration}s(±${tol}) cached=${out1?.cached} render=${renderSec}s`,
    )
    if (r1.report.failed.length > 0) process.stderr.write(`  motion 실패사유: ${JSON.stringify(r1.report.failed)}\n`)

    const r2 = await runBridge([MOTION_REQ], opts)
    const out2 = r2.outputs[0]
    record(
      '3b.motion:rerun-cache-hit',
      out2 !== undefined && out2.cached === true && out2.duration === out1?.duration,
      `재실행 cached=${out2?.cached} dur=${out2?.duration}s(=첫 렌더)`,
    )
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

/* ─────────────── 마감 ─────────────── */

async function main(): Promise<void> {
  sectionPlanBeats()
  await sectionHarvest()
  await sectionMotion()

  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
  if (!allPass) process.exitCode = 1
}

main().catch((err: unknown) => {
  process.stderr.write(`verify-t9d 예외: ${(err as Error).stack ?? String(err)}\n`)
  process.exitCode = 1
})
