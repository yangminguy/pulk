// Video Room phase model — frontend-only derivation over the backend 25-step status.
// The backend `status` (25 steps) and `current_page` (3 pages) are unchanged; this
// module groups statuses into 5 user-facing phases so the UI can show one focus at a time.

export type PhaseKey = 'strategy' | 'research' | 'script' | 'production' | 'publish'

export type Phase = {
  key: PhaseKey
  label: string
  /** Backend `status` values that belong to this phase, in workflow order. */
  statuses: string[]
}

// ── 25-step status labels (single source of truth; page.tsx will import from here) ──
export const STATUS_LABEL: Record<string, string> = {
  strategy_chat:                   '전략 대화',
  business_pt_context_loading:     'PT 컨텍스트 로딩',
  product_defined:                 '상품 정의 완료',
  key_content_ideation:            '키 콘텐츠 기획서 (리서치+분석)',
  viewtrap_key_research:           'Viewtrap 키 리서치',
  key_content_approval:            '키 콘텐츠 승인 대기',
  viewtrap_pulling_research:       'Viewtrap 풀링 리서치',
  pulling_content_set_selection:   '풀링 콘텐츠 선별',
  pulling_content_set_approval:    '풀링 콘텐츠 승인 대기',
  thumbnail_pattern_extraction:    '썸네일 패턴 추출',
  intro_30s_analysis:              '도입부 30초 분석',
  hook_draft_approval:             'Hook 초안 승인 대기',
  script_planning:                 '원고 기획',
  script_draft:                    '원고 초안 작성',
  script_approval:                 '원고 승인 대기',
  voice_recording:                 '음성 녹음',
  slide_deck:                      '슬라이드 덱 생성',
  rendering:                       '렌더링',
  qa:                              'QA 검수',
  video_qa_approval:               '영상 QA 승인 대기',
  upload_draft:                    '업로드 초안',
  upload_approval:                 '업로드 승인 대기',
  completed:                       '완료',
  paused:                          '일시 중지',
}

// ── 5-phase grouping (ordered) ───────────────────────────────────────────────
export const PHASES: Phase[] = [
  {
    key: 'strategy',
    label: '전략',
    statuses: [
      'strategy_chat',
      'business_pt_context_loading',
      'product_defined',
      'key_content_ideation',
      'viewtrap_key_research',
      'key_content_approval',
      'viewtrap_pulling_research',
      'pulling_content_set_selection',
      'pulling_content_set_approval',
    ],
  },
  {
    key: 'research',
    label: '리서치',
    // 백엔드 state-machine(VIDEO_ROOM_FLOW)에 없는 status(reference_analysis,
    // second_brain_insight_merge)는 도달 불가라 제거(2026-06-11).
    statuses: [
      'thumbnail_pattern_extraction',
      'intro_30s_analysis',
      'hook_draft_approval',
    ],
  },
  {
    key: 'script',
    label: '원고',
    statuses: [
      'script_planning',
      'script_draft',
      'script_approval',
    ],
  },
  {
    key: 'production',
    label: '제작',
    statuses: [
      'voice_recording',
      'slide_deck',
      'rendering',
      'qa',
      'video_qa_approval',
    ],
  },
  {
    key: 'publish',
    label: '발행',
    statuses: [
      'upload_draft',
      'upload_approval',
      'completed',
    ],
  },
]

const STATUS_TO_PHASE: Record<string, PhaseKey> = (() => {
  const map: Record<string, PhaseKey> = {}
  for (const phase of PHASES) {
    for (const status of phase.statuses) map[status] = phase.key
  }
  return map
})()

/**
 * Phase that owns a given backend status.
 * Returns null for `paused` (a cross-cutting meta-state with no inherent phase)
 * and for any unknown status.
 */
export function phaseOfStatus(status: string): PhaseKey | null {
  return STATUS_TO_PHASE[status] ?? null
}

/** Zero-based index of a phase in workflow order, or -1 if unknown. */
export function phaseIndex(key: PhaseKey): number {
  return PHASES.findIndex(p => p.key === key)
}

/** All statuses flattened in workflow order (excludes `paused`). */
export const ORDERED_STATUSES: string[] = PHASES.flatMap(p => p.statuses)

const STATUS_ORDER: Record<string, number> = (() => {
  const map: Record<string, number> = {}
  ORDERED_STATUSES.forEach((s, i) => { map[s] = i })
  return map
})()

/** Position of a status in overall workflow order, or -1 if unknown/`paused`. */
export function statusOrder(status: string): number {
  return status in STATUS_ORDER ? STATUS_ORDER[status] : -1
}

/**
 * Soft-gating state of a work block (defined by the status range it serves)
 * relative to the project's current status.
 * - 'done'   : the current status is past this block's range
 * - 'active' : the current status falls within this block's range
 * - 'locked' : this block's range is in the future (not yet reachable)
 * Unknown current status (e.g. `paused`) yields 'locked' for everything.
 */
export function blockState(
  range: { from: string; to: string },
  currentStatus: string,
): 'done' | 'active' | 'locked' {
  const cur = statusOrder(currentStatus)
  const from = statusOrder(range.from)
  const to = statusOrder(range.to)
  if (cur < 0 || from < 0 || to < 0) return 'locked'
  if (cur < from) return 'locked'
  if (cur > to) return 'done'
  return 'active'
}

/**
 * Timeline state of a phase relative to the project's current status.
 * - 'done'    : an earlier phase than the current one
 * - 'active'  : the phase containing the current status
 * - 'pending' : a later phase (locked / not yet reachable)
 */
export function phaseState(phaseKey: PhaseKey, currentStatus: string): 'done' | 'active' | 'pending' {
  const current = phaseOfStatus(currentStatus)
  if (!current) return 'pending'
  const a = phaseIndex(phaseKey)
  const b = phaseIndex(current)
  if (a < b) return 'done'
  if (a === b) return 'active'
  return 'pending'
}
