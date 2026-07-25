/**
 * edit.ts — 세션 내부 빈 공백 정리 + 연속 마스터 편집 (spec/02 §6, T3-align §3~4)
 *
 * 무재테이크 전제 → 테이크 선택 로직 없음. 발화 사이 죽은 공백·긴 침묵만 다듬는다.
 *  - 자연스럽게 이어진 문장(gap ≤ merge_gap)은 하나의 연속 구간으로 유지(호흡 보존)
 *  - 긴 침묵(gap > merge_gap)이 있는 경계만 절단, 컷에 크로스페이드
 *  - 패딩 head 0.15 / tail 0.25 (뒤를 더 준다). 룸톤은 이 패딩 구간이 자연 보존한다
 *  - 절단은 ffmpeg 단일 필터그래프(asplit+atrim+acrossfade)로 한 번에. concat-of-files 금지
 *  - 개별 구간 loudnorm 금지 — 최종 마스터 1회만(sessions.ts)
 *
 * silencedetect stderr 를 파싱해 침묵 경계를 확인한다(spec 요구). 수치는 전부 profile.
 */
import { run } from '../lib/proc.js'
import type { EditProfile } from '../lib/profile.js'
import type { SentenceMatch } from './match.js'

const MS_PER_SEC = 1000 // @unit 밀리초→초
const DECIMALS = 3 // @unit 시각 소수 3자리
const PROBE_TIMEOUT_SEC = 30 // @unit ffprobe/ffmpeg 짧은 작업 타임아웃
const RENDER_TIMEOUT_SEC = 120 // @unit 세션 렌더 타임아웃
const FILTER_SCRIPT_THRESHOLD = 50 // @unit 구간 50개 초과 시 -filter_script 사용(spec/02 §6)

function round3(n: number): number {
  return Number(n.toFixed(DECIMALS))
}

export interface KeepSegment {
  raw_start: number
  raw_end: number
  master_start: number
  master_end: number
}

export interface Silence {
  start: number
  end: number
}

export interface TrimmedGap {
  at: number // 마스터 시각의 컷 지점
  removed_sec: number
}

export interface SessionEditPlan {
  keep_segments: KeepSegment[]
  trimmed_gaps: TrimmedGap[]
  master_duration: number
  input_duration: number
  removed_sec: number
  silences: Silence[]
  crossfade_sec: number
}

/* ─────────────── ffprobe · silencedetect ─────────────── */

export async function probeDuration(wavPath: string): Promise<number> {
  const r = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', wavPath], {
    timeoutSec: PROBE_TIMEOUT_SEC,
  })
  const dur = Number(r.stdout.trim())
  if (!Number.isFinite(dur) || dur <= 0) throw new Error(`세션 길이 측정 실패: ${wavPath}\n${r.stderr.slice(-ERR_TAIL)}`)
  return round3(dur)
}

/** silencedetect stderr 파싱 → 침묵 구간 목록. noise·d 는 profile 에서. */
export async function detectSilences(wavPath: string, profile: EditProfile): Promise<Silence[]> {
  const db = profile.audio.silence_detect_db
  const d = profile.audio.merge_gap_sec
  const r = await run('ffmpeg', ['-hide_banner', '-i', wavPath, '-af', `silencedetect=noise=${db}dB:d=${d}`, '-f', 'null', '-'], {
    timeoutSec: PROBE_TIMEOUT_SEC,
  })
  const out: Silence[] = []
  let curStart: number | null = null
  for (const line of r.stderr.split('\n')) {
    const ms = line.match(/silence_start:\s*(-?[\d.]+)/)
    const me = line.match(/silence_end:\s*(-?[\d.]+)/)
    if (ms) curStart = Number(ms[1])
    if (me && curStart !== null) {
      out.push({ start: round3(curStart), end: round3(Number(me[1])) })
      curStart = null
    }
  }
  return out
}

/* ─────────────── 편집 계획 ─────────────── */

