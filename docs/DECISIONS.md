# DECISIONS — L5 Business OS

## 2026-05-26 — Use NocoBase as MVP Shell

### Decision

Use NocoBase Community Edition as the MVP internal operating shell.

### Reason

NocoBase can quickly provide collections, CRUD, permissions, admin pages, dashboard blocks, and plugin extension points.

### Impact

The MVP can move faster, but NocoBase must not contain core Business OS logic.

## 2026-05-26 — Keep L5 Core Independent

### Decision

Put Founder DNA scoring, PMF scoring, Workflow Factory rules, BPR rules, Tool Request rules, Memory rules, and Decision Authority inside `packages/l5-core`.

### Reason

If NocoBase becomes limiting or expensive later, the shell can be replaced without rewriting the OS brain.

### Impact

Every L5 plugin should call `l5-core` instead of duplicating logic.

## 2026-05-26 — Use Mastra for Agent Runtime

### Decision

Use Mastra as a separate TypeScript agent runtime.

### Reason

CEO Agent and Chief of Staff Agent require multi-step reasoning, tool calls, and structured output. This should not live inside NocoBase UI.

### Impact

NocoBase plugins call agent runtime APIs.

## 2026-05-26 — Use Trigger.dev for Hermes Runtime

### Decision

Use Trigger.dev for long-running, scheduled, retryable, and approval-pause Hermes tasks.

### Reason

Hermes is a state watcher and trigger engine, not a simple notification bot.

### Impact

No scattered cron jobs inside plugin request handlers.

## 2026-05-26 — Separate Business Insights from Customer PII

### Decision

Customer-identifiable records and reusable anonymized insights must be separate entities.

### Reason

Business OS needs reusable learning, but customer data must remain purpose-bound and access-controlled.

### Impact

MemoryEntry, BusinessInsight, CustomerProfile, and CustomerConsent must include PII and usage fields.

## 2026-05-26 — PMF Before Tool

### Decision

Every business idea must pass through PMF experiment planning before tool production.

### Reason

The product philosophy is No Demand, No Tool.

### Impact

ToolRequest should be blocked or marked premature unless PMF/repetition criteria are met.
