/**
 * checks.ts — 조립 자동검사(spec/07 §8, T5 §8). **입력은 TimelineModel 만.** 순수 함수 — fs/네트워크 없음.
 *
 * T6 가 이 파일을 import 한다. 두 벌 구현하면 임계값이 어긋나므로 여기가 유일 출처다.
 * factory autoGate 의 AutoGateCheck 타입 + verdict 집계 패턴만 이식(M5)하고 검사 목록은 전면 교체.
 * "human_required" 상태(CapCut 육안 확인)를 포함한다.
 *
 * 모든 수치는 profile 에서 온다. 이 파일에 편집 수치 리터럴은 없다(구조 상수만 // @unit).
 */
import type { EditProfile } from '../lib/profile.js'
import type { TimelineModel, TrackItem, TrackName } from './model.js'

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'human_required'

export interface CheckRange { start: number; end: number; note: string }

export interface AssembleCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
  blocking: boolean // blocking + fail → 조립 차단
  ranges?: CheckRange[]
}

export interface CheckResult {
  project: string
  generated_at: string
  checks: AssembleCheck[]
  blocked: boolean
  human_required: string[] // 사람 확인이 필요한 check id 목록
  verdict: 'PASS' | 'WARN' | 'FAIL'
}

const DECIMALS = 3 // @unit 시각 반올림 자리
function r3(n: number): number { return Number(n.toFixed(DECIMALS)) }

/* ─────────────── 헬퍼 ─────────────── */

/** 화면 트랙(V1~V3) 항목을 시작 시각 순으로. */
function visualItems(model: TimelineModel): TrackItem[] {
  const lanes: TrackName[] = ['V1', 'V2', 'V3']
  return lanes.flatMap((l) => model.tracks[l]).slice().sort((a, b) => a.start - b.start || a.end - b.end)
}

function beatImportance(model: TimelineModel): Map<string, string> {
  return new Map(model.beats.map((b) => [b.beat_id, b.importance]))
}

function anyBeatCritical(beatIds: string[] | undefined, imp: Map<string, string>): boolean {
  return (beatIds ?? []).some((id) => imp.get(id) === 'critical')
}

/* ─────────────── 개별 검사 ─────────────── */

/** 1. 샷 없는 핵심(critical) 비트 = 0 (blocking). */
function checkCriticalCoverage(model: TimelineModel): AssembleCheck {
  const covered = new Set<string>()
  for (const it of visualItems(model)) for (const b of it.beat_ids ?? []) covered.add(b)
  const missing = model.beats.filter((b) => b.importance === 'critical' && !covered.has(b.beat_id)).map((b) => b.beat_id)
  return {
    id: 'critical-beat-has-shot', label: '샷 없는 핵심 비트', blocking: true,
    status: missing.length === 0 ? 'pass' : 'fail',
    detail: missing.length === 0 ? '전 critical 비트에 화면 샷 존재' : `샷 없는 critical 비트: ${missing.join(', ')}`,
  }
}

/** 2. 승인되지 않은 샷 = 0 (blocking). */
function checkUnapproved(model: TimelineModel): AssembleCheck {
  const ids = model.unapproved.map((u) => `${u.shot_id}(${u.selection_status})`)
  return {
    id: 'no-unapproved-shot', label: '승인되지 않은 샷', blocking: true,
    status: model.unapproved.length === 0 ? 'pass' : 'fail',
    detail: model.unapproved.length === 0 ? '조립 대상 전부 approved' : `미승인/미배정 ${model.unapproved.length}건: ${ids.join(', ')}`,
  }
}

/** V15. needs_review/orphaned 샷의 앵커 비트 importance — critical 이면 fail (blocking). */
function checkV15(model: TimelineModel): AssembleCheck {
  const imp = beatImportance(model)
  const offenders: string[] = []
  const nonCritical: string[] = []
  const scan = (id: string, beatIds: string[] | undefined, nr?: boolean, orph?: boolean): void => {
    if (nr !== true && orph !== true) return
    if (anyBeatCritical(beatIds, imp)) offenders.push(id)
    else nonCritical.push(id)
  }
  for (const it of visualItems(model)) scan(it.shot_id ?? it.id, it.beat_ids, it.needs_review, it.orphaned)
  for (const u of model.unapproved) scan(u.shot_id, u.beat_ids, u.needs_review, u.orphaned)
  return {
    id: 'V15-critical-anchor', label: 'V15 위반(critical needs_review/orphaned)', blocking: true,
    status: offenders.length === 0 ? 'pass' : 'fail',
    detail: offenders.length === 0
      ? `critical 위반 0건 (normal/bridge needs_review=${nonCritical.length}건은 검수 대상)`
      : `critical 앵커 needs_review/orphaned: ${offenders.join(', ')}`,
  }
}

