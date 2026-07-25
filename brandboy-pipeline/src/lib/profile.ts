/**
 * profile.ts — 수치 단일 출처 로더 (T1 §2)
 *
 * 편집에 쓰는 모든 수치는 projects/<slug>/edit-profile.json 에서만 읽는다.
 * 코드에 상수 리터럴이 남으면 그 자체가 결함이다(scripts/verify-no-magic-numbers.ts 가 강제).
 *
 * - 프로젝트에 edit-profile.json 이 없으면 config/ 에서 복사하고 stderr 경고를 남긴다.
 * - 모든 키를 zod 로 전수 검증한다. 누락 키는 즉시 실패(ConfigError → exit 2 수준).
 *   런타임에 undefined 가 흘러가 나중에 NaN 비교가 조용히 false 가 되는 것을 막는다.
 * - profile_rev / frame_rev 를 반환해 산출물이 생성 시점 값을 기록할 수 있게 한다.
 */
import { readFileSync, existsSync, copyFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { z } from 'zod'

/** 편집 수치 로더/프레임 로더 실패 — CLI 는 exit 2 로 매핑한다. */
export class ConfigError extends Error {}

/* ─────────────── 레포 루트 탐색 ─────────────── */

export function repoRoot(): string {
  let dir = process.cwd()
  for (;;) {
    if (existsSync(join(dir, 'config', 'edit-profile.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return process.cwd()
    dir = parent
  }
}

/* ─────────────── edit-profile.json 전수 스키마 ─────────────── */

const Pair = z.tuple([z.number(), z.number()])
const NumArr = z.array(z.number())
const StrArr = z.array(z.string())

const ActProfile = z.object({
  shot_sec: Pair,
  music_role: z.string(),
  must_show: StrArr,
})

export const EditProfileSchema = z.object({
  profile_rev: z.number().int().positive(),
  profile: z.string(),
  _note: z.string().optional(),
  video: z.object({
    duration_target_sec: Pair,
    resolution: Pair,
    fps: z.number(),
  }),
  rhythm: z.object({
    visual_change_target_sec: Pair,
    intro_30s_visual_changes_min: z.number(),
    intro_30s_visual_changes_max: z.number(),
    presenter_reset_interval_sec: Pair,
    source_audio_interval_sec: Pair,
  }),
  ratios: z.object({
    a_roll: Pair,
    motion: Pair,
    stock_max: z.number(),
    same_source_max: z.number(),
  }),
  counts_per_15min: z.object({
    impact_cards: Pair,
    chapter_labels: Pair,
    sfx: Pair,
  }),
  acts: z.object({
    hook: ActProfile,
    build: ActProfile,
    reveal: ActProfile,
    punch: ActProfile,
  }),
  beats: z.object({
    max_duration_sec: z.number(),
    coverage_gap_max_sec: z.number(),
    expected_count_per_15min: Pair,
    min_candidates: z.object({
      critical: z.number(),
      normal: z.number(),
      bridge: z.number(),
    }),
    critical_requires_alternative: z.boolean(),
  }),
  shots: z.object({
    still_max_sec: z.number(),
    still_typical_sec: Pair,
    same_source_run_max_sec: z.number(),
    same_source_run_max_shots: z.number(),
    same_framing_run_max_shots: z.number(),
    interview_face_max_sec: z.number(),
    source_audio_sec: Pair,
    handle_sec: z.number(),
    loop_allowed: z.boolean(),
  }),
  captions: z.object({
    base: z.object({
      size_px: Pair,
      max_lines: z.number(),
      chars_per_line: Pair,
      block_sec: Pair,
      baseline_pct: Pair,
      box_opacity: Pair,
      box_width_max_pct: z.number(),
    }),
    keyword: z.object({
      size_ratio: Pair,
      colors: StrArr,
      max_words_per_block: z.number(),
      pop_sec: Pair,
      overshoot_pct: Pair,
      usage_ratio: Pair,
      same_color_max_run_sec: z.number(),
    }),
    impact_card: z.object({
      size_px: Pair,
      max_lines: z.number(),
      max_words: z.number(),
      hold_sec: Pair,
      lead_sec: Pair,
      sync_tolerance_sec: z.number(),
      sync_tolerance_estimated_sec: z.number(),
    }),
    chapter: z.object({
      size_px: Pair,
      hold_sec: Pair,
      words: Pair,
    }),
    person: z.object({
      name_px: Pair,
      title_px: Pair,
      hold_sec: Pair,
    }),
    source: z.object({
      size_px: Pair,
      opacity: Pair,
      hold_sec: Pair,
    }),
    timing: z.object({
      lead_sec: Pair,
      tail_sec: Pair,
      min_block_sec: z.number(),
      emphasis_tolerance_sec: z.number(),
      group_max_chars: z.number(),
      group_max_gap_ms: z.number(),
      group_max_words: z.number(),
    }),
  }),
  audio: z.object({
    program_lufs: z.number(),
    true_peak_dbtp: z.number(),
    crossfade_ms: Pair,
    roomtone_ms: Pair,
    retake_silence_threshold_sec: z.number(),
    silence_detect_db: z.number(),
    narration_padding_sec: z.object({ head: z.number(), tail: z.number() }),
    merge_gap_sec: z.number(),
    per_scene_normalize: z.boolean(),
    session_lufs_deviation_max: z.number(),
    session_noise_floor_deviation_db: z.number(),
    session_boundary_discontinuity_db: z.number(),
  }),
  align: z.object({
    similarity_threshold: z.number(),
    similarity_low_confidence: Pair,
    search_window_multiplier: z.number(),
    window_ratio: Pair,
    snap_tolerance_sec: z.number(),
  }),
  harvest: z.object({
    resolution_min_short_side: z.number(),
    proxy_height: z.number(),
    youtube_duration_limit_sec: z.number().nullable(),
    preview_context_sec: Pair,
    cache_ttl_days: z.number(),
    concurrency: z.number(),
    retry: z.number(),
    retry_backoff_sec: NumArr,
    timeout_sec: z.number(),
    score_weights: z.object({
      semantic_match: z.number(),
      evidence_strength: z.number(),
      visual_action: z.number(),
      originality: z.number(),
      diversity: z.number(),
      resolution: z.number(),
    }),
    proxy_budget_gb: z.number(),
    proxy_max_candidates_per_beat: z.number(),
    search: z.object({
      ngram_min: z.number(),
      ngram_max: z.number(),
      top_n: z.number(),
      semantic_source: z.enum(['lexical', 'agent_rerank']),
    }),
  }),
  motion: z.object({
    ratio_max: z.number(),
    number_hold_min_sec: z.number(),
    tail_hold_sec: Pair,
    max_elements: z.number(),
    requires_evidence_id_for_numbers: z.boolean(),
    render_timeout_sec: z.number(),
    duration_tolerance_sec: z.number(),
  }),
  qc: z.object({
    stagnant_range_sec: z.number(),
    same_function_run_max: z.number(),
    critical_beat_coverage: z.number(),
    traceable_external_shots: z.number(),
    blocking_rights_status: StrArr,
  }),
  sources: z.object({
    prefer_kind: StrArr,
    still_only_on_emphasis: z.boolean(),
    still_image_max_per_15min: Pair,
  }),
  photo_motion: z.object({
    default: z.string(),
    zoom_range: Pair,
    pan_max_pct: z.number(),
    min_move_sec: z.number(),
    downgrade: z.string(),
  }),
  tracks: z.object({
    allowed_overlap_sec: z.number(),
    lane_by_asset_kind: z.record(z.string(), z.string()),
  }),
})

export type EditProfile = z.infer<typeof EditProfileSchema>

/* ─────────────── frame.md 로더 ─────────────── */

export interface FrameTokens {
  frame_rev: number
  colors: string[] // #RRGGBB
  sizes_px: number[]
}

function issueSummary(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`)
    .join(' | ')
}

/** config/ 폴백 부트스트랩 동작. bootstrap=false(기본): 프로젝트에 쓰지 않고 config 를 메모리로 읽는다. */
export interface LoadOptions {
  bootstrap?: boolean
}

/**
 * loadProfile — projects/<slug>/edit-profile.json 을 읽어 전수 검증한다.
 * 파일 부재 시:
 *  - bootstrap=true: config/ 에서 복사하고 경고(프로젝트에 파일 생성).
 *  - bootstrap=false(기본): 쓰지 않고 config/ 를 메모리로 로드 + 경고 1줄.
 * 읽기 성격 명령(validate·qc·--dry-run 등)이 프로젝트 상태를 오염시키지 않게 한다.
 */
export function loadProfile(projectDir: string, opts?: LoadOptions): EditProfile {
  const target = resolve(projectDir, 'edit-profile.json')
  let readPath = target
  if (!existsSync(target)) {
    const fallback = join(repoRoot(), 'config', 'edit-profile.json')
    if (!existsSync(fallback)) {
      throw new ConfigError(`edit-profile.json 없음: ${target} · config 폴백도 없음: ${fallback}`)
    }
    if (opts?.bootstrap) {
      copyFileSync(fallback, target)
      process.stderr.write(`[warn] ${target} 없음 → config/edit-profile.json 복사\n`)
    } else {
      readPath = fallback
      process.stderr.write(`[warn] ${target} 없음 → config/edit-profile.json 메모리 폴백(쓰기 없음)\n`)
    }
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(readPath, 'utf8'))
  } catch (err) {
    throw new ConfigError(`edit-profile.json 파싱 실패: ${readPath} · ${(err as Error).message}`)
  }
  const parsed = EditProfileSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ConfigError(`edit-profile.json 키 검증 실패 (${readPath}): ${issueSummary(parsed.error)}`)
  }
  return parsed.data
}

/**
 * loadFrame — frame.md 에서 frame_rev 와 디자인 토큰(색 hex·px 크기)을 파싱한다.
 * 파일 부재 시 loadProfile 과 동일한 bootstrap 정책을 따른다(기본 false: 쓰지 않고 config 메모리 로드).
 */
export function loadFrame(projectDir: string, opts?: LoadOptions): FrameTokens {
  const target = resolve(projectDir, 'frame.md')
  let readPath = target
  if (!existsSync(target)) {
    const fallback = join(repoRoot(), 'config', 'frame.md')
    if (!existsSync(fallback)) {
      throw new ConfigError(`frame.md 없음: ${target} · config 폴백도 없음: ${fallback}`)
    }
    if (opts?.bootstrap) {
      copyFileSync(fallback, target)
      process.stderr.write(`[warn] ${target} 없음 → config/frame.md 복사\n`)
    } else {
      readPath = fallback
      process.stderr.write(`[warn] ${target} 없음 → config/frame.md 메모리 폴백(쓰기 없음)\n`)
    }
  }
  const text = readFileSync(readPath, 'utf8')
  const revMatch = text.match(/frame_rev:\s*(\d+)/)
  if (revMatch === null || revMatch[1] === undefined) {
    throw new ConfigError(`frame.md 에 frame_rev 없음: ${target}`)
  }
  const colors = [...text.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0])
  const sizes_px = [...text.matchAll(/(\d+)px/g)].map((m) => Number(m[1]))
  return { frame_rev: Number(revMatch[1]), colors, sizes_px }
}
