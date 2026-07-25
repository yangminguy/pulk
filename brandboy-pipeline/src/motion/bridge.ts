/**
 * bridge.ts — 모션 브릿지 + 사진 parallax 렌더 (T8, spec/06-motion.md)
 *
 * `critical` 비트의 원리 설명 화면과 사진(image) 샷의 parallax 를 hyperframes 로 렌더한다.
 * 저작(HTML composition)은 에이전트 소관이다. 이 모듈은 결정론적인 부분만 한다 —
 *   저작된 composition 디렉토리 → lint → check → render(--format mov, 알파) → probe.
 *
 * 실측 계약 (preflight-report.md P2c, 2026-07-25):
 *  - 버전 핀은 package.json(hyperframes 0.7.71). `npx hyperframes` 는 로컬 devDep 을 해석하므로
 *    @핀 접미사가 필요 없다. `@latest` 는 금지(매 실행 버전이 바뀌어 결정론이 깨진다).
 *  - `inspect` 는 deprecated → 후속 `check`(lint+runtime+layout+contrast 한 게이트) 를 쓴다.
 *    `check` 가 없거나 형식이 다르면 `inspect` 로 폴백한다(runLayoutGate).
 *  - 알파 산출: `render --format mov`(ProRes 4444, yuva444p12le). 경로 A(오버레이 V3).
 *  - 경로 D(단색 배경): CapCut 알파 인식 실패 대비. request/opts 의 background(hex) 를
 *    `--variables` 로 주입하는 렌더 스위치를 유지한다. 기본은 알파 mov(경로 A).
 *
 * 실패는 숨기지 않는다. lint 실패 / check 넘침·이탈 / render 비0 / probe 실패·길이 불일치는
 * 모두 failed[] 로 보고한다. **fallback_text 로 자동 대체하지 않는다**(spec §5).
 *
 * 편집 수치는 config/edit-profile.json(profile.ts) 이 유일 출처다. 아래 상수는 편집 수치가 아니라
 * 검증/타임아웃 구조 상수이며 // @unit 로 표시한다(scripts/verify-no-magic-numbers.ts 계약).
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { z } from 'zod'
import { run } from '../lib/proc.js'
import { cacheGet, cacheSet } from '../lib/cache.js'
import { sha256Hex, sha256File } from '../lib/canonical.js'
import { newReport, type PartialReport, type FailureItem } from '../lib/report.js'
import { repoRoot, type EditProfile } from '../lib/profile.js'
import { probeMedia } from '../lib/probe.js'

/* ─────────────── 구조 상수 (편집 수치 아님) ─────────────── */

// hyperframes render 는 헤드리스 크롬을 띄워 프레임마다 캡처한다. harvest.timeout_sec(60초)로는
// 부족하다(첫 실행 콜드스타트 + 프레임 수 비례). 기본값은 profile.motion.render_timeout_sec,
// 요청의 timeout_sec 필드가 있으면 그것이 우선한다.
// probe 로 잰 산출 길이 허용 오차는 profile.motion.duration_tolerance_sec 가 유일 출처다.

const DEFAULT_FORMAT = 'mov' // 경로 A: 알파(ProRes 4444) 오버레이
const STDERR_EXCERPT = 400 // @unit 실패 사유에 담는 stderr 발췌 길이(문자)

/* ─────────────── 요청 스키마 ─────────────── */

/** 모션 그래픽 요청 — motion/requests/<beat_id>.json */
const MotionRequestSchema = z.object({
  kind: z.literal('motion').optional(),
  beat_id: z.string().min(1),
  visual_statement: z.string().min(1),
  type: z.string().min(1),
  duration: z.number().positive(),
  frame_rev: z.number().int().positive(),
  importance: z.string().optional(), // critical|normal|bridge. template 폴백 게이트에 사용
  template: z.boolean().optional(), // true 면 템플릿 렌더 폴백(critical 아닌 비트만)
  timeout_sec: z.number().positive().optional(),
  background: z.string().optional(), // 경로 D: 단색 배경 hex 주입
  composition_dir: z.string().optional(), // 저작된 composition 디렉토리(생략 시 관례 경로)
})

/** 사진 parallax 요청 — motion/requests/<shot_id>.json (asset_kind:"image", photo_motion.type="parallax") */
const PhotoRequestSchema = z.object({
  kind: z.literal('photo'),
  shot_id: z.string().min(1),
  source_still: z.string().min(1), // 원본 스틸 파일 경로(캐시 키 = 파일 해시)
  focal: z.tuple([z.number(), z.number()]),
  zoom: z.tuple([z.number(), z.number()]),
  duration: z.number().positive(),
  frame_rev: z.number().int().positive(),
  timeout_sec: z.number().positive().optional(),
  background: z.string().optional(),
  composition_dir: z.string().optional(),
})

