/**
 * align.ts — 통녹음 → 연속 마스터 + 단어 시각 + 자막 (T3, spec/02, T3-align)
 *
 * 무재테이크 세션 녹음을 빈 공백만 다듬어 하나의 자연스러운 연속 마스터로 잇는다.
 * 처리 순서(T3-align):
 *  1 세션별 whisper 단어 시각 · 2 정규화 · 3 문장 정렬(무재테이크) · 4 빈 공백 정리
 *  5 세션 내부 연속 편집 · 6 세션 접합(T3b) · 7 크로스페이드·룸톤 · 8 시각 재계산
 *  9 원고 자막 · 10 align-remap(이전 실행 있으면)
 *
 * 출력: audio/{narration-master.wav,words.json,captions.srt,captions.meta.json} ·
 *       timeline.json · align-remap.json · align-report.json
 * --only session-NN(scope.ts) · --dry-run(파일 미생성). 수치는 전부 profile.
 */
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { z } from 'zod'
import { loadProfile, loadFrame, ConfigError, type EditProfile } from '../lib/profile.js'
import { writeAtomic } from '../lib/io.js'
import { sha256File } from '../lib/canonical.js'
import { cacheGet, cacheSet } from '../lib/cache.js'
import { shouldReprocessSession, sessionStateEntry } from '../lib/scope.js'
import { InputError } from './validate.js'
import { alignWordsToScript, type TimedWord, type ScriptWindow } from '../lib/similarity.js'
import { transcribeWords } from '../align/transcribe.js'
import { matchSentences, type ScriptSentenceLite, type SentenceMatch } from '../align/match.js'
import { buildEditPlan, probeDuration, detectSilences, renderSessionMaster, rawToMaster, type SessionEditPlan } from '../align/edit.js'
import {
  extractRoomtone, measureLufs, measureNoiseFloor, spliceSessions, finalizeLoudness, sessionWarnings,
  type SessionInput, type SessionWarning,
} from '../align/sessions.js'
import { buildCaptions, type CaptionSentence } from '../align/captions-ko.js'
import { writeSRT } from '../lib/captions.js'

const DECIMALS = 3 // @unit 시각 소수 3자리
const MIN_WORD_DUR = 0.001 // @unit 단어 최소 길이(초, end>start 보장)
const SENTENCE_KEY_LEN = 8 // @unit 사람 부여 불변 문장 ID 길이(CONTRACTS §2)

function round3(n: number): number {
  return Number(n.toFixed(DECIMALS))
}

/* ─────────────── script-map 스키마 ─────────────── */

const ScriptMapSchema = z.object({
  sentences: z.array(z.object({
    sentence_key: z.string().length(SENTENCE_KEY_LEN),
    sentence_id: z.string(),
    segment_id: z.string(),
    text: z.string().min(1),
    emphasis_caption: z.string().optional(),
  })).min(1),
  sessions: z.array(z.object({
    id: z.string().regex(/^session-\d{2}$/),
    wav_path: z.string(),
    from_sentence_key: z.string().length(SENTENCE_KEY_LEN),
    to_sentence_key: z.string().length(SENTENCE_KEY_LEN),
  })).min(1),
})
type ScriptMap = z.infer<typeof ScriptMapSchema>

/* ─────────────── 옵션/결과 ─────────────── */

export interface AlignOptions {
  only: string[] // session-NN
  dryRun: boolean
  human: boolean
  model?: string
}

export interface AlignSummary {
  ok: boolean
  dry_run: boolean
  sessions: number
  matched: number
  unmatched: string[]
  duration: number
  trimmed_gaps: number
  low_confidence: number
  session_warnings: SessionWarning[]
  master: string | null
  align_rev: number
}

/* ─────────────── 세션 처리 ─────────────── */

interface ProcessedSession {
  id: string
  words: TimedWord[]
  matched: SentenceMatch[]
  plan: SessionEditPlan
  master: string
  raw: string
}

