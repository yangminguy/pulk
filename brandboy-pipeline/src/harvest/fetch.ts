/**
 * fetch.ts — 승인 구간 고화질 수급 (T7 Part B 3단계, 스토리보드 승인 후)
 *
 * shot-plan.json 에서 selection_status="approved" 인 샷의 source_in/out 구간만 원해상도로 받아
 *  - sources/originals/ 에 보존(프로젝트 종료까지 — 마감에서 인·아웃 변경 대비)
 *  - assets/selected/manifest.json 에 shot_id 조인용 매핑 기록
 * **shot-plan.json 을 쓰지 않는다.** assemble 이 manifest 를 shot_id 로 조인한다(소유권 위반 회피).
 *
 * 수치 하드코딩 금지: timeout 은 profile 에서 온다. 원해상도이므로 height 캡 없음.
 */
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { writeAtomic } from '../lib/io.js'
import { fetchHires } from './proxy.js'
import type { HarvestAdapter, HarvestEnv, HiresRequest } from './types.js'

export interface CatalogSource {
  source_id: string
  original_url?: string
  local_path?: string
  kind?: string
  rights_status?: string
}

export interface HiresManifestItem {
  shot_id: string
  source_id: string
  source_in: number
  source_out: number
  file: string // sources/originals/ 상대경로
  rights_status: string
  probe_ok: boolean
}

export interface HiresResult {
  manifestPath: string
  items: HiresManifestItem[]
  downloaded: number
  skipped: number
  failed: { shot_id: string; reason: string }[]
}

interface ApprovedShot {
  shot_id: string
  source_id?: string
  source_in?: number
  source_out?: number
  selection_status: string
  rights_status?: string
}

export interface HiresArgs {
  projectDir: string
  timeoutSec: number
  env: HarvestEnv
  sources: Map<string, CatalogSource>
  pickAdapter: (source: CatalogSource) => HarvestAdapter | undefined
  only: Set<string> // beat 범위 — 비어있으면 전체(hires 는 shot 기준이므로 참고용)
}

function originalRel(sourceId: string, inSec: number, outSec: number): string {
  return join('sources', 'originals', `${sourceId}_${inSec}-${outSec}.mp4`)
}

export async function runHires(args: HiresArgs): Promise<HiresResult> {
  const planPath = resolve(args.projectDir, 'shot-plan.json')
  if (!existsSync(planPath)) throw new Error(`shot-plan.json 없음(plan 이 먼저 실행돼야 함): ${planPath}`)
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as { shots?: ApprovedShot[] }
  const approved = (plan.shots ?? []).filter((s) => s.selection_status === 'approved' && s.source_id !== undefined && s.source_in !== undefined && s.source_out !== undefined)

  const items: HiresManifestItem[] = []
  const failed: { shot_id: string; reason: string }[] = []
  let downloaded = 0
  let skipped = 0

  for (const shot of approved) {
    const source = args.sources.get(shot.source_id!)
    if (source === undefined) {
      failed.push({ shot_id: shot.shot_id, reason: `카탈로그에 source_id 없음: ${shot.source_id}` })
      continue
    }
    const rel = originalRel(shot.source_id!, shot.source_in!, shot.source_out!)
    const outPath = resolve(args.projectDir, rel)
    const req: HiresRequest = {
      source_id: shot.source_id!,
      original_url: source.original_url ?? '',
      local_path: source.local_path !== undefined ? resolve(args.projectDir, source.local_path) : undefined,
      in_sec: shot.source_in!,
      out_sec: shot.source_out!,
      timeoutSec: args.timeoutSec,
      outPath,
    }
    const outcome = await fetchHires(req, args.pickAdapter(source), args.env)
    if (!outcome.ok) {
      failed.push({ shot_id: shot.shot_id, reason: outcome.error ?? '고화질 다운로드 실패' })
      continue
    }
    if (outcome.skipped) skipped++
    else downloaded++
    items.push({
      shot_id: shot.shot_id,
      source_id: shot.source_id!,
      source_in: shot.source_in!,
      source_out: shot.source_out!,
      file: rel,
      rights_status: source.rights_status ?? shot.rights_status ?? 'unknown',
      probe_ok: outcome.probe_ok,
    })
  }

  const selectedDir = resolve(args.projectDir, 'assets', 'selected')
  mkdirSync(selectedDir, { recursive: true })
  const manifestPath = join(selectedDir, 'manifest.json')
  writeAtomic(manifestPath, { items })
  return { manifestPath, items, downloaded, skipped, failed }
}
