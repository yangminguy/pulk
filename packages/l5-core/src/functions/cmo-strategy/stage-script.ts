// Deterministic stage guidance for the CMO strategy conversation.
//
// Used both to steer the LLM (injected into the prompt) and as a graceful
// fallback so the CMO always responds usefully even with no model configured.
// Each entry encodes what the CMO should be doing at that workflow stage,
// derived from PRD §7 and §14 (CMO Agent Rules).

import type { VideoRoomStatus } from '../video-room/types';

export interface StageGuidance {
  /** Short human label for the stage. */
  label: string;
  /** What the CMO focuses on at this stage. */
  focus: string;
  /** Scripted question/guidance the CMO offers when no LLM is available. */
  prompt: string;
}

export const STAGE_SCRIPT: Record<VideoRoomStatus, StageGuidance> = {
  strategy_chat: {
    label: '전략 대화 시작',
    focus: '프로젝트 목표와 상품/타깃을 가볍게 확인한다.',
    prompt: '이번 영상 프로젝트로 어떤 상품을, 누구에게 팔고 싶으신가요? 목표(상담/판매/대기자)도 알려주세요.',
  },
  business_pt_context_loading: {
    label: 'Business PT 컨텍스트 로딩',
    focus: 'Second Brain에서 최신 비즈니스 PT 자료를 검색해 기획 원칙을 정리하고 스냅샷을 만든다.',
    prompt: '키 콘텐츠 후보를 만들기 전에, 최신 비즈니스 PT/Second Brain 자료부터 흡수하겠습니다. 관련 자료(강의·컨설팅·썸끝/원끝)가 있으면 알려주세요. 최소 3개 자료로 기획 원칙을 정리합니다.',
  },
  product_defined: {
    label: '상품/문제 정의',
    focus: '상품, 타깃, 고객 문제, USP, CTA를 확정한다.',
    prompt: '상품명·타깃·고객 문제·USP·CTA를 한 번 정리해 주세요. 이걸 기준으로 키 콘텐츠 후보를 잡겠습니다.',
  },
  key_content_ideation: {
    label: '키 콘텐츠 후보 기획',
    focus: '상품 장점이 아니라 고객이 겪는 문제 상황에서 출발해 키 콘텐츠 후보를 2~4개 만든다. 판매목표를 먼저 정하고 역순으로 기획(역순 기획)한다.',
    prompt: '먼저 이 영상으로 달성할 판매목표(상담 몇 건, 판매 몇 개 등)를 정해 주세요. 그 목표를 역으로 거슬러 올라가, 고객이 지금 실제로 겪고 있는 문제 상황에서 시작하는 키 콘텐츠 후보 2~4개를 잡겠습니다.',
  },
  viewtrap_key_research: {
    label: 'Viewtrap 키 리서치',
    focus: '마케팅을 "고객 문제"로 재정의해 검색 키워드를 도출하고, 경쟁사 썸네일·도입부·형식을 벤치마킹할 레퍼런스를 찾는다. 검색 키워드와 방법은 CMO가 제안하고, 실제 검색은 사장님이 Viewtrap에서 직접 수행(human-in-loop)한다.',
    prompt: '마케팅을 "우리 상품 홍보"가 아니라 "고객이 겪는 문제"로 재정의하면 검색할 키워드가 달라집니다. 아래 키워드로 Viewtrap(app.viewtrap.com/video-search)에서 검색해 주세요. 경쟁사 영상의 썸네일·도입부·형식도 함께 살펴보시고, 결과(제목·조회수·URL·선택 이유)를 입력해 주시면 분석하겠습니다.',
  },
  key_content_approval: {
    label: '키 콘텐츠 1개 확정',
    focus: 'Viewtrap 근거로 키 콘텐츠 1개를 추천하고 Founder 승인을 받는다.',
    prompt: 'Viewtrap 근거를 바탕으로 키 콘텐츠 1개를 추천드립니다. 승인/수정/다른 후보/보류 중 선택해 주세요.',
  },
  viewtrap_pulling_research: {
    label: 'Viewtrap 풀링 리서치',
    focus: '현상→욕구→계획→행동→보상 소비자 여정 각 단계의 풀링 콘텐츠 후보를 Viewtrap에서 찾는다. 검색 키워드와 단계 분류는 CMO가 제안하고, 실제 검색은 사장님이 수행(human-in-loop)한다.',
    prompt: '풀링 콘텐츠는 소비자 여정 단계(현상→욕구→계획→행동→보상)를 따라 배치됩니다. 아래 단계별 키워드로 Viewtrap에서 검색해 주세요. 한 단계 분량만 먼저 검색하셔도 됩니다. 결과를 입력해 주시면 퍼널 구조에 맞게 풀링 5개로 엮겠습니다.',
  },
  pulling_content_set_selection: {
    label: '풀링 콘텐츠 5개 선별',
    focus: '현상→욕구→계획→브릿지 퍼널을 덮는 풀링 콘텐츠 5개를 고른다.',
    prompt: '풀링 콘텐츠 5개를 역할별(문제인식·문제심화·욕구형성·계획진입·키콘텐츠 브릿지)로 선별하겠습니다.',
  },
  pulling_content_set_approval: {
    label: '풀링 세트 승인',
    focus: '풀링 5개 세트와 키 콘텐츠로의 브릿지를 Founder 승인받는다.',
    prompt: '풀링 콘텐츠 5개 세트를 정리했습니다. 각 콘텐츠가 키 콘텐츠로 이어지는 브릿지를 확인하고 승인해 주세요.',
  },
  thumbnail_pattern_extraction: {
    label: '썸네일 구성 + 제목 디벨롭',
    focus: '확정된 풀링 5개+키 콘텐츠의 썸네일을 세컨브레인 후기·경쟁사 벤치마킹 인사이트로 분석해 우리 주제 구조로 치환한다. 레퍼런스 영상 URL 입력 단계 없이 기존 풀링/키 콘텐츠 데이터로 바로 시작한다. 이어서 풀링 주제별 Viewtrap 검증 레퍼런스 2개를 기반으로 제목·썸네일 교차 조합 후 제목 디벨롭 8단계를 수행해 최종 제목/썸네일 방향을 만든다 (PRD §20.1).',
    prompt: '확정된 풀링 5개와 키 콘텐츠를 기준으로 썸네일 구성을 잡겠습니다. 세컨브레인 강의 방법론과 경쟁사 벤치마킹 인사이트를 반영해, 썸네일 문구·감정 훅·구도 구조를 우리 주제에 맞게 치환하겠습니다. 제목은 같은 주제의 Viewtrap 레퍼런스 2개(조회수 5만 이상, 성과도/기여도 Good 또는 Great)를 입력해 주시면 교차 조합 후 8단계 디벨롭으로 최종 제목 후보를 만들겠습니다.',
  },
  intro_30s_analysis: {
    label: '원고 도입부 30초',
    focus: '도입부 0~30초의 빌드업·후킹 구조를 강의 원칙(초반 후킹, 빌드업 문장, "왜 봐야 하는가")대로 설계한다.',
    prompt: '원고 도입부 0~30초를 설계하겠습니다. 첫 문장에서 시청자를 후킹하고, 빌드업 문장으로 긴장감을 높인 뒤, "왜 이 영상을 끝까지 봐야 하는지"를 명확히 제시하는 구조로 잡겠습니다.',
  },
  hook_draft_approval: {
    label: '썸네일/제목/도입부 승인',
    focus: '키·풀링 각각의 썸네일/제목/도입부 후보를 Founder 승인받는다.',
    prompt: '썸네일·제목·도입부 후보를 정리했습니다. 승인하시면 Production으로 넘기겠습니다.',
  },
  script_planning: {
    label: '원고 기획',
    focus: '승인된 제목으로 원고 구성을 짠다.',
    prompt: '승인된 제목으로 원고 구성을 짜겠습니다.',
  },
  script_draft: {
    label: '원고 작성',
    focus: '전체 원고를 작성한다.',
    prompt: '전체 원고를 작성하겠습니다.',
  },
  script_approval: {
    label: '원고 승인',
    focus: '작성된 원고를 Founder 승인받는다.',
    prompt: '작성된 원고를 검토하고 승인해 주세요.',
  },
  voice_recording: {
    label: '녹음',
    focus: '읽기용 원고를 만들고 Founder 녹음 파일을 업로드받는다.',
    prompt: '읽기 좋은 원고로 변환했습니다. 녹음 후 음성 파일을 업로드해 주세요.',
  },
  slide_deck: {
    label: '슬라이드 스펙 생성',
    focus: '원고+녹음으로 SlideDeckSpec을 만든다.',
    prompt: '원고와 녹음으로 SlideDeckSpec을 생성하겠습니다.',
  },
  rendering: {
    label: '렌더링',
    focus: 'SlideDeckSpec을 VideoJob으로 변환해 영상 팩토리에 제출한다.',
    prompt: '영상 팩토리에 렌더링을 제출하겠습니다.',
  },
  qa: {
    label: 'QA',
    focus: '렌더 결과를 전략 일치성+품질 7개 항목으로 QA한다.',
    prompt: '렌더 결과를 전략 일치성과 품질 기준으로 QA하겠습니다.',
  },
  video_qa_approval: {
    label: 'QA 승인',
    focus: 'QA 결과를 Founder 승인받는다.',
    prompt: 'QA 결과를 확인하고 승인해 주세요.',
  },
  upload_draft: {
    label: '업로드 초안',
    focus: '제목/설명/태그/썸네일로 업로드 초안을 만든다(기본 비공개).',
    prompt: '업로드 초안(제목·설명·태그)을 만들었습니다. 기본은 비공개입니다.',
  },
  upload_approval: {
    label: '업로드 승인',
    focus: '업로드 초안을 Founder 최종 승인받는다(공개는 승인 후).',
    prompt: '업로드 초안을 최종 승인해 주세요. 공개/예약은 승인 후에만 가능합니다.',
  },
  completed: {
    label: '완료',
    focus: '프로젝트가 완료됐다. 성과 Memory 후보를 남긴다.',
    prompt: '이 프로젝트는 완료됐습니다. 성과 기록 후보를 남기겠습니다.',
  },
  paused: {
    label: '일시정지',
    focus: '프로젝트가 일시정지 상태다.',
    prompt: '이 프로젝트는 일시정지 상태입니다. 재개하시려면 알려주세요.',
  },
};
