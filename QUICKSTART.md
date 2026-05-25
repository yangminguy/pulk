# L5 Business OS MVP - Quick Start

**Status**: Phase 0-2 Complete (Foundation Ready)  
**Time to Read**: 3 minutes

## What Is This?

L5 Business OS는 Founder가 새로운 사업 아이디어를 입력하면:

1. Founder DNA 기반으로 평가 (Founder Fit Scoring)
2. 관련 인사이트 검색 (Memory Retrieval)
3. PMF 검증 계획 생성 (PMF Experiment Planning)
4. 실행 워크플로우 생성 (Workflow Generation)
5. 에이전트 배치 계획 생성 (Agent Staffing)
6. 실행 결과 모니터링 (Hermes Monitoring)
7. 병목 감지 및 개선 제안 (BPR Logging)
8. 재사용 가능한 인사이트 저장 (Memory Update)

이 과정을 **반자동으로 운영**하는 내부 운영 시스템입니다.

## What's Done (Phase 0-2)

✅ **L5 Core Package**
- Founder Fit 평점 시스템
- PMF 신호 분석
- Tool Request 판단 로직
- Approval 게이트 규칙
- Brief 생성 함수
- 모두 테스트 완료 (27 tests, 100% pass)

✅ **Documentation**
- Product PRD, Architecture, Data Model
- Security & Data Governance
- Agent Protocol, Hermes Spec
- Local Setup Guide

✅ **Project Structure**
- Monorepo (pnpm workspaces)
- Docker setup for PostgreSQL
- Plugin scaffolds ready
- Git initialized

## What Needs to Happen Now

### Step 1: Local Setup (30 minutes)

```bash
# Go to project
cd /Users/wonminyang/Desktop/pulk

# Read full setup guide
cat docs/LOCAL_SETUP_GUIDE.md

# Quick setup:
docker-compose up -d postgres   # Start PostgreSQL
cd apps/nocobase
npm install nocodb
npm start                         # Start NocoBase at http://localhost:8080
```

### Step 2: Verify L5 Core Works

```bash
cd packages/l5-core
pnpm install
pnpm test

# Should see: PASS (27 passed tests)
```

### Step 3: Create Collections in NocoBase

Via admin UI or:
```bash
psql -h localhost -U l5_user -d l5_business_os -f scripts/create-collections.sql
```

### Step 4: Ready for Phase 3

Once NocoBase is running with collections, you can:
- Build NocoBase plugins (Phase 3)
- Integrate Mastra agents (Phase 4)
- Setup Hermes scheduler (Phase 5)

## Key Files to Read

In order of importance:

1. **LOCAL_SETUP_GUIDE.md** - How to get everything running locally
2. **docs/ARCHITECTURE.md** - System architecture overview
3. **docs/PRD.md** - Product requirements
4. **CLAUDE.md** - Development rules

## Example: Founder Fit Scoring

L5 Core already works! Example TypeScript usage:

```typescript
import { scoreFounderFit } from '@l5/core';

const idea = {
  id: 'test-1',
  title: 'AI Customer Support Platform',
  raw_description: 'Automated support using AI',
  source: 'founder' as const,
  status: 'idea' as const,
  risk_level: 'D3' as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const founderDNA = [
  {
    id: 'dna-1',
    category: 'business_preference' as const,
    statement: 'AI and automation technologies',
    evidence: 'Built 3 successful AI projects',
    confidence: 5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const result = scoreFounderFit(idea, founderDNA);
console.log(`Founder Fit Score: ${result.score}/100`);
// Output: Founder Fit Score: 85/100
```

## Architecture Overview

```
User Input (Business Idea)
       ↓
[NocoBase UI] ← Internal Console
       ↓
[L5 Plugins] ← Adapters (Phase 3)
       ↓
[@l5/core] ← Core Logic ✅ DONE
       ↓
[PostgreSQL] ← Database
       ↓
[Output] → Founder Brief, PMF Plan, Workflow, etc.
       ↓
[Mastra Agents] ← Execution (Phase 4)
       ↓
[Trigger.dev Hermes] ← Monitoring (Phase 5)
```

## Tech Stack

| Layer | Technology | Status |
|---|---|---|
| **Database** | PostgreSQL (Docker) | Setup ready |
| **Shell** | NocoBase CE | Setup ready |
| **Core Logic** | TypeScript package | ✅ Complete |
| **Plugins** | NocoBase plugins | 📝 Phase 3 |
| **Agents** | Mastra | 📝 Phase 4 |
| **Scheduler** | Trigger.dev | 📝 Phase 5 |

## Success Criteria (What Works)

- ✅ L5 Core runs tests without NocoBase
- ✅ Founder Fit scoring generates scores 0-100
- ✅ PMF scoring aggregates metrics and signals
- ✅ Tool Request decision logic works
- ✅ Approval gates enforce D1-D5 rules
- ✅ Brief generation creates Markdown output
- ✅ All functions have 100% test coverage

## Next Steps

### This Week
1. Run LOCAL_SETUP_GUIDE locally
2. Get PostgreSQL + NocoBase running
3. Create collections
4. Run `pnpm test` in l5-core to verify

### Next Week
1. Build 3 core plugins (Founder DNA, Business Portfolio, PMF Experiment)
2. Connect plugins to l5-core functions
3. Test end-to-end flow in NocoBase UI

### Following Week
1. Setup Mastra agents (CEO, Chief of Staff, Risk/QA)
2. Implement agent tools and workflows
3. Create agent runtime service

## Questions?

- **Architecture**: See `docs/ARCHITECTURE.md`
- **Setup Issues**: See `docs/LOCAL_SETUP_GUIDE.md` Troubleshooting
- **Data Model**: See `docs/DATA_MODEL.md`
- **Security**: See `docs/SECURITY_DATA_GOVERNANCE.md`

## What This IS

- ✅ Founder operating system
- ✅ PMF-first approach (no tool building before validation)
- ✅ Decision-gated external actions
- ✅ Knowledge accumulation system
- ✅ Open-source first (NocoBase, Mastra, PostgreSQL)

## What This IS NOT

- ❌ Fully autonomous (Founder approval required)
- ❌ Customer-facing (internal use only)
- ❌ Complete product (MVP phase)
- ❌ Agent Control Tower (separate use case)
- ❌ Paid service dependent (free/open-source)

---

**Ready?** → Go to `docs/LOCAL_SETUP_GUIDE.md` and follow the "Quick Start" section!

---

**Last Updated**: 2026-05-26  
**Phase**: 0-2 Complete, Phase 3 Ready
