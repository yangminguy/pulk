/**
 * verify-qc.ts — T6(qc) 완료 조건 자동 판정. **네트워크 0**(ffmpeg 더미 미디어 재사용).
 *
 * T5 fixtures/assemble/make-fixtures 로 조립 입력을 만들고 assemble→qc 를 돌려 판정한다:
 *  1 겹치는 검사 17종이 render_report.checks 와 문자 단위 일치(T5-T6 임계값 동일 회귀)
 *  2 human_required 가 pass 로 집계되지 않음(P0=0 이어도 HOLD_FOR_HUMAN + 잔존 표시)
 *  3 의도적 위반(V8 권리·V11 fallback·훅 미달)이 정확한 규칙에서 잡힘
 *  4 모든 수치에 기준값 병기(range/min/max/target)
 *  5 profile_rev 불일치 → V16 경고 + 무효화 표
 *  6 assemble/checks import 존재
 *  7 qc --only b001 → exit 2
 *
 * 실행:  npx tsx scripts/verify-qc.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { runAssemble } from '../src/commands/assemble.js'
import { runQc, type QcReport, type FixItem, type Metric, type HumanMetric } from '../src/commands/qc.js'
import { buildMedia, writeFixture, mainLayout, hookFailLayout, type MediaPaths } from '../fixtures/assemble/make-fixtures.js'
import { rightsUnknownLayout, fallbackApprovedLayout } from '../fixtures/qc/make-qc-fixtures.js'

const ROOT = resolve(import.meta.dirname, '..')
const CFG = resolve(ROOT, 'config')
const MEDIA = resolve(ROOT, 'fixtures', 'assemble', '.media')
const MAIN = resolve(ROOT, 'fixtures', 'qc-project')
const TMP = resolve(ROOT, 'fixtures', 'qc-tmp')

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

/** 조립 입력 작성 → assemble(numbered) → qc. render_report 는 qc 전제조건이므로 항상 먼저 만든다. */
async function assembleThenQc(dir: string, media: MediaPaths, layout = mainLayout()): Promise<QcReport> {
  writeFixture(dir, layout, { configDir: CFG, media })
  await runAssemble(dir, { emit: ['numbered'], force: true, human: false })
  const { report } = await runQc(dir, { human: false })
  return report
}

function metricSchemaOk(m: Metric | HumanMetric): boolean {
  if (m.verdict === 'human_required') return !('value' in m) // 값 없이 verdict 만
  if (!('value' in m)) return false
  const mm = m as Metric
  const valOk = typeof mm.value === 'number' || mm.value === null
  const crits = (['range', 'min', 'max', 'target'] as const).filter((k) => mm[k] !== undefined)
  return valOk && crits.length === 1 && (mm.verdict === 'pass' || mm.verdict === 'fail')
}

