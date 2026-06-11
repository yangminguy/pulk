// CMO M1 — 크롤링 결과 → l5-core 입력 모양 변환. 순수함수.
//
// 이 패키지는 l5-core에 의존하지 않는다(워크스페이스 의존 추가 금지).
// 대신 l5-core video-room 타입과 "구조적으로 동일한" 로컬 미러 타입을 내보내
// createReferenceAdapter({ scraper })·buildViewtrapValidation(input)에 그대로 주입 가능하게 한다.
// 미러 원본: packages/l5-core/src/functions/video-room/types.ts (ReferenceCandidate,
// KeyContentViewtrapValidation) — 원본이 바뀌면 여기도 맞춰야 한다.

import { GRADE_RANK, type ViewtrapGrade } from './types.js';
import type { ViewtrapMetricsLike } from './filters.js';

// ── l5-core 미러 타입 ────────────────────────────────────────────────────────

/** l5-core ConsumerStage 미러. */
export type ViewtrapConsumerStage = '현상' | '욕구' | '계획' | '행동' | '보상';

export type ViewtrapSelectedFor =
  | 'key_content'
  | 'pulling_content'
  | 'thumbnail_pattern'
  | 'intro_pattern'
  | 'script_structure';

/** l5-core ReferenceCandidate 미러 (reference-adapters.ts scraper 주입용). */
export interface ViewtrapReferenceCandidate {
  id: string;
  research_session_id: string;
  title: string;
  url: string;
  source: 'viewtrap' | 'youtube' | 'manual';
  view_count?: number;
  subscriber_count?: number;
  uploaded_at?: string;
  recent_growth_signal?: 'low' | 'medium' | 'high';
  contribution_score?: number;
  thumbnail_ref?: string;
  consumer_stage: ViewtrapConsumerStage;
  selected_for: ViewtrapSelectedFor;
  selection_reason: string;
}

/** l5-core buildViewtrapValidation 입력 = Omit<KeyContentViewtrapValidation,'verdict'> 미러. */
export interface ViewtrapValidationInput {
  validated_keywords: string[];
  candidate_titles: string[];
  performance_score: 'normal' | 'good' | 'great';
  contribution_score: 'normal' | 'good' | 'great';
  growth_status: 'growing' | 'stalled' | 'unknown';
  channel_value_risk: boolean;
  person_value_risk: boolean;
}

// ── 변환 대상 행 모양 (사이트 테이블/확장 공통 부분집합) ─────────────────────

export interface ViewtrapScrapedRow extends ViewtrapMetricsLike {
  videoId: string;
  title: string;
  url: string;
  publishedAt?: string | null;
  thumbnail?: string;
}

// ── ReferenceCandidate 변환 ──────────────────────────────────────────────────

export interface ToReferenceCandidatesOptions {
  researchSessionId: string;
  consumerStage: ViewtrapConsumerStage;
  selectedFor: ViewtrapSelectedFor;
  source?: 'viewtrap' | 'youtube';
}

function describeMetrics(row: ViewtrapScrapedRow): string {
  const parts = [
    `조회수 ${row.views !== null ? row.views.toLocaleString('en-US') : '-'}`,
    `기여도 ${row.contribution ?? '-'}`,
    `성과도 ${row.performance ?? '-'}`,
    `노출확률 ${row.exposure ?? '-'}`,
  ];
  return `Viewtrap 실측: ${parts.join(' · ')}`;
}

/**
 * 크롤링 행 → l5-core ReferenceCandidate[] (구조 호환).
 * id는 결정론(`viewtrap-<videoId>`). Date.now()/randomUUID() 없음.
 */
export function toReferenceCandidates(
  rows: ViewtrapScrapedRow[],
  options: ToReferenceCandidatesOptions,
): ViewtrapReferenceCandidate[] {
  const source = options.source ?? 'viewtrap';
  return rows.map((row) => {
    const candidate: ViewtrapReferenceCandidate = {
      id: `viewtrap-${row.videoId}`,
      research_session_id: options.researchSessionId,
      title: row.title,
      url: row.url,
      source,
      consumer_stage: options.consumerStage,
      selected_for: options.selectedFor,
      selection_reason: describeMetrics(row),
    };
    if (row.views !== null) candidate.view_count = row.views;
    if (row.contribution !== null) candidate.contribution_score = GRADE_RANK[row.contribution];
    if (row.publishedAt) candidate.uploaded_at = row.publishedAt;
    if (row.thumbnail) candidate.thumbnail_ref = row.thumbnail;
    return candidate;
  });
}

// ── 키 콘텐츠 Step 8 (buildViewtrapValidation 입력) 변환 ─────────────────────

/** Viewtrap 6등급 → l5-core 3등급. wow·great→great, good→good, 그 외→normal. */
export function toValidationScore(grade: ViewtrapGrade | null): 'normal' | 'good' | 'great' {
  if (grade === null) return 'normal';
  if (GRADE_RANK[grade] >= GRADE_RANK.great) return 'great';
  if (grade === 'good') return 'good';
  return 'normal';
}

function bestGrade(grades: (ViewtrapGrade | null)[]): ViewtrapGrade | null {
  let best: ViewtrapGrade | null = null;
  for (const g of grades) {
    if (g !== null && (best === null || GRADE_RANK[g] > GRADE_RANK[best])) best = g;
  }
  return best;
}

export interface ToViewtrapValidationOptions {
  /** Step 7에서 검증에 쓴 검색 키워드들. */
  validatedKeywords: string[];
  /** 채널값/사람값 리스크는 크롤링으로 알 수 없는 사람 판단 — 기본 false, 필요 시 오버라이드. */
  channelValueRisk?: boolean;
  personValueRisk?: boolean;
}

/**
 * 크롤링 행(발굴 필터 통과분 권장) → buildViewtrapValidation 입력.
 * - performance/contribution = 행들 중 최고 등급을 3등급으로 매핑.
 * - growth_status = 'unknown' (테이블에 성장 신호 없음 — LLM 추측 금지, 실데이터만).
 */
export function toViewtrapValidationInput(
  rows: ViewtrapScrapedRow[],
  options: ToViewtrapValidationOptions,
): ViewtrapValidationInput {
  return {
    validated_keywords: [...options.validatedKeywords],
    candidate_titles: rows.map((row) => row.title),
    performance_score: toValidationScore(bestGrade(rows.map((r) => r.performance))),
    contribution_score: toValidationScore(bestGrade(rows.map((r) => r.contribution))),
    growth_status: 'unknown',
    channel_value_risk: options.channelValueRisk ?? false,
    person_value_risk: options.personValueRisk ?? false,
  };
}
