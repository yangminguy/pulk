/**
 * web.ts — 웹 본문 추출 어댑터 (T7 Part B, 고정 3종 중 1)
 *
 * 담당: 뉴스·방송·아카이브 페이지 본문 + 임베드 미디어 URL.
 *  - collect: fetch + 본문 추출(readability 수준 자체 구현 — 외부 라이브러리 추가 금지).
 *  - fetchProxy/Original: 임베드 미디어를 yt-dlp 제네릭 추출기로 부분 다운로드(부분 실패 시 ok=false).
 *
 * 외부 호출은 env.fetchUrl / env.runProc. verify 는 로컬 대체로 네트워크 0회.
 */
import { existsSync, statSync } from 'node:fs'
import type { HarvestAdapter, HarvestEnv, ProxyRequest, HiresRequest, FetchResult } from '../types.js'

const MERGE_MP4 = ['--merge-output-format', 'mp4']

function fileBytes(p: string): number {
  return existsSync(p) ? statSync(p).size : 0
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
}

export interface WebArticle {
  title: string
  body: string
  media_urls: string[]
}

/**
 * 본문 추출(자체 구현): script/style/nav/footer 제거 → 블록 태그를 개행으로 → 태그 제거 → 엔티티 복원.
 * 완벽하지 않아도 자막 검색용 본문 텍스트를 얻는 게 목적이다(외부 readability 의존 금지).
 */
export function extractArticle(html: string): WebArticle {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1]!.trim()) : ''

  const media: string[] = []
  for (const m of html.matchAll(/<(?:video|source|iframe)[^>]*\ssrc=["']([^"']+)["']/gi)) media.push(m[1]!)

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:nav|footer|header|aside)[\s\S]*?<\/(?:nav|footer|header|aside)>/gi, ' ')
    .replace(/<\/(?:p|div|br|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const body = decodeEntities(stripped)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')

  return { title, body, media_urls: [...new Set(media)] }
}

/** 페이지를 받아 본문·미디어를 추출한다. */
export async function collectWeb(url: string, timeoutSec: number, env: HarvestEnv): Promise<{ ok: boolean; article?: WebArticle; error?: string }> {
  const r = await env.fetchUrl(url, timeoutSec)
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` }
  return { ok: true, article: extractArticle(r.body) }
}

function genericArgs(url: string, inSec: number, outSec: number, outPath: string, height?: number): string[] {
  const fmt = height === undefined ? [] : ['-f', `bv*[height<=${height}]+ba/b[height<=${height}]`]
  return ['--download-sections', `*${inSec}-${outSec}`, ...fmt, ...MERGE_MP4, '-o', outPath, url]
}

export const webAdapter: HarvestAdapter = {
  name: 'web',
  async fetchProxy(req: ProxyRequest, env: HarvestEnv): Promise<FetchResult> {
    const r = await env.runProc('yt-dlp', genericArgs(req.original_url, req.in_sec, req.out_sec, req.outPath, req.height), { timeoutSec: req.timeoutSec })
    if (r.code !== 0) return { ok: false, error: `웹 소스 임베드 미디어 다운로드 실패: ${r.stderr}` }
    return { ok: existsSync(req.outPath), path: req.outPath, bytes: fileBytes(req.outPath) }
  },
  async fetchOriginal(req: HiresRequest, env: HarvestEnv): Promise<FetchResult> {
    const r = await env.runProc('yt-dlp', genericArgs(req.original_url, req.in_sec, req.out_sec, req.outPath), { timeoutSec: req.timeoutSec })
    if (r.code !== 0) return { ok: false, error: `웹 소스 임베드 미디어 다운로드 실패: ${r.stderr}` }
    return { ok: existsSync(req.outPath), path: req.outPath, bytes: fileBytes(req.outPath) }
  },
}
