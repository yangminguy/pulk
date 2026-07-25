/**
 * 파이프라인 데이터 계약 — 단일 진실 (rev5)
 *
 * brandboy 원본 schema/pipeline.ts 를 시작점으로 rev5 계약 필드를 추가했다.
 * 모든 모듈이 여기서 import 한다. 필드명을 임의로 바꾸면 파이프라인이 끊긴다.
 *
 * 편집 수치 기준은 여기 없다. config/edit-profile.json 에 있다 (src/lib/profile.ts 로더 경유).
 * 아래 숫자 리터럴은 편집 수치가 아니라 스키마 형태 상수(ID 길이·해시 길이·에너지 범위)이며
 * // @unit 로 표시한다.
 */
import { z } from 'zod'

/* ─────────────── 스키마 형태 상수 (편집 수치 아님) ─────────────── */

const SENTENCE_KEY_LEN = 8 // @unit 사람 부여 불변 문장 ID 길이 (CONTRACTS §2)
const SEAL_HEX_LEN = 64 // @unit sha256 hex 길이 (V14 봉인 해시)
const ENERGY_MAX = 5 // @unit 세그먼트/음악 에너지 상한
const ENERGY_DEFAULT = 3 // @unit 세그먼트/음악 에너지 기본

/* ─────────────── 열거형 (const 배열 + zod enum 병행 노출) ─────────────── */

export const ACTS = ['hook', 'build', 'reveal', 'punch'] as const
export const Act = z.enum(ACTS)

export const VISUAL_FUNCTIONS = [
  'evidence', // 사실·숫자·발언을 증명
  'literal', // 말하는 대상·행동을 직접 보여줌
  'emotion', // 감정과 욕망을 체감
  'explain', // 구조·원리·비교
  'context', // 시대·장소·문화
  'reset', // 진행자 화면
  'caption_card', // 반전·숫자·결론을 정지시켜 보여줌
] as const
export const VisualFunction = z.enum(VISUAL_FUNCTIONS)

export const ASSET_KINDS = [
  'a_roll', 'official_video', 'interview', 'advertisement', 'news',
  'archive', 'product_page', 'social', 'stock', 'still', 'image', 'motion',
  'caption_card',
  'fallback_text', // 수급 실패 상태. 최종 승인 불가 (V11)
] as const
export const AssetKind = z.enum(ASSET_KINDS)

export const RIGHTS_STATUSES = [
  'owned', 'permission', 'licensed', 'public_domain', 'cc',
  'quotation_review', 'blocked', 'unknown',
] as const
export const RightsStatus = z.enum(RIGHTS_STATUSES)

export const IMPORTANCES = ['critical', 'normal', 'bridge'] as const
export const Importance = z.enum(IMPORTANCES)

export const SELECTION_STATUSES = ['need', 'candidate', 'selected', 'approved'] as const
export const SelectionStatus = z.enum(SELECTION_STATUSES)

export const SourceAudio = z.enum(['mute', 'moment', 'quote'])

export const PHOTO_MOTION_TYPES = [
  'parallax', 'ken_burns', 'zoom_in', 'zoom_out', 'pan_lr', 'pan_ud',
] as const
export const PhotoMotionType = z.enum(PHOTO_MOTION_TYPES)

/* ─────────────── 근거 ─────────────── */

export const Evidence = z.object({
  evidence_id: z.string().regex(/^e\d{3}$/),
  summary: z.string().min(1),
  original_url: z.string().url(),
  publisher: z.string().min(1),
  published_at: z.string().optional(),
  event_date: z.string().optional(),
  source_id: z.string().optional(),
  source_at: z.number().optional(),
})

export const Claim = z.object({
  claim_id: z.string().regex(/^c\d{3}$/),
  text: z.string().min(1),
  status: z.enum(['fact', 'third_party_claim', 'analysis', 'uncertain']),
  importance: z.enum(['critical', 'supporting', 'color']),
  evidence_ids: z.array(z.string()).default([]),
})

/* ─────────────── 원고 ─────────────── */

export const Segment = z.object({
  segment_id: z.string().regex(/^g\d{2,3}$/),
  act: Act,
  purpose: z.string().min(1),
  energy: z.number().int().min(0).max(ENERGY_MAX).default(ENERGY_DEFAULT),
  bgm_cue: z.string().optional(),
  chapter_label: z.string().optional(),
})

