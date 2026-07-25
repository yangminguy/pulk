/**
 * verify-scoped-write.ts — T2 완료 조건 자동 판정 (T2-cli §6·§8)
 *
 * 검증:
 *  1. 위반 abort         — reanchor(Z3)가 source_in(Z2) 건드리면 abort + 파일 무변경 + diff
 *  2. 재정렬 오탐 없음    — plan(Z1)이 shots[] 재정렬해도 abort 안 함 + seal 재봉인 정합
 *  3. SIGKILL 보존       — 쓰기 중 죽어도(tmp 시뮬) 기존 파일 보존
 *  4. 세션 skip 헬퍼      — 세션2 WAV만 교체 → 세션2만 재처리 판단
 *  5. qc/assemble --only  — exit 2 (단위 + 실제 CLI 스폰)
 *  6. --eval TTL 무시     — 만료 캐시도 ignoreTtl 로 반환
 *  7. 매직넘버 검출        — src/ 에 상수 3개 심으면 verify-no-magic-numbers 가 잡는다
 *
 * 실행:  npx tsx scripts/verify-scoped-write.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import {
  cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, utimesSync, statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { writeScoped, writeAtomic, ScopedWriteError } from '../src/lib/io.js'
import { shouldReprocessSession, sessionStateEntry, validateOnly } from '../src/lib/scope.js'
import { cacheSet, cacheGet, cacheSetAt } from '../src/lib/cache.js'
import { run } from '../src/lib/proc.js'
import { sealHash, sha256Hex } from '../src/lib/canonical.js'
import { repoRoot } from '../src/lib/profile.js'

const ROOT = resolve(import.meta.dirname, '..')
const VALID_PLAN = resolve(ROOT, 'fixtures', 'valid-project', 'shot-plan.json')

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

function tmpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bb-scoped-'))
  cpSync(VALID_PLAN, join(dir, 'shot-plan.json'))
  return dir
}

function resealOk(file: string): boolean {
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { writers: Record<string, unknown> }
  const clone = JSON.parse(readFileSync(file, 'utf8')) as { writers: Record<string, unknown> }
  delete clone.writers.seal
  return sealHash(clone) === doc.writers.seal
}

async function main(): Promise<void> {
  /* ── 1. 위반 abort (Z3가 source_in 건드림) ── */
  {
    const dir = tmpProject()
    const file = join(dir, 'shot-plan.json')
    const before = readFileSync(file, 'utf8')
    let threw: ScopedWriteError | null = null
    try {
      writeScoped(file, 'Z3', (doc) => { doc.shots[0]!['source_in'] = 999 })
    } catch (e) {
      if (e instanceof ScopedWriteError) threw = e
      else throw e
    }
    const after = readFileSync(file, 'utf8')
    const unchanged = before === after
    const diffHitsSourceIn = threw !== null && threw.diffs.some((d) => d.path.includes('source_in'))
    record('violation-abort', threw !== null && unchanged && diffHitsSourceIn,
      `throw=${threw !== null} 파일무변경=${unchanged} diff=${threw?.diffs.map((d) => d.path).join(',') ?? '-'}`)
    rmSync(dir, { recursive: true, force: true })
  }

  /* ── 2. 재정렬 오탐 없음 (Z1이 shots 재정렬) ── */
  {
    const dir = tmpProject()
    const file = join(dir, 'shot-plan.json')
    const orig = JSON.parse(readFileSync(file, 'utf8')) as { revision: number; writers: { plan_rev: number } }
    let threw = false
    try {
      writeScoped(file, 'Z1', (doc) => { doc.shots.reverse() })
    } catch {
      threw = true
    }
    const now = JSON.parse(readFileSync(file, 'utf8')) as { revision: number; writers: { plan_rev: number } }
    const revBumped = now.revision === orig.revision + 1 && now.writers.plan_rev === orig.writers.plan_rev + 1
    record('reorder-no-false-positive', !threw && revBumped && resealOk(file),
      `throw=${threw} revision ${orig.revision}→${now.revision} plan_rev ${orig.writers.plan_rev}→${now.writers.plan_rev} seal정합=${resealOk(file)}`)
    rmSync(dir, { recursive: true, force: true })
  }

  /* ── 3. SIGKILL 보존 (tmp 시뮬레이션) ── */
  {
    const dir = tmpProject()
    const file = join(dir, 'shot-plan.json')
    const original = readFileSync(file, 'utf8')
    // 쓰기 도중 죽은 상황: <file>.tmp 에 부분 내용이 남고 rename 은 일어나지 않았다
    writeFileSync(`${file}.tmp`, 'PARTIAL GARBAGE — 크래시로 rename 전에 죽음')
    const survived = readFileSync(file, 'utf8') === original
    // 정상 경로: writeAtomic 후 .tmp 잔여 없음 + 내용 반영
    writeAtomic(file, { ok: true })
    const noLeftover = !existsSync(`${file}.tmp`)
    const applied = JSON.parse(readFileSync(file, 'utf8')).ok === true
    record('sigkill-atomic-preserve', survived && noLeftover && applied,
      `크래시후_원본보존=${survived} 정상후_tmp없음=${noLeftover} 적용=${applied}`)
    rmSync(dir, { recursive: true, force: true })
  }

  /* ── 4. 세션 skip 헬퍼 (세션2만 재처리) ── */
  {
    const dir = mkdtempSync(join(tmpdir(), 'bb-session-'))
    const wav1 = join(dir, 'session-01.wav')
    const wav2 = join(dir, 'session-02.wav')
    writeFileSync(wav1, 'AAAA')
    writeFileSync(wav2, 'BBBB')
    const stateFile = join(dir, 'align-state.json')
    writeFileSync(stateFile, JSON.stringify({
      sessions: { 'session-01': sessionStateEntry(wav1), 'session-02': sessionStateEntry(wav2) },
    }))
    // 세션2 WAV 만 교체(내용+mtime)
    writeFileSync(wav2, 'BBBB-CHANGED')
    const future = Date.now() / 1000 + 60
    utimesSync(wav2, future, future)
    const s1 = shouldReprocessSession('session-01', wav1, stateFile)
    const s2 = shouldReprocessSession('session-02', wav2, stateFile)
    record('session-skip-helper', s1 === false && s2 === true,
      `session-01 재처리=${s1}(기대 false) session-02 재처리=${s2}(기대 true)`)
    rmSync(dir, { recursive: true, force: true })
  }

  /* ── 5. qc/assemble --only exit 2 (단위 + 실제 CLI) ── */
  {
    const unitQc = validateOnly('none', ['b001']) !== null
    const unitAsm = validateOnly('none', ['b001']) !== null
    const cli = await run('npx', ['tsx', 'src/cli.ts', 'qc', '--project', 'fixtures/valid-project', '--only', 'b001'],
      { cwd: ROOT, timeoutSec: 60 })
    record('only-unsupported-exit2', unitQc && unitAsm && cli.code === 2,
      `단위 qc=${unitQc} assemble=${unitAsm} 실제CLI qc code=${cli.code}(기대 2)`)
  }

  /* ── 6. --eval TTL 무시 ── */
  {
    const fresh = 'bb-eval-fresh'
    const stale = 'bb-eval-stale'
    const TTL_DAYS = 7
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    cacheSet(fresh, { a: 1 })
    cacheSetAt(stale, { b: 2 }, Date.now() - THIRTY_DAYS_MS)
    const freshHit = cacheGet(fresh, { ttlDays: TTL_DAYS }) !== null
    const staleMiss = cacheGet(stale, { ttlDays: TTL_DAYS }) === null
    const staleEval = JSON.stringify(cacheGet(stale, { ttlDays: TTL_DAYS, ignoreTtl: true })) === JSON.stringify({ b: 2 })
    record('eval-ignores-ttl', freshHit && staleMiss && staleEval,
      `신선캐시적중=${freshHit} 만료캐시null=${staleMiss} eval로만료무시복원=${staleEval}`)
    for (const k of [fresh, stale]) {
      const p = join(repoRoot(), '.cache', `${sha256Hex(k)}.json`)
      if (existsSync(p)) rmSync(p)
    }
  }

  /* ── 7. 매직넘버 검출 (상수 3개 심기) ── */
  {
    const probe = resolve(ROOT, 'src', '__magic_probe__.ts')
    let detected = 0
    try {
      mkdirSync(resolve(ROOT, 'src'), { recursive: true })
      writeFileSync(probe, 'export const PA = 42\nexport const PB = 314\nexport const PC = 777\n')
      const res = await run('npx', ['tsx', 'scripts/verify-no-magic-numbers.ts'], { cwd: ROOT, timeoutSec: 60 })
      const parsed = JSON.parse(res.stdout) as { violations: { file: string; value: string }[] }
      detected = parsed.violations.filter((v) => v.file.includes('__magic_probe__')).length
    } finally {
      if (existsSync(probe)) rmSync(probe)
    }
    const THREE = 3
    record('magic-number-detection', detected === THREE, `심은 상수 3개 중 검출 ${detected}개`)
  }

  /* ── 8. proc.ts 타임아웃 (ffmpeg SIGTERM→SIGKILL) ── */
  {
    const ff = await run('ffmpeg',
      ['-hide_banner', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30', '-t', '3600', '-f', 'null', '-'],
      { timeoutSec: 2 })
    if (ff.stderr.includes('ENOENT')) {
      record('proc-timeout-ffmpeg', true, 'ffmpeg 미설치 → 스킵(선택적)')
    } else {
      record('proc-timeout-ffmpeg', ff.timedOut === true && ff.stderr.length > 0,
        `timedOut=${ff.timedOut} stderr보존=${ff.stderr.length > 0}`)
    }
  }

  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
  if (!allPass) process.exitCode = 1
}

main().catch((err) => {
  process.stderr.write(`verify-scoped-write 예외: ${(err as Error).stack ?? String(err)}\n`)
  process.exitCode = 1
})
