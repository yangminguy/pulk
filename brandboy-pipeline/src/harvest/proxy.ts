/**
 * proxy.ts — 프록시 클립 수급 (T7 Part B 2.5단계, spec/05-review.md:73 "가장 중요한 요구사항")
 *
 * 검수 전에 재생 가능한 파일이 있어야 한다. 후보 구간을 720p 부분으로 굳힌다.
 *  - 로컬 소스(local_path) → ffmpeg 부분 컷(네트워크 없음).
 *  - 원격 소스 → 소스 종류별 어댑터.fetchProxy(yt-dlp --download-sections 등).
 *  - 생성 후 probe 로 재생 가능성을 재확인한다(파일만 있고 깨진 클립을 걸러낸다).
 *  - 이미 있으면 재생성하지 않는다(멱등 → 재실행 시 다운로드 0회).
 *
 * 수치 하드코딩 금지: height·timeout 은 호출부(orchestrator)가 profile 에서 읽어 넘긴다.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { ffmpegBin, probeMedia } from '../lib/probe.js'
import type { HarvestAdapter, HarvestEnv, ProxyRequest, HiresRequest } from './types.js'

function fileBytes(p: string): number {
  return existsSync(p) ? statSync(p).size : 0
}

/** 로컬 소스 부분 컷 ffmpeg 인자. height 미지정 시 원해상도. */
function localCutArgs(src: string, inSec: number, outSec: number, outPath: string, height?: number): string[] {
  const scale = height === undefined ? [] : ['-vf', `scale=-2:${height}`]
  return ['-y', '-ss', String(inSec), '-i', src, '-t', String(outSec - inSec), ...scale, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', outPath]
}

export interface ProxyOutcome {
  ok: boolean
  path?: string
  bytes: number
  probe_ok: boolean
  skipped: boolean
  error?: string
}

async function cutOrFetch(req: ProxyRequest, adapter: HarvestAdapter | undefined, env: HarvestEnv, height?: number): Promise<{ ok: boolean; error?: string }> {
  if (req.local_path !== undefined) {
    const r = await env.runProc(ffmpegBin(), localCutArgs(req.local_path, req.in_sec, req.out_sec, req.outPath, height), { timeoutSec: req.timeoutSec })
    return { ok: r.code === 0, error: r.code === 0 ? undefined : r.stderr }
  }
  if (adapter === undefined) return { ok: false, error: `소스 ${req.source_id} 에 로컬 경로도 어댑터도 없음` }
  const res = await adapter.fetchProxy(req, env)
  return { ok: res.ok, error: res.error }
}

/**
 * 프록시 하나를 생성한다. 이미 있으면(멱등) 재생성하지 않고 skipped=true 로 반환한다.
 * fetch 는 로컬 컷 또는 어댑터. 생성 후 probe 로 재생 가능성 확인.
 */
export async function generateProxy(req: ProxyRequest, adapter: HarvestAdapter | undefined, env: HarvestEnv): Promise<ProxyOutcome> {
  if (existsSync(req.outPath)) {
    const probe = await probeMedia(req.outPath, req.timeoutSec)
    if (probe !== null) return { ok: true, path: req.outPath, bytes: fileBytes(req.outPath), probe_ok: true, skipped: true }
  }
  mkdirSync(dirname(req.outPath), { recursive: true })
  const fetched = await cutOrFetch(req, adapter, env, req.height)
  if (!fetched.ok) return { ok: false, bytes: 0, probe_ok: false, skipped: false, error: fetched.error }
  const probe = await probeMedia(req.outPath, req.timeoutSec)
  const probeOk = probe !== null
  return { ok: existsSync(req.outPath) && probeOk, path: req.outPath, bytes: fileBytes(req.outPath), probe_ok: probeOk, skipped: false }
}

/* ─────────────── 고화질(3단계) — fetch.ts 와 공유하는 로컬 컷 ─────────────── */

/** 승인 샷 원해상도 부분 다운로드. 로컬 소스는 ffmpeg 컷, 원격은 어댑터.fetchOriginal. */
export async function fetchHires(req: HiresRequest, adapter: HarvestAdapter | undefined, env: HarvestEnv): Promise<ProxyOutcome> {
  if (existsSync(req.outPath)) {
    const probe = await probeMedia(req.outPath, req.timeoutSec)
    if (probe !== null) return { ok: true, path: req.outPath, bytes: fileBytes(req.outPath), probe_ok: true, skipped: true }
  }
  mkdirSync(dirname(req.outPath), { recursive: true })
  if (req.local_path !== undefined) {
    const r = await env.runProc(ffmpegBin(), localCutArgs(req.local_path, req.in_sec, req.out_sec, req.outPath), { timeoutSec: req.timeoutSec })
    if (r.code !== 0) return { ok: false, bytes: 0, probe_ok: false, skipped: false, error: r.stderr }
  } else if (adapter !== undefined) {
    const res = await adapter.fetchOriginal(req, env)
    if (!res.ok) return { ok: false, bytes: 0, probe_ok: false, skipped: false, error: res.error }
  } else {
    return { ok: false, bytes: 0, probe_ok: false, skipped: false, error: `소스 ${req.source_id} 에 로컬 경로도 어댑터도 없음` }
  }
  const probe = await probeMedia(req.outPath, req.timeoutSec)
  const probeOk = probe !== null
  return { ok: existsSync(req.outPath) && probeOk, path: req.outPath, bytes: fileBytes(req.outPath), probe_ok: probeOk, skipped: false }
}
