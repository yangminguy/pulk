/**
 * scope.ts — --only / --pilot 스코프 프레임워크 (SCOPES §6)
 *
 * 명령마다 --only 의 단위가 다르다:
 *  align    → session-NN (비트 아님. align 은 비트 생성 전에 돌고 출력은 단일 마스터)
 *  reanchor · plan · harvest · review → beat_id
 *  assemble · qc → 미지원 (exit 2)
 *  harvest · review 는 --only 와 --pilot 을 둘 다 주면 교집합.
 *
 * align 의 skip 규칙만 특수: 세션 WAV 의 mtime/해시가 마지막 실행보다 새로우면 자동 재처리(skip 금지).
 * 실제 align 은 T3 이므로 여기서는 판단 헬퍼 shouldReprocessSession 만 제공한다.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { sha256File } from './canonical.js'

const SESSION_RE = /^session-\d{2}$/
const BEAT_RE = /^b\d{3,4}[a-z]?$/

export type OnlyKind = 'none' | 'session' | 'beat'

/** "b012,b013" → ["b012","b013"]. 빈 문자열/undefined → []. */
export function parseOnly(value: string | undefined): string[] {
  if (value === undefined || value.trim() === '') return []
  return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
}

/** --only 값이 명령의 단위(kind)에 맞는지. 틀리면 사유 문자열, 맞으면 null. */
export function validateOnly(kind: OnlyKind, values: string[]): string | null {
  if (kind === 'none') return '이 명령은 --only 를 지원하지 않는다'
  const re = kind === 'session' ? SESSION_RE : BEAT_RE
  const bad = values.filter((v) => !re.test(v))
  if (bad.length > 0) return `--only 값이 ${kind} 형식이 아니다: ${bad.join(', ')}`
  return null
}

/** harvest/review: --only 비트와 --pilot 비트의 교집합. 한쪽이 비면 다른 쪽 전체. */
export function intersectBeats(only: string[], pilotBeats: string[]): string[] {
  if (only.length === 0) return pilotBeats
  if (pilotBeats.length === 0) return only
  const set = new Set(pilotBeats)
  return only.filter((b) => set.has(b))
}

/* ─────────────── 세션 재처리 판단 (align) ─────────────── */

interface SessionState { mtime_ms: number; hash: string }
interface AlignState { sessions: Record<string, SessionState> }

function readAlignState(stateFile: string): AlignState {
  if (!existsSync(stateFile)) return { sessions: {} }
  try {
    const parsed = JSON.parse(readFileSync(stateFile, 'utf8')) as Partial<AlignState>
    return { sessions: parsed.sessions ?? {} }
  } catch {
    return { sessions: {} }
  }
}

/**
 * 세션 WAV 가 마지막 align 실행 이후 새로워졌으면 true(재처리), 아니면 false(skip).
 * 기록이 없으면 항상 재처리. mtime 이 커졌거나 내용 해시가 다르면 재처리.
 */
export function shouldReprocessSession(sessionId: string, wavPath: string, stateFile: string): boolean {
  if (!existsSync(wavPath)) return true // 파일 없음 → 실행 시 실패하도록 재처리로 넘김
  const state = readAlignState(stateFile)
  const prev = state.sessions[sessionId]
  if (prev === undefined) return true
  const mtime = statSync(wavPath).mtimeMs
  if (mtime > prev.mtime_ms) return true
  return sha256File(wavPath) !== prev.hash
}

/** align 이 세션을 처리한 뒤 상태를 기록할 때 쓰는 항목 빌더(T3 용). */
export function sessionStateEntry(wavPath: string): SessionState {
  return { mtime_ms: statSync(wavPath).mtimeMs, hash: sha256File(wavPath) }
}
