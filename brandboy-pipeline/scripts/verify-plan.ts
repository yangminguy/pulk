/**
 * verify-plan.ts — T7 Part A(plan --apply) 완료 조건 자동 판정
 *
 * 검증:
 *  1. 초기 생성        — shot-plan.json 부재 → beat-plan 병합으로 생성(revision 0→1, plan_rev 1, seal 정합)
 *  2. 병합            — 보존 샷(approved)의 Z2 문자단위 보존 + 신규 need 샷 추가 + plan_rev +1
 *  3. 재분할 abort     — 보존 a_roll 시간대에 새 need a_roll 생성 → exit 1 + 파일 무변경 + 위반 보고
 *  4. 재분할 OK        — coverage_gap 보고 + 보존 샷 시간대에 need 미생성 → 통과
 *  5. --only 한정       — 범위 밖 비트는 beat-plan 변경을 반영하지 않음(기존 유지)
 *
 * 실행:  npx tsx scripts/verify-plan.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runPlan } from '../src/commands/plan.js'
import { sealHash } from '../src/lib/canonical.js'

const ROOT = resolve(import.meta.dirname, '..')
const VP = resolve(ROOT, 'fixtures', 'valid-project')

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'bb-plan-'))
}
function withProfile(dir: string): void {
  cpSync(join(VP, 'edit-profile.json'), join(dir, 'edit-profile.json'))
  cpSync(join(VP, 'frame.md'), join(dir, 'frame.md'))
}
function readPlan(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, 'shot-plan.json'), 'utf8')) as Record<string, unknown>
}
function resealOk(dir: string): boolean {
  const doc = readPlan(dir) as { writers: Record<string, unknown> }
  const clone = readPlan(dir) as { writers: Record<string, unknown> }
  delete clone.writers.seal
  return sealHash(clone) === doc.writers.seal
}
function anchor(key: string, off: number): { sentence_key: string; offset_sec: number } {
  return { sentence_key: key, offset_sec: off }
}

/* ── beat-plan 빌더 ── */
function beat(id: string, seg: string, start: number, end: number, imp: string, vf = 'literal'): Record<string, unknown> {
  return { beat_id: id, segment_id: seg, narration: `n-${id}`, start, end, visual_function: vf, importance: imp, search_intent: `intent-${id}`, anchor: anchor('a1b2c3d4', start), timing_rev: 4 }
}
function needShot(id: string, beatIds: string[], start: number, end: number, kind: string): Record<string, unknown> {
  return { shot_id: id, beat_ids: beatIds, start, end, asset_kind: kind, purpose: `p-${id}`, selection_status: 'need', rights_status: 'unknown', anchor: anchor('a1b2c3d4', start), timing_rev: 4 }
}

