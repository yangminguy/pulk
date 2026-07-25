/**
 * T0b — 픽스처 end-to-end 검증
 *
 * generate → (정답 기반 자동 판정 주입) → seal → score(public) → unseal → score(full)
 * 전 과정이 돌고 실제 hit@5 수치가 나오는지, 그리고 홀드아웃 해시 검증이 위조 파일을 거부하는지 확인한다.
 *
 * 실행:  npx tsx scripts/t0b/verify-t0b.ts
 * stdout: 결과 JSON 한 덩어리 / 진행 로그: stderr / 실패 시 exit 1
 */
import { writeFileSync } from 'node:fs'
import { loadHarnessConfig, resolveFromRoot, type Candidate } from './index-prototype.js'
import {
  generateEval,
  sealEval,
  scoreEval,
  unsealEval,
  serialize,
  type EvalIntent,
} from './measure-hit5.js'
import { materializeFixtures, type TruthWindow } from './make-fixtures.js'

const EVAL_PATH = 'eval/search-hit5.fixture.json'
const HOLDOUT_PATH = 'eval/search-hit5-holdout.fixture.json'
const UNSEALED_PATH = 'eval/search-hit5-unsealed.fixture.json'
const FORGED_PATH = 'eval/search-hit5-holdout.forged.fixture.json'

/** 정답 구간과 겹치는 후보만 "usable" 로 판정 주입 (사장님 판정 대역). */
function injectVerdicts(intents: EvalIntent[], truth: TruthWindow[]): void {
  for (const it of intents) {
    const windows = truth.filter((w) => w.intent_id === it.intent_id)
    for (const c of it.candidates) {
      const usable = windows.some(
        (w) => w.source_id === c.source_id && c.start < w.end && w.start < c.end,
      )
      c.verdict = usable ? 'usable' : 'not_usable'
    }
  }
}

function writeRaw(relPath: string, bytes: string): void {
  writeFileSync(resolveFromRoot(relPath), bytes, 'utf8')
}

interface Check {
  name: string
  pass: boolean
  detail: string
}

function main(): void {
  const cfg = loadHarnessConfig()
  const checks: Check[] = []
  const record = (name: string, pass: boolean, detail: string): void => {
    checks.push({ name, pass, detail })
    process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
  }

  // 1) 픽스처 materialize
  const bundle = materializeFixtures()
  const totalSegments = bundle.transcripts.reduce((sum, t) => sum + t.segments.length, 0)
  const maxSourceSegments = Math.max(...bundle.transcripts.map((t) => t.segments.length))
  record(
    'fixtures',
    totalSegments > 0 && bundle.intents.length > 0,
    `소스 ${bundle.transcripts.length}편 · 세그먼트 ${totalSegments}개(최대 소스 ${maxSourceSegments}) · 의도 ${bundle.intents.length}건`,
  )

  // 2) generate
  const evalFile = generateEval(bundle.transcripts, bundle.intents, cfg)
  const everyHasCandidate = evalFile.public.every(
    (it) => it.candidates.length > 0 && it.candidates.length <= cfg.top_n,
  )
  record(
    'generate',
    evalFile.public.length === bundle.intents.length && everyHasCandidate,
    `의도 ${evalFile.public.length}건 · 후보 최대 ${cfg.top_n}개/의도`,
  )

  // 3) 판정 주입
  injectVerdicts(evalFile.public, bundle.expected.truth)
  const allJudged = evalFile.public.every((it) =>
    it.candidates.every((c: Candidate) => c.verdict !== null),
  )
  record('inject-verdicts', allJudged, `전 후보 판정 완료`)
  writeRaw(EVAL_PATH, serialize(evalFile))

  // 4) seal
  const sealed = sealEval(evalFile, cfg.holdout_count)
  writeRaw(HOLDOUT_PATH, sealed.holdoutJson)
  writeRaw(EVAL_PATH, serialize(sealed.main))
  const expectedRemaining = bundle.intents.length - cfg.holdout_count
  record(
    'seal',
    sealed.main.public.length === expectedRemaining &&
      sealed.holdout.holdout.length === cfg.holdout_count &&
      (sealed.main.holdout_sealed?.startsWith('sha256:') ?? false),
    `공개 ${sealed.main.public.length}건 · 봉인 ${sealed.holdout.holdout.length}건 · ${sealed.sha}`,
  )

  // 5) score (public 7건 대역)
  const publicScore = scoreEval(sealed.main.public, cfg)
  record(
    'score-public',
    publicScore.total === expectedRemaining && publicScore.judged === publicScore.total,
    `hit@5=${publicScore.hit_at_5} judged=${publicScore.judged}/${publicScore.total} path=${publicScore.path}`,
  )

  // 6) unseal (해시 검증 + 병합 재측정)
  const unsealed = unsealEval(sealed.main, sealed.holdoutJson, cfg)
  if (!unsealed.verified) {
    record('unseal-verify', false, `정상 홀드아웃인데 거부됨 (actual=${unsealed.actual})`)
    finish(checks, undefined)
    return
  }
  writeRaw(
    UNSEALED_PATH,
    serialize({ public: unsealed.merged, holdout_sealed: sealed.sha, verified: true }),
  )
  const fullScore = unsealed.score
  record(
    'unseal-verify',
    fullScore.total === bundle.intents.length && fullScore.judged === fullScore.total,
    `병합 ${fullScore.total}건 hit@5=${fullScore.hit_at_5} judged=${fullScore.judged} path=${fullScore.path}`,
  )
  record(
    'hit5-range',
    fullScore.hit_at_5 >= 0 && fullScore.hit_at_5 <= 1,
    `hit@5=${fullScore.hit_at_5} ∈ [0,1]`,
  )

  // 7) 위조 거부 — 봉인된 홀드아웃 바이트를 변조하면 unseal 이 거부해야 한다
  let forged = sealed.holdoutJson.replace('"not_usable"', '"usable"')
  if (forged === sealed.holdoutJson) forged = `${sealed.holdoutJson}\n`
  writeRaw(FORGED_PATH, forged)
  const forgedResult = unsealEval(sealed.main, forged, cfg)
  record(
    'forgery-rejected',
    forgedResult.verified === false,
    `변조본 unseal → verified=${forgedResult.verified} (기대: false)`,
  )

  finish(checks, fullScore)
}

function finish(
  checks: Check[],
  fullScore: { hit_at_5: number; judged: number; total: number; path: string } | undefined,
): void {
  const pass = checks.every((c) => c.pass)
  console.log(
    JSON.stringify({
      pass,
      hit_at_5: fullScore?.hit_at_5 ?? null,
      path: fullScore?.path ?? null,
      judged: fullScore?.judged ?? null,
      total: fullScore?.total ?? null,
      checks,
    }),
  )
  process.stderr.write(`\n${pass ? 'ALL PASS' : 'FAILED'} — ${checks.filter((c) => c.pass).length}/${checks.length} checks\n`)
  if (!pass) process.exitCode = 1
}

main()