export type MotionRequest = z.infer<typeof MotionRequestSchema>
export type PhotoRequest = z.infer<typeof PhotoRequestSchema>
export type BridgeRequest = MotionRequest | PhotoRequest

export interface BridgeOptions {
  compositionsDir: string // 저작된 composition 들이 있는 디렉토리(<dir>/<id>)
  outDir: string // 산출 <id>.<format> 를 쓰는 디렉토리
  profile: EditProfile
  format?: string // 기본 'mov'(경로 A). 경로 D 는 background 와 함께 caller 가 지정
  cwd?: string // hyperframes 실행 cwd(로컬 0.7.71 해석). 기본 repoRoot()
}

export interface RequestOutput {
  id: string
  file: string
  duration: number
  cached: boolean
}

export interface RequestOutcome {
  id: string
  failure?: FailureItem
  output?: RequestOutput
}

export interface BridgeResult {
  report: PartialReport
  outputs: RequestOutput[]
}

/* ─────────────── 캐시 키 (spec §3 / §6) ─────────────── */

/** 모션 캐시 키 = sha256(visual_statement + type + duration + frame_rev). frame_rev 증가 시 미스. */
export function motionCacheKey(req: Pick<MotionRequest, 'visual_statement' | 'type' | 'duration' | 'frame_rev'>): string {
  return sha256Hex(JSON.stringify(['motion', req.visual_statement, req.type, req.duration, req.frame_rev]))
}

/** 사진 parallax 캐시 키 = sha256(source_still 파일해시 + focal + zoom + duration + frame_rev). */
export function photoCacheKey(req: Pick<PhotoRequest, 'focal' | 'zoom' | 'duration' | 'frame_rev'>, stillHash: string): string {
  return sha256Hex(JSON.stringify(['photo', stillHash, req.focal, req.zoom, req.duration, req.frame_rev]))
}

/* ─────────────── 템플릿 폴백 게이트 (spec §1, D5) ─────────────── */

/**
 * 템플릿 렌더 폴백(라벨·수치·출처·장절 카드 반복 패턴, factory hyperframes-runner)은 상한 있는
 * 저품질 경로다. `critical` 비트는 스킬 저작만 허용하고 템플릿 폴백을 거부한다(D5).
 */
export function templateFallbackGuard(importance: string | undefined): { allowed: boolean; reason: string } {
  if (importance === 'critical') {
    return { allowed: false, reason: 'critical 비트는 템플릿 렌더 폴백 금지 — 스킬 저작 필요(D5)' }
  }
  return { allowed: true, reason: '' }
}

/* ─────────────── 모션 총량 비중 (spec §8) ─────────────── */

/** 모션 총 길이가 profile.ratios.motion 범위(하한~상한) 안인지 검사한다. */
export function checkMotionRatio(
  motionTotalSec: number,
  videoDurationSec: number,
  range: readonly [number, number],
): { ok: boolean; ratio: number; range: readonly [number, number] } {
  const ratio = videoDurationSec > 0 ? motionTotalSec / videoDurationSec : 0
  return { ok: ratio >= range[0] && ratio <= range[1], ratio, range }
}

/* ─────────────── render 인자 조립 (경로 A / 경로 D) ─────────────── */

/**
 * render 인자. 경로 A: `render <dir> --format mov -o <out>`.
 * 경로 D: background(hex) 가 있으면 `--variables '{"background":"<hex>"}'` 주입 →
 *   composition 이 window.__hyperframes.getVariables().background 로 단색 배경을 칠한다.
 */
export function buildRenderArgs(dir: string, outFile: string, format: string, background?: string): string[] {
  const args = ['hyperframes', 'render', dir, '--format', format, '-o', outFile]
  if (background !== undefined) args.push('--variables', JSON.stringify({ background }))
  return args
}

/* ─────────────── JSON 산출 파싱 ─────────────── */

