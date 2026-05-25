# L5 Business OS MVP - Local Setup Guide

**Last Updated**: 2026-05-26  
**Status**: Phase 0-2 Complete, Phases 3-5 Ready for Implementation

## Quick Start (30 minutes)

### 1. Verify Prerequisites

```bash
node --version      # Should be 18+
npm --version       # Should be 8+
docker --version    # Required for PostgreSQL
docker-compose --version
```

### 2. Setup Database

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Verify it's running
docker ps | grep postgres

# Test connection
PGPASSWORD=l5_secure_password psql -h localhost -U l5_user -d l5_business_os -c "SELECT version();"
```

### 3. Setup NocoBase

```bash
cd apps/nocobase

# Install NocoBase (follow official guide or use npm)
npm install nocodb

# Create .env file
cp ../../.env.example .env
# Edit .env if needed (default values usually work)

# Start NocoBase
npm start

# Should be available at http://localhost:8080
```

### 4. Verify L5 Core Package

```bash
cd packages/l5-core

# Install dependencies
pnpm install

# Run tests
pnpm test

# Should see all tests passing
```

### 5. Initialize Collections in NocoBase

Visit `http://localhost:8080/admin` and manually create these collections, OR run the SQL setup script:

```bash
# From project root
psql -h localhost -U l5_user -d l5_business_os -f scripts/create-collections.sql
```

## Detailed Setup Steps

### Step 1: Clone and Install

```bash
# Install root dependencies
pnpm install

# Install all workspace packages
pnpm -r install
```

### Step 2: Environment Setup

```bash
# Copy example env
cp .env.example .env

# Edit .env with local values (optional - defaults work)
# POSTGRES_USER=l5_user
# POSTGRES_PASSWORD=l5_secure_password
# NOCOBASE_PORT=8080
```

### Step 3: Start Services

**Terminal 1 - PostgreSQL:**
```bash
docker-compose up postgres
# Keep running
```

**Terminal 2 - NocoBase:**
```bash
cd apps/nocobase
npm start
# Visit http://localhost:8080
```

**Terminal 3 (optional) - Project:**
```bash
# Setup and test L5 Core
cd packages/l5-core
pnpm test

# Watch mode for development
pnpm dev
```

### Step 4: Configure NocoBase

1. **Access Admin Panel**
   - Go to http://localhost:8080/admin
   - Create admin account (first time)

2. **Verify Database Connection**
   - Settings → Database
   - Should show PostgreSQL connection

3. **Create Collections**
   - Use script: `bash scripts/create-collections.sql`
   - Or manually create via admin UI

4. **Install L5 Plugins** (Phase 3+)
   - Plugins are added to NocoBase after development

## Understanding the Architecture

```
Local Dev Environment
│
├─ PostgreSQL (Docker)         ← Source of truth
│
├─ NocoBase (localhost:8080)   ← Internal shell
│  ├─ Collections (tables)
│  ├─ L5 Plugins (Phase 3+)
│  └─ Approval UI
│
├─ L5 Core (packages/l5-core)  ← Domain logic
│  ├─ scoreFounderFit
│  ├─ calculatePmfScore
│  ├─ decideToolCandidate
│  └─ generateBrief
│
└─ (Phase 4+) Mastra Agents    ← Agent runtime
  ├─ CEO Agent
  ├─ Chief of Staff
  └─ Risk/QA Agent
```

## Key Directories

| Path | Purpose | Status |
|------|---------|--------|
| `packages/l5-core/` | Business logic | ✅ Phase 2 Complete |
| `apps/nocobase/` | MVP Shell | 🔄 Phase 1 (setup) |
| `apps/nocobase/packages/plugins/` | UI Plugins | ⏳ Phase 3 |
| `services/agent-runtime/` | Mastra agents | ⏳ Phase 4 |
| `services/hermes-runtime/` | Trigger.dev scheduler | ⏳ Phase 5 |
| `docs/` | Documentation | ✅ Complete |
| `schemas/` | Portable types | ✅ In l5-core |

## Testing L5 Core Locally

```bash
cd packages/l5-core

# Run all tests
pnpm test

# Watch mode (re-run on file changes)
pnpm test:watch

# Coverage report
pnpm test:coverage

# Type checking
pnpm typecheck

# Build distribution
pnpm build
```

