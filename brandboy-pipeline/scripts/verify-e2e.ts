/**
 * verify-e2e.ts — 골든패스 7단계 관통 자동 판정 (네트워크 0)
 *
 * fixtures/e2e/make-fixtures.ts 로 봉인 유효 완전체 프로젝트를 한 벌 만들고, 그 위에서
 * validate → plan → harvest → review(render) → review(--apply) → assemble → qc 를
 * 순서대로 한 픽스처로 관통시킨다. 단계마다 (1) exit 코드와 (2) 산출 JSON 의 JSON.parse 성공을
 * 단언한다. 한 단계라도 어긋나면 뒤 단계는 무의미하므로 즉시 중단하고 exit 1.
 *
 * stdout 규약 검증도 겸한다: validate·plan·review·assemble·qc 는 실제 CLI 를 서브프로세스로
 * 띄워 stdout 을 통째로 JSON.parse 한다(오염되면 실패 → cli.ts stdout 순수성 회귀 가드).
 * harvest 만 네트워크 0 보장을 위해 DI(로컬 어댑터/스텁 env)로 in-process 실행한다.
 *
 * 실행:  npx tsx scripts/verify-e2e.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { makeE2eProject } from '../fixtures/e2e/make-fixtures.js'
import { runHarvest } from '../src/commands/harvest.js'
import { ffmpegBin } from '../src/lib/probe.js'
import { run } from '../src/lib/proc.js'
import type { HarvestEnv, HarvestAdapter } from '../src/harvest/types.js'

const ROOT = resolve(import.meta.dirname, '..')
const EXIT_OK = 0 // @unit 성공 종료 코드

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

/** CLI 를 서브프로세스로 실행하고 {code, stdout, json} 반환. stdout 이 JSON 이 아니면 json=null. */
function cli(args: string[]): { code: number; stdout: string; json: unknown } {
  const r = spawnSync('npx', ['tsx', 'src/cli.ts', ...args], { cwd: ROOT, encoding: 'utf8' })
  let json: unknown = null
  try { json = JSON.parse((r.stdout ?? '').trim()) } catch { json = null }
  return { code: r.status ?? -1, stdout: r.stdout ?? '', json }
}

/** 네트워크 0 보장 DI: fetch/browser 는 하드 실패, runProc 만 로컬 ffmpeg 로. */
function offlineEnv(): HarvestEnv {
  return {
    async runProc(cmd, args, opts) { return run(cmd, args, opts) },
    async fetchUrl() { return { ok: false, status: 0, body: '' } },
    async capturePage() { return { ok: false, error: 'no-browser-in-e2e' } },
  }
}
function localAdapters(dummy: string): Record<string, HarvestAdapter> {
  const mk = (name: string): HarvestAdapter => ({
    name,
    async fetchProxy(req) { copyFileSync(dummy, req.outPath); return { ok: true, path: req.outPath, bytes: statSync(req.outPath).size } },
    async fetchOriginal(req) { copyFileSync(dummy, req.outPath); return { ok: true, path: req.outPath, bytes: statSync(req.outPath).size } },
  })
  return { youtube: mk('youtube'), web: mk('web'), page: mk('page') }
}

