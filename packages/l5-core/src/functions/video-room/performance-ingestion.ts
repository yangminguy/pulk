// CMO v3 R7 — 영상 성과 기록 (수동 입력 + M5 자동 수집 공용).
//
// 비전: 업로드 완료(completed) 후 성과 지표를 구조화된 PerformanceRecord로 보관.
// 입력 경로는 둘: ① 사장님 수동 입력(기존) ② YouTube Analytics 자동 수집(M5,
// performance-auto-mapping.ts가 같은 입력 형태로 변환). 둘 다 이 함수 하나로 들어온다.
//
// M2 실측 제약: 노출수(impressions)·CTR은 targeted Analytics API 미지원(전 조합 400).
// → completion_rate/ctr/impressions는 nullable. 자동 수집은 null + metrics_note(사유)로
// 기록하고, Reporting API(channel_reach_basic_a1) 활성화 후 채울 수 있게 한다.
//
// 컨벤션: 순수/결정론 — Date.now()/randomUUID() 미사용. caller가 시각 메타를 붙인다.
// zod로 입력 검증. 범위를 벗어난 값(0~1 비율, 음수 조회수)은 거부.

import { z } from 'zod';

/** 성과 지표 입력. completion_rate/ctr는 0~1 비율 — 미수집이면 null. */
export const RecordVideoPerformanceInputSchema = z.object({
  project_id: z.string().min(1),
  /** 누적 조회수. */
  view_count: z.number().int().nonnegative(),
  /** 평균 시청 완료율 0~1. 미수집(자동 수집에서 averageViewPercentage 실패)이면 null. */
  completion_rate: z.number().min(0).max(1).nullable(),
  /** 노출 클릭률(썸네일) 0~1. targeted Analytics API 미지원 → 자동 수집은 null. */
  ctr: z.number().min(0).max(1).nullable(),
  /** 썸네일 노출수. targeted Analytics API 미지원 → 자동 수집은 null. */
  impressions: z.number().int().nonnegative().nullable().optional(),
  /** 미수집 지표가 있을 때 사유 기록 (예: Reporting API 미활성화). */
  metrics_note: z.string().optional(),
  /** 도입부 30초 시청 유지율 0~1 (KB 00·10 정량 4요소 — 목표 60%). 미수집이면 null. */
  intro_retention_30s: z.number().min(0).max(1).nullable().optional(),
  /** 시청 유지 관련 자유 메모 (예: '도입 30초 이탈 큼'). */
  retention_notes: z.string().optional(),
  /** 댓글/반응 등 정성 피드백. */
  feedback: z.string().optional(),
});

export type RecordVideoPerformanceInput = z.infer<typeof RecordVideoPerformanceInputSchema>;

export interface PerformanceRecord {
  project_id: string;
  view_count: number;
  completion_rate: number | null;
  ctr: number | null;
  intro_retention_30s?: number | null;
  impressions?: number | null;
  metrics_note?: string;
  retention_notes?: string;
  feedback?: string;
  /** 입력값 기반 결정론 요약(시각/랜덤 없음). */
  summary: string;
}

function pct(v: number | null): string {
  return v == null ? '미수집' : `${Math.round(v * 100)}%`;
}

/**
 * 성과 지표를 검증된 PerformanceRecord로 변환한다.
 * 순수 함수 — 저장/시각 메타는 caller(plugin)가 담당한다.
 */
export function recordVideoPerformance(input: RecordVideoPerformanceInput): PerformanceRecord {
  const v = RecordVideoPerformanceInputSchema.parse(input);
  const summary = `조회수 ${v.view_count.toLocaleString('en-US')} · 완료율 ${pct(
    v.completion_rate,
  )} · CTR ${pct(v.ctr)}`;
  return {
    project_id: v.project_id,
    view_count: v.view_count,
    completion_rate: v.completion_rate,
    ctr: v.ctr,
    ...(v.intro_retention_30s !== undefined ? { intro_retention_30s: v.intro_retention_30s } : {}),
    ...(v.impressions !== undefined ? { impressions: v.impressions } : {}),
    ...(v.metrics_note?.trim() ? { metrics_note: v.metrics_note.trim() } : {}),
    ...(v.retention_notes?.trim() ? { retention_notes: v.retention_notes.trim() } : {}),
    ...(v.feedback?.trim() ? { feedback: v.feedback.trim() } : {}),
    summary,
  };
}
