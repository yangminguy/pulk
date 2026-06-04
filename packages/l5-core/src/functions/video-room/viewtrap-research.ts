import {
  VIEWTRAP_URL,
  ViewtrapResearchSession,
  ReferenceCandidate,
  ConsumerStage,
} from './types';

// ── helpers ────────────────────────────────────────────────────────────────

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must not be empty`);
  }
  return value.trim();
}

// ── ViewtrapResearchSession ────────────────────────────────────────────────

export interface CreateViewtrapResearchSessionInput {
  id: string;
  video_project_id: string;
  research_type: ViewtrapResearchSession['research_type'];
  created_at: string;
  browser_session_ref?: string;
}

export function createViewtrapResearchSession(
  input: CreateViewtrapResearchSessionInput,
): ViewtrapResearchSession {
  return {
    id: input.id,
    video_project_id: input.video_project_id,
    research_type: input.research_type,
    viewtrap_url: VIEWTRAP_URL,
    search_keywords: [],
    browser_session_ref: input.browser_session_ref,
    status: 'not_started',
    findings_summary: '',
    created_at: input.created_at,
  };
}

export function addSearchKeywords(
  session: ViewtrapResearchSession,
  keywords: string[],
): ViewtrapResearchSession {
  return {
    ...session,
    search_keywords: [...session.search_keywords, ...keywords],
    status: session.status === 'not_started' ? 'researching' : session.status,
  };
}

export function completeResearchSession(
  session: ViewtrapResearchSession,
  findings_summary: string,
  completed_at: string,
): ViewtrapResearchSession {
  requireNonEmpty(findings_summary, 'findings_summary');
  return {
    ...session,
    status: 'completed',
    findings_summary: findings_summary.trim(),
    completed_at,
  };
}

// ── ReferenceCandidate ────────────────────────────────────────────────────

export interface CreateReferenceCandidateInput {
  id: string;
  research_session_id: string;
  title: string;
  url: string;
  source: ReferenceCandidate['source'];
  consumer_stage: ConsumerStage;
  selected_for: ReferenceCandidate['selected_for'];
  selection_reason: string;
  view_count?: number;
  subscriber_count?: number;
  uploaded_at?: string;
  recent_growth_signal?: ReferenceCandidate['recent_growth_signal'];
  contribution_score?: number;
  thumbnail_ref?: string;
}

export function createReferenceCandidate(
  input: CreateReferenceCandidateInput,
): ReferenceCandidate {
  requireNonEmpty(input.url, 'url');
  requireNonEmpty(input.consumer_stage, 'consumer_stage');
  requireNonEmpty(input.selected_for, 'selected_for');

  return {
    id: input.id,
    research_session_id: input.research_session_id,
    title: input.title,
    url: input.url.trim(),
    source: input.source,
    consumer_stage: input.consumer_stage,
    selected_for: input.selected_for,
    selection_reason: input.selection_reason,
    view_count: input.view_count,
    subscriber_count: input.subscriber_count,
    uploaded_at: input.uploaded_at,
    recent_growth_signal: input.recent_growth_signal,
    contribution_score: input.contribution_score,
    thumbnail_ref: input.thumbnail_ref,
  };
}

// ── buildSearchStrategy ────────────────────────────────────────────────────
// PRD §7.3: 6단계 검색전략 키워드 배열 생성

export interface SearchStrategy {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  keywords: string[];
}

export function buildSearchStrategy(
  productKeyword: string,
  problemKeyword: string,
): SearchStrategy[] {
  return [
    { step: 1, label: '상품 키워드 검색', keywords: [productKeyword] },
    { step: 2, label: '고객 문제 키워드 검색', keywords: [problemKeyword] },
    { step: 3, label: '기능 키워드 검색', keywords: [`${productKeyword} 기능`, `${productKeyword} 사용법`] },
    { step: 4, label: '욕구 키워드 검색', keywords: [`${problemKeyword} 해결`, `${problemKeyword} 개선`] },
    { step: 5, label: '대체재/경쟁재 키워드 검색', keywords: [`${productKeyword} 대안`, `${productKeyword} 비교`] },
    { step: 6, label: '같은 고객이 볼 만한 인접 카테고리 검색', keywords: [`${problemKeyword} 사례`, `${problemKeyword} 방법`] },
  ];
}
