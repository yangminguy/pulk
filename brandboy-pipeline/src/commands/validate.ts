/**
 * validate.ts — 스키마 + 치명 12종(V1~V12) + rev5 신설(V13·V14·V14b·V15·V17a·V18)
 *               + 품질 경고 13종(W1~W13) + V16·V18b (T1 §3)
 *
 * 수치는 하나도 코드에 없다. 전부 profile(edit-profile.json) 을 통해 읽는다.
 * 아래 @unit 상수는 편집 수치가 아니라 config 키 이름에 박힌 시간 창(15분·30초·15초) 단위다.
 *
 * 출력(T1 §4): { ok, profile_rev, frame_rev, fatal, warnings, blocked, invalidation }
 *  - fatal 또는 blocked 가 비어 있지 않으면 ok=false → CLI exit 1
 *  - 입력 오류(파일 없음·JSON 파싱 실패)는 loader 가 InputError 를 던져 CLI exit 2
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ShotPlan, Timeline, ACTS, VISUAL_FUNCTIONS,
  type Beat, type Shot, type Segment,
} from '../schema/pipeline.js'
import { sealHash } from '../lib/canonical.js'
import { loadProfile, loadFrame, type EditProfile, type FrameTokens } from '../lib/profile.js'

/* ─────────────── 시간 창 단위 (config 키 이름에 박힌 상수) ─────────────── */

const FIFTEEN_MIN_SEC = 900 // @unit 15분 창 (counts_per_15min · still_image_max_per_15min)
const INTRO_WINDOW_SEC = 30 // @unit 도입 30초 창 (rhythm.intro_30s_*)
const HOOK_WINDOW_SEC = 15 // @unit 첫 15초 훅 창 (W11)

const STOCK_LIKE = ['caption_card', 'fallback_text', 'stock'] // V6 — 증거로 못 쓰는 자산
const SELECTED_STATES = ['selected', 'approved'] // 소스가 확정된 상태
const SEVERITY_ORDER = ['bridge', 'normal', 'critical'] as const // V15 심각도 오름차순

/* ─────────────── 결과 타입 ─────────────── */

export interface Finding {
  rule: string
  detail: string
  beat_id?: string
  shot_id?: string
  range?: string
}

export interface ValidationResult {
  ok: boolean
  profile_rev: number
  frame_rev: number
  fatal: Finding[]
  warnings: Finding[]
  blocked: Finding[]
  invalidation: unknown
}

export interface ValidationStats {
  beats: number
  shots: number
  duration: number
  distribution: Record<string, number>
  ratios: { a_roll: number; motion: number; stock: number }
}

export interface ValidationInput {
  shotPlanRaw: unknown
  timelineRaw: unknown
  profile: EditProfile
  frame: FrameTokens
  catalog?: unknown[] // sources/catalog.json (V9). 없으면 V9 스킵
  claims?: { claim_id: string; importance: string; evidence_ids: string[] }[] // script-map (V2/V3). 없으면 스킵
}

/** 파일 없음·파싱 실패 — CLI 는 exit 2 로 매핑한다. */
export class InputError extends Error {}

/* ─────────────── 유틸 ─────────────── */

function severityOf(imp: string): number {
  return SEVERITY_ORDER.indexOf(imp as (typeof SEVERITY_ORDER)[number])
}

function windowIndex(startSec: number): number {
  return Math.floor(startSec / FIFTEEN_MIN_SEC)
}

function issuePaths(issues: readonly { path: readonly PropertyKey[]; code: string }[]): string {
  return issues.map((i) => `${i.path.map((p) => String(p)).join('.') || '(root)'}: ${i.code}`).join(' | ')
}

/* ─────────────── 핵심 검증 ─────────────── */

