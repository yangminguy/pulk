/**
 * harvest.ts — 구간 검색 → 후보 랭킹 → 프록시 → (승인 후) 고화질 (T7 Part B 오케스트레이터)
 *
 * 단계:
 *  2   자막 인덱스 + 6종 가중 랭킹(index.ts) + semantic_source 분기(rerank.ts)
 *  2.5 프록시 클립(proxy.ts) — 전 비트, 720p 부분. 예산 초과 시 후보 수 축소 + 경고(무단 절단 금지)
 *  3   고화질(--stage hires) — 승인 샷만, assets/selected/manifest.json (fetch.ts). shot-plan.json 무변경
 *
 * 실패 규약(report.ts): critical 후보 0 → blocked + exit1 + 7단계 대안 · normal 미달 → failed ·
 *   bridge 미달 → 진행 · --only 밖 critical 미달 → deferred_blocked + exit0.
 *
 * 수치 하드코딩 금지: 전량 profile 에서 읽는다. 비밀값(API 키)은 산출물·로그에 절대 기록하지 않는다.
 */
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { loadProfile, type EditProfile } from '../lib/profile.js'
import { run } from '../lib/proc.js'
import { writeAtomic } from '../lib/io.js'
import { sha256Hex } from '../lib/canonical.js'
import { cacheGet, cacheSet } from '../lib/cache.js'
import { newReport, finalizeReport, type PartialReport, type FailureItem } from '../lib/report.js'
import { intersectBeats } from '../lib/scope.js'
import { readJsonOrThrow } from './validate.js'
import { buildIndex, search, searchAll, type Transcript, type SearchConfig } from '../harvest/index.js'
import { applyRerank } from '../harvest/rerank.js'
import { generateProxy } from '../harvest/proxy.js'
import { runHires, type CatalogSource } from '../harvest/fetch.js'
import { youtubeAdapter } from '../harvest/adapters/youtube.js'
import { webAdapter } from '../harvest/adapters/web.js'
import { pageAdapter } from '../harvest/adapters/page.js'
import type { HarvestEnv, HarvestAdapter, RankedCandidate, SourceMeta, ProxyRequest, CaptureResult, HttpResult } from '../harvest/types.js'

const CAND_ID_PAD = 3 // @unit cNNN 후보 순번 자리수
const BYTES_PER_GB = 1024 ** 3 // @unit GiB
const MS_PER_SEC = 1000 // @unit 초→ms
const FIFTEEN_MIN_SEC = 900 // @unit 15분 창(still_image_max_per_15min)
const IMAGE_KINDS = new Set(['image', 'still'])
const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be']

/** SOURCE-PLAYBOOK.md §8 — critical 후보 0 시 blocked 리포트에 동봉하는 7단계 대안. */
const SEVEN_STEPS: string[] = [
  '검색어·언어·인물명 변경',
  '인터뷰 자막과 설명란에서 원출처 추적',
  '웹 아카이브·공시·보도자료 확인',
  '직접 웹 화면 녹화',
  '직접 촬영',
  '근거 기반 자체 그래픽',
  '원고를 보여줄 수 있는 문장으로 수정',
]

/* ─────────────── 옵션/결과 타입 ─────────────── */

export interface HarvestOptions {
  projectDir: string
  only: string[]
  pilotPath?: string
  evalMode: boolean
  stage?: string
  human: boolean
  // 주입(DI/테스트) — 미지정 시 실제 구현
  env?: HarvestEnv
  adapters?: Record<string, HarvestAdapter>
  profileOverride?: EditProfile
}

type HarvestBlocked = FailureItem & { alternatives?: string[] }

export interface HarvestSummary extends PartialReport {
  stage: 'proxy' | 'hires'
  beats_in_scope: number
  candidates_total: number
  photo_candidates: number
  proxies_generated: number
  proxies_skipped: number
  budget_gb: number
  budget_used_gb: number
  budget_exceeded: boolean
  warnings: { beat_id?: string; reason: string }[]
  rerank_pending: { beat_id: string; request?: string; cache_key: string }[]
  blocked: HarvestBlocked[]
  manifest?: string
  hires?: { downloaded: number; skipped: number; failed: number }
}

