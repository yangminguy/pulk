# API — L5 Business OS Internal Contracts

## Purpose

이 문서는 NocoBase plugin, `l5-core`, Mastra Agent Runtime, Trigger.dev Hermes Runtime 사이의 내부 API 계약을 정의한다.

## Common Response

```ts
type L5Result<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    source: string;
  };
  trace_id?: string;
};
```

## L5 Core Function Contracts

### scoreFounderFit

```ts
scoreFounderFit(input: {
  businessIdea: BusinessIdea;
  founderDNA: FounderDNA[];
  cultureRules: DecisionRule[];
}): L5Result<{
  score: number;
  reasons: string[];
  risks: string[];
  recommendation: 'proceed' | 'revise' | 'pause' | 'reject';
}>;
```

### calculatePmfScore

```ts
calculatePmfScore(input: {
  experiment: PMFExperiment;
  metrics: PMFExperimentMetric[];
}): L5Result<{
  total_score: number;
  dimension_scores: Record<string, number>;
  recommendation: 'kill' | 'iterate' | 'scale_experiment' | 'tool_candidate';
}>;
```

### decideToolCandidate

```ts
decideToolCandidate(input: {
  experimentResults: PMFExperimentMetric[];
  repeatedWorkSignals: BPRLog[];
  workflowHistory: Workflow[];
}): L5Result<{
  is_candidate: boolean;
  reasons: string[];
  suggested_tool_type: 'manual_for_now' | 'local_script' | 'no_code_tool' | 'internal_feature' | 'external_saas';
}>;
```

### requiresFounderApproval

```ts
requiresFounderApproval(input: {
  action_type: string;
  risk_level: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
  contains_pii: boolean;
  external_action: boolean;
}): L5Result<{
  required: boolean;
  reason: string;
}>;
```

## Agent Runtime Endpoints

### POST /agent/idea-intake

Creates a structured business brief from a raw idea.

Request:

```json
{
  "business_idea_id": "idea_123",
  "raw_description": "...",
  "founder_context_refs": ["dna_1", "memory_1"]
}
```

Response:

```json
{
  "business_brief": "...",
  "founder_fit_summary": "...",
  "pmf_experiment_plan": "...",
  "agent_staffing_plan": "...",
  "decision_items": []
}
```

### POST /agent/daily-brief

Generates Founder Brief.

Request:

```json
{
  "date": "2026-05-26",
  "include_open_decisions": true,
  "include_hermes_alerts": true
}
```

### POST /agent/pmf-review

Reviews PMF experiment results.

Request:

```json
{
  "experiment_id": "pmf_123",
  "metric_ids": ["metric_1", "metric_2"]
}
```

## Hermes Runtime Task Triggers

### POST /hermes/check-stalled-workflows

Checks workflows whose `last_activity_at` is older than threshold.

Request:

```json
{
  "threshold_hours": 24
}
```

Output:

```json
{
  "alerts_created": 3,
  "workflow_ids": ["wf_1", "wf_2"]
}
```

### POST /hermes/check-pmf-deadlines

Checks PMF experiments past `ended_at` with missing metrics.

### POST /hermes/generate-memory-suggestions

Creates MemoryEntry suggestions from completed experiments, BPR logs, and decisions.

## Webhook Contracts

### Formbricks Response Webhook

```json
{
  "source": "formbricks",
  "survey_id": "...",
  "experiment_id": "pmf_123",
  "response_id": "...",
  "answers": {},
  "submitted_at": "..."
}
```

### Activepieces Notification Webhook

```json
{
  "event_type": "hermes_alert",
  "channel": "telegram",
  "recipient": "founder",
  "message": "...",
  "risk_level": "D2",
  "approval_id": null
}
```

## Risk Levels

```text
D1 — Internal draft only
D2 — Internal execution only
D3 — Low-risk external draft, approval required before send
D4 — Customer-facing message, Founder approval required
D5 — Legal/financial/public commitment, Founder approval required and logged
```