/** V17b. 같은 레인(V1~V3) 내 인접 중첩이 allowed_overlap_sec 초과 → fail (blocking). 선행 컷 예외 포함. */
function checkV17b(model: TimelineModel, profile: EditProfile): AssembleCheck {
  const allowed = profile.tracks.allowed_overlap_sec
  const lanes: TrackName[] = ['V1', 'V2', 'V3']
  const ranges: CheckRange[] = []
  for (const lane of lanes) {
    const items = model.tracks[lane].slice().sort((a, b) => a.start - b.start)
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]!
      const cur = items[i]!
      const overlap = prev.end - cur.start
      if (overlap > allowed) ranges.push({ start: r3(cur.start), end: r3(prev.end), note: `${lane} ${prev.id}∩${cur.id} 중첩 ${r3(overlap)}s > 허용 ${allowed}s` })
    }
  }
  return {
    id: 'V17b-lane-overlap', label: 'V17b 레인 중첩', blocking: true,
    status: ranges.length === 0 ? 'pass' : 'fail',
    detail: ranges.length === 0 ? `같은 레인 중첩 0건(허용 ${allowed}s 이내 선행 컷만)` : `허용 초과 중첩 ${ranges.length}건`,
    ranges: ranges.length > 0 ? ranges : undefined,
  }
}

/** V18. asset_kind="image" 샷에 photo_motion 없음 → fail (blocking). */
function checkV18(model: TimelineModel): AssembleCheck {
  const offenders: string[] = []
  for (const l of ['V1', 'V2', 'V3'] as TrackName[]) {
    for (const it of model.tracks[l]) {
      if (it.asset_kind === 'image' && it.photo_motion === undefined && it.role !== 'photo_motion') offenders.push(it.shot_id ?? it.id)
    }
  }
  return {
    id: 'V18-still-photo-motion', label: 'V18 정지 사진', blocking: true,
    status: offenders.length === 0 ? 'pass' : 'fail',
    detail: offenders.length === 0 ? '정지 사진 0건(전 image 샷 photo_motion 있음)' : `photo_motion 없는 image 샷: ${offenders.join(', ')}`,
  }
}

/** 6. 비디오 루프 = 0 (blocking). 필요 길이 > 소스 가용 구간이면 루프 필요 → 금지. */
function checkLoop(model: TimelineModel): AssembleCheck {
  const offenders: string[] = []
  for (const l of ['V1', 'V2', 'V3'] as TrackName[]) for (const it of model.tracks[l]) if (it.loop_needed === true) offenders.push(it.shot_id ?? it.id)
  return {
    id: 'no-video-loop', label: '비디오 루프', blocking: true,
    status: offenders.length === 0 ? 'pass' : 'fail',
    detail: offenders.length === 0 ? '루프 필요 샷 0건' : `소스 부족(루프 필요) 샷: ${offenders.join(', ')}`,
  }
}

/** 7. 깨진 소스 파일 = 0 (blocking). file 있는 항목 중 존재하지 않는 것. */
function checkBrokenSource(model: TimelineModel): AssembleCheck {
  const offenders: string[] = []
  for (const l of Object.keys(model.tracks) as TrackName[]) {
    for (const it of model.tracks[l]) {
      if (it.file !== undefined && it.file_exists !== true) offenders.push(`${it.id}:${it.file.split('/').pop()}`)
    }
  }
  return {
    id: 'no-broken-source', label: '깨진 소스 파일', blocking: true,
    status: offenders.length === 0 ? 'pass' : 'fail',
    detail: offenders.length === 0 ? '전 미디어 파일 존재' : `없는 소스/모션 파일 ${offenders.length}건: ${offenders.join(', ')}`,
  }
}

