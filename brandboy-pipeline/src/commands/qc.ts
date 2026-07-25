/**
 * qc.ts — 정량 리포트 + 수정 목록 (T6, spec/08)
 *
 * T5 의 `assemble/checks.ts` 를 **import** 해 자동검사 17종을 같은 코드·같은 임계값으로 재사용한다
 * (복사하면 어긋난다 — PORTING.md M5). qc 는 여기에 **렌더 후에만 알 수 있는 검사**를 더한다:
 *  최종 라우드니스(narration-master loudnorm 실측) · 실제 파일 존재(순번 출력·CapCut 초안) · 총 길이 실측.
 *
 * 치명 12종(spec/08 §1) 중 **데이터로 판정 가능한 것만** 자동(pass/fail), 나머지는 human_required.
 * "자동 검사가 안 잡았다" ≠ "문제 없다" — human_required 를 pass 로 집계하지 않는다.
 *
 * 수치는 profile 이 유일 출처다. 임계값을 여기서 재구현하지 않는다. 아래 상수는 구조 상수(// @unit).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { writeAtomic, readJsonOrNull } from '../lib/io.js'
import { loadProfile, loadFrame, type EditProfile } from '../lib/profile.js'
import { ffmpegBin } from '../lib/probe.js'
import { run } from '../lib/proc.js'
import { InputError } from './validate.js'
import { buildModel, type TimelineModel, type TrackItem, type TrackName } from '../assemble/model.js'
import { runChecks, type AssembleCheck, type CheckStatus, type CheckResult } from '../assemble/checks.js'

export type Verdict = 'pass' | 'fail' | 'human_required'

/** 정량 지표 하나 — 값 + 기준값(range/min/max/target 중 하나) + 판정. */
export interface Metric {
  value: number | null
  range?: [number, number]
  min?: number
  max?: number
  target?: number
  verdict: Verdict
}
/** 사람만 판정 가능한 지표 — 값·기준값 없음. */
export interface HumanMetric { verdict: 'human_required' }

/** 치명 12종 분류표 한 줄. */
export interface FatalEntry { n: number; item: string; auto: boolean; rule: string; verdict: Verdict; detail: string }

/** 수정 목록 항목(P0/P1/P2). */
export interface FixItem { priority: 'P0' | 'P1' | 'P2'; rule: string; shot_id?: string; detail: string; action: string }

export interface QcReport {
  project: string
  profile_rev: number
  frame_rev: number
  is_spine: boolean
  metrics: Record<string, Metric | HumanMetric>
  shared_checks: AssembleCheck[] // T5 assemble/checks.ts 자동검사 17종(같은 코드·임계값 — render_report 와 일치)
  render_checks: AssembleCheck[] // 렌더 후에만 알 수 있는 검사(라우드니스·파일존재·길이)
  fatal: FatalEntry[] // 치명 12종 자동/수동 분류표
  warnings: string[] // V16 무효화 등
  human_required: string[] // 통과 처리 금지 — 사람 판정 대기 목록
  p0_count: number
  gate: 'BLOCKED' | 'HOLD_FOR_HUMAN' // 코드는 최종 PASS 를 선언하지 않는다(사람 4회 시청이 남는다)
}

export interface QcOptions { pilotPath?: string; human: boolean }
export interface QcResult { report: QcReport; fixList: FixItem[]; exitCode: number }

const DECIMALS = 3 // @unit 수치 반올림 자리
const SEC_PER_15MIN = 900 // @unit counts_per_15min 정규화 기준(15분=900초, 구조 상수)
function r3(n: number): number { return Number(n.toFixed(DECIMALS)) }

const PilotSchema = z.object({ spine: z.object({ from_sentence_key: z.string(), to_sentence_key: z.string() }) })

/* ─────────────── 입력 로드 ─────────────── */

interface PlanShot { shot_id: string; asset_kind: string; selection_status: string; rights_status: string; source_id?: string; beat_ids: string[] }
interface PlanBeat { beat_id: string; segment_id: string; visual_function: string; emphasis_caption?: string }
interface PlanSegment { segment_id: string; act: string }
interface ShotPlanFile { profile_rev: number; frame_rev: number; shots: PlanShot[]; beats: PlanBeat[]; segments: PlanSegment[] }

