// KB 00 인덱스 · 10 지표진단 — 정량 4요소 자동 판정.
//
// 지식베이스 정본 목표치(문서 00 §정량 4요소, 10 §진단):
//   조회수 1,000 · 시청 지속 35%(4분) · 도입부 유지 60%(30초) · CTR 10%.
// 이전에는 UI 정적 텍스트로만 존재하고 판정 코드가 없었다(2026-07-12 점검 발견).
// 여기서 순수 판정 함수로 코드화한다 — 미수집(null)은 'unknown'으로 구분(FAIL 아님).
//
// 컨벤션: 순수/결정론. Date/random 미사용. 모든 임계값은 이 파일이 정본.

import type { PerformanceRecord } from './performance-ingestion';

/** KB 정본 목표치. completion-insight-extraction 등 다른 모듈도 이 값을 쓴다. */
export const QUANT_TARGETS = {
  /** 조회수 목표 (KB 00). */
  views: 1000,
  /** 시청 지속(완료율) 목표 0~1 — 35% / 4분 (KB 00·10). */
  completion_rate: 0.35,
  /** 도입부 30초 유지율 목표 0~1 — 60% (KB 00·10). */
  intro_retention_30s: 0.6,
  /** 썸네일 CTR 목표 0~1 — 10% (KB 00·10). */
  ctr: 0.1,
} as const;

export type FactorVerdict = 'pass' | 'fail' | 'unknown';

export interface FactorAssessment {
  factor: 'views' | 'completion_rate' | 'intro_retention_30s' | 'ctr';
  /** 한국어 라벨 (UI 표시용). */
  label: string;
  target: number;
  actual: number | null;
  verdict: FactorVerdict;
  /** 미달 시 손볼 위치 (KB 10 §진단→처방 매핑). */
  prescription: string;
}

export interface QuantitativeAssessment {
  factors: FactorAssessment[];
  /** fail이 하나라도 있으면 false. unknown만 있으면 true(판정 유보는 미달 아님). */
  all_known_pass: boolean;
  failed_count: number;
  unknown_count: number;
}

function assess(
  factor: FactorAssessment['factor'],
  label: string,
  target: number,
  actual: number | null | undefined,
  prescription: string,
): FactorAssessment {
  const a = actual ?? null;
  const verdict: FactorVerdict = a == null ? 'unknown' : a >= target ? 'pass' : 'fail';
  return { factor, label, target, actual: a, verdict, prescription };
}

/**
 * 정량 4요소 판정 (KB 00·10).
 * 미수집 지표는 unknown — FAIL로 취급하지 않되 all_known_pass 계산에서 제외.
 */
export function assessQuantitativeFactors(p: PerformanceRecord): QuantitativeAssessment {
  const factors: FactorAssessment[] = [
    assess('views', '조회수', QUANT_TARGETS.views, p.view_count,
      '노출 부족 — 검색 수요 큰 풀링 주제 보강 (KB 10 §판매단계)'),
    assess('completion_rate', '시청 지속 (4분)', QUANT_TARGETS.completion_rate, p.completion_rate,
      '본론 구조 재설계 — 논리 블록 전환/약속 이행 점검 (KB 09·10)'),
    assess('intro_retention_30s', '도입부 유지 (30초)', QUANT_TARGETS.intro_retention_30s, p.intro_retention_30s,
      '도입부 훅 재검토 — 첫 문장/긴장/약속 구조 (KB 09 §도입부)'),
    assess('ctr', '클릭률 (CTR)', QUANT_TARGETS.ctr, p.ctr,
      '썸네일 문구/제목 각도 재검토 — 교체창 내 A/B (KB 07·08)'),
  ];
  const failed = factors.filter((f) => f.verdict === 'fail');
  const unknown = factors.filter((f) => f.verdict === 'unknown');
  return {
    factors,
    all_known_pass: failed.length === 0,
    failed_count: failed.length,
    unknown_count: unknown.length,
  };
}
