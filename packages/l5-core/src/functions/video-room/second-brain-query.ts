// CMO Video Room — Second Brain query mapping (Phase A: read-path expansion).
//
// Pure, NocoBase-free. Maps each workflow status to the Second Brain (biz brain)
// query string used to pull relevant Business-PT insights into the CMO strategy
// turn. Previously this map lived hardcoded in the plugin and covered only the
// strategy/research mid-stages; it now covers EVERY status (including the very
// first `strategy_chat`, plus script / production / publish) so that as Business
// PT material accumulates in the Second Brain it is reflected at every step.
//
// `completed` returns null (terminal — nothing to query). Unknown statuses also
// return null. Callers treat null as "skip Second Brain for this turn".

import type { VideoRoomStatus } from './types';

const QUERY_BY_STATUS: Record<VideoRoomStatus, string | null> = {
  // ── 전략 (strategy) ──
  strategy_chat:                 '비즈니스 PT 콘텐츠 전략 타깃 고객 문제 정의',
  business_pt_context_loading:   '비즈니스 PT 콘텐츠 전략 키 콘텐츠 풀링 채널',
  product_defined:               '비즈니스 PT 상품 정의 가치 제안 타깃',
  key_content_ideation:          '키 콘텐츠 기획 문제 상황 역순 기획',
  viewtrap_key_research:         '콘텐츠 리서치 경쟁사 벤치마킹 풀 콘텐츠',
  key_content_approval:          '키 콘텐츠 기획 문제 상황 역순 기획',
  viewtrap_pulling_research:     '콘텐츠 리서치 경쟁사 벤치마킹 풀 콘텐츠',
  pulling_content_set_selection: '풀링 콘텐츠 현상 욕구 계획 행동 보상',
  pulling_content_set_approval:  '풀링 콘텐츠 현상 욕구 계획 행동 보상',
  // ── 리서치 (research) ──
  thumbnail_pattern_extraction:  '썸네일 도입부 후킹 빌드업 벤치마킹',
  intro_30s_analysis:            '도입부 30초 훅 호기심 갭 약속',
  hook_draft_approval:           '훅 도입부 후킹 카피라이팅 첫 문장',
  // ── 원고 (script) ──
  script_planning:               '원고 구조 스토리텔링 현상 욕구 계획 행동 보상',
  script_draft:                  '원고 대사 카피라이팅 설득 구조 메시지',
  script_approval:               '원고 검수 메시지 일관성 톤',
  // ── 제작 (production) ──
  voice_recording:               '나레이션 보이스 톤 전달력 페이싱',
  slide_deck:                    '슬라이드 비주얼 메시지 전달 디자인',
  rendering:                     '영상 편집 리듬 페이싱 자막',
  // ── 검수·발행 (review / publish) ──
  qa:                            '영상 QA 품질 검수 체크리스트',
  video_qa_approval:             '영상 QA 품질 검수 체크리스트',
  upload_draft:                  '유튜브 업로드 제목 썸네일 설명 SEO',
  upload_approval:               '유튜브 업로드 제목 썸네일 설명 SEO',
  completed:                     null,
  // Paused rooms run no active query (resumes pick up at their prior status).
  paused:                        null,
};

/**
 * Second Brain query string for a workflow status, or null when no query
 * should run (terminal `completed`, or an unknown status).
 */
export function secondBrainQueryForStatus(status: string): string | null {
  return (QUERY_BY_STATUS as Record<string, string | null>)[status] ?? null;
}