function checkStatus(checks: AssembleCheck[], id: string): CheckStatus | undefined {
  return checks.find((c) => c.id === id)?.status
}

/* ─────────────── 렌더 후 검사 ─────────────── */

/** 라우드니스 실측 — narration-master.wav loudnorm print(input_i=적분 LUFS, input_tp=트루피크 dBTP). */
async function measureLoudness(wav: string, timeoutSec: number): Promise<{ lufs: number | null; truePeak: number | null }> {
  if (!existsSync(wav)) return { lufs: null, truePeak: null }
  const r = await run(ffmpegBin(), ['-hide_banner', '-nostats', '-i', wav, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { timeoutSec })
  const m = r.stderr.match(/\{[^{}]*"input_i"[\s\S]*?\}/)
  if (m === null) return { lufs: null, truePeak: null }
  try {
    const j = JSON.parse(m[0]) as { input_i?: string; input_tp?: string }
    const lufs = Number(j.input_i)
    const tp = Number(j.input_tp)
    return { lufs: Number.isFinite(lufs) ? r3(lufs) : null, truePeak: Number.isFinite(tp) ? r3(tp) : null }
  } catch { return { lufs: null, truePeak: null } }
}

/** 실제 출력 파일 존재 — render_report 가 보고한 순번 출력·CapCut 초안이 디스크에 있는지 실측. */
function checkOutputsPresent(report: RenderReport, projectDir: string): AssembleCheck {
  const details: string[] = []
  let ok = true
  const numbered = report.outputs?.numbered
  if (numbered !== undefined) {
    const dir = resolve(projectDir, 'assemble', 'numbered')
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+_.*\.mp4$/.test(f)) : []
    const want = numbered.clips ?? 0
    if (files.length < want || want === 0) ok = false
    details.push(`순번 파일 ${files.length}/${want}`)
  }
  const capcut = report.outputs?.capcut
  if (capcut !== undefined && capcut.path !== undefined) {
    const draft = existsSync(resolve(capcut.path, 'draft_content.json'))
    if (!draft) ok = false
    details.push(`CapCut draft_content=${draft}`)
  }
  if (numbered === undefined && capcut === undefined) { ok = false; details.push('출력 없음(assemble 미실행?)') }
  return { id: 'outputs-present', label: '실제 출력 파일 존재', blocking: true, status: ok ? 'pass' : 'fail', detail: details.join(' · ') }
}

/** 총 길이 실측 — narration-master 실측 길이가 duration_target 범위 안인지(렌더 후 확정). */
function checkMeasuredLength(model: TimelineModel, profile: EditProfile): AssembleCheck {
  const measured = model.narration_master_sec
  const [lo, hi] = profile.video.duration_target_sec
  if (measured === null) return { id: 'measured-total-length', label: '총 길이 실측', blocking: false, status: 'fail', detail: 'narration-master 실측 실패' }
  const inRange = model.is_spine || (measured >= lo && measured <= hi)
  return {
    id: 'measured-total-length', label: '총 길이 실측', blocking: false,
    status: inRange ? 'pass' : 'warn',
    detail: `실측 ${r3(measured)}s (목표 ${lo}~${hi}s${model.is_spine ? ', spine 제외' : ''})`,
  }
}

/** 라우드니스 검사 2종을 AssembleCheck 로. */
function loudnessChecks(loud: { lufs: number | null; truePeak: number | null }, profile: EditProfile): AssembleCheck[] {
  const target = profile.audio.program_lufs
  const dev = profile.audio.session_lufs_deviation_max
  const tpMax = profile.audio.true_peak_dbtp
  const lufsOk = loud.lufs !== null && Math.abs(loud.lufs - target) <= dev
  const tpOk = loud.truePeak !== null && loud.truePeak <= tpMax
  return [
    { id: 'program-loudness', label: '프로그램 라우드니스', blocking: false, status: lufsOk ? 'pass' : 'fail', detail: `실측 ${loud.lufs ?? '측정불가'} LUFS (목표 ${target}±${dev})` },
    { id: 'true-peak', label: '트루 피크', blocking: false, status: tpOk ? 'pass' : 'fail', detail: `실측 ${loud.truePeak ?? '측정불가'} dBTP (한계 ≤${tpMax})` },
  ]
}