async function main(): Promise<void> {
  const media: MediaPaths = buildMedia(MEDIA)

  /* ── (1) 겹치는 검사 17종 render_report 문자 단위 일치 ── */
  const report = await assembleThenQc(MAIN, media)
  const rr = JSON.parse(readFileSync(join(MAIN, 'render_report.json'), 'utf8')) as { checks: { checks: unknown[] } }
  const rrChecks = rr.checks.checks
  const qcShared = report.shared_checks
  const lenOk = qcShared.length === rrChecks.length && qcShared.length === SEVENTEEN
  const charMatch = qcShared.every((c, i) => JSON.stringify(c) === JSON.stringify(rrChecks[i]))
  record('1-shared-17-char-match', lenOk && charMatch,
    `qc공유=${qcShared.length} render=${rrChecks.length} 문자일치=${charMatch}`)

  /* ── (2) human_required 통과 미집계 ── */
  const hasHuman = report.human_required.includes('narrative_clarity') && report.human_required.includes('rights_final_check')
  record('2-human-required-not-passed', report.p0_count === 0 && report.gate === 'HOLD_FOR_HUMAN' && hasHuman && report.human_required.length > 0,
    `P0=${report.p0_count} gate=${report.gate} human_required=[${report.human_required.join(',')}]`)

  /* ── (3a) 권리 unknown → V8/치명5 P0 ── */
  const rightsDir = join(TMP, 'rights-unknown')
  const rRights = await assembleThenQc(rightsDir, media, rightsUnknownLayout())
  const fixRights = readFixList(rightsDir)
  const v8fix = fixRights.find((f) => f.priority === 'P0' && f.rule === 'V8' && f.shot_id === 'sh0001')
  const n5 = rRights.fatal.find((f) => f.rule === 'V8')
  record('3a-rights-unknown-V8-P0', v8fix !== undefined && n5?.verdict === 'fail',
    `V8-P0=${v8fix !== undefined}(${v8fix?.shot_id}) 치명5=${n5?.verdict}`)

  /* ── (3b) fallback_text 승인 → V11/치명10 P0 ── */
  const fbDir = join(TMP, 'fallback')
  const rFb = await assembleThenQc(fbDir, media, fallbackApprovedLayout())
  const fixFb = readFixList(fbDir)
  const v11fix = fixFb.find((f) => f.priority === 'P0' && f.rule === 'V11' && f.shot_id === 'sh0002')
  const n10 = rFb.fatal.find((f) => f.rule === 'V11')
  record('3b-fallback-V11-P0', v11fix !== undefined && n10?.verdict === 'fail',
    `V11-P0=${v11fix !== undefined}(${v11fix?.shot_id}) 치명10=${n10?.verdict}`)

  /* ── (3c) 훅 미달 → 치명11 fail + P0 ── */
  const hookDir = join(TMP, 'hook-fail')
  const rHook = await assembleThenQc(hookDir, media, hookFailLayout())
  const n11 = rHook.fatal.find((f) => f.rule === 'hook-visual-changes')
  const hookP0 = readFixList(hookDir).some((f) => f.priority === 'P0' && f.rule === 'hook-visual-changes')
  record('3c-hook-under-min-fatal', n11?.verdict === 'fail' && hookP0 && rHook.p0_count > 0,
    `치명11=${n11?.verdict} P0=${rHook.p0_count} gate=${rHook.gate}`)

  /* ── (4) 모든 수치에 기준값 병기 ── */
  const metricEntries = Object.entries(report.metrics)
  const allWithCriteria = metricEntries.every(([, m]) => metricSchemaOk(m))
  const humanCount = metricEntries.filter(([, m]) => m.verdict === 'human_required').length
  record('4-metrics-have-criteria', allWithCriteria && metricEntries.length > 0,
    `지표=${metricEntries.length} 스키마통과=${allWithCriteria} human_required=${humanCount}`)

  /* ── (5) profile_rev 불일치 → V16 경고 + 무효화 표 ── */
  const revDir = join(TMP, 'profile-rev')
  writeFixture(revDir, mainLayout(), { configDir: CFG, media })
  const pf = JSON.parse(readFileSync(join(revDir, 'edit-profile.json'), 'utf8')) as { profile_rev: number }
  pf.profile_rev = pf.profile_rev + 1
  writeFileSync(join(revDir, 'edit-profile.json'), JSON.stringify(pf, null, JSON_INDENT))
  await runAssemble(revDir, { emit: ['numbered'], force: true, human: false })
  const { report: rRev } = await runQc(revDir, { human: false })
  const v16warn = rRev.warnings.some((w) => w.includes('V16') && w.includes('profile_rev'))
  const invalTable = rRev.warnings.some((w) => w.includes('무효화'))
  record('5-profile-rev-V16', v16warn && invalTable,
    `V16경고=${v16warn} 무효화표=${invalTable} warnings=${rRev.warnings.length}`)

  /* ── (6) assemble/checks import 존재 ── */
  const qcSrc = readFileSync(resolve(ROOT, 'src', 'commands', 'qc.ts'), 'utf8')
  const importsChecks = /from\s+['"][^'"]*assemble\/checks/.test(qcSrc)
  record('6-imports-checks', importsChecks, `from.*assemble/checks = ${importsChecks}`)

  /* ── (7) qc --only b001 → exit 2 ── */
  const only = spawnSync('npx', ['tsx', 'src/cli.ts', 'qc', '--project', MAIN, '--only', 'b001'], { cwd: ROOT, encoding: 'utf8' })
  record('7-only-exit-2', only.status === EXIT_INPUT, `exit=${only.status} (기대 2)`)

  /* ── 마감 ── */
  rmSync(TMP, { recursive: true, force: true })
  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
  if (!allPass) process.exitCode = 1
}

function readFixList(dir: string): FixItem[] {
  const p = join(dir, 'fix-list.json')
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as FixItem[]) : []
}

const SEVENTEEN = 17 // @unit 공유 자동검사 개수(runChecks)
const JSON_INDENT = 2 // @unit JSON 들여쓰기 폭
const EXIT_INPUT = 2 // @unit 입력 오류 종료 코드

main().catch((err: unknown) => {
  process.stderr.write(`verify-qc 예외: ${(err as Error).stack ?? String(err)}\n`)
  process.exitCode = 1
})
