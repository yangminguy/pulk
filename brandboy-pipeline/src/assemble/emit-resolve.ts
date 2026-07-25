/**
 * emit-resolve.ts — 경로 R: DaVinci Resolve OTIO 타임라인 (사장님 결정 2026-07-25, spec/07 §9)
 *
 * TimelineModel 을 OpenTimelineIO(.otio, JSON)로 직렬화한다. Resolve 18.5+ 가 .otio 를 네이티브
 * 임포트하므로 클립·트랙·타임레인지·마커가 전부 배치된 채 타임라인이 열린다. 무료판으로 충분하다.
 *
 * 트랙 매핑(모델 10트랙 → OTIO 6트랙 + 마커):
 *  V1→Video 1(메인) · V2→Video 2(a-roll) · V3→Video 3(모션/사진모션 알파 mov)
 *  V5 caption_card→Video 4(카드 렌더 파일 있으면 클립, 없으면 Gap+마커로 문구 표기)
 *  A1→Audio 1(내레이션 마스터 통클립) · A2→Audio 2(원본음)
 *  music-cues·A4 sound-cues·V6 출처 → 타임라인(Stack) 마커. V4 기본 자막(SRT)은 임포터가 다루지
 *  않고 가이드가 File>Import>Subtitle 로 안내한다.
 *
 * 시간은 프레임 단위 RationalTime(value=프레임, rate=profile.video.fps). 소수 초는 프레임으로
 * 반올림하되 모든 경계를 round(t*fps)로 스냅해 총길이 누적 오차를 ±1프레임 이내로 묶는다.
 * checks.ts·model.ts 는 소비만 하고 수정하지 않는다.
 *
 * **미디어 스테이징**(사장님 실사용 2026-07-25): 소스가 audio/·motion/·sources/*·assemble/work 에
 * 흩어져 있어 폴더마다 가져와야 하는 번거로움 → 타임라인이 참조하는 모든 미디어를 resolve/media/ 한
 * 폴더로 모으고(심링크 기본, 실패 시 복사), 각 clip 의 target_url 을 그 스테이지 경로로 바꾼다. 사용자는
 * resolve/media/ 를 한 번 임포트하면 전 클립이 자동 연결된다. 매핑은 resolve/media-manifest.json.
 *
 * 편집 수치는 profile 이 유일 출처다. 아래 리터럴은 OTIO 스키마 버전·트랙 이름·마커 색 등 구조
 * 문자열이며(숫자 아님), 코드에 남는 수치 상수는 // @unit 로 표시한다.
 */
