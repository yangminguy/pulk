/**
 * 파이프라인 데이터 계약 — 단일 진실
 *
 * 이 파일을 그대로 src/types/pipeline.ts에 복사해서 시작한다.
 * 모든 모듈이 여기서 import 한다. 필드명을 임의로 바꾸면 파이프라인이 끊긴다.
 *
 * 수치 기준은 여기 없다. config/edit-profile.json에 있다.
 */
import { z } from 'zod'

/* ─────────────── 열거형 ─────────────── */

export const Act = z.enum(['hook', 'build', 'reveal', 'punch'])

export const VisualFunction = z.enum([
  'evidence',      // 사실·숫자·발언을 증명
  'literal',       // 말하는 대상·행동을 직접 보여줌
  'emotion',       // 감정과 욕망을 체감
  'explain',       // 구조·원리·비교
  'context',       // 시대·장소·문화
  'reset',         // 진행자 화면
  'caption_card',  // 반전·숫자·결론을 정지시켜 보여줌
])

export const AssetKind = z.enum([
  'a_roll', 'official_video', 'interview', 'advertisement', 'news',
  'archive', 'product_page', 'social', 'stock', 'still', 'motion',
  'caption_card',
  'fallback_text', // 수급 실패 상태. 최종 승인 불가 (V11)
])

export const RightsStatus = z.enum([
  'owned', 'permission', 'licensed', 'public_domain', 'cc',
  'quotation_review', 'blocked', 'unknown',
])

export const Importance = z.enum(['critical', 'normal', 'bridge'])
export const SelectionStatus = z.enum(['need', 'candidate', 'selected', 'approved'])
export const SourceAudio = z.enum(['mute', 'moment', 'quote'])

/* ─────────────── 근거 ─────────────── */

export const Evidence = z.object({
  evidence_id: z.string().regex(/^e\d{3}$/),
  summary: z.string().min(1),
  original_url: z.string().url(),
  publisher: z.string().min(1),
  published_at: z.string().optional(),
  event_date: z.string().optional(),
  source_id: z.string().optional(),   // 영상으로 쓸 수 있으면 원본 참조
  source_at: z.number().optional(),   // 원본 내 위치(초)
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
  energy: z.number().int().min(0).max(5).default(3),
  bgm_cue: z.string().optional(),
  chapter_label: z.string().optional(),
})

export const ScriptSentence = z.object({
  sentence_id: z.string().regex(/^sn\d{3,4}$/),
  segment_id: z.string().regex(/^g\d{2,3}$/),
  text: z.string().min(1),
  claim_ids: z.array(z.string()).default([]),
  speaker_mode: z.enum(['voice_over', 'a_roll', 'source_quote']).default('voice_over'),
  visual_note: z.string().optional(),
  emphasis_caption: z.string().optional(),
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
  sentences: z.array(TimelineSentence),
})

/* ─────────────── 비트와 샷 ─────────────── */

export const Beat = z.object({
  beat_id: z.string().regex(/^b\d{3,4}$/),
  segment_id: z.string().regex(/^g\d{2,3}$/),
  narration: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  visual_function: VisualFunction,
  importance: Importance,
  search_intent: z.string().min(1),

  // 선택 — 있으면 harvest와 review 품질이 크게 올라간다
  claim_ids: z.array(z.string()).default([]),
  must_show: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  emphasis_caption: z.string().optional(),
  sfx_cue: z.string().optional(),
})

export const Shot = z.object({
  shot_id: z.string().regex(/^sh\d{4}$/),
  beat_ids: z.array(z.string()).min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  asset_kind: AssetKind,
  purpose: z.string().min(1),        // "관련 영상" 금지. 무엇을 왜 보여줄지
  selection_status: SelectionStatus,
  rights_status: RightsStatus,

  source_id: z.string().optional(),
  source_in: z.number().nonnegative().optional(),
  source_out: z.number().positive().optional(),
  file: z.string().optional(),        // assets/selected/ 상대 경로

  source_audio: SourceAudio.default('mute'),
  source_audio_in: z.number().optional(),
  source_audio_out: z.number().optional(),

  emphasis_caption: z.string().optional(),
  framing: z.enum(['wide', 'person', 'product', 'detail', 'proof']).optional(),
  locked: z.boolean().default(false), // 사람이 확정. --force 없이 덮어쓰지 않음
})

export const ShotPlan = z.object({
  project: z.string().regex(/^[a-z0-9-]+$/),
  segments: z.array(Segment),
  beats: z.array(Beat),
  shots: z.array(Shot),
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
  video_in: z.number(),      // 완성 영상 내 위치
  video_out: z.number(),
  credit_text: z.string(),   // 화면 표기 문구
  rights_status: RightsStatus,
})

/* ─────────────── 큐 ─────────────── */

export const MusicCue = z.object({
  start: z.number().nonnegative(),
  end: z.number().positive(),
  role: z.enum(['hook-tension', 'discovery', 'conflict', 'momentum', 'reflection', 'conclusion', 'silence']),
  energy: z.number().int().min(0).max(5),
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
export type Beat = z.infer<typeof Beat>
export type Shot = z.infer<typeof Shot>
export type ShotPlan = z.infer<typeof ShotPlan>
export type Timeline = z.infer<typeof Timeline>
export type Source = z.infer<typeof Source>
export type Usage = z.infer<typeof Usage>
export type EditProfile = Record<string, any> // config/edit-profile.json
