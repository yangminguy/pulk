/**
 * emit-capcut.ts — 경로 A: CapCut 초안 (capcut-cli 0.15.0, spec/07:153, T5)
 *
 * capcut init 으로 초안을 만들고 트랙별로 세그먼트를 배치한다(add-video/add-audio + trim, import-srt,
 * add-text). 샷이 많으면 CLI 호출을 배치로 나눈다(planBatches). 마지막에 lint 로 정합을 확인한다.
 * 초안을 CapCut 에서 여는 육안 확인은 자동화 불가 → checks 가 human_required 로 표기한다.
 *
 * 실계약 반영(preflight/capcut-contract.txt): add-video 는 소스 in-point 를 받지 않는다 → add 후
 * trim(id, source_in, duration) 으로 소스 창을 잡는다. batch 서브커맨드는 add-* 를 지원하지 않아
 * 개별 add 호출을 배치로 묶는다.
 *
 * 수치는 profile/frame 이 유일 출처다. 아래 상수는 배치 크기 등 구조 상수(// @unit).
 */
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { run } from '../lib/proc.js'
import type { EditProfile } from '../lib/profile.js'
import type { TimelineModel, TrackItem, TrackName } from './model.js'

const CAPCUT_BATCH_SIZE = 400 // @unit CapCut CLI 호출 배치 크기(샷 400 초과 시 분할, 인자/프로세스 부하 상한)
const CAPCUT_BIN = 'capcut' // @unit capcut-cli 실행 파일명

export interface CapcutResult {
  status: 'ok' | 'failed'
  path: string // 초안 디렉토리
  draft_content_exists: boolean
  lint_clean: boolean
  lint_detail: string
  batches: number
  added: number
  failed: { shot_id: string; reason: string }[]
  error?: string
}

/** [start,end) 반개구간 배치 경계. total 이 size 이하면 1배치, 초과하면 나눈다. */
export function planBatches(total: number, size: number): [number, number][] {
  if (total <= 0) return []
  const out: [number, number][] = []
  for (let i = 0; i < total; i += size) out.push([i, Math.min(i + size, total)])
  return out
}

interface CapOp {
  shot_id: string
  run: () => Promise<{ ok: boolean; error?: string }>
}

function parseSegmentId(stdout: string): string | undefined {
  const s = stdout.indexOf('{')
  const e = stdout.lastIndexOf('}')
  if (s < 0 || e < s) return undefined
  try { return (JSON.parse(stdout.slice(s, e + 1)) as { segment_id?: string }).segment_id } catch { return undefined }
}

function laneItemsWithFile(model: TimelineModel): { lane: TrackName; item: TrackItem }[] {
  const lanes: TrackName[] = ['V1', 'V2', 'V3', 'A2']
  const out: { lane: TrackName; item: TrackItem }[] = []
  for (const lane of lanes) for (const it of model.tracks[lane]) if (it.file !== undefined) out.push({ lane, item: it })
  return out
}

