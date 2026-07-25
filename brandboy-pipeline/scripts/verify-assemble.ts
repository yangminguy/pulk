/**
 * verify-assemble.ts — T5(assemble) 완료 조건 자동 판정. **네트워크 0**(ffmpeg 더미 미디어).
 *
 * fixtures/assemble/make-fixtures.ts 로 조립 입력을 만들고 runAssemble/buildModel/runChecks 를 돌려
 * 13개 완료 조건을 판정한다. CapCut 초안은 격리 --drafts(tmp)에 생성해 실 CapCut 폴더를 오염하지 않는다.
 *
 * 실행:  npx tsx scripts/verify-assemble.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { runAssemble } from '../src/commands/assemble.js'
import { buildModel } from '../src/assemble/model.js'
import { runChecks, type CheckResult } from '../src/assemble/checks.js'
import { planBatches } from '../src/assemble/emit-capcut.js'
import { loadProfile } from '../src/lib/profile.js'
import { ffmpegBin } from '../src/lib/probe.js'
import { buildMedia, writeFixture, mainLayout, hookFailLayout, unapprovedLayout, prelapLayout, type MediaPaths } from '../fixtures/assemble/make-fixtures.js'

const ROOT = resolve(import.meta.dirname, '..')
const CFG = resolve(ROOT, 'config')
const MEDIA = resolve(ROOT, 'fixtures', 'assemble', '.media')
const MAIN = resolve(ROOT, 'fixtures', 'assemble-project')
const TMP = resolve(ROOT, 'fixtures', 'assemble-tmp')
const CAP_DRAFTS = mkdtempSync(join(tmpdir(), 'assemble-capcut-'))

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

function checkStatus(result: CheckResult, id: string): string {
  return result.checks.find((c) => c.id === id)?.status ?? '(없음)'
}

async function main(): Promise<void> {
  const media: MediaPaths = buildMedia(MEDIA)
  const profile = loadProfile(CFG)

  /* ── 메인 픽스처: --emit both 실행 ── */
  writeFixture(MAIN, mainLayout(), { configDir: CFG, media })
  const res = await runAssemble(MAIN, { emit: ['capcut', 'numbered'], force: true, human: false, draftsDir: CAP_DRAFTS })
  const s = res.summary

  // (1) 10트랙 전부 render_report + 항목 수
  const TRACKS = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'A1', 'A2', 'A3', 'A4']
  const reportOk = existsSync(join(MAIN, 'render_report.json'))
  const allTracks = TRACKS.every((t) => t in s.track_counts)
  const populated = ['V1', 'V4', 'V5', 'V6', 'A1'].every((t) => (s.track_counts as Record<string, number>)[t]! > 0)
  record('1-ten-tracks-report', reportOk && allTracks && populated,
    `report=${reportOk} 트랙=${Object.entries(s.track_counts).map(([k, v]) => `${k}:${v}`).join(' ')}`)

  // (4) 루프 0·미승인 0·깨진 소스 0·V15/V17b/V18 0
  const blockingIds = ['no-unapproved-shot', 'V15-critical-anchor', 'V17b-lane-overlap', 'V18-still-photo-motion', 'no-video-loop', 'no-broken-source', 'critical-beat-has-shot']
  const allBlockingPass = blockingIds.every((id) => checkStatus(s.checks, id) === 'pass')
  record('4-blocking-checks-clean', allBlockingPass && !s.checks.blocked,
    blockingIds.map((id) => `${id}=${checkStatus(s.checks, id)}`).join(' '))

  // (2) 경로 C 파일 수·순번 연속성
  const numDir = join(MAIN, 'assemble', 'numbered')
  const numFiles = existsSync(numDir) ? readdirSync(numDir).filter((f) => /^\d{4}_.*\.mp4$/.test(f)).sort() : []
  const seqs = numFiles.map((f) => Number(f.slice(0, 4)))
  const contiguous = seqs.every((n, i) => n === i + 1)
  const numberedStatus = s.outputs.numbered?.status
  record('2-numbered-sequence', numberedStatus === 'ok' && numFiles.length > 0 && contiguous,
    `status=${numberedStatus} 파일=${numFiles.length} 연속=${contiguous} srt=${existsSync(join(numDir, 'captions.srt'))} assembly=${existsSync(join(numDir, 'ASSEMBLY.md'))}`)

  // (3) 경로 A: 초안 생성 + draft_content.json + lint clean
  const cap = s.outputs.capcut
  record('3-capcut-draft-lint', cap !== undefined && cap.draft_content_exists && cap.lint_clean,
    `status=${cap?.status} draft_content=${cap?.draft_content_exists} lint_clean=${cap?.lint_clean} (${cap?.lint_detail}) 육안=human_required`)

  // (5) 사진 2장: parallax mov 얹기 + zoompan 렌더, 정지 0
  const workDir = join(MAIN, 'assemble', 'work')
  const zoompanRendered = existsSync(workDir) && readdirSync(workDir).some((f) => f.includes('sh0008') && f.endsWith('.mp4'))
  const parallaxClip = numFiles.some((f) => f.includes('sh0005'))
  const zoompanClip = numFiles.some((f) => f.includes('sh0008'))
  const v18 = checkStatus(s.checks, 'V18-still-photo-motion')
  record('5-photo-parallax-zoompan', zoompanRendered && parallaxClip && zoompanClip && v18 === 'pass',
    `zoompan렌더=${zoompanRendered} parallax순번=${parallaxClip} zoompan순번=${zoompanClip} V18=${v18}`)

  // (6) 총 길이 ±0.2
  const totalLen = checkStatus(s.checks, 'total-length-vs-master')
  record('6-total-length', totalLen === 'pass', `total-length=${totalLen} 조립=${s.duration}s 마스터=${s.narration_master_sec}s`)

  // (8) usage.json → V6 출처 자동 생성
  record('8-usage-to-v6', s.usage_credits > 0 && s.track_counts.V6 > 0, `usage_credits=${s.usage_credits} V6=${s.track_counts.V6}`)

  // (9) 막 경계 음악 큐 + sound-cues
  const musicOk = existsSync(join(MAIN, 'music-cues.json')) && s.music_cues === 2 && checkStatus(s.checks, 'act-boundary-music') === 'pass'
  const soundOk = existsSync(join(MAIN, 'sound-cues.json')) && s.sound_cues > 0
  record('9-cues', musicOk && soundOk, `music_cues=${s.music_cues}(act경계=${checkStatus(s.checks, 'act-boundary-music')}) sound_cues=${s.sound_cues}`)

  // (11) --emit both 개별 상태
  record('11-emit-both-status', s.outputs.capcut !== undefined && s.outputs.numbered !== undefined,
    `capcut=${s.outputs.capcut?.status} numbered=${s.outputs.numbered?.status}`)

  // human_required 존재
  record('human-required-present', s.human_required.includes('capcut-visual-open'), `human_required=${s.human_required.join(',')}`)

  /* ── (10) 400샷 배치 분할(경계값 시뮬) ── */
  const b400 = planBatches(400, 400)
  const b401 = planBatches(401, 400)
  record('10-batch-split', b400.length === 1 && b401.length === 2, `400→${b400.length}배치 401→${b401.length}배치`)

  /* ── (7) 훅 30초 미달 픽스처 → 실패 ── */
  const hookDir = join(TMP, 'hook-fail')
  writeFixture(hookDir, hookFailLayout(), { configDir: CFG, media })
  const hookRes = await runAssemble(hookDir, { emit: ['capcut', 'numbered'], force: true, human: false, draftsDir: CAP_DRAFTS })
  record('7-hook-under-min-fails', hookRes.exitCode === 1 && hookRes.summary.checks.blocked && checkStatus(hookRes.summary.checks, 'hook-visual-changes') === 'fail',
    `exit=${hookRes.exitCode} blocked=${hookRes.summary.checks.blocked} hook=${checkStatus(hookRes.summary.checks, 'hook-visual-changes')} 변화수=${hookRes.summary.checks.checks.find((c) => c.id === 'hook-visual-changes')?.detail}`)

  /* ── 미승인 샷 검사 발동(4 보강) ── */
  const unapDir = join(TMP, 'unapproved')
  writeFixture(unapDir, unapprovedLayout(), { configDir: CFG, media })
  const unapProfile = loadProfile(unapDir)
  const unapModel = await buildModel(unapDir, unapProfile, {})
  const unapChecks = runChecks(unapModel, unapProfile)
  record('4b-unapproved-fires', checkStatus(unapChecks, 'no-unapproved-shot') === 'fail' && unapChecks.blocked,
    `unapproved=${checkStatus(unapChecks, 'no-unapproved-shot')} 미승인=${unapModel.unapproved.map((u) => u.shot_id).join(',')}`)

  /* ── (13) 선행 컷 V17b: 0.5 통과 / 0.6 실패 ── */
  const passDir = join(TMP, 'prelap-pass')
  const failDir = join(TMP, 'prelap-fail')
  writeFixture(passDir, prelapLayout(0.5), { configDir: CFG, media })
  writeFixture(failDir, prelapLayout(0.6), { configDir: CFG, media })
  const passModel = await buildModel(passDir, loadProfile(passDir), {})
  const failModel = await buildModel(failDir, loadProfile(failDir), {})
  const passV17b = checkStatus(runChecks(passModel, loadProfile(passDir)), 'V17b-lane-overlap')
  const failCheck = runChecks(failModel, loadProfile(failDir))
  const failV17b = checkStatus(failCheck, 'V17b-lane-overlap')
  record('13-prelap-v17b', passV17b === 'pass' && failV17b === 'fail' && failCheck.blocked,
    `0.5초→V17b=${passV17b} 0.6초→V17b=${failV17b}(blocked=${failCheck.blocked})`)

  /* ── (12) --pilot spine: 마스터 비절단 + 구간 길이 일치 ── */
  writeFixture(MAIN, mainLayout(), { configDir: CFG, media }) // 리셋(앞 실행이 report 덮음)
  writeFileSync(join(MAIN, 'pilot.json'), JSON.stringify({ spine: { from_sentence_key: 'aaaa0001', to_sentence_key: 'bbbb0002', target_sec: [20, 40] } }))
  const spineModel = await buildModel(MAIN, loadProfile(MAIN), { spineKeys: { from: 'aaaa0001', to: 'bbbb0002' } })
  const a1 = spineModel.tracks.A1[0]!
  const region = (a1.source_out ?? 0) - (a1.source_in ?? 0)
  const spineChecks = runChecks(spineModel, loadProfile(MAIN))
  // 마스터 원본은 40s 전체 그대로(비절단). ffprobe 로 실측.
  const masterProbe = spawnSync(ffmpegBin().replace('ffmpeg', 'ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', join(MAIN, 'audio', 'narration-master.wav')], { encoding: 'utf8' })
  const masterFull = Number((masterProbe.stdout ?? '0').trim())
  const spineRes = await runAssemble(MAIN, { emit: ['numbered'], pilotPath: join(MAIN, 'pilot.json'), force: true, human: false })
  const spineLenOk = Math.abs(spineModel.duration - region) <= profile.captions.impact_card.sync_tolerance_sec && Math.abs(spineModel.duration - 28) <= profile.captions.impact_card.sync_tolerance_sec
  const masterUncut = a1.source_in === 0 && Math.abs(masterFull - 40) <= profile.captions.impact_card.sync_tolerance_sec
  record('12-pilot-spine', spineModel.is_spine && spineLenOk && masterUncut && checkStatus(spineChecks, 'total-length-vs-master') === 'pass' && spineRes.exitCode === 0,
    `is_spine=${spineModel.is_spine} spine길이=${spineModel.duration}s 구간=${region}s 마스터전체=${masterFull}s(비절단) total=${checkStatus(spineChecks, 'total-length-vs-master')} exit=${spineRes.exitCode}`)

  /* ── 마감 ── */
  rmSync(TMP, { recursive: true, force: true })
  rmSync(CAP_DRAFTS, { recursive: true, force: true })
  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
  if (!allPass) process.exitCode = 1
}

main().catch((err: unknown) => {
  process.stderr.write(`verify-assemble 예외: ${(err as Error).stack ?? String(err)}\n`)
  process.exitCode = 1
})