### Example: Using L5 Core in Node

```typescript
import { scoreFounderFit, calculatePmfScore } from '@l5/core';

const idea = {
  id: 'test-1',
  title: 'AI Customer Support',
  raw_description: 'Automated customer service tool',
  source: 'founder' as const,
  status: 'idea' as const,
  risk_level: 'D3' as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const dna = [
  {
    id: 'dna-1',
    category: 'business_preference' as const,
    statement: 'AI and automation',
    evidence: 'Built 3 AI projects',
    confidence: 5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const result = scoreFounderFit(idea, dna);
console.log(`Founder Fit: ${result.score}/100`);
```

## Common Issues & Solutions

### Docker PostgreSQL Won't Start

```bash
# Check if port 5432 is in use
lsof -i :5432

# If another service uses it, either:
# 1. Stop the other service
# 2. Change POSTGRES_PORT in .env and docker-compose.yml

# Restart Docker
docker-compose down
docker-compose up -d postgres
```

### NocoBase Database Connection Failed

```bash
# Verify PostgreSQL is running
docker ps | grep postgres

# Check DATABASE_URL in .env
echo $DATABASE_URL

# Test connection directly
PGPASSWORD=l5_secure_password psql -h localhost -U l5_user -d l5_business_os -c "SELECT 1;"
```

### L5 Core Tests Fail

```bash
# Make sure dependencies are installed
cd packages/l5-core
pnpm install

# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Run tests with verbose output
pnpm test -- --verbose
```

### NocoBase Not Accessible

```bash
# Check if process is running
ps aux | grep nocobase

# Check logs
cd apps/nocobase
npm start  # Run in foreground to see logs

# Verify port 8080 is free
lsof -i :8080
```

## Next Steps After Setup

### Phase 3 - Build Plugins

Once L5 Core tests pass and NocoBase runs:

```bash
# Create first plugin
cd apps/nocobase/packages/plugins

# (Plugin scaffolds created in Phase 1, will be implemented in Phase 3)
```

### Phase 4 - Setup Agents

```bash
cd services/agent-runtime
# Mastra agent setup (Phase 4)
```

### Phase 5 - Setup Hermes

```bash
cd services/hermes-runtime
# Trigger.dev scheduling (Phase 5)
```

## Development Workflow

### Making Changes to L5 Core

```bash
cd packages/l5-core

# Edit src/functions/*.ts
vim src/functions/founder-fit.ts

# Test changes
pnpm test

# Watch mode while developing
pnpm dev
```

### Testing Phase 1-2 Locally

```bash
# Generate example data
tsx scripts/demo-mvp-loop.ts

# Output is in reports/demo/
cat reports/demo/result.json
```

## Checking Status

```bash
# See what's running
docker ps

# Check services
lsof -i :5432    # PostgreSQL
lsof -i :8080    # NocoBase
lsof -i :3001    # Mastra (Phase 4+)

# See git status
git log --oneline | head -5
git status
```

## Resources

- **L5 Architecture**: `docs/ARCHITECTURE.md`
- **Data Model**: `docs/DATA_MODEL.md`
- **Security**: `docs/SECURITY_DATA_GOVERNANCE.md`
- **Plugin Dev**: `docs/PLUGIN_DEVELOPMENT.md` (create in Phase 3)
- **API Reference**: `docs/API.md`

## Debugging

Enable verbose logging:

```bash
# For L5 Core tests
pnpm test -- --verbose --detectOpenHandles

# For NocoBase
export DEBUG=nocobase:*
npm start

# For PostgreSQL
docker-compose logs -f postgres
```

## Performance Tips

- **L5 Core** runs instantly (in-memory functions)
- **NocoBase startup** takes ~30 seconds first time, ~5 seconds after
- **Test suite** runs <2 seconds (20+ tests)
- Database queries should complete <100ms

If you experience slow performance, check:
1. PostgreSQL logs: `docker-compose logs postgres`
2. NocoBase logs: Check browser console
3. Network latency: Verify Docker can access host PostgreSQL

---

**Questions?** See `docs/DECISIONS.md` for architectural choices or open an issue.
