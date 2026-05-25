# OPEN_SOURCE_INTEGRATION — L5 Business OS

## Purpose

This document defines which open-source components are used, what each component owns, and what must not be delegated to it.

## Installation Order

```text
1. NocoBase + PostgreSQL
2. L5 Core package
3. L5 NocoBase plugins
4. Mastra agent runtime
5. Trigger.dev Hermes runtime
6. Langfuse tracing
7. Formbricks PMF signal collection
8. Activepieces external automation
9. Optional analytics
```

## Component Responsibilities

| Component | MVP Responsibility | Do Not Use For |
|---|---|---|
| NocoBase CE | Shell, admin UI, data collections, permissions, plugin host | L5 domain logic, durable agent loops, final SaaS UX |
| PostgreSQL | Source-of-truth database | Business reasoning |
| L5 Core | Domain logic and rules | UI-only logic |
| L5 Plugins | Adapter between NocoBase and L5 Core | Permanent home of core logic |
| Mastra | Agent Runtime | UI rendering or source-of-truth DB |
| Trigger.dev | Hermes schedules, retryable jobs, stalled detection | Business data ownership |
| Langfuse | LLM traces, prompts, cost review | Memory database |
| Formbricks | PMF surveys, waitlists, feedback | CRM/source of truth |
| Activepieces | Notifications and external automations | Core decision-making |
| PostHog/OpenPanel | Optional analytics later | Phase 1 requirement |

## NocoBase Usage

Use:

- Admin shell
- Internal rooms
- Collection/schema management
- Basic permissions
- Plugin extension
- Approval/status/action UI

Avoid:

- Domain reasoning
- L5 scoring logic
- Long-running jobs
- Commercial plugins as MVP-critical dependency
- Deep core patching

## Mastra Usage

Use:

- CEO Agent
- Chief of Staff Agent
- Risk/QA Agent
- Agent tools
- Agent workflows
- Structured output

Avoid:

- Permanent operational data storage
- UI state management

## Trigger.dev Usage

Use:

- Morning loop
- Night BPR loop
- Deadline checks
- Stalled detection
- Approval wait states
- Retryable jobs

Avoid:

- Acting as source-of-truth DB
- Frontend UI logic

## Langfuse Usage

Use:

- LLM trace
- Prompt versioning
- Evaluation
- Cost tracking

Avoid:

- Customer PII by default
- Replacing Memory Engine

## Formbricks Usage

Use:

- Waitlist
- Survey
- Interview request
- PMF signal collection

Avoid:

- Business OS source-of-truth
- CRM replacement

## Activepieces Usage

Use:

- Slack/Telegram/Gmail/Sheets/Notion connector
- Webhook bridge
- Notification delivery

Avoid:

- Core L5 decision logic
- Sensitive customer data fan-out

## License / Cost Guardrails

MVP rules:

- Use free/community/open-source features only.
- LLM API cost is allowed.
- Avoid paid NocoBase commercial plugins.
- Avoid paid automation dependency.
- Avoid paid analytics dependency.
- Recheck licenses before external commercialization.

## Commercialization Review Trigger

Review architecture and licenses before:

- selling L5 Business OS externally
- offering as SaaS
- removing NocoBase branding
- giving customers no-code configuration powers
- packaging NocoBase-based software for clients
- using commercial plugins as core dependencies