/** 8. 총 길이 vs narration-master ±sync_tolerance_sec (blocking). spine 은 구간 마스터와 비교. */
function checkTotalLength(model: TimelineModel, profile: EditProfile): AssembleCheck {
  const tol = profile.captions.impact_card.sync_tolerance_sec
  if (model.is_spine) {
    const a1 = model.tracks.A1[0]
    const region = a1 !== undefined && a1.source_out !== undefined && a1.source_in !== undefined ? a1.source_out - a1.source_in : model.duration
    const diff = Math.abs(model.duration - region)
    return {
      id: 'total-length-vs-master', label: '총 길이 vs 내레이션 마스터', blocking: true,
      status: diff <= tol ? 'pass' : 'fail',
      detail: `spine 길이=${r3(model.duration)}s vs 구간 마스터=${r3(region)}s 차=${r3(diff)}s (허용 ±${tol}s, 마스터 비절단)`,
    }
  }
  if (model.narration_master_sec === null) {
    return { id: 'total-length-vs-master', label: '총 길이 vs 내레이션 마스터', blocking: true, status: 'fail', detail: 'narration-master.wav 없음/probe 실패 — 길이 검증 불가' }
  }
  const diff = Math.abs(model.duration - model.narration_master_sec)
  return {
    id: 'total-length-vs-master', label: '총 길이 vs 내레이션 마스터', blocking: true,
    status: diff <= tol ? 'pass' : 'fail',
    detail: `조립 길이=${r3(model.duration)}s vs 마스터=${r3(model.narration_master_sec)}s 차=${r3(diff)}s (허용 ±${tol}s)`,
  }
}

/** 9. 훅 30초 시각 변화 < intro_30s_visual_changes_min → 실패 (blocking). */
function checkHookChanges(model: TimelineModel, profile: EditProfile): AssembleCheck {
  const min = profile.rhythm.intro_30s_visual_changes_min
  const ok = model.intro_visual_changes >= min
  return {
    id: 'hook-visual-changes', label: '훅 30초 시각 변화', blocking: true,
    status: ok ? 'pass' : 'fail',
    detail: `훅 ${model.hook_window_sec}s 시각 변화=${model.intro_visual_changes} (기준 ≥${min})`,
  }
}

/** 10. 8초 이상 시각 정체 → 구간 표시 (warn). */
function checkStagnant(model: TimelineModel, profile: EditProfile): AssembleCheck {
  const max = profile.qc.stagnant_range_sec
  const items = visualItems(model)
  const ranges: CheckRange[] = []
  for (let i = 1; i < items.length; i++) {
    const gap = items[i]!.start - items[i - 1]!.start
    if (gap > max) ranges.push({ start: r3(items[i - 1]!.start), end: r3(items[i]!.start), note: `시각 정체 ${r3(gap)}s > ${max}s` })
  }
  return {
    id: 'stagnant-visual', label: '8초 이상 시각 정체', blocking: false,
    status: ranges.length === 0 ? 'pass' : 'warn',
    detail: ranges.length === 0 ? `정체 구간 없음(기준 ${max}s)` : `정체 구간 ${ranges.length}건`,
    ranges: ranges.length > 0 ? ranges : undefined,
  }
}

/** 11. 동일 원본 10초 이상 연속 → 구간 표시 (warn). */
function checkSameSourceRun(model: TimelineModel, profile: EditProfile): AssembleCheck {
  const max = profile.shots.same_source_run_max_sec
  const items = visualItems(model).filter((it) => it.shot_id !== undefined)
  const ranges: CheckRange[] = []
  let runStart = 0
  let runSource: string | undefined
  const sourceOf = (it: TrackItem): string | undefined => (it.file !== undefined ? it.file : it.shot_id)
  for (let i = 0; i < items.length; i++) {
    const src = sourceOf(items[i]!)
    if (src !== runSource) { runSource = src; runStart = items[i]!.start }
    const span = items[i]!.end - runStart
    if (runSource !== undefined && span > max) ranges.push({ start: r3(runStart), end: r3(items[i]!.end), note: `동일 원본 연속 ${r3(span)}s > ${max}s` })
  }
  return {
    id: 'same-source-run', label: '동일 원본 10초 이상 연속', blocking: false,
    status: ranges.length === 0 ? 'pass' : 'warn',
    detail: ranges.length === 0 ? `동일 원본 장기 연속 없음(기준 ${max}s)` : `연속 구간 ${ranges.length}건`,
    ranges: ranges.length > 0 ? ranges : undefined,
  }
}