async function transcribeCached(
  wav: string, profile: EditProfile, model: string | undefined, forceFresh: boolean,
): Promise<TimedWord[]> {
  const key = `align-transcribe:${model ?? 'default'}:${sha256File(wav)}`
  if (!forceFresh) {
    const hit = cacheGet(key, { ttlDays: profile.harvest.cache_ttl_days }) as TimedWord[] | null
    if (hit && Array.isArray(hit)) return hit
  }
  const words = await transcribeWords(wav, { model })
  cacheSet(key, words)
  return words
}

/* ─────────────── remap ─────────────── */

interface RemapEntry {
  key: string
  status: 'unchanged' | 'shifted' | 'rescaled' | 'edited' | 'added' | 'removed'
  old_start?: number
  new_start?: number
  old_dur?: number
  new_dur?: number
  old_text?: string
  new_text?: string
  similarity?: number
}

interface PrevSentence { sentence_key: string; text: string; start: number; end: number }

function buildRemap(
  prev: PrevSentence[] | null,
  next: { sentence_key: string; text: string; start: number; end: number }[],
  profile: EditProfile,
  alignRev: number,
): { align_rev: number; sentences: RemapEntry[] } {
  const sentences: RemapEntry[] = []
  if (prev === null) return { align_rev: alignRev, sentences }
  const tol = profile.captions.impact_card.sync_tolerance_sec
  const prevMap = new Map(prev.map((s) => [s.sentence_key, s]))
  const nextMap = new Map(next.map((s) => [s.sentence_key, s]))
  const norm = (t: string): string => t.replace(/\s+/g, '')

  for (const n of next) {
    const o = prevMap.get(n.sentence_key)
    if (!o) {
      sentences.push({ key: n.sentence_key, status: 'added', new_start: n.start, new_dur: round3(n.end - n.start), new_text: n.text })
      continue
    }
    const oldDur = round3(o.end - o.start)
    const newDur = round3(n.end - n.start)
    if (norm(o.text) !== norm(n.text)) {
      sentences.push({ key: n.sentence_key, status: 'edited', old_text: o.text, new_text: n.text, old_start: o.start, new_start: n.start, old_dur: oldDur, new_dur: newDur })
    } else if (Math.abs(newDur - oldDur) > tol) {
      sentences.push({ key: n.sentence_key, status: 'rescaled', old_start: o.start, new_start: n.start, old_dur: oldDur, new_dur: newDur })
    } else if (Math.abs(n.start - o.start) > tol) {
      sentences.push({ key: n.sentence_key, status: 'shifted', old_start: o.start, new_start: n.start, old_dur: oldDur, new_dur: newDur })
    } else {
      sentences.push({ key: n.sentence_key, status: 'unchanged', old_start: o.start, new_start: n.start, old_dur: oldDur, new_dur: newDur })
    }
  }
  for (const o of prev) {
    if (!nextMap.has(o.sentence_key)) {
      sentences.push({ key: o.sentence_key, status: 'removed', old_start: o.start, old_dur: round3(o.end - o.start), old_text: o.text })
    }
  }
  return { align_rev: alignRev, sentences }
}

/* ─────────────── 진입점 ─────────────── */