/** stdout 에서 바깥 중괄호 구간만 잘라 JSON.parse. npx 잡음/진행표시가 섞여도 견딘다. */
function parseJsonLoose(stdout: string): Record<string, unknown> | null {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    return JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function asNum(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

/* ─────────────── probe (T7b lib/probe.ts 위임) ─────────────── */

/** 산출 길이(초)를 잰다. 실패면 null. 실제 측정은 lib/probe.ts(M2 이식)가 한다. */
export async function probeDurationSec(file: string, timeoutSec: number, cwd: string): Promise<number | null> {
  const abs = resolve(cwd, file)
  if (!existsSync(abs)) return null
  const meta = await probeMedia(abs, timeoutSec)
  return meta !== null && Number.isFinite(meta.durationSec) ? meta.durationSec : null
}

/* ─────────────── lint / check 게이트 ─────────────── */

interface GateResult {
  ok: boolean
  reason: string
}

async function runLint(dir: string, cwd: string, timeoutSec: number): Promise<GateResult> {
  const r = await run('npx', ['hyperframes', 'lint', dir, '--json'], { timeoutSec, cwd })
  const parsed = parseJsonLoose(r.stdout)
  if (parsed === null) return { ok: false, reason: `lint 실행/파싱 실패 (code=${r.code}): ${r.stderr.trim().slice(0, STDERR_EXCERPT)}` }
  const errors = asNum(parsed['errorCount'])
  if (parsed['ok'] === true && errors === 0) return { ok: true, reason: '' }
  const findings = Array.isArray(parsed['findings']) ? (parsed['findings'] as Array<Record<string, unknown>>) : []
  const codes = findings.map((f) => String(f['code'])).join(', ')
  return { ok: false, reason: `lint 오류 ${errors}건: ${codes || '(코드 없음)'}` }
}

/**
 * check(lint+runtime+layout+contrast) 로 텍스트 넘침·캔버스 이탈을 잡는다. check 가 없거나 형식이
 * 다르면 inspect 로 폴백한다(preflight P2c: inspect deprecated 지만 잔존).
 */
async function runLayoutGate(dir: string, cwd: string, timeoutSec: number): Promise<GateResult> {
  const c = await run('npx', ['hyperframes', 'check', dir, '--json'], { timeoutSec, cwd })
  const parsed = parseJsonLoose(c.stdout)
  if (parsed !== null && ('layout' in parsed || 'runtime' in parsed)) {
    if (parsed['ok'] === true) return { ok: true, reason: '' }
    const layout = (parsed['layout'] ?? {}) as Record<string, unknown>
    const runtime = (parsed['runtime'] ?? {}) as Record<string, unknown>
    const layoutErr = asNum(layout['errorCount'])
    const runtimeErr = asNum(runtime['errorCount'])
    return { ok: false, reason: `check 실패 — layout 오류 ${layoutErr}건(텍스트 넘침/캔버스 이탈), runtime 오류 ${runtimeErr}건` }
  }
  // 폴백: inspect --json
  const ins = await run('npx', ['hyperframes', 'inspect', dir, '--json'], { timeoutSec, cwd })
  const insParsed = parseJsonLoose(ins.stdout)
  if (insParsed === null) return { ok: false, reason: `check/inspect 실행/파싱 실패 (check code=${c.code}, inspect code=${ins.code})` }
  const insErr = asNum(insParsed['errorCount'])
  if (insParsed['ok'] === true && insErr === 0) return { ok: true, reason: '' }
  return { ok: false, reason: `inspect 실패 — 오류 ${insErr}건(텍스트 넘침/캔버스 이탈)` }
}

/* ─────────────── composition 디렉토리 해석 ─────────────── */

/**
 * 저작된 composition 디렉토리를 해석한다.
 * 우선순위: request.composition_dir(요청 파일 기준 상대/절대) → <opts.compositionsDir>/<id>.
 */
function resolveCompositionDir(req: BridgeRequest, id: string, opts: BridgeOptions, requestFile?: string): string {
  if (req.composition_dir !== undefined) {
    const base = requestFile !== undefined ? dirname(requestFile) : opts.cwd ?? repoRoot()
    return resolve(base, req.composition_dir)
  }
  return resolve(opts.compositionsDir, id)
}

/* ─────────────── 렌더 체인 (lint → check → render → probe) ─────────────── */

async function renderChain(
  id: string,
  dir: string,
  outFile: string,
  duration: number,
  importance: string | undefined,
  timeoutSec: number,
  toleranceSec: number,
  format: string,
  background: string | undefined,
  cwd: string,
): Promise<RequestOutcome> {
  const fail = (reason: string): RequestOutcome => ({ id, failure: { beat_id: id, importance, reason, action_required: true } })

  if (!existsSync(dir)) return fail(`composition 디렉토리 없음: ${dir} (에이전트 저작 필요)`)

  const lint = await runLint(dir, cwd, timeoutSec)
  if (!lint.ok) return fail(lint.reason)

  const gate = await runLayoutGate(dir, cwd, timeoutSec)
  if (!gate.ok) return fail(gate.reason)

  const rendered = await run('npx', buildRenderArgs(dir, outFile, format, background), { timeoutSec, cwd })
  if (rendered.code !== 0) {
    return fail(`render 종료코드 ${rendered.code}: ${rendered.stderr.trim().slice(0, STDERR_EXCERPT)}`)
  }

  const dur = await probeDurationSec(outFile, timeoutSec, cwd)
  if (dur === null) return fail(`probe 실패: 산출 파일 없음/손상 (${outFile})`)
  if (Math.abs(dur - duration) > toleranceSec) {
    return fail(`산출 길이 불일치: probe=${dur}s vs 요청=${duration}s (허용 ±${toleranceSec}s)`)
  }
  return { id, output: { id, file: outFile, duration: dur, cached: false } }
}

/* ─────────────── 단건 처리 ─────────────── */

/**
 * 요청 1건을 처리한다. 캐시 히트(키 동일 + 산출 존재)면 재렌더하지 않는다.
 *
 * 켄번즈(다운그레이드)는 여기서 처리하지 않는다 — T5 조립의 ffmpeg zoompan 소관(spec §6, T5 §3).
 * 여기는 parallax(레이어 분리 + 카메라 이동) 저작물의 렌더/검증만 담당한다.
 */
export async function renderRequest(req: BridgeRequest, opts: BridgeOptions, requestFile?: string): Promise<RequestOutcome> {
  const cwd = opts.cwd ?? repoRoot()
  const format = opts.format ?? DEFAULT_FORMAT
  const timeoutSec = req.timeout_sec ?? opts.profile.motion.render_timeout_sec

  const isPhoto = req.kind === 'photo'
  const id = isPhoto ? (req as PhotoRequest).shot_id : (req as MotionRequest).beat_id
  const importance = isPhoto ? undefined : (req as MotionRequest).importance

  // 템플릿 폴백 게이트 — critical 비트 거부(모션 요청만 해당).
  if (!isPhoto && (req as MotionRequest).template === true) {
    const guard = templateFallbackGuard(importance)
    if (!guard.allowed) {
      return { id, failure: { beat_id: id, importance, reason: guard.reason, action_required: true } }
    }
  }

  // 캐시 키 + 히트 판정.
  const base = requestFile !== undefined ? dirname(requestFile) : cwd
  let key: string
  if (isPhoto) {
    const p = req as PhotoRequest
    const stillPath = resolve(base, p.source_still) // 요청 파일 기준 상대/절대 해석
    if (!existsSync(stillPath)) {
      return { id, failure: { shot_id: id, reason: `원본 스틸 없음: ${stillPath}`, action_required: true } }
    }
    key = photoCacheKey(p, sha256File(stillPath))
  } else {
    key = motionCacheKey(req as MotionRequest)
  }
  const ttlDays = opts.profile.harvest.cache_ttl_days
  const hit = cacheGet(key, { ttlDays }) as { file: string; duration: number } | null
  if (hit !== null && existsSync(hit.file)) {
    return { id, output: { id, file: hit.file, duration: hit.duration, cached: true } }
  }

  const dir = resolveCompositionDir(req, id, opts, requestFile)
  const outFile = resolve(opts.outDir, `${id}.${format}`)
  const outcome = await renderChain(id, dir, outFile, req.duration, importance, timeoutSec, opts.profile.motion.duration_tolerance_sec, format, req.background, cwd)

  if (outcome.output !== undefined) {
    cacheSet(key, { file: outcome.output.file, duration: outcome.output.duration })
  }
  return outcome
}

/* ─────────────── 요청 로드 ─────────────── */

/** 요청 파일을 읽어 kind 로 분기 검증한다. 검증 실패는 throw(호출부가 failed[] 로 잡는다). */
export function loadRequest(file: string): BridgeRequest {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  if (raw['kind'] === 'photo') return PhotoRequestSchema.parse(raw)
  return MotionRequestSchema.parse(raw)
}

/* ─────────────── 다건 실행 ─────────────── */

/**
 * 요청 파일 목록을 순차 처리해 PartialReport 를 만든다. 한 건 실패가 전체를 멈추지 않는다.
 * 실패는 failed[] 로만 보고한다(fallback_text 자동 대체 없음).
 */
export async function runBridge(requestFiles: string[], opts: BridgeOptions): Promise<BridgeResult> {
  const report = newReport()
  const outputs: RequestOutput[] = []
  for (const file of requestFiles) {
    let req: BridgeRequest
    try {
      req = loadRequest(file)
    } catch (err) {
      report.failed.push({ reason: `요청 파싱 실패 (${file}): ${(err as Error).message}`, action_required: true })
      continue
    }
    const outcome = await renderRequest(req, opts, file)
    if (outcome.failure !== undefined) {
      report.failed.push(outcome.failure)
    } else if (outcome.output !== undefined) {
      report.processed += 1
      outputs.push(outcome.output)
    }
  }
  report.ok = report.failed.length === 0 && report.blocked.length === 0
  return { report, outputs }
}