interface OutputCandidate {
  cand_id: string
  beat_id: string
  source_id: string
  source_in: number
  source_out: number
  score: number
  score_source: string
  rights_status: string
  asset_kind: string
  text: string
  proxy_path: string | null
  proxy_ok: boolean
  photo_motion?: { type: string }
}

/* ─────────────── 기본 env / adapters ─────────────── */

function defaultEnv(): HarvestEnv {
  return {
    runProc: run,
    async fetchUrl(url: string, timeoutSec: number): Promise<HttpResult> {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), timeoutSec * MS_PER_SEC)
        const res = await fetch(url, { signal: ctrl.signal })
        clearTimeout(timer)
        return { ok: res.ok, status: res.status, body: await res.text() }
      } catch (err) {
        return { ok: false, status: 0, body: `${(err as Error).message}` }
      }
    },
    async capturePage(url: string, outPath: string, timeoutSec: number): Promise<CaptureResult> {
      try {
        const { chromium } = await import('playwright')
        const browser = await chromium.launch()
        try {
          const page = await browser.newPage()
          await page.goto(url, { timeout: timeoutSec * MS_PER_SEC, waitUntil: 'networkidle' })
          await page.screenshot({ path: outPath, fullPage: true })
          return { ok: true, path: outPath }
        } finally {
          await browser.close()
        }
      } catch (err) {
        return { ok: false, error: `${(err as Error).message}` }
      }
    },
  }
}

function defaultAdapters(): Record<string, HarvestAdapter> {
  return { youtube: youtubeAdapter, web: webAdapter, page: pageAdapter }
}

/** 소스 종류/URL 로 어댑터를 고른다(고정 분기, 플러그인 아님). */
function adapterName(source: CatalogSource): string {
  const url = source.original_url ?? ''
  if (YOUTUBE_HOSTS.some((h) => url.includes(h))) return 'youtube'
  if (source.kind === 'product_page') return 'page'
  return 'web'
}

/* ─────────────── 입력 로드 ─────────────── */

interface ShotPlanLite {
  segments: { segment_id: string; act: string }[]
  beats: { beat_id: string; segment_id: string; search_intent: string; importance: string; start: number; end: number }[]
  shots: { shot_id: string; beat_ids: string[]; asset_kind: string; selection_status: string }[]
}

function loadCatalog(projectDir: string): CatalogSource[] {
  const path = join(projectDir, 'sources', 'catalog.json')
  if (!existsSync(path)) return []
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const arr = Array.isArray(raw) ? raw : Array.isArray((raw as { sources?: unknown }).sources) ? (raw as { sources: unknown[] }).sources : []
  return arr as CatalogSource[]
}

function loadTranscripts(projectDir: string): Transcript[] {
  const dir = join(projectDir, 'sources', 'transcripts')
  if (!existsSync(dir)) return []
  const out: Transcript[] = []
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Transcript
    if (doc.source_id !== undefined && Array.isArray(doc.segments)) out.push({ source_id: doc.source_id, segments: doc.segments })
  }
  return out
}

function shortSide(s: Record<string, unknown>): number | undefined {
  const w = typeof s['width'] === 'number' ? (s['width'] as number) : undefined
  const h = typeof s['height'] === 'number' ? (s['height'] as number) : undefined
  if (w !== undefined && h !== undefined) return Math.min(w, h)
  return typeof s['resolution_short_side'] === 'number' ? (s['resolution_short_side'] as number) : undefined
}

function buildSourceMeta(catalog: CatalogSource[]): Map<string, SourceMeta> {
  const map = new Map<string, SourceMeta>()
  for (const s of catalog as unknown as Record<string, unknown>[]) {
    const id = String(s['source_id'])
    map.set(id, {
      kind: typeof s['kind'] === 'string' ? (s['kind'] as string) : undefined,
      is_official: s['is_official'] === true,
      resolution_short_side: shortSide(s),
      has_evidence: s['has_evidence'] === true,
      visual_topics: Array.isArray(s['visual_topics']) ? (s['visual_topics'] as unknown[]).length : undefined,
      rights_status: (typeof s['rights_status'] === 'string' ? s['rights_status'] : 'unknown') as SourceMeta['rights_status'],
    })
  }
  return map
}

