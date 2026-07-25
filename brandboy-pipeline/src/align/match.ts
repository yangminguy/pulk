/**
 * match.ts — 문장별 발화 구간 정렬 (슬라이딩 윈도우, 무재테이크)
 *
 * spec/02 §4 · T3-align §2. 원고 문장을 순서대로 전사 단어 구간에 1회씩 매칭한다.
 * 무재테이크 전제이므로 다중 후보를 모으지 않는다 — 문장은 순서대로 한 번만 나타난다.
 * 원고에 같은 문장이 2회면 sentence_key 로 구별되고 순차 매칭으로 각각 다른 구간에 붙는다.
 *
 * 유사도는 similarity.ts(숫자↔한글 변환 포함). 임계·윈도우 수치는 profile 로 받는다(하드코딩 금지).
 * 매칭 실패 문장은 unmatched → align 이 exit 1.
 */
import { normalize, similarityScore } from '../lib/similarity.js'
import type { TimedWord } from '../lib/similarity.js'
import type { EditProfile } from '../lib/profile.js'

export interface ScriptSentenceLite {
  sentence_key: string
  sentence_id: string
  segment_id: string
  text: string
}

export interface SentenceMatch extends ScriptSentenceLite {
  start_idx: number
  end_idx: number
  raw_start: number // 세션 로컬 raw 시각
  raw_end: number
  similarity: number
  low_confidence: boolean
}

export interface MatchOutcome {
  matched: SentenceMatch[]
  unmatched: ScriptSentenceLite[]
  end_pos: number
}

/**
 * 한 세션의 전사 단어열 words 에 대해 원고 문장 sentences 를 순서대로 매칭한다.
 * startPos 부터 커서를 전진시키며, 각 문장에 대해 [window_lo·L, window_hi·L] 길이의
 * 단어 윈도우 중 유사도 최대 구간을 고른다. search_window_multiplier·L 문자 밖은 누락.
 */
export function matchSentences(
  words: TimedWord[],
  sentences: ScriptSentenceLite[],
  profile: EditProfile,
  startPos = 0,
): MatchOutcome {
  const threshold = profile.align.similarity_threshold
  const [winLo, winHi] = profile.align.window_ratio
  const searchMult = profile.align.search_window_multiplier
  const [lowLo, lowHi] = profile.align.similarity_low_confidence

  const norms = words.map((w) => normalize(w.text))
  const matched: SentenceMatch[] = []
  const unmatched: ScriptSentenceLite[] = []
  let pos = startPos

  for (const si of sentences) {
    const L = normalize(si.text).length
    const loLen = Math.max(1, Math.floor(winLo * L))
    const hiLen = Math.ceil(winHi * L)
    const searchChars = Math.ceil(searchMult * L)

    let best: { start: number; end: number; sim: number } | null = null
    let scannedChars = 0
    for (let start = pos; start < words.length; start++) {
      let acc = ''
      let accText = ''
      for (let end = start; end < words.length; end++) {
        acc += norms[end]
        accText += (accText ? ' ' : '') + words[end]!.text
        if (acc.length >= loLen && acc.length <= hiLen) {
          const sim = similarityScore(si.text, accText)
          if (best === null || sim > best.sim) best = { start, end, sim }
        }
        if (acc.length > hiLen) break
      }
      scannedChars += norms[start]!.length
      if (scannedChars > searchChars) break
    }

    if (best !== null && best.sim >= threshold) {
      const lowConf = best.sim >= lowLo && best.sim < lowHi
      matched.push({
        ...si,
        start_idx: best.start,
        end_idx: best.end,
        raw_start: words[best.start]!.start,
        raw_end: words[best.end]!.end,
        similarity: Number(best.sim.toFixed(DECIMALS)),
        low_confidence: lowConf,
      })
      pos = best.end + 1
    } else {
      unmatched.push({ sentence_key: si.sentence_key, sentence_id: si.sentence_id, segment_id: si.segment_id, text: si.text })
    }
  }

  return { matched, unmatched, end_pos: pos }
}

const DECIMALS = 3 // @unit 유사도 표기 소수 3자리
