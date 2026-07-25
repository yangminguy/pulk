/**
 * index.ts — 인메모리 자막 인덱스 + 구간 검색 (T7 Part B, scripts/t0b/index-prototype.ts 이식)
 *
 * baseline: scripts/t0b/index-prototype.ts. 프로덕션 이식 시 유지한 설계 4가지:
 *  1. 채점 단위 = 세그먼트(확장은 프리뷰 전용 — 길이 편향 회피)
 *  2. 정규화 = 구두점 + 공백 전량 제거 + 소문자화(한국어 ASR 띄어쓰기 오류 흡수)
 *  3. diversity = 구조적(같은 소스에서 겹치는 프리뷰 구간을 하나로 접기)
 *  4. 문자 n-gram (search.ngram_min..ngram_max)
 *
 * 프로토타입과 다른 점: score_weights **6종 합산**. semantic_match 는 어휘 커버리지,
 * 나머지 5종(evidence/action/originality/diversity/resolution)은 **소스 메타에서** 온다.
 * 소스 메타가 없으면(t0b 바 자막) 5종 = 0 → 점수 = semantic_match × cov → 프로토타입과 동일 결과.
 *
 * 수치 하드코딩 금지: n-gram·프리뷰 폭·가중치·해상도 임계는 전부 profile 에서 온다.
 */
import type { RankedCandidate, ScoreSource, SourceMeta } from './types.js'

const UNKNOWN_RIGHTS = 'unknown'
const DEFAULT_ASSET_KIND = 'video' // 소스 kind 미상 시 후보 asset_kind 기본
/** action 신호가 1인 영상성 소스 종류. 문자열 집합(수치 아님). */
const VIDEO_LIKE = new Set(['official_video', 'interview', 'advertisement', 'news', 'archive', 'social', 'video'])

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}
export interface Transcript {
  source_id: string
  segments: TranscriptSegment[]
}

export interface ScoreWeights {
  semantic_match: number
  evidence_strength: number
  visual_action: number
  originality: number
  diversity: number
  resolution: number
}

export interface SearchConfig {
  ngramMin: number
  ngramMax: number
  previewPad: number
  weights: ScoreWeights
  resolutionMinShortSide: number
}

/* ─────────────── 정규화 + n-gram (프로토타입과 동일) ─────────────── */

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

export function ngramSet(norm: string, min: number, max: number): Set<string> {
  const grams = new Set<string>()
  const len = norm.length
  for (let n = min; n <= max; n++) {
    for (let i = 0; i + n <= len; i++) grams.add(norm.slice(i, i + n))
  }
  return grams
}

export function coverage(query: Set<string>, segment: Set<string>): number {
  if (query.size === 0) return 0
  let hit = 0
  for (const gram of query) if (segment.has(gram)) hit++
  return hit / query.size
}

/* ─────────────── 인덱스 ─────────────── */

interface IndexedSegment {
  source_id: string
  start: number
  end: number
  text: string
  grams: Set<string>
}
interface SourceIndex {
  source_id: string
  maxEnd: number
  segments: IndexedSegment[]
}

export interface TranscriptIndex {
  sources: SourceIndex[]
  cfg: SearchConfig
  meta: Map<string, SourceMeta>
}

export function buildIndex(transcripts: Transcript[], cfg: SearchConfig, meta: Map<string, SourceMeta>): TranscriptIndex {
  const sources: SourceIndex[] = transcripts.map((t) => {
    let maxEnd = 0
    const segments: IndexedSegment[] = t.segments.map((s) => {
      if (s.end > maxEnd) maxEnd = s.end
      return { source_id: t.source_id, start: s.start, end: s.end, text: s.text, grams: ngramSet(normalize(s.text), cfg.ngramMin, cfg.ngramMax) }
    })
    return { source_id: t.source_id, maxEnd, segments }
  })
  return { sources, cfg, meta }
}

/* ─────────────── 6종 신호 (소스 메타 기반, 없으면 0) ─────────────── */

function metaSignals(meta: SourceMeta | undefined, resolutionMinShortSide: number): { ev: number; ac: number; orig: number; div: number; res: number } {
  if (meta === undefined) return { ev: 0, ac: 0, orig: 0, div: 0, res: 0 }
  return {
    ev: meta.has_evidence === true ? 1 : 0,
    ac: meta.kind !== undefined && VIDEO_LIKE.has(meta.kind) ? 1 : 0,
    orig: meta.is_official === true ? 1 : 0,
    div: (meta.visual_topics ?? 0) > 1 ? 1 : 0,
    res: (meta.resolution_short_side ?? 0) >= resolutionMinShortSide ? 1 : 0,
  }
}

interface Scored {
  source_id: string
  segStart: number
  winStart: number
  winEnd: number
  text: string
  score: number
}

/**
 * 검색의도 → 상위 프리뷰 구간(6종 가중 합산 점수). limit 미지정 시 전량(리랭크 프리필터용).
 * 일치 세그먼트 앞뒤 previewPad 로 확장하고, 같은 소스에서 겹치는 구간은 하나로 접어 다양성 확보.
 */
function rankFold(index: TranscriptIndex, intentText: string, limit?: number): RankedCandidate[] {
  const cfg = index.cfg
  const w = cfg.weights
  const query = ngramSet(normalize(intentText), cfg.ngramMin, cfg.ngramMax)
  const scored: Scored[] = []
  for (const src of index.sources) {
    const sig = metaSignals(index.meta.get(src.source_id), cfg.resolutionMinShortSide)
    const metaScore = w.evidence_strength * sig.ev + w.visual_action * sig.ac + w.originality * sig.orig + w.diversity * sig.div + w.resolution * sig.res
    for (const seg of src.segments) {
      const cov = coverage(query, seg.grams)
      if (cov <= 0) continue
      scored.push({
        source_id: src.source_id,
        segStart: seg.start,
        winStart: Math.max(0, seg.start - cfg.previewPad),
        winEnd: Math.min(src.maxEnd, seg.end + cfg.previewPad),
        text: seg.text,
        score: w.semantic_match * cov + metaScore,
      })
    }
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.source_id !== b.source_id) return a.source_id < b.source_id ? -1 : 1
    return a.segStart - b.segStart
  })
  const picked: Scored[] = []
  for (const cand of scored) {
    if (limit !== undefined && picked.length >= limit) break
    const overlaps = picked.some((p) => p.source_id === cand.source_id && cand.winStart < p.winEnd && p.winStart < cand.winEnd)
    if (overlaps) continue
    picked.push(cand)
  }
  return picked.map((p): RankedCandidate => ({
    source_id: p.source_id,
    source_in: p.winStart,
    source_out: p.winEnd,
    score: p.score,
    score_source: 'lexical' as ScoreSource,
    rights_status: index.meta.get(p.source_id)?.rights_status ?? UNKNOWN_RIGHTS,
    asset_kind: index.meta.get(p.source_id)?.kind ?? DEFAULT_ASSET_KIND,
    text: p.text,
  }))
}

/** 상위 topN 프리뷰 구간. */
export function search(index: TranscriptIndex, intentText: string, topN: number): RankedCandidate[] {
  return rankFold(index, intentText, topN)
}

/** 전체 어휘 프리필터(리랭크 대기 요청용 — topN 캡 없음). */
export function searchAll(index: TranscriptIndex, intentText: string): RankedCandidate[] {
  return rankFold(index, intentText, undefined)
}
