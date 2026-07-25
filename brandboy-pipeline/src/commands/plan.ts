/**
 * plan.ts — beat-plan.json 병합 (T7 Part A, CONTRACTS §1 Z1 · §3 "V17의 짝")
 *
 *   pipeline plan --project <dir> --apply <beat-plan.json> [--only <beat_id>]
 *
 * plan 에이전트의 산출물(beat-plan.json)을 검증(zod)한 뒤 shot-plan.json 의 **Z1 구역**으로
 * writeScoped('Z1') 병합한다. shot-plan.json 이 없으면 초기 생성(revision 0→1).
 *
 * Z1 사후조건 (CONTRACTS §3 "V17의 짝"):
 *  - 비트 재분할 시 selection_status != "need" 샷(보존 샷)이 덮는 시간대에 **새 need 샷을 만들지 않는다.**
 *    보존 샷은 삭제·갱신하지 않고 새 비트에 **재바인딩만**(beat_ids 는 Z1 소유 필드).
 *  - 커버리지 미달은 임의로 채우지 않고 beat-plan 의 coverage_gap[] 을 그대로 전달한다.
 *  - 보존 샷과 같은 asset_kind 의 새 need 샷이 allowed_overlap_sec 를 넘겨 겹치면 **abort**
 *    (파일 무변경 + exit 1). coverage_gap 을 보고했더라도 통과가 아니다(prompts/plan-beats.md 규약).
 *
 * 수치 하드코딩 금지: allowed_overlap_sec 는 profile.tracks 에서 읽는다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { Segment, Beat, Shot, CoverageGap } from '../schema/pipeline.js'
import { writeScoped, writeAtomic, type MutableDoc } from '../lib/io.js'
import { sealHash } from '../lib/canonical.js'
import { loadProfile, loadFrame } from '../lib/profile.js'
import { InputError } from './validate.js'

const INITIAL_REVISION = 1 // @unit 초기 생성 revision (0→1)
const INITIAL_PLAN_REV = 1 // @unit 초기 생성 plan_rev

/* ─────────────── beat-plan.json 스키마 (plan 에이전트 전용 산출물) ─────────────── */

const BeatPlan = z.object({
  project: z.string().regex(/^[a-z0-9-]+$/),
  segments: z.array(Segment),
  beats: z.array(Beat),
  shots: z.array(Shot),
  coverage_gap: z.array(CoverageGap).default([]),
})
type BeatPlan = z.infer<typeof BeatPlan>

/* ─────────────── 결과 타입 ─────────────── */

export interface PostconditionViolation {
  need_shot_id: string
  preserved_shot_id: string
  asset_kind: string
  overlap_sec: number
}

export interface PlanSummary {
  ok: boolean
  mode: 'initial' | 'merge'
  beats: number
  shots: number
  need_shots: number
  preserved: number
  rebinding: { shot_id: string; from: string[]; to: string[] }[]
  coverage_gap: number
  postcondition_violations: PostconditionViolation[]
}

export interface PlanOptions {
  applyPath: string
  only: string[]
  human: boolean
}

type Doc = Record<string, unknown>
type ShotObj = Record<string, unknown>

/* ─────────────── 스코프 헬퍼 ─────────────── */

/** 재분할 접미사(b042a)를 base(b042)로 접는다. onlySet.has(base) 로 분할 자식까지 매칭한다. */
function baseBeatId(id: string): string {
  return id.replace(/[a-z]$/, '')
}

function beatInScope(beatId: string, onlySet: Set<string>): boolean {
  return onlySet.size === 0 || onlySet.has(beatId) || onlySet.has(baseBeatId(beatId))
}

function shotInScope(beatIds: string[], onlySet: Set<string>): boolean {
  return onlySet.size === 0 || beatIds.some((b) => beatInScope(b, onlySet))
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v)
}

/** 두 [start,end] 구간의 시간 중첩(초). 없으면 ≤0. */
function overlapSec(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart)
}

/* ─────────────── beat-plan 로드 ─────────────── */