export const ScriptSentence = z.object({
  sentence_key: z.string().length(SENTENCE_KEY_LEN), // rev5: 사람 부여 불변 ID
  sentence_id: z.string().regex(/^sn\d{3,4}$/), // 표시·정렬용 (가변)
  segment_id: z.string().regex(/^g\d{2,3}$/),
  text: z.string().min(1),
  claim_ids: z.array(z.string()).default([]),
  speaker_mode: z.enum(['voice_over', 'a_roll', 'source_quote']).default('voice_over'),
  visual_note: z.string().optional(),
  emphasis_caption: z.string().optional(),
})

/* ─────────────── 녹음 세션 (rev5) ─────────────── */

export const RecordingSession = z.object({
  id: z.string().regex(/^session-\d{2}$/),
  wav_path: z.string(),
  from_sentence_key: z.string().length(SENTENCE_KEY_LEN),
  to_sentence_key: z.string().length(SENTENCE_KEY_LEN),
})

/* ─────────────── 타임라인 ─────────────── */

export const Word = z.object({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().positive(),
})

export const TimelineSentence = ScriptSentence.extend({
  start: z.number().nonnegative(),
  end: z.number().positive(),
  words: z.array(Word),
})

export const Timeline = z.object({
  duration: z.number().positive(),
  align_rev: z.number().int().nonnegative(), // rev5: 이 타임라인을 만든 align 리비전 (V13)
  profile_rev: z.number().int().positive(), // rev5: 생성 시점 profile_rev (V16)
  word_timing: z.enum(['exact', 'estimated']), // rev5: 경로 A=exact / 경로 B=estimated(방어)
  sentences: z.array(TimelineSentence),
})

/* ─────────────── 앵커 (Beat / Shot 공통, rev5) ─────────────── */

export const Anchor = z.object({
  sentence_key: z.string().length(SENTENCE_KEY_LEN),
  offset_sec: z.number().nonnegative(),
})

/* ─────────────── 비트와 샷 ─────────────── */

export const Beat = z.object({
  beat_id: z.string().regex(/^b\d{3,4}[a-z]?$/), // rev5: 재분할 접미사(b042a) 허용
  segment_id: z.string().regex(/^g\d{2,3}$/),
  narration: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  visual_function: VisualFunction,
  importance: Importance,
  search_intent: z.string().min(1),

  anchor: Anchor, // rev5
  timing_rev: z.number().int().nonnegative(), // rev5

  claim_ids: z.array(z.string()).default([]),
  must_show: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  emphasis_caption: z.string().optional(),
  sfx_cue: z.string().optional(),
})

/* ── 사진 촬영 모션 (Z2, asset_kind:"image" 전용, rev5) ── */

export const PhotoMotion = z.object({
  type: PhotoMotionType.default('parallax'),
  focal: z.tuple([z.number(), z.number()]), // 초점(피사체 중심, 0~1 정규화)
  zoom: z.tuple([z.number(), z.number()]), // from→to (예: 1.0→1.18)
  duration_sec: z.number().positive(),
})

export const Shot = z.object({
  shot_id: z.string().regex(/^sh\d{4}$/),
  beat_ids: z.array(z.string()).min(1), // 복수 — 한 샷이 인접 비트 2개를 덮을 수 있다
  start: z.number().nonnegative(),
  end: z.number().positive(),
  asset_kind: AssetKind,
  purpose: z.string().min(1), // "관련 영상" 금지. 무엇을 왜 보여줄지
  selection_status: SelectionStatus,
  rights_status: RightsStatus,

  source_id: z.string().optional(),
  source_in: z.number().nonnegative().optional(),
  source_out: z.number().positive().optional(),
  file: z.string().optional(),

  source_audio: SourceAudio.default('mute'),
  source_audio_in: z.number().optional(),
  source_audio_out: z.number().optional(),

  emphasis_caption: z.string().optional(),
  framing: z.enum(['wide', 'person', 'product', 'detail', 'proof']).optional(),

  anchor: Anchor, // rev5
  timing_rev: z.number().int().nonnegative(), // rev5
  locked_selection: z.boolean().default(false), // rev5: 원본 `locked` 대체
  needs_review: z.boolean().optional(), // rev5
  orphaned: z.boolean().optional(), // rev5
  photo_motion: PhotoMotion.optional(), // rev5: asset_kind:"image"면 필수 (V18)
  // 원본 `locked` 제거. `locked_timing` 은 만들지 않는다 (V13 과 충돌)
})

