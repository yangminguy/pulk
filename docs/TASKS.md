# TASKS — L5 Business OS MVP

## Phase 0 — Project Setup

- [x] P0 Create monorepo structure
- [x] P0 Add `CLAUDE.md`, `AGENTS.md`, and `docs/`
- [x] P0 Add package manager and workspace config
- [x] P0 Add `.env.example`
- [x] P0 Add basic lint/test scripts

## Phase 1 — NocoBase Shell + Data Skeleton

- [ ] P0 Install NocoBase + PostgreSQL locally
- [ ] P0 Confirm plugin development path
- [ ] P0 Create core collections
- [ ] P0 Create Founder DNA Room
- [ ] P0 Create Business Portfolio Board
- [ ] P0 Create PMF Experiment Board
- [ ] P1 Create Hermes Alert Queue
- [ ] P1 Create Decision Queue
- [ ] P1 Create BPR Room
- [ ] P1 Create Tool Request Lab
- [ ] P1 Create Memory Room

## Phase 2 — L5 Core Package

- [x] P0 Create `packages/l5-core`
- [x] P0 Implement `scoreFounderFit`
- [x] P0 Implement `calculatePmfScore`
- [x] P0 Implement `decideToolCandidate`
- [x] P0 Implement `requiresFounderApproval`
- [x] P1 Implement `generateBusinessBrief`
- [ ] P1 Implement `generateWorkflow`
- [ ] P1 Implement `generate7DayExperiment`
- [ ] P1 Implement `assignAgents`
- [ ] P1 Implement `createMemoryEntry`
- [ ] P1 Implement `retrieveRelevantMemory`
- [x] P1 Add unit tests for all core scoring functions

## Phase 3 — L5 NocoBase Plugins

- [ ] P0 Create `@l5/plugin-founder-dna`
- [ ] P0 Create `@l5/plugin-business-portfolio`
- [ ] P0 Create `@l5/plugin-pmf-experiment`
- [ ] P1 Create `@l5/plugin-workflow-factory`
- [ ] P1 Create `@l5/plugin-agent-staffing`
- [ ] P1 Create `@l5/plugin-hermes-control-room`
- [ ] P1 Create `@l5/plugin-bpr-engine`
- [ ] P1 Create `@l5/plugin-tool-request`
- [ ] P1 Create `@l5/plugin-memory-room`

## Phase 4 — Mastra Agent Runtime

- [ ] P1 Install/configure Mastra service
- [ ] P1 Create CEO Agent
- [ ] P1 Create Chief of Staff Agent
- [ ] P1 Create Risk/QA Agent
- [ ] P1 Add agent tool: read Founder DNA
- [ ] P1 Add agent tool: read Memory
- [ ] P1 Add agent tool: create PMF Experiment
- [ ] P1 Add workflow: idea intake
- [ ] P1 Add workflow: daily brief
- [ ] P2 Add workflow: PMF review

## Phase 5 — Trigger.dev Hermes Runtime

- [ ] P1 Install/configure Trigger.dev or local fallback
- [ ] P1 Create `morning-operating-loop`
- [ ] P1 Create `night-bpr-loop`
- [ ] P1 Create `stalled-workflow-detector`
- [ ] P1 Create `pmf-deadline-checker`
- [ ] P2 Create `founder-approval-checker`
- [ ] P2 Create `tool-request-candidate-detector`
- [ ] P2 Create `memory-update-suggestion-generator`

## Phase 6 — Langfuse Observability

- [ ] P2 Add trace abstraction
- [ ] P2 Connect agent runtime to Langfuse
- [ ] P2 Trace Founder Fit reasoning
- [ ] P2 Trace PMF scoring reasoning
- [ ] P2 Trace BPR/Tool Request recommendations
- [ ] P2 Mask or omit PII in traces

## Phase 7 — PMF Signal Collection

- [ ] P2 Add Formbricks integration adapter
- [ ] P2 Create waitlist form template
- [ ] P2 Create customer interview request template
- [ ] P2 Create PMF validation survey template
- [ ] P2 Add webhook ingestion to PMFExperimentMetric

## Phase 8 — External Automation

- [ ] P3 Add Activepieces webhook adapter
- [ ] P3 Send HermesAlert to Telegram or Slack
- [ ] P3 Create FounderApprovalRequired notification
- [ ] P3 Create DailyFounderBrief draft/send flow
- [ ] P3 Enforce approval gate for external actions

## QA / Safety Tasks

- [ ] P0 Validate `l5-core` runs without NocoBase
- [ ] P0 Validate customer PII and Business Insight separation
- [ ] P0 Validate external actions require risk level
- [ ] P1 Validate all generated outputs store source refs
- [ ] P1 Validate export to JSON/CSV/Markdown
- [ ] P1 Validate no commercial plugin dependency

## Done

- [x] Development document package generated from source PRD
- [x] Phase 0: monorepo, CLAUDE.md, pnpm workspace, .env.example, scripts
- [x] Phase 2 (P0): l5-core package — scoreFounderFit, calculatePmfScore, decideToolCandidate, requiresFounderApproval, generateBusinessBrief
- [x] Phase 2 (P0): 25 portable TypeScript entity types
- [x] Phase 2 (P1): 27 unit tests — 100% pass rate
