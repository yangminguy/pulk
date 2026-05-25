# ARCHITECTURE — L5 Business OS

## System Overview

L5 Business OS는 NocoBase를 MVP Shell로 사용하지만, 핵심 판단 로직은 `packages/l5-core`에 분리한다.

```text
User / Founder
  ↓
NocoBase L5 Shell
  ↓
L5 NocoBase Plugins
  ↓
packages/l5-core
  ↓
Mastra Agent Runtime / Trigger.dev Hermes Runtime
  ↓
PostgreSQL / Langfuse / Formbricks / Activepieces
```

## Core Architecture Principle

```text
NocoBase = Shell
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

- Internal admin UI
- Rooms and boards
- CRUD collections
- Approval queue UI
- Plugin host
- Status/action blocks

Avoid:

- Domain scoring logic
- Long-running jobs
- Durable agent loops
- Final customer-facing SaaS UX

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

## Data Flow — Business Creation

```text
1. Founder enters BusinessIdea in NocoBase
2. Plugin calls l5-core Founder Fit logic
3. Plugin calls Mastra CEO Agent for Business Brief
4. Mastra retrieves Memory through controlled API
5. Workflow Factory creates PMF plan and workflows
6. Results are stored in PostgreSQL/NocoBase collections
7. Trigger.dev registers Hermes monitoring tasks
8. Hermes creates alerts, BPR logs, Tool Request candidates
9. Memory Engine stores reusable insights
10. Workflow Evolution proposes process improvements
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