export const CoverageGap = z.object({
  beat_id: z.string(),
  from: z.number(),
  to: z.number(),
  reason: z.string(),
})

export const Writers = z.object({
  plan_rev: z.number().int().nonnegative(),
  review_rev: z.number().int().nonnegative(),
  reanchor_rev: z.number().int().nonnegative(),
  seal: z.string().length(SEAL_HEX_LEN), // V14 봉인 해시. writeScoped 마지막 단계에서 CLI 가 갱신
})

export const ShotPlan = z.object({
  project: z.string().regex(/^[a-z0-9-]+$/),
  segments: z.array(Segment),
  beats: z.array(Beat),
  shots: z.array(Shot),

  revision: z.number().int().nonnegative(), // rev5
  writers: Writers, // rev5
  profile_rev: z.number().int().positive(), // rev5
  frame_rev: z.number().int().positive(), // rev5
  coverage_gap: z.array(CoverageGap).default([]), // rev5: 보존 샷 미달 보고 (V17 짝)
})

/* ─────────────── 후보 (harvest 산출, rev5 score_source) ─────────────── */

export const Candidate = z.object({
  source_id: z.string(),
  source_in: z.number().nonnegative(),
  source_out: z.number().positive(),
  score: z.number(),
  score_source: z.enum(['lexical', 'agent_rerank']), // rev5
  rights_status: RightsStatus,
  text: z.string().optional(),
})

/* ─────────────── 원본 ─────────────── */

export const Source = z.object({
  source_id: z.string().regex(/^src_\d{3}$/),
  title: z.string(),
  publisher: z.string(),
  original_url: z.string().url(),
  published_at: z.string().optional(),
  duration: z.number().optional(),
  language: z.string().optional(),
  kind: AssetKind,
  rights_status: RightsStatus,
  is_official: z.boolean().default(false),
  has_transcript: z.boolean().default(false),
  local_path: z.string().optional(),
  proxy_path: z.string().optional(),
})

export const Usage = z.object({
  shot_id: z.string(),
  source_id: z.string(),
  source_in: z.number(),
  source_out: z.number(),
  video_in: z.number(),
  video_out: z.number(),
  credit_text: z.string(),
  rights_status: RightsStatus,
})

/* ─────────────── 큐 ─────────────── */

export const MusicCue = z.object({
  start: z.number().nonnegative(),
  end: z.number().positive(),
  role: z.enum(['hook-tension', 'discovery', 'conflict', 'momentum', 'reflection', 'conclusion', 'silence']),
  energy: z.number().int().min(0).max(ENERGY_MAX),
  note: z.string().optional(),
})

export const SoundCue = z.object({
  at: z.number().nonnegative(),
  role: z.string(),
  linked_beat: z.string().optional(),
  required: z.boolean().default(false),
})

/* ─────────────── 타입 ─────────────── */

export type Act = z.infer<typeof Act>
export type VisualFunction = z.infer<typeof VisualFunction>
export type AssetKind = z.infer<typeof AssetKind>
export type Importance = z.infer<typeof Importance>
export type SelectionStatus = z.infer<typeof SelectionStatus>
export type Segment = z.infer<typeof Segment>
export type Anchor = z.infer<typeof Anchor>
export type Beat = z.infer<typeof Beat>
export type PhotoMotion = z.infer<typeof PhotoMotion>
export type Shot = z.infer<typeof Shot>
export type CoverageGap = z.infer<typeof CoverageGap>
export type Writers = z.infer<typeof Writers>
export type ShotPlan = z.infer<typeof ShotPlan>
export type Candidate = z.infer<typeof Candidate>
export type TimelineSentence = z.infer<typeof TimelineSentence>
export type Timeline = z.infer<typeof Timeline>
export type RecordingSession = z.infer<typeof RecordingSession>
export type Claim = z.infer<typeof Claim>
export type Source = z.infer<typeof Source>
export type Usage = z.infer<typeof Usage>
