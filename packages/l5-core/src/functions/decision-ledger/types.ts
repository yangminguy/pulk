// Decision Ledger — 순수 타입/계약.
// CTO/실행 파이프라인이 내린 판단(복잡도·계획·D3 심사·검증·크리틱)의 "예측"과,
// 실행 후의 "실측"을 한 원장에 기록해 델타를 계산하고, 누적 델타로부터
// 캘리브레이션 제안(예측 편향 교정 힌트)을 뽑는 순수 로직. 저장(JSONL append)은 호출자 몫이며
// 이 모듈은 NocoBase/fs 없이 테스트 가능해야 한다.

/** 원장이 추적하는 판단 종류. */
export type DecisionKind = 'complexity' | 'plan' | 'd3_judge' | 'verify' | 'critic';

/** 판단 시점의 예측(무엇을 예상했는가). */
export interface DecisionPrediction {
  kind: DecisionKind;
  /** 예측 대상(task/plan id 등). */
  subject_id: string;
  /** 예측 필드 맵. 예: {complexity:'C2', file_count:3, verify_command:'...'} */
  predicted: Record<string, unknown>;
  rationale?: string;
  at: string;
}

/** 실행 후의 실측(무엇이 실제로 일어났는가). */
export interface DecisionObservation {
  subject_id: string;
  observed: Record<string, unknown>;
  at: string;
}

/** 예측 vs 실측 비교 결과. */
export interface DecisionDelta {
  matched: boolean;
  mismatches: Array<{ field: string; predicted: unknown; observed: unknown }>;
}

/** 원장 한 줄(예측 + 선택적 실측/델타/교훈). */
export interface DecisionLedgerEntry {
  id: string;
  kind: DecisionKind;
  subject_id: string;
  prediction: DecisionPrediction;
  observation?: DecisionObservation;
  delta?: DecisionDelta;
  lesson?: string;
  at: string;
}

/** 누적 델타에서 뽑은 예측 편향 교정 제안. */
export interface CalibrationProposal {
  kind: DecisionKind;
  field: string;
  /** 'over' = 예측이 실측보다 높은 경향, 'under' = 낮은 경향. */
  direction: 'over' | 'under';
  sample_count: number;
  mismatch_rate: number;
  suggestion: string;
}
