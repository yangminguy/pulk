export type BPRPhase =
  | 'direction_alignment'
  | 'pmf_diagnosis'
  | 'execution_build'
  | 'sales_distribution_test'
  | 'productization_review'
  | 'scale_automation';

export interface BPRPhaseState {
  id: string;
  phase: BPRPhase;
  started_at: string;
  success_criteria: string[];
  completion_signal?: string;
  is_current: boolean;
  requires_founder_approval: boolean;
  created_at: string;
}

export interface BPRTransitionRequest {
  from_phase: BPRPhase;
  to_phase: BPRPhase;
  reason: string;
  triggered_by: string; // 'founder' | 'ceo' | 'hermes'
}

export interface BPRTransitionResult {
  ok: boolean;
  from_phase: BPRPhase;
  to_phase: BPRPhase;
  requires_approval: boolean;
  message: string;
}

export const BPR_PHASE_ORDER: BPRPhase[] = [
  'direction_alignment',
  'pmf_diagnosis',
  'execution_build',
  'sales_distribution_test',
  'productization_review',
  'scale_automation',
];

export const BPR_PHASE_LABELS: Record<BPRPhase, string> = {
  direction_alignment: '방향성 정렬',
  pmf_diagnosis: 'PMF 진단',
  execution_build: '실행 구축',
  sales_distribution_test: '판매/배포 테스트',
  productization_review: '제품화 검토',
  scale_automation: '확장 자동화',
};
