/**
 * verify-schema.ts — T1 완료 조건 자동 판정
 *
 * - fixtures/valid-project → validate 통과(fatal·blocked 0)
 * - fixtures/invalid-*.json / warn-*.json / report-*.json → 각 파일이 `_expect` 규칙에서만 실패
 *   (fatal 은 distinct 규칙 집합이 {expect} 여야 하고, blocked/warning 은 레벨별로 판정)
 * - fixtures/plan-rerun.json → 통과 + V17a 0건 + coverage_gap 보고 + 승인 3샷 Z2 문자단위 보존
 *
 * 실행:  npx tsx scripts/verify-schema.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { runValidation, validateProject, type Finding } from '../src/commands/validate.js'
import { loadProfile, loadFrame } from '../src/lib/profile.js'

const ROOT = resolve(import.meta.dirname, '..')
const FIX = resolve(ROOT, 'fixtures')

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}
function rules(findings: Finding[]): string[] {
  return [...new Set(findings.map((f) => f.rule))].sort()
}

const profile = loadProfile('config')
const frame = loadFrame('config')
const timeline = JSON.parse(readFileSync(resolve(FIX, 'valid-project', 'timeline.json'), 'utf8'))

/* ── 1. valid-project (전체 로더 경로) ── */
const vp = validateProject(resolve(FIX, 'valid-project'))
record(
  'valid-project',
  vp.result.ok && vp.result.fatal.length === 0 && vp.result.blocked.length === 0,
  `ok=${vp.result.ok} fatal=${rules(vp.result.fatal).join(',') || '-'} blocked=${rules(vp.result.blocked).join(',') || '-'} warn=${rules(vp.result.warnings).join(',') || '-'}`,
)

/* ── 2. 파손/경고 픽스처 ── */
const files = readdirSync(FIX).filter((f) => /^(invalid|warn|report)-.*\.json$/.test(f)).sort()
for (const file of files) {
  const raw = JSON.parse(readFileSync(resolve(FIX, file), 'utf8'))
  const expect: string = raw._expect
  const level: string = raw._level
  const { result } = runValidation({ shotPlanRaw: raw, timelineRaw: timeline, profile, frame })
  const fset = rules(result.fatal)
  const bset = rules(result.blocked)
  const wset = rules(result.warnings)

  let pass = false
  if (level === 'fatal') {
    pass = fset.length === 1 && fset[0] === expect && bset.length === 0
  } else if (level === 'blocked') {
    pass = bset.length === 1 && bset[0] === expect && fset.length === 0
  } else if (level === 'warning') {
    pass = fset.length === 0 && bset.length === 0 && wset.includes(expect)
  }
  record(
    file,
    pass,
    `expect=${expect}[${level}] fatal=[${fset.join(',')}] blocked=[${bset.join(',')}] warn=[${wset.join(',')}]`,
  )
}

/* ── 3. plan-rerun ── */
const pr = JSON.parse(readFileSync(resolve(FIX, 'plan-rerun.json'), 'utf8'))
const prRes = runValidation({ shotPlanRaw: pr, timelineRaw: timeline, profile, frame }).result
const noV17a = !prRes.fatal.some((f) => f.rule === 'V17a')
const hasGap = Array.isArray(pr.coverage_gap) && pr.coverage_gap.length > 0
// 승인 3샷 Z2 문자단위 보존
const z2Fields = ['source_id', 'source_in', 'source_out', 'locked_selection', 'rights_status'] as const
let z2Ok = true
for (const snap of pr._z2_snapshot as Record<string, unknown>[]) {
  const shot = pr.shots.find((s: Record<string, unknown>) => s.shot_id === snap.shot_id)
  for (const k of z2Fields) {
    if (JSON.stringify(shot?.[k]) !== JSON.stringify(snap[k])) z2Ok = false
  }
}
record('plan-rerun:ok', prRes.ok, `ok=${prRes.ok} fatal=[${rules(prRes.fatal).join(',')}]`)
record('plan-rerun:no-v17a', noV17a, `V17a 위반 없음=${noV17a}`)
record('plan-rerun:coverage_gap', hasGap, `coverage_gap ${pr.coverage_gap?.length ?? 0}건 보고`)
record('plan-rerun:z2-preserved', z2Ok, `승인 3샷 Z2 문자단위 보존=${z2Ok}`)

/* ── 마감 ── */
const passCount = checks.filter((c) => c.pass).length
const allPass = passCount === checks.length
console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks }))
process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
if (!allPass) process.exitCode = 1
