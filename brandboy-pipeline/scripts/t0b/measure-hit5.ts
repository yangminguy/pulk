/**
 * T0b — hit@5 측정 하네스
 *
 * hit@5 = (상위 5개 후보 중 판정자가 "쓸 만함"으로 표시한 것이 1개 이상인 검색의도 수) / 전체 의도 수
 * (recall@5 아님 — 정답 집합 전체를 만들 필요 없이 상위 5개만 본다. T0-preflight.md:180)
 *
 * 모드
 *   --generate --transcripts <p> --intents <p> [--out <p>]   후보 채운 eval 생성 (판정 null)
 *   --seal     --file <p> [--holdout <p>]                     홀드아웃 N건 분리 + sha256 봉인
 *   --score    --file <p>                                     hit@5 계산
 *   --unseal   --file <p> --holdout <p> [--out <p>]           해시 검증 후 병합 재측정
 *
 * 판정 기준 (T0-preflight.md:200, 경계값 보수적으로 A′)
 *   score > a_min(0.7)          → A
 *   a_prime_min(0.4) ≤ score    → A′   (0.4·0.7 경계 포함)
 *   그 외                        → REVIEW
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  buildIndex,
  search,
  loadEditProfile,
  loadHarnessConfig,
  parseArgs,
  requireOpt,
  resolveFromRoot,
  isDirectRun,
  type Transcript,
  type SearchIntent,
  type Candidate,
  type HarnessConfig,
} from './index-prototype.js'

/* ─────────────── eval 스키마 ─────────────── */

export interface EvalIntent {
  intent_id: string
  intent: string
  importance: string
  candidates: Candidate[]
}

export interface EvalFile {
  public: EvalIntent[]
  holdout_sealed: string | null
}

export interface HoldoutFile {
  holdout: EvalIntent[]
}

export type PathVerdict = 'A' | 'A_PRIME' | 'REVIEW'

export interface ScoreResult {
  hit_at_5: number
  judged: number
  total: number
  path: PathVerdict
}

export type UnsealResult =
  | { verified: false; expected: string | null; actual: string }
  | { verified: true; expected: string; actual: string; merged: EvalIntent[]; score: ScoreResult }

const SHA_PREFIX = 'sha256:'
const JSON_INDENT = '  '

/* ─────────────── 순수 로직 ─────────────── */

export function serialize(obj: unknown): string {
  return JSON.stringify(obj, null, JSON_INDENT)
}

export function sha256Of(bytes: string): string {
  return SHA_PREFIX + createHash('sha256').update(bytes, 'utf8').digest('hex')
}

/** (a) generate — 각 의도의 상위 top_n 후보를 채운 eval 파일을 만든다 (판정 null). */
export function generateEval(
  transcripts: Transcript[],
  intents: SearchIntent[],
  cfg: HarnessConfig = loadHarnessConfig(),
  profile = loadEditProfile(),
): EvalFile {
  const index = buildIndex(transcripts, profile, cfg)
  const pub: EvalIntent[] = intents.map((it) => ({
    intent_id: it.intent_id,
    intent: it.intent,
    importance: it.importance,
    candidates: search(index, it.intent, cfg.top_n),
  }))
  return { public: pub, holdout_sealed: null }
}

/** 홀드아웃 봉인 — 뒤에서 holdout_count 건을 분리하고 그 파일 바이트의 sha256 을 본 파일에 기록한다. */
export function sealEval(
  main: EvalFile,
  holdoutCount: number,
): { main: EvalFile; holdout: HoldoutFile; holdoutJson: string; sha: string } {
  const pub = main.public
  const cut = pub.length - holdoutCount
  const remaining = pub.slice(0, cut)
  const sealed = pub.slice(cut)
  const holdout: HoldoutFile = { holdout: sealed }
  const holdoutJson = serialize(holdout)
  const sha = sha256Of(holdoutJson)
  return { main: { public: remaining, holdout_sealed: sha }, holdout, holdoutJson, sha }
}

/** (b) score — 판정이 채워진 의도 배열에서 hit@5 계산. */
export function scoreEval(intents: EvalIntent[], cfg: HarnessConfig): ScoreResult {
  const total = intents.length
  let judged = 0
  let hits = 0
  for (const it of intents) {
    if (it.candidates.some((c) => c.verdict !== null)) judged++
    if (it.candidates.some((c) => c.verdict === 'usable')) hits++
  }
  const hit_at_5 = total > 0 ? hits / total : 0
  return { hit_at_5, judged, total, path: classifyPath(hit_at_5, cfg) }
}