export function runValidation(input: ValidationInput): { result: ValidationResult; stats: ValidationStats } {
  const { profile, frame } = input
  const fatal: Finding[] = []
  const warnings: Finding[] = []
  const blocked: Finding[] = []
  let invalidation: unknown = null

  const emptyStats: ValidationStats = {
    beats: 0, shots: 0, duration: 0, distribution: {}, ratios: { a_roll: 0, motion: 0, stock: 0 },
  }

  // ── V14: 봉인 해시 (raw 기준, zod 파싱 전에 검사) ──
  const raw = input.shotPlanRaw as Record<string, unknown> | null
  const sealVal = (raw?.['writers'] as Record<string, unknown> | undefined)?.['seal']
  if (typeof sealVal !== 'string') {
    fatal.push({ rule: 'V14', detail: 'writers.seal 이 없다 (CLI 봉인 미수행 또는 외부 쓰기)' })
  } else {
    const clone = structuredClone(raw) as Record<string, unknown>
    const w = clone['writers'] as Record<string, unknown>
    delete w['seal']
    const computed = sealHash(clone)
    if (computed !== sealVal) {
      fatal.push({
        rule: 'V14',
        detail: `CLI 외부에서 shot-plan.json 이 수정되었다. seal=${sealVal.slice(0, HASH_PREVIEW)}… computed=${computed.slice(0, HASH_PREVIEW)}…`,
      })
    }
  }

  // ── 스키마 파싱 ──
  const sp = ShotPlan.safeParse(input.shotPlanRaw)
  if (!sp.success) {
    fatal.push({ rule: 'SCHEMA', detail: `shot-plan.json 스키마 위반 — ${issuePaths(sp.error.issues)}` })
    return { result: finalize(profile, frame, fatal, warnings, blocked, invalidation), stats: emptyStats }
  }
  const tl = Timeline.safeParse(input.timelineRaw)
  if (!tl.success) {
    fatal.push({ rule: 'SCHEMA', detail: `timeline.json 스키마 위반 — ${issuePaths(tl.error.issues)}` })
    return { result: finalize(profile, frame, fatal, warnings, blocked, invalidation), stats: emptyStats }
  }

  const plan = sp.data
  const timeline = tl.data
  const beats = plan.beats
  const shots = plan.shots
  const segments = plan.segments

  const beatById = new Map<string, Beat>(beats.map((b) => [b.beat_id, b]))
  const approvedShots = shots.filter((s) => s.selection_status === 'approved')
  const shotsForBeat = (beatId: string): Shot[] => shots.filter((s) => s.beat_ids.includes(beatId))

  // 한 샷의 앵커 비트 중 최고 심각도 importance (V15/V18b — critical 지배)
  const shotSeverity = (shot: Shot): number => {
    let sev = -1
    for (const bid of shot.beat_ids) {
      const b = beatById.get(bid)
      if (b) sev = Math.max(sev, severityOf(b.importance))
    }
    return sev
  }

  /* ── V1: ID 중복 ── */
  checkDup(segments.map((s) => s.segment_id), 'segment_id', fatal)
  checkDup(beats.map((b) => b.beat_id), 'beat_id', fatal)
  checkDup(shots.map((s) => s.shot_id), 'shot_id', fatal)

  /* ── V2/V3: 주장 연결·근거 (script-map 있을 때만) ── */
  if (input.claims) {
    const claimIds = new Set(input.claims.map((c) => c.claim_id))
    const referenced = new Set<string>()
    for (const b of beats) b.claim_ids.forEach((c) => referenced.add(c))
    for (const s of timeline.sentences) s.claim_ids.forEach((c) => referenced.add(c))
    for (const cid of referenced) {
      if (!claimIds.has(cid)) fatal.push({ rule: 'V2', detail: `claim_id 가 실제 주장에 연결되지 않음: ${cid}` })
    }
    for (const c of input.claims) {
      if (c.importance === 'critical' && c.evidence_ids.length === 0) {
        fatal.push({ rule: 'V3', detail: `critical 주장에 근거 없음: ${c.claim_id}` })
      }
    }
  }

  /* ── V4: 내레이션 전 구간이 비트로 덮인다 (공백 ≤ coverage_gap_max_sec) ── */
  const gapMax = profile.beats.coverage_gap_max_sec
  const sorted = [...beats].sort((a, b) => a.start - b.start)
  let cursor = 0
  for (const b of sorted) {
    if (b.start - cursor > gapMax) {
      fatal.push({ rule: 'V4', beat_id: b.beat_id, detail: `비트 커버리지 공백 ${(b.start - cursor).toFixed(DP)}초 (기준 ${gapMax}초)` })
    }
    cursor = Math.max(cursor, b.end)
  }
  if (timeline.duration - cursor > gapMax) {
    fatal.push({ rule: 'V4', detail: `말미 커버리지 공백 ${(timeline.duration - cursor).toFixed(DP)}초 (기준 ${gapMax}초)` })
  }

  /* ── V5: 비트 시간 겹침·역전 ── */
  for (const b of beats) {
    if (b.end <= b.start) fatal.push({ rule: 'V5', beat_id: b.beat_id, detail: `비트 시간 역전 start=${b.start} end=${b.end}` })
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const cur = sorted[i]!
    if (cur.start < prev.end) {
      fatal.push({ rule: 'V5', beat_id: cur.beat_id, detail: `비트 겹침 ${prev.beat_id}.end=${prev.end} > ${cur.beat_id}.start=${cur.start}` })
    }
  }

  /* ── V6: evidence 비트를 스톡류만으로 승인 불가 ── */
  for (const b of beats) {
    if (b.visual_function !== 'evidence') continue
    const approved = shotsForBeat(b.beat_id).filter((s) => s.selection_status === 'approved')
    if (approved.length === 0) continue
    const hasReal = approved.some((s) => !STOCK_LIKE.includes(s.asset_kind))
    if (!hasReal) fatal.push({ rule: 'V6', beat_id: b.beat_id, detail: 'evidence 비트가 caption_card·fallback_text·stock 만으로 승인됨' })
  }

  /* ── V7: critical 비트에 승인 샷 ≥ 1 ── */
  for (const b of beats) {
    if (b.importance !== 'critical') continue
    const approved = shotsForBeat(b.beat_id).filter((s) => s.selection_status === 'approved')
    if (approved.length === 0) fatal.push({ rule: 'V7', beat_id: b.beat_id, detail: 'critical 비트에 승인된 샷이 없음' })
  }

  /* ── V8: 선택/승인 샷의 권리가 blocking 상태 불가 ── */
  const blockingRights = new Set(profile.qc.blocking_rights_status)
  for (const s of shots) {
    if (SELECTED_STATES.includes(s.selection_status) && blockingRights.has(s.rights_status)) {
      fatal.push({ rule: 'V8', shot_id: s.shot_id, detail: `${s.selection_status} 샷의 권리 상태가 ${s.rights_status}` })
    }
  }

  /* ── V9: 선택된 외부 자산에 원본 URL·게시자 (catalog 있을 때만) ── */
  if (input.catalog) {
    const byId = new Map<string, Record<string, unknown>>()
    for (const src of input.catalog as Record<string, unknown>[]) {
      if (typeof src['source_id'] === 'string') byId.set(src['source_id'], src)
    }
    for (const s of shots) {
      if (!SELECTED_STATES.includes(s.selection_status) || s.source_id === undefined) continue
      if (s.asset_kind === 'a_roll' || s.asset_kind === 'motion' || s.asset_kind === 'caption_card') continue
      const src = byId.get(s.source_id)
      const url = src?.['original_url']
      const publisher = src?.['publisher']
      if (typeof url !== 'string' || url.length === 0 || typeof publisher !== 'string' || publisher.length === 0) {
        fatal.push({ rule: 'V9', shot_id: s.shot_id, detail: `외부 자산 ${s.source_id} 에 원본 URL·게시자 누락` })
      }
    }
  }

  /* ── V10: source_in < source_out ── */
  for (const s of shots) {
    if (s.source_in !== undefined && s.source_out !== undefined && s.source_in >= s.source_out) {
      fatal.push({ rule: 'V10', shot_id: s.shot_id, detail: `source_in(${s.source_in}) ≥ source_out(${s.source_out})` })
    }
  }

  /* ── V11: fallback_text 는 approved 불가 ── */
  for (const s of shots) {
    if (s.asset_kind === 'fallback_text' && s.selection_status === 'approved') {
      fatal.push({ rule: 'V11', shot_id: s.shot_id, detail: 'fallback_text 샷이 approved' })
    }
  }

  /* ── V12: 세그먼트의 막 순서 역전 불가 ── */
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]!
    const cur = segments[i]!
    if (actIndex(cur) < actIndex(prev)) {
      fatal.push({ rule: 'V12', detail: `막 순서 역전 ${prev.segment_id}(${prev.act}) → ${cur.segment_id}(${cur.act})` })
    }
  }

  /* ── V13: shot.timing_rev == timeline.align_rev (orphaned/needs_review 제외 — V15 담당) ── */
  for (const s of shots) {
    if (s.needs_review || s.orphaned) continue
    if (s.timing_rev !== timeline.align_rev) {
      fatal.push({ rule: 'V13', shot_id: s.shot_id, detail: `timing_rev ${s.timing_rev} != align_rev ${timeline.align_rev} (낡은 시각)` })
    }
  }

  /* ── V14b: 구역 정합 ── */
  for (const s of shots) {
    if (s.selection_status === 'approved' && s.source_id === undefined) {
      fatal.push({ rule: 'V14b', shot_id: s.shot_id, detail: 'approved 인데 source_id 없음' })
    }
    if (s.locked_selection && s.source_in === undefined) {
      fatal.push({ rule: 'V14b', shot_id: s.shot_id, detail: 'locked_selection 인데 source_in 없음' })
    }
  }
  if (plan.writers.reanchor_rev < plan.writers.plan_rev) {
    fatal.push({ rule: 'V14b', detail: `writers.reanchor_rev(${plan.writers.reanchor_rev}) < plan_rev(${plan.writers.plan_rev})` })
  }

  /* ── V15: orphaned/needs_review 샷의 앵커 비트 importance 별 차등 ── */
  for (const s of shots) {
    if (!s.needs_review && !s.orphaned) continue
    const flag = s.orphaned ? 'orphaned' : 'needs_review'
    const sev = shotSeverity(s)
    if (sev === severityOf('critical')) {
      blocked.push({ rule: 'V15', shot_id: s.shot_id, detail: `critical 앵커 비트의 ${flag} 샷 — assemble 중단, 사람 결정 필요` })
    } else if (sev === severityOf('normal')) {
      warnings.push({ rule: 'V15', shot_id: s.shot_id, detail: `normal 앵커 비트의 ${flag} 샷 — 검수 대상` })
    } else {
      warnings.push({ rule: 'V15', shot_id: s.shot_id, detail: `bridge 앵커 비트의 ${flag} 샷 — 리포트 표시만 (진행)` })
    }
  }

  /* ── V16: profile_rev / frame_rev 불일치 (경고 + 무효화 표 요약) ── */
  const revMismatch =
    plan.profile_rev !== profile.profile_rev ||
    timeline.profile_rev !== profile.profile_rev ||
    plan.frame_rev !== frame.frame_rev
  if (revMismatch) {
    warnings.push({ rule: 'V16', detail: `profile_rev/frame_rev 불일치 — SCOPES §4 무효화 표 확인` })
    invalidation = {
      profile_rev: { expected: profile.profile_rev, shot_plan: plan.profile_rev, timeline: timeline.profile_rev },
      frame_rev: { expected: frame.frame_rev, shot_plan: plan.frame_rev },
      note: 'SCOPES §4 — 변경 그룹(video/align/audio/acts/captions/frame/motion/photo_motion 등)에 따라 재생성 대상이 다르다',
    }
  }

  /* ── V17a: 같은 asset_kind 샷끼리 중첩 > allowed_overlap_sec (레인 매핑 금지) ── */
  const allowedOverlap = profile.tracks.allowed_overlap_sec
  const byKind = new Map<string, Shot[]>()
  for (const s of shots) {
    const arr = byKind.get(s.asset_kind) ?? []
    arr.push(s)
    byKind.set(s.asset_kind, arr)
  }
  for (const [kind, group] of byKind) {
    const g = [...group].sort((a, b) => a.start - b.start)
    for (let i = 1; i < g.length; i++) {
      const prev = g[i - 1]!
      const cur = g[i]!
      const overlap = prev.end - cur.start
      if (overlap > allowedOverlap) {
        fatal.push({ rule: 'V17a', shot_id: cur.shot_id, detail: `${kind} 샷 중첩 ${overlap.toFixed(DP)}초 (${prev.shot_id}↔${cur.shot_id}, 허용 ${allowedOverlap}초)` })
      }
    }
  }

  /* ── V18 / V18b: 사진 촬영모션 ── */
  const stillOnEmphasis = profile.sources.still_only_on_emphasis
  const stillMaxPer15 = profile.sources.still_image_max_per_15min[1]
  const imageWindowCount = new Map<number, number>()
  for (const s of shots) {
    if (s.asset_kind !== 'image') continue
    if (s.photo_motion === undefined) {
      fatal.push({ rule: 'V18', shot_id: s.shot_id, detail: 'image 샷에 photo_motion 없음 (정지 사진 차단, 기본 parallax)' })
    }
    if (stillOnEmphasis && shotSeverity(s) !== severityOf('critical')) {
      warnings.push({ rule: 'V18b', shot_id: s.shot_id, detail: '비강조(비-critical) 비트의 사진 — 영상 우선 원칙 위반 소지' })
    }
    const wi = windowIndex(s.start)
    imageWindowCount.set(wi, (imageWindowCount.get(wi) ?? 0) + 1)
  }
  for (const [wi, count] of imageWindowCount) {
    if (count > stillMaxPer15) {
      warnings.push({ rule: 'V18b', range: `${wi * FIFTEEN_MIN_SEC}-${(wi + 1) * FIFTEEN_MIN_SEC}s`, detail: `15분당 사진 ${count}장 (상한 ${stillMaxPer15}장)` })
    }
  }

  /* ── 통계 (경고 계산 + 출력용) ── */
  const stats = computeStats(beats, shots, timeline.duration)

  /* ── 품질 경고 W1~W13 ── */
  runWarnings(beats, shots, segments, timeline.duration, profile, stats, warnings)

  return { result: finalize(profile, frame, fatal, warnings, blocked, invalidation), stats }
}

