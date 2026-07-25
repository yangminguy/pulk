/**
 * model.ts — shot-plan + timeline + usage + manifest + catalog → TimelineModel(10트랙) (T5, spec/07)
 *
 * 출력 경로와 무관하다. shot.start/end 를 그대로 쓰고 재계산하지 않는다(spec/07:33).
 * 트랙 배정은 edit-profile 의 tracks.lane_by_asset_kind 로 하고, 사진 촬영모션·자막·출처는
 * 파생 항목으로 만든다. 파일 존재/길이 probe(fs)는 여기서 한 번만 하고 결과를 항목에 새겨,
 * checks.ts 를 **순수 함수**로 유지한다(T6 import 계약).
 *
 * 편집 수치는 config/edit-profile.json(profile.ts)이 유일 출처다. 아래 상수는 편집 수치가 아니라
 * 트랙 이름·역할 문자열·구조 상수이며 // @unit 로 표시한다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join, isAbsolute } from 'node:path'
import type { EditProfile } from '../lib/profile.js'
import { ffprobeBin } from '../lib/probe.js'
import { run } from '../lib/proc.js'
import { readJsonOrNull } from '../lib/io.js'
import type { PhotoMotion, Shot, Beat, Segment } from '../schema/pipeline.js'

/* ─────────────── 트랙 (spec/07 §1) ─────────────── */

export type TrackName = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'A1' | 'A2' | 'A3' | 'A4'
export const TRACK_NAMES: TrackName[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'A1', 'A2', 'A3', 'A4'] // @unit 트랙 이름 목록(구조)

/** 항목 역할 — 렌더/검사 분기용 문자열 태그(수치 아님). */
export type ItemRole =
  | 'main' | 'a_roll' | 'photo_still' | 'photo_motion' | 'motion'
  | 'caption_base' | 'caption_keyword' | 'impact_card' | 'source_credit'
  | 'narration' | 'source_audio' | 'bgm' | 'sfx'

/** 사진 촬영모션 산출 방식(spec/07:60): parallax 는 T8 mov 얹기, 켄번즈 등은 ffmpeg zoompan. */
export type PhotoRender = 'parallax_overlay' | 'zoompan' | 'none'

export interface TrackItem {
  id: string
  lane: TrackName
  role: ItemRole
  start: number
  end: number
  shot_id?: string
  beat_ids?: string[]
  asset_kind?: string
  purpose?: string
  framing?: string
  file?: string // 절대 경로(미디어). 텍스트/파생 항목은 없음
  file_exists?: boolean // model 이 미리 probe(checks 를 순수로 유지)
  source_in?: number
  source_out?: number
  loop_needed?: boolean // 필요 길이 > 소스 가용 구간 → 루프 필요(금지, checks 가 실패)
  photo_motion?: PhotoMotion
  render?: PhotoRender
  source_audio?: string
  text?: string
  emphasis_word?: string
  needs_review?: boolean // Z3 재고정 결과 — V15 근거
  orphaned?: boolean // Z3 재고정 결과 — V15 근거
}

export interface MusicCueItem { start: number; end: number; role: string; energy: number; note?: string }
export interface SoundCueItem { at: number; role: string; linked_beat?: string; required: boolean }
export interface UsageCredit {
  shot_id: string; source_id: string; source_in: number; source_out: number
  video_in: number; video_out: number; credit_text: string; rights_status: string
}

export interface UnapprovedShot { shot_id: string; selection_status: string; beat_ids: string[]; needs_review?: boolean; orphaned?: boolean }

export interface TimelineModel {
  project: string
  duration: number // shot-plan/timeline 기준 총 길이
  narration_master: string | null // audio/narration-master.wav 절대경로
  narration_master_sec: number | null // probe 실측(없으면 null)
  word_timing: 'exact' | 'estimated'
  align_rev: number
  tracks: Record<TrackName, TrackItem[]>
  beats: Beat[]
  segments: Segment[]
  unapproved: UnapprovedShot[] // 조립에서 제외된 미승인 샷(checks 2)
  music_cues: MusicCueItem[]
  sound_cues: SoundCueItem[]
  usage: UsageCredit[]
  captions_srt: string | null // audio/captions.srt 절대경로
  intro_visual_changes: number // 훅 구간 시각 변화 수(checks 9 근거)
  hook_window_sec: number // 훅 구간 길이(checks 9 리포트용)
  is_spine: boolean // --pilot spine 조립 여부(checks 8 총길이 판정 분기)
}

/* ─────────────── 입력 로드 ─────────────── */