function main(): void {
  /* ── 1. 초기 생성 ── */
  {
    const dir = tmp()
    withProfile(dir)
    const bp = {
      project: 'init-proj',
      segments: [{ segment_id: 'g01', act: 'hook', purpose: '결과', energy: 3 }],
      beats: [beat('b001', 'g01', 0, 3, 'critical', 'evidence'), beat('b002', 'g01', 3, 6, 'normal')],
      shots: [needShot('sh0001', ['b001'], 0, 3, 'official_video'), needShot('sh0002', ['b002'], 3, 6, 'a_roll')],
      coverage_gap: [],
    }
    const bpPath = join(dir, 'beat-plan.json')
    writeFileSync(bpPath, JSON.stringify(bp))
    const { summary, exitCode } = runPlan(dir, { applyPath: bpPath, only: [], human: false })
    const plan = readPlan(dir)
    const ok = exitCode === 0 && summary.mode === 'initial' && plan['revision'] === 1 && (plan['writers'] as Record<string, unknown>)['plan_rev'] === 1 && (plan['beats'] as unknown[]).length === 2 && (plan['shots'] as unknown[]).length === 2 && resealOk(dir)
    record('initial-create', ok, `exit=${exitCode} mode=${summary.mode} rev=${plan['revision']} beats=${(plan['beats'] as unknown[]).length} shots=${(plan['shots'] as unknown[]).length} seal=${resealOk(dir)}`)
    rmSync(dir, { recursive: true, force: true })
  }

  /* ── 2. 병합: 보존 Z2 문자단위 보존 + need 추가 ── */
  {
    const dir = tmp()
    withProfile(dir)
    cpSync(join(VP, 'shot-plan.json'), join(dir, 'shot-plan.json'))
    const before = readPlan(dir)
    const beforeShots = before['shots'] as Record<string, unknown>[]
    const z2Fields = ['source_id', 'source_in', 'source_out', 'locked_selection', 'rights_status'] as const
    const snap = beforeShots.map((s) => ({ shot_id: s['shot_id'], vals: z2Fields.map((k) => JSON.stringify(s[k])) }))
    const bpBeats = (before['beats'] as Record<string, unknown>[]).map((b) => ({ ...b })) // 동일 비트 유지
    const bp = {
      project: 'valid-project',
      segments: before['segments'],
      beats: bpBeats,
      shots: [needShot('sh0010', ['b003'], 6, 7, 'motion')], // 보존과 다른 종류 → 무충돌
      coverage_gap: [],
    }
    const bpPath = join(dir, 'beat-plan.json')
    writeFileSync(bpPath, JSON.stringify(bp))
    const beforePlanRev = (before['writers'] as Record<string, unknown>)['plan_rev'] as number
    const { exitCode } = runPlan(dir, { applyPath: bpPath, only: [], human: false })
    const after = readPlan(dir)
    const afterShots = after['shots'] as Record<string, unknown>[]
    let z2Ok = true
    for (const s of snap) {
      const shot = afterShots.find((x) => x['shot_id'] === s.shot_id)
      z2Fields.forEach((k, i) => { if (JSON.stringify(shot?.[k]) !== s.vals[i]) z2Ok = false })
    }
    const hasNeed = afterShots.some((s) => s['shot_id'] === 'sh0010')
    const revBumped = (after['writers'] as Record<string, unknown>)['plan_rev'] === beforePlanRev + 1
    record('merge-z2-preserved', exitCode === 0 && z2Ok && hasNeed && revBumped && resealOk(dir), `exit=${exitCode} z2보존=${z2Ok} need추가=${hasNeed} plan_rev+1=${revBumped} seal=${resealOk(dir)}`)
    rmSync(dir, { recursive: true, force: true })
  }

  /* ── 3. 재분할 abort: 보존 a_roll[3,6] 시간대에 새 need a_roll ── */
  {
    const dir = tmp()
    withProfile(dir)
    cpSync(join(VP, 'shot-plan.json'), join(dir, 'shot-plan.json'))
    const beforeRaw = readFileSync(join(dir, 'shot-plan.json'), 'utf8')
    const before = JSON.parse(beforeRaw) as Record<string, unknown>
    const bp = {
      project: 'valid-project',
      segments: before['segments'],
      beats: before['beats'],
      shots: [needShot('sh0011', ['b002'], 3, 5, 'a_roll')], // 보존 sh0002(a_roll [3,6])와 겹침
      coverage_gap: [],
    }
    const bpPath = join(dir, 'beat-plan.json')
    writeFileSync(bpPath, JSON.stringify(bp))
    const { summary, exitCode } = runPlan(dir, { applyPath: bpPath, only: [], human: false })
    const afterRaw = readFileSync(join(dir, 'shot-plan.json'), 'utf8')
    const unchanged = beforeRaw === afterRaw
    const reported = summary.postcondition_violations.length > 0 && summary.postcondition_violations[0]!.asset_kind === 'a_roll'
    record('resplit-abort', exitCode === 1 && unchanged && reported, `exit=${exitCode} 파일무변경=${unchanged} 위반보고=${summary.postcondition_violations.length}건`)
    rmSync(dir, { recursive: true, force: true })
  }

  /* ── 4. 재분할 OK: coverage_gap 보고 + 보존 시간대 need 미생성 ── */
  {
    const dir = tmp()
    withProfile(dir)
    cpSync(join(VP, 'shot-plan.json'), join(dir, 'shot-plan.json'))
    const before = readPlan(dir)
    // b002(정상 a_roll sh0002 [3,6] 보존)를 b002a/b002b 로 쪼갠다. 보존 시간대엔 need 안 만들고 gap 보고.
    const beats = (before['beats'] as Record<string, unknown>[]).filter((b) => b['beat_id'] !== 'b002')
    beats.push(beat('b002a', 'g01', 3, 4.5, 'normal'), beat('b002b', 'g01', 4.5, 6, 'normal'))
    const bp = {
      project: 'valid-project',
      segments: before['segments'],
      beats,
      shots: [needShot('sh0012', ['b003'], 6, 7, 'motion')], // 보존 a_roll 시간대 밖 + 다른 종류
      coverage_gap: [{ beat_id: 'b002a', from: 3, to: 4.5, reason: '보존 샷 미달 — need 미생성' }],
    }
    const bpPath = join(dir, 'beat-plan.json')
    writeFileSync(bpPath, JSON.stringify(bp))
    const { summary, exitCode } = runPlan(dir, { applyPath: bpPath, only: [], human: false })
    const after = readPlan(dir)
    const gapReported = (after['coverage_gap'] as unknown[]).length > 0
    const afterShots = after['shots'] as Record<string, unknown>[]
    // 보존 a_roll[3,6] 시간대에 새 need a_roll 없음
    const noNeedOverPreserved = !afterShots.some((s) => s['selection_status'] === 'need' && s['asset_kind'] === 'a_roll' && (s['start'] as number) < 6 && (s['end'] as number) > 3)
    record('resplit-ok', exitCode === 0 && gapReported && noNeedOverPreserved && summary.postcondition_violations.length === 0, `exit=${exitCode} gap=${(after['coverage_gap'] as unknown[]).length} 보존시간대_need없음=${noNeedOverPreserved}`)
    rmSync(dir, { recursive: true, force: true })
  }

  /* ── 5. --only 한정: 범위 밖 비트는 기존 유지 ── */
  {
    const dir = tmp()
    withProfile(dir)
    cpSync(join(VP, 'shot-plan.json'), join(dir, 'shot-plan.json'))
    const before = readPlan(dir)
    const origB001 = (before['beats'] as Record<string, unknown>[]).find((b) => b['beat_id'] === 'b001')!['narration']
    // beat-plan 이 b001 의 narration 을 바꾸지만 --only b003 이므로 반영되면 안 된다.
    const beats = (before['beats'] as Record<string, unknown>[]).map((b) => (b['beat_id'] === 'b001' ? { ...b, narration: 'CHANGED-b001' } : { ...b }))
    const bp = {
      project: 'valid-project',
      segments: before['segments'],
      beats,
      shots: [needShot('sh0013', ['b003'], 6, 7, 'motion')],
      coverage_gap: [],
    }
    const bpPath = join(dir, 'beat-plan.json')
    writeFileSync(bpPath, JSON.stringify(bp))
    const { exitCode } = runPlan(dir, { applyPath: bpPath, only: ['b003'], human: false })
    const after = readPlan(dir)
    const b001 = (after['beats'] as Record<string, unknown>[]).find((b) => b['beat_id'] === 'b001')!['narration']
    const b001Untouched = b001 === origB001
    const b003GotNeed = (after['shots'] as Record<string, unknown>[]).some((s) => s['shot_id'] === 'sh0013')
    record('only-scoped', exitCode === 0 && b001Untouched && b003GotNeed, `exit=${exitCode} b001미변경=${b001Untouched}(${JSON.stringify(b001)}) b003_need추가=${b003GotNeed}`)
    rmSync(dir, { recursive: true, force: true })
  }

  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
  if (!allPass) process.exitCode = 1
}

main()