/* ─────────────── 정량 지표 ─────────────── */

/** 화면 메인 시퀀스(V1+V2) — 비율·리듬 지표의 분모/분자. */
function mainScreenItems(model: TimelineModel): TrackItem[] {
  const lanes: TrackName[] = ['V1', 'V2']
  return lanes.flatMap((l) => model.tracks[l]).slice().sort((a, b) => a.start - b.start || a.end - b.end)
}

function inRange(v: number, [lo, hi]: [number, number]): boolean { return v >= lo && v <= hi }

function computeMetrics(model: TimelineModel, profile: EditProfile, loud: { lufs: number | null; truePeak: number | null }): Record<string, Metric | HumanMetric> {
  const total = model.duration
  const main = mainScreenItems(model)

  // 시각 변화 평균 간격(서로 다른 시작점 정렬 후 인접 차 평균).
  const starts = [...new Set(main.map((it) => r3(it.start)))].sort((a, b) => a - b)
  let gapSum = 0
  for (let i = 1; i < starts.length; i++) gapSum += starts[i]! - starts[i - 1]!
  const avgChange = starts.length > 1 ? r3(gapSum / (starts.length - 1)) : total

  // 비율(a_roll / stock / 동일 원본 최대).
  let aRoll = 0
  let stock = 0
  const bySource = new Map<string, number>()
  for (const it of main) {
    const dur = it.end - it.start
    if (it.role === 'a_roll') aRoll += dur
    if (it.asset_kind === 'stock') stock += dur
    const key = it.file ?? it.shot_id
    if (key !== undefined) bySource.set(key, (bySource.get(key) ?? 0) + dur)
  }
  const sameSourceMax = bySource.size > 0 ? Math.max(...bySource.values()) : 0
  const impactCards = model.tracks.V5.filter((it) => it.role === 'impact_card').length

  const dur = model.narration_master_sec ?? total
  const rat = (n: number): number => (total > 0 ? r3(n / total) : 0)
  const cardsPer15 = total > 0 ? r3((impactCards * SEC_PER_15MIN) / total) : 0

  const mkRange = (v: number, range: [number, number]): Metric => ({ value: v, range, verdict: inRange(v, range) ? 'pass' : 'fail' })
  const mkMax = (v: number, max: number): Metric => ({ value: v, max, verdict: v <= max ? 'pass' : 'fail' })
  const mkMin = (v: number, min: number): Metric => ({ value: v, min, verdict: v >= min ? 'pass' : 'fail' })

  const lufsMetric: Metric = { value: loud.lufs, target: profile.audio.program_lufs, verdict: loud.lufs !== null && Math.abs(loud.lufs - profile.audio.program_lufs) <= profile.audio.session_lufs_deviation_max ? 'pass' : 'fail' }
  const tpMetric: Metric = { value: loud.truePeak, max: profile.audio.true_peak_dbtp, verdict: loud.truePeak !== null && loud.truePeak <= profile.audio.true_peak_dbtp ? 'pass' : 'fail' }

  return {
    duration_sec: model.is_spine ? { value: r3(dur), range: profile.video.duration_target_sec, verdict: 'pass' } : mkRange(r3(dur), profile.video.duration_target_sec),
    visual_change_avg_sec: mkRange(avgChange, profile.rhythm.visual_change_target_sec),
    intro_30s_changes: mkMin(model.intro_visual_changes, profile.rhythm.intro_30s_visual_changes_min),
    a_roll_ratio: mkRange(rat(aRoll), profile.ratios.a_roll),
    stock_ratio: mkMax(rat(stock), profile.ratios.stock_max),
    same_source_max_ratio: mkMax(rat(sameSourceMax), profile.ratios.same_source_max),
    impact_cards_per_15min: mkRange(cardsPer15, profile.counts_per_15min.impact_cards),
    program_lufs: lufsMetric,
    true_peak_dbtp: tpMetric,
    narrative_clarity: { verdict: 'human_required' },
    rights_final_check: { verdict: 'human_required' },
  }
}

/* ─────────────── 치명 12종 분류 ─────────────── */