interface ManifestItem { shot_id: string; source_id: string; source_in: number; source_out: number; file: string; rights_status: string; probe_ok: boolean }
interface CatalogEntry { source_id: string; kind?: string; local_path?: string; proxy_path?: string; publisher?: string; title?: string; original_url?: string; rights_status?: string }

/* ─────────────── 파일 해석 ─────────────── */

function toAbs(projectDir: string, rel: string | undefined): string | undefined {
  if (rel === undefined) return undefined
  if (rel.startsWith('file://')) return rel.slice('file://'.length)
  return isAbsolute(rel) ? rel : resolve(projectDir, rel)
}

/** 샷의 최종 미디어 파일: 매니페스트(고화질) → shot.file → 카탈로그 local_path/proxy. */
function resolveShotFile(
  projectDir: string, shot: Shot, manifest: Map<string, ManifestItem>, catalog: Map<string, CatalogEntry>,
): string | undefined {
  const m = manifest.get(shot.shot_id)
  if (m !== undefined) return toAbs(projectDir, m.file)
  if (shot.file !== undefined) return toAbs(projectDir, shot.file)
  const src = shot.source_id !== undefined ? catalog.get(shot.source_id) : undefined
  if (src !== undefined) return toAbs(projectDir, src.local_path ?? src.proxy_path)
  return undefined
}

/** 사진 shot 의 촬영모션 산출 방식. parallax→motion/<shot_id>.mov 얹기, 그 외→zoompan 렌더. */
function photoRenderPlan(projectDir: string, shot: Shot): { render: PhotoRender; overlay?: string } {
  const type = shot.photo_motion?.type
  if (type === 'parallax') {
    return { render: 'parallax_overlay', overlay: resolve(projectDir, 'motion', `${shot.shot_id}.mov`) }
  }
  return { render: 'zoompan' }
}

/* ─────────────── 트랙 배정 ─────────────── */

function laneFor(assetKind: string, profile: EditProfile): TrackName | undefined {
  const raw = profile.tracks.lane_by_asset_kind[assetKind]
  if (raw !== undefined && (TRACK_NAMES as string[]).includes(raw)) return raw as TrackName
  return undefined
}

/* ─────────────── 훅 시각 변화 계산(checks 9 근거) ─────────────── */

/** 훅 구간(hookSec) 안에서 화면(V1~V3) 항목 경계 = 시각 변화 수. */
function countIntroChanges(items: TrackItem[], hookSec: number): number {
  const starts = new Set<number>()
  for (const it of items) {
    if ((it.lane === 'V1' || it.lane === 'V2' || it.lane === 'V3') && it.start < hookSec) {
      starts.add(Number(it.start.toFixed(HOOK_DECIMALS)))
    }
  }
  return starts.size
}

/* ─────────────── 큐 파일 ─────────────── */

const ACT_MUSIC_ROLE: Record<string, string> = { // @unit act → MusicCue.role 매핑(문자열, 수치 아님)
  hook: 'hook-tension', build: 'discovery', reveal: 'conflict', punch: 'conclusion',
}

function buildMusicCues(segments: Segment[], beats: Beat[]): MusicCueItem[] {
  const cues: MusicCueItem[] = []
  for (const seg of segments) {
    const segBeats = beats.filter((b) => b.segment_id === seg.segment_id)
    if (segBeats.length === 0) continue
    const start = Math.min(...segBeats.map((b) => b.start))
    const end = Math.max(...segBeats.map((b) => b.end))
    cues.push({ start, end, role: ACT_MUSIC_ROLE[seg.act] ?? seg.act, energy: seg.energy, note: seg.purpose })
  }
  return cues.sort((a, b) => a.start - b.start)
}

function buildSoundCues(beats: Beat[]): SoundCueItem[] {
  const cues: SoundCueItem[] = []
  for (const b of beats) {
    if (b.sfx_cue !== undefined && b.sfx_cue.length > 0) {
      cues.push({ at: b.start, role: b.sfx_cue, linked_beat: b.beat_id, required: false })
    }
  }
  return cues.sort((a, b) => a.at - b.at)
}

/* ─────────────── 자막 파생 항목(V4/V5) ─────────────── */

interface SrtCue { start: number; end: number; text: string }
interface EmphasisEntry { word: string; start: number; end: number; type: string }

const HOOK_DECIMALS = 3 // @unit 시각 반올림 자리(중복 시작점 병합)

/* ─────────────── 진입점 ─────────────── */

