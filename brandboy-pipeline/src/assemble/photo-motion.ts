/**
 * photo-motion.ts — 조립 미디어 렌더(ffmpeg). emit-capcut·emit-numbered 공용.
 *
 * 두 이미터가 같은 ffmpeg 로직을 두 벌 갖지 않도록 여기로 모은다(checks 처럼 단일 출처).
 *  - renderCut         동영상 절단(앞뒤 handle_sec 핸들 보존, 균일 해상도/프레임레이트로 재인코드)
 *  - renderZoompan     사진 켄번즈/줌/팬 — ffmpeg zoompan 으로 정지 사진을 움직이는 클립으로(spec/07:60)
 *  - renderParallaxComposite  parallax — 스틸 + T8 알파 mov 합성(경로 C 순번 파일용 단일 클립)
 *  - renderColorCard   전체화면 임팩트 카드 배경(단색)
 *  - materializeZoompan  모델의 zoompan 사진 샷을 work 디렉토리에 렌더하고 item.file 을 교체
 *
 * 편집 수치는 profile 이 유일 출처다. ffmpeg 필터 문자열 안의 숫자는 코드가 아니라 문자열이다
 * (verify-no-magic-numbers 가 문자열 구간을 지운다). 구조 상수만 // @unit.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { run } from '../lib/proc.js'
import { ffmpegBin } from '../lib/probe.js'
import type { EditProfile } from '../lib/profile.js'
import type { TimelineModel, TrackName } from './model.js'

export interface RenderResult { ok: boolean; error?: string }

/** 소스를 캔버스에 맞춰 letterbox + 프레임레이트 고정하는 표준 필터. W/H/fps 는 profile.video. */
function fitFilter(w: number, h: number, fps: number): string {
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`
}

async function ff(args: string[], cwd: string, timeoutSec: number): Promise<RenderResult> {
  const r = await run(ffmpegBin(), args, { timeoutSec, cwd })
  if (r.code !== 0) return { ok: false, error: `ffmpeg code=${r.code}: ${r.stderr.trim().slice(0, STDERR_EXCERPT)}` }
  return { ok: true }
}

const STDERR_EXCERPT = 400 // @unit 실패 사유에 담는 stderr 발췌 길이(문자)

/* ─────────────── 동영상 절단(핸들 보존) ─────────────── */

/**
 * source_in~source_out 을 잘라 균일 포맷으로 재인코드한다. 앞뒤 handle_sec 을 붙여 작업 파일에 보존.
 * 루프 금지 — 필요 길이가 소스보다 길면 호출부(checks)가 이미 실패시키므로 여기서는 정지연장 안 함.
 */
export async function renderCut(
  file: string, srcIn: number, srcOut: number, profile: EditProfile, outFile: string,
  opts: { keepAudio: boolean; cwd: string; timeoutSec: number },
): Promise<RenderResult> {
  const handle = profile.shots.handle_sec
  const [w, h] = profile.video.resolution
  const fps = profile.video.fps
  const start = Math.max(0, srcIn - handle)
  const dur = srcOut - srcIn + (srcIn - start) + handle
  const args = ['-y', '-ss', String(start), '-i', file, '-t', String(dur), '-vf', fitFilter(w, h, fps), '-pix_fmt', 'yuv420p']
  if (!opts.keepAudio) args.push('-an')
  args.push(outFile)
  return ff(args, opts.cwd, opts.timeoutSec)
}

/* ─────────────── 사진 켄번즈/줌/팬 (zoompan) ─────────────── */

const ZOOMPAN_DECIMALS = 4 // @unit zoompan 식 계수 자리수

/**
 * 정지 사진을 photo_motion(focal·zoom·duration)대로 움직이는 클립으로 렌더한다.
 * zoom 은 z0→z1 선형, focal 로 화면 중심을 잡는다. min/max 를 쓰지 않아(필터 구분자 `,` 회피) 결정론적.
 */
export async function renderZoompan(
  still: string, motion: { focal: [number, number]; zoom: [number, number]; duration_sec: number },
  profile: EditProfile, outFile: string, opts: { cwd: string; timeoutSec: number },
): Promise<RenderResult> {
  const [w, h] = profile.video.resolution
  const fps = profile.video.fps
  const nFrames = Math.max(1, Math.round(motion.duration_sec * fps))
  const denom = Math.max(1, nFrames - 1)
  const [z0, z1] = motion.zoom
  const [fx, fy] = motion.focal
  const round = (n: number): string => n.toFixed(ZOOMPAN_DECIMALS)
  // z(on) = z0 + (z1-z0)*on/denom ; 화면 중심을 focal 로: x=iw*fx-(iw/zoom)/2, y=ih*fy-(ih/zoom)/2
  const zExpr = `${round(z0)}+(${round(z1 - z0)})*on/${denom}`
  const xExpr = `iw*${round(fx)}-(iw/zoom)/2`
  const yExpr = `ih*${round(fy)}-(ih/zoom)/2`
  const filter = `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:fps=${fps}:s=${w}x${h}`
  const args = ['-y', '-loop', '1', '-i', still, '-t', String(motion.duration_sec), '-vf', filter, '-frames:v', String(nFrames), '-pix_fmt', 'yuv420p', '-an', outFile]
  return ff(args, opts.cwd, opts.timeoutSec)
}

/* ─────────────── parallax 합성(스틸 + 알파 mov) ─────────────── */

/** 경로 C 순번 파일용: 스틸 위에 T8 알파 mov 를 얹어 단일 클립으로 만든다. */
export async function renderParallaxComposite(
  still: string, overlay: string, durationSec: number, profile: EditProfile, outFile: string,
  opts: { cwd: string; timeoutSec: number },
): Promise<RenderResult> {
  const [w, h] = profile.video.resolution
  const fps = profile.video.fps
  const filter = `[0:v]${fitFilter(w, h, fps)}[bg];[1:v]scale=${w}:${h}[ov];[bg][ov]overlay=0:0:format=auto`
  const args = ['-y', '-loop', '1', '-i', still, '-i', overlay, '-t', String(durationSec), '-filter_complex', filter, '-pix_fmt', 'yuv420p', '-an', outFile]
  return ff(args, opts.cwd, opts.timeoutSec)
}

/* ─────────────── 임팩트 카드 배경(단색) ─────────────── */

/** 전체화면 강조 카드 배경. 색은 frame.md 검정(#0E1115) 기본, 호출부가 hex 를 넘긴다. */
export async function renderColorCard(
  hex: string, durationSec: number, profile: EditProfile, outFile: string, opts: { cwd: string; timeoutSec: number },
): Promise<RenderResult> {
  const [w, h] = profile.video.resolution
  const fps = profile.video.fps
  const color = hex.replace('#', '0x')
  const args = ['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}:r=${fps}:d=${durationSec}`, '-pix_fmt', 'yuv420p', outFile]
  return ff(args, opts.cwd, opts.timeoutSec)
}

