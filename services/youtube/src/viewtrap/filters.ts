// CMO M1 — 발굴 필터 (기획 확정 기준, docs/cmo/HANDOFF.md 2026-06-10):
// 조회수 5만+ · 성과도 good·great(·wow) · 기여도 good·great(·wow) · 노출확률 normal·good·great.
// 순수함수. CDP 의존 없음.

import { GRADE_RANK, type ViewtrapGrade } from './types.js';

/** 사이트 테이블 행/확장 행 공통의 지표 모양 (구조적 타이핑). */
export interface ViewtrapMetricsLike {
  views: number | null;
  contribution: ViewtrapGrade | null;
  performance: ViewtrapGrade | null;
  exposure: ViewtrapGrade | null;
}

export const DISCOVERY_MIN_VIEWS = 50_000;

const PASS_SCORE_MIN = GRADE_RANK.good; // 성과도·기여도: good 이상 (good·great·wow)
const PASS_EXPOSURE_MIN = GRADE_RANK.normal; // 노출확률: normal 이상 (normal·good·great·wow)

export interface DiscoveryFilterOptions {
  /** 기본 50,000 */
  minViews?: number;
  /**
   * true면 노출확률 미로드(null) 행을 탈락시킨다.
   * 기본 false — 노출확률은 버튼 클릭 후에야 로드되므로(clickExposureProbability),
   * 미로드 행은 통과시키고 이후 단계에서 확인한다.
   */
  requireExposure?: boolean;
}

export function passesDiscoveryFilter(
  row: ViewtrapMetricsLike,
  options: DiscoveryFilterOptions = {},
): boolean {
  const minViews = options.minViews ?? DISCOVERY_MIN_VIEWS;
  if (row.views === null || row.views < minViews) return false;
  if (row.performance === null || GRADE_RANK[row.performance] < PASS_SCORE_MIN) return false;
  if (row.contribution === null || GRADE_RANK[row.contribution] < PASS_SCORE_MIN) return false;
  if (row.exposure === null) return !options.requireExposure;
  return GRADE_RANK[row.exposure] >= PASS_EXPOSURE_MIN;
}

export function filterDiscoveryRows<T extends ViewtrapMetricsLike>(
  rows: T[],
  options: DiscoveryFilterOptions = {},
): T[] {
  return rows.filter((row) => passesDiscoveryFilter(row, options));
}