export interface BuildOptions {
  spineKeys?: { from: string; to: string } // --pilot spine: 이 문장구간만
}

/**
 * TimelineModel 을 만든다. approved 샷만 트랙에 올리고, 미승인은 unapproved[] 로 보고한다(checks 2).
 * fs probe(파일 존재·마스터 길이)를 여기서 끝내 checks.ts 를 순수로 유지한다.
 */
export async function buildModel(
  projectDir: string, profile: EditProfile, opts: BuildOptions = {},
): Promise<TimelineModel> {
  const plan = readJsonOrNull<{ project: string; shots: Shot[]; beats: Beat[]; segments: Segment[] }>(resolve(projectDir, 'shot-plan.json'))
  if (plan === null) throw new Error(`shot-plan.json 없음/파싱 실패: ${resolve(projectDir, 'shot-plan.json')}`)
  const timeline = readJsonOrNull<{ duration: number; align_rev: number; word_timing: 'exact' | 'estimated'; sentences: { sentence_key: string; start: number; end: number }[] }>(resolve(projectDir, 'timeline.json'))
  if (timeline === null) throw new Error(`timeline.json 없음/파싱 실패: ${resolve(projectDir, 'timeline.json')}`)

  const manifestRaw = readJsonOrNull<{ items: ManifestItem[] }>(resolve(projectDir, 'assets', 'selected', 'manifest.json'))
  const manifest = new Map<string, ManifestItem>((manifestRaw?.items ?? []).map((m) => [m.shot_id, m]))
  const catalogRaw = readJsonOrNull<CatalogEntry[]>(resolve(projectDir, 'sources', 'catalog.json')) ?? []
  const catalog = new Map<string, CatalogEntry>(catalogRaw.map((c) => [c.source_id, c]))
  const usageRaw = readJsonOrNull<UsageCredit[]>(resolve(projectDir, 'sources', 'usage.json')) ?? []

  // spine 필터(--pilot): from~to sentence_key 사이 시간 구간만.
  let spine: { start: number; end: number } | null = null
  if (opts.spineKeys !== undefined) {
    const fromS = timeline.sentences.find((s) => s.sentence_key === opts.spineKeys!.from)
    const toS = timeline.sentences.find((s) => s.sentence_key === opts.spineKeys!.to)
    if (fromS === undefined || toS === undefined) throw new Error(`--pilot spine: sentence_key 미발견 (${opts.spineKeys.from} / ${opts.spineKeys.to})`)
    spine = { start: fromS.start, end: toS.end }
  }
  const inSpine = (start: number, end: number): boolean => spine === null || (end > spine.start && start < spine.end)

  const tracks: Record<TrackName, TrackItem[]> = { V1: [], V2: [], V3: [], V4: [], V5: [], V6: [], A1: [], A2: [], A3: [], A4: [] }
  const unapproved: UnapprovedShot[] = []

  for (const shot of plan.shots) {
    if (!inSpine(shot.start, shot.end)) continue
    if (shot.selection_status !== 'approved') {
      unapproved.push({ shot_id: shot.shot_id, selection_status: shot.selection_status, beat_ids: shot.beat_ids, needs_review: shot.needs_review, orphaned: shot.orphaned })
      continue
    }
    const lane = laneFor(shot.asset_kind, profile)
    if (lane === undefined) {
      // 매핑 없는 asset_kind — 조립 불가로 미승인과 동급 보고(checks 가 잡는다)
      unapproved.push({ shot_id: shot.shot_id, selection_status: `lane_unmapped:${shot.asset_kind}`, beat_ids: shot.beat_ids })
      continue
    }
    const file = resolveShotFile(projectDir, shot, manifest, catalog)
    const dur = shot.end - shot.start
    const span = shot.source_in !== undefined && shot.source_out !== undefined ? shot.source_out - shot.source_in : undefined
    const item: TrackItem = {
      id: shot.shot_id, lane, role: 'main', start: shot.start, end: shot.end,
      shot_id: shot.shot_id, beat_ids: shot.beat_ids, asset_kind: shot.asset_kind, purpose: shot.purpose,
      framing: shot.framing, file, file_exists: file !== undefined ? existsSync(file) : false,
      source_in: shot.source_in, source_out: shot.source_out,
      loop_needed: span !== undefined ? dur > span + profile.motion.duration_tolerance_sec : false,
      source_audio: shot.source_audio,
      needs_review: shot.needs_review,
      orphaned: shot.orphaned,
    }

    const isImage = shot.asset_kind === 'image' || shot.asset_kind === 'still'
    if (isImage && shot.photo_motion !== undefined) {
      const planned = photoRenderPlan(projectDir, shot)
      if (planned.render === 'parallax_overlay') {
        item.role = 'photo_still'
        item.render = 'none'
        item.photo_motion = shot.photo_motion // 스틸 항목도 촬영모션 보유(V18 정지 아님)
        tracks[lane].push(item)
        const overlayExists = planned.overlay !== undefined && existsSync(planned.overlay)
        tracks.V3.push({
          id: `${shot.shot_id}__pm`, lane: 'V3', role: 'photo_motion', start: shot.start, end: shot.end,
          shot_id: shot.shot_id, beat_ids: shot.beat_ids, asset_kind: 'motion',
          file: planned.overlay, file_exists: overlayExists, photo_motion: shot.photo_motion, render: 'parallax_overlay',
          purpose: `${shot.purpose} (parallax 얹기)`,
        })
      } else {
        // 켄번즈/줌/팬 — zoompan 으로 메인 트랙 항목 자체를 렌더(정지 대체)
        item.role = 'photo_motion'
        item.photo_motion = shot.photo_motion
        item.render = 'zoompan'
        tracks[lane].push(item)
      }
    } else if (shot.asset_kind === 'a_roll') {
      item.role = 'a_roll'
      tracks[lane].push(item)
    } else if (shot.asset_kind === 'motion') {
      item.role = 'motion'
      const mv = resolve(projectDir, 'motion', `${shot.beat_ids[0]}.mov`)
      if (item.file === undefined) { item.file = mv; item.file_exists = existsSync(mv) }
      tracks[lane].push(item)
    } else {
      tracks[lane].push(item)
    }

    // 원본음(A2) — moment/quote 만.
    if (shot.source_audio === 'moment' || shot.source_audio === 'quote') {
      const ai = shot.source_audio_in ?? shot.source_in ?? 0
      const ao = shot.source_audio_out ?? shot.source_out ?? shot.end - shot.start
      tracks.A2.push({
        id: `${shot.shot_id}__sa`, lane: 'A2', role: 'source_audio', start: shot.start, end: shot.end,
        shot_id: shot.shot_id, beat_ids: shot.beat_ids, file, file_exists: file !== undefined ? existsSync(file) : false,
        source_in: ai, source_out: ao, source_audio: shot.source_audio,
      })
    }

    // 강조 자막(V5 키워드) — emphasis_caption 있는 샷.
    if (shot.emphasis_caption !== undefined && shot.emphasis_caption.length > 0 && shot.asset_kind !== 'caption_card') {
      tracks.V5.push({
        id: `${shot.shot_id}__kw`, lane: 'V5', role: 'caption_keyword', start: shot.start, end: shot.end,
        shot_id: shot.shot_id, beat_ids: shot.beat_ids, text: shot.emphasis_caption, emphasis_word: shot.emphasis_caption,
      })
    }
    // 전체화면 임팩트 카드(V5) — caption_card 샷은 lane=V5 로 이미 올라갔다. 역할·텍스트만 확정.
    if (shot.asset_kind === 'caption_card') {
      const last = tracks[lane][tracks[lane].length - 1]
      if (last !== undefined && last.id === shot.shot_id) {
        last.role = 'impact_card'
        last.text = shot.emphasis_caption ?? shot.purpose
      }
    }
  }

  // A1 연속 마스터(단일 항목, 비절단).
  const masterPath = resolve(projectDir, 'audio', 'narration-master.wav')
  const masterExists = existsSync(masterPath)
  let masterSec: number | null = null
  if (masterExists) masterSec = await probeAudioDurationSec(masterPath, profile.harvest.timeout_sec)
  const modelDuration = spine !== null ? spine.end - spine.start : timeline.duration
  tracks.A1.push({
    id: 'narration-master', lane: 'A1', role: 'narration',
    start: spine !== null ? 0 : 0, end: modelDuration,
    file: masterExists ? masterPath : undefined, file_exists: masterExists,
    source_in: spine !== null ? spine.start : 0, source_out: spine !== null ? spine.end : modelDuration,
  })

  // V4 기본 자막(captions.srt) — 파생 항목.
  const srtPath = resolve(projectDir, 'audio', 'captions.srt')
  const metaPath = resolve(projectDir, 'audio', 'captions.meta.json')
  if (existsSync(srtPath)) {
    const cues = parseSrtLite(readFileSync(srtPath, 'utf8'))
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i]!
      if (!inSpine(c.start, c.end)) continue
      tracks.V4.push({ id: `cap${i}`, lane: 'V4', role: 'caption_base', start: c.start, end: c.end, text: c.text })
    }
  }
  // 강조 시각 보정(captions.meta.json 우선 — 없으면 shot emphasis 사용).
  const emphMeta = readJsonOrNull<Record<string, EmphasisEntry[]>>(metaPath)
  if (emphMeta !== null) {
    for (const entries of Object.values(emphMeta)) {
      for (const e of entries) {
        if (!inSpine(e.start, e.end)) continue
        tracks.V5.push({ id: `emph-${e.start}`, lane: 'V5', role: 'caption_keyword', start: e.start, end: e.end, text: e.word, emphasis_word: e.word })
      }
    }
  }

  // V6 출처 — usage.json 에서 자동 생성.
  const usage: UsageCredit[] = []
  for (const u of usageRaw) {
    if (!inSpine(u.video_in, u.video_out)) continue
    usage.push(u)
    tracks.V6.push({
      id: `${u.shot_id}__src`, lane: 'V6', role: 'source_credit', start: u.video_in, end: u.video_out,
      shot_id: u.shot_id, text: u.credit_text,
    })
  }

  // A4 SFX — sound cues.
  const soundCues = buildSoundCues(plan.beats.filter((b) => inSpine(b.start, b.end)))
  for (const sc of soundCues) {
    tracks.A4.push({ id: `sfx-${sc.at}`, lane: 'A4', role: 'sfx', start: sc.at, end: sc.at, beat_ids: sc.linked_beat !== undefined ? [sc.linked_beat] : undefined, text: sc.role })
  }

  const allItems = TRACK_NAMES.flatMap((t) => tracks[t])
  const introChanges = countIntroChanges(allItems, HOOK_WINDOW_SEC)

  return {
    project: plan.project,
    duration: modelDuration,
    narration_master: masterExists ? masterPath : null,
    narration_master_sec: masterSec,
    word_timing: timeline.word_timing,
    align_rev: timeline.align_rev,
    tracks,
    beats: plan.beats.filter((b) => inSpine(b.start, b.end)),
    segments: plan.segments,
    unapproved,
    music_cues: buildMusicCues(plan.segments, plan.beats.filter((b) => inSpine(b.start, b.end))),
    sound_cues: soundCues,
    usage,
    captions_srt: existsSync(srtPath) ? srtPath : null,
    intro_visual_changes: introChanges,
    hook_window_sec: HOOK_WINDOW_SEC,
    is_spine: spine !== null,
  }
}