import { existsSync, mkdirSync, copyFileSync, symlinkSync, lstatSync, readlinkSync, rmSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { writeAtomic } from '../lib/io.js'
import type { EditProfile } from '../lib/profile.js'
import type { TimelineModel, TrackItem, TrackName } from './model.js'

type Json = Record<string, unknown>

/** OTIO 0.18 이 네이티브로 쓰는 스키마 버전(read 는 하위 버전도 업그레이드하지만 정본을 맞춘다). */
const SCHEMA = {
  timeline: 'Timeline.1', stack: 'Stack.1', track: 'Track.1', clip: 'Clip.2', gap: 'Gap.1',
  extref: 'ExternalReference.1', marker: 'Marker.2', timerange: 'TimeRange.1', rt: 'RationalTime.1',
}
const TRACK_KIND = { video: 'Video', audio: 'Audio' }
/** Resolve 마커 색(OTIO 표준 색 이름). 유형별 구분용 문자열. */
const COLOR = { music: 'BLUE', sound: 'YELLOW', credit: 'CYAN', card: 'PURPLE' }
const DEFAULT_MEDIA_KEY = 'DEFAULT_MEDIA'
const MEDIA_DIRNAME = 'media' // resolve/media/ — 스테이징 폴더 이름(구조 문자열)
const MANIFEST_NAME = 'media-manifest.json' // 원본→스테이지 매핑 파일 이름(구조 문자열)
const MEDIA_TRACKS: TrackName[] = ['V1', 'V2', 'V3', 'A1', 'A2'] // 클립 미디어를 가진 트랙(구조)
const HASH_PREFIX_LEN = 8 // @unit basename 충돌 시 유일화 해시 프리픽스 길이

export interface ResolveResult {
  status: 'ok' | 'failed'
  path: string // .otio 파일 경로
  guide_path: string // RESOLVE.md 경로
  media_dir: string // resolve/media/ 절대경로(스테이징 폴더)
  staged: number // 스테이징된 유일 미디어 수
  tracks: { name: string; clips: number }[]
  markers: number // 타임라인(Stack) 마커 수
  failed: { shot_id: string; reason: string }[]
  error?: string
}

/* ─────────────── OTIO 원소 ─────────────── */

function rt(value: number, rate: number): Json {
  return { OTIO_SCHEMA: SCHEMA.rt, rate, value }
}
function timeRange(startF: number, durF: number, rate: number): Json {
  return { OTIO_SCHEMA: SCHEMA.timerange, duration: rt(durF, rate), start_time: rt(startF, rate) }
}
/** target_url 은 순수 절대 경로를 쓴다 — Resolve OTIO 임포터가 file:// URL 을 미발견 처리하는
 * 것을 실측(2026-07-25, "7개 중 7개 미발견")으로 확인. OTIO 스펙상 target_url 은 임의 문자열이며
 * Resolve·otio 파서 모두 절대 경로를 그대로 받는다. */
function fileUrl(abs: string): string {
  return abs
}
function extRef(abs: string, availDurF: number, rate: number): Json {
  return { OTIO_SCHEMA: SCHEMA.extref, metadata: {}, name: '', target_url: fileUrl(abs), available_range: timeRange(0, availDurF, rate) }
}
function clipObj(name: string, srcInF: number, durF: number, rate: number, abs: string): Json {
  return {
    OTIO_SCHEMA: SCHEMA.clip, metadata: {}, name,
    source_range: timeRange(srcInF, durF, rate), effects: [], markers: [],
    media_references: { [DEFAULT_MEDIA_KEY]: extRef(abs, srcInF + durF, rate) },
    active_media_reference_key: DEFAULT_MEDIA_KEY,
  }
}
function gapObj(durF: number, rate: number): Json {
  return { OTIO_SCHEMA: SCHEMA.gap, metadata: {}, name: '', source_range: timeRange(0, durF, rate), effects: [], markers: [] }
}
function markerObj(name: string, color: string, startF: number, durF: number, rate: number, metadata: Json): Json {
  return { OTIO_SCHEMA: SCHEMA.marker, metadata, name, color, marked_range: timeRange(startF, durF, rate) }
}
/** 카드 렌더 파일이 없는 caption_card 슬롯 — Gap + 문구 마커. */
function cardGapObj(durF: number, rate: number, text: string): Json {
  return {
    OTIO_SCHEMA: SCHEMA.gap, metadata: {}, name: text, source_range: timeRange(0, durF, rate),
    effects: [], markers: [markerObj(text, COLOR.card, 0, durF, rate, { kind: 'impact-card' })],
  }
}
function trackObj(name: string, kind: string, children: Json[]): Json {
  return { OTIO_SCHEMA: SCHEMA.track, metadata: {}, name, kind, source_range: null, effects: [], markers: [], children }
}

/* ─────────────── 트랙 레이아웃(갭 채움) ─────────────── */

interface Placed { children: Json[]; clips: number }
type MakeChild = (it: TrackItem, durF: number, rate: number) => { child: Json; isClip: boolean } | null

/**
 * items 를 시작 시각 순으로 트랙에 배치한다. OTIO 트랙은 클립을 이어 붙이므로 빈 시간은 Gap 으로 채운다.
 * 모든 경계를 round(t*fps) 프레임에 스냅해 총길이 누적 오차를 방지한다. lane 내 중첩(선행 컷)은 앞
 * 클립 뒤에 직렬 배치(overlap 만큼 밀림) — OTIO 단일 트랙은 중첩 클립을 표현하지 못한다.
 * makeChild 가 null 을 반환하면(파일 부재) 그 항목은 건너뛰고 다음 항목이 Gap 으로 그 구간을 덮는다.
 */
function layoutTrack(items: TrackItem[], durSecOf: (it: TrackItem) => number, frames: (s: number) => number, rate: number, makeChild: MakeChild): Placed {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const children: Json[] = []
  let cursor = 0
  let clips = 0
  for (const it of sorted) {
    const startF = frames(it.start)
    const endF = frames(it.start + durSecOf(it))
    const placeStart = Math.max(startF, cursor)
    let durF = endF - placeStart
    if (durF < 1) durF = 1
    const made = makeChild(it, durF, rate)
    if (made === null) continue
    const gap = placeStart - cursor
    if (gap > 0) children.push(gapObj(gap, rate))
    children.push(made.child)
    if (made.isClip) clips += 1
    cursor = placeStart + durF
  }
  return { children, clips }
}

/* ─────────────── 미디어 스테이징 ─────────────── */

type StageMethod = 'symlink' | 'copy'
interface StageEntry { original: string; staged: string; method: StageMethod }

/** 타임라인이 실제 참조하는 실존 미디어 절대경로(중복 포함). clip 이 되는 트랙만 훑는다. */
function collectMediaFiles(model: TimelineModel): string[] {
  const out: string[] = []
  const push = (it: TrackItem): void => { if (it.file !== undefined && existsSync(it.file)) out.push(it.file) }
  for (const t of MEDIA_TRACKS) for (const it of model.tracks[t]) push(it)
  for (const it of model.tracks.V5) if (it.role === 'impact_card') push(it)
  return out
}

/** lstat 존재(심링크 노드 자체 — 깨진 링크도 true). existsSync 는 링크를 따라가 오탐한다. */
function lexists(p: string): boolean {
  try { lstatSync(p); return true } catch { return false }
}

/** 이미 있는 스테이지가 원본과 정합하면 방식을, 갱신 필요면 null. */
function stagedKind(staged: string, original: string): StageMethod | null {
  const st = lstatSync(staged)
  if (st.isSymbolicLink()) return readlinkSync(staged) === original ? 'symlink' : null
  return 'copy' // 기존 복사본은 유지(멱등)
}

/** 원본 → 스테이지. 심링크 기본, 실패(권한/파일시스템) 시 복사 폴백. force 면 무조건 재생성. */
function linkOrCopy(original: string, staged: string, force: boolean): StageMethod {
  const present = lexists(staged)
  if (present && !force) {
    const kind = stagedKind(staged, original)
    if (kind !== null) return kind // 이미 정합 → 유지(멱등)
  }
  if (present) rmSync(staged, { force: true })
  try {
    symlinkSync(original, staged)
    return 'symlink'
  } catch {
    copyFileSync(original, staged)
    return 'copy'
  }
}

/** 충돌 시 유일 basename: <hash>_<basename>. 원본 경로 해시라 같은 파일은 항상 같은 이름(멱등). */
function uniqueName(original: string, base: string): string {
  const h = createHash('sha1').update(original).digest('hex').slice(0, HASH_PREFIX_LEN)
  return `${h}_${base}`
}

/**
 * 참조 미디어를 resolve/media/ 한 폴더로 모은다(사용자 단일 임포트 → 전 클립 자동 연결).
 *  - 같은 물리 파일(동일 절대경로)은 한 번만 스테이징하고 여러 클립이 공유한다.
 *  - 다른 폴더의 같은 basename 충돌은 해시 프리픽스로 유일화(경로 정렬로 첫 등장이 clean 이름 — 결정적).
 *  - 멱등: force 아니면 이미 정합한 스테이지 유지, force 면 재생성.
 */
function stageMedia(files: string[], mediaDir: string, force: boolean): Map<string, StageEntry> {
  mkdirSync(mediaDir, { recursive: true })
  const unique = [...new Set(files)].sort((a, b) => a.localeCompare(b))
  const mapping = new Map<string, StageEntry>()
  const claimed = new Map<string, string>() // stagedBase → original(충돌 감지)
  for (const original of unique) {
    let base = basename(original)
    const owner = claimed.get(base)
    if (owner !== undefined && owner !== original) base = uniqueName(original, base)
    claimed.set(base, original)
    const staged = join(mediaDir, base)
    mapping.set(original, { original, staged, method: linkOrCopy(original, staged, force) })
  }
  return mapping
}

/* ─────────────── 진입점 ─────────────── */

/**
 * TimelineModel → <project>/resolve/<slug>.otio + RESOLVE.md.
 * 미디어 파일 부재는 failed[] 로 보고하고(fallback 금지) 해당 클립을 Gap 으로 남긴다. caption_card 는
 * 렌더 파일이 있으면 클립, 없으면 Gap+마커라 실패가 아니다.
 * 서브프로세스 없이 파일 쓰기뿐이지만 다른 이미터(emitCapcut/emitNumbered)와 호출 규약을 맞춰 async 다.
 */
export async function emitResolve(model: TimelineModel, projectDir: string, profile: EditProfile, opts: { force: boolean } = { force: false }): Promise<ResolveResult> {
  const outDir = resolve(projectDir, 'resolve')
  try {
    mkdirSync(outDir, { recursive: true })
  } catch (err) {
    return { status: 'failed', path: '', guide_path: '', media_dir: '', staged: 0, tracks: [], markers: 0, failed: [], error: `출력 디렉토리 생성 실패: ${(err as Error).message}` }
  }

  // 스테이징: 참조 미디어를 resolve/media/ 한 폴더로 모으고, clip 은 그 스테이지 경로를 가리킨다.
  const mediaDir = join(outDir, MEDIA_DIRNAME)
  const staging = stageMedia(collectMediaFiles(model), mediaDir, opts.force)
  const stagedOf = (abs: string): string => staging.get(abs)?.staged ?? abs

  const fps = profile.video.fps
  const frames = (s: number): number => Math.round(s * fps)
  const failed: ResolveResult['failed'] = []

  const mediaChild: MakeChild = (it, durF, rate) => {
    if (it.file === undefined || !existsSync(it.file)) {
      failed.push({ shot_id: it.shot_id ?? it.id, reason: `미디어 파일 없음: ${it.file ?? '(경로 없음)'}` })
      return null
    }
    const srcInF = frames(it.source_in ?? 0)
    return { child: clipObj(it.shot_id ?? it.id, srcInF, durF, rate, stagedOf(it.file)), isClip: true }
  }
  const cardChild: MakeChild = (it, durF, rate) => {
    const text = it.text ?? it.purpose ?? ''
    if (it.file !== undefined && existsSync(it.file)) return { child: clipObj(it.id, 0, durF, rate, stagedOf(it.file)), isClip: true }
    return { child: cardGapObj(durF, rate, text), isClip: false }
  }

  const spanSec = (it: TrackItem): number => it.end - it.start
  // A1 은 연속 내레이션 마스터라 실측 길이(narration_master_sec)를 통클립 길이로 쓴다(spec/07 §11.1).
  const narrationSec = (it: TrackItem): number => model.narration_master_sec ?? (it.end - it.start)

  const v1 = layoutTrack(model.tracks.V1, spanSec, frames, fps, mediaChild)
  const v2 = layoutTrack(model.tracks.V2, spanSec, frames, fps, mediaChild)
  const v3 = layoutTrack(model.tracks.V3, spanSec, frames, fps, mediaChild)
  const cards = model.tracks.V5.filter((it) => it.role === 'impact_card')
  const v4 = layoutTrack(cards, spanSec, frames, fps, cardChild)
  const a1 = layoutTrack(model.tracks.A1, narrationSec, frames, fps, mediaChild)
  const a2 = layoutTrack(model.tracks.A2, spanSec, frames, fps, mediaChild)

  const trackObjs = [
    trackObj('Video 1', TRACK_KIND.video, v1.children),
    trackObj('Video 2', TRACK_KIND.video, v2.children),
    trackObj('Video 3', TRACK_KIND.video, v3.children),
    trackObj('Video 4', TRACK_KIND.video, v4.children),
    trackObj('Audio 1', TRACK_KIND.audio, a1.children),
    trackObj('Audio 2', TRACK_KIND.audio, a2.children),
  ]

  // 타임라인(Stack) 마커 — music-cues + sound-cues(A4) + V6 출처.
  const markers: Json[] = []
  for (const c of model.music_cues) {
    markers.push(markerObj(`${c.role} · energy ${c.energy}`, COLOR.music, frames(c.start), frames(c.end) - frames(c.start), fps, { kind: 'music-cue', role: c.role, energy: c.energy, note: c.note ?? '' }))
  }
  for (const sc of model.sound_cues) {
    markers.push(markerObj(sc.role, COLOR.sound, frames(sc.at), 0, fps, { kind: 'sound-cue', linked_beat: sc.linked_beat ?? '' }))
  }
  for (const cr of model.tracks.V6) {
    markers.push(markerObj(cr.text ?? 'source', COLOR.credit, frames(cr.start), frames(cr.end) - frames(cr.start), fps, { kind: 'source-credit', shot_id: cr.shot_id ?? '' }))
  }

  const stack: Json = { OTIO_SCHEMA: SCHEMA.stack, metadata: {}, name: 'tracks', source_range: null, effects: [], markers, children: trackObjs }
  const timeline: Json = { OTIO_SCHEMA: SCHEMA.timeline, metadata: {}, name: model.project, global_start_time: null, tracks: stack }

  const slug = model.project.replace(/[^A-Za-z0-9._-]+/g, '_')
  const otioPath = join(outDir, `${slug}.otio`)
  writeAtomic(otioPath, timeline)

  // 스테이징 매핑(원본→스테이지) — 추적·재실행 멱등의 기록. 삽입 순서가 원본 경로 정렬순.
  writeAtomic(join(outDir, MANIFEST_NAME), { media_dir: mediaDir, count: staging.size, entries: [...staging.values()] })

  // 기본 자막(SRT)은 Resolve 에서 별도 임포트 — 가이드가 안내하도록 파일을 곁에 복사.
  if (model.captions_srt !== null && existsSync(model.captions_srt)) copyFileSync(model.captions_srt, join(outDir, 'captions.srt'))

  const trackReports = [
    { name: 'Video 1', clips: v1.clips }, { name: 'Video 2', clips: v2.clips }, { name: 'Video 3', clips: v3.clips },
    { name: 'Video 4', clips: v4.clips }, { name: 'Audio 1', clips: a1.clips }, { name: 'Audio 2', clips: a2.clips },
  ]
  const guidePath = join(outDir, 'RESOLVE.md')
  writeAtomic(guidePath, buildResolveMd(model, slug, trackReports, markers.length, failed, staging.size))

  return { status: failed.length === 0 ? 'ok' : 'failed', path: otioPath, guide_path: guidePath, media_dir: mediaDir, staged: staging.size, tracks: trackReports, markers: markers.length, failed }
}

/* ─────────────── 임포트 가이드 ─────────────── */

function buildResolveMd(model: TimelineModel, slug: string, tracks: { name: string; clips: number }[], markerCount: number, failed: ResolveResult['failed'], stagedCount: number): string {
  const L: string[] = []
  L.push(`# RESOLVE — ${model.project} (경로 R · DaVinci Resolve OTIO)`, '')
  L.push('CapCut 신형 포맷은 초안 자동 생성이 막혀(실측), 사장님 결정(2026-07-25)에 따라 Resolve 는 타임라인을 전부 배치한 채 연다. 순번 파일 세트(경로 C)는 병행 유지.', '')
  L.push(`참조 미디어(영상·오디오·모션·사진) ${stagedCount}개를 전부 \`resolve/media/\` 한 폴더로 모았다(심링크 기본, 실패 시 복사). 여러 폴더를 돌 필요 없이 **이 폴더만 한 번 가져오면** 전 클립이 자동 연결된다. 원본→스테이지 매핑은 \`resolve/media-manifest.json\`.`, '')
  L.push('## 임포트 (Resolve 18.5+ · 무료판 가능)', '')
  L.push('> **핵심 순서: 미디어를 먼저, 타임라인을 나중에.** 반대로 하면 클립이 offline 으로 뜰 수 있다.', '')
  L.push('1. Resolve 실행 → 새 프로젝트 생성', `2. **File > Import > Media…** → \`resolve/media/\` 폴더 선택 → 참조 미디어 ${stagedCount}개가 한 번에 미디어 풀로 들어온다`)
  L.push(`3. **File > Import > Timeline…** → \`resolve/${slug}.otio\` 선택 → 타임라인이 미디어 풀 클립으로 **자동 연결**되어 열린다(클립·트랙·마커 배치 완료)`)
  L.push('4. **File > Import > Subtitle…** → `resolve/captions.srt` (기본 자막은 OTIO 가 아니라 SRT 임포트로 얹는다)')
  L.push('5. A3(BGM)는 비어 있음 — 곡 선택은 사람. 타임라인 마커의 music-cue 구간·energy 메모를 참고해 배치', '')
  L.push('## 트랙 매핑', '')
  L.push('| OTIO 트랙 | 모델 | 내용 | 클립 수 |', '|---|---|---|---|')
  L.push(`| Video 1 | V1 | 메인 B-roll·공식영상·인터뷰·사진 | ${clipsOf(tracks, 'Video 1')} |`)
  L.push(`| Video 2 | V2 | 진행자 A-roll·합성 | ${clipsOf(tracks, 'Video 2')} |`)
  L.push(`| Video 3 | V3 | 모션·사진 촬영모션(알파 mov) | ${clipsOf(tracks, 'Video 3')} |`)
  L.push(`| Video 4 | V5 caption_card | 전체화면 강조 카드(렌더 파일 없으면 Gap+마커 문구) | ${clipsOf(tracks, 'Video 4')} |`)
  L.push(`| Audio 1 | A1 | 연속 내레이션 마스터(통클립·비절단) | ${clipsOf(tracks, 'Audio 1')} |`)
  L.push(`| Audio 2 | A2 | 선택 원본음(moment/quote) | ${clipsOf(tracks, 'Audio 2')} |`)
  L.push(`| 타임라인 마커 | music-cues·A4 sound-cues·V6 출처 | 구간명·energy·출처 표기 | 마커 ${markerCount}개 |`, '')
  L.push('## 확인 포인트', '')
  L.push(`- 총 길이 ≈ 내레이션 마스터 ${fmtSec(model.narration_master_sec)} (Audio 1 통클립 기준)`)
  L.push('- Video 1 이 도입 30초의 제목·썸네일 약속을 시각적으로 증명하는지')
  L.push('- 타임라인 마커에서 막 경계(music-cue)와 출처(source-credit)가 보이는지')
  L.push('- 기본 자막은 SRT 임포트로만 들어온다(OTIO 에는 없음)', '')
  L.push('## 알려진 한계', '')
  L.push('- 타임라인 마커는 OTIO Stack 마커로 기록 — Resolve 버전에 따라 임포트 표기가 다를 수 있다')
  L.push('- Video 4 강조 카드 렌더 파일이 없으면 Gap+마커(문구)로만 표기된다(카드 배경 렌더는 스코프 밖)')
  L.push('- V6 출처의 화면 텍스트(자체 title) 생성은 스코프 밖 — 마커로만 역추적 가능하게 남긴다')
  if (failed.length > 0) {
    L.push('', '## ⚠ 미디어 부재(사람 조치 필요 — fallback 없음)', '')
    for (const f of failed) L.push(`- ${f.shot_id}: ${f.reason}`)
  }
  L.push('')
  return L.join('\n')
}

function clipsOf(tracks: { name: string; clips: number }[], name: string): number {
  return tracks.find((t) => t.name === name)?.clips ?? 0
}
function fmtSec(sec: number | null): string {
  return sec === null ? '(없음)' : `${sec.toFixed(SEC_DECIMALS)}s`
}

const SEC_DECIMALS = 2 // @unit 가이드 표시 소수 자리