/** 발화 시작 fw 를 감싸는/직전 침묵의 끝(실제 발화 온셋)으로 스냅. 없으면 fw. 허용오차는 align.snap_tolerance_sec. */
function onsetAnchor(sils: Silence[], fw: number, snapTol: number): number {
  const inside = sils.find((s) => fw >= s.start && fw <= s.end)
  if (inside) return inside.end
  const before = sils.filter((s) => s.end <= fw && s.end >= fw - snapTol).sort((a, b) => b.end - a.end)[0]
  return before ? before.end : fw
}

/** 발화 끝 le 를 감싸는/직후 침묵의 시작(실제 발화 오프셋)으로 스냅. 없으면 le. 허용오차는 align.snap_tolerance_sec. */
function offsetAnchor(sils: Silence[], le: number, snapTol: number): number {
  const inside = sils.find((s) => le >= s.start && le <= s.end)
  if (inside) return inside.start
  const after = sils.filter((s) => s.start >= le && s.start <= le + snapTol).sort((a, b) => a.start - b.start)[0]
  return after ? after.start : le
}

/**
 * 매칭된 문장(raw 시각)에서 keep 구간·트림 갭·raw→master 맵을 만든다.
 * gap ≤ merge_gap 인 인접 문장은 한 구간으로 병합(연속 유지). gap > merge_gap 은 절단.
 * whisper 단어경계는 느슨하므로 silencedetect 경계로 스냅해 정확히 트림한다(spec/02 §6).
 */
export function buildEditPlan(
  matched: SentenceMatch[],
  profile: EditProfile,
  inputDuration: number,
  silences: Silence[],
): SessionEditPlan {
  const headPad = profile.audio.narration_padding_sec.head
  const tailPad = profile.audio.narration_padding_sec.tail
  const mergeGap = profile.audio.merge_gap_sec
  const crossfade = profile.audio.crossfade_ms[0] / MS_PER_SEC // 최소값(아티팩트 최소)

  // 1) 문장을 merge_gap 기준으로 그룹핑
  const groups: SentenceMatch[][] = []
  let cur: SentenceMatch[] = []
  for (let i = 0; i < matched.length; i++) {
    const m = matched[i]!
    if (i === 0) {
      cur = [m]
      continue
    }
    const gap = m.raw_start - matched[i - 1]!.raw_end
    if (gap > mergeGap) {
      groups.push(cur)
      cur = [m]
    } else {
      cur.push(m)
    }
  }
  if (cur.length > 0) groups.push(cur)

  // 2) keep 구간(raw) — 경계를 침묵으로 스냅 + 패딩 + 마스터 배치
  const keep: KeepSegment[] = []
  let prevKeepEnd = 0
  let masterCursor = 0
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g]!
    const onset = onsetAnchor(silences, grp[0]!.raw_start, profile.align.snap_tolerance_sec)
    const offset = offsetAnchor(silences, grp[grp.length - 1]!.raw_end, profile.align.snap_tolerance_sec)
    const rawStart = Math.max(0, prevKeepEnd, round3(onset - headPad))
    const rawEnd = Math.min(inputDuration, Math.max(rawStart + tailPad, round3(offset + tailPad)))
    const dur = Math.max(0, rawEnd - rawStart)
    const masterStart = g === 0 ? 0 : round3(masterCursor - crossfade)
    const masterEnd = round3(masterStart + dur)
    keep.push({ raw_start: rawStart, raw_end: rawEnd, master_start: masterStart, master_end: masterEnd })
    prevKeepEnd = rawEnd
    masterCursor = masterEnd
  }

  // 3) 트림 갭(인접 그룹 사이 제거된 침묵) — at 은 마스터 컷 지점
  const trimmed: TrimmedGap[] = []
  let removedTotal = 0
  // 선행 룸톤 제거
  if (keep.length > 0) removedTotal += keep[0]!.raw_start
  for (let g = 1; g < keep.length; g++) {
    const removed = round3(keep[g]!.raw_start - keep[g - 1]!.raw_end)
    if (removed > 0) {
      trimmed.push({ at: keep[g - 1]!.master_end, removed_sec: removed })
      removedTotal += removed
    }
  }
  // 후행 침묵 제거
  if (keep.length > 0) removedTotal += Math.max(0, inputDuration - keep[keep.length - 1]!.raw_end)

  const masterDuration = keep.length > 0 ? keep[keep.length - 1]!.master_end : 0

  return {
    keep_segments: keep,
    trimmed_gaps: trimmed,
    master_duration: round3(masterDuration),
    input_duration: round3(inputDuration),
    removed_sec: round3(removedTotal),
    silences: [],
    crossfade_sec: round3(crossfade),
  }
}

