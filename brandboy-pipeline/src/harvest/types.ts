/**
 * types.ts — harvest 경계 타입 (T7 Part B)
 *
 * 어댑터의 외부 호출(spawn/fetch/browser)은 HarvestEnv 하나로 주입한다(DI).
 * verify 는 로컬 픽스처로 대체한 HarvestEnv 를 넘겨 **네트워크 0회**로 어댑터 경로를 돈다.
 *
 * 플러그인 아키텍처·추상 기반 클래스 금지: 어댑터는 고정 3종(youtube/web/page)이고
 * HarvestAdapter 는 두 메서드짜리 순수 인터페이스다.
 */
import type { RunResult, RunOptions } from '../lib/proc.js'

/* ─────────────── 외부 효과 주입점 ─────────────── */

export interface HttpResult {
  ok: boolean
  status: number
  body: string
}

export interface CaptureResult {
  ok: boolean
  path?: string
  error?: string
}

/** 어댑터가 쓰는 모든 외부 효과. 프로덕션=실제 spawn/fetch/playwright, verify=로컬 대체. */
export interface HarvestEnv {
  runProc(cmd: string, args: string[], opts: RunOptions): Promise<RunResult>
  fetchUrl(url: string, timeoutSec: number): Promise<HttpResult>
  capturePage(url: string, outPath: string, timeoutSec: number): Promise<CaptureResult>
}

/* ─────────────── 미디어 수급 요청/결과 ─────────────── */

export interface ProxyRequest {
  source_id: string
  original_url: string
  local_path?: string // 있으면 로컬 ffmpeg 컷(네트워크 없음)
  in_sec: number
  out_sec: number
  height: number
  timeoutSec: number
  outPath: string
}

export interface HiresRequest {
  source_id: string
  original_url: string
  local_path?: string
  in_sec: number
  out_sec: number
  timeoutSec: number
  outPath: string
}

export interface FetchResult {
  ok: boolean
  path?: string
  bytes?: number
  error?: string
}

/** 고정 어댑터 인터페이스. 프록시(720p 부분)·고화질(원해상도 부분) 두 수급만 담당한다. */
export interface HarvestAdapter {
  readonly name: string
  fetchProxy(req: ProxyRequest, env: HarvestEnv): Promise<FetchResult>
  fetchOriginal(req: HiresRequest, env: HarvestEnv): Promise<FetchResult>
}

/* ─────────────── 랭킹 ─────────────── */

/** 채점에 쓰는 소스 메타(카탈로그에서 온다). 없으면 신호=0(t0b 바 자막은 어휘 점수만). */
export interface SourceMeta {
  kind?: string
  is_official?: boolean
  resolution_short_side?: number
  has_evidence?: boolean
  visual_topics?: number
  rights_status?: string
}

export type ScoreSource = 'lexical' | 'agent_rerank'

export interface RankedCandidate {
  source_id: string
  source_in: number
  source_out: number
  score: number
  score_source: ScoreSource
  rights_status: string // 배지 — 점수에 섞지 않는다
  asset_kind: string
  text: string
}