export async function runAlign(projectDir: string, opts: AlignOptions): Promise<{ summary: AlignSummary; exitCode: number }> {
  // 실행 경로만 프로젝트에 부트스트랩. --dry-run 은 읽기 성격이므로 쓰지 않는다.
  const bootstrap = { bootstrap: !opts.dryRun }
  const profile = loadProfile(projectDir, bootstrap)
  loadFrame(projectDir, bootstrap) // frame_rev 존재 확인(없으면 ConfigError)

  const mapPath = resolve(projectDir, 'script-map.json')
  if (!existsSync(mapPath)) throw new InputError(`script-map.json 없음: ${mapPath}`)
  let mapRaw: unknown
  try {
    mapRaw = JSON.parse(readFileSync(mapPath, 'utf8'))
  } catch (err) {
    throw new InputError(`script-map.json 파싱 실패: ${(err as Error).message}`)
  }
  const parsed = ScriptMapSchema.safeParse(mapRaw)
  if (!parsed.success) throw new InputError(`script-map.json 스키마 위반: ${parsed.error.issues.map((i) => i.path.join('.') + ':' + i.code).join(' | ')}`)
  const map: ScriptMap = parsed.data

  // 이전 timeline(remap·align_rev 승계)
  const timelinePath = resolve(projectDir, 'timeline.json')
  let prevSentences: PrevSentence[] | null = null
  let prevAlignRev = 0
  if (existsSync(timelinePath)) {
    try {
      const t = JSON.parse(readFileSync(timelinePath, 'utf8')) as { align_rev?: number; sentences?: PrevSentence[] }
      prevAlignRev = t.align_rev ?? 0
      prevSentences = (t.sentences ?? []).map((s) => ({ sentence_key: s.sentence_key, text: s.text, start: s.start, end: s.end }))
    } catch { /* 무시: 손상된 이전 파일은 remap 없이 진행 */ }
  }
  const alignRev = prevAlignRev + 1

  const stateFile = resolve(projectDir, 'align-state.json')
  const onlySet = new Set(opts.only)
  const audioDir = resolve(projectDir, 'audio')
  const sessDir = join(audioDir, 'sessions')
  const tmpDir = join(audioDir, '.tmp-align')

  // ── 세션별 처리(1~5) ──
  const processed: ProcessedSession[] = []
  const unmatchedAll: string[] = []
  if (!opts.dryRun) {
    mkdirSync(sessDir, { recursive: true })
    mkdirSync(tmpDir, { recursive: true })
  }

  const sentByKey = new Map(map.sentences.map((s) => [s.sentence_key, s]))
  for (const sess of map.sessions) {
    const wav = resolve(projectDir, sess.wav_path)
    if (!existsSync(wav)) throw new InputError(`세션 WAV 없음: ${wav}`)
    const forceFresh = onlySet.size > 0 && onlySet.has(sess.id)
    // scope 헬퍼: WAV 가 마지막 실행 이후 새로우면 재처리(로그)
    const reprocess = shouldReprocessSession(sess.id, wav, stateFile)
    if (opts.only.length > 0 && !onlySet.has(sess.id) && !reprocess) {
      process.stderr.write(`[align] ${sess.id}: --only 범위 밖 + 변경 없음(캐시 사용)\n`)
    }

    const words = await transcribeCached(wav, profile, opts.model, forceFresh)
    const fromI = map.sentences.findIndex((s) => s.sentence_key === sess.from_sentence_key)
    const toI = map.sentences.findIndex((s) => s.sentence_key === sess.to_sentence_key)
    const subset: ScriptSentenceLite[] = map.sentences.slice(fromI, toI + 1)
    const m = matchSentences(words, subset, profile)
    for (const u of m.unmatched) unmatchedAll.push(u.sentence_key)

    const dur = await probeDuration(wav)
    const silences = await detectSilences(wav, profile)
    const plan = buildEditPlan(m.matched, profile, dur, silences)
    plan.silences = silences

    const master = join(sessDir, `${sess.id}-master.wav`)
    if (!opts.dryRun) await renderSessionMaster(wav, plan, master)
    processed.push({ id: sess.id, words, matched: m.matched, plan, master, raw: wav })
  }

  // ── 미매칭 → exit 1 (마스터·타임라인 생성 안 함) ──
  if (unmatchedAll.length > 0) {
    const report = {
      input_duration: 0, output_duration: 0, removed_sec: 0, word_timing: 'exact',
      trimmed_gaps: [], low_confidence: [], unmatched: unmatchedAll, session_warnings: [],
    }
    if (!opts.dryRun) writeAtomic(resolve(projectDir, 'align-report.json'), report)
    const summary: AlignSummary = {
      ok: false, dry_run: opts.dryRun, sessions: map.sessions.length, matched: processed.reduce((a, p) => a + p.matched.length, 0),
      unmatched: unmatchedAll, duration: 0, trimmed_gaps: 0, low_confidence: 0, session_warnings: [], master: null, align_rev: alignRev,
    }
    if (!opts.dryRun) rmSync(tmpDir, { recursive: true, force: true })
    return { summary, exitCode: 1 }
  }

  // ── 세션 접합(6~7) + 최종 정규화 ──
  let masterPath: string | null = null
  let masterDuration = 0
  let globalStarts: number[] = processed.map(() => 0)
  let boundaries: number[] = []
  let sessionLufs: number[] = []
  let sessionNoise: number[] = []
  let warnings: SessionWarning[] = []

  if (!opts.dryRun) {
    const inputs: SessionInput[] = []
    for (let k = 0; k < processed.length; k++) {
      const p = processed[k]!
      const room = join(tmpDir, `${p.id}-room.wav`)
      await extractRoomtone(p.raw, room, profile)
      sessionLufs.push(await measureLufs(p.master, profile))
      sessionNoise.push(await measureNoiseFloor(room))
      inputs.push({ master: p.master, master_duration: p.plan.master_duration, roomtone: room })
    }
    warnings = sessionWarnings(sessionLufs, sessionNoise, profile)

    const combined = join(tmpDir, 'combined.wav')
    const spliced = await spliceSessions(inputs, profile, combined)
    globalStarts = spliced.global_starts
    boundaries = spliced.boundaries

    masterPath = resolve(audioDir, 'narration-master.wav')
    await finalizeLoudness(combined, masterPath, profile)
    masterDuration = await probeDuration(masterPath)
  } else {
    // dry-run: 접합/정규화 없이 세션 마스터 길이 합으로 대략 산출
    masterDuration = round3(processed.reduce((a, p) => a + p.plan.master_duration, 0))
  }

  // ── 시각 재계산(8) — 세션 로컬 마스터 → 글로벌 ──
  const tlSentences: {
    sentence_key: string; sentence_id: string; segment_id: string; text: string
    start: number; end: number; words: TimedWord[]
  }[] = []
  const flatWords: (TimedWord & { sentence_key: string })[] = []

  for (let k = 0; k < processed.length; k++) {
    const p = processed[k]!
    const offset = globalStarts[k] ?? 0
    // 원고 표기 교정(창=문장별 raw 구간)
    const windows: ScriptWindow[] = p.matched.map((mm) => ({ startSec: mm.raw_start, endSec: mm.raw_end, text: mm.text }))
    const corrected = alignWordsToScript(p.words, windows)

    for (const mm of p.matched) {
      const meta = sentByKey.get(mm.sentence_key)!
      const wordsOut: TimedWord[] = []
      for (let i = mm.start_idx; i <= mm.end_idx; i++) {
        const w = corrected[i]!
        const gs = round3(offset + rawToMaster(p.plan, w.start))
        let ge = round3(offset + rawToMaster(p.plan, w.end))
        if (ge <= gs) ge = round3(gs + MIN_WORD_DUR)
        const tw: TimedWord = { text: w.text, start: gs, end: ge }
        wordsOut.push(tw)
        flatWords.push({ ...tw, sentence_key: mm.sentence_key })
      }
      const sStart = wordsOut[0]!.start
      let sEnd = wordsOut[wordsOut.length - 1]!.end
      if (sEnd <= sStart) sEnd = round3(sStart + MIN_WORD_DUR)
      tlSentences.push({
        sentence_key: mm.sentence_key, sentence_id: meta.sentence_id, segment_id: meta.segment_id,
        text: mm.text, start: sStart, end: sEnd, words: wordsOut,
      })
    }
  }

  const duration = opts.dryRun ? masterDuration : Math.max(masterDuration, tlSentences.length ? tlSentences[tlSentences.length - 1]!.end : 0)

  // ── 자막(9) ──
  const capInput: CaptionSentence[] = tlSentences.map((s) => ({
    sentence_key: s.sentence_key, text: s.text, start: s.start, end: s.end, words: s.words,
    emphasis_caption: sentByKey.get(s.sentence_key)?.emphasis_caption,
  }))
  const { cues, meta } = buildCaptions(capInput, profile)

  // ── 리포트 집계 ──
  const trimmedGaps = processed.flatMap((p, k) => p.plan.trimmed_gaps.map((g) => ({ at: round3((globalStarts[k] ?? 0) + g.at), removed_sec: g.removed_sec })))
  const lowConf = processed.flatMap((p) => p.matched.filter((mm) => mm.low_confidence).map((mm) => ({ sentence_key: mm.sentence_key, similarity: mm.similarity })))
  const inputDurTotal = round3(processed.reduce((a, p) => a + p.plan.input_duration, 0))
  const removedTotal = round3(processed.reduce((a, p) => a + p.plan.removed_sec, 0))

  const timeline = { duration, align_rev: alignRev, profile_rev: profile.profile_rev, word_timing: 'exact' as const, sentences: tlSentences }
  const remap = buildRemap(prevSentences, tlSentences.map((s) => ({ sentence_key: s.sentence_key, text: s.text, start: s.start, end: s.end })), profile, alignRev)
  const report = {
    input_duration: inputDurTotal,
    output_duration: duration,
    removed_sec: removedTotal,
    word_timing: 'exact',
    trimmed_gaps: trimmedGaps,
    low_confidence: lowConf,
    unmatched: [] as string[],
    session_warnings: warnings,
    session_boundaries: boundaries,
    session_lufs: sessionLufs,
    session_noise_floor: sessionNoise,
    narration_padding_sec: profile.audio.narration_padding_sec,
  }

  // ── 쓰기(dry-run 이면 파일 미생성) ──
  if (!opts.dryRun) {
    writeAtomic(resolve(audioDir, 'words.json'), { word_timing: 'exact', words: flatWords })
    writeAtomic(resolve(audioDir, 'captions.srt'), writeSRT(cues))
    writeAtomic(resolve(audioDir, 'captions.meta.json'), meta)
    writeAtomic(timelinePath, timeline)
    writeAtomic(resolve(projectDir, 'align-remap.json'), remap)
    writeAtomic(resolve(projectDir, 'align-report.json'), report)
    // 세션 상태 갱신(scope.ts skip 판단용)
    const state = { sessions: Object.fromEntries(processed.map((p) => [p.id, sessionStateEntry(p.raw)])) }
    writeAtomic(stateFile, state)
    rmSync(tmpDir, { recursive: true, force: true })
  }

  const summary: AlignSummary = {
    ok: true, dry_run: opts.dryRun, sessions: map.sessions.length,
    matched: tlSentences.length, unmatched: [], duration,
    trimmed_gaps: trimmedGaps.length, low_confidence: lowConf.length,
    session_warnings: warnings, master: opts.dryRun ? null : masterPath, align_rev: alignRev,
  }
  if (opts.human) {
    process.stderr.write(`\n■ align — ok=${summary.ok} dry_run=${summary.dry_run} sessions=${summary.sessions} matched=${summary.matched}\n`)
    process.stderr.write(`  duration=${duration}s removed=${removedTotal}s trimmed_gaps=${trimmedGaps.length} low_confidence=${lowConf.length}\n`)
    process.stderr.write(`  session_warnings=${JSON.stringify(warnings)} align_rev=${alignRev}\n`)
  }
  return { summary, exitCode: 0 }
}