/** 치명 12종(spec/08 §1) — 배열 순서가 곧 번호(n = index+1). rule 문자열이 자동 판정 분기 키. */
interface FatalDef { item: string; auto: boolean; rule: string }
const FATAL_12: FatalDef[] = [
  { item: '제목·썸네일 약속을 본문이 회수', auto: false, rule: 'title-promise' },
  { item: '핵심 숫자·인용·사건에 출처 없음', auto: true, rule: 'traceable' },
  { item: '내레이션과 반대되는 화면', auto: false, rule: 'narration-contradiction' },
  { item: '타 유튜버 해석을 사실처럼 사용', auto: false, rule: 'third-party-as-fact' },
  { item: '권리 상태 blocked/unknown', auto: true, rule: 'V8' },
  { item: '반복 루프가 눈에 띔', auto: true, rule: 'no-video-loop' },
  { item: '자막 오류/화면 밖', auto: true, rule: 'caption-safe-area' },
  { item: '내레이션 절단/원본음 충돌', auto: true, rule: 'total-length+source-audio' },
  { item: '상품 연결이 앞 문제와 단절', auto: false, rule: 'product-link' },
  { item: '계획되지 않은 fallback_text 잔존', auto: true, rule: 'V11' },
  { item: '훅 30초 시각 변화 부족', auto: true, rule: 'hook-visual-changes' },
  { item: 'reveal 구간에 직접 증거 없음', auto: true, rule: 'V6-reveal' },
]

function classifyFatal(
  checks: AssembleCheck[], plan: ShotPlanFile | null, model: TimelineModel, profile: EditProfile,
): FatalEntry[] {
  const approved = (plan?.shots ?? []).filter((s) => s.selection_status === 'approved')
  const external = approved.filter((s) => !['a_roll', 'motion', 'caption_card', 'fallback_text'].includes(s.asset_kind))
  const noSource = external.filter((s) => s.source_id === undefined || s.source_id === '')
  const blockRights = new Set(profile.qc.blocking_rights_status)
  const badRights = approved.filter((s) => blockRights.has(s.rights_status))
  const fallback = approved.filter((s) => s.asset_kind === 'fallback_text')
  const revealSegs = (plan?.segments ?? []).filter((s) => s.act === 'reveal')
  const revealBad: string[] = []
  for (const seg of revealSegs) {
    const segBeats = (plan?.beats ?? []).filter((b) => b.segment_id === seg.segment_id)
    const hasEvidence = segBeats.some((b) => b.visual_function === 'evidence' || b.visual_function === 'explain' || b.emphasis_caption !== undefined)
    if (segBeats.length > 0 && !hasEvidence) revealBad.push(seg.segment_id)
  }

  const st = (id: string): CheckStatus | undefined => checkStatus(checks, id)
  const verdictOf = (def: FatalDef): { verdict: Verdict; detail: string } => {
    if (!def.auto) return { verdict: 'human_required', detail: '사람 검수 필요(자동 판정 불가)' }
    switch (def.rule) {
      case 'traceable': return noSource.length === 0 ? { verdict: 'pass', detail: `외부 샷 ${external.length}개 전부 출처(source_id) 있음` } : { verdict: 'fail', detail: `출처 없는 외부 샷: ${noSource.map((s) => s.shot_id).join(', ')}` }
      case 'V8': return badRights.length === 0 ? { verdict: 'pass', detail: '차단 권리 샷 0건' } : { verdict: 'fail', detail: `${badRights.map((s) => `${s.shot_id}(${s.rights_status})`).join(', ')}` }
      case 'no-video-loop': return st('no-video-loop') === 'fail' ? { verdict: 'fail', detail: '비디오 루프 발생' } : { verdict: 'pass', detail: '루프 없음' }
      case 'caption-safe-area': return st('caption-safe-area') === 'pass' ? { verdict: 'pass', detail: '자막 안전영역 이내' } : { verdict: 'fail', detail: '자막 안전영역/가독성 확인 필요' }
      case 'total-length+source-audio': {
        const ok = st('total-length-vs-master') === 'pass' && st('source-audio-narration') !== 'fail'
        return ok ? { verdict: 'pass', detail: '내레이션 길이 일치·원본음 충돌 없음' } : { verdict: 'fail', detail: '내레이션 절단 또는 원본음 충돌' }
      }
      case 'V11': return fallback.length === 0 ? { verdict: 'pass', detail: 'fallback_text 승인 0건' } : { verdict: 'fail', detail: `fallback_text 승인 샷: ${fallback.map((s) => s.shot_id).join(', ')}` }
      case 'hook-visual-changes': return st('hook-visual-changes') === 'fail' ? { verdict: 'fail', detail: `훅 시각 변화 부족(${model.intro_visual_changes})` } : { verdict: 'pass', detail: `훅 시각 변화 ${model.intro_visual_changes}` }
      case 'V6-reveal': return revealBad.length === 0 ? { verdict: 'pass', detail: revealSegs.length === 0 ? 'reveal 막 없음(해당 없음)' : 'reveal 막 직접 증거 있음' } : { verdict: 'fail', detail: `직접 증거 없는 reveal 막: ${revealBad.join(', ')}` }
      default: return { verdict: 'human_required', detail: '' }
    }
  }
  return FATAL_12.map((def, i) => { const v = verdictOf(def); return { n: i + 1, item: def.item, auto: def.auto, rule: def.rule, verdict: v.verdict, detail: v.detail } })
}

