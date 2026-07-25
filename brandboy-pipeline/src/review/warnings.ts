/**
 * warnings.ts — 축소 타임라인 자동 경고 7종 (T4 §5 · spec/05:139 · CONTRACTS V18b)
 *
 * 순수 함수다. HTML 생성 시점(render.ts)에 edit-profile.json 의 수치를 주입받아 계산하고,
 * 그 결과를 스토리보드 HTML 의 축소 타임라인에 박는다. verify-review.ts 도 이 함수를 직접
 * import 해 7종이 각각 발생하는지 실증한다.
 *
 * 수치는 전부 profile 인자에서 온다. 코드 리터럴은 도메인 창(30초 훅·900초=15분) 뿐이며
 * // @unit 로 표시한다(scripts/verify-no-magic-numbers.ts).
 *
 * 7종 (T4 §5):
 *  w1 같은 원본 연속 ≥ shots.same_source_run_max_sec
 *  w2 같은 화면 크기 ≥ shots.same_framing_run_max_shots 연속
 *  w3 정지 이미지 길이 > shots.still_max_sec
 *  w4 훅 30초 시각 변화 < rhythm.intro_30s_visual_changes_min
 *  w5 강조 카드 수가 counts_per_15min.impact_cards 범위 밖
 *  w6 원본음 간격이 rhythm.source_audio_interval_sec 범위 밖
 *  w7 사진이 비강조 비트 / 15분당 sources.still_image_max_per_15min 초과 (V18b)
 */
import type { EditProfile } from '../lib/profile.js'

const INTRO_SEC = 30 // @unit 훅 도입 창(초). brandboy spec §5 "도입 30초"
const SEC_PER_15MIN = 900 // @unit 15분(초). counts_per_15min·still_image_max_per_15min 환산 기준

const STILL_KINDS = new Set(['image', 'still'])

export interface TimelineShot {
  shot_id: string
  start: number
  end: number
  asset_kind: string
  source_id?: string
  framing?: string
  source_audio?: string
  beat_ids: string[]
}

export interface ReviewWarning {
  code: 'w1' | 'w2' | 'w3' | 'w4' | 'w5' | 'w6' | 'w7'
  label: string
  message: string
  shot_ids: string[]
}

export interface WarningInput {
  shots: TimelineShot[]
  beatImportance: Map<string, string>
  totalSec: number
  profile: EditProfile
}

function byStart(a: TimelineShot, b: TimelineShot): number {
  return a.start - b.start || a.shot_id.localeCompare(b.shot_id)
}

function dur(s: TimelineShot): number {
  return s.end - s.start
}

/** w1 — 같은 source_id 가 same_source_run_max_sec 이상 연속으로 이어짐. */
function sameSourceRun(shots: TimelineShot[], maxSec: number): ReviewWarning[] {
  const out: ReviewWarning[] = []
  const seq = shots.filter((s) => s.source_id !== undefined).sort(byStart)
  let i = 0
  while (i < seq.length) {
    let j = i
    while (j + 1 < seq.length && seq[j + 1]!.source_id === seq[i]!.source_id) j++
    if (j > i) {
      const span = seq[j]!.end - seq[i]!.start
      if (span >= maxSec) {
        const run = seq.slice(i, j + 1)
        out.push({
          code: 'w1',
          label: '같은 원본 연속',
          message: `${seq[i]!.source_id} 가 ${span.toFixed(1)}초 연속 사용됨 (상한 ${maxSec}초)`,
          shot_ids: run.map((s) => s.shot_id),
        })
      }
    }
    i = j + 1
  }
  return out
}

/** w2 — 같은 framing 이 same_framing_run_max_shots 연속. */
function sameFramingRun(shots: TimelineShot[], maxShots: number): ReviewWarning[] {
  const out: ReviewWarning[] = []
  const seq = shots.filter((s) => s.framing !== undefined).sort(byStart)
  let i = 0
  while (i < seq.length) {
    let j = i
    while (j + 1 < seq.length && seq[j + 1]!.framing === seq[i]!.framing) j++
    const len = j - i + 1
    if (len >= maxShots) {
      const run = seq.slice(i, j + 1)
      out.push({
        code: 'w2',
        label: '같은 화면 크기 연속',
        message: `framing="${seq[i]!.framing}" 가 ${len}샷 연속 (상한 ${maxShots})`,
        shot_ids: run.map((s) => s.shot_id),
      })
    }
    i = j + 1
  }
  return out
}

