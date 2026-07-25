/**
 * T0b — 프로토타입 인메모리 자막 인덱스 + 구간 검색
 *
 * spec/04-harvest.md §3(구간 검색)·§5(후보 점수)의 어휘 baseline 구현.
 * "긴 원본을 배제하지 않는다. 자막으로 필요한 구간을 찾는다"(IMPLEMENTATION.md:21)는
 * 명제에 폴백이 없으므로 T0b 에서 hit@5 로 측정한다. 이 인덱스는 T7 랭킹의 baseline 이다.
 *
 * 규칙
 * - DB 없음. 전량 인메모리.
 * - 수치 리터럴 금지. 모든 수치는 config/edit-profile.json + scripts/t0b/harness.config.json 에서 읽는다.
 * - 외부 네트워크 호출 없음.
 * - stdout 은 JSON 한 덩어리, 진행 로그는 stderr.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'

/* ─────────────── 데이터 계약 ─────────────── */

/** 자막 세그먼트 (spec/04-harvest.md:38 형식) */
export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

/** 소스 1편의 자막 */
export interface Transcript {
  source_id: string
  segments: TranscriptSegment[]
}

/** 검색의도 */
export interface SearchIntent {
  intent_id: string
  intent: string
  importance: string
}

export type Verdict = 'usable' | 'not_usable' | null

/** 검색 결과 후보 (프리뷰 구간). score·text 는 판정자가 후보를 검토할 수 있게 부가한다. */
export interface Candidate {
  source_id: string
  start: number
  end: number
  score: number
  text: string
  verdict: Verdict
}

/* ─────────────── 설정 로드 (수치의 유일한 출처) ─────────────── */

export interface EditProfileSubset {
  harvest: {
    preview_context_sec: number[]
    score_weights: { semantic_match: number }
  }
}

export interface HarnessConfig {
  top_n: number
  ngram_min: number
  ngram_max: number
  holdout_count: number
  path_a_min: number
  path_a_prime_min: number
}

const DASH = '--'

