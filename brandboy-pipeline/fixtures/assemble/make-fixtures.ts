/**
 * make-fixtures.ts — assemble 픽스처 조성 (네트워크 0, ffmpeg 더미 미디어 + JSON)
 *
 * verify-harvest 관례를 따라 실제 파이프라인(whisper 등) 없이 결정론적으로 조립 입력을 만든다:
 *  timeline.json · shot-plan.json(approved) · catalog · usage(V6) · manifest(고화질 조인) ·
 *  audio/narration-master.wav · captions.srt · captions.meta.json · motion/<shot>.mov(parallax 알파).
 *
 * 사진 2장 포함: 1 parallax(motion mov 얹기) · 1 ken_burns(assemble 이 zoompan 렌더).
 * 이 파일은 fixtures/ 밖에서 import 되어 tsc 로 타입체크되지만 verify-no-magic-numbers 대상(src/)은 아니다.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { ffmpegBin } from '../../src/lib/probe.js'

const FPS = 30
const W = 1920
const H = 1080

function ff(args: string[]): void {
  const r = spawnSync(ffmpegBin(), ['-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) { process.stderr.write(`${r.stderr ?? ''}\n`); throw new Error(`ffmpeg 실패: ${args.join(' ')}`) }
}

/* ─────────────── 미디어 생성(공유) ─────────────── */

export interface MediaPaths { videoA: string; aroll: string; still1: string; still2: string; parallax: string }