/** w3 — 정지 이미지 한 컷이 still_max_sec 초과. */
function stillTooLong(shots: TimelineShot[], maxSec: number): ReviewWarning[] {
  return shots
    .filter((s) => STILL_KINDS.has(s.asset_kind) && dur(s) > maxSec)
    .map((s) => ({
      code: 'w3' as const,
      label: '정지 이미지 초과',
      message: `${s.shot_id} 정지 ${dur(s).toFixed(1)}초 (상한 ${maxSec}초)`,
      shot_ids: [s.shot_id],
    }))
}

/** w4 — 훅 30초 안의 시각 변화(샷 수)가 intro_30s_visual_changes_min 미만. */
function introTooFew(shots: TimelineShot[], min: number): ReviewWarning[] {
  const inIntro = shots.filter((s) => s.start < INTRO_SEC)
  if (inIntro.length >= min) return []
  return [{
    code: 'w4',
    label: '도입 30초 화면 부족',
    message: `도입 ${INTRO_SEC}초 시각 변화 ${inIntro.length}회 (최소 ${min}회)`,
    shot_ids: inIntro.map((s) => s.shot_id),
  }]
}

/** w5 — 강조 카드(caption_card) 개수가 counts_per_15min.impact_cards 범위 밖(15분 환산). */
function impactCardCount(shots: TimelineShot[], range: [number, number], totalSec: number): ReviewWarning[] {
  const cards = shots.filter((s) => s.asset_kind === 'caption_card')
  const scale = totalSec / SEC_PER_15MIN
  const lo = Math.floor(range[0] * scale)
  const hi = Math.ceil(range[1] * scale)
  if (cards.length >= lo && cards.length <= hi) return []
  return [{
    code: 'w5',
    label: '강조 카드 범위 밖',
    message: `강조 카드 ${cards.length}개 (허용 ${lo}~${hi}, 15분당 ${range[0]}~${range[1]})`,
    shot_ids: cards.map((s) => s.shot_id),
  }]
}

/** w6 — 원본음(source_audio != mute) 사이 간격이 source_audio_interval_sec 범위 밖. */
function sourceAudioGap(shots: TimelineShot[], range: [number, number]): ReviewWarning[] {
  const seq = shots.filter((s) => s.source_audio !== undefined && s.source_audio !== 'mute').sort(byStart)
  const out: ReviewWarning[] = []
  for (let i = 0; i + 1 < seq.length; i++) {
    const gap = seq[i + 1]!.start - seq[i]!.start
    if (gap < range[0] || gap > range[1]) {
      out.push({
        code: 'w6',
        label: '원본음 간격 이상',
        message: `원본음 간격 ${gap.toFixed(1)}초 (허용 ${range[0]}~${range[1]}초)`,
        shot_ids: [seq[i]!.shot_id, seq[i + 1]!.shot_id],
      })
    }
  }
  return out
}

/** w7 (V18b) — 사진이 비강조(critical 아님) 비트에 있거나 15분당 상한 초과. */
function photoAbuse(input: WarningInput): ReviewWarning[] {
  const { shots, beatImportance, totalSec, profile } = input
  const images = shots.filter((s) => s.asset_kind === 'image')
  const out: ReviewWarning[] = []

  if (profile.sources.still_only_on_emphasis) {
    const nonEmphasis = images.filter((s) => !s.beat_ids.some((b) => beatImportance.get(b) === 'critical'))
    if (nonEmphasis.length > 0) {
      out.push({
        code: 'w7',
        label: '사진 비강조 비트',
        message: `비강조 비트에 사진 ${nonEmphasis.length}개 (사진은 critical 비트에만)`,
        shot_ids: nonEmphasis.map((s) => s.shot_id),
      })
    }
  }

  const scale = totalSec / SEC_PER_15MIN
  const cap = Math.ceil(profile.sources.still_image_max_per_15min[1] * scale)
  if (images.length > cap) {
    out.push({
      code: 'w7',
      label: '사진 남용',
      message: `사진 ${images.length}개 (15분당 상한 ${profile.sources.still_image_max_per_15min[1]}, 허용 ${cap})`,
      shot_ids: images.map((s) => s.shot_id),
    })
  }
  return out
}

/** 7종 경고를 순서대로 계산한다. */
export function computeWarnings(input: WarningInput): ReviewWarning[] {
  const p = input.profile
  return [
    ...sameSourceRun(input.shots, p.shots.same_source_run_max_sec),
    ...sameFramingRun(input.shots, p.shots.same_framing_run_max_shots),
    ...stillTooLong(input.shots, p.shots.still_max_sec),
    ...introTooFew(input.shots, p.rhythm.intro_30s_visual_changes_min),
    ...impactCardCount(input.shots, p.counts_per_15min.impact_cards, input.totalSec),
    ...sourceAudioGap(input.shots, p.rhythm.source_audio_interval_sec),
    ...photoAbuse(input),
  ]
}