/* ─────────────── 수정 목록 ─────────────── */

function buildFixList(checks: AssembleCheck[], fatal: FatalEntry[], metrics: Record<string, Metric | HumanMetric>, plan: ShotPlanFile | null): FixItem[] {
  const fixes: FixItem[] = []
  const approved = (plan?.shots ?? []).filter((s) => s.selection_status === 'approved')

  // P0 — 자동 치명 실패(사실·권리·논지). 샷 단위로 나열.
  const blockRights = new Set(['blocked', 'unknown']) // 표시용(정본은 profile.qc.blocking_rights_status, fatal 이 이미 판정)
  for (const f of fatal) {
    if (f.verdict !== 'fail') continue
    if (f.rule === 'V8') { for (const s of approved.filter((x) => blockRights.has(x.rights_status))) fixes.push({ priority: 'P0', rule: 'V8', shot_id: s.shot_id, detail: `rights_status=${s.rights_status} 인 외부 원본이 사용됨`, action: '권리 확인 또는 대체 화면' }); continue }
    if (f.rule === 'V11') { for (const s of approved.filter((x) => x.asset_kind === 'fallback_text')) fixes.push({ priority: 'P0', rule: 'V11', shot_id: s.shot_id, detail: '계획되지 않은 fallback_text 가 승인 상태로 남음', action: '실제 화면 수급 또는 샷 제거' }); continue }
    fixes.push({ priority: 'P0', rule: f.rule, detail: `치명 ${f.n}: ${f.item} — ${f.detail}`, action: '해당 규칙의 근거를 확보하거나 화면을 교체' })
  }

  // P0 — blocking 자동검사 실패(조립 차단). 치명과 별개의 기술 차단도 출고 불가.
  for (const c of checks) {
    if (c.blocking && c.status === 'fail') fixes.push({ priority: 'P0', rule: c.id, detail: `${c.label}: ${c.detail}`, action: '조립 차단 항목 — 원인 해소 후 재조립' })
  }

  // P1 — 리듬·가독성·사운드(warn 검사 + 범위 이탈 지표).
  for (const c of checks) {
    if (!c.blocking && c.status === 'warn') fixes.push({ priority: 'P1', rule: c.id, detail: `${c.label}: ${c.detail}`, action: c.ranges !== undefined ? `구간 확인(${c.ranges.length}건)` : '리듬/가독성 조정' })
  }
  const p1Metrics = ['a_roll_ratio', 'stock_ratio', 'same_source_max_ratio', 'impact_cards_per_15min', 'visual_change_avg_sec', 'program_lufs', 'true_peak_dbtp']
  for (const key of p1Metrics) {
    const m = metrics[key]
    if (m !== undefined && 'value' in m && m.verdict === 'fail') fixes.push({ priority: 'P1', rule: key, detail: `${key}=${m.value} 기준 이탈`, action: '리듬/사운드 파라미터 대비 조정' })
  }

  // P2 — 개선 제안(정보성 human_required 검사).
  for (const c of checks) {
    if (c.status === 'human_required') fixes.push({ priority: 'P2', rule: c.id, detail: `${c.label}: ${c.detail}`, action: '사람 육안 확인' })
  }
  return fixes
}