const HOOK_WINDOW_SEC = 30 // @unit 훅 구간 길이(초) — rhythm.intro_30s_* 지표의 정의 구간

/** 오디오 길이(초). narration-master.wav 는 비디오 스트림이 없어 format=duration 으로 잰다. */
async function probeAudioDurationSec(file: string, timeoutSec: number): Promise<number | null> {
  const r = await run(ffprobeBin(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', file], { timeoutSec })
  if (r.code !== 0) return null
  const d = Number(r.stdout.trim())
  return Number.isFinite(d) && d > 0 ? d : null
}

/** SRT → cue(초). lib/captions.ts parseSRT 규약과 동일하되 model 로컬 경량 파서(의존 최소화). */
function parseSrtLite(text: string): SrtCue[] {
  const out: SrtCue[] = []
  const re = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/ // @unit SRT 타임코드 정규식(구조)
  for (const block of text.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    const tsLine = lines.find((l) => re.test(l))
    if (tsLine === undefined) continue
    const m = tsLine.match(re)!
    const toSec = (h: string, mm: string, s: string, ms: string): number =>
      Number(h) * SEC_PER_HOUR + Number(mm) * SEC_PER_MIN + Number(s) + Number(ms.padEnd(MS_PAD, '0')) / MS_PER_SEC
    const start = toSec(m[1]!, m[2]!, m[3]!, m[4]!)
    const end = toSec(m[5]!, m[6]!, m[7]!, m[8]!)
    const idx = lines.indexOf(tsLine)
    const cueText = lines.slice(idx + 1).join('\n').trim()
    if (cueText.length > 0 && end > start) out.push({ start, end, text: cueText })
  }
  return out
}

const SEC_PER_HOUR = 3600 // @unit 시→초
const SEC_PER_MIN = 60 // @unit 분→초
const MS_PER_SEC = 1000 // @unit 초→밀리초
const MS_PAD = 3 // @unit SRT 밀리초 자리수
