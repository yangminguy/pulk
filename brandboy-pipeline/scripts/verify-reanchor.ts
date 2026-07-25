/**
 * verify-reanchor.ts — T3 reanchor 완료 조건 자동 판정 (CONTRACTS §2)
 *
 * 결정론적 시나리오: 문장 1개 삽입(added) + 1개 삭제(removed) + 1개 수정(edited) +
 * rescaled + shifted + unchanged 6종을 align-remap 으로 구성하고, reanchor 후:
 *  - 영향 없는 샷의 source_in/source_out/locked_selection 문자 단위 보존, start/end 만 이동
 *  - 수정된(edited)·rescaled 샷: orphaned 아님 + needs_review=true + timing_rev 미갱신
 *  - 삭제(removed) 샷: orphaned=true, 삭제되지 않음
 *  - 삽입(added): plan_rerun_required[] 에 보고
 *  - reanchor 가 예외 없이 완료 = Z2(source_in/out) writeScoped 보존(위반 시 io.ts abort)
 *  - validate 가 실패(critical edited/orphaned → V15 blocked; V13 는 flagged 샷을 V15 에 위임)
 *
 * 실행:  npx tsx scripts/verify-reanchor.ts  · stdout: 결과 JSON · 실패 시 exit 1
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { sealHash } from '../src/lib/canonical.js'
import { runReanchor } from '../src/commands/reanchor.js'
import { validateProject } from '../src/commands/validate.js'

const ROOT = resolve(import.meta.dirname, '..')

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

/* ─────────────── 픽스처 구성 ─────────────── */

const OLD_REV = 4
const NEW_REV = 5

function beat(id: string, seg: string, key: string, start: number, end: number, imp: string, vf: string) {
  return { beat_id: id, segment_id: seg, narration: '내레이션', start, end, visual_function: vf, importance: imp, search_intent: '검색', anchor: { sentence_key: key, offset_sec: 0 }, timing_rev: OLD_REV }
}
function shot(id: string, beatId: string, key: string, start: number, end: number, srcIn: number, srcOut: number) {
  return {
    shot_id: id, beat_ids: [beatId], start, end, asset_kind: 'official_video', purpose: '원본 클립',
    selection_status: 'approved', rights_status: 'owned', source_id: 'src_001', source_in: srcIn, source_out: srcOut,
    anchor: { sentence_key: key, offset_sec: 0 }, timing_rev: OLD_REV, locked_selection: true,
  }
}

function buildShotPlan() {
  const doc: Record<string, unknown> = {
    project: 'reanchor-test', revision: 3, profile_rev: 1, frame_rev: 1,
    writers: { plan_rev: 1, review_rev: 1, reanchor_rev: 1, seal: '' },
    coverage_gap: [],
    segments: [
      { segment_id: 'g01', act: 'hook', purpose: '훅', energy: 3 },
      { segment_id: 'g02', act: 'build', purpose: '빌드', energy: 3 },
    ],
    beats: [
      beat('b001', 'g01', 'kunchg01', 0, 3, 'normal', 'literal'),
      beat('b002', 'g01', 'kshift01', 3, 6, 'normal', 'literal'),
      beat('b003', 'g02', 'krescl01', 6, 9, 'normal', 'evidence'),
      beat('b004', 'g02', 'kedited1', 9, 12, 'critical', 'evidence'),
      beat('b005', 'g02', 'kremovd1', 12, 15, 'normal', 'literal'),
    ],
    shots: [
      shot('sh0001', 'b001', 'kunchg01', 0, 3, 5, 8),
      shot('sh0002', 'b002', 'kshift01', 3, 6, 10, 13),
      shot('sh0003', 'b003', 'krescl01', 6, 9, 20, 23),
      shot('sh0004', 'b004', 'kedited1', 9, 12, 30, 33),
      shot('sh0005', 'b005', 'kremovd1', 12, 15, 40, 43),
    ],
  }
  const clone = JSON.parse(JSON.stringify(doc)) as { writers: { seal?: string } }
  delete clone.writers.seal
  ;(doc.writers as { seal: string }).seal = sealHash(clone)
  return doc
}

function tlWords(start: number, end: number) {
  const mid = Number(((start + end) / 2).toFixed(3))
  return [{ text: '단어', start, end: mid }, { text: '둘', start: mid, end }]
}

const NEW_TIMELINE = {
  duration: 17, align_rev: NEW_REV, profile_rev: 1, word_timing: 'exact',
  sentences: [
    { sentence_key: 'kunchg01', sentence_id: 'sn001', segment_id: 'g01', text: '문장 하나', start: 0, end: 3, words: tlWords(0, 3) },
    { sentence_key: 'kshift01', sentence_id: 'sn002', segment_id: 'g01', text: '문장 둘', start: 4, end: 7, words: tlWords(4, 7) },
    { sentence_key: 'krescl01', sentence_id: 'sn003', segment_id: 'g02', text: '문장 셋', start: 7, end: 12, words: tlWords(7, 12) },
    { sentence_key: 'kedited1', sentence_id: 'sn004', segment_id: 'g02', text: '수정된 문장 넷', start: 12, end: 15, words: tlWords(12, 15) },
    { sentence_key: 'kadded01', sentence_id: 'sn005', segment_id: 'g02', text: '새로 삽입된 문장', start: 15, end: 17, words: tlWords(15, 17) },
  ],
}

