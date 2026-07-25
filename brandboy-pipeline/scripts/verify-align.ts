/**
 * verify-align.ts — T3 align 완료 조건 자동 판정
 *
 * 검증(T3-align 완료 조건 T3):
 *  1 빈 공백 정리       — align-report.trimmed_gaps 로 문장 사이 긴 침묵이 다듬어진다
 *  2 반복 문장 둘 다 생존 — 동일 텍스트 2문장이 각각 다른 구간에 매칭
 *  3 자막 == 원고        — captions.srt 텍스트가 script.md 와 문자 단위 일치
 *  4 unmatched → exit 1  — 원고에만 있는 문장(오디오 없음)이면 종료 1
 *  5 --dry-run 파일 미생성
 *  6 청취 검사 타임코드   — 30초 샘플 3구간을 human_required 로 출력(자동 통과 금지)
 *
 * 실행:  npx tsx scripts/verify-align.ts
 * stdout: 결과 JSON / 진행: stderr / 실패 시 exit 1
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseSRT } from '../src/lib/captions.js'

const ROOT = resolve(import.meta.dirname, '..')
const FIX = resolve(ROOT, 'fixtures', 'align-project')

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

interface AlignSummary { ok: boolean; dry_run: boolean; matched: number; unmatched: string[]; duration: number; trimmed_gaps: number }

function runAlign(projectDir: string, extra: string[] = []): { code: number; summary: AlignSummary | null } {
  const r = spawnSync('npx', ['tsx', 'src/cli.ts', 'align', '--project', projectDir, ...extra], { cwd: ROOT, encoding: 'utf8', timeout: 600000 })
  let summary: AlignSummary | null = null
  try {
    summary = JSON.parse(r.stdout.trim().split('\n').pop() ?? '') as AlignSummary
  } catch { /* 파싱 불가 → null */ }
  return { code: r.status ?? -1, summary }
}

/** raw 세션만 담은 임시 프로젝트(전사 캐시는 wav 해시로 재사용됨). */
function tmpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bb-align-'))
  mkdirSync(join(dir, 'audio', 'raw'), { recursive: true })
  cpSync(join(FIX, 'audio', 'raw'), join(dir, 'audio', 'raw'), { recursive: true })
  for (const f of ['script.md', 'script-map.json', 'edit-profile.json', 'frame.md']) cpSync(join(FIX, f), join(dir, f))
  return dir
}

/* ── 사전: 픽스처가 정렬돼 있어야 한다(없으면 정렬) ── */
if (!existsSync(join(FIX, 'timeline.json'))) {
  process.stderr.write('[verify-align] 픽스처 정렬 실행…\n')
  runAlign(FIX, ['--human'])
}

/* ── 1. 빈 공백 정리 ── */
const report = JSON.parse(readFileSync(join(FIX, 'align-report.json'), 'utf8')) as { trimmed_gaps: { at: number; removed_sec: number }[]; removed_sec: number }
record('empty-gap-trimmed', report.trimmed_gaps.length >= 1 && report.trimmed_gaps.every((g) => g.removed_sec > 0),
  `trimmed_gaps=${report.trimmed_gaps.length} 총제거=${report.removed_sec}s ${JSON.stringify(report.trimmed_gaps)}`)

/* ── 2. 반복 문장 둘 다 생존 ── */
const timeline = JSON.parse(readFileSync(join(FIX, 'timeline.json'), 'utf8')) as { sentences: { sentence_key: string; text: string; start: number; end: number }[] }
const dup = timeline.sentences.filter((s) => s.text === '매출이 크게 늘었습니다')
const distinct = dup.length === 2 && dup[0]!.sentence_key !== dup[1]!.sentence_key && dup[0]!.end <= dup[1]!.start
record('repeated-sentence-both-survive', distinct,
  `동일문장 ${dup.length}개 keys=[${dup.map((s) => s.sentence_key).join(',')}] ranges=[${dup.map((s) => `${s.start}..${s.end}`).join(' | ')}]`)

/* ── 3. 자막 == 원고 (문자 단위) ── */
const srt = parseSRT(readFileSync(join(FIX, 'audio', 'captions.srt'), 'utf8'))
const capChars = srt.map((c) => c.text).join('').replace(/\s+/g, '')
const map = JSON.parse(readFileSync(join(FIX, 'script-map.json'), 'utf8')) as { sentences: { text: string }[] }
const scriptChars = map.sentences.map((s) => s.text).join('').replace(/\s+/g, '')
record('captions-equal-script', capChars === scriptChars, `caption==script (${capChars.length}자)`)

/* ── 4. unmatched → exit 1 (원고에만 있는 문장) ── */
{
  const dir = tmpProject()
  const m = JSON.parse(readFileSync(join(dir, 'script-map.json'), 'utf8')) as {
    sentences: { sentence_key: string; sentence_id: string; segment_id: string; text: string }[]
    sessions: { id: string; from_sentence_key: string; to_sentence_key: string; wav_path: string }[]
  }
  const bogus = { sentence_key: 's9999999', sentence_id: 'sn099', segment_id: 'g03', text: '이문장은녹음에전혀존재하지않는완전히다른내용입니다' }
  m.sentences.push(bogus)
  m.sessions[m.sessions.length - 1]!.to_sentence_key = bogus.sentence_key // 마지막 세션 범위에 포함
  writeFileSync(join(dir, 'script-map.json'), JSON.stringify(m, null, 2))
  const { code, summary } = runAlign(dir)
  record('unmatched-exit1', code === 1 && (summary?.unmatched.includes('s9999999') ?? false),
    `exit=${code}(기대 1) unmatched=${JSON.stringify(summary?.unmatched ?? [])}`)
  rmSync(dir, { recursive: true, force: true })
}

/* ── 5. --dry-run 파일 미생성 ── */
{
  const dir = tmpProject()
  const { code, summary } = runAlign(dir, ['--dry-run'])
  const noFiles = !existsSync(join(dir, 'timeline.json')) && !existsSync(join(dir, 'align-report.json')) &&
    !existsSync(join(dir, 'audio', 'narration-master.wav')) && !existsSync(join(dir, 'audio', 'words.json'))
  record('dry-run-no-files', code === 0 && (summary?.dry_run ?? false) && noFiles,
    `exit=${code} dry_run=${summary?.dry_run} 파일미생성=${noFiles}`)
  rmSync(dir, { recursive: true, force: true })
}

/* ── 6. 청취 검사 타임코드(사람 판정) ── */
const dur = timeline.sentences.length ? timeline.sentences[timeline.sentences.length - 1]!.end : 0
const SAMPLES = 3
const samples: string[] = []
for (let i = 0; i < SAMPLES; i++) {
  const at = Number(((dur / SAMPLES) * i).toFixed(2))
  samples.push(`${at}s~${Number(Math.min(dur, at + 30).toFixed(2))}s`)
}
process.stderr.write(`\n[human_required] 청취 검사(자동 통과 금지) — narration-master.wav 다음 구간에서 클릭·펌핑 확인:\n  ${samples.join('  ')}\n`)

/* ── 마감 ── */
const passCount = checks.filter((c) => c.pass).length
const allPass = passCount === checks.length
console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks, listening_samples: samples, listening_verdict: 'human_required' }))
process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}  (청취: human_required)\n`)
if (!allPass) process.exitCode = 1
