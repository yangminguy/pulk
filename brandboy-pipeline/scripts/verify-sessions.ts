/**
 * verify-sessions.ts — T3b 세션 접합 완료 조건 자동 판정
 *
 * 검증(T3-align 완료 조건 T3b):
 *  1 접합부 경고 발생      — align-report.session_warnings 비어있지 않음(마이크 거리 차이)
 *  2 접합부 ±100ms RMS 변화 < session_boundary_discontinuity_db(6.0dB) — 각 접합부 정량 판정
 *  3 마스터 loudnorm == program_lufs ± 0.5
 *  4 접합부 청취(사람 판정) — 접합부 타임코드 human_required 출력
 *
 * 실행:  npx tsx scripts/verify-sessions.ts  · stdout: 결과 JSON · 실패 시 exit 1
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadProfile } from '../src/lib/profile.js'

const ROOT = resolve(import.meta.dirname, '..')
const FIX = resolve(ROOT, 'fixtures', 'align-project')
const MASTER = join(FIX, 'audio', 'narration-master.wav')
const WINDOW_SEC = 0.1 // ±100ms
const LUFS_TOL = 0.5

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

function ffmpegStderr(args: string[]): string {
  const r = spawnSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8', timeout: 60000 })
  return `${r.stdout ?? ''}${r.stderr ?? ''}`
}

/** [start, start+dur] 구간 Overall RMS level dB. */
function rmsDb(start: number, dur: number): number {
  const out = ffmpegStderr(['-ss', String(start), '-t', String(dur), '-i', MASTER, '-af', 'astats=metadata=0', '-f', 'null', '-'])
  const all = [...out.matchAll(/RMS level dB:\s*(-?[\d.]+|-?inf)/g)].map((m) => m[1]!)
  const last = all[all.length - 1]
  if (last === undefined) return Number.NEGATIVE_INFINITY
  return last.includes('inf') ? Number.NEGATIVE_INFINITY : Number(last)
}

function masterLufs(): number {
  const out = ffmpegStderr(['-i', MASTER, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'])
  const m = out.match(/"input_i"\s*:\s*"(-?[\d.]+)"/)
  return m ? Number(m[1]) : NaN
}

if (!existsSync(MASTER)) {
  console.log(JSON.stringify({ pass: false, error: 'narration-master.wav 없음 — 먼저 align 실행' }))
  process.stderr.write('FAIL — narration-master.wav 없음. npx tsx src/cli.ts align --project fixtures/align-project\n')
  process.exit(1)
}

const profile = loadProfile(FIX)
const report = JSON.parse(readFileSync(join(FIX, 'align-report.json'), 'utf8')) as {
  session_warnings: { kind: string; detail: string }[]
  session_boundaries: number[]
}

/* ── 1. 접합부 경고 발생 ── */
record('session-warning-raised', report.session_warnings.length >= 1,
  `warnings=${report.session_warnings.length} ${JSON.stringify(report.session_warnings)}`)

/* ── 2. 접합부 ±100ms RMS 변화 < 6dB ── */
const limit = profile.audio.session_boundary_discontinuity_db
const boundaryDetails: string[] = []
let allBoundaryOk = report.session_boundaries.length >= 1
for (const b of report.session_boundaries) {
  const before = rmsDb(Math.max(0, b - WINDOW_SEC), WINDOW_SEC)
  const after = rmsDb(b, WINDOW_SEC)
  const diff = Math.abs(before - after)
  const ok = Number.isFinite(diff) && diff < limit
  if (!ok) allBoundaryOk = false
  boundaryDetails.push(`@${b}s: before=${before.toFixed(2)} after=${after.toFixed(2)} Δ=${diff.toFixed(2)}dB${ok ? '' : ' ✗'}`)
}
record('boundary-rms-under-limit', allBoundaryOk, `기준 ${limit}dB · ${boundaryDetails.join(' | ')}`)

/* ── 3. 마스터 loudnorm == program_lufs ± 0.5 ── */
const lufs = masterLufs()
const target = profile.audio.program_lufs
const lufsOk = Number.isFinite(lufs) && Math.abs(lufs - target) <= LUFS_TOL
record('master-lufs-on-target', lufsOk, `input_i=${lufs} 기준=${target}±${LUFS_TOL}`)

/* ── 4. 접합부 청취(사람 판정) ── */
process.stderr.write(`\n[human_required] 접합부 청취(자동 통과 금지) — narration-master.wav 다음 지점에서 룸톤 급변·클릭 확인:\n  ${report.session_boundaries.map((b) => `${b}s`).join('  ')}\n`)

/* ── 마감 ── */
const passCount = checks.filter((c) => c.pass).length
const allPass = passCount === checks.length
console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks, boundary_listening: report.session_boundaries, listening_verdict: 'human_required' }))
process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}  (청취: human_required)\n`)
if (!allPass) process.exitCode = 1