const REMAP = {
  align_rev: NEW_REV,
  sentences: [
    { key: 'kunchg01', status: 'unchanged', old_start: 0, new_start: 0, old_dur: 3, new_dur: 3 },
    { key: 'kshift01', status: 'shifted', old_start: 3, new_start: 4, old_dur: 3, new_dur: 3 },
    { key: 'krescl01', status: 'rescaled', old_dur: 3, new_dur: 5 },
    { key: 'kedited1', status: 'edited', old_text: '문장 넷', new_text: '수정된 문장 넷', similarity: 0.62 },
    { key: 'kadded01', status: 'added' },
    { key: 'kremovd1', status: 'removed' },
  ],
}

/* ─────────────── 실행 ─────────────── */

const dir = mkdtempSync(join(tmpdir(), 'bb-reanchor-'))
cpSync(join(ROOT, 'config', 'edit-profile.json'), join(dir, 'edit-profile.json'))
cpSync(join(ROOT, 'config', 'frame.md'), join(dir, 'frame.md'))
const planPath = join(dir, 'shot-plan.json')
writeFileSync(planPath, JSON.stringify(buildShotPlan(), null, 2))
writeFileSync(join(dir, 'timeline.json'), JSON.stringify(NEW_TIMELINE, null, 2))
writeFileSync(join(dir, 'align-remap.json'), JSON.stringify(REMAP, null, 2))

const before = JSON.parse(readFileSync(planPath, 'utf8')) as { shots: Record<string, unknown>[] }
const srcBefore = new Map(before.shots.map((s) => [s.shot_id as string, JSON.stringify([s.source_in, s.source_out, s.locked_selection])]))

let threw = false
let summary
try {
  const r = runReanchor(dir, { only: [], human: true })
  summary = r.summary
} catch (e) {
  threw = true
  process.stderr.write(`reanchor 예외: ${String(e)}\n`)
}

const after = JSON.parse(readFileSync(planPath, 'utf8')) as { writers: { reanchor_rev: number }; shots: Record<string, unknown>[] }
const shotById = new Map(after.shots.map((s) => [s.shot_id as string, s]))
const g = (id: string): Record<string, unknown> => shotById.get(id)!

/* ── 1. Z2 보존(writeScoped 무예외 + source 문자 단위 동일) ── */
let z2Preserved = !threw && after.shots.length === before.shots.length
for (const s of after.shots) {
  const now = JSON.stringify([s.source_in, s.source_out, s.locked_selection])
  if (srcBefore.get(s.shot_id as string) !== now) z2Preserved = false
}
record('z2-source-preserved', z2Preserved, `무예외=${!threw} 5샷 source_in/out/locked 문자단위 보존=${z2Preserved} reanchor_rev=${after.writers.reanchor_rev}`)

/* ── 2. unchanged/shifted: start/end 이동 + timing_rev 갱신, source 보존 ── */
const un = g('sh0001'); const sh = g('sh0002')
const unchangedOk = un.start === 0 && un.end === 3 && un.timing_rev === NEW_REV && un.orphaned === undefined && un.needs_review === undefined
const shiftedOk = sh.start === 4 && sh.end === 7 && sh.timing_rev === NEW_REV && sh.source_in === 10 && sh.source_out === 13
record('unchanged-shifted-reanchored', unchangedOk && shiftedOk,
  `unchanged sh0001[${un.start}..${un.end}] tr=${un.timing_rev} · shifted sh0002[${sh.start}..${sh.end}] tr=${sh.timing_rev} src_in=${sh.source_in}(기대 10 이동)`)

/* ── 3. rescaled/edited: needs_review=true, orphaned 아님, timing_rev 미갱신 ── */
const rs = g('sh0003'); const ed = g('sh0004')
const rescaledOk = rs.needs_review === true && rs.orphaned === undefined && rs.timing_rev === OLD_REV && rs.start === 6 && rs.end === 9
const editedOk = ed.needs_review === true && ed.orphaned === undefined && ed.timing_rev === OLD_REV
record('rescaled-edited-needs-review', rescaledOk && editedOk,
  `rescaled sh0003 needs_review=${rs.needs_review} tr=${rs.timing_rev}(기대 ${OLD_REV}) · edited sh0004 needs_review=${ed.needs_review} orphaned=${ed.orphaned} tr=${ed.timing_rev}`)

/* ── 4. removed: orphaned=true, 삭제 안 됨, timing_rev 미갱신 ── */
const rm = g('sh0005')
const removedOk = rm !== undefined && rm.orphaned === true && rm.timing_rev === OLD_REV
record('removed-orphaned-not-deleted', removedOk,
  `sh0005 존재=${rm !== undefined} orphaned=${rm?.orphaned} tr=${rm?.timing_rev}`)

/* ── 5. added → plan_rerun_required ── */
const rerunOk = (summary?.plan_rerun_required.some((p) => p.sentence_key === 'kadded01') ?? false)
record('added-plan-rerun', rerunOk, `plan_rerun_required=${JSON.stringify(summary?.plan_rerun_required ?? [])}`)

/* ── 6. validate 실패(critical edited → V15 blocked) ── */
const vp = validateProject(dir)
const v15Blocked = vp.result.blocked.some((f) => f.rule === 'V15' && f.shot_id === 'sh0004')
record('validate-fails-v15', !vp.result.ok && v15Blocked,
  `validate.ok=${vp.result.ok}(기대 false) V15 blocked(sh0004)=${v15Blocked} blocked=[${vp.result.blocked.map((f) => `${f.rule}:${f.shot_id ?? '-'}`).join(', ')}]`)

rmSync(dir, { recursive: true, force: true })

/* ── 마감 ── */
const passCount = checks.filter((c) => c.pass).length
const allPass = passCount === checks.length
console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks, counts: summary?.counts }))
process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
if (!allPass) process.exitCode = 1
