/**
 * ingest.ts — A-roll(진행자 촬영분) 로컬 등록 (T7b)
 *
 *   pipeline ingest --project <dir> --a-roll <촬영폴더>
 *
 * CONTRACTS §1: `sources/a-roll/` + catalog `kind:"a_roll"` 의 유일 작성자가 ingest 다.
 *  - 촬영폴더의 영상 파일을 projects/<slug>/sources/a-roll/ 로 복사 등록
 *  - sources/catalog.json 에 kind:"a_roll" 항목 기입(없으면 생성, 있으면 병합)
 *  - 멱등: 같은 파일 내용 해시가 이미 있으면 skip(중복 id 부여 금지)
 *  - probe 로 해상도·fps·길이 기록. 세로 영상은 경고(원본 가로 프레이밍 유지, 세로 블러 금지)
 *  - stdout JSON 한 덩어리(report.ts 형식) · 진행 로그 stderr · blocked 있으면 exit 1
 *
 * 수치 하드코딩 금지. probe 타임아웃은 profile.harvest.timeout_sec.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, statSync } from 'node:fs'
import { resolve, join, extname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadProfile } from '../lib/profile.js'
import { probeMedia } from '../lib/probe.js'
import { writeAtomic } from '../lib/io.js'
import { sha256File } from '../lib/canonical.js'
import { newReport, finalizeReport, type PartialReport, type FailureItem } from '../lib/report.js'
import { InputError } from './validate.js'

const VIDEO_EXTS = ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi'] // 등록 대상 영상 확장자
const AROLL_KIND = 'a_roll'
const AROLL_RIGHTS = 'owned' // 진행자 촬영분 = 자체 촬영(소유)
const ID_PAD = 3 // @unit aroll_NNN 순번 자리수
const LOG_DP = 2 // @unit 로그/사람표 표기 소수 자릿수

export interface IngestOptions {
  projectDir: string
  aRollDir: string
  human?: boolean
  dryRun?: boolean
}

export interface RegisteredItem {
  source_id: string
  file: string
  width: number
  height: number
  fps: number
  duration: number
  framing: string
}

export interface IngestWarning {
  source_id: string
  file: string
  reason: string
}

export interface IngestReport extends PartialReport {
  catalog_count: number
  registered: RegisteredItem[]
  warnings: IngestWarning[]
}

export interface IngestResult {
  report: IngestReport
  human: string
  exitCode: number
}

interface CatalogEntry {
  source_id: string
  kind?: string
  content_hash?: string
  [key: string]: unknown
}

function isVideo(name: string): boolean {
  return VIDEO_EXTS.includes(extname(name).toLowerCase())
}

/** 기존 aroll_NNN 최대 순번 + 1. harvest 의 src_NNN 과 네임스페이스가 달라 충돌하지 않는다. */
function nextIndex(catalog: CatalogEntry[]): number {
  let max = 0
  for (const e of catalog) {
    const m = /^aroll_(\d+)$/.exec(e.source_id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const projectDir = resolve(opts.projectDir)
  const aRollDir = resolve(opts.aRollDir)
  if (!existsSync(aRollDir) || !statSync(aRollDir).isDirectory()) {
    throw new InputError(`--a-roll 폴더 없음/폴더 아님: ${aRollDir}`)
  }
  const profile = loadProfile(projectDir, { bootstrap: true })
  const timeoutSec = profile.harvest.timeout_sec

  const sourcesDir = join(projectDir, 'sources')
  const aRollOut = join(sourcesDir, 'a-roll')
  const catalogPath = join(sourcesDir, 'catalog.json')

  // 기존 catalog 로드. 배열 또는 {sources:[...]} 두 형태 모두 보존한다.
  let catalog: CatalogEntry[] = []
  let wrapper: Record<string, unknown> | null = null
  if (existsSync(catalogPath)) {
    const raw: unknown = JSON.parse(readFileSync(catalogPath, 'utf8'))
    if (Array.isArray(raw)) {
      catalog = raw as CatalogEntry[]
    } else if (raw !== null && typeof raw === 'object' && Array.isArray((raw as { sources?: unknown }).sources)) {
      wrapper = raw as Record<string, unknown>
      catalog = (raw as { sources: CatalogEntry[] }).sources
    } else {
      throw new InputError(`catalog.json 형식 오류(배열 또는 {sources:[]} 아님): ${catalogPath}`)
    }
  }
  const seenHashes = new Set(
    catalog.filter((e) => e.kind === AROLL_KIND && typeof e.content_hash === 'string').map((e) => e.content_hash as string),
  )

  const report: IngestReport = { ...newReport(), catalog_count: catalog.length, registered: [], warnings: [] }

  const files = readdirSync(aRollDir).filter(isVideo).sort()
  let idx = nextIndex(catalog)
  if (!opts.dryRun) mkdirSync(aRollOut, { recursive: true })

  for (const name of files) {
    const src = join(aRollDir, name)
    const hash = sha256File(src)
    if (seenHashes.has(hash)) {
      report.skipped += 1
      process.stderr.write(`[skip] 동일 해시 이미 등록됨: ${name}\n`)
      continue
    }
    const sourceId = `aroll_${String(idx).padStart(ID_PAD, '0')}`
    const ext = extname(name).toLowerCase()
    const rel = join('sources', 'a-roll', `${sourceId}${ext}`)
    const dest = join(projectDir, rel)

    if (!opts.dryRun) copyFileSync(src, dest)
    const probe = await probeMedia(opts.dryRun ? src : dest, timeoutSec)
    if (probe === null) {
      const item: FailureItem = { reason: `probe 실패(ffprobe 판독 불가): ${name}`, action_required: true }
      report.failed.push(item)
      process.stderr.write(`[fail] probe 실패: ${name}\n`)
      continue
    }

    const framing = probe.height > probe.width ? 'portrait' : 'landscape'
    if (framing === 'portrait') {
      report.warnings.push({
        source_id: sourceId,
        file: rel,
        reason: `세로 영상 ${probe.width}x${probe.height} — 원본 가로 프레이밍 유지 원칙 위반(세로 블러 금지)`,
      })
      process.stderr.write(`[warn] 세로 영상: ${name} (${probe.width}x${probe.height})\n`)
    }

    catalog.push({
      source_id: sourceId,
      title: basename(name, ext),
      publisher: 'self',
      original_url: pathToFileURL(dest).href,
      kind: AROLL_KIND,
      rights_status: AROLL_RIGHTS,
      duration: probe.durationSec,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      framing,
      local_path: rel,
      content_hash: hash,
      is_official: false,
      has_transcript: false,
    })
    seenHashes.add(hash)
    report.registered.push({ source_id: sourceId, file: rel, width: probe.width, height: probe.height, fps: probe.fps, duration: probe.durationSec, framing })
    report.processed += 1
    idx += 1
    process.stderr.write(`[ok] 등록: ${name} → ${rel} (${probe.width}x${probe.height} @${probe.fps.toFixed(LOG_DP)}fps ${probe.durationSec.toFixed(LOG_DP)}s)\n`)
  }

  report.catalog_count = catalog.length
  if (!opts.dryRun) writeAtomic(catalogPath, wrapper !== null ? { ...wrapper, sources: catalog } : catalog)

  const { exitCode } = finalizeReport(report)
  return { report, human: formatHuman(report), exitCode }
}

function formatHuman(r: IngestReport): string {
  const lines: string[] = ['', `■ ingest — ok=${r.ok} 등록=${r.processed} skip=${r.skipped} fail=${r.failed.length} catalog=${r.catalog_count}`]
  for (const e of r.registered) lines.push(`  + ${e.source_id} ${e.file} ${e.width}x${e.height} @${e.fps.toFixed(LOG_DP)}fps ${e.duration.toFixed(LOG_DP)}s [${e.framing}]`)
  for (const w of r.warnings) lines.push(`  ! ${w.source_id} ${w.reason}`)
  for (const f of r.failed) lines.push(`  x ${f.reason}`)
  lines.push('')
  return lines.join('\n')
}