/** 자막 집합 지문 — 소스 변경 시 랭킹/리랭크 캐시를 무효화한다. */
function sourceSetHash(transcripts: Transcript[]): string {
  const parts = transcripts.map((t) => `${t.source_id}:${t.segments.length}`).sort()
  return sha256Hex(parts.join('|'))
}

/* ─────────────── 파일럿 스코프 ─────────────── */

function pilotBeats(projectDir: string, pilotPath: string, beats: ShotPlanLite['beats']): string[] {
  const pilot = JSON.parse(readFileSync(resolve(pilotPath), 'utf8')) as { spine?: { from_sentence_key?: string; to_sentence_key?: string } }
  const from = pilot.spine?.from_sentence_key
  const to = pilot.spine?.to_sentence_key
  const tlPath = join(projectDir, 'timeline.json')
  if (from === undefined || to === undefined || !existsSync(tlPath)) return beats.map((b) => b.beat_id)
  const tl = JSON.parse(readFileSync(tlPath, 'utf8')) as { sentences?: { sentence_key: string; start: number; end: number }[] }
  const sents = tl.sentences ?? []
  const fromS = sents.find((s) => s.sentence_key === from)
  const toS = sents.find((s) => s.sentence_key === to)
  if (fromS === undefined || toS === undefined) return beats.map((b) => b.beat_id)
  const lo = Math.min(fromS.start, toS.start)
  const hi = Math.max(fromS.end, toS.end)
  return beats.filter((b) => b.start < hi && lo < b.end).map((b) => b.beat_id)
}

/* ─────────────── 처리 순서 ─────────────── */

function phaseRank(act: string | undefined, visualFunction: string | undefined, importance: string): number {
  const HOOK = 0, REVEAL = 1, EVIDENCE = 2, BUILD = 3, OTHER = 4, BRIDGE = 5 // @unit 처리 단계 순위(순서값)
  if (act === 'hook') return HOOK
  if (act === 'reveal') return REVEAL
  if (visualFunction === 'evidence') return EVIDENCE
  if (act === 'build') return BUILD
  if (importance === 'bridge') return BRIDGE
  return OTHER
}

function importanceRank(imp: string): number {
  const ORDER = ['critical', 'normal', 'bridge']
  const i = ORDER.indexOf(imp)
  return i < 0 ? ORDER.length : i
}

/* ─────────────── 메인 ─────────────── */

