# DATA_MODEL — L5 Business OS

## Source of Truth

Source of truth is PostgreSQL through NocoBase collections and portable L5 entity schemas.

Not source of truth:

- Langfuse
- Formbricks
- Activepieces
- LLM provider logs
- external notification tools

## Core Entities

### FounderDNA

```ts
type FounderDNA = {
  id: string;
  category: 'business_preference' | 'risk_standard' | 'strength' | 'weakness' | 'brand_tone' | 'decision_rule';
  statement: string;
  evidence: string;
  source_ref?: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  created_at: string;
  updated_at: string;
};
```

### FounderDNAUpdateSuggestion

```ts
type FounderDNAUpdateSuggestion = {
  id: string;
  suggested_category: string;
  suggested_statement: string;
  reason: string;
  evidence_refs: string[];
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  created_at: string;
  reviewed_at?: string;
};
```

### BusinessIdea

```ts
type BusinessIdea = {
  id: string;
  title: string;
  raw_description: string;
  source: 'founder' | 'ceo_agent' | 'cmo_signal' | 'cro_signal' | 'bpr' | 'memory' | 'trend';
  status: 'idea' | 'scoring' | 'pmf_experiment' | 'killed' | 'converted_to_business';
  founder_fit_score?: number;
  opportunity_score?: number;
  risk_level: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
  created_at: string;
};
```

### Business

```ts
type Business = {
  id: string;
  title: string;
  one_liner: string;
  status: 'idea' | 'scoring' | 'pmf_experiment' | 'active_experiment' | 'tool_candidate' | 'revenue_test' | 'productization' | 'scaling' | 'paused' | 'killed';
  founder_fit_score: number;
  opportunity_score: number;
  kill_criteria: string[];
  scale_criteria: string[];
  created_from_idea_id?: string;
  created_at: string;
  updated_at: string;
};
```

### Workflow

```ts
type Workflow = {
  id: string;
  business_id?: string;
  type: 'revenue' | 'marketing' | 'sales' | 'delivery' | 'bpr' | 'tool_request' | 'custom';
  title: string;
  status: 'draft' | 'active' | 'stalled' | 'completed' | 'paused' | 'archived';
  owner_agent_id?: string;
  started_at?: string;
  due_at?: string;
  last_activity_at?: string;
};
```

### WorkflowStep

```ts
type WorkflowStep = {
  id: string;
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
};
```

### Agent

```ts
type Agent = {
  id: string;
  name: string;
  role: 'ceo' | 'chief_of_staff' | 'cmo' | 'cro' | 'cpo' | 'cto' | 'coo' | 'cfo' | 'risk_qa' | 'culture' | 'squad';
  responsibilities: string[];
  output_contract: string;
  autonomy_level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  active: boolean;
};
```

### AgentAssignment

```ts
type AgentAssignment = {
  id: string;
  business_id?: string;
  workflow_id?: string;
  agent_id: string;
  responsibility: string;
  expected_output: string;
  authority_scope: string;
  founder_report_rule: string;
  status: 'active' | 'completed' | 'paused';
};
```

### PMFExperiment

```ts
type PMFExperiment = {
  id: string;
  business_id: string;
  hypothesis: string;
  format: 'content' | 'message' | 'landing' | 'proposal' | 'manual_delivery' | 'interview' | 'waitlist' | 'survey';
  target_segment: string;
  success_signal: string;
  status: 'planned' | 'running' | 'completed' | 'invalidated';
  pmf_score?: number;
  started_at?: string;
  ended_at?: string;
};
```

### PMFExperimentMetric

```ts
type PMFExperimentMetric = {
  id: string;
  experiment_id: string;
  metric_name: string;
  metric_value: number | string;
  signal_level: 1 | 2 | 3 | 4 | 5;
  evidence_ref?: string;
  collected_at: string;
};
```

### HermesAlert

```ts
type HermesAlert = {
  id: string;
  alert_type: 'stalled_workflow' | 'pmf_deadline' | 'approval_required' | 'tool_candidate' | 'memory_update' | 'bpr_required';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  related_workflow_id?: string;
  related_business_id?: string;
  suggested_action: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  created_at: string;
};
```

### DecisionQueue

```ts
type DecisionQueue = {
  id: string;
  decision_type: 'founder_approval' | 'risk_review' | 'tool_subscription' | 'external_send' | 'pricing' | 'legal_financial';
  title: string;
  context: string;
  options: string[];
  recommended_option: string;
  risk_level: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
  status: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  decided_by?: string;
  decided_at?: string;
};
```

### BPRLog

```ts
type BPRLog = {
  id: string;
  business_id?: string;
  workflow_id?: string;
  type: 'local' | 'company' | 'triggered';
  bottleneck: string;
  root_cause: string;
  recommendation: string;
  action_items: string[];
  tool_request_needed: boolean;
  memory_entries_to_create: string[];
  status: 'open' | 'in_progress' | 'resolved' | 'archived';
  created_at: string;
};
```

### ToolRequest

```ts
type ToolRequest = {
  id: string;
  title: string;
  problem: string;
  repeated_count: number;
  estimated_minutes_per_run: number;
  revenue_or_pmf_impact: string;
  reuse_potential: 1 | 2 | 3 | 4 | 5;
  cto_decision?: 'manual_for_now' | 'local_script' | 'no_code_tool' | 'internal_feature' | 'agent_control_tower' | 'claude_code' | 'codex' | 'antigravity' | 'hermes_automation' | 'future_saas' | 'reject';
  status: 'candidate' | 'approved' | 'rejected' | 'built' | 'deferred';
};
```

### MemoryEntry

```ts
type MemoryEntry = {
  id: string;
  type: 'founder_dna' | 'culture' | 'business_idea' | 'pmf_experiment' | 'market' | 'message' | 'sales' | 'product' | 'workflow' | 'tool' | 'failure' | 'bpr' | 'revenue';
  insight: string;
  evidence: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  related_business_id?: string;
  related_workflow_id?: string;
  pii_level: 'none' | 'low' | 'medium' | 'high';
  allowed_usage: 'internal_only' | 'reusable_anonymized' | 'restricted_customer_purpose';
  source_ref?: string;
  created_at: string;
};
```

### CustomerProfile

```ts
type CustomerProfile = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  pii_level: 'low' | 'medium' | 'high';
  consent_status: 'unknown' | 'granted' | 'revoked' | 'expired';
  created_at: string;
};
```

### CustomerConsent

```ts
type CustomerConsent = {
  id: string;
  customer_id: string;
  consent_scope: string[];
  consent_source: string;
  consent_date: string;
  expires_at?: string;
};
```

### BusinessInsight

```ts
type BusinessInsight = {
  id: string;
  related_customer_segment?: string;
  anonymized_insight: string;
  evidence_refs: string[];
  confidence: 1 | 2 | 3 | 4 | 5;
  reusable_scope: 'single_business' | 'similar_segment' | 'all_businesses';
  created_at: string;
};
```

## Relationship Summary

```text
BusinessIdea 1 → 0..1 Business
Business 1 → many Workflow
Business 1 → many PMFExperiment
Workflow 1 → many WorkflowStep
Business 1 → many AgentAssignment
Agent 1 → many AgentAssignment
PMFExperiment 1 → many PMFExperimentMetric
Workflow 1 → many HermesAlert
Workflow 1 → many BPRLog
BPRLog 0..1 → ToolRequest
Any entity → MemoryEntry through source_ref/evidence_ref
CustomerProfile 1 → many CustomerConsent
CustomerProfile 1 → many CustomerInteraction
BusinessInsight references anonymized evidence only
```
