/**
 * captions-ko.ts — 한국어 자막 생성 (신규, spec/02 §9, T3-align §6)
 *
 * factory groupWordsIntoPages 를 쓰지 않는다 — 하드코딩 30자/700ms/14단어가 규칙과 다르다.
 * 원고 텍스트를 쓴다(ASR 아님 → 오타 없음). 규칙은 captions.base·captions.timing 에서 읽는다.
 *  - 최대 2줄, 한 줄 16~20자, 최소 노출 block_sec, 발화 종료 후 tail_sec 유지
 *  - 조사·어미만 다음 화면으로 고립 금지
 *  - min_block_sec 미만 블록 연속 사용 금지(빠른 발화라도 병합)
 *  - 강조 단어(emphasis_caption)는 captions.meta.json 에 별도 기록
 *
 * 자막 텍스트는 원고와 문자 단위로 일치해야 한다(verify 가 diff). 수치는 전부 profile.
 */
import type { EditProfile } from '../lib/profile.js'
import type { Cue } from '../lib/captions.js'
import type { TimedWord } from '../lib/similarity.js'
import { normalize } from '../lib/similarity.js'

const DECIMALS = 3 // @unit 시각 소수 3자리
const SHORT_TOKEN_MAX = 2 // @unit 조사·어미 고립 판정 짧은 토큰 길이(자)

function round3(n: number): number {
  return Number(n.toFixed(DECIMALS))
}

export interface CaptionSentence {
  sentence_key: string
  text: string
  start: number
  end: number
  words: TimedWord[]
  emphasis_caption?: string
}

export interface EmphasisEntry {
  word: string
  start: number
  end: number
  type: string
}

/* ─────────────── 원고 char → 시각(단어 시각 앵커) ─────────────── */

interface Anchor {
  char: number // 문장 내 정규화 누적 글자
  time: number
}

/** 문장 단어 시각을 앵커로 char→time 보간기를 만든다. 없으면 문장 [start,end] 선형. */
function makeCharToTime(sent: CaptionSentence): (charPos: number, totalChars: number) => number {
  const anchors: Anchor[] = []
  let acc = 0
  for (const w of sent.words) {
    anchors.push({ char: acc, time: w.start })
    acc += normalize(w.text).length
  }
  const totalWordChars = acc
  return (charPos: number, totalChars: number): number => {
    if (anchors.length === 0 || totalWordChars === 0) {
      const frac = totalChars === 0 ? 0 : charPos / totalChars
      return round3(sent.start + frac * (sent.end - sent.start))
    }
    // 원고 글자수 축을 단어-글자수 축으로 환산
    const target = totalChars === 0 ? 0 : (charPos / totalChars) * totalWordChars
    let lo = anchors[0]!
    let hi = { char: totalWordChars, time: sent.end }
    for (let i = 0; i < anchors.length; i++) {
      if (anchors[i]!.char <= target) lo = anchors[i]!
      if (anchors[i]!.char > target) { hi = anchors[i]!; break }
    }
    const span = hi.char - lo.char
    const frac = span <= 0 ? 0 : (target - lo.char) / span
    return round3(lo.time + frac * (hi.time - lo.time))
  }
}

/* ─────────────── 블록 분할 ─────────────── */

const displayLen = (s: string): number => [...s].length

/** 토큰들을 2줄×lineMax 예산으로 블록에 담고, 짧은 조사·어미 고립을 병합한다. */
function groupTokens(tokens: string[], lineMax: number, maxLines: number): string[][] {
  const budget = lineMax * maxLines
  const blocks: string[][] = []
  let cur: string[] = []
  let curLen = 0
  for (const tok of tokens) {
    const add = (cur.length > 0 ? 1 : 0) + displayLen(tok)
    if (cur.length > 0 && curLen + add > budget) {
      blocks.push(cur)
      cur = [tok]
      curLen = displayLen(tok)
    } else {
      cur.push(tok)
      curLen += add
    }
  }
  if (cur.length > 0) blocks.push(cur)

  // 조사·어미 고립 방지: 다음 블록이 짧은 토큰 하나로 시작/구성되면 이전 블록에 붙인다
  for (let i = blocks.length - 1; i >= 1; i--) {
    const b = blocks[i]!
    if (b.length === 1 && displayLen(b[0]!) <= SHORT_TOKEN_MAX) {
      blocks[i - 1]!.push(...b)
      blocks.splice(i, 1)
    }
  }
  return blocks
}

