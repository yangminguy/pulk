/**
 * Phase 9 P2 — Phase Transition Summary builder.
 *
 * Pure aggregator: takes the tasks belonging to a completing phase and produces
 * the Founder-facing structure described in docs/FOUNDER_BRIEF_SPEC.md §5.
 * NocoBase plugin layer queries the DB and feeds tasks/handoffs in.
 */
import {
  BPRPhase,
  BPRPhaseState,
  BPR_PHASE_LABELS,
  BPR_PHASE_ORDER,
} from './types';

export interface SummaryTaskInput {
  id: string;
  title: string;
  expected_output?: string | null;
  status: string;
  assigned_agent?: string | null;
  phase?: string | null;
  blocker?: string | null;
  insight_to_record?: string | null;
}

export interface PhaseTransitionSummary {
  from_phase: BPRPhase;
  from_phase_label: string;
  to_phase: BPRPhase;
  to_phase_label: string;
  effective_at: string;
  completed_count: number;
  blocked_count: number;
  needs_review_count: number;
  success_criteria_met: Array<{ title: string; outcome: string }>;
  outstanding_items: Array<{ title: string; status: string; reason: string }>;
  key_learnings: string[];
  next_phase_plan: {
    primary_owners: string[];
    success_criteria: string[];
    expected_outcome: string;
  };
  requires_approval: boolean;
  message: string;
}

const PHASE_FOCUS: Record<BPRPhase, { owners: string[]; criteria: string[]; expected: string }> = {
  direction_alignment: {
    owners: ['CEO', 'ChiefOfStaff'],
    criteria: ['Founder가 사업 방향에 동의', '핵심 가설 1개 명문화'],
    expected: '다음 단계 진입을 위한 가설 + 측정 지표 확정',
  },
  pmf_diagnosis: {
    owners: ['CPO', 'CMO', 'RiskQA'],
    criteria: ['PMF 신호 정의', '실험 1회 이상 실행', '결과 기록'],
    expected: 'PMF 가설 검증 데이터 수집',
  },
  execution_build: {
    owners: ['CTO', 'COO'],
    criteria: ['주요 워크플로 구현', '내부 사용자 1명 이상 운용'],
    expected: '검증된 가설을 실제로 굴릴 수 있는 시스템 확보',
  },
  sales_distribution_test: {
    owners: ['CRO', 'CMO'],
    criteria: ['유료 전환 시도 1건 이상', '전환 funnel 측정'],
    expected: '수익화 가능성 신호 확보',
  },
  productization_review: {
    owners: ['CPO', 'CTO'],
    criteria: ['반복 가능한 산출물 정의', 'SLA/품질 기준 명문화'],
    expected: '제품으로 운영 가능한 상태 진입',
  },
  scale_automation: {
    owners: ['COO', 'CTO'],
    criteria: ['수작업 SOP 자동화', '에이전트 도구화 완료'],
    expected: '인력 투입 없이 굴러가는 운영 체계',
  },
};

export function buildPhaseTransitionSummary(input: {
  from_phase: BPRPhase;
  to_phase: BPRPhase;
  tasks: SummaryTaskInput[];
  now?: string;
  current_state?: BPRPhaseState | null;
}): PhaseTransitionSummary {
  const { from_phase, to_phase, tasks } = input;
  const now = input.now ?? new Date().toISOString();

  const inPhase = tasks.filter((t) => (t.phase ?? from_phase) === from_phase);
  const done = inPhase.filter((t) => t.status === 'done');
  const blocked = inPhase.filter((t) => t.status === 'blocked');
  const review = inPhase.filter((t) => t.status === 'needs_review');

  const success_criteria_met = done.map((t) => ({
    title: t.title,
    outcome: t.expected_output?.trim() || '완료',
  }));

  const outstanding_items = [...blocked, ...review].map((t) => ({
    title: t.title,
    status: t.status,
    reason: (t.blocker ?? '').trim() || (t.status === 'blocked' ? '차단됨' : '검토 필요'),
  }));

  const key_learnings = Array.from(
    new Set(
      inPhase
        .map((t) => t.insight_to_record?.trim())
        .filter((s): s is string => Boolean(s && s.length > 0)),
    ),
  );

  const focus = PHASE_FOCUS[to_phase] ?? PHASE_FOCUS.direction_alignment;
  const fromIdx = BPR_PHASE_ORDER.indexOf(from_phase);
  const toIdx = BPR_PHASE_ORDER.indexOf(to_phase);
  const isForwardSingleStep = toIdx - fromIdx === 1;
  const message = isForwardSingleStep
    ? `${BPR_PHASE_LABELS[from_phase]} → ${BPR_PHASE_LABELS[to_phase]} 전환 요약 (Founder 승인 대기)`
    : toIdx <= fromIdx
      ? '후퇴 또는 동일 단계 전환은 Founder 승인 필수'
      : '두 단계 이상 점프는 허용되지 않음';

  return {
    from_phase,
    from_phase_label: BPR_PHASE_LABELS[from_phase] ?? from_phase,
    to_phase,
    to_phase_label: BPR_PHASE_LABELS[to_phase] ?? to_phase,
    effective_at: now,
    completed_count: done.length,
    blocked_count: blocked.length,
    needs_review_count: review.length,
    success_criteria_met,
    outstanding_items,
    key_learnings,
    next_phase_plan: {
      primary_owners: focus.owners,
      success_criteria: focus.criteria,
      expected_outcome: focus.expected,
    },
    requires_approval: true,
    message,
  };
}
