/**
 * probe.ts — ffprobe 미디어 프로브 (M2 이식: ai-slide-video-factory/footage-runner/probe.ts 24-64)
 *
 * PORTING.md M2 유일한 변경: spawnSync 직접 호출 → src/lib/proc.ts 의 async run() 래퍼로 교체.
 * 따라서 probeMedia 는 async 다. 타임아웃 수치는 하드코딩하지 않는다 — 호출부(ingest)가
 * profile.harvest.timeout_sec 를 넘긴다. shell:true 금지(인자 배열, 파일명 공백·한글 대비).
 */
import { existsSync } from 'node:fs'
import { run } from './proc.js'

/** ffprobe/ffmpeg 바이너리 — Homebrew 빌드 우선(시스템 ffmpeg 사용, Remotion 번들 회피). */
export function ffprobeBin(): string {
  return existsSync('/opt/homebrew/bin/ffprobe') ? '/opt/homebrew/bin/ffprobe' : 'ffprobe'
}
export function ffmpegBin(): string {
  return existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg'
}

export interface MediaProbe {
  durationSec: number
  width: number
  height: number
  fps: number
}

/**
 * 첫 비디오 스트림의 해상도·프레임레이트와 컨테이너 길이를 ffprobe 로 읽는다.
 * 파일이 없거나 ffprobe 가 판독하지 못하면 null(호출부가 폴백 분기). timeoutSec 은 호출부 제공.
 */
export async function probeMedia(absPath: string, timeoutSec: number): Promise<MediaProbe | null> {
  if (!existsSync(absPath)) return null
  const r = await run(
    ffprobeBin(),
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
      '-of', 'json',
      absPath,
    ],
    { timeoutSec },
  )
  if (r.code !== 0 || !r.stdout) return null
  try {
    const doc = JSON.parse(r.stdout) as {
      streams?: Array<{ width?: number; height?: number; r_frame_rate?: string }>
      format?: { duration?: string }
    }
    const stream = doc.streams?.[0]
    if (!stream) return null
    const durationSec = Number(doc.format?.duration ?? 0)
    const fps = parseFrameRate(stream.r_frame_rate)
    return {
      durationSec: Number.isFinite(durationSec) ? durationSec : 0,
      width: stream.width ?? 0,
      height: stream.height ?? 0,
      fps,
    }
  } catch {
    return null
  }
}

/** ffprobe r_frame_rate("30/1"·"30000/1001") → fps 실수. */
function parseFrameRate(raw: string | undefined): number {
  if (!raw) return 0
  const [num, den] = raw.split('/').map(Number)
  if (!num || !den) return num || 0
  return num / den
}