/** raw 세션 시각 → 세션 마스터 시각(piecewise linear). 갭이면 경계로 클램프. */
export function rawToMaster(plan: SessionEditPlan, t: number): number {
  const keep = plan.keep_segments
  if (keep.length === 0) return 0
  if (t <= keep[0]!.raw_start) return keep[0]!.master_start
  for (const k of keep) {
    if (t >= k.raw_start && t <= k.raw_end) return round3(k.master_start + (t - k.raw_start))
    if (t < k.raw_start) return k.master_start // 트림 갭 → 다음 구간 시작으로
  }
  return keep[keep.length - 1]!.master_end
}

/* ─────────────── 렌더 (단일 필터그래프) ─────────────── */

/** keep 구간들을 asplit+atrim+acrossfade 로 하나의 세션 마스터로 렌더한다(loudnorm 없음). */
export async function renderSessionMaster(
  wavPath: string,
  plan: SessionEditPlan,
  outPath: string,
): Promise<void> {
  const keep = plan.keep_segments
  if (keep.length === 0) throw new Error(`keep 구간 없음: ${wavPath}`)
  const C = plan.crossfade_sec

  const lines: string[] = []
  if (keep.length === 1) {
    lines.push(`[0:a]atrim=${keep[0]!.raw_start}:${keep[0]!.raw_end},asetpts=PTS-STARTPTS[out]`)
  } else {
    lines.push(`[0:a]asplit=${keep.length}${keep.map((_, i) => `[s${i}]`).join('')}`)
    keep.forEach((k, i) => lines.push(`[s${i}]atrim=${k.raw_start}:${k.raw_end},asetpts=PTS-STARTPTS[k${i}]`))
    // acrossfade 체인: 컷 경계 클릭·잡음 방지(spec/02 §6)
    let prev = 'k0'
    for (let i = 1; i < keep.length; i++) {
      const label = i === keep.length - 1 ? 'out' : `x${i}`
      lines.push(`[${prev}][k${i}]acrossfade=d=${C}:c1=tri:c2=tri[${label}]`)
      prev = label
    }
  }
  const graph = lines.join(';')

  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', wavPath]
  if (keep.length > FILTER_SCRIPT_THRESHOLD) {
    // 구간 과다 → -filter_script 로 넘긴다(명령행 길이 한계 회피)
    const { writeFileSync, mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const scriptPath = join(mkdtempSync(join(tmpdir(), 'bb-fg-')), 'graph.txt')
    writeFileSync(scriptPath, graph)
    args.push('-filter_complex_script', scriptPath)
  } else {
    args.push('-filter_complex', graph)
  }
  args.push('-map', '[out]', '-ac', '1', '-c:a', 'pcm_s16le', outPath)

  const r = await run('ffmpeg', args, { timeoutSec: RENDER_TIMEOUT_SEC })
  if (r.code !== 0) throw new Error(`세션 마스터 렌더 실패: ${outPath}\n${r.stderr.slice(-ERR_TAIL)}`)
}

const ERR_TAIL = 800 // @unit ffmpeg stderr 로그 절단 길이