export async function runHarvest(opts: HarvestOptions): Promise<{ summary: HarvestSummary; exitCode: number }> {
  const projectDir = resolve(opts.projectDir)
  const profile = opts.profileOverride ?? loadProfile(projectDir, { bootstrap: true })
  const env = opts.env ?? defaultEnv()
  const adapters = opts.adapters ?? defaultAdapters()
  const h = profile.harvest

  const catalog = loadCatalog(projectDir)
  const sourceById = new Map<string, CatalogSource>(catalog.map((s) => [s.source_id, s]))
  const pickAdapter = (source: CatalogSource): HarvestAdapter | undefined => adapters[adapterName(source)]

  // ── 3단계: 고화질 (승인 후) ──
  if (opts.stage === 'hires') {
    const hires = await runHires({ projectDir, timeoutSec: h.timeout_sec, env, sources: sourceById, pickAdapter, only: new Set(opts.only) })
    const base = newReport()
    base.processed = hires.downloaded
    base.skipped = hires.skipped
    for (const f of hires.failed) base.failed.push({ shot_id: f.shot_id, reason: f.reason })
    const { report, exitCode } = finalizeReport(base)
    const summary: HarvestSummary = {
      ...report, blocked: report.blocked as HarvestBlocked[],
      stage: 'hires', beats_in_scope: 0, candidates_total: 0, photo_candidates: 0,
      proxies_generated: hires.downloaded, proxies_skipped: hires.skipped,
      budget_gb: h.proxy_budget_gb, budget_used_gb: 0, budget_exceeded: false,
      warnings: [], rerank_pending: [], manifest: hires.manifestPath,
      hires: { downloaded: hires.downloaded, skipped: hires.skipped, failed: hires.failed.length },
    }
    if (opts.human) process.stderr.write(`\n■ harvest hires — 다운로드=${hires.downloaded} skip=${hires.skipped} fail=${hires.failed.length} → ${hires.manifestPath}\n`)
    return { summary, exitCode }
  }

  // ── 2단계: 인덱스 + 랭킹 ──
  const plan = readJsonOrThrow(join(projectDir, 'shot-plan.json'), 'shot-plan.json') as ShotPlanLite
  const transcripts = loadTranscripts(projectDir)
  const meta = buildSourceMeta(catalog)
  const searchCfg: SearchConfig = {
    ngramMin: h.search.ngram_min,
    ngramMax: h.search.ngram_max,
    previewPad: h.preview_context_sec[1],
    weights: h.score_weights,
    resolutionMinShortSide: h.resolution_min_short_side,
  }
  const index = buildIndex(transcripts, searchCfg, meta)
  const setHash = sourceSetHash(transcripts)

  const segAct = new Map<string, string>(plan.segments.map((s) => [s.segment_id, s.act]))
  // 비트의 대표 visual_function 은 need 샷이 아니라 비트 자체엔 없다 → shot-plan 의 beat 에 visual_function 필드는 있으나 lite 로딩엔 없음. importance 로 근사.
  const beats = plan.beats

  // 스코프: --only ∩ --pilot
  const pilot = opts.pilotPath !== undefined ? pilotBeats(projectDir, opts.pilotPath, beats) : []
  const scope = intersectBeats(opts.only, pilot)
  const scopeSet = new Set(scope)
  const inScope = (beatId: string): boolean => scopeSet.size === 0 || scopeSet.has(beatId) || scopeSet.has(beatId.replace(/[a-z]$/, ''))

  // 처리 순서(훅→reveal→evidence→build→bridge, 그 안 critical 우선)
  const ordered = [...beats].sort((a, b) => {
    const pa = phaseRank(segAct.get(a.segment_id), undefined, a.importance)
    const pb = phaseRank(segAct.get(b.segment_id), undefined, b.importance)
    if (pa !== pb) return pa - pb
    const ia = importanceRank(a.importance)
    const ib = importanceRank(b.importance)
    if (ia !== ib) return ia - ib
    return a.start - b.start
  })

  const base = newReport()
  const warnings: { beat_id?: string; reason: string }[] = []
  const rerankPending: { beat_id: string; request?: string; cache_key: string }[] = []
  const blocked: HarvestBlocked[] = []
  let candidatesTotal = 0
  let photoTotal = 0
  let proxiesGenerated = 0
  let proxiesSkipped = 0
  let bytesUsed = 0
  let budgetExceeded = false
  const imageWindowCount = new Map<number, number>()
  const budgetBytes = h.proxy_budget_gb * BYTES_PER_GB
  const stillCap = profile.sources.still_image_max_per_15min[1]

  for (const beat of ordered) {
    const beatInScope = inScope(beat.beat_id)
    const isCritical = beat.importance === 'critical'
    const minCand = profile.beats.min_candidates[beat.importance as 'critical' | 'normal' | 'bridge'] ?? profile.beats.min_candidates.normal

    // 랭킹(캐시 메모이즈 — --eval 은 TTL 무시)
    const cacheKey = `harvest-rank:${beat.beat_id}:${beat.search_intent}:${setHash}`
    let lexTopN = cacheGet(cacheKey, { ttlDays: h.cache_ttl_days, ignoreTtl: opts.evalMode }) as RankedCandidate[] | null
    if (lexTopN === null) {
      lexTopN = search(index, beat.search_intent, h.search.top_n)
      cacheSet(cacheKey, lexTopN)
    }
    const lexAll = h.search.semantic_source === 'agent_rerank' ? searchAll(index, beat.search_intent) : lexTopN

    const rer = applyRerank({
      beatId: beat.beat_id, searchIntent: beat.search_intent, sourceSetHash: setHash,
      lexicalTopN: lexTopN, lexicalAll: lexAll, semanticSource: h.search.semantic_source, topN: h.search.top_n, projectDir,
    })
    if (rer.pending) rerankPending.push({ beat_id: beat.beat_id, request: rer.requestPath, cache_key: rer.cacheKey })
    const ranked = rer.candidates

    // 사진 후보(critical 비트에만, still_image_max_per_15min 상한)
    const photoCands: RankedCandidate[] = []
    if (isCritical) {
      const wi = Math.floor(beat.start / FIFTEEN_MIN_SEC)
      for (const src of catalog as unknown as Record<string, unknown>[]) {
        if (!IMAGE_KINDS.has(String(src['kind']))) continue
        if ((imageWindowCount.get(wi) ?? 0) >= stillCap) break
        photoCands.push({
          source_id: String(src['source_id']), source_in: 0, source_out: beat.end - beat.start,
          score: 0, score_source: 'lexical', rights_status: (typeof src['rights_status'] === 'string' ? src['rights_status'] : 'unknown') as RankedCandidate['rights_status'],
          asset_kind: 'image', text: typeof src['title'] === 'string' ? (src['title'] as string) : '',
        })
        imageWindowCount.set(wi, (imageWindowCount.get(wi) ?? 0) + 1)
      }
    }

    const usableCount = ranked.length + photoCands.length

    // 실패 분류 (범위/중요도별)
    if (usableCount === 0 && isCritical) {
      if (beatInScope) {
        blocked.push({ beat_id: beat.beat_id, importance: 'critical', reason: 'critical 비트에 후보 0개 — 파이프라인 정지, 사람 결정 필요', action_required: true, alternatives: SEVEN_STEPS })
      } else {
        base.deferred_blocked.push({ beat_id: beat.beat_id, importance: 'critical', reason: '--only 범위 밖 critical 후보 0개' })
      }
    } else if (beatInScope && usableCount < minCand) {
      if (beat.importance === 'normal') {
        base.failed.push({ beat_id: beat.beat_id, importance: 'normal', reason: `normal 비트 후보 ${usableCount}개 < 최소 ${minCand} — 미달 상태로 스토리보드에 올림` })
      } else if (beat.importance === 'bridge') {
        warnings.push({ beat_id: beat.beat_id, reason: `bridge 비트 후보 ${usableCount}개 < 최소 ${minCand} — 그대로 진행` })
      } else {
        base.failed.push({ beat_id: beat.beat_id, importance: 'critical', reason: `critical 비트 후보 ${usableCount}개 < 최소 ${minCand} + 대체 — 계속 탐색 필요(자동 강등 금지)` })
      }
    }

    if (!beatInScope) continue // 범위 밖: 후보/프록시 산출 안 함(deferred 분류만)

    // 후보 파일 조립 + 프록시(상위 proxy_max_candidates_per_beat, 예산 내)
    const outCands: OutputCandidate[] = []
    let candIdx = 1
    const proxyLimit = h.proxy_max_candidates_per_beat
    for (const c of ranked) {
      const candId = `c${String(candIdx).padStart(CAND_ID_PAD, '0')}`
      candIdx++
      const proxyRel = join('candidates', beat.beat_id, `${candId}.mp4`)
      let proxyPath: string | null = null
      let proxyOk = false
      const wantProxy = outCands.filter((o) => o.proxy_path !== null).length < proxyLimit && !budgetExceeded
      if (wantProxy) {
        const src = sourceById.get(c.source_id)
        const req: ProxyRequest = {
          source_id: c.source_id, original_url: src?.original_url ?? '',
          local_path: src?.local_path !== undefined ? resolve(projectDir, src.local_path) : undefined,
          in_sec: c.source_in, out_sec: c.source_out, height: h.proxy_height, timeoutSec: h.timeout_sec,
          outPath: resolve(projectDir, proxyRel),
        }
        const outcome = await generateProxy(req, src !== undefined ? pickAdapter(src) : undefined, env)
        if (outcome.ok) {
          proxyPath = proxyRel
          proxyOk = outcome.probe_ok
          if (outcome.skipped) proxiesSkipped++
          else {
            proxiesGenerated++
            bytesUsed += outcome.bytes
            if (bytesUsed > budgetBytes) {
              budgetExceeded = true
              warnings.push({ beat_id: beat.beat_id, reason: `프록시 총 용량 ${(bytesUsed / BYTES_PER_GB).toFixed(DP)}GB > 예산 ${h.proxy_budget_gb}GB — 이후 후보 프록시 생성 축소(무단 절단 금지)` })
            }
          }
        } else if (outcome.error !== undefined) {
          warnings.push({ beat_id: beat.beat_id, reason: `프록시 생성 실패(${c.source_id}): ${outcome.error}` })
        }
      }
      outCands.push({
        cand_id: candId, beat_id: beat.beat_id, source_id: c.source_id, source_in: c.source_in, source_out: c.source_out,
        score: Number(c.score.toFixed(DP)), score_source: c.score_source, rights_status: c.rights_status, asset_kind: c.asset_kind,
        text: c.text, proxy_path: proxyPath, proxy_ok: proxyOk,
      })
    }
    // 사진 후보 추가(프록시 없음 — 스틸 + parallax 초기값)
    for (const p of photoCands) {
      const candId = `c${String(candIdx).padStart(CAND_ID_PAD, '0')}`
      candIdx++
      outCands.push({
        cand_id: candId, beat_id: beat.beat_id, source_id: p.source_id, source_in: p.source_in, source_out: p.source_out,
        score: Number(p.score.toFixed(DP)), score_source: p.score_source, rights_status: p.rights_status, asset_kind: 'image',
        text: p.text, proxy_path: null, proxy_ok: false, photo_motion: { type: profile.photo_motion.default },
      })
      photoTotal++
    }

    candidatesTotal += outCands.length
    const beatDir = resolve(projectDir, 'candidates', beat.beat_id)
    mkdirSync(beatDir, { recursive: true })
    writeAtomic(join(beatDir, 'candidates.json'), {
      beat_id: beat.beat_id, importance: beat.importance, search_intent: beat.search_intent,
      rerank_pending: rer.pending, candidates: outCands,
    })
    base.processed++
  }

  base.blocked = blocked
  const { report, exitCode } = finalizeReport(base)
  const summary: HarvestSummary = {
    ...report, blocked,
    stage: 'proxy',
    beats_in_scope: ordered.filter((b) => inScope(b.beat_id)).length,
    candidates_total: candidatesTotal, photo_candidates: photoTotal,
    proxies_generated: proxiesGenerated, proxies_skipped: proxiesSkipped,
    budget_gb: h.proxy_budget_gb, budget_used_gb: Number((bytesUsed / BYTES_PER_GB).toFixed(DP)), budget_exceeded: budgetExceeded,
    warnings, rerank_pending: rerankPending,
  }
  if (opts.human) {
    process.stderr.write(`\n■ harvest proxy — ok=${report.ok} 비트=${summary.beats_in_scope} 후보=${candidatesTotal}(사진 ${photoTotal}) 프록시=${proxiesGenerated}(skip ${proxiesSkipped}) 예산=${summary.budget_used_gb}/${h.proxy_budget_gb}GB${budgetExceeded ? ' 초과' : ''}\n`)
    for (const b of blocked) process.stderr.write(`  x [blocked] ${b.beat_id}: ${b.reason}\n`)
    for (const w of warnings) process.stderr.write(`  ! ${w.beat_id ?? '-'}: ${w.reason}\n`)
  }
  return { summary, exitCode }
}

const DP = 3 // @unit 표기 소수 자릿수
