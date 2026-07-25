/**
 * reanchor.ts — 시각 재고정 (T3, CONTRACTS §2)
 *
 * align-remap.json(status 6종) + 새 timeline.json 을 읽어 shot-plan.json 의 Z3(시각)만
 * writeScoped('Z3') 로 다시 쓴다. source_in/out·locked_selection 은 절대 건드리지 않는다
 * (io.ts 가 구역 밖 변경을 abort 로 강제한다).
 *
 * CONTRACTS §2 처리 규칙:
 *  unchanged·shifted → offset 유지, start/end 평행이동, timing_rev 갱신
 *  rescaled·edited   → 기계적 재계산 금지. needs_review=true, timing_rev 미갱신 (Z2 보존)
 *  removed           → orphaned=true. 샷 삭제 금지, timing_rev 미갱신
 *  added             → 비트 없음 → plan_rerun_required[] 보고
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeScoped, type MutableDoc } from '../lib/io.js'
import { InputError, readJsonOrThrow } from './validate.js'

const DECIMALS = 3 // @unit 시각 소수 3자리
function round3(n: number): number {
  return Number(n.toFixed(DECIMALS))
}

type Status = 'unchanged' | 'shifted' | 'rescaled' | 'edited' | 'added' | 'removed'

export interface ReanchorOptions {
  only: string[] // beat_id
  human: boolean
}

export interface ReanchorSummary {
  ok: boolean
  align_rev: number
  counts: Record<Status, number>
  needs_review: string[]
  orphaned: string[]
  reanchored: string[]
  plan_rerun_required: { sentence_key: string; start: number; end: number }[]
}

interface Anchor {
  sentence_key: string
  offset_sec: number
}

export function runReanchor(projectDir: string, opts: ReanchorOptions): { summary: ReanchorSummary; exitCode: number } {
  const planPath = resolve(projectDir, 'shot-plan.json')
  if (!existsSync(planPath)) throw new InputError(`shot-plan.json 없음(plan 이 먼저 실행돼야 함): ${planPath}`)
  const remapRaw = readJsonOrThrow(resolve(projectDir, 'align-remap.json'), 'align-remap.json') as { align_rev?: number; sentences?: { key: string; status: Status }[] }
  const timelineRaw = readJsonOrThrow(resolve(projectDir, 'timeline.json'), 'timeline.json') as { align_rev?: number; sentences?: { sentence_key: string; start: number; end: number }[] }

  const alignRev = timelineRaw.align_rev ?? remapRaw.align_rev ?? 0
  const statusByKey = new Map<string, Status>((remapRaw.sentences ?? []).map((s) => [s.key, s.status]))
  const sentStart = new Map<string, number>((timelineRaw.sentences ?? []).map((s) => [s.sentence_key, s.start]))

  const onlyBeats = new Set(opts.only)
  const inScopeBeat = (beatIds: string[]): boolean => onlyBeats.size === 0 || beatIds.some((b) => onlyBeats.has(b))

  const counts: Record<Status, number> = { unchanged: 0, shifted: 0, rescaled: 0, edited: 0, added: 0, removed: 0 }
  const needsReview: string[] = []
  const orphanedList: string[] = []
  const reanchored: string[] = []

  // status 결정: remap 우선, 없으면 timeline 존재=unchanged / 부재=removed
  const statusFor = (key: string): Status => {
    const s = statusByKey.get(key)
    if (s) return s
    return sentStart.has(key) ? 'unchanged' : 'removed'
  }

  writeScoped(planPath, 'Z3', (doc: MutableDoc) => {
    // 비트: start/end/timing_rev (needs_review/orphaned 필드 없음)
    for (const b of doc.beats) {
      const anchor = b['anchor'] as Anchor | undefined
      if (!anchor) continue
      if (!inScopeBeat([String(b['beat_id'])])) continue
      const st = statusFor(anchor.sentence_key)
      if (st === 'unchanged' || st === 'shifted') {
        const base = sentStart.get(anchor.sentence_key)
        if (base === undefined) continue
        const oldStart = Number(b['start'])
        const oldEnd = Number(b['end'])
        const dur = oldEnd - oldStart
        const newStart = round3(base + anchor.offset_sec)
        b['start'] = newStart
        b['end'] = round3(newStart + dur)
        b['timing_rev'] = alignRev
      }
      // rescaled·edited·removed: 비트 시각/timing_rev 미변경
    }

    // 샷: start/end/timing_rev/needs_review/orphaned
    for (const s of doc.shots) {
      const anchor = s['anchor'] as Anchor | undefined
      if (!anchor) continue
      const beatIds = (s['beat_ids'] as string[] | undefined) ?? []
      if (!inScopeBeat(beatIds)) continue
      const key = anchor.sentence_key
      const st = statusFor(key)
      counts[st]++
      const shotId = String(s['shot_id'])
      if (st === 'unchanged' || st === 'shifted') {
        const base = sentStart.get(key)
        if (base === undefined) continue
        const oldStart = Number(s['start'])
        const oldEnd = Number(s['end'])
        const dur = oldEnd - oldStart
        const newStart = round3(base + anchor.offset_sec)
        s['start'] = newStart
        s['end'] = round3(newStart + dur)
        s['timing_rev'] = alignRev
        delete s['needs_review']
        delete s['orphaned']
        reanchored.push(shotId)
      } else if (st === 'rescaled' || st === 'edited') {
        // 기계적 재계산 금지 — 검수로. start/end/timing_rev 미변경
        s['needs_review'] = true
        needsReview.push(shotId)
      } else if (st === 'removed') {
        s['orphaned'] = true
        orphanedList.push(shotId)
      }
      // added: 앵커할 샷이 없다(added 문장엔 비트가 아직 없음) → 아래 plan_rerun 에서 보고
    }
  })

  // added → plan_rerun_required (비트 생성 필요 구간)
  const planRerun = (remapRaw.sentences ?? [])
    .filter((s) => s.status === 'added')
    .map((s) => {
      const tl = (timelineRaw.sentences ?? []).find((t) => t.sentence_key === s.key)
      counts.added++
      return { sentence_key: s.key, start: tl?.start ?? 0, end: tl?.end ?? 0 }
    })

  const summary: ReanchorSummary = {
    ok: true, align_rev: alignRev, counts,
    needs_review: needsReview, orphaned: orphanedList, reanchored, plan_rerun_required: planRerun,
  }
  if (opts.human) {
    process.stderr.write(`\n■ reanchor — align_rev=${alignRev}\n`)
    process.stderr.write(`  counts=${JSON.stringify(counts)}\n`)
    process.stderr.write(`  reanchored=${reanchored.length} needs_review=${needsReview.length} orphaned=${orphanedList.length} plan_rerun=${planRerun.length}\n`)
  }
  return { summary, exitCode: 0 }
}
