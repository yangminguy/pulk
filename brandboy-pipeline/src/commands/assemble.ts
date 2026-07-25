/**
 * assemble.ts — 샷 플랜 → CapCut 초안 + 순번 파일 + 큐 파일 (T5, spec/07)
 *
 * 오케스트레이션만 한다. 모델 조립(model.ts)·검사(checks.ts)·이미터(emit-capcut/emit-numbered)·
 * 사진 촬영모션 렌더(photo-motion.ts)를 순서대로 호출한다.
 *
 * 절차:
 *  1 buildModel → 10트랙 TimelineModel
 *  2 runChecks → blocking 실패면 조립 중단(미승인/V15/V17b/V18/루프/깨진소스/훅/길이)
 *  3 materializeZoompan → 켄번즈 사진을 zoompan 으로 렌더(공용), parallax mov 부재 보고
 *  4 --emit 별 이미터 실행(한쪽 실패해도 다른 쪽 진행)
 *  5 music-cues.json / sound-cues.json / render_report.json 기록
 *
 * 수치는 profile 이 유일 출처다. 아래 상수는 종료 코드·구조 상수(// @unit).
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { writeAtomic } from '../lib/io.js'
import { loadProfile, loadFrame } from '../lib/profile.js'
import { InputError } from './validate.js'
import { buildModel, TRACK_NAMES, type TimelineModel, type TrackName } from '../assemble/model.js'
import { runChecks, type CheckResult } from '../assemble/checks.js'
import { materializeZoompan } from '../assemble/photo-motion.js'
import { emitCapcut, type CapcutResult } from '../assemble/emit-capcut.js'
import { emitNumbered, type NumberedResult } from '../assemble/emit-numbered.js'
import { emitResolve, type ResolveResult } from '../assemble/emit-resolve.js'

/** 이미터 타깃. 콤마 목록으로 조합한다. 별칭 both=capcut,numbered / all=셋 다. */
export type EmitTarget = 'capcut' | 'numbered' | 'resolve'
const EMIT_TARGETS: EmitTarget[] = ['capcut', 'numbered', 'resolve'] // @unit 안정 정렬 순서(구조)
const EMIT_ALIASES: Record<string, EmitTarget[]> = {
  both: ['capcut', 'numbered'],
  all: ['capcut', 'numbered', 'resolve'],
}
/** 기본 이미터(사장님 결정 2026-07-25: Resolve 자동 + 순번 병행, capcut 초안은 명시 시만). */
export const EMIT_DEFAULT = 'numbered,resolve'

/** `--emit` 콤마 목록/별칭을 안정 순서의 타깃 배열로 파싱한다. 알 수 없는 타깃은 error. */
export function parseEmit(raw: string): { ok: true; targets: EmitTarget[] } | { ok: false; error: string } {
  const parts = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  if (parts.length === 0) return { ok: false, error: '빈 --emit (capcut|numbered|resolve|both|all)' }
  const set = new Set<EmitTarget>()
  for (const p of parts) {
    const alias = EMIT_ALIASES[p]
    if (alias !== undefined) { for (const t of alias) set.add(t); continue }
    if ((EMIT_TARGETS as string[]).includes(p)) { set.add(p as EmitTarget); continue }
    return { ok: false, error: `알 수 없는 --emit 타깃: ${p} (capcut|numbered|resolve|both|all)` }
  }
  return { ok: true, targets: EMIT_TARGETS.filter((t) => set.has(t)) }
}

export interface AssembleOptions {
  emit: EmitTarget[]
  pilotPath?: string
  force: boolean
  human: boolean
  draftsDir?: string // capcut init --drafts (verify 격리용). 미지정 시 CapCut 기본 폴더
}

const PilotSchema = z.object({
  spine: z.object({
    from_sentence_key: z.string(),
    to_sentence_key: z.string(),
    target_sec: z.tuple([z.number(), z.number()]).optional(),
  }),
})

export interface AssembleSummary {
  ok: boolean
  project: string
  emit: EmitTarget[]
  is_spine: boolean
  duration: number
  narration_master_sec: number | null
  track_counts: Record<TrackName, number>
  checks: CheckResult
  outputs: {
    capcut?: { status: string; path: string; draft_content_exists: boolean; lint_clean: boolean; lint_detail: string; batches: number; added: number; failed: { shot_id: string; reason: string }[] }
    numbered?: { status: string; path: string; clips: number; overlays: number; failed: { shot_id: string; reason: string }[] }
    resolve?: { status: string; path: string; guide_path: string; tracks: { name: string; clips: number }[]; markers: number; failed: { shot_id: string; reason: string }[] }
  }
  music_cues: number
  sound_cues: number
  usage_credits: number
  photo_motion_failed: { shot_id: string; reason: string }[]
  human_required: string[]
  skipped?: boolean
}

function trackCounts(model: TimelineModel): Record<TrackName, number> {
  const out = {} as Record<TrackName, number>
  for (const t of TRACK_NAMES) out[t] = model.tracks[t].length
  return out
}

