# NocoBase L5 Business OS Shell

## Overview

NocoBase is the MVP shell for L5 Business OS. It provides:
- Internal admin UI
- Data collection management via plugins
- Rooms and boards for workflow visualization
- Approval queues and status dashboards
- Plugin host for L5 domain-specific modules

## Setup Guide

### Prerequisites

- Node.js 18+ and npm/pnpm
- Docker and Docker Compose (for PostgreSQL)
- 4GB RAM minimum
- 2GB disk space

### Installation Steps

1. **Start PostgreSQL**
   ```bash
   cd ../..  # Go to project root
   docker-compose up -d postgres
   sleep 5
   ```

2. **Configure Environment**
   ```bash
   cp ../../.env.example ../../.env
   # Edit .env with your settings
   ```

3. **Install NocoBase**
   ```bash
   npm install nocodb
   # OR using official guide: https://docs.nocodb.com/installation/docker
   ```

4. **Start NocoBase**
   ```bash
   npm start
   # Access at http://localhost:8080
   ```

5. **Initial Setup**
   - Create admin account
   - Connect to PostgreSQL database
   - Verify connection

### Plugin Development

Current source-of-truth note:

- The runnable local NocoBase app lives in `apps/nocobase-app`.
- Plugin packages under `apps/nocobase/packages/plugins/@l5/*` are scaffold/source references unless explicitly copied or built into `apps/nocobase-app`.
- For the current CEO Chat E2E path, use `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration` and the `/api/chat:submitInstruction` action.

L5 Plugins extend NocoBase functionality. Create plugins in `packages/plugins/`:

```bash
# Plugin structure
@l5/plugin-founder-dna/
  src/
    client/        # Client-side components
    server/        # Server-side hooks
    index.ts       # Plugin entry
  package.json
```

Each plugin:
- Registers NocoBase collections
- Calls `@l5/core` functions
- Handles approval/action flows
- Stores results in PostgreSQL

### Plugin Installation

1. **Create empty plugin structure** (done in Phase 3)
2. **Register in plugin manifest** (handled by NocoBase)
3. **Enable in admin UI**
4. **Verify data flow**

## Architecture Inside NocoBase

```
NocoBase Admin UI
  ├── Founder DNA Room
  │   └── @l5/plugin-founder-dna
  │       └── Calls scoreFounderFit
  │
  ├── Business Portfolio Board
  │   └── @l5/plugin-business-portfolio
  │       └── Collections: Business, BusinessIdea
  │
  ├── PMF Experiment Board
  │   └── @l5/plugin-pmf-experiment
  │       └── Calls calculatePmfScore
  │
  ├── Workflow Factory
  │   └── @l5/plugin-workflow-factory
  │       └── Generates workflows
  │
  ├── Hermes Control Room
  │   └── @l5/plugin-hermes-control-room
  │       └── Shows alerts & decisions
  │
  └── Memory Room
      └── @l5/plugin-memory-room
          └── Stores & retrieves insights
```

## Collections to Create

Register these in NocoBase before running plugins:

| Collection | Purpose | Key Fields |
|---|---|---|
| FounderDNA | Founder profile | category, statement, confidence |
| Business | Active businesses | title, status, founder_fit_score |
| BusinessIdea | Idea backlog | title, status, risk_level |
| PMFExperiment | Experiments | business_id, hypothesis, pmf_score |
| PMFExperimentMetric | Experiment data | experiment_id, metric_name, signal_level |
| Workflow | Workflows | business_id, type, status |
| HermesAlert | Monitoring alerts | alert_type, severity, status |
| DecisionQueue | Approval items | decision_type, status |
| BPRLog | Process improvements | bottleneck, solution, status |
| ToolRequest | Tool candidates | title, status, impact_score |
| MemoryEntry | Insights | category, content, searchable_tags |

## Data Flow

```
User/Founder
  ↓
NocoBase UI
  ↓
L5 Plugin (client)
  ↓
L5 Plugin (server) → @l5/core function
  ↓
PostgreSQL
```

## Common Tasks

### View/Edit Founder DNA

1. Open Founder DNA Room
2. Edit entries
3. System suggests DNA updates based on past outcomes
4. Approve/reject suggestions

### Submit Business Idea

1. Open Business Portfolio Board
2. Add new BusinessIdea
3. Trigger Founder Fit scoring
4. Review recommendation
5. Convert to Business or kill

### Monitor Hermes Alerts

1. Open Hermes Control Room
2. View open alerts by severity
3. Acknowledge or resolve
4. Take suggested action

### Access Memory Room

1. Open Memory Room
2. Filter by category
3. Search by tags
4. Use insights in new decisions

## Troubleshooting

### NocoBase won't connect to PostgreSQL

- Verify PostgreSQL is running: `docker ps`
- Check DATABASE_URL in .env
- Verify credentials match docker-compose.yml
- Test connection: `psql $DATABASE_URL -c "SELECT 1;"`

### Plugins not appearing

- Ensure plugin packages are in `packages/plugins/`
- Run plugin registration command
- Restart NocoBase
- Check browser console for errors

### Collections not showing

- Verify collection registration in plugin
- Check database for created tables
- Refresh NocoBase UI

## Next Steps

1. **Phase 3**: Build L5 plugins with UI
2. **Phase 4**: Connect Mastra agents
3. **Phase 5**: Integrate Trigger.dev Hermes
4. **Phase 6**: Add LLM tracing (Langfuse)
5. **Phase 7**: Setup PMF signals (Formbricks)
6. **Phase 8**: External automations (Activepieces)

## Documentation

- [NocoBase Official Docs](https://docs.nocodb.com)
- [L5 Plugin Development Guide](../../docs/PLUGIN_DEVELOPMENT.md)
- [L5 Architecture](../../docs/ARCHITECTURE.md)
- [API Integration](../../docs/API.md)