/** cwd 에서 위로 올라가며 config/edit-profile.json 을 가진 레포 루트를 찾는다. */
export function repoRoot(): string {
  let dir = process.cwd()
  for (;;) {
    if (existsSync(join(dir, 'config', 'edit-profile.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return process.cwd()
    dir = parent
  }
}

export function resolveFromRoot(relPath: string): string {
  return resolve(repoRoot(), relPath)
}

export function loadEditProfile(): EditProfileSubset {
  const raw = readFileSync(resolveFromRoot(join('config', 'edit-profile.json')), 'utf8')
  return JSON.parse(raw) as EditProfileSubset
}

export function loadHarnessConfig(): HarnessConfig {
  const raw = readFileSync(resolveFromRoot(join('scripts', 't0b', 'harness.config.json')), 'utf8')
  return JSON.parse(raw) as HarnessConfig
}

/* ─────────────── 정규화 + n-gram ─────────────── */

/**
 * 구두점 제거 + 공백 전량 제거 + 소문자화.
 * 한국어 ASR 은 띄어쓰기를 자주 틀리므로 공백 전량 제거가 핵심(T0-preflight.md:67).
 */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** 정규화된 문자열의 문자 n-gram(min..max) 집합 */
export function ngramSet(norm: string, min: number, max: number): Set<string> {
  const grams = new Set<string>()
  const len = norm.length
  for (let n = min; n <= max; n++) {
    for (let i = 0; i + n <= len; i++) {
      grams.add(norm.slice(i, i + n))
    }
  }
  return grams
}

/** 질의 n-gram 이 세그먼트 n-gram 에 얼마나 덮이는가 (0..1). 길이 편향을 피해 세그먼트 단위로 채점한다. */
export function coverage(query: Set<string>, segment: Set<string>): number {
  if (query.size === 0) return 0
  let hit = 0
  for (const gram of query) {
    if (segment.has(gram)) hit++
  }
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

export interface PrototypeIndex {
  sources: SourceIndex[]
  ngramMin: number
  ngramMax: number
  pad: number
  semanticWeight: number
}

function lastNumber(arr: number[]): number {
  const value = arr[arr.length - 1]
  if (value === undefined) throw new Error('빈 수치 배열: preview_context_sec')
  return value
}

/** 전체 자막을 인메모리 인덱스로 만든다. 세그먼트별 n-gram 을 미리 계산한다. */
export function buildIndex(
  transcripts: Transcript[],
  profile: EditProfileSubset,
  cfg: HarnessConfig,
): PrototypeIndex {
  const pad = lastNumber(profile.harvest.preview_context_sec)
  const semanticWeight = profile.harvest.score_weights.semantic_match
  const sources: SourceIndex[] = transcripts.map((t) => {
    let maxEnd = 0
    const segments: IndexedSegment[] = t.segments.map((s) => {
      if (s.end > maxEnd) maxEnd = s.end
      return {
        source_id: t.source_id,
        start: s.start,
        end: s.end,
        text: s.text,
        grams: ngramSet(normalize(s.text), cfg.ngram_min, cfg.ngram_max),
      }
    })
    return { source_id: t.source_id, maxEnd, segments }
  })
  return { sources, ngramMin: cfg.ngram_min, ngramMax: cfg.ngram_max, pad, semanticWeight }
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
 * 검색의도 → 상위 topN 프리뷰 구간.
 * 일치 세그먼트 앞뒤 preview_context_sec 로 구간을 확장하고(§3), 같은 소스에서 겹치는 구간은
 * 하나로 접어 다양성을 확보한다(§5 diversity 는 가중점수 대신 구조적으로 처리).
 * 점수 = 어휘 커버리지(0..1) × score_weights.semantic_match → Option A 의 "semantic_match 는 코드가 부여".
 */
export function search(index: PrototypeIndex, intentText: string, topN: number): Candidate[] {
  const query = ngramSet(normalize(intentText), index.ngramMin, index.ngramMax)
  const scored: Scored[] = []
  for (const src of index.sources) {
    for (const seg of src.segments) {
      const cov = coverage(query, seg.grams)
      if (cov <= 0) continue
      scored.push({
        source_id: src.source_id,
        segStart: seg.start,
        winStart: Math.max(0, seg.start - index.pad),
        winEnd: Math.min(src.maxEnd, seg.end + index.pad),
        text: seg.text,
        score: cov * index.semanticWeight,
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
    if (picked.length >= topN) break
    const overlaps = picked.some(
      (p) => p.source_id === cand.source_id && cand.winStart < p.winEnd && p.winStart < cand.winEnd,
    )
    if (overlaps) continue
    picked.push(cand)
  }
  return picked.map((p) => ({
    source_id: p.source_id,
    start: p.winStart,
    end: p.winEnd,
    score: p.score,
    text: p.text,
    verdict: null,
  }))
}

/* ─────────────── 공용 CLI 헬퍼 ─────────────── */

export interface ParsedArgs {
  flags: Set<string>
  opts: Map<string, string>
}

/** `--flag` / `--key value` 파서. 숫자 리터럴 없이 argv 를 훑는다. */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>()
  const opts = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === undefined || !token.startsWith(DASH)) continue
    const key = token.slice(DASH.length)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith(DASH)) {
      opts.set(key, next)
      i++
    } else {
      flags.add(key)
    }
  }
  return { flags, opts }
}

export function requireOpt(opts: Map<string, string>, key: string): string {
  const value = opts.get(key)
  if (value === undefined) throw new Error(`필수 옵션 누락: --${key}`)
  return value
}

/** 이 파일이 tsx/node 로 직접 실행됐는지 (import 될 때는 false). */
export function isDirectRun(name: RegExp): boolean {
  const entry = process.argv[1]
  return typeof entry === 'string' && name.test(entry)
}

/* ─────────────── 직접 실행 CLI (수동 구간 검색) ─────────────── */

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(resolveFromRoot(relPath), 'utf8')) as T
}

function main(): void {
  const { opts } = parseArgs(process.argv)
  const cfg = loadHarnessConfig()
  const profile = loadEditProfile()
  const transcripts = readJson<Transcript[]>(requireOpt(opts, 'transcripts'))
  const index = buildIndex(transcripts, profile, cfg)
  const intentText = requireOpt(opts, 'intent')
  const candidates = search(index, intentText, cfg.top_n)
  process.stderr.write(`검색의도="${intentText}" → 후보 ${candidates.length}개\n`)
  console.log(JSON.stringify({ intent: intentText, candidates }))
}

if (isDirectRun(/index-prototype\.(ts|js)$/)) {
  main()
}