export async function runAssemble(projectDir: string, opts: AssembleOptions): Promise<{ summary: AssembleSummary; exitCode: number }> {
  if (!existsSync(resolve(projectDir, 'shot-plan.json'))) throw new InputError(`shot-plan.json 없음: ${resolve(projectDir, 'shot-plan.json')}`)
  const profile = loadProfile(projectDir, { bootstrap: true })
  loadFrame(projectDir, { bootstrap: true }) // frame_rev 존재 확인(없으면 ConfigError → exit 2)

  // ── 멱등성: report 있고 --force 아니면 skip ──
  const reportPath = resolve(projectDir, 'render_report.json')
  if (!opts.force && existsSync(reportPath)) {
    const prev = JSON.parse(readFileSync(reportPath, 'utf8')) as AssembleSummary
    return { summary: { ...prev, skipped: true }, exitCode: EXIT_OK }
  }

  // ── spine(--pilot) ──
  let spineKeys: { from: string; to: string } | undefined
  if (opts.pilotPath !== undefined) {
    if (!existsSync(opts.pilotPath)) throw new InputError(`pilot.json 없음: ${opts.pilotPath}`)
    const parsed = PilotSchema.safeParse(JSON.parse(readFileSync(opts.pilotPath, 'utf8')))
    if (!parsed.success) throw new InputError(`pilot.json 스키마 위반: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`)
    spineKeys = { from: parsed.data.spine.from_sentence_key, to: parsed.data.spine.to_sentence_key }
  }

  // ── 1. 모델 ──
  const model = await buildModel(projectDir, profile, { spineKeys })

  // ── 2. 검사 ──
  const checks = runChecks(model, profile)

  const cwd = projectDir
  const renderTimeout = profile.motion.render_timeout_sec
  const cliTimeout = profile.harvest.timeout_sec

  const summaryBase = (): Omit<AssembleSummary, 'ok' | 'outputs' | 'photo_motion_failed'> => ({
    project: model.project, emit: opts.emit, is_spine: model.is_spine, duration: model.duration,
    narration_master_sec: model.narration_master_sec, track_counts: trackCounts(model), checks,
    music_cues: model.music_cues.length, sound_cues: model.sound_cues.length, usage_credits: model.usage.length,
    human_required: checks.human_required,
  })

  // blocking 실패 → 조립 중단(초안/파일 미생성). 리포트만 남기고 exit 1.
  if (checks.blocked) {
    const summary: AssembleSummary = { ...summaryBase(), ok: false, outputs: {}, photo_motion_failed: [] }
    writeAtomic(reportPath, summary)
    if (opts.human) writeCheckHuman(checks)
    return { summary, exitCode: EXIT_FAIL }
  }

  // ── 3. zoompan 사진 사전 렌더(이미터 공용) ──
  const workDir = resolve(projectDir, 'assemble', 'work')
  const pm = await materializeZoompan(model, workDir, profile, { cwd, timeoutSec: renderTimeout })

  // ── 4. 이미터 (타깃별, 한쪽 실패해도 다른 쪽 진행) ──
  const outputs: AssembleSummary['outputs'] = {}
  let capcut: CapcutResult | undefined
  let numbered: NumberedResult | undefined
  let resolveOut: ResolveResult | undefined
  if (opts.emit.includes('capcut')) {
    capcut = await emitCapcut(model, projectDir, profile, { cwd, timeoutSec: cliTimeout, draftsDir: opts.draftsDir })
    outputs.capcut = { status: capcut.status, path: capcut.path, draft_content_exists: capcut.draft_content_exists, lint_clean: capcut.lint_clean, lint_detail: capcut.lint_detail, batches: capcut.batches, added: capcut.added, failed: capcut.failed }
  }
  if (opts.emit.includes('numbered')) {
    numbered = await emitNumbered(model, projectDir, profile, { cwd, timeoutSec: renderTimeout })
    outputs.numbered = { status: numbered.status, path: numbered.path, clips: numbered.clips.length, overlays: numbered.overlays.length, failed: numbered.failed }
  }
  if (opts.emit.includes('resolve')) {
    resolveOut = await emitResolve(model, projectDir, profile, { force: opts.force })
    outputs.resolve = { status: resolveOut.status, path: resolveOut.path, guide_path: resolveOut.guide_path, tracks: resolveOut.tracks, markers: resolveOut.markers, failed: resolveOut.failed }
  }

  // ── 5. 큐 파일(assemble 소유) + 리포트 ──
  writeAtomic(resolve(projectDir, 'music-cues.json'), model.music_cues)
  writeAtomic(resolve(projectDir, 'sound-cues.json'), model.sound_cues)

  const emitFailed =
    (capcut !== undefined && capcut.status !== 'ok') ||
    (numbered !== undefined && numbered.status !== 'ok') ||
    (resolveOut !== undefined && resolveOut.status !== 'ok') ||
    pm.failed.length > 0
  const summary: AssembleSummary = { ...summaryBase(), ok: !emitFailed, outputs, photo_motion_failed: pm.failed }
  writeAtomic(reportPath, summary)
  if (opts.human) { writeCheckHuman(checks); process.stderr.write(`\n■ assemble — emit=${opts.emit.join(',')} capcut=${outputs.capcut?.status ?? '-'} numbered=${outputs.numbered?.status ?? '-'} resolve=${outputs.resolve?.status ?? '-'} verdict=${checks.verdict}\n`) }

  return { summary, exitCode: emitFailed ? EXIT_FAIL : EXIT_OK }
}

function writeCheckHuman(checks: CheckResult): void {
  process.stderr.write(`\n■ 자동검사 (verdict=${checks.verdict}, blocked=${checks.blocked})\n`)
  for (const c of checks.checks) {
    process.stderr.write(`  ${c.status.toUpperCase().padEnd(HUMAN_PAD)} ${c.label} — ${c.detail}\n`)
    for (const r of c.ranges ?? []) process.stderr.write(`      · [${r.start}~${r.end}] ${r.note}\n`)
  }
}

const EXIT_OK = 0 // @unit 성공
const EXIT_FAIL = 1 // @unit 품질/처리 실패
const HUMAN_PAD = 14 // @unit 사람용 상태 열 정렬 폭
