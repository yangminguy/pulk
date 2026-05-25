# Work Order 001: Open Source Installation & Setup

**Priority**: P0  
**Phase**: 1-2  
**Owner**: Claude Code (Orchestrator)  
**Status**: In Progress

## Objective

Install and verify all required open-source components:
- PostgreSQL (Docker)
- NocoBase CE (local development)
- L5 Core package scaffold
- L5 Plugin package scaffolds

## Acceptance Criteria

- [ ] PostgreSQL running in Docker with l5_business_os database
- [ ] NocoBase CE running locally on port 8080
- [ ] NocoBase can connect to PostgreSQL
- [ ] Core collections registered in NocoBase (FounderDNA, Business, PMFExperiment, etc.)
- [ ] 7 L5 plugin package scaffolds created under `apps/nocobase/packages/plugins/@l5/`
- [ ] All plugins can be enabled in NocoBase admin UI
- [ ] Installation report written to `reports/open-source-installation-report.md`

## Tasks

### PostgreSQL Setup

- [ ] Start PostgreSQL container: `docker-compose up -d postgres`
- [ ] Wait for health check to pass
- [ ] Verify connection: `psql -h localhost -U l5_user -d l5_business_os -c "SELECT 1;"`
- [ ] Create initial schema migration file

### NocoBase Installation

- [ ] Install NocoBase CE using npm or official guide
- [ ] Configure DATABASE_URL in .env
- [ ] Start NocoBase: `npm start` or equivalent
- [ ] Access admin UI at http://localhost:8080
- [ ] Create initial user account

### Core Collections Registration

Register these as NocoBase collections with proper schema:

- [ ] FounderDNA (category, statement, evidence, confidence, created_at)
- [ ] FounderDNAUpdateSuggestion (suggested_category, suggested_statement, status)
- [ ] Business (title, status, founder_fit_score, opportunity_score)
- [ ] BusinessIdea (title, raw_description, status, founder_fit_score)
- [ ] PMFExperiment (business_id, hypothesis, format, success_signal, pmf_score)
- [ ] PMFExperimentMetric (experiment_id, metric_name, metric_value, signal_level)
- [ ] Workflow (business_id, type, status, owner_agent_id)
- [ ] WorkflowStep (workflow_id, title, status, order_index)
- [ ] HermesAlert (alert_type, severity, title, status)
- [ ] DecisionQueue (decision_type, title, related_business_id)
- [ ] BPRLog (business_id, bottleneck, solution)
- [ ] ToolRequest (title, description, status, impact)
- [ ] MemoryEntry (category, content, related_entity_id)
- [ ] Agent (name, role, autonomy_level)
- [ ] AgentAssignment (agent_id, business_id, responsibility)

### L5 Plugin Package Scaffolds

Create empty plugin packages with proper package.json:

- [ ] @l5/plugin-founder-dna
- [ ] @l5/plugin-business-portfolio
- [ ] @l5/plugin-pmf-experiment
- [ ] @l5/plugin-workflow-factory
- [ ] @l5/plugin-agent-staffing
- [ ] @l5/plugin-hermes-control-room
- [ ] @l5/plugin-bpr-engine
- [ ] @l5/plugin-tool-request
- [ ] @l5/plugin-memory-room

Each plugin should:
- Have a proper package.json with name `@l5/plugin-{name}`
- Export a `default` function that registers with NocoBase
- Have src/client/index.ts and src/server/index.ts
- Be placeholders ready for Phase 3 implementation

### L5 Core Package Scaffold

- [ ] Create `packages/l5-core/` with package.json
- [ ] Create basic TypeScript setup (tsconfig.json, src/index.ts)
- [ ] Export placeholder functions (will implement in Phase 2)
- [ ] Setup jest for unit testing

## Report

After completion, create `reports/open-source-installation-report.md` with:

| Component | Status | Version | How to Start | Notes |
|---|---|---|---|---|
| PostgreSQL | ✅/❌ | | `docker-compose up -d postgres` | |
| NocoBase | ✅/❌ | | `npm start` in nocobase dir | |
| L5 Core | ✅/❌ | | `pnpm -r build` | |
| L5 Plugins | ✅/❌ | | Enabled via NocoBase admin | |

## Blockers / Notes

- NocoBase plugin development requires understanding NocoBase plugin API
- PostgreSQL must be accessible before NocoBase setup
- Plugin packages need proper monorepo setup to be recognized

## Next Phase

Once this WO is done, proceed to **Work Order 002: L5 Core Scoring Functions**