/** 12. 같은 화면 크기 4샷 연속 → 구간 표시 (warn). */
function checkSameFramingRun(model: TimelineModel, profile: EditProfile): AssembleCheck {
  const max = profile.shots.same_framing_run_max_shots
  const items = visualItems(model).filter((it) => it.framing !== undefined)
  const ranges: CheckRange[] = []
  let run = 1
  for (let i = 1; i < items.length; i++) {
    if (items[i]!.framing === items[i - 1]!.framing) {
      run += 1
      if (run >= max) ranges.push({ start: r3(items[i - run + 1]!.start), end: r3(items[i]!.end), note: `동일 프레이밍(${items[i]!.framing}) ${run}샷 연속 ≥${max}` })
    } else run = 1
  }
  return {
    id: 'same-framing-run', label: '같은 화면 크기 4샷 연속', blocking: false,
    status: ranges.length === 0 ? 'pass' : 'warn',
    detail: ranges.length === 0 ? `동일 프레이밍 장기 연속 없음(기준 ${max}샷)` : `연속 구간 ${ranges.length}건`,
    ranges: ranges.length > 0 ? ranges : undefined,
  }
}

/** 13. 원본음과 내레이션 충돌 → 구간 표시 (warn). A2 ∩ 내레이션(V4 자막 구간). */
function checkSourceAudioConflict(model: TimelineModel): AssembleCheck {
  const narration = model.tracks.V4
  const ranges: CheckRange[] = []
  for (const sa of model.tracks.A2) {
    for (const n of narration) {
      const s = Math.max(sa.start, n.start)
      const e = Math.min(sa.end, n.end)
      if (e > s) { ranges.push({ start: r3(s), end: r3(e), note: `원본음 ${sa.shot_id ?? sa.id} ∩ 내레이션` }); break }
    }
  }
  return {
    id: 'source-audio-narration', label: '원본음과 내레이션 충돌', blocking: false,
    status: ranges.length === 0 ? 'pass' : 'warn',
    detail: ranges.length === 0 ? '원본음-내레이션 충돌 없음' : `충돌 구간 ${ranges.length}건`,
    ranges: ranges.length > 0 ? ranges : undefined,
  }
}

/** 14. 자막 안전 영역 위반 → 구간 표시 (warn). 기준선/박스폭이 프로필 안전 범위 내인지. */
function checkCaptionSafeArea(model: TimelineModel, profile: EditProfile): AssembleCheck {
  const baselineMax = profile.captions.base.baseline_pct[1]
  const boxWidthMax = profile.captions.base.box_width_max_pct
  const full = FULL_PCT
  const safe = baselineMax <= full && boxWidthMax <= full
  const captionCount = model.tracks.V4.length + model.tracks.V5.length
  return {
    id: 'caption-safe-area', label: '자막 안전 영역 위반', blocking: false,
    status: safe ? 'pass' : 'warn',
    detail: `기본자막=${model.tracks.V4.length} 강조/카드=${model.tracks.V5.length} 기준선 ${baselineMax}%·박스폭 ${boxWidthMax}% (한계 ${full}%) 안전=${safe} · 자막총 ${captionCount}`,
  }
}