export async function emitCapcut(
  model: TimelineModel, projectDir: string, profile: EditProfile,
  opts: { cwd: string; timeoutSec: number; draftsDir?: string },
): Promise<CapcutResult> {
  const draftName = `${model.project}-assemble`
  const initArgs = ['init', draftName]
  if (opts.draftsDir !== undefined) initArgs.push('--drafts', opts.draftsDir)
  const initRes = await run(CAPCUT_BIN, initArgs, { timeoutSec: opts.timeoutSec, cwd: opts.cwd })
  if (initRes.code !== 0) {
    return { status: 'failed', path: '', draft_content_exists: false, lint_clean: false, lint_detail: '', batches: 0, added: 0, failed: [], error: `capcut init 실패 code=${initRes.code}: ${initRes.stderr.trim().slice(0, ERR)}` }
  }
  let draftDir = ''
  try {
    const parsed = JSON.parse(initRes.stdout.slice(initRes.stdout.indexOf('{'), initRes.stdout.lastIndexOf('}') + 1)) as { draft_path?: string }
    draftDir = parsed.draft_path ?? ''
  } catch { /* 무시 — 아래 관례 경로로 폴백 */ }
  if (draftDir === '' && opts.draftsDir !== undefined) draftDir = join(opts.draftsDir, draftName)
  if (draftDir === '') {
    return { status: 'failed', path: '', draft_content_exists: false, lint_clean: false, lint_detail: '', batches: 0, added: 0, failed: [], error: 'capcut init 초안 경로 파악 실패' }
  }

  const failed: CapcutResult['failed'] = []
  const call = async (args: string[]): Promise<{ ok: boolean; error?: string; stdout: string }> => {
    const r = await run(CAPCUT_BIN, [args[0]!, draftDir, ...args.slice(1)], { timeoutSec: opts.timeoutSec, cwd: opts.cwd })
    return { ok: r.code === 0, error: r.code !== 0 ? `${args[0]} code=${r.code}: ${r.stderr.trim().slice(0, ERR)}` : undefined, stdout: r.stdout }
  }

  // ── 미디어 세그먼트 op 목록(V1~V3 영상/사진/모션 + A2 원본음) ──
  const ops: CapOp[] = []
  for (const { lane, item } of laneItemsWithFile(model)) {
    const isAudio = lane === 'A2'
    const dur = item.end - item.start
    const shotId = item.shot_id ?? item.id
    const needsTrim = (item.role === 'main' || item.role === 'a_roll' || item.role === 'source_audio') && item.source_in !== undefined && item.source_in > 0
    ops.push({
      shot_id: shotId,
      run: async () => {
        const add = await call([isAudio ? 'add-audio' : 'add-video', item.file!, String(item.start), String(dur), '--track-name', lane])
        if (!add.ok) return { ok: false, error: add.error }
        if (needsTrim) {
          const seg = parseSegmentId(add.stdout)
          if (seg !== undefined) {
            const t = await call(['trim', seg, String(item.source_in), String(dur)])
            if (!t.ok) return { ok: false, error: t.error }
          }
        }
        return { ok: true }
      },
    })
  }

  // ── A1 연속 마스터 ──
  const a1 = model.tracks.A1[0]
  if (a1 !== undefined && a1.file !== undefined) {
    ops.push({
      shot_id: 'narration-master',
      run: async () => {
        const add = await call(['add-audio', a1.file!, String(a1.start), String(a1.end - a1.start), '--track-name', 'A1'])
        if (!add.ok) return { ok: false, error: add.error }
        if (a1.source_in !== undefined && a1.source_in > 0) {
          const seg = parseSegmentId(add.stdout)
          if (seg !== undefined) await call(['trim', seg, String(a1.source_in), String(a1.end - a1.start)])
        }
        return { ok: true }
      },
    })
  }

  // ── V5 강조 카드(전체화면) ──
  const impactSize = profile.captions.impact_card.size_px[0]
  for (const card of model.tracks.V5.filter((it) => it.role === 'impact_card' && it.text !== undefined)) {
    ops.push({
      shot_id: card.shot_id ?? card.id,
      run: async () => call(['add-text', String(card.start), String(card.end - card.start), card.text!, '--track-name', 'V5', '--font-size', String(impactSize), '--x', String(CENTER), '--y', String(CENTER)]),
    })
  }

  // ── V6 출처 표기(작게, 좌하단) ──
  const srcSize = profile.captions.source.size_px[0]
  for (const cr of model.tracks.V6.filter((it) => it.text !== undefined)) {
    ops.push({
      shot_id: cr.shot_id ?? cr.id,
      run: async () => call(['add-text', String(cr.start), String(cr.end - cr.start), `Source: ${cr.text!}`, '--track-name', 'V6', '--font-size', String(srcSize), '--x', String(CREDIT_X), '--y', String(CREDIT_Y)]),
    })
  }

  // ── 배치 실행 ──
  const batches = planBatches(ops.length, CAPCUT_BATCH_SIZE)
  let added = 0
  for (let bi = 0; bi < batches.length; bi++) {
    const [s, e] = batches[bi]!
    for (let i = s; i < e; i++) {
      const op = ops[i]!
      const res = await op.run()
      if (res.ok) added += 1
      else failed.push({ shot_id: op.shot_id, reason: res.error ?? '알 수 없는 실패' })
    }
    process.stderr.write(`[capcut] 배치 ${bi + 1}/${batches.length} 완료 (${e - s}건)\n`)
  }

  // ── V4 기본 자막(import-srt, 키워드 강조 인라인) ──
  if (model.captions_srt !== null && existsSync(model.captions_srt)) {
    const baseSize = profile.captions.base.size_px[0]
    const kwColor = profile.captions.keyword.colors[0]!
    const words = distinctEmphasisWords(model)
    const srtArgs = ['import-srt', model.captions_srt, '--track-name', 'V4', '--font-size', String(baseSize)]
    if (words.length > 0) srtArgs.push('--highlight-words', words.join(','), '--keyword-color', kwColor)
    const r = await call(srtArgs)
    if (!r.ok) failed.push({ shot_id: 'captions', reason: r.error ?? 'import-srt 실패' })
  }

  // ── lint(정합 검사) ──
  const lintRes = await run(CAPCUT_BIN, ['lint', draftDir], { timeoutSec: opts.timeoutSec, cwd: opts.cwd })
  let lintClean = false
  let lintDetail = ''
  try {
    const l = JSON.parse(lintRes.stdout.slice(lintRes.stdout.indexOf('{'), lintRes.stdout.lastIndexOf('}') + 1)) as { ok?: boolean; summary?: { errors?: number; warnings?: number } }
    lintClean = lintRes.code === 0 && l.summary?.errors === 0
    lintDetail = `errors=${l.summary?.errors ?? '?'} warnings=${l.summary?.warnings ?? '?'} exit=${lintRes.code}`
  } catch { lintDetail = `lint 파싱 실패 exit=${lintRes.code}` }

  const draftContent = join(draftDir, 'draft_content.json')
  return {
    status: failed.length === 0 && lintClean ? 'ok' : 'failed',
    path: draftDir,
    draft_content_exists: existsSync(draftContent),
    lint_clean: lintClean,
    lint_detail: lintDetail,
    batches: batches.length,
    added,
    failed,
  }
}

/** V4 인라인 강조어(중복 제거) — V5 caption_keyword 항목 텍스트에서. */
function distinctEmphasisWords(model: TimelineModel): string[] {
  const set = new Set<string>()
  for (const it of model.tracks.V5) if (it.role === 'caption_keyword' && it.emphasis_word !== undefined) set.add(it.emphasis_word)
  return [...set]
}

const ERR = 400 // @unit 실패 사유 stderr 발췌 길이
const CENTER = 0 // @unit add-text 중앙 좌표(-1~1 정규화)
const CREDIT_X = -0.7 // @unit 출처 표기 좌하단 x(-1~1)
const CREDIT_Y = 0.85 // @unit 출처 표기 좌하단 y(-1~1)
