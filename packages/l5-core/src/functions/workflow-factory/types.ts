export interface WorkflowFactoryInput {
  business_idea: string;
  founder_context?: string; // Founder DNA 요약
  memory_context?: string;  // 관련 메모리
  current_phase?: string;
}

export interface BusinessBrief {
  idea_summary: string;
  target_customer: string;
  core_problem: string;
  proposed_solution: string;
  differentiation: string;
  risk_factors: string[];
  founder_fit_score: number; // 0-100
  recommended_phase: string;
  generated_at: string;
}

export interface PMFExperimentPlan {
  hypothesis: string;
  target_segment: string;
  experiment_type: 'message_test' | 'landing_page' | 'customer_interview' | 'waitlist';
  success_signal: string;
  timeline_days: number;
  channels: string[];
  kill_criteria: string;
  scale_criteria: string;
  generated_at: string;
}

export interface AgentStaffingPlan {
  primary_agent: string;
  secondary_agents: string[];
  task_assignments: Array<{
    agent: string;
    task: string;
    rationale: string;
    risk_level: string;
  }>;
  parallel_workstreams: number;
  generated_at: string;
}

export interface WorkflowFactoryOutput {
  business_brief: BusinessBrief;
  pmf_experiment_plan: PMFExperimentPlan;
  agent_staffing_plan: AgentStaffingPlan;
  generated_at: string;
}