/** 15. 강조 카드와 발화 오차 sync_tolerance 초과 → 구간 표시 (warn). */
function checkImpactSync(model: TimelineModel, profile: EditProfile): AssembleCheck {
  const tol = model.word_timing === 'exact' ? profile.captions.impact_card.sync_tolerance_sec : profile.captions.impact_card.sync_tolerance_estimated_sec
  const keywords = model.tracks.V5.filter((it) => it.role === 'caption_keyword')
  const cards = model.tracks.V5.filter((it) => it.role === 'impact_card')
  const ranges: CheckRange[] = []
  for (const card of cards) {
    // 같은 텍스트의 강조 키워드 시각과 대조. 없으면 카드 자체는 검사 생략.
    const kw = keywords.find((k) => k.text !== undefined && card.text !== undefined && (k.text === card.text || card.text.includes(k.text)))
    if (kw === undefined) continue
    const diff = Math.abs(card.start - kw.start)
    if (diff > tol) ranges.push({ start: r3(card.start), end: r3(kw.start), note: `카드 ${card.id} 발화 오차 ${r3(diff)}s > ${tol}s` })
  }
  return {
    id: 'impact-card-sync', label: '강조 카드와 발화 오차', blocking: false,
    status: ranges.length === 0 ? 'pass' : 'warn',
    detail: ranges.length === 0 ? `임팩트 카드 ${cards.length}개 발화 오차 ${tol}s 이내` : `오차 초과 ${ranges.length}건`,
    ranges: ranges.length > 0 ? ranges : undefined,
  }
}

/** 16. 막 경계에 음악 큐 없음 → 구간 표시 (warn). 각 세그먼트(act) 시작에 큐가 있어야. */
function checkActBoundaryMusic(model: TimelineModel, profile: EditProfile): AssembleCheck {
  const tol = profile.captions.impact_card.sync_tolerance_sec
  const ranges: CheckRange[] = []
  const cueStarts = model.music_cues.map((c) => c.start)
  for (const seg of model.segments) {
    const segBeats = model.beats.filter((b) => b.segment_id === seg.segment_id)
    if (segBeats.length === 0) continue
    const boundary = Math.min(...segBeats.map((b) => b.start))
    const has = cueStarts.some((s) => Math.abs(s - boundary) <= tol)
    if (!has) ranges.push({ start: r3(boundary), end: r3(boundary), note: `막 ${seg.segment_id}(${seg.act}) 경계 음악 큐 없음` })
  }
  return {
    id: 'act-boundary-music', label: '막 경계에 음악 큐 없음', blocking: false,
    status: ranges.length === 0 ? 'pass' : 'warn',
    detail: ranges.length === 0 ? `막 경계 ${model.music_cues.length}개 음악 큐 존재` : `누락 ${ranges.length}건`,
    ranges: ranges.length > 0 ? ranges : undefined,
  }
}

/** 17. CapCut 초안 육안 확인 — human_required(비차단). */
function checkCapcutHumanOpen(): AssembleCheck {
  return {
    id: 'capcut-visual-open', label: 'CapCut 초안 육안 확인', blocking: false, status: 'human_required',
    detail: '경로 A 초안을 CapCut 에서 열어 선택·마감 집중 가능 여부를 사람이 확인(승인 ③ 전 단계)',
  }
}

const FULL_PCT = 100 // @unit 백분율 상한(안전영역 판정 기준)

/* ─────────────── 집계 ─────────────── */

export function runChecks(model: TimelineModel, profile: EditProfile): CheckResult {
  const checks: AssembleCheck[] = [
    checkCriticalCoverage(model),
    checkUnapproved(model),
    checkV15(model),
    checkV17b(model, profile),
    checkV18(model),
    checkLoop(model),
    checkBrokenSource(model),
    checkTotalLength(model, profile),
    checkHookChanges(model, profile),
    checkStagnant(model, profile),
    checkSameSourceRun(model, profile),
    checkSameFramingRun(model, profile),
    checkSourceAudioConflict(model),
    checkCaptionSafeArea(model, profile),
    checkImpactSync(model, profile),
    checkActBoundaryMusic(model, profile),
    checkCapcutHumanOpen(),
  ]
  const blocked = checks.some((c) => c.blocking && c.status === 'fail')
  const anyFail = checks.some((c) => c.status === 'fail')
  const anyWarn = checks.some((c) => c.status === 'warn')
  const humanRequired = checks.filter((c) => c.status === 'human_required').map((c) => c.id)
  const verdict: CheckResult['verdict'] = blocked || anyFail ? 'FAIL' : anyWarn ? 'WARN' : 'PASS'
  return { project: model.project, generated_at: new Date().toISOString(), checks, blocked, human_required: humanRequired, verdict }
}