/* ─────────────── V16 무효화 ─────────────── */

const INVALIDATION_TABLE = [
  'SCOPES §4 프로필·프레임 무효화 — 변경 그룹별 재생성 대상:',
  '  video(resolution/fps)      → harvest --force + T8 재렌더 + assemble --force',
  '  align/audio                → align --force → reanchor → 전체 재고정',
  '  acts.shot_sec/beats        → plan 재실행(Z1)',
  '  captions/frame.md          → align 자막 재생성 + T8 재렌더 + assemble --force',
  '  motion/ratios.motion       → T8 재저작',
  '  photo_motion/sources       → assemble --force(사진 재렌더) / harvest --force',
  '  shots/rhythm/ratios        → assemble --force + qc',
  '  qc.blocking_rights_status  → validate + qc 재실행(판정이 뒤집힌다)',
].join('\n')

/* ─────────────── render_report 타입(부분) ─────────────── */

interface RenderReport {
  is_spine?: boolean
  outputs?: {
    numbered?: { clips?: number; path?: string }
    capcut?: { path?: string; draft_content_exists?: boolean }
  }
  checks?: CheckResult
}

/* ─────────────── 진입점 ─────────────── */

export async function runQc(projectDir: string, opts: QcOptions): Promise<QcResult> {
  const shotPlanPath = resolve(projectDir, 'shot-plan.json')
  if (!existsSync(shotPlanPath)) throw new InputError(`shot-plan.json 없음: ${shotPlanPath}`)
  const reportPath = resolve(projectDir, 'render_report.json')
  const renderReport = readJsonOrNull<RenderReport>(reportPath)
  if (renderReport === null) throw new InputError(`render_report.json 없음 — qc 전에 assemble 을 먼저 실행한다: ${reportPath}`)

  const profile = loadProfile(projectDir)
  const frame = loadFrame(projectDir)

  // spine(--pilot).
  let spineKeys: { from: string; to: string } | undefined
  if (opts.pilotPath !== undefined) {
    if (!existsSync(opts.pilotPath)) throw new InputError(`pilot.json 없음: ${opts.pilotPath}`)
    const parsed = PilotSchema.safeParse(JSON.parse(readFileSync(opts.pilotPath, 'utf8')))
    if (!parsed.success) throw new InputError(`pilot.json 스키마 위반: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`)
    spineKeys = { from: parsed.data.spine.from_sentence_key, to: parsed.data.spine.to_sentence_key }
  }

  // ── 공유 검사 17종(T5 와 동일 코드·임계값) ──
  const model = await buildModel(projectDir, profile, { spineKeys })
  const shared = runChecks(model, profile)

  // ── 렌더 후에만 알 수 있는 검사 ──
  const loud = await measureLoudness(resolve(projectDir, 'audio', 'narration-master.wav'), profile.harvest.timeout_sec)
  const renderChecks: AssembleCheck[] = [
    checkOutputsPresent(renderReport, projectDir),
    checkMeasuredLength(model, profile),
    ...loudnessChecks(loud, profile),
  ]

  // ── 정량 지표 + 치명 12종 + 수정 목록 ──
  const plan = readJsonOrNull<ShotPlanFile>(shotPlanPath)
  const metrics = computeMetrics(model, profile, loud)
  const fatal = classifyFatal(shared.checks, plan, model, profile)
  const fixList = buildFixList([...shared.checks, ...renderChecks], fatal, metrics, plan)

  // ── V16 프로필·프레임 무효화 ──
  const warnings: string[] = []
  const genProfileRev = plan?.profile_rev
  const genFrameRev = plan?.frame_rev
  if (genProfileRev !== undefined && genProfileRev !== profile.profile_rev) warnings.push(`V16: shot-plan profile_rev=${genProfileRev} ≠ 현재 profile_rev=${profile.profile_rev} — 산출물 무효화 검토`)
  if (genFrameRev !== undefined && genFrameRev !== frame.frame_rev) warnings.push(`V16: shot-plan frame_rev=${genFrameRev} ≠ 현재 frame_rev=${frame.frame_rev} — 사진 parallax 캐시 무효화 검토`)
  if (warnings.length > 0) warnings.push(INVALIDATION_TABLE)

  // ── human_required 집계(통과 처리 금지) ──
  const humanRequired = [
    ...Object.entries(metrics).filter(([, m]) => m.verdict === 'human_required').map(([k]) => k),
    ...fatal.filter((f) => f.verdict === 'human_required').map((f) => `치명${f.n}`),
    ...shared.human_required,
    ...renderChecks.filter((c) => c.status === 'human_required').map((c) => c.id),
  ]

  const p0Count = fixList.filter((f) => f.priority === 'P0').length
  const report: QcReport = {
    project: model.project, profile_rev: profile.profile_rev, frame_rev: frame.frame_rev, is_spine: model.is_spine,
    metrics, shared_checks: shared.checks, render_checks: renderChecks, fatal, warnings, human_required: humanRequired,
    p0_count: p0Count, gate: p0Count > 0 ? 'BLOCKED' : 'HOLD_FOR_HUMAN',
  }

  writeAtomic(resolve(projectDir, 'qc-report.json'), report)
  writeAtomic(resolve(projectDir, 'fix-list.json'), fixList)
  if (opts.human) writeHuman(report, fixList)

  return { report, fixList, exitCode: p0Count > 0 ? EXIT_FAIL : EXIT_OK }
}