const DP = 3 // @unit 상세 메시지 표기 소수 자릿수
const HASH_PREVIEW = 12 // @unit seal diff 미리보기 길이

function actIndex(seg: Segment): number {
  return ACTS.indexOf(seg.act)
}

function checkDup(ids: string[], label: string, fatal: Finding[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) fatal.push({ rule: 'V1', detail: `${label} 중복: ${id}` })
    seen.add(id)
  }
}

function computeStats(beats: Beat[], shots: Shot[], duration: number): ValidationStats {
  const distribution: Record<string, number> = {}
  for (const fn of VISUAL_FUNCTIONS) distribution[fn] = 0
  for (const b of beats) distribution[b.visual_function] = (distribution[b.visual_function] ?? 0) + 1
  const total = shots.length
  const ratioOf = (kind: string): number => (total === 0 ? 0 : shots.filter((s) => s.asset_kind === kind).length / total)
  return {
    beats: beats.length,
    shots: total,
    duration,
    distribution,
    ratios: { a_roll: ratioOf('a_roll'), motion: ratioOf('motion'), stock: ratioOf('stock') },
  }
}

function runWarnings(
  beats: Beat[],
  shots: Shot[],
  segments: Segment[],
  duration: number,
  profile: EditProfile,
  stats: ValidationStats,
  warnings: Finding[],
): void {
  const segById = new Map<string, Segment>(segments.map((s) => [s.segment_id, s]))

  // W1: 비트 길이 초과
  for (const b of beats) {
    if (b.end - b.start > profile.beats.max_duration_sec) {
      warnings.push({ rule: 'W1', beat_id: b.beat_id, detail: `비트 ${(b.end - b.start).toFixed(DP)}초 (기준 ${profile.beats.max_duration_sec}초)` })
    }
  }
  // W2: 정지 이미지 샷 길이 초과
  for (const s of shots) {
    if ((s.asset_kind === 'still' || s.asset_kind === 'image') && s.end - s.start > profile.shots.still_max_sec) {
      warnings.push({ rule: 'W2', shot_id: s.shot_id, detail: `정지 이미지 ${(s.end - s.start).toFixed(DP)}초 (기준 ${profile.shots.still_max_sec}초)` })
    }
  }
  // W3: 동일 원본 연속 사용 길이 초과
  const byStart = [...shots].sort((a, b) => a.start - b.start)
  let runSource: string | undefined
  let runStart = 0
  let runEnd = 0
  for (const s of byStart) {
    if (s.source_id !== undefined && s.source_id === runSource) {
      runEnd = Math.max(runEnd, s.end)
    } else {
      if (runSource !== undefined && runEnd - runStart > profile.shots.same_source_run_max_sec) {
        warnings.push({ rule: 'W3', range: `${runStart.toFixed(DP)}-${runEnd.toFixed(DP)}s`, detail: `동일 원본 ${runSource} ${(runEnd - runStart).toFixed(DP)}초 연속 (기준 ${profile.shots.same_source_run_max_sec}초)` })
      }
      runSource = s.source_id
      runStart = s.start
      runEnd = s.end
    }
  }
  if (runSource !== undefined && runEnd - runStart > profile.shots.same_source_run_max_sec) {
    warnings.push({ rule: 'W3', range: `${runStart.toFixed(DP)}-${runEnd.toFixed(DP)}s`, detail: `동일 원본 ${runSource} ${(runEnd - runStart).toFixed(DP)}초 연속 (기준 ${profile.shots.same_source_run_max_sec}초)` })
  }
  // W4: reset 비트 간격 초과 (도입 길이 이상일 때만)
  const resetInterval = profile.rhythm.presenter_reset_interval_sec[1]
  if (duration > resetInterval) {
    const resets = beats.filter((b) => b.visual_function === 'reset').map((b) => b.start).sort((a, b) => a - b)
    let last = 0
    let maxGap = 0
    for (const r of resets) { maxGap = Math.max(maxGap, r - last); last = r }
    maxGap = Math.max(maxGap, duration - last)
    if (maxGap > resetInterval) warnings.push({ rule: 'W4', detail: `reset 비트 없이 ${maxGap.toFixed(DP)}초 (기준 ${resetInterval}초)` })
  }
  // W5: 도입 30초 시각 변화 수 (30초 이상 영상일 때만)
  if (duration >= INTRO_WINDOW_SEC) {
    const introChanges = shots.filter((s) => s.start < INTRO_WINDOW_SEC).length
    if (introChanges < profile.rhythm.intro_30s_visual_changes_min) {
      warnings.push({ rule: 'W5', detail: `도입 30초 시각 변화 ${introChanges}회 (기준 ${profile.rhythm.intro_30s_visual_changes_min}회 이상)` })
    }
  }
  // W6: 모션 비율 초과
  if (stats.ratios.motion > profile.ratios.motion[1]) {
    warnings.push({ rule: 'W6', detail: `모션 비율 ${stats.ratios.motion.toFixed(DP)} (기준 ${profile.ratios.motion[1]} 이하)` })
  }
  // W7: 스톡 비율 초과
  if (stats.ratios.stock > profile.ratios.stock_max) {
    warnings.push({ rule: 'W7', detail: `스톡 비율 ${stats.ratios.stock.toFixed(DP)} (기준 ${profile.ratios.stock_max} 이하)` })
  }
  // W8: 동일 소스가 외부 샷의 35% 초과
  const external = shots.filter((s) => s.source_id !== undefined && s.asset_kind !== 'a_roll' && s.asset_kind !== 'motion' && s.asset_kind !== 'caption_card')
  if (external.length > 0) {
    const perSource = new Map<string, number>()
    for (const s of external) perSource.set(s.source_id!, (perSource.get(s.source_id!) ?? 0) + 1)
    let maxRatio = 0
    let maxSrc = ''
    for (const [src, n] of perSource) { const r = n / external.length; if (r > maxRatio) { maxRatio = r; maxSrc = src } }
    if (maxRatio > profile.ratios.same_source_max) {
      warnings.push({ rule: 'W8', detail: `동일 소스 ${maxSrc} 가 외부 샷의 ${maxRatio.toFixed(DP)} (기준 ${profile.ratios.same_source_max} 이하)` })
    }
  }
  // W9: unknown/quotation_review 권리가 최종 승인에 남음
  for (const s of shots) {
    if (s.selection_status === 'approved' && (s.rights_status === 'unknown' || s.rights_status === 'quotation_review')) {
      warnings.push({ rule: 'W9', shot_id: s.shot_id, detail: `승인 샷에 ${s.rights_status} 권리 잔존` })
    }
  }
  // W10: 같은 화면 기능 연속
  const bySeq = [...beats].sort((a, b) => a.start - b.start)
  let run = 0
  let runFn: string | undefined
  for (const b of bySeq) {
    if (b.visual_function === runFn) { run++ } else { runFn = b.visual_function; run = 1 }
    if (run >= profile.qc.same_function_run_max) {
      warnings.push({ rule: 'W10', beat_id: b.beat_id, detail: `같은 화면 기능(${runFn}) ${run}연속 (기준 ${profile.qc.same_function_run_max})` })
    }
  }
  // W11: 첫 15초에 hook 기능 (15초 이상 영상일 때만)
  if (duration >= HOOK_WINDOW_SEC) {
    const hasHook = beats.some((b) => b.start < HOOK_WINDOW_SEC && segById.get(b.segment_id)?.act === 'hook')
    if (!hasHook) warnings.push({ rule: 'W11', detail: '첫 15초에 hook 막 비트가 없음' })
  }
  // W12: reveal 막에 반전 또는 해석 비트가 없음
  const revealSegs = segments.filter((s) => s.act === 'reveal')
  for (const seg of revealSegs) {
    const segBeats = beats.filter((b) => b.segment_id === seg.segment_id)
    const hasTurn = segBeats.some((b) => b.visual_function === 'evidence' || b.visual_function === 'explain' || b.emphasis_caption !== undefined)
    if (segBeats.length > 0 && !hasTurn) warnings.push({ rule: 'W12', detail: `reveal 막 ${seg.segment_id} 에 반전/해석 비트 없음` })
  }
  // W13: 15분당 caption_card 수 범위 밖 (완전한 15분 창만)
  const cardMin = profile.counts_per_15min.impact_cards[0]
  const cardMax = profile.counts_per_15min.impact_cards[1]
  const cardShots = shots.filter((s) => s.asset_kind === 'caption_card')
  const fullWindows = Math.floor(duration / FIFTEEN_MIN_SEC)
  for (let w = 0; w < fullWindows; w++) {
    const count = cardShots.filter((s) => windowIndex(s.start) === w).length
    if (count < cardMin || count > cardMax) {
      warnings.push({ rule: 'W13', range: `${w * FIFTEEN_MIN_SEC}-${(w + 1) * FIFTEEN_MIN_SEC}s`, detail: `caption_card ${count}개 (기준 ${cardMin}~${cardMax})` })
    }
  }
}

