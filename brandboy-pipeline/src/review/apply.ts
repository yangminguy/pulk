/**
 * apply.ts — review --apply: 결정 로그 → shot-plan.json Z2 병합 + usage.json (T4 · CONTRACTS §1)
 *
 * 여러 결정 파일을 타임스탬프 순차 적용(같은 shot_id 중복은 나중 승리). 적용 전 revision 대조 →
 * 불일치 시 거부 + diff(--force 로만 강행). Z2 필드만 writeScoped('Z2') 로 병합하므로 Z1/Z3 는
 * io.ts 가 abort 로 보호한다. usage.json 은 review --apply 가 유일 작성자(assemble 출처 생성용).
 *
 * 키→Z2 매핑(CONTRACTS §1):
 *  A → asset_kind:"a_roll"  ·  C → asset_kind:"caption_card" + emphasis_caption 확정
 *  M → photo_motion 확정(기본 parallax 유지 시에도 명시)  ·  [ ] → locked_selection:true
 *  locked_selection=true 기존 선택은 --force 없이 덮어쓰지 않는다(spec/05:133).
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import { z } from 'zod'
import { writeScoped, writeAtomic, type MutableDoc } from '../lib/io.js'
import { loadProfile, type EditProfile } from '../lib/profile.js'
import { InputError } from '../commands/validate.js'

const DECIMALS = 3 // @unit 시각 소수 3자리 고정(canonical 규약과 일치)
const FOCAL_CENTER = 0.5 // @unit 사진 초점 기본값(정규화 중앙)

function round3(n: number): number {
  return Number(n.toFixed(DECIMALS))
}

/* ─────────────── 결정 로그 스키마 ─────────────── */

const Decision = z.object({
  shot_id: z.string(),
  source_id: z.string().optional(),
  source_in: z.number().optional(),
  source_out: z.number().optional(),
  file: z.string().optional(),
  selection_status: z.string().optional(),
  rights_status: z.string().optional(),
  asset_kind: z.string().optional(),
  source_audio: z.string().optional(),
  source_audio_in: z.number().optional(),
  source_audio_out: z.number().optional(),
  photo_motion: z.object({ type: z.string() }).optional(),
  emphasis_caption: z.string().optional(),
  locked_selection: z.boolean().optional(),
  flag: z.string().optional(), // research/script_fix — Z2 아님, 병합에서 무시
})
type Decision = z.infer<typeof Decision>

const DecisionLog = z.object({
  revision: z.number().int().nonnegative(),
  generated_at: z.string().optional(),
  decisions: z.array(Decision),
})

/* ─────────────── 결과 타입 ─────────────── */

export interface ApplySummary {
  ok: boolean
  mode: 'apply'
  files: number
  revision_expected: number
  revision_actual: number[]
  applied_shots: string[]
  skipped_locked: string[]
  usage_entries: number
  rejected?: { reason: string; diff: { file: string; file_revision: number; plan_revision: number }[] }
}

interface LoadedLog {
  path: string
  revision: number
  timestamp: number
  decisions: Decision[]
}

/* ─────────────── 로드 · 정렬 ─────────────── */

/** 파일명 review-decisions-<ISO(구분자 치환)>.json 을 원래 ISO 로 복원한다. */
function filenameIso(stamp: string): string {
  const parts = stamp.split('T')
  const datePart = parts[0] ?? stamp
  const timePart = parts[1]
  if (timePart === undefined) return stamp
  // HH-MM-SS-mmm(Z) → HH:MM:SS.mmm(Z)
  const restored = timePart
    .replace(/^(\d{2})-(\d{2})-(\d{2})-(\d{3})/, '$1:$2:$3.$4')
    .replace(/^(\d{2})-(\d{2})-(\d{2})/, '$1:$2:$3')
  return `${datePart}T${restored}`
}

