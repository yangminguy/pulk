/**
 * captions.ts — SRT 파싱/직렬화 (M1 이식 + 신규)
 *
 * M1(ai-slide-video-factory/src/lib/captions.ts:36-65) parseSRT 이식.
 * 원본 parseSRT 는 이미 초 단위(toSeconds)로 반환한다 — brandboy Word 도 초 단위이므로
 * 밀리초 잔재를 이 파일에 남기지 않는다(PORTING M1: 초 단위만 사용).
 *
 * writeSRT 는 신규다 — align 이 captions.srt 를 출력해야 하므로 역방향 직렬화가 필요하다.
 */

export interface Cue {
  start: number // 초
  end: number // 초
  text: string
}

const TS_RE = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/
const SEC_PER_HOUR = 3600 // @unit 시→초
const SEC_PER_MIN = 60 // @unit 분→초
const MS_PER_SEC = 1000 // @unit 초→밀리초
const MS_PAD = 3 // @unit SRT 밀리초 3자리
const TC_PAD = 2 // @unit 타임코드 시:분:초 2자리

function toSeconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * SEC_PER_HOUR + Number(m) * SEC_PER_MIN + Number(s) + Number(ms.padEnd(MS_PAD, '0')) / MS_PER_SEC
}

/** M1 이식(:36-65) — SRT 를 초 단위 Cue 로 파싱. */
export function parseSRT(input: string): Cue[] {
  const text = input.replace(/\r\n/g, '\n').trim()
  if (!text) return []
  const cues: Cue[] = []
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) continue
    const tsLine = TS_RE.test(lines[0]!) ? lines[0]! : lines[1]
    if (tsLine === undefined) continue
    const m = tsLine.match(TS_RE)
    if (!m) continue
    const start = toSeconds(m[1]!, m[2]!, m[3]!, m[4]!)
    const end = toSeconds(m[5]!, m[6]!, m[7]!, m[8]!)
    const tsIndex = lines.indexOf(tsLine)
    const cueText = lines.slice(tsIndex + 1).join('\n').trim()
    if (!cueText) continue
    if (!(end > start)) continue
    cues.push({ start, end, text: cueText })
  }
  return cues
}

/** 초 → "HH:MM:SS,mmm". */
export function formatSrtTime(sec: number): string {
  const clamped = Math.max(0, sec)
  const h = Math.floor(clamped / SEC_PER_HOUR)
  const m = Math.floor((clamped % SEC_PER_HOUR) / SEC_PER_MIN)
  const s = Math.floor(clamped % SEC_PER_MIN)
  const ms = Math.round((clamped - Math.floor(clamped)) * MS_PER_SEC)
  const pad = (v: number, n: number): string => String(v).padStart(n, '0')
  return `${pad(h, TC_PAD)}:${pad(m, TC_PAD)}:${pad(s, TC_PAD)},${pad(ms, MS_PAD)}`
}

/** Cue 배열 → SRT 문자열(신규 직렬화). */
export function writeSRT(cues: Cue[]): string {
  const blocks = cues.map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}`)
  return blocks.join('\n\n') + '\n'
}
