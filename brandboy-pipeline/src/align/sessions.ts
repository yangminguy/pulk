/**
 * sessions.ts — 세션 접합 정합 (T3b, spec/02 §6~7, T3-align §T3b)
 *
 * 세션별 마스터(edit.ts 산출)를 하나의 연속 내레이션 마스터로 잇는다.
 *  1. 세션별 룸톤 샘플 추출(각 세션 시작 전 5초 무음 — 녹음 SOP)
 *  2. 접합부에 룸톤 삽입(roomtone_ms) + 크로스페이드(crossfade_ms)
 *  3. 전체 마스터 1회만 정규화 — 세션별 loudnorm 금지(2패스 linear loudnorm)
 *
 * 경고: 세션 간 통합 LUFS 편차 > session_lufs_deviation_max,
 *       노이즈 플로어 편차 > session_noise_floor_deviation_db → session_warnings.
 * 수치는 전부 profile.
 */
import { run } from '../lib/proc.js'
import type { EditProfile } from '../lib/profile.js'

const MS_PER_SEC = 1000 // @unit 밀리초→초
const DECIMALS = 3 // @unit 시각 소수 3자리
const OUT_SR = 16000 // @unit 마스터 샘플레이트(Hz) — 픽스처·whisper 정합
const ROOM_SAMPLE_START = 0.5 // @unit 룸톤 샘플 추출 시작(초, 5초 룸톤 안쪽)
const RENDER_TIMEOUT_SEC = 180 // @unit 접합/정규화 렌더 타임아웃
const MEASURE_TIMEOUT_SEC = 60 // @unit loudnorm/astats 측정 타임아웃
const ERR_TAIL = 800 // @unit ffmpeg stderr 로그 절단 길이
const MIN_FOR_SPREAD = 2 // @unit 편차 산출 최소 세션 수

function round3(n: number): number {
  return Number(n.toFixed(DECIMALS))
}

export interface SessionWarning {
  kind: 'lufs_deviation' | 'noise_floor_deviation'
  detail: string
}

export interface SpliceResult {
  duration: number
  global_starts: number[] // 각 세션 콘텐츠가 시작하는 글로벌 마스터 시각
  boundaries: number[] // 접합부(크로스페이드 seam) 마스터 시각 — verify-sessions 판정점
  session_lufs: number[]
  session_noise_floor: number[]
  warnings: SessionWarning[]
}

/* ─────────────── 측정 ─────────────── */

function parseLoudnormJson(stderr: string): Record<string, string> | null {
  const m = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as Record<string, string>
  } catch {
    return null
  }
}

/** 세션 마스터의 통합 라우드니스(LUFS). loudnorm print 의 input_i. */
export async function measureLufs(wav: string, profile: EditProfile): Promise<number> {
  const r = await run(
    'ffmpeg',
    ['-hide_banner', '-i', wav, '-af', `loudnorm=I=${profile.audio.program_lufs}:TP=${profile.audio.true_peak_dbtp}:print_format=json`, '-f', 'null', '-'],
    { timeoutSec: MEASURE_TIMEOUT_SEC },
  )
  const j = parseLoudnormJson(r.stderr)
  if (!j || j['input_i'] === undefined) throw new Error(`LUFS 측정 실패: ${wav}`)
  return round3(Number(j['input_i']))
}

/** 룸톤 샘플의 노이즈 플로어(astats Overall RMS level dB). */
export async function measureNoiseFloor(roomWav: string): Promise<number> {
  const r = await run('ffmpeg', ['-hide_banner', '-i', roomWav, '-af', 'astats=metadata=0', '-f', 'null', '-'], {
    timeoutSec: MEASURE_TIMEOUT_SEC,
  })
  const all = [...r.stderr.matchAll(/RMS level dB:\s*(-?[\d.]+|-?inf)/g)].map((x) => x[1]!)
  if (all.length === 0) throw new Error(`노이즈 플로어 측정 실패: ${roomWav}`)
  const last = all[all.length - 1]!
  return last.includes('inf') ? Number.NEGATIVE_INFINITY : round3(Number(last))
}

/** 원 세션에서 룸톤 샘플(roomtone_ms) 을 추출한다(마이크별 방 소리 보존). */
export async function extractRoomtone(rawWav: string, outWav: string, profile: EditProfile): Promise<void> {
  const dur = profile.audio.roomtone_ms[1] / MS_PER_SEC
  const r = await run(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(ROOM_SAMPLE_START), '-t', String(dur), '-i', rawWav, '-ar', String(OUT_SR), '-ac', '1', '-c:a', 'pcm_s16le', outWav],
    { timeoutSec: MEASURE_TIMEOUT_SEC },
  )
  if (r.code !== 0) throw new Error(`룸톤 추출 실패: ${outWav}\n${r.stderr.slice(-ERR_TAIL)}`)
}

/* ─────────────── 접합 ─────────────── */

export interface SessionInput {
  master: string // 세션 마스터 WAV
  master_duration: number
  roomtone: string // 이 세션의 룸톤 샘플(직전 접합부 브릿지로 사용)
}

/**
 * 세션 마스터들을 룸톤 브릿지 + 크로스페이드로 이어 하나의 (미정규화) 마스터로 만든다.
 * 접합부는 룸톤↔룸톤 크로스페이드라 발화 레벨 차와 무관하게 매끄럽다.
 * 글로벌 시작 시각/접합부 시각을 acrossfade 누적 모델로 계산한다.
 */
