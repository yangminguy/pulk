/**
 * cache.ts — 수집 캐시 (IMPLEMENTATION §7.7)
 *
 * 경로 .cache/<sha256(key)>.json. key 는 호출부가 source+query 로 만든다.
 * TTL 은 harvest.cache_ttl_days. --eval 실행은 재현 가능해야 하므로 TTL 무시(ignoreTtl).
 *
 * 캐시가 없으면 특정 비트만 재수집할 때 API 를 다시 부른다. 검수→재수집 루프가 기본 동작이므로 필수.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from './canonical.js'
import { repoRoot } from './profile.js'
import { writeAtomic } from './io.js'

const MS_PER_DAY = 86400000 // @unit 하루(ms) = 24*60*60*1000

interface CacheEnvelope {
  saved_at_ms: number
  value: unknown
}

export interface CacheOptions {
  ttlDays: number
  ignoreTtl?: boolean
}

function cacheDir(): string {
  const dir = join(repoRoot(), '.cache')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function cachePath(key: string): string {
  return join(cacheDir(), `${sha256Hex(key)}.json`)
}

/** 캐시 조회. 만료(now-saved > ttl)면 null. ignoreTtl=true 면 만료 무시(--eval). */
export function cacheGet(key: string, opts: CacheOptions): unknown | null {
  const path = cachePath(key)
  if (!existsSync(path)) return null
  let env: CacheEnvelope
  try {
    env = JSON.parse(readFileSync(path, 'utf8')) as CacheEnvelope
  } catch {
    return null
  }
  if (opts.ignoreTtl === true) return env.value
  const ageMs = Date.now() - env.saved_at_ms
  if (ageMs > opts.ttlDays * MS_PER_DAY) return null
  return env.value
}

/** 캐시 저장. saved_at_ms 로 TTL 판정한다. */
export function cacheSet(key: string, value: unknown): void {
  const env: CacheEnvelope = { saved_at_ms: Date.now(), value }
  writeAtomic(cachePath(key), env)
}

/** 테스트용: 저장 시각을 과거로 강제(만료 시뮬레이션). saved_at_ms 를 직접 지정한다. */
export function cacheSetAt(key: string, value: unknown, savedAtMs: number): void {
  const env: CacheEnvelope = { saved_at_ms: savedAtMs, value }
  writeFileSync(cachePath(key), JSON.stringify(env))
}