function loadBeatPlan(applyPath: string): BeatPlan {
  if (!existsSync(applyPath)) throw new InputError(`--apply beat-plan.json 없음: ${applyPath}`)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(applyPath, 'utf8'))
  } catch (err) {
    throw new InputError(`beat-plan.json 파싱 실패: ${applyPath} · ${(err as Error).message}`)
  }
  const parsed = BeatPlan.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`).join(' | ')
    throw new InputError(`beat-plan.json 스키마 위반 — ${issues}`)
  }
  // plan 은 need 샷만 만든다. 검수 상태(candidate/selected/approved)를 beat-plan 에 담으면 소유권 위반.
  for (const s of parsed.data.shots) {
    if (s.selection_status !== 'need') {
      throw new InputError(`beat-plan 의 샷 ${s.shot_id} 이 selection_status="${s.selection_status}" — plan 은 need 샷만 생성한다(Z2 는 review 소유)`)
    }
  }
  return parsed.data
}

/* ─────────────── 재바인딩: 보존 샷 → 새 비트 ─────────────── */

/** 보존 샷의 [start,end] 를 가장 많이 덮는 새 비트들로 beat_ids 를 다시 잇는다(Z1 필드). */
function rebindBeatIds(shot: ShotObj, beats: BeatPlan['beats']): string[] {
  const s = num(shot['start'])
  const e = num(shot['end'])
  const covering = beats.filter((b) => overlapSec(s, e, b.start, b.end) > 0).map((b) => b.beat_id)
  return covering.length > 0 ? covering : ((shot['beat_ids'] as string[] | undefined) ?? [])
}

/* ─────────────── 병합 계획 (순수) ─────────────── */

interface MergePlan {
  beats: BeatPlan['beats']
  segments: BeatPlan['segments']
  shots: ShotObj[]
  coverageGap: BeatPlan['coverage_gap']
  needShots: ShotObj[]
  preservedShots: ShotObj[]
  rebinding: { shot_id: string; from: string[]; to: string[] }[]
}

function computeMerge(existing: MutableDoc | null, bp: BeatPlan, onlySet: Set<string>): MergePlan {
  const existingBeats = (existing?.beats as BeatPlan['beats'] | undefined) ?? []
  const existingShots = (existing?.shots as ShotObj[] | undefined) ?? []
  const existingSegments = (existing?.segments as BeatPlan['segments'] | undefined) ?? []
  const existingGap = (existing?.coverage_gap as BeatPlan['coverage_gap'] | undefined) ?? []

  // 비트: 범위 밖 유지 + beat-plan 범위 안 신규
  const inScopeNewBeats = bp.beats.filter((b) => beatInScope(b.beat_id, onlySet))
  const keptBeats = existingBeats.filter((b) => !beatInScope(b.beat_id, onlySet))
  const resultBeats = keptBeats.concat(inScopeNewBeats)

  // 세그먼트: 기존을 유지하되 beat-plan 것으로 upsert(Z1 소유)
  const segMap = new Map<string, BeatPlan['segments'][number]>()
  for (const s of existingSegments) segMap.set(s.segment_id, s)
  for (const s of bp.segments) segMap.set(s.segment_id, s)
  const resultSegments = [...segMap.values()]

  // 샷: 보존(비-need) 전량 유지 + 범위 밖 need 유지, 범위 안 기존 need 는 교체
  const kept: ShotObj[] = existingShots.filter(
    (s) => s['selection_status'] !== 'need' || !shotInScope((s['beat_ids'] as string[]) ?? [], onlySet),
  )
  const preservedShots = existingShots.filter((s) => s['selection_status'] !== 'need')

  // 보존 in-scope 샷 재바인딩(beat_ids 만 갱신 — Z1 필드)
  const rebinding: { shot_id: string; from: string[]; to: string[] }[] = []
  for (const s of kept) {
    if (s['selection_status'] === 'need') continue
    if (!shotInScope((s['beat_ids'] as string[]) ?? [], onlySet)) continue
    const from = ((s['beat_ids'] as string[] | undefined) ?? []).slice()
    const to = rebindBeatIds(s, resultBeats)
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      s['beat_ids'] = to
      rebinding.push({ shot_id: String(s['shot_id']), from, to })
    }
  }

  // 신규 need 샷(범위 안). 기존 kept 샷과 shot_id 충돌 금지.
  const keptIds = new Set(kept.map((s) => String(s['shot_id'])))
  const needShots = bp.shots.filter((s) => shotInScope(s.beat_ids, onlySet)) as unknown as ShotObj[]
  for (const n of needShots) {
    if (keptIds.has(String(n['shot_id']))) {
      throw new InputError(`beat-plan 신규 need 샷 shot_id 충돌: ${String(n['shot_id'])} (이미 보존/범위밖 샷에 존재)`)
    }
  }
  const resultShots = kept.concat(needShots)

  // coverage_gap: 범위 밖 유지 + beat-plan 범위 안
  const inScopeGap = bp.coverage_gap.filter((g) => beatInScope(g.beat_id, onlySet))
  const keptGap = existingGap.filter((g) => !beatInScope(g.beat_id, onlySet))
  const coverageGap = keptGap.concat(inScopeGap)

  return { beats: resultBeats, segments: resultSegments, shots: resultShots, coverageGap, needShots, preservedShots, rebinding }
}

/** Z1 사후조건: 새 need 샷이 같은 asset_kind 보존 샷과 allowed_overlap 초과로 겹치면 위반. */
function checkPostcondition(plan: MergePlan, allowedOverlap: number): PostconditionViolation[] {
  const violations: PostconditionViolation[] = []
  for (const n of plan.needShots) {
    const ns = num(n['start'])
    const ne = num(n['end'])
    const nk = String(n['asset_kind'])
    for (const p of plan.preservedShots) {
      if (String(p['asset_kind']) !== nk) continue
      const ov = overlapSec(ns, ne, num(p['start']), num(p['end']))
      if (ov > allowedOverlap) {
        violations.push({ need_shot_id: String(n['shot_id']), preserved_shot_id: String(p['shot_id']), asset_kind: nk, overlap_sec: Number(ov.toFixed(DP)) })
      }
    }
  }
  return violations
}

const DP = 3 // @unit 중첩 표기 소수 자릿수

/* ─────────────── 초기 생성 ─────────────── */

function createInitial(planPath: string, bp: BeatPlan, projectDir: string): void {
  const profile = loadProfile(projectDir, { bootstrap: true })
  const frame = loadFrame(projectDir, { bootstrap: true })
  const doc: Doc = {
    project: bp.project,
    revision: INITIAL_REVISION,
    profile_rev: profile.profile_rev,
    frame_rev: frame.frame_rev,
    writers: { plan_rev: INITIAL_PLAN_REV, review_rev: 0, reanchor_rev: 0, seal: '' },
    coverage_gap: bp.coverage_gap,
    segments: bp.segments,
    beats: bp.beats,
    shots: bp.shots,
  }
  const clone = structuredClone(doc)
  delete (clone['writers'] as { seal?: string }).seal
  ;(doc['writers'] as { seal: string }).seal = sealHash(clone)
  writeAtomic(planPath, doc)
}

/* ─────────────── 진입점 ─────────────── */

export function runPlan(projectDir: string, opts: PlanOptions): { summary: PlanSummary; exitCode: number } {
  const planPath = resolve(projectDir, 'shot-plan.json')
  const bp = loadBeatPlan(resolve(opts.applyPath))
  const onlySet = new Set(opts.only)
  const profile = loadProfile(projectDir, { bootstrap: true })
  const allowedOverlap = profile.tracks.allowed_overlap_sec

  const existing: MutableDoc | null = existsSync(planPath)
    ? (JSON.parse(readFileSync(planPath, 'utf8')) as MutableDoc)
    : null

  const merge = computeMerge(existing, bp, onlySet)

  // Z1 사후조건 검사 — 위반 시 abort(파일 무변경, exit 1)
  const violations = checkPostcondition(merge, allowedOverlap)
  if (violations.length > 0) {
    const summary: PlanSummary = {
      ok: false,
      mode: existing ? 'merge' : 'initial',
      beats: merge.beats.length,
      shots: merge.shots.length,
      need_shots: merge.needShots.length,
      preserved: merge.preservedShots.length,
      rebinding: merge.rebinding,
      coverage_gap: merge.coverageGap.length,
      postcondition_violations: violations,
    }
    if (opts.human) {
      process.stderr.write(`\n■ plan --apply ABORT — Z1 사후조건 위반 ${violations.length}건 (보존 샷 시간대에 새 need 샷 생성)\n`)
      for (const v of violations) {
        process.stderr.write(`  x ${v.need_shot_id} ↔ ${v.preserved_shot_id} (${v.asset_kind}) 중첩 ${v.overlap_sec}초\n`)
      }
    }
    return { summary, exitCode: 1 }
  }

  if (existing === null) {
    createInitial(planPath, bp, projectDir)
  } else {
    writeScoped(planPath, 'Z1', (doc) => {
      doc.segments = merge.segments as MutableDoc['segments']
      doc.beats = merge.beats as MutableDoc['beats']
      doc.shots = merge.shots as MutableDoc['shots']
      doc.coverage_gap = merge.coverageGap
    })
  }

  const summary: PlanSummary = {
    ok: true,
    mode: existing ? 'merge' : 'initial',
    beats: merge.beats.length,
    shots: merge.shots.length,
    need_shots: merge.needShots.length,
    preserved: merge.preservedShots.length,
    rebinding: merge.rebinding,
    coverage_gap: merge.coverageGap.length,
    postcondition_violations: [],
  }
  if (opts.human) {
    process.stderr.write(`\n■ plan --apply — mode=${summary.mode} beats=${summary.beats} shots=${summary.shots} need=${summary.need_shots} preserved=${summary.preserved} rebind=${summary.rebinding.length} coverage_gap=${summary.coverage_gap}\n`)
  }
  return { summary, exitCode: 0 }
}