function planRevision(projectDir: string): number {
  return (JSON.parse(readFileSync(resolve(projectDir, 'shot-plan.json'), 'utf8')) as { revision: number }).revision
}

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'e2e-'))
  const PROJ = join(work, 'project')
  const dummy = join(work, 'dummy.mp4')
  spawnSync(ffmpegBin(), ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=3', '-pix_fmt', 'yuv420p', dummy], { encoding: 'utf8' })

  makeE2eProject(PROJ)

  let chainOk = true
  const step = (ok: boolean): boolean => { if (!ok) chainOk = false; return chainOk }

  /* ── 1. validate → exit 0, stdout 단일 JSON ── */
  {
    const r = cli(['validate', '--project', PROJ])
    const ok = r.code === EXIT_OK && r.json !== null && (r.json as { ok?: boolean }).ok === true
    record('1-validate', step(ok), `exit=${r.code} json=${r.json !== null} ok=${(r.json as { ok?: boolean } | null)?.ok}`)
  }

  /* ── 2. plan --apply (fixture 정합 beat-plan, --only b018 → 보존 샷 무중첩) → exit 0 ── */
  if (chainOk) {
    const plan = JSON.parse(readFileSync(resolve(PROJ, 'shot-plan.json'), 'utf8')) as { project: string; segments: unknown[]; beats: { beat_id: string }[]; shots: { shot_id: string }[] }
    const b018 = plan.beats.find((b) => b.beat_id === 'b018')
    const sh0018 = plan.shots.find((s) => s.shot_id === 'sh0018')
    const g02 = (plan.segments as { segment_id: string }[]).find((s) => s.segment_id === 'g02')
    const bpPath = join(work, 'beat-plan.json')
    writeFileSync(bpPath, JSON.stringify({ project: plan.project, segments: [g02], beats: [b018], shots: [sh0018], coverage_gap: [] }, null, 2))
    const r = cli(['plan', '--project', PROJ, '--apply', bpPath, '--only', 'b018'])
    const s = r.json as { ok?: boolean; need_shots?: number; postcondition_violations?: unknown[] } | null
    const ok = r.code === EXIT_OK && s !== null && s.ok === true && (s.postcondition_violations?.length ?? -1) === 0
    record('2-plan-apply', step(ok), `exit=${r.code} need=${s?.need_shots} viol=${s?.postcondition_violations?.length}`)
  } else record('2-plan-apply', step(false), 'skipped (앞 단계 실패)')

  /* ── 3. harvest (DI 로컬, 네트워크 0) → exit 0 ── */
  if (chainOk) {
    const h = await runHarvest({ projectDir: PROJ, only: [], evalMode: true, human: false, env: offlineEnv(), adapters: localAdapters(dummy) })
    let parsed = false
    try { JSON.parse(JSON.stringify(h.summary)); parsed = true } catch { parsed = false }
    const blocked = (h.summary as { blocked?: unknown[] }).blocked ?? []
    const ok = h.exitCode === EXIT_OK && parsed && blocked.length === 0 && existsSync(resolve(PROJ, 'candidates'))
    record('3-harvest', step(ok), `exit=${h.exitCode} json=${parsed} blocked=${blocked.length}`)
  } else record('3-harvest', step(false), 'skipped (앞 단계 실패)')

  /* ── 4. review 렌더 → review.html 존재 ── */
  if (chainOk) {
    const r = cli(['review', '--project', PROJ])
    const s = r.json as { mode?: string } | null
    const ok = r.code === EXIT_OK && s !== null && s.mode === 'render' && existsSync(resolve(PROJ, 'review.html'))
    record('4-review-render', step(ok), `exit=${r.code} mode=${s?.mode} html=${existsSync(resolve(PROJ, 'review.html'))}`)
  } else record('4-review-render', step(false), 'skipped (앞 단계 실패)')

  /* ── 5. review --apply (결정로그 픽스처) → Z2 반영 + usage.json ── */
  if (chainOk) {
    const rev = planRevision(PROJ)
    const logPath = join(work, 'review-decisions.json')
    writeFileSync(logPath, JSON.stringify({
      revision: rev, generated_at: new Date(0).toISOString(),
      decisions: [{ shot_id: 'sh0018', asset_kind: 'caption_card', selection_status: 'approved', rights_status: 'owned', emphasis_caption: '충격 결과', locked_selection: true }],
    }, null, 2))
    const r = cli(['review', '--project', PROJ, '--apply', logPath])
    const s = r.json as { ok?: boolean; mode?: string; applied_shots?: string[]; usage_entries?: number } | null
    const usageOk = existsSync(resolve(PROJ, 'sources', 'usage.json'))
    const ok = r.code === EXIT_OK && s !== null && s.ok === true && (s.applied_shots ?? []).includes('sh0018') && (s.usage_entries ?? 0) > 0 && usageOk
    record('5-review-apply', step(ok), `exit=${r.code} applied=${JSON.stringify(s?.applied_shots)} usage_entries=${s?.usage_entries} usage.json=${usageOk}`)
  } else record('5-review-apply', step(false), 'skipped (앞 단계 실패)')

  /* ── 6. assemble --emit numbered → exit 0 + render_report ── */
  if (chainOk) {
    const r = cli(['assemble', '--project', PROJ, '--emit', 'numbered', '--force'])
    const s = r.json as { ok?: boolean; outputs?: { numbered?: { status?: string } } } | null
    const reportOk = existsSync(resolve(PROJ, 'render_report.json'))
    const ok = r.code === EXIT_OK && s !== null && s.ok === true && s.outputs?.numbered?.status === 'ok' && reportOk
    record('6-assemble', step(ok), `exit=${r.code} numbered=${s?.outputs?.numbered?.status} render_report=${reportOk}`)
  } else record('6-assemble', step(false), 'skipped (앞 단계 실패)')

  /* ── 7. qc → gate=HOLD_FOR_HUMAN (최종 PASS 는 코드가 선언하지 않는다) ── */
  if (chainOk) {
    const r = cli(['qc', '--project', PROJ])
    const s = r.json as { gate?: string; p0_count?: number } | null
    const ok = r.code === EXIT_OK && s !== null && s.gate === 'HOLD_FOR_HUMAN' && s.p0_count === 0
    record('7-qc-hold-for-human', step(ok), `exit=${r.code} gate=${s?.gate} p0=${s?.p0_count}`)
  } else record('7-qc-hold-for-human', step(false), 'skipped (앞 단계 실패)')

  /* ── 마감 ── */
  rmSync(work, { recursive: true, force: true })
  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
  if (!allPass) process.exitCode = 1
}

main().catch((err: unknown) => {
  process.stderr.write(`verify-e2e 예외: ${(err as Error).stack ?? String(err)}\n`)
  process.exitCode = 1
})