/* ─────────────── 사람용 리포트(stderr) ─────────────── */

const VIEWING_CHECKLIST = [
  '',
  '■ 사람 검수 — 네 번의 시청 (spec/08 §4, 코드가 통과해도 이게 끝이 아니다)',
  '  1차 · 화면 없이 듣기  — 원고만으로 공감→정보→관점→결론이 선명한가',
  '  2차 · 소리 없이 보기  — 화면만으로 논지가 따라가지는가',
  '  3차 · 모바일 크기      — 자막 가독성 · 출처 표기가 읽히는가',
  '  4차 · 전체 실시간      — 리듬 · 지루한 구간 · 첫 30초 약속 · CTA',
  '  편수가 쌓이면 "다음 날 첫 30초 재확인"을 추가한다.',
].join('\n')

function writeHuman(report: QcReport, fixList: FixItem[]): void {
  const w = process.stderr
  w.write(`\n■ qc — gate=${report.gate} P0=${report.p0_count} (profile_rev=${report.profile_rev} frame_rev=${report.frame_rev}${report.is_spine ? ' spine' : ''})\n`)
  w.write('\n■ 정량 지표\n')
  for (const [k, m] of Object.entries(report.metrics)) {
    if (!('value' in m)) { w.write(`  ${k.padEnd(HUMAN_PAD)} human_required\n`); continue }
    const crit = m.range !== undefined ? `범위 ${m.range[0]}~${m.range[1]}` : m.min !== undefined ? `≥${m.min}` : m.max !== undefined ? `≤${m.max}` : m.target !== undefined ? `목표 ${m.target}` : ''
    w.write(`  ${k.padEnd(HUMAN_PAD)} ${String(m.value).padEnd(VAL_PAD)} ${crit.padEnd(HUMAN_PAD)} → ${m.verdict.toUpperCase()}\n`)
  }
  w.write('\n■ 치명 12종\n')
  for (const f of report.fatal) w.write(`  ${String(f.n).padStart(N_PAD)} ${f.auto ? '[자동]' : '[수동]'} ${f.verdict.toUpperCase().padEnd(HUMAN_PAD)} ${f.item} — ${f.detail}\n`)
  w.write('\n■ 수정 목록\n')
  for (const p of ['P0', 'P1', 'P2'] as const) {
    const items = fixList.filter((f) => f.priority === p)
    for (const f of items) w.write(`  ${p} ${f.rule}${f.shot_id !== undefined ? `/${f.shot_id}` : ''} — ${f.detail} → ${f.action}\n`)
  }
  if (report.warnings.length > 0) { w.write('\n■ 경고\n'); for (const wn of report.warnings) w.write(`${wn}\n`) }
  w.write(VIEWING_CHECKLIST + '\n')
}

const EXIT_OK = 0 // @unit 성공
const EXIT_FAIL = 1 // @unit 품질(P0) 실패
const HUMAN_PAD = 22 // @unit 사람용 열 정렬 폭
const VAL_PAD = 10 // @unit 값 열 정렬 폭
const N_PAD = 2 // @unit 치명 번호 열 정렬 폭
