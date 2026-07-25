/**
 * youtube.ts — yt-dlp 어댑터 (T7 Part B, 고정 3종 중 1)
 *
 * 담당: 공식 채널·SNS·인터뷰·광고·UGC.
 *  - collect: 자막·메타 수집(--write-auto-subs/--write-subs --skip-download). 영상 파일은 받지 않는다.
 *  - fetchProxy: 부분 다운로드(--download-sections) + 720p 포맷.
 *  - fetchOriginal: 부분 다운로드 + 원해상도.
 *
 * 403 우회: --extractor-args youtube:player_client=android.
 * 외부 호출은 전부 env.runProc(spawn). verify 는 로컬 대체 env 로 네트워크 0회.
 */
import { existsSync, statSync } from 'node:fs'
import type { HarvestAdapter, HarvestEnv, ProxyRequest, HiresRequest, FetchResult } from '../types.js'

const YT_403_BYPASS = ['--extractor-args', 'youtube:player_client=android']
const MERGE_MP4 = ['--merge-output-format', 'mp4']

function fileBytes(p: string): number {
  return existsSync(p) ? statSync(p).size : 0
}

/** yt-dlp 부분 다운로드 인자. height 미지정(원해상도) 시 포맷 캡 없음. */
function ytdlArgs(url: string, inSec: number, outSec: number, outPath: string, height?: number): string[] {
  const section = ['--download-sections', `*${inSec}-${outSec}`]
  const fmt = height === undefined ? [] : ['-f', `bv*[height<=${height}]+ba/b[height<=${height}]`]
  return [...YT_403_BYPASS, ...section, ...fmt, ...MERGE_MP4, '-o', outPath, url]
}

/** 자막·메타 수집(영상 미다운로드). 산출 vtt/info.json 경로 접두사를 반환. */
export async function collectYoutube(url: string, outPrefix: string, timeoutSec: number, env: HarvestEnv): Promise<FetchResult> {
  const args = [
    ...YT_403_BYPASS,
    '--write-auto-subs', '--write-subs', '--sub-format', 'vtt',
    '--write-info-json', '--skip-download',
    '-o', outPrefix, url,
  ]
  const r = await env.runProc('yt-dlp', args, { timeoutSec })
  return { ok: r.code === 0, error: r.code === 0 ? undefined : r.stderr }
}

export const youtubeAdapter: HarvestAdapter = {
  name: 'youtube',
  async fetchProxy(req: ProxyRequest, env: HarvestEnv): Promise<FetchResult> {
    const r = await env.runProc('yt-dlp', ytdlArgs(req.original_url, req.in_sec, req.out_sec, req.outPath, req.height), { timeoutSec: req.timeoutSec })
    if (r.code !== 0) return { ok: false, error: r.stderr }
    return { ok: existsSync(req.outPath), path: req.outPath, bytes: fileBytes(req.outPath) }
  },
  async fetchOriginal(req: HiresRequest, env: HarvestEnv): Promise<FetchResult> {
    const r = await env.runProc('yt-dlp', ytdlArgs(req.original_url, req.in_sec, req.out_sec, req.outPath), { timeoutSec: req.timeoutSec })
    if (r.code !== 0) return { ok: false, error: r.stderr }
    return { ok: existsSync(req.outPath), path: req.outPath, bytes: fileBytes(req.outPath) }
  },
}
