/**
 * emit-numbered.ts — 경로 C: 순번 파일 세트 (spec/07:154, T5)
 *
 * `0001_sh0042.mp4` 순번 클립 + SRT + 큐 파일 + 배치 안내 ASSEMBLY.md 를 만든다.
 * 실제 transcode 오케스트레이션(ffmpeg)은 photo-motion.ts 가 담당하고 여기서는 순서·번호·배치 안내만.
 * 한 샷이 실패해도 전체를 멈추지 않고 failed[] 로 보고한다(fallback 금지).
 *
 * 수치는 profile 이 유일 출처다. 아래 상수는 파일명 자리수 등 구조 상수(// @unit).
 */
import { mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { writeAtomic } from '../lib/io.js'
import type { EditProfile } from '../lib/profile.js'
import type { TimelineModel, TrackItem, TrackName } from './model.js'
import { renderCut, renderParallaxComposite, renderColorCard } from './photo-motion.js'

const SEQ_PAD = 4 // @unit 순번 자리수 (0001_)
const CARD_BG_HEX = '#0E1115' // @unit 임팩트 카드 기본 배경(frame.md 검정, 색 토큰)

export interface NumberedResult {
  status: 'ok' | 'failed'
  path: string
  clips: { seq: number; file: string; shot_id: string; role: string }[]
  overlays: { file: string; shot_id: string; start: number; end: number }[]
  failed: { shot_id: string; reason: string }[]
  error?: string
}

function pad(n: number): string { return String(n).padStart(SEQ_PAD, '0') }

/** 메인 시퀀스 = V1+V2 + 전체화면 임팩트 카드(V5)를 시작 시각 순으로. 순번 클립의 대상. */
function primarySequence(model: TimelineModel): TrackItem[] {
  const lanes: TrackName[] = ['V1', 'V2']
  const base = lanes.flatMap((l) => model.tracks[l])
  const cards = model.tracks.V5.filter((it) => it.role === 'impact_card')
  return [...base, ...cards].slice().sort((a, b) => a.start - b.start || a.end - b.end)
}

/** parallax 오버레이(V3)를 shot_id 로 찾는다(순번 파일에서는 스틸과 합성). */
function findParallaxOverlay(model: TimelineModel, shotId: string): TrackItem | undefined {
  return model.tracks.V3.find((it) => it.role === 'photo_motion' && it.render === 'parallax_overlay' && it.shot_id === shotId)
}

export async function emitNumbered(
  model: TimelineModel, projectDir: string, profile: EditProfile, opts: { cwd: string; timeoutSec: number },
): Promise<NumberedResult> {
  const outDir = resolve(projectDir, 'assemble', 'numbered')
  try {
    mkdirSync(outDir, { recursive: true })
  } catch (err) {
    return { status: 'failed', path: outDir, clips: [], overlays: [], failed: [], error: `출력 디렉토리 생성 실패: ${(err as Error).message}` }
  }

  const clips: NumberedResult['clips'] = []
  const overlays: NumberedResult['overlays'] = []
  const failed: NumberedResult['failed'] = []
  const seq = primarySequence(model)

  for (let i = 0; i < seq.length; i++) {
    const it = seq[i]!
    const shotId = it.shot_id ?? it.id
    const outFile = join(outDir, `${pad(i + 1)}_${shotId}.mp4`)
    if (it.role === 'impact_card') {
      const res = await renderColorCard(CARD_BG_HEX, it.end - it.start, profile, outFile, opts)
      if (!res.ok) { failed.push({ shot_id: shotId, reason: res.error ?? '카드 렌더 실패' }); continue }
      clips.push({ seq: i + 1, file: outFile, shot_id: shotId, role: it.role })
      continue
    }
    if (it.role === 'photo_still') {
      const overlay = findParallaxOverlay(model, shotId)
      if (it.file === undefined || !existsSync(it.file)) { failed.push({ shot_id: shotId, reason: `스틸 없음: ${it.file ?? '(경로 없음)'}` }); continue }
      if (overlay?.file === undefined || !existsSync(overlay.file)) { failed.push({ shot_id: shotId, reason: `parallax 모션 mov 부재(T8 렌더 필요)` }); continue }
      const res = await renderParallaxComposite(it.file, overlay.file, it.end - it.start, profile, outFile, opts)
      if (!res.ok) { failed.push({ shot_id: shotId, reason: res.error ?? 'parallax 합성 실패' }); continue }
      clips.push({ seq: i + 1, file: outFile, shot_id: shotId, role: it.role })
      continue
    }
    if (it.role === 'photo_motion' && it.render === 'zoompan') {
      // materializeZoompan 이 이미 렌더한 클립 → 순번 파일로 복사.
      if (it.file === undefined || !existsSync(it.file)) { failed.push({ shot_id: shotId, reason: `zoompan 클립 없음(materialize 실패)` }); continue }
      copyFileSync(it.file, outFile)
      clips.push({ seq: i + 1, file: outFile, shot_id: shotId, role: it.role })
      continue
    }
    // 동영상/합성/인터뷰/a_roll — source_in/out 절단.
    if (it.file === undefined || !existsSync(it.file)) { failed.push({ shot_id: shotId, reason: `소스 파일 없음: ${it.file ?? '(경로 없음)'}` }); continue }
    if (it.source_in === undefined || it.source_out === undefined) { failed.push({ shot_id: shotId, reason: 'source_in/out 없음(절단 불가)' }); continue }
    const res = await renderCut(it.file, it.source_in, it.source_out, profile, outFile, { keepAudio: it.role === 'a_roll' || it.source_audio === 'moment' || it.source_audio === 'quote', cwd: opts.cwd, timeoutSec: opts.timeoutSec })
    if (!res.ok) { failed.push({ shot_id: shotId, reason: res.error ?? '절단 실패' }); continue }
    clips.push({ seq: i + 1, file: outFile, shot_id: shotId, role: it.role })
  }

  // V3 독립 모션(critical 비트 모션 그래픽) → overlay 파일로 표기(합성은 편집자).
  for (const it of model.tracks.V3) {
    if (it.role === 'motion' && it.file !== undefined) {
      overlays.push({ file: it.file, shot_id: it.shot_id ?? it.id, start: it.start, end: it.end })
    }
  }

  // SRT 복사.
  if (model.captions_srt !== null && existsSync(model.captions_srt)) {
    copyFileSync(model.captions_srt, join(outDir, 'captions.srt'))
  }
  // 큐 파일.
  writeAtomic(join(outDir, 'music-cues.json'), model.music_cues)
  writeAtomic(join(outDir, 'sound-cues.json'), model.sound_cues)

  writeAtomic(join(outDir, 'ASSEMBLY.md'), buildAssemblyMd(model, clips, overlays, failed))

  return { status: failed.length === 0 ? 'ok' : 'failed', path: outDir, clips, overlays, failed }
}

/* ─────────────── 배치 안내 ─────────────── */

function buildAssemblyMd(
  model: TimelineModel, clips: NumberedResult['clips'], overlays: NumberedResult['overlays'], failed: NumberedResult['failed'],
): string {
  const lines: string[] = []
  lines.push(`# ASSEMBLY — ${model.project} (경로 C 순번 파일 세트)`, '')
  lines.push('CapCut 초안 자동 생성이 불가한 환경(경로 A 실패)을 위한 수동 조립 안내다. 아래 순서대로 메인 트랙에 올린 뒤, 오버레이·자막·오디오를 얹는다.', '')
  lines.push(`- 총 길이: ${model.duration.toFixed(TWO)}s`, `- A1 연속 내레이션 마스터: audio/narration-master.wav (자르지 않고 전체를 A1 에 배치)`, '')
  lines.push('## 1. 메인 시퀀스 (V1/V2)', '')
  lines.push('| 순번 | 파일 | 샷 | 역할 |', '|---|---|---|---|')
  for (const c of clips) lines.push(`| ${c.seq} | ${c.file.split('/').pop()} | ${c.shot_id} | ${c.role} |`)
  lines.push('')
  if (overlays.length > 0) {
    lines.push('## 2. 오버레이 (V3 — 모션 그래픽, 해당 시각에 얹기)', '')
    lines.push('| 파일 | 샷 | 시작 | 끝 |', '|---|---|---|---|')
    for (const o of overlays) lines.push(`| ${o.file.split('/').pop() ?? o.file} | ${o.shot_id} | ${o.start.toFixed(TWO)} | ${o.end.toFixed(TWO)} |`)
    lines.push('')
  }
  if (model.tracks.A2.length > 0) {
    lines.push('## 3. 원본음 (A2 — moment/quote)', '')
    lines.push('| 샷 | 시작 | 끝 |', '|---|---|---|')
    for (const a of model.tracks.A2) lines.push(`| ${a.shot_id} | ${a.start.toFixed(TWO)} | ${a.end.toFixed(TWO)} |`)
    lines.push('')
  }
  lines.push('## 4. 자막', '', '- 기본 자막: captions.srt 를 V4 로 임포트', `- 강조/카드: V5 항목 ${model.tracks.V5.length}개 (music-cues.json/sound-cues.json 참고)`, '')
  lines.push('## 5. 큐', '', `- music-cues.json — 막 경계 ${model.music_cues.length}개`, `- sound-cues.json — SFX ${model.sound_cues.length}개`, '')
  lines.push('## 6. 출처 (V6 — 최종 자료표)', '')
  if (model.usage.length > 0) {
    lines.push('| 샷 | 원본 | 원본 구간 | 영상 내 구간 | 권리 |', '|---|---|---|---|---|')
    for (const u of model.usage) lines.push(`| ${u.shot_id} | ${u.credit_text} | ${u.source_in}-${u.source_out} | ${u.video_in}-${u.video_out} | ${u.rights_status} |`)
  } else lines.push('(usage.json 없음)')
  lines.push('')
  if (failed.length > 0) {
    lines.push('## ⚠ 실패 샷 (fallback 없음 — 사람 조치 필요)', '')
    for (const f of failed) lines.push(`- ${f.shot_id}: ${f.reason}`)
    lines.push('')
  }
  return lines.join('\n')
}

const TWO = 2 // @unit 표시 소수 자리
