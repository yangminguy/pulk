// 백엔드 상태머신(video_room_projects.status) → 사장님용 한국어 6단계 매핑.
// 정본 status 목록 = founder-ui phases.ts(백엔드 state-machine과 동기) 기준.

export const STATUS_LABEL: Record<string, string> = {
  strategy_chat: '전략 대화',
  business_pt_context_loading: 'PT 컨텍스트 불러오기',
  product_defined: '상품 정의 확정',
  key_content_ideation: '키 콘텐츠 기획 (리서치+분석)',
  viewtrap_key_research: '키 뷰트랩 리서치',
  key_content_approval: '키 콘텐츠 승인',
  viewtrap_pulling_research: '풀링 뷰트랩 리서치',
  pulling_content_set_selection: '풀링 콘텐츠 선별',
  pulling_content_set_approval: '풀링 콘텐츠 승인',
  thumbnail_pattern_extraction: '썸네일 패턴 추출',
  intro_30s_analysis: '도입부 30초 분석',
  hook_draft_approval: '훅 3종 승인 (제목·썸네일·도입부)',
  script_planning: '원고 기획',
  script_draft: '원고 초안 작성',
  script_approval: '원고 승인',
  voice_recording: '음성 녹음',
  slide_deck: '슬라이드 생성',
  rendering: '렌더링',
  qa: '영상 QA 검사',
  video_qa_approval: '영상 QA 승인',
  upload_draft: '업로드 초안 (비공개)',
  upload_approval: '게시 승인',
  completed: '게시 완료 · 성과 관측',
  paused: '일시 중지',
}

export type Phase6 = { key: string; label: string; short: string; statuses: string[] }

export const PHASE6: Phase6[] = [
  {
    key: 'plan', label: '① 기획', short: '기획',
    statuses: [
      'strategy_chat', 'business_pt_context_loading', 'product_defined',
      'key_content_ideation', 'viewtrap_key_research', 'key_content_approval',
      'viewtrap_pulling_research', 'pulling_content_set_selection', 'pulling_content_set_approval',
    ],
  },
  {
    key: 'hook', label: '② 훅 만들기', short: '훅',
    statuses: ['thumbnail_pattern_extraction', 'intro_30s_analysis', 'hook_draft_approval'],
  },
  {
    key: 'script', label: '③ 원고', short: '원고',
    statuses: ['script_planning', 'script_draft', 'script_approval'],
  },
  {
    key: 'video', label: '④ 영상 제작', short: '영상',
    statuses: ['voice_recording', 'slide_deck', 'rendering', 'qa', 'video_qa_approval'],
  },
  {
    key: 'upload', label: '⑤ 업로드', short: '업로드',
    statuses: ['upload_draft', 'upload_approval'],
  },
  {
    key: 'perf', label: '⑥ 게시 · 성과', short: '성과',
    statuses: ['completed'],
  },
]

export const ORDERED: string[] = PHASE6.flatMap(p => p.statuses)

export function isGate(status: string): boolean {
  return status.endsWith('_approval')
}

export function phaseIndexOf(status: string): number {
  return PHASE6.findIndex(p => p.statuses.includes(status))
}

export function statusOrder(status: string): number {
  return ORDERED.indexOf(status)
}

export function label(status: string): string {
  return STATUS_LABEL[status] ?? status
}

/** "지금: X · 담당" + "다음: Y" 텍스트 */
export function nowNext(status: string): { now: string; who: '사장님 차례' | '자동 진행' | '완료'; next: string } {
  const i = statusOrder(status)
  const next = i >= 0 && i < ORDERED.length - 1 ? label(ORDERED[i + 1]) : '—'
  if (status === 'completed') return { now: label(status), who: '완료', next: '성과 자동 수집 → 재학습' }
  return { now: label(status), who: isGate(status) ? '사장님 차례' : '자동 진행', next }
}
