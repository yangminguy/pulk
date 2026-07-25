/**
 * verify-ingest.ts — T7b 완료 조건 자동 판정
 *
 * ffmpeg 로 테스트 영상 3개(가로 2 + 세로 1) 생성 → ingest 등록 → 검증:
 *  - catalog.json 생성 + 3개 등록 + kind:"a_roll"
 *  - 파일이 sources/a-roll/ 로 실제 복사됨
 *  - 세로 영상 1건 경고 발생(원본 가로 프레이밍 유지)
 *  - probe 값(해상도·fps) 정확성 — 특히 30000/1001 → 29.97
 *  - 재실행 시 멱등(같은 해시 3건 skip, catalog 중복 없음)
 *
 * 실행:  npx tsx scripts/verify-ingest.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { runIngest } from '../src/commands/ingest.js'
import { ffmpegBin } from '../src/lib/probe.js'

const ROOT = resolve(import.meta.dirname, '..')
const BASE = resolve(ROOT, 'fixtures', 'ingest')
const FOOTAGE = join(BASE, 'footage')
const PROJECT = join(BASE, 'project')

interface Entry {
  source_id: string
  title: string
  kind: string
  rights_status: string
  width: number
  height: number
  fps: number
  duration: number
  framing: string
  local_path: string
  content_hash: string
}

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

/** testsrc 로 결정론적 영상 생성. 크기가 서로 달라 내용 해시가 모두 구별된다. */
function genVideo(name: string, size: string, rate: string, durSec: number): void {
  const out = join(FOOTAGE, name)
  const r = spawnSync(
    ffmpegBin(),
    ['-y', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=${rate}:duration=${durSec}`, '-pix_fmt', 'yuv420p', out],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    process.stderr.write(`${r.stderr ?? ''}\n`)
    throw new Error(`ffmpeg 테스트 영상 생성 실패: ${name}`)
  }
}

function readCatalog(): Entry[] {
  return JSON.parse(readFileSync(join(PROJECT, 'sources', 'catalog.json'), 'utf8')) as Entry[]
}

async function main(): Promise<void> {
  // ── 준비: 클린 + 테스트 영상 3개 ──
  rmSync(BASE, { recursive: true, force: true })
  mkdirSync(FOOTAGE, { recursive: true })
  mkdirSync(PROJECT, { recursive: true })
  genVideo('landscape_a.mp4', '1280x720', '30', 1)
  genVideo('landscape_b.mp4', '1920x1080', '30000/1001', 1) // fps 29.97 검증용
  genVideo('portrait_c.mp4', '1080x1920', '30', 1) // 세로 → 경고 기대

  // ── 1차 실행 ──
  const r1 = await runIngest({ projectDir: PROJECT, aRollDir: FOOTAGE })
  const catalogPath = join(PROJECT, 'sources', 'catalog.json')
  const cat1 = readCatalog()

  record('catalog-created', existsSync(catalogPath), `${catalogPath}`)
  record('three-registered', r1.report.processed === 3 && cat1.length === 3, `processed=${r1.report.processed} catalog=${cat1.length}`)
  record('all-kind-a_roll', cat1.every((e) => e.kind === 'a_roll'), `kinds=${cat1.map((e) => e.kind).join(',')}`)
  record('all-rights-owned', cat1.every((e) => e.rights_status === 'owned'), `rights=${cat1.map((e) => e.rights_status).join(',')}`)
  record('files-copied', cat1.every((e) => existsSync(join(PROJECT, e.local_path))), `paths=${cat1.map((e) => e.local_path).join(',')}`)
  record('exit-0', r1.exitCode === 0, `exitCode=${r1.exitCode}`)

  // 세로 경고
  const portraitWarn = r1.report.warnings.length === 1
  record('portrait-warning', portraitWarn, `warnings=${r1.report.warnings.length} (${r1.report.warnings.map((w) => w.source_id).join(',')})`)

  // probe 정확성
  const la = cat1.find((e) => e.title === 'landscape_a')
  const lb = cat1.find((e) => e.title === 'landscape_b')
  const pc = cat1.find((e) => e.title === 'portrait_c')
  record('probe-landscape_a', la !== undefined && la.width === 1280 && la.height === 720 && la.framing === 'landscape', la ? `${la.width}x${la.height} ${la.framing}` : 'missing')
  record('probe-fps-29.97', lb !== undefined && Math.abs(lb.fps - 30000 / 1001) < 0.01, lb ? `fps=${lb.fps}` : 'missing')
  record('probe-portrait', pc !== undefined && pc.width === 1080 && pc.height === 1920 && pc.framing === 'portrait', pc ? `${pc.width}x${pc.height} ${pc.framing}` : 'missing')
  record('probe-duration', la !== undefined && la.duration > 0.5 && la.duration < 2, la ? `dur=${la.duration}` : 'missing')

  // ── 2차 실행: 멱등 ──
  const r2 = await runIngest({ projectDir: PROJECT, aRollDir: FOOTAGE })
  const cat2 = readCatalog()
  record('idempotent-skip', r2.report.skipped === 3 && r2.report.processed === 0, `skip=${r2.report.skipped} processed=${r2.report.processed}`)
  record('idempotent-no-dup', cat2.length === 3, `catalog=${cat2.length}`)

  // ── 마감 ──
  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
  if (!allPass) process.exitCode = 1
}

main().catch((err: unknown) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`)
  process.exitCode = 1
})
