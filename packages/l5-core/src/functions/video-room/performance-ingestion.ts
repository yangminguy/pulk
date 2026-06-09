// CMO v3 R7 — 영상 성과 기록 (수동 입력 기반).
//
// 비전: 업로드 완료(completed) 후 사장님이 영상 성과 지표를 직접 입력 → 구조화된
// PerformanceRecord로 보관. 외부 분석 자동연동(YouTube Analytics 등)은 코드에 없으므로
// 수동 입력만 다룬다. 가짜 분석 연동 코드는 만들지 않는다(자동연동은 followup).
//
// 컨벤션: 순수/결정론 — Date.now()/randomUUID() 미사용. caller가 시각 메타를 붙인다.
// zod로 입력 검증. 범위를 벗어난 값(0~1 비율, 음수 조회수)은 거부.

import { z } from 'zod';

/** 수동 입력 성과 지표. completion_rate/ctr는 0~1 비율. */
export const RecordVideoPerformanceInputSchema = z.object({
  project_id: z.string().min(1),
  /** 누적 조회수. */
  view_count: z.number().int().nonnegative(),
  /** 평균 시청 완료율 0~1. */
  completion_rate: z.number().min(0).max(1),
  /** 노출 클릭률(썸네일) 0~1. */
  ctr: z.number().min(0).max(1),
  /** 시청 유지 관련 자유 메모 (예: '도입 30초 이탈 큼'). */
  retention_notes: z.string().optional(),
  /** 댓글/반응 등 정성 피드백. */
  feedback: z.string().optional(),
});

export type RecordVideoPerformanceInput = z.infer<typeof RecordVideoPerformanceInputSchema>;

export interface PerformanceRecord {
  project_id: string;
  view_count: number;
  completion_rate: number;
  ctr: number;
  retention_notes?: string;
  feedback?: string;
  /** 입력값 기반 결정론 요약(시각/랜덤 없음). */
  summary: string;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/**
 * 수동 입력 성과 지표를 검증된 PerformanceRecord로 변환한다.
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
    ...(v.retention_notes?.trim() ? { retention_notes: v.retention_notes.trim() } : {}),
    ...(v.feedback?.trim() ? { feedback: v.feedback.trim() } : {}),
    summary,
  };
}
