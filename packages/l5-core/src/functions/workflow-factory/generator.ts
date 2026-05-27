import type {
  WorkflowFactoryInput,
  WorkflowFactoryOutput,
  BusinessBrief,
  PMFExperimentPlan,
  AgentStaffingPlan,
} from './types';

function deriveExperimentType(
  idea: string
): PMFExperimentPlan['experiment_type'] {
  if (/landing/i.test(idea)) return 'landing_page';
  if (/interview/i.test(idea)) return 'customer_interview';
  if (/waitlist/i.test(idea)) return 'waitlist';
  return 'message_test';
}

function buildBusinessBrief(input: WorkflowFactoryInput): BusinessBrief {
  const now = new Date().toISOString();
  let founderFitScore = 70;
  if (input.founder_context) founderFitScore += 10;
  if (input.memory_context) founderFitScore += 5;

  return {
    idea_summary: input.business_idea,
    target_customer: '초기 얼리어답터 및 SMB 세그먼트',
    core_problem: `${input.business_idea} 영역의 주요 고통 포인트`,
    proposed_solution: `${input.business_idea}을 통한 문제 해결`,
    differentiation: '빠른 실행과 Founder 직접 검증',
    risk_factors: [
      '시장 수요 미검증',
      'PMF 달성 전 과도한 툴 빌드 위험',
      '경쟁사 대응 리스크',
    ],
    founder_fit_score: Math.min(founderFitScore, 100),
    recommended_phase: input.current_phase ?? 'pmf_diagnosis',
    generated_at: now,
  };
}

function buildPMFExperimentPlan(input: WorkflowFactoryInput): PMFExperimentPlan {
  const now = new Date().toISOString();
  const experimentType = deriveExperimentType(input.business_idea);

  return {
    hypothesis: `${input.business_idea}에 관심 있는 고객이 존재하며, 초기 메시지로 수요를 검증할 수 있다`,
    target_segment: '초기 얼리어답터',
    experiment_type: experimentType,
    success_signal: '7일 내 10명 이상 긍정 반응 또는 전환',
    timeline_days: 7,
    channels: ['direct_outreach', 'community', 'social'],
    kill_criteria: '7일 내 응답률 10% 미만',
    scale_criteria: '긍정 응답 30% 이상 또는 첫 유료 전환 발생',
    generated_at: now,
  };
}

function buildAgentStaffingPlan(input: WorkflowFactoryInput): AgentStaffingPlan {
  const now = new Date().toISOString();

  return {
    primary_agent: 'CMO',
    secondary_agents: ['CTO', 'CPO', 'RiskQA'],
    task_assignments: [
      {
        agent: 'CMO',
        task: `${input.business_idea} PMF 메시지 실험 설계 및 채널 검증`,
        rationale: 'PMF 검증이 최우선이므로 CMO가 리드',
        risk_level: 'D3',
      },
      {
        agent: 'CTO',
        task: '최소 기술 스택 검토 및 실험 지원 인프라 준비',
        rationale: '툴 빌드는 PMF 이후이나 실험 지원 기술 검토 필요',
        risk_level: 'D2',
      },
      {
        agent: 'CPO',
        task: '고객 인터뷰 설계 및 피드백 수집 프레임워크 준비',
        rationale: '제품 방향성 가설 수립을 위한 고객 인사이트 수집',
        risk_level: 'D2',
      },
      {
        agent: 'RiskQA',
        task: '실험 계획 리스크 검토 및 PII 취급 가이드라인 확인',
        rationale: '고객 데이터 취급 및 외부 접촉 시 리스크 사전 검토',
        risk_level: 'D1',
      },
    ],
    parallel_workstreams: 2,
    generated_at: now,
  };
}

export function generateWorkflow(
  input: WorkflowFactoryInput
): WorkflowFactoryOutput {
  const now = new Date().toISOString();

  return {
    business_brief: buildBusinessBrief(input),
    pmf_experiment_plan: buildPMFExperimentPlan(input),
    agent_staffing_plan: buildAgentStaffingPlan(input),
    generated_at: now,
  };
}
