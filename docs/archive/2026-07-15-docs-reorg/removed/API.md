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

## NocoBase Plugin Actions — Founder Console (2026-06-03)

> 런타임 HTTP 액션. base `http://localhost:13000`, 인증 `Authorization: Bearer <token>` + `X-Authenticator: basic`. 응답은 NocoBase가 `{ data: <body> }`로 감싸고, body는 대개 `{ ok, data }`. 소유 플러그인: O=`plugin-orchestration`, M=`plugin-executive-monitor`.

### P1 — 종합 산출물
- 자동 생성(엔드포인트 아님): `agent:executeTask` 꼬리에서 한 지시의 모든 task가 terminal이면 `maybeSynthesizeInstruction`이 `founder_deliverables` insert + `chat_messages`(role=`chief_of_staff`, metadata.kind=`synthesis`) 카드 생성. [O]
- `GET founder_deliverables:list` — 종합 산출물 목록. [O]
- `POST founder_instructions:update { filterByTk, values:{ status:'closed' } }` — 카드 "이대로 채택". [O]

### P2 — 실시간 모니터링
- `GET monitor:liveStatus?instruction_id?&business_id?` → `{ ok, data: [{ instruction_id, instruction_text, agents: [{ task_id, agent, live_status, current_action, counterpart, ... }] }] }`. live_status ∈ queued|investigating|talking|awaiting_founder|awaiting_delegation|under_review|done|blocked. [M]

### P3-2 — 지식 자동 큐레이션
- `POST monitor:curate {}` → pending 인사이트 sweep. `{ ok, data:{ curated, saved, discarded, needs_review } }`. [M]
- `GET monitor:curationSummary` → 주간 `{ saved[], discarded[], needs_review[], totals }`. [M]
- `POST monitor:overrideCuration { id, decision:'save'|'discard'|'restore' }`. [M]

### P3-3 — Control Room
- `GET monitor:controlRoomTree?business_id?` → `{ ok, data: [{ business_id, business_name, projects:[{ project_id, project_name, dev_tasks:[{ task_id, title, agent, status, branch?, phase_label?, exec_status?, log_tail? }] }] }] }`. ACR 실행필드는 `ACR_EXECUTION_ENABLED=1`+ACR `GET /api/l5/execution` 라우트 시 채워짐, 아니면 null. [M]

### P3-4 — CTO 자가수정 (D3+ 게이트)
- `POST monitor:sendToCTO { task_id }` — Tool Request → self-mod CTO task 생성(source_ref=`selfmod:<origin>`, risk D3, raw SQL insert). origin self_mod_status='sent'. `{ ok, data:{ self_mod_task_id, acceptance_criteria } }`. [M]
- self-mod task가 ACR 빌드 후 `agent:taskCallback`(pass) → status=`needs_review`, approval_required=floorGate(`L5_SELFMOD_AUTO_APPLY_FLOOR` 기본 D3), acr_branch/acr_diff 영속, self_mod_status='awaiting_apply'. [O]
- `GET monitor:approvalQueue` — self-mod 항목에 `acr_diff/acr_branch/acr_pr_url/self_mod_origin` 포함(diff 미리보기). [M]
- `POST monitor:applySelfMod { task_id }` — deny-list(plugin-orchestration/.env/launchd/SECURITY_/approval) 통과 시 적용; 실행중 코드면 `applied:needs_restart`. [M]
- `POST monitor:rollbackSelfMod { task_id }` — 브랜치 폐기(미머지 → 안전), origin self_mod_status='rejected'. [M]

## Risk Levels

```text
D1 — Internal draft only
D2 — Internal execution only
D3 — Low-risk external draft, approval required before send
D4 — Customer-facing message, Founder approval required
D5 — Legal/financial/public commitment, Founder approval required and logged
```