export function classifyPath(hitAt5: number, cfg: HarnessConfig): PathVerdict {
  if (hitAt5 > cfg.path_a_min) return 'A'
  if (hitAt5 >= cfg.path_a_prime_min) return 'A_PRIME'
  return 'REVIEW'
}

/** 홀드아웃 해시 검증 후 병합 재측정. 해시 불일치(위조)면 verified:false 로 거부한다. */
export function unsealEval(main: EvalFile, holdoutBytes: string, cfg: HarnessConfig): UnsealResult {
  const actual = sha256Of(holdoutBytes)
  const expected = main.holdout_sealed
  if (expected === null || actual !== expected) {
    return { verified: false, expected, actual }
  }
  const holdout = JSON.parse(holdoutBytes) as HoldoutFile
  const merged = main.public.concat(holdout.holdout)
  return { verified: true, expected, actual, merged, score: scoreEval(merged, cfg) }
}

/* ─────────────── CLI ─────────────── */

const DEFAULT_EVAL = 'eval/search-hit5.json'
const DEFAULT_HOLDOUT = 'eval/search-hit5-holdout.json'
const DEFAULT_UNSEALED = 'eval/search-hit5-unsealed.json'

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(resolveFromRoot(relPath), 'utf8')) as T
}

function writeRaw(relPath: string, bytes: string): void {
  writeFileSync(resolveFromRoot(relPath), bytes, 'utf8')
}

function emit(result: unknown): void {
  console.log(JSON.stringify(result))
}

function main(): void {
  const { flags, opts } = parseArgs(process.argv)
  const cfg = loadHarnessConfig()

  if (flags.has('generate')) {
    const transcripts = readJson<Transcript[]>(requireOpt(opts, 'transcripts'))
    const intents = readJson<SearchIntent[]>(requireOpt(opts, 'intents'))
    const out = opts.get('out') ?? DEFAULT_EVAL
    const evalFile = generateEval(transcripts, intents, cfg)
    writeRaw(out, serialize(evalFile))
    process.stderr.write(`generate: 의도 ${intents.length}건 → ${out}\n`)
    emit({ mode: 'generate', intents: intents.length, candidates_per_intent: cfg.top_n, out })
    return
  }

  if (flags.has('seal')) {
    const filePath = requireOpt(opts, 'file')
    const holdoutPath = opts.get('holdout') ?? DEFAULT_HOLDOUT
    const before = readJson<EvalFile>(filePath)
    const res = sealEval(before, cfg.holdout_count)
    writeRaw(holdoutPath, res.holdoutJson)
    writeRaw(filePath, serialize(res.main))
    process.stderr.write(`seal: ${res.holdout.holdout.length}건 봉인 → ${holdoutPath} (${res.sha})\n`)
    emit({
      mode: 'seal',
      sealed: res.holdout.holdout.length,
      remaining_public: res.main.public.length,
      holdout: holdoutPath,
      holdout_sha256: res.sha,
    })
    return
  }

  if (flags.has('score')) {
    const file = readJson<EvalFile>(requireOpt(opts, 'file'))
    emit(scoreEval(file.public, cfg))
    return
  }

  if (flags.has('unseal')) {
    const before = readJson<EvalFile>(requireOpt(opts, 'file'))
    const holdoutBytes = readFileSync(resolveFromRoot(requireOpt(opts, 'holdout')), 'utf8')
    const res = unsealEval(before, holdoutBytes, cfg)
    if (!res.verified) {
      process.stderr.write(`unseal: 해시 불일치 — 위조 거부 (expected=${String(res.expected)} actual=${res.actual})\n`)
      emit({ verified: false, expected: res.expected, actual: res.actual })
      process.exitCode = 1
      return
    }
    const out = opts.get('out') ?? DEFAULT_UNSEALED
    writeRaw(out, serialize({ public: res.merged, holdout_sealed: before.holdout_sealed, verified: true }))
    process.stderr.write(`unseal: 검증 통과 → ${out}\n`)
    emit({ verified: true, ...res.score, out })
    return
  }

  process.stderr.write('사용법: measure-hit5 --generate|--seal|--score|--unseal ...\n')
  process.exitCode = 1
}

if (isDirectRun(/measure-hit5\.(ts|js)$/)) {
  main()
}