export async function spliceSessions(
  sessions: SessionInput[],
  profile: EditProfile,
  outPath: string,
): Promise<{ duration: number; global_starts: number[]; boundaries: number[] }> {
  const C = profile.audio.crossfade_ms[0] / MS_PER_SEC
  const R = profile.audio.roomtone_ms[1] / MS_PER_SEC

  if (sessions.length === 1) {
    // 단일 세션: 접합 없음. 마스터를 그대로 복사(포맷 통일)
    const r = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sessions[0]!.master, '-ar', String(OUT_SR), '-ac', '1', '-c:a', 'pcm_s16le', outPath], { timeoutSec: RENDER_TIMEOUT_SEC })
    if (r.code !== 0) throw new Error(`단일 세션 복사 실패\n${r.stderr.slice(-ERR_TAIL)}`)
    return { duration: sessions[0]!.master_duration, global_starts: [0], boundaries: [] }
  }

  // 입력 인터리브: m0, room1, m1, room2, m2, ...
  const inputs: string[] = ['-i', sessions[0]!.master]
  for (let k = 1; k < sessions.length; k++) {
    inputs.push('-i', sessions[k]!.roomtone, '-i', sessions[k]!.master)
  }

  // acrossfade 체인 + 누적 모델로 글로벌 시각 산출
  const global_starts: number[] = [0]
  const boundaries: number[] = []
  const lines: string[] = []
  let cum = sessions[0]!.master_duration
  let prev = '0:a'
  let inIdx = 1
  for (let k = 1; k < sessions.length; k++) {
    // 룸톤 브릿지
    const roomLabel = `r${k}`
    lines.push(`[${prev}][${inIdx}:a]acrossfade=d=${C}:c1=tri:c2=tri[${roomLabel}]`)
    cum = round3(cum + R - C)
    prev = roomLabel
    inIdx++
    // 세션 마스터
    const outLabel = k === sessions.length - 1 ? 'out' : `m${k}`
    lines.push(`[${prev}][${inIdx}:a]acrossfade=d=${C}:c1=tri:c2=tri[${outLabel}]`)
    const startK = round3(cum - C)
    global_starts.push(startK)
    boundaries.push(startK)
    cum = round3(cum + sessions[k]!.master_duration - C)
    prev = outLabel
    inIdx++
  }
  const graph = lines.join(';')

  const args = ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[out]', '-ar', String(OUT_SR), '-ac', '1', '-c:a', 'pcm_s16le', outPath]
  const r = await run('ffmpeg', args, { timeoutSec: RENDER_TIMEOUT_SEC })
  if (r.code !== 0) throw new Error(`세션 접합 실패\n${r.stderr.slice(-ERR_TAIL)}`)
  return { duration: round3(cum), global_starts, boundaries }
}

/**
 * 전체 마스터 1회 정규화 — 2패스 linear loudnorm(정확도 ±0.5 LU 목표).
 * 시간축을 바꾸지 않으므로(linear) 단어 시각이 보존된다.
 */
export async function finalizeLoudness(inWav: string, outWav: string, profile: EditProfile): Promise<void> {
  const I = profile.audio.program_lufs
  const TP = profile.audio.true_peak_dbtp
  // pass 1: 측정
  const p1 = await run('ffmpeg', ['-hide_banner', '-i', inWav, '-af', `loudnorm=I=${I}:TP=${TP}:print_format=json`, '-f', 'null', '-'], { timeoutSec: MEASURE_TIMEOUT_SEC })
  const m = parseLoudnormJson(p1.stderr)
  if (!m) throw new Error(`loudnorm 측정 실패(pass1): ${inWav}`)
  const filt =
    `loudnorm=I=${I}:TP=${TP}:linear=true:` +
    `measured_I=${m['input_i']}:measured_LRA=${m['input_lra']}:measured_TP=${m['input_tp']}:` +
    `measured_thresh=${m['input_thresh']}:offset=${m['target_offset']}:print_format=summary`
  const p2 = await run('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-y', '-i', inWav, '-af', filt, '-ar', String(OUT_SR), '-ac', '1', '-c:a', 'pcm_s16le', outWav], { timeoutSec: RENDER_TIMEOUT_SEC })
  if (p2.code !== 0) throw new Error(`loudnorm 적용 실패(pass2): ${outWav}\n${p2.stderr.slice(-ERR_TAIL)}`)
}

/** 세션 간 LUFS·노이즈 플로어 편차 경고. */
export function sessionWarnings(lufs: number[], noise: number[], profile: EditProfile): SessionWarning[] {
  const out: SessionWarning[] = []
  const spread = (xs: number[]): number => {
    const fin = xs.filter((x) => Number.isFinite(x))
    if (fin.length < MIN_FOR_SPREAD) return 0
    return Math.max(...fin) - Math.min(...fin)
  }
  const lufsSpread = spread(lufs)
  if (lufsSpread > profile.audio.session_lufs_deviation_max) {
    out.push({ kind: 'lufs_deviation', detail: `세션 간 LUFS 편차 ${round3(lufsSpread)} LU (기준 ${profile.audio.session_lufs_deviation_max})` })
  }
  const noiseSpread = spread(noise)
  if (noiseSpread > profile.audio.session_noise_floor_deviation_db) {
    out.push({ kind: 'noise_floor_deviation', detail: `세션 간 노이즈 플로어 편차 ${round3(noiseSpread)} dB (기준 ${profile.audio.session_noise_floor_deviation_db})` })
  }
  return out
}