/** review-decisions-<ISO8601>.json 파일명 또는 generated_at 에서 타임스탬프(ms)를 뽑는다. */
function logTimestamp(path: string, generatedAt: string | undefined): number {
  if (generatedAt) {
    const t = Date.parse(generatedAt)
    if (!Number.isNaN(t)) return t
  }
  const m = basename(path).match(/review-decisions-(.+)\.json$/)
  if (m && m[1]) {
    const t = Date.parse(filenameIso(m[1]))
    if (!Number.isNaN(t)) return t
  }
  return statSync(path).mtimeMs
}

function loadLog(path: string): LoadedLog {
  if (!existsSync(path)) throw new InputError(`결정 로그 없음: ${path}`)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new InputError(`결정 로그 파싱 실패: ${path} · ${(err as Error).message}`)
  }
  const parsed = DecisionLog.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`).join(' | ')
    throw new InputError(`결정 로그 스키마 위반 (${path}) — ${issues}`)
  }
  return { path, revision: parsed.data.revision, timestamp: logTimestamp(path, parsed.data.generated_at), decisions: parsed.data.decisions }
}

/* ─────────────── 병합(순수) ─────────────── */

/** 타임스탬프 오름차순, 파일 내 배열 순서 보존으로 평탄화 → shot_id 별 필드 병합(나중 승리). */
function mergeDecisions(logs: LoadedLog[]): Map<string, Decision> {
  const ordered = logs.slice().sort((a, b) => a.timestamp - b.timestamp || a.path.localeCompare(b.path))
  const byShot = new Map<string, Decision>()
  for (const lg of ordered) {
    for (const d of lg.decisions) {
      const prev = byShot.get(d.shot_id) ?? { shot_id: d.shot_id }
      byShot.set(d.shot_id, { ...prev, ...d }) // 필드 단위 나중 승리
    }
  }
  return byShot
}

const Z2_ASSIGN = [
  'selection_status', 'source_id', 'source_in', 'source_out', 'file', 'rights_status',
  'locked_selection', 'asset_kind', 'source_audio', 'source_audio_in', 'source_audio_out', 'emphasis_caption',
] as const

/** 결정 하나를 shot 객체(Z2 필드)에 적용. photo_motion 은 image 샷에 기본 parallax 로 채운다. */
function applyToShot(shot: Record<string, unknown>, d: Decision, profile: EditProfile): void {
  for (const f of Z2_ASSIGN) {
    const v = (d as Record<string, unknown>)[f]
    if (v !== undefined) {
      shot[f] = f === 'source_in' || f === 'source_out' || f === 'source_audio_in' || f === 'source_audio_out'
        ? round3(v as number)
        : v
    }
  }
  const kind = String(shot['asset_kind'])
  if (kind === 'image' || kind === 'still') {
    const type = d.photo_motion?.type ?? profile.photo_motion.default
    const start = Number(shot['start'] ?? 0)
    const end = Number(shot['end'] ?? 0)
    const durationSec = end > start ? round3(end - start) : profile.photo_motion.min_move_sec
    shot['photo_motion'] = {
      type,
      focal: [FOCAL_CENTER, FOCAL_CENTER],
      zoom: [profile.photo_motion.zoom_range[0], profile.photo_motion.zoom_range[1]],
      duration_sec: durationSec,
    }
  }
}

/* ─────────────── usage.json ─────────────── */

interface CatalogSource { source_id: string; title?: string; publisher?: string; original_url?: string; rights_status?: string }

function buildUsage(shots: Record<string, unknown>[], catalog: Map<string, CatalogSource>): Record<string, unknown>[] {
  const usage: Record<string, unknown>[] = []
  for (const s of shots) {
    const sourceId = s['source_id']
    if (sourceId === undefined || s['source_in'] === undefined || s['source_out'] === undefined) continue
    const src = catalog.get(String(sourceId))
    const credit = src ? `${src.publisher ?? ''}${src.title ? ` · ${src.title}` : ''}`.trim() : String(sourceId)
    usage.push({
      shot_id: String(s['shot_id']),
      source_id: String(sourceId),
      source_in: round3(Number(s['source_in'])),
      source_out: round3(Number(s['source_out'])),
      video_in: round3(Number(s['start'])),
      video_out: round3(Number(s['end'])),
      credit_text: credit || String(sourceId),
      rights_status: String(s['rights_status'] ?? src?.rights_status ?? 'unknown'),
    })
  }
  return usage
}

/* ─────────────── 진입점 ─────────────── */

export interface ApplyOptions {
  applyPaths: string[]
  force: boolean
  human: boolean
}

export function applyDecisions(projectDir: string, opts: ApplyOptions): { summary: ApplySummary; exitCode: number } {
  const planPath = resolve(projectDir, 'shot-plan.json')
  if (!existsSync(planPath)) throw new InputError(`shot-plan.json 없음: ${planPath}`)
  const profile = loadProfile(projectDir, { bootstrap: true })

  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as { revision: number }
  const currentRev = plan.revision

  const logs = opts.applyPaths.map((p) => loadLog(resolve(p)))

  // revision 대조 — 불일치 파일이 하나라도 있으면 --force 없이 거부 + diff
  const mismatched = logs.filter((l) => l.revision !== currentRev)
  if (mismatched.length > 0 && !opts.force) {
    const summary: ApplySummary = {
      ok: false, mode: 'apply', files: logs.length,
      revision_expected: currentRev, revision_actual: logs.map((l) => l.revision),
      applied_shots: [], skipped_locked: [], usage_entries: 0,
      rejected: {
        reason: `revision 불일치 — shot-plan.json=${currentRev}, 로그=${mismatched.map((l) => l.revision).join(',')}. reanchor/plan 이후 review.html 을 재생성했는가? --force 로만 강행.`,
        diff: mismatched.map((l) => ({ file: basename(l.path), file_revision: l.revision, plan_revision: currentRev })),
      },
    }
    if (opts.human) {
      process.stderr.write(`\n■ review --apply 거부 — ${summary.rejected!.reason}\n`)
      for (const d of summary.rejected!.diff) process.stderr.write(`  x ${d.file}: 로그 rev ${d.file_revision} ≠ plan rev ${d.plan_revision}\n`)
    }
    return { summary, exitCode: 1 }
  }

  const merged = mergeDecisions(logs)

  // 카탈로그(usage credit 용)
  const catalogPath = resolve(projectDir, 'sources', 'catalog.json')
  const catalog = new Map<string, CatalogSource>()
  if (existsSync(catalogPath)) {
    for (const s of JSON.parse(readFileSync(catalogPath, 'utf8')) as CatalogSource[]) catalog.set(s.source_id, s)
  }

  const applied: string[] = []
  const skippedLocked: string[] = []

  writeScoped(planPath, 'Z2', (doc: MutableDoc) => {
    const byId = new Map(doc.shots.map((s) => [String(s['shot_id']), s]))
    for (const [shotId, d] of merged) {
      const shot = byId.get(shotId)
      if (shot === undefined) continue // 알 수 없는 shot_id 는 무시(Z1 소유, 여기서 생성 금지)
      if (shot['locked_selection'] === true && !opts.force) { skippedLocked.push(shotId); continue }
      applyToShot(shot, d, profile)
      applied.push(shotId)
    }
  })

  // usage.json — review --apply 유일 작성자
  const finalPlan = JSON.parse(readFileSync(planPath, 'utf8')) as { shots: Record<string, unknown>[] }
  const usage = buildUsage(finalPlan.shots, catalog)
  writeAtomic(join(projectDir, 'sources', 'usage.json'), usage)

  const summary: ApplySummary = {
    ok: true, mode: 'apply', files: logs.length,
    revision_expected: currentRev, revision_actual: logs.map((l) => l.revision),
    applied_shots: applied, skipped_locked: skippedLocked, usage_entries: usage.length,
  }
  if (opts.human) {
    process.stderr.write(`\n■ review --apply — files=${logs.length} 적용=${applied.length} locked스킵=${skippedLocked.length} usage=${usage.length}\n`)
  }
  return { summary, exitCode: 0 }
}