function finalize(
  profile: EditProfile,
  frame: FrameTokens,
  fatal: Finding[],
  warnings: Finding[],
  blocked: Finding[],
  invalidation: unknown,
): ValidationResult {
  return {
    ok: fatal.length === 0 && blocked.length === 0,
    profile_rev: profile.profile_rev,
    frame_rev: frame.frame_rev,
    fatal,
    warnings,
    blocked,
    invalidation,
  }
}

/* ─────────────── 프로젝트 로더 (CLI 경유) ─────────────── */

/** JSON 파일을 읽어 파싱한다. 없음/파싱 실패는 label 을 붙인 InputError 로 던진다(CLI 경유 로더 공용). */
export function readJsonOrThrow(path: string, label: string): unknown {
  if (!existsSync(path)) throw new InputError(`${label} 없음: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new InputError(`${label} 파싱 실패: ${path} · ${(err as Error).message}`)
  }
}

function readOptionalArray(path: string, key: string): unknown[] | undefined {
  if (!existsSync(path)) return undefined
  const data = JSON.parse(readFileSync(path, 'utf8'))
  if (Array.isArray(data)) return data
  const inner = (data as Record<string, unknown>)[key]
  return Array.isArray(inner) ? inner : undefined
}

export function validateProject(projectDir: string): { result: ValidationResult; stats: ValidationStats } {
  const shotPlanRaw = readJsonOrThrow(resolve(projectDir, 'shot-plan.json'), 'shot-plan.json')
  const timelineRaw = readJsonOrThrow(resolve(projectDir, 'timeline.json'), 'timeline.json')
  const profile = loadProfile(projectDir)
  const frame = loadFrame(projectDir)
  const catalog = readOptionalArray(resolve(projectDir, 'sources', 'catalog.json'), 'sources')
  const claims = readOptionalArray(resolve(projectDir, 'script-map.json'), 'claims') as
    | { claim_id: string; importance: string; evidence_ids: string[] }[]
    | undefined
  return runValidation({ shotPlanRaw, timelineRaw, profile, frame, catalog, claims })
}

/* ─────────────── 사람용 표 (--human) ─────────────── */

export function formatHuman(result: ValidationResult, stats: ValidationStats): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`■ validate — ok=${result.ok}  profile_rev=${result.profile_rev}  frame_rev=${result.frame_rev}`)
  lines.push(`  beats=${stats.beats} shots=${stats.shots} duration=${stats.duration}s`)
  lines.push(`  distribution=${JSON.stringify(stats.distribution)}`)
  lines.push(`  ratios=${JSON.stringify(stats.ratios)}`)
  const table = (title: string, rows: Finding[]): void => {
    lines.push(`  ── ${title} (${rows.length}) ──`)
    for (const f of rows) {
      const loc = f.shot_id ?? f.beat_id ?? f.range ?? '-'
      lines.push(`    [${f.rule}] ${loc}: ${f.detail}`)
    }
  }
  table('FATAL', result.fatal)
  table('BLOCKED', result.blocked)
  table('WARN', result.warnings)
  if (result.invalidation !== null) lines.push(`  invalidation=${JSON.stringify(result.invalidation)}`)
  lines.push('')
  return lines.join('\n')
}