export function buildMedia(mediaDir: string): MediaPaths {
  mkdirSync(mediaDir, { recursive: true })
  const videoA = join(mediaDir, 'src_v1.mp4')
  const aroll = join(mediaDir, 'aroll_001.mp4')
  const still1 = join(mediaDir, 'img_parallax.png')
  const still2 = join(mediaDir, 'img_kenburns.png')
  const parallax = join(mediaDir, 'sh_parallax.mov')
  if (!existsSync(videoA)) ff(['-f', 'lavfi', '-i', `testsrc=size=640x360:rate=15:duration=12`, '-f', 'lavfi', '-i', 'sine=frequency=330:duration=12', '-pix_fmt', 'yuv420p', '-shortest', videoA])
  if (!existsSync(aroll)) ff(['-f', 'lavfi', '-i', `testsrc=size=640x360:rate=15:duration=6`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-pix_fmt', 'yuv420p', '-shortest', aroll])
  if (!existsSync(still1)) ff(['-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=1:duration=1`, '-frames:v', '1', still1])
  if (!existsSync(still2)) ff(['-f', 'lavfi', '-i', `gradients=size=${W}x${H}:duration=1`, '-frames:v', '1', still2])
  // parallax 오버레이: ProRes4444(알파) 2초 mov.
  if (!existsSync(parallax)) ff(['-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=${FPS}:duration=2`, '-vf', 'format=yuva444p10le', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', parallax])
  return { videoA, aroll, still1, still2, parallax }
}

/* ─────────────── 타입 ─────────────── */

interface ShotDef {
  shot_id: string; beat_ids: string[]; start: number; end: number; asset_kind: string
  purpose: string; selection_status?: string; rights_status?: string; framing?: string
  source_id?: string; source_in?: number; source_out?: number
  source_audio?: string; source_audio_in?: number; source_audio_out?: number
  emphasis_caption?: string; photo_motion?: { type: string; focal: [number, number]; zoom: [number, number]; duration_sec: number }
  needs_review?: boolean; orphaned?: boolean; manifest?: boolean
}
interface BeatDef { beat_id: string; segment_id: string; importance: string; visual_function: string; start: number; end: number }

export interface FixtureLayout {
  duration: number
  segments: { segment_id: string; act: string; energy: number; purpose: string }[]
  beats: BeatDef[]
  shots: ShotDef[]
  sentences: { sentence_key: string; sentence_id: string; segment_id: string; text: string; start: number; end: number }[]
  emphasis: Record<string, { word: string; start: number; end: number; type: string }[]>
}

const FRAMINGS = ['wide', 'person', 'product', 'detail', 'proof']

/* ─────────────── 메인 레이아웃 ─────────────── */

export function mainLayout(): FixtureLayout {
  const beats: BeatDef[] = []
  const shots: ShotDef[] = []
  const HOOK = 14
  for (let i = 0; i < HOOK; i++) {
    const bid = `b${String(i + 1).padStart(3, '0')}`
    const sid = `sh${String(i + 1).padStart(4, '0')}`
    const start = i * 2
    const end = start + 2
    const importance = i === 0 || i === 4 ? 'critical' : 'normal'
    beats.push({ beat_id: bid, segment_id: 'g01', importance, visual_function: i === 4 ? 'emotion' : 'evidence', start, end })
    if (i === 4) {
      shots.push({ shot_id: sid, beat_ids: [bid], start, end, asset_kind: 'image', purpose: '창업자 사진(parallax)', framing: 'person', source_id: 'src_img1', photo_motion: { type: 'parallax', focal: [0.5, 0.4], zoom: [1.0, 1.18], duration_sec: 2 } })
    } else if (i === 7) {
      shots.push({ shot_id: sid, beat_ids: [bid], start, end, asset_kind: 'image', purpose: '제품 사진(ken_burns)', framing: 'product', source_id: 'src_img2', photo_motion: { type: 'ken_burns', focal: [0.6, 0.5], zoom: [1.0, 1.15], duration_sec: 2 } })
    } else if (i === 9) {
      shots.push({ shot_id: sid, beat_ids: [bid], start, end, asset_kind: 'a_roll', purpose: '진행자 발화', framing: 'person', source_id: 'aroll_001', source_in: 0, source_out: 2 })
    } else {
      const src = i % 2 === 0 ? 'src_v1' : 'src_v2'
      shots.push({ shot_id: sid, beat_ids: [bid], start, end, asset_kind: i % 2 === 0 ? 'official_video' : 'interview', purpose: `증거 화면 ${i}`, framing: FRAMINGS[i % FRAMINGS.length], source_id: src, source_in: 1, source_out: 3, manifest: true })
    }
  }
  // build 세그먼트(28..40)
  const buildBeats: BeatDef[] = [
    { beat_id: 'b015', segment_id: 'g02', importance: 'normal', visual_function: 'evidence', start: 28, end: 31 },
    { beat_id: 'b016', segment_id: 'g02', importance: 'normal', visual_function: 'literal', start: 31, end: 34 },
    { beat_id: 'b017', segment_id: 'g02', importance: 'bridge', visual_function: 'reset', start: 34, end: 37 },
    { beat_id: 'b018', segment_id: 'g02', importance: 'normal', visual_function: 'caption_card', start: 37, end: 40 },
  ]
  beats.push(...buildBeats)
  shots.push(
    { shot_id: 'sh0015', beat_ids: ['b015'], start: 28, end: 31, asset_kind: 'official_video', purpose: '원본 발언(moment)', framing: 'person', source_id: 'src_v1', source_in: 2, source_out: 5, source_audio: 'moment', source_audio_in: 2, source_audio_out: 5, manifest: true },
    { shot_id: 'sh0016', beat_ids: ['b016'], start: 31, end: 34, asset_kind: 'interview', purpose: '인터뷰 증언', framing: 'person', source_id: 'src_v2', source_in: 0, source_out: 3, manifest: true },
    { shot_id: 'sh0017', beat_ids: ['b017'], start: 34, end: 37, asset_kind: 'a_roll', purpose: '진행자 정리', framing: 'person', source_id: 'aroll_001', source_in: 0, source_out: 3 },
    { shot_id: 'sh0018', beat_ids: ['b018'], start: 37, end: 40, asset_kind: 'caption_card', purpose: '결론 카드', emphasis_caption: '충격 결과' },
  )
  return {
    duration: 40,
    segments: [
      { segment_id: 'g01', act: 'hook', energy: 3, purpose: '결과 먼저' },
      { segment_id: 'g02', act: 'build', energy: 3, purpose: '배경 설명' },
    ],
    beats,
    shots,
    sentences: [
      { sentence_key: 'aaaa0001', sentence_id: 'sn001', segment_id: 'g01', text: '나이키가 광고를 공개했고 매출이 크게 늘었습니다', start: 0, end: 14 },
      { sentence_key: 'bbbb0002', sentence_id: 'sn002', segment_id: 'g01', text: '그 결과 브랜드가 시장을 재정의했습니다', start: 14, end: 28 },
      { sentence_key: 'cccc0003', sentence_id: 'sn003', segment_id: 'g02', text: '진행자가 배경을 정리하며 충격 결과를 짚습니다', start: 28, end: 40 },
    ],
    emphasis: {
      aaaa0001: [{ word: '매출', start: 6, end: 7, type: 'keyword' }],
      cccc0003: [{ word: '충격', start: 37.1, end: 38, type: 'keyword' }],
    },
  }
}

/* ─────────────── 프로젝트 기록 ─────────────── */

export interface WriteOptions { configDir: string; media: MediaPaths; masterDurationSec?: number }

export function writeFixture(projectDir: string, layout: FixtureLayout, opts: WriteOptions): void {
  rmSync(projectDir, { recursive: true, force: true })
  mkdirSync(join(projectDir, 'audio'), { recursive: true })
  mkdirSync(join(projectDir, 'sources', 'originals'), { recursive: true })
  mkdirSync(join(projectDir, 'sources', 'stills'), { recursive: true })
  mkdirSync(join(projectDir, 'sources', 'a-roll'), { recursive: true })
  mkdirSync(join(projectDir, 'assets', 'selected'), { recursive: true })
  mkdirSync(join(projectDir, 'motion'), { recursive: true })

  copyFileSync(join(opts.configDir, 'edit-profile.json'), join(projectDir, 'edit-profile.json'))
  copyFileSync(join(opts.configDir, 'frame.md'), join(projectDir, 'frame.md'))

  // 미디어 배치(프로젝트 상대 경로).
  const m = opts.media
  copyFileSync(m.videoA, join(projectDir, 'sources', 'originals', 'src_v1.mp4'))
  copyFileSync(m.videoA, join(projectDir, 'sources', 'originals', 'src_v2.mp4'))
  copyFileSync(m.aroll, join(projectDir, 'sources', 'a-roll', 'aroll_001.mp4'))
  copyFileSync(m.still1, join(projectDir, 'sources', 'stills', 'img_parallax.png'))
  copyFileSync(m.still2, join(projectDir, 'sources', 'stills', 'img_kenburns.png'))
  // parallax 모션 mov (T8 산출 자리).
  copyFileSync(m.parallax, join(projectDir, 'motion', 'sh0005.mov'))

  // narration-master.wav
  const masterDur = opts.masterDurationSec ?? layout.duration
  ff(['-f', 'lavfi', '-i', `sine=frequency=220:duration=${masterDur}`, join(projectDir, 'audio', 'narration-master.wav')])

  // captions.srt
  const srt = layout.sentences.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(Math.min(s.end, s.start + 3))}\n${s.text}`).join('\n\n') + '\n'
  writeFileSync(join(projectDir, 'audio', 'captions.srt'), srt)
  writeFileSync(join(projectDir, 'audio', 'captions.meta.json'), JSON.stringify(layout.emphasis, null, 2))

  // timeline.json
  writeFileSync(join(projectDir, 'timeline.json'), JSON.stringify({
    duration: layout.duration, align_rev: 4, profile_rev: 1, word_timing: 'exact',
    sentences: layout.sentences.map((s) => ({ ...s, words: [{ text: s.text.split(' ')[0] ?? s.text, start: s.start, end: Math.min(s.end, s.start + 1) }] })),
  }, null, 2))

  // catalog.json (local_path 프로젝트 상대)
  const catalog = [
    { source_id: 'src_v1', title: '공식 영상 1', publisher: 'BrandCo', original_url: 'https://ex.com/v1', kind: 'official_video', rights_status: 'licensed', is_official: true, local_path: 'sources/originals/src_v1.mp4' },
    { source_id: 'src_v2', title: '인터뷰 1', publisher: 'PressCo', original_url: 'https://ex.com/v2', kind: 'interview', rights_status: 'permission', local_path: 'sources/originals/src_v2.mp4' },
    { source_id: 'src_img1', title: '창업자 사진', publisher: 'Archive', original_url: 'https://ex.com/i1.jpg', kind: 'image', rights_status: 'public_domain', local_path: 'sources/stills/img_parallax.png' },
    { source_id: 'src_img2', title: '제품 사진', publisher: 'Archive', original_url: 'https://ex.com/i2.jpg', kind: 'image', rights_status: 'public_domain', local_path: 'sources/stills/img_kenburns.png' },
    { source_id: 'aroll_001', title: '진행자 A-roll', publisher: 'self', original_url: 'file:///aroll_001.mp4', kind: 'a_roll', rights_status: 'owned', local_path: 'sources/a-roll/aroll_001.mp4' },
  ]
  writeFileSync(join(projectDir, 'sources', 'catalog.json'), JSON.stringify(catalog, null, 2))

  // shot-plan.json
  const shots = layout.shots.map((s) => ({
    shot_id: s.shot_id, beat_ids: s.beat_ids, start: s.start, end: s.end, asset_kind: s.asset_kind,
    purpose: s.purpose, selection_status: s.selection_status ?? 'approved', rights_status: s.rights_status ?? 'licensed',
    source_id: s.source_id, source_in: s.source_in, source_out: s.source_out, framing: s.framing,
    source_audio: s.source_audio ?? 'mute', source_audio_in: s.source_audio_in, source_audio_out: s.source_audio_out,
    emphasis_caption: s.emphasis_caption, photo_motion: s.photo_motion,
    needs_review: s.needs_review, orphaned: s.orphaned,
    anchor: { sentence_key: layout.sentences[0]!.sentence_key, offset_sec: 0 }, timing_rev: 4, locked_selection: false,
  }))
  writeFileSync(join(projectDir, 'shot-plan.json'), JSON.stringify({
    project: 'assemble-project', revision: 5, profile_rev: 1, frame_rev: 1,
    writers: { plan_rev: 1, review_rev: 1, reanchor_rev: 1, seal: 'x' }, coverage_gap: [],
    segments: layout.segments.map((s) => ({ segment_id: s.segment_id, act: s.act, purpose: s.purpose, energy: s.energy })),
    beats: layout.beats.map((b) => ({ beat_id: b.beat_id, segment_id: b.segment_id, narration: `n-${b.beat_id}`, start: b.start, end: b.end, visual_function: b.visual_function, importance: b.importance, search_intent: `intent-${b.beat_id}`, anchor: { sentence_key: layout.sentences[0]!.sentence_key, offset_sec: 0 }, timing_rev: 4, sfx_cue: b.beat_id === 'b018' ? 'reveal-hit' : undefined })),
    shots,
  }, null, 2))

  // manifest.json (고화질 조인 — manifest:true 인 동영상 샷)
  const items = layout.shots.filter((s) => s.manifest === true).map((s) => ({
    shot_id: s.shot_id, source_id: s.source_id!, source_in: s.source_in ?? 0, source_out: s.source_out ?? 0,
    file: `sources/originals/${s.source_id}.mp4`, rights_status: s.rights_status ?? 'licensed', probe_ok: true,
  }))
  writeFileSync(join(projectDir, 'assets', 'selected', 'manifest.json'), JSON.stringify({ items }, null, 2))

  // usage.json (외부 자료 → V6 출처). review 가 만드는 것을 픽스처가 직접 기록.
  const byId = new Map(catalog.map((c) => [c.source_id, c]))
  const usage = layout.shots.filter((s) => s.source_id !== undefined && s.asset_kind !== 'a_roll' && s.source_in !== undefined).map((s) => {
    const src = byId.get(s.source_id!)!
    return { shot_id: s.shot_id, source_id: s.source_id!, source_in: s.source_in!, source_out: s.source_out!, video_in: s.start, video_out: s.end, credit_text: `${src.publisher} · ${src.title}`, rights_status: s.rights_status ?? 'licensed' }
  })
  writeFileSync(join(projectDir, 'sources', 'usage.json'), JSON.stringify(usage, null, 2))
}

/* ─────────────── 변형 ─────────────── */

/** 훅 미달: 앞 4샷만(시각 변화 < intro_30s_visual_changes_min). */
export function hookFailLayout(): FixtureLayout {
  const base = mainLayout()
  const keep = new Set(['sh0001', 'sh0002', 'sh0003', 'sh0004'])
  const beatsKeep = new Set(['b001', 'b002', 'b003', 'b004'])
  return {
    ...base,
    beats: base.beats.filter((b) => beatsKeep.has(b.beat_id)).map((b) => ({ ...b, importance: 'normal' })),
    shots: base.shots.filter((s) => keep.has(s.shot_id)),
  }
}

/** 미승인 샷 1건(selection_status != approved). */
export function unapprovedLayout(): FixtureLayout {
  const base = mainLayout()
  const shots = base.shots.map((s) => (s.shot_id === 'sh0003' ? { ...s, selection_status: 'candidate' } : s))
  return { ...base, shots }
}

/** 선행 컷(prelap) V17b 시나리오: 2샷만. overlapSec=0.5 통과, 0.6 실패. */
export function prelapLayout(overlapSec: number): FixtureLayout {
  return {
    duration: 6,
    segments: [{ segment_id: 'g01', act: 'hook', energy: 3, purpose: 'prelap' }],
    beats: [
      { beat_id: 'b001', segment_id: 'g01', importance: 'normal', visual_function: 'evidence', start: 0, end: 2 },
      { beat_id: 'b002', segment_id: 'g01', importance: 'normal', visual_function: 'evidence', start: 2, end: 4 },
    ],
    shots: [
      { shot_id: 'sh0001', beat_ids: ['b001'], start: 0, end: 2, asset_kind: 'official_video', purpose: '샷1', framing: 'wide', source_id: 'src_v1', source_in: 0, source_out: 2, manifest: true },
      { shot_id: 'sh0002', beat_ids: ['b002'], start: Number((2 - overlapSec).toFixed(3)), end: 4, asset_kind: 'official_video', purpose: '선행 컷 샷2', framing: 'person', source_id: 'src_v1', source_in: 2, source_out: 4, manifest: true },
    ],
    sentences: [{ sentence_key: 'aaaa0001', sentence_id: 'sn001', segment_id: 'g01', text: '선행 컷 테스트 문장입니다', start: 0, end: 6 }],
    emphasis: {},
  }
}

/* ─────────────── util ─────────────── */

function srtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const mm = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec - Math.floor(sec)) * 1000)
  const p = (v: number, n: number): string => String(v).padStart(n, '0')
  return `${p(h, 2)}:${p(mm, 2)}:${p(s, 2)},${p(ms, 3)}`
}

export function ensureDir(p: string): void { mkdirSync(dirname(p), { recursive: true }) }
export { resolve as resolvePath }
