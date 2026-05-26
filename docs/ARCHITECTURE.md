# ARCHITECTURE — L5 Business OS

## System Overview

L5 Business OS는 Founder-facing 경험을 chat-first로 설계한다. Founder는 CEO Agent와 대화하고, CEO Agent가 Executive Agent들을 병렬 orchestration한다. NocoBase는 MVP Shell로 사용하지만 Founder의 최종 UI가 아니라 Agent 작업 상태, 승인, memory, BPR, audit log를 저장하고 모니터링하는 내부 shell이다. 핵심 판단 로직은 `packages/l5-core`에 분리한다.

```text
User / Founder
  ↓
Founder Chat Interface
  ↓
CEO Agent Orchestrator
  ↓
Executive Agent Runtime
  ↓
packages/l5-core
  ↓
NocoBase Internal Shell / PostgreSQL
  ↓
Trigger.dev Hermes Runtime
  ↓
Langfuse / Formbricks / Activepieces
```

## Core Architecture Principle

```text
Founder Chat = Primary UX
CEO Agent = Orchestrator
Executive Agents = Operators
NocoBase = Internal Shell
L5 Core = Brain
Mastra = Agent Runtime
Trigger.dev = Hermes Runtime
Langfuse = LLM Trace
Formbricks = PMF Signal
Activepieces = External Connector
PostgreSQL = Source of Truth
```

## Recommended Monorepo Structure

```text
project-root/
  CLAUDE.md
  AGENTS.md
  docs/
  schemas/
  prompts/

  apps/
    nocobase/
      packages/
        plugins/
          @l5/plugin-founder-dna/
          @l5/plugin-culture-engine/
          @l5/plugin-business-portfolio/
          @l5/plugin-pmf-experiment/
          @l5/plugin-bpr-engine/
          @l5/plugin-tool-request/
          @l5/plugin-memory-room/
          @l5/plugin-hermes-control-room/
          @l5/plugin-workflow-factory/
          @l5/plugin-agent-staffing/

  packages/
    l5-core/
      founder-dna/
      culture/
      workflow-factory/
      pmf-scoring/
      agent-staffing/
      bpr/
      tool-request/
      memory/
      decision-rules/
      workflow-evolution/
      data-governance/

  services/
    agent-runtime/
    hermes-runtime/
    automation-connectors/
    pmf-signal/
    llm-observability/
    analytics/
```

## Layer Responsibilities

### NocoBase Shell

Use for:

- Agent-readable/writable internal records
- Task, handoff, approval, memory, BPR collections
- Internal admin/debug UI
- CRUD collections
- Approval queue UI
- Plugin host
- Status/action blocks

Avoid:

- Domain scoring logic
- Long-running jobs
- Durable agent loops
- Final customer-facing SaaS UX
- Founder-facing primary workflow UX

### L5 Core

Use for:

- Founder Fit scoring
- PMF scoring
- Workflow generation rules
- Agent staffing rules
- BPR rules
- Tool Request rules
- Memory rules
- Decision authority rules
- Data governance policies

Rule:

```text
`l5-core` must run tests without NocoBase.
```

### L5 NocoBase Plugins

Use for:

- Register collections
- Render L5 rooms
- Call `l5-core`
- Call Mastra APIs
- Call Trigger.dev task endpoints
- Store outputs back to PostgreSQL/NocoBase
- Handle approval/rejection actions

Avoid:

- Hardcoding scoring logic in UI
- Storing secret prompts in client code
- Running long jobs in request handlers

### Mastra Agent Runtime

Use for:

- CEO Agent
- Chief of Staff Agent
- Agent workflows
- Tool calling
- Structured output generation
- Future RAG / memory retrieval

### Trigger.dev Hermes Runtime

Use for:

- Morning Operating Loop
- Night BPR Loop
- Stalled Workflow Detector
- PMF Deadline Checker
- Founder Approval Checker
- Tool Request Candidate Detector
- Memory Update Suggestion Generator

### Langfuse

Use for:

- LLM traces
- Prompt versions
- Cost monitoring
- Evaluation logs
- Agent decision debugging

Avoid:

- Source-of-truth business data
- Raw customer PII traces unless explicitly required and masked

### Formbricks

Use for:

- Waitlist
- PMF survey
- Customer interview request
- Feedback collection

Avoid:

- Source-of-truth CRM
- Memory database replacement

### Activepieces

Use for:

- Slack / Telegram notifications
- Gmail draft/send flows
- Google Sheets logging
- Notion sync
- Webhook bridges

Avoid:

- Core decision-making
- Business OS brain
- Broad customer data fan-out

## Data Flow — Founder Direction To Agent Execution

```text
1. Founder sends direction through chat
2. CEO Agent stores FounderInstruction
3. CEO Agent creates CEOInterpretation with goal, phase, assumptions, success criteria
4. CEO Agent decomposes work into parallel AgentTasks
5. Executive Agents run tasks and update status
6. Agents create AgentHandoffs when another owner is needed
7. NocoBase/PostgreSQL stores task state, outputs, approvals, BPR, memory candidates
8. Executive Monitor reads task/handoff state for Founder monitoring
9. Hermes detects stalled tasks, approval needs, deadlines, and recurring bottlenecks
10. CEO/Chief of Staff synthesize Founder brief and next decisions
```

## Data Flow — Business / PMF Workstream

```text
CEO Agent task
→ CPO/CMO/CRO Agent workstream
→ BusinessIdea / Business records if needed
→ Founder Fit / PMF rules in l5-core
→ PMFExperiment
→ PMFExperimentMetric
→ PMF Score calculation
→ Tool Candidate check only after PMF/repetition signals
→ Memory/BPR update
```

## Data Flow — PMF Signal

```text
PMFExperiment
→ Formbricks survey/waitlist
→ Webhook response
→ PMFExperimentMetric
→ PMF Score calculation in l5-core
→ MemoryEntry suggestion
→ Tool Candidate check
```

## Data Flow — External Action

```text
Agent Draft
→ risk_level assigned
→ DecisionQueue if D3-D5
→ Founder approval
→ Activepieces webhook
→ external send/action
→ audit log
→ Memory/BPR update
```

## Error Handling

All service calls should return a common result shape.

```ts
type L5Result<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    source: 'l5-core' | 'nocobase-plugin' | 'agent-runtime' | 'hermes-runtime' | 'external-service';
  };
  trace_id?: string;
};
```

## Migration Strategy

Portable:

- `packages/l5-core`
- entity schemas
- prompts and policies
- workflow templates
- scoring rules
- memory rules
- decision authority rules

Replaceable:

- NocoBase UI layout
- NocoBase-specific page blocks
- Plugin lifecycle code
- Internal shell

Future shell options:

- Next.js + Payload
- Directus + Next.js
- Custom Next.js + PostgreSQL
