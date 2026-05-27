// L5 Business OS - Entity Type Definitions
// Portable across all layers (NocoBase, Mastra, Trigger.dev)

export type PIILevel = 'none' | 'low' | 'medium' | 'high';
export type ConsoleStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type RiskLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

export interface CommonFields {
  id: string;
  created_at: string;
  updated_at: string;
  source_ref?: string;
}

export interface FounderDNA extends CommonFields {
  category: 'business_preference' | 'risk_standard' | 'strength' | 'weakness' | 'brand_tone' | 'decision_rule';
  statement: string;
  evidence: string;
  confidence: 1 | 2 | 3 | 4 | 5;
}

export interface FounderDNAUpdateSuggestion extends CommonFields {
  suggested_category: string;
  suggested_statement: string;
  reason: string;
  evidence_refs: string[];
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
}

export interface BusinessIdea extends CommonFields {
  title: string;
  raw_description: string;
  source: 'founder' | 'ceo_agent' | 'cmo_signal' | 'cro_signal' | 'bpr' | 'memory' | 'trend';
  status: 'idea' | 'scoring' | 'pmf_experiment' | 'killed' | 'converted_to_business';
  founder_fit_score?: number;
  opportunity_score?: number;
  risk_level: RiskLevel;
}

export interface Business extends CommonFields {
  title: string;
  one_liner: string;
  status: 'idea' | 'scoring' | 'pmf_experiment' | 'active_experiment' | 'tool_candidate' | 'revenue_test' | 'productization' | 'scaling' | 'paused' | 'killed';
  founder_fit_score: number;
  opportunity_score: number;
  kill_criteria: string[];
  scale_criteria: string[];
  created_from_idea_id?: string;
}

export interface Workflow extends CommonFields {
  business_id?: string;
  type: 'revenue' | 'marketing' | 'sales' | 'delivery' | 'bpr' | 'tool_request' | 'custom';
  title: string;
  status: 'draft' | 'active' | 'stalled' | 'completed' | 'paused' | 'archived';
  owner_agent_id?: string;
  started_at?: string;
  due_at?: string;
  last_activity_at?: string;
}

export interface WorkflowStep extends CommonFields {
  workflow_id: string;
  title: string;
  description: string;
  owner_agent_id?: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'skipped';
  order_index: number;
  input_refs: string[];
  output_refs: string[];
  due_at?: string;
  completed_at?: string;
}

export interface Agent extends CommonFields {
  name: string;
  role: 'ceo' | 'chief_of_staff' | 'cmo' | 'cro' | 'cpo' | 'cto' | 'coo' | 'cfo' | 'risk_qa' | 'culture' | 'squad';
  responsibilities: string[];
  output_contract: string;
  autonomy_level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  active: boolean;
}

export interface AgentAssignment extends CommonFields {
  business_id?: string;
  workflow_id?: string;
  agent_id: string;
  responsibility: string;
  expected_output: string;
  authority_scope: string;
  founder_report_rule: string;
  status: 'active' | 'completed' | 'paused';
}

export interface PMFExperiment extends CommonFields {
  business_id: string;
  hypothesis: string;
  format: 'content' | 'message' | 'landing' | 'proposal' | 'manual_delivery' | 'interview' | 'waitlist' | 'survey';
  target_segment: string;
  success_signal: string;
  status: 'planned' | 'running' | 'completed' | 'invalidated';
  pmf_score?: number;
  started_at?: string;
  ended_at?: string;
}

export interface PMFExperimentMetric extends CommonFields {
  experiment_id: string;
  metric_name: string;
  metric_value: number | string;
  signal_level: 1 | 2 | 3 | 4 | 5;
  evidence_ref?: string;
  collected_at: string;
}

export interface HermesAlert extends CommonFields {
  alert_type: 'stalled_workflow' | 'pmf_deadline' | 'approval_required' | 'tool_candidate' | 'memory_update' | 'bpr_required';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  related_workflow_id?: string;
  related_business_id?: string;
  suggested_action: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
}

export interface DecisionQueue extends CommonFields {
  decision_type: 'founder_approval' | 'risk_review' | 'tool_subscription' | 'external_send' | 'pricing' | 'legal_financial';
  title: string;
  description: string;
  related_business_id?: string;
  related_workflow_id?: string;
  requested_by: string;
  required_by?: string;
  status: 'open' | 'pending' | 'approved' | 'rejected' | 'expired';
  approval_notes?: string;
}

export interface BPRLog extends CommonFields {
  business_id?: string;
  bottleneck_description: string;
  impact: 'high' | 'medium' | 'low';
  root_cause?: string;
  proposed_solution: string;
  owner_agent_id?: string;
  status: 'identified' | 'under_review' | 'solution_planned' | 'solution_implemented' | 'closed';
}

export interface ToolRequest extends CommonFields {
  title: string;
  description: string;
  related_workflow_id?: string;
  related_business_id?: string;
  justification: string;
  effort_estimate?: string;
  impact_score: number;
  status: 'candidate' | 'proposed' | 'approved' | 'in_development' | 'deployed' | 'rejected';
  decision_notes?: string;
}

export interface MemoryEntry extends CommonFields {
  category: 'founder_dna' | 'pmf_learning' | 'market' | 'message' | 'sales' | 'workflow' | 'tool' | 'failure' | 'bpr' | 'revenue';
  content: string;
  related_business_id?: string;
  related_entity_id?: string;
  related_entity_type?: string;
  pii_level: PIILevel;
  searchable_tags: string[];
  suggested_tags: string[];
  reusability_score?: number;
  approval_status: 'pending' | 'approved' | 'rejected';
  contains_pii: boolean;
  pii_notes?: string;
  source_task_id?: string;
  reusable_context?: string;
}

export interface FounderBrief extends CommonFields {
  business_id?: string;
  title: string;
  summary: string;
  key_decisions_required: string[];
  today_priority: string;
  alert_highlights: string[];
  memory_lessons_applied: string[];
}

export interface WorkflowImprovementProposal extends CommonFields {
  related_workflow_id?: string;
  related_business_id?: string;
  current_process: string;
  identified_bottleneck: string;
  proposed_improvement: string;
  impact_on_timeline?: string;
  effort_to_implement?: string;
  suggested_by_agent_id: string;
  status: 'proposed' | 'under_review' | 'approved' | 'implemented' | 'rejected';
}

// Scoring Results
export interface FounderFitScore {
  score: number; // 0-100
  breakdown: {
    interest_fit: number;
    skill_fit: number;
    energy_fit: number;
    brand_fit: number;
    risk_fit: number;
  };
  reasoning: string;
}

export interface PMFScoreResult {
  pmf_score: number; // 0-100
  signal_strength: 'weak' | 'medium' | 'strong';
  evidence_count: number;
  recommendation: string;
}

export interface ToolCandidateDecision {
  is_tool_candidate: boolean;
  reasoning: string;
  priority?: 'high' | 'medium' | 'low';
}