/* ─────────────── zoompan 사진 사전 렌더(이미터 공용) ─────────────── */

export interface MaterializeResult { rendered: string[]; failed: { shot_id: string; reason: string }[] }

/**
 * 모델의 zoompan 사진 샷(render='zoompan')을 workDir 에 렌더하고 item.file 을 교체한다.
 * parallax(render='parallax_overlay') 오버레이가 없으면 해당 샷을 실패로 보고한다(fallback 금지).
 * 두 이미터가 렌더 결과를 공유하도록 assemble 오케스트레이터가 이미터 전에 한 번 호출한다.
 */
export async function materializeZoompan(
  model: TimelineModel, workDir: string, profile: EditProfile, opts: { cwd: string; timeoutSec: number },
): Promise<MaterializeResult> {
  mkdirSync(workDir, { recursive: true })
  const rendered: string[] = []
  const failed: { shot_id: string; reason: string }[] = []
  const lanes: TrackName[] = ['V1', 'V2', 'V3']
  for (const lane of lanes) {
    for (const it of model.tracks[lane]) {
      if (it.render === 'zoompan' && it.photo_motion !== undefined) {
        if (it.file === undefined || !existsSync(it.file)) { failed.push({ shot_id: it.shot_id ?? it.id, reason: `원본 스틸 없음: ${it.file ?? '(경로 없음)'}` }); continue }
        const out = resolve(workDir, `${it.id}_zoompan.mp4`)
        const res = await renderZoompan(it.file, { focal: it.photo_motion.focal, zoom: it.photo_motion.zoom, duration_sec: it.end - it.start }, profile, out, opts)
        if (!res.ok) { failed.push({ shot_id: it.shot_id ?? it.id, reason: `zoompan 렌더 실패: ${res.error}` }); continue }
        it.file = out
        it.file_exists = true
        rendered.push(out)
      } else if (it.render === 'parallax_overlay') {
        if (it.file === undefined || !existsSync(it.file)) failed.push({ shot_id: it.shot_id ?? it.id, reason: `parallax 모션 mov 부재(T8 렌더 필요): ${it.file ?? '(경로 없음)'}` })
      }
    }
  }
  return { rendered, failed }
}