/** 블록 토큰을 lineMax 로 최대 maxLines 줄 래핑(원고 문자 보존, 줄바꿈만 삽입). */
function wrapLines(tokens: string[], lineMax: number, maxLines: number): string {
  const lines: string[] = []
  let line = ''
  for (const tok of tokens) {
    const cand = line ? `${line} ${tok}` : tok
    if (line && displayLen(cand) > lineMax && lines.length < maxLines - 1) {
      lines.push(line)
      line = tok
    } else {
      line = cand
    }
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

/* ─────────────── 강조 매칭 ─────────────── */

function matchEmphasis(sent: CaptionSentence): EmphasisEntry[] {
  const phrase = sent.emphasis_caption
  if (!phrase) return []
  const np = normalize(phrase)
  // 원고에 그대로 있으면 해당 단어들 시각, 없으면 카드 시작·종료만(비트 없음 → sentence 범위)
  // 조사·어미 차이 흡수: 양방향 부분포함(1988년 ↔ 1988년에)
  const hit = sent.words.filter((w) => {
    const nw = normalize(w.text)
    return nw.length > 0 && (np.includes(nw) || nw.includes(np))
  })
  if (hit.length > 0) {
    return [{ word: phrase, start: round3(hit[0]!.start), end: round3(hit[hit.length - 1]!.end), type: 'keyword' }]
  }
  return [{ word: phrase, start: round3(sent.start), end: round3(sent.end), type: 'keyword' }]
}

/* ─────────────── 진입점 ─────────────── */

export function buildCaptions(
  sentences: CaptionSentence[],
  profile: EditProfile,
): { cues: Cue[]; meta: Record<string, EmphasisEntry[]> } {
  const lineMax = profile.captions.base.chars_per_line[1]
  const maxLines = profile.captions.base.max_lines
  const minExposure = profile.captions.base.block_sec[0]
  const minBlock = profile.captions.timing.min_block_sec
  const lead = profile.captions.timing.lead_sec[0]
  const tail = profile.captions.timing.tail_sec[0]

  const cues: Cue[] = []
  const meta: Record<string, EmphasisEntry[]> = {}

  for (const sent of sentences) {
    const tokens = sent.text.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    const totalChars = [...normalize(sent.text)].length
    const charToTime = makeCharToTime(sent)
    const blocks = groupTokens(tokens, lineMax, maxLines)

    // 블록 시각: 원고 문자 위치 → 시각(단어 앵커 보간)
    let charCursor = 0
    const raw: { text: string; start: number; end: number }[] = []
    for (const block of blocks) {
      const blockChars = [...normalize(block.join(''))].length
      const startTime = round3(charToTime(charCursor, totalChars) - lead)
      charCursor += blockChars
      const endTime = round3(charToTime(charCursor, totalChars) + tail)
      raw.push({ text: wrapLines(block, lineMax, maxLines), start: Math.max(0, startTime), end: endTime })
    }

    // min_block_sec 미만 블록 병합(연속 사용 금지)
    const merged: typeof raw = []
    for (const b of raw) {
      const prev = merged[merged.length - 1]
      if (prev && b.end - prev.start < minBlock) {
        prev.end = b.end
        prev.text = `${prev.text.replace(/\n/g, ' ')} ${b.text.replace(/\n/g, ' ')}`.trim()
      } else {
        merged.push({ ...b })
      }
    }

    // 최소 노출 보장 + 단조 증가(다음 시작보다 끝이 앞서지 않게)
    for (let i = 0; i < merged.length; i++) {
      const b = merged[i]!
      if (b.end - b.start < minExposure) b.end = round3(b.start + minExposure)
      const next = merged[i + 1]
      if (next && b.end > next.start) b.end = round3(Math.max(b.start + minBlock, next.start))
      cues.push({ start: b.start, end: b.end, text: b.text })
    }

    const emph = matchEmphasis(sent)
    if (emph.length > 0) meta[sent.sentence_key] = emph
  }

  return { cues, meta }
}
