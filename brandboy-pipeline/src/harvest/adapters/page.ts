/**
 * page.ts — Playwright 페이지 캡처 어댑터 (T7 Part B, 고정 3종 중 1)
 *
 * 담당: 제품·가격·결제·공시/IR 페이지 캡처(다운로드 불가한 화면).
 *  - 캡처는 env.capturePage(Playwright) 로 스틸 PNG 를 만들고, ffmpeg 로 짧은 mp4(재생 가능)로 굳힌다.
 *  - 프록시는 720p, 고화질은 원해상도(캡처 PNG 원본 사용).
 *
 * 브라우저 호출은 env.capturePage 하나로 주입한다. verify 는 file:// 로컬 캡처(네트워크 0회).
 * 실제 Playwright 구동은 harvest.ts 의 defaultEnv 안에만 있다(이 모듈은 브라우저를 직접 열지 않는다).
 */
import { existsSync, statSync } from 'node:fs'
import type { HarvestAdapter, HarvestEnv, ProxyRequest, HiresRequest, FetchResult } from '../types.js'
import { ffmpegBin } from '../../lib/probe.js'

function fileBytes(p: string): number {
  return existsSync(p) ? statSync(p).size : 0
}

function stillPath(outPath: string): string {
  return `${outPath}.png`
}

/** 스틸 PNG → 짧은 mp4(재생 가능). height 미지정 시 원해상도 유지. */
function stillToClipArgs(pngPath: string, outPath: string, durSec: number, height?: number): string[] {
  const scale = height === undefined ? [] : ['-vf', `scale=-2:${height}`]
  return ['-y', '-loop', '1', '-i', pngPath, '-t', String(durSec), ...scale, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', outPath]
}

async function captureToClip(url: string, outPath: string, durSec: number, timeoutSec: number, env: HarvestEnv, height?: number): Promise<FetchResult> {
  const png = stillPath(outPath)
  const cap = await env.capturePage(url, png, timeoutSec)
  if (!cap.ok || !existsSync(png)) return { ok: false, error: cap.error ?? '페이지 캡처 실패' }
  const r = await env.runProc(ffmpegBin(), stillToClipArgs(png, outPath, durSec, height), { timeoutSec })
  if (r.code !== 0) return { ok: false, error: `스틸→클립 변환 실패: ${r.stderr}` }
  return { ok: existsSync(outPath), path: outPath, bytes: fileBytes(outPath) }
}

/** 페이지 스틸 캡처만(참조 썸네일용). */
export async function capturePageStill(url: string, pngPath: string, timeoutSec: number, env: HarvestEnv): Promise<FetchResult> {
  const cap = await env.capturePage(url, pngPath, timeoutSec)
  return { ok: cap.ok && existsSync(pngPath), path: cap.path, error: cap.error }
}

export const pageAdapter: HarvestAdapter = {
  name: 'page',
  fetchProxy(req: ProxyRequest, env: HarvestEnv): Promise<FetchResult> {
    return captureToClip(req.original_url, req.outPath, req.out_sec - req.in_sec, req.timeoutSec, env, req.height)
  },
  fetchOriginal(req: HiresRequest, env: HarvestEnv): Promise<FetchResult> {
    return captureToClip(req.original_url, req.outPath, req.out_sec - req.in_sec, req.timeoutSec, env)
  },
}
