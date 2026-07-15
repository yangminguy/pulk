# CONTEXT_INTERPRETATION — L5 Business OS MVP

**Date**: 2026-05-26  
**Phase**: 0 — Context Analysis and Planning

## Executive Summary

L5 Business OS는 Founder가 직접 모든 실무를 지시하지 않아도, AI 에이전트 팀이 새로운 사업 아이디어를 평가하고 실행 가능한 워크플로우로 변환하고, PMF 검증을 통해 실제 수요를 검증한 후, 필요한 도구를 만들고, 실행 결과를 회사 자산으로 축적하는 내부 운영 시스템이다.

이는 완전 자율 회사를 만드는 것이 아니라, Founder가 최종 판단과 방향을 담당하고, CEO Agent와 전문가 에이전트들이 실행을 밀어붙이는 **반자동 회사 운영 루프**이다.

## Product Intent (What We Are Building)

### Core Loop

```
Business Idea
  ↓ [Founder DNA 기반 평가]
Founder Fit Score
  ↓ [관련 Memory 검색]
PMF Experiment Plan
  ↓ [검증 후]
Workflow + Agent Staffing
  ↓ [실행 중]
Hermes Monitoring + BPR Detection
  ↓ [완료 후]
Memory Update + Workflow Evolution
```

### What Makes This Different

1. **PMF First, Tool Second**: Tool Request는 PMF Experiment 검증 후에만 생성된다.
2. **Founder as Decision-Maker**: Founder는 최종 판단과 D4/D5 승인만 담당한다.
3. **Knowledge Accumulation**: 모든 실행 결과가 Memory와 BPR로 축적되어 다음 사업에 반영된다.
4. **Data Separation**: 고객 PII와 재사용 가능한 Business Insight가 완전 분리된다.
5. **Approval Gates**: 모든 외부 실행(D4/D5)은 Founder 승인이 필수이다.

### NOT What This Is

- **NOT an Agent Control Tower**: CTO execution tool이 아니라 Founder operating system이다.
- **NOT a fully autonomous company**: Founder의 방향성과 최종 판단이 필수이다.
- **NOT a generic task manager**: Business 운영과 PMF 검증에 특화되었다.
- **NOT a customer-facing SaaS**: 내부 운영 콘솔이다.

## MVP Boundary

### Include

✅ **Internal Operating Console**: NocoBase로 구축된 Founder 내부 운영 화면  
✅ **Founder DNA Management**: Founder의 성향, 판단 기준, 리스크 기준 관리  
✅ **Business Idea Intake & Scoring**: 새 아이디어를 입력하면 Founder Fit 평가  
✅ **PMF Experiment Planning**: Tool 제작 전 수요 검증 계획 생성  
✅ **Workflow & Agent Staffing Generation**: 실행 흐름과 에이전트 배치  
✅ **Hermes Monitoring**: 멈춘 워크플로우, 마감 지난 실험 감지  
✅ **BPR Logging**: 병목과 개선안 기록  
✅ **Tool Request Lab**: 반복 업무를 도구화 후보로 관리  
✅ **Memory Room**: 인사이트 저장 및 검색  
✅ **Data Governance**: PII 레벨과 consent scope 필드  

### Exclude

❌ **완전 자동 외부 실행**: 모든 외부 작업은 Founder 승인 필수  
❌ **결제/계약 자동화**: 금융 거래는 수동 승인만  
❌ **고객용 최종 UX**: Founder 내부 도구  
❌ **검증 전 대규모 툴 제작**: PMF 검증 없이 도구는 만들지 않음  
❌ **NocoBase 상용 플러그인 의존**: 무료/오픈소스만 사용  

## Open Source Component Map

| Component | Role | MVP Status | How Used |
|---|---|---|---|
| **NocoBase CE** | Internal admin shell | REQUIRED | Collections, rooms, plugin host, approval UI |
| **PostgreSQL** | Source-of-truth DB | REQUIRED | All data persistence |
| **L5 Core (custom)** | Domain logic | REQUIRED | Scoring, workflow generation, memory rules |
| **L5 Plugins** | NocoBase adapter | REQUIRED | Call l5-core, render rooms, store results |
| **Mastra** | Agent runtime | REQUIRED | CEO, Chief of Staff, Risk/QA agents |
| **Trigger.dev** | Hermes scheduling | REQUIRED | Morning/night loops, stalled detection |
| **Langfuse** | LLM observability | OPTIONAL MVP | Traces, cost monitoring, no real PII |
| **Formbricks** | PMF signal collection | OPTIONAL MVP | Waitlist, survey, interview request |
| **Activepieces** | External automation | OPTIONAL MVP | Slack/Telegram notifications (draft/approval only) |
| **PostHog/OpenPanel** | Analytics | NOT MVP | Later phase only |

### Architecture

```
Founder/User
  ↓
NocoBase L5 Shell (internal console)
  ↓
L5 NocoBase Plugins (adapter)
  ↓
packages/l5-core (domain logic)
  ↓
Mastra (agents) + Trigger.dev (scheduler)
  ↓
PostgreSQL + Langfuse + Formbricks + Activepieces
```

**Critical Rule**: `l5-core` must run tests without NocoBase.

## Must-Not-Build-From-Scratch List

These will use actual open-source unless impossible:

| What | Instead of | Reason |
|---|---|---|
| Admin shell | Custom Next.js dashboard | NocoBase owns this |
| CRUD screens | Hand-made forms | NocoBase provides collections |
| Job scheduler | Custom queue | Trigger.dev owns scheduling |
| LLM tracing | Custom logging | Langfuse owns traces |
| Survey/waitlist | Custom form system | Formbricks owns PMF signals |
| External automation | Custom webhook | Activepieces owns connectors |

## Risks & Mitigation

### Architecture Risk

**Risk**: NocoBase becomes the permanent brain instead of just the shell.  
**Mitigation**: All domain logic goes in `packages/l5-core` with dedicated tests.

**Risk**: Plugin UI becomes too complex and unmaintainable.  
**Mitigation**: Plugins call l5-core functions only, no business logic hardcoding.

### Data Governance Risk

**Risk**: Customer PII leaks into LLM traces or memory.  
**Mitigation**: Every record has `pii_level` field, masking before LLM calls.

### Integration Risk

**Risk**: Open-source components fail to install locally.  
**Mitigation**: Fallback adapters documented for each component.

### PMF Signal Risk

**Risk**: PMF experiments never generate enough signal.  
**Mitigation**: Manual metric collection allowed, Formbricks is optional.

### External Action Risk

**Risk**: Automated messages sent without approval.  
**Mitigation**: All D3/D4/D5 actions require explicit Founder approval.

## Execution Plan

### Phase 0 — Setup & Context (This Phase)
- [x] Read all documentation
- [x] Write context interpretation
- [ ] Create project structure
- [ ] Setup package manager + workspace config
- [ ] Create `.env.example` and scripts
- [ ] Create docker-compose for local services

### Phase 1 — NocoBase Shell & Data Skeleton
- [ ] Install/run NocoBase + PostgreSQL locally
- [ ] Create core collections (FounderDNA, Business, PMFExperiment, etc.)
- [ ] Build 7 L5 plugin package scaffolds
- [ ] Verify data model matches schemas

### Phase 2 — L5 Core Package
- [ ] Create `packages/l5-core` with TypeScript setup
- [ ] Implement `scoreFounderFit` with unit tests
- [ ] Implement `calculatePmfScore`
- [ ] Implement `decideToolCandidate`
- [ ] Implement `requiresFounderApproval`
- [ ] Implement workflow generation helpers

### Phase 3 — L5 NocoBase Plugins
- [ ] Build 3 P0 plugins (Founder DNA, Business Portfolio, PMF Experiment)
- [ ] Wire plugins to call l5-core functions
- [ ] Store generated data back to NocoBase
- [ ] Build 6 P1 plugins (Workflow, Agent Staffing, Hermes, BPR, Tool Request, Memory)

### Phase 4 — Mastra Agent Runtime
- [ ] Setup Mastra service
- [ ] Implement CEO Agent with basic tools
- [ ] Implement Chief of Staff Agent
- [ ] Implement Risk/QA Agent
- [ ] Create agent workflows (idea intake, daily brief)

### Phase 5 — Trigger.dev Hermes Runtime
- [ ] Setup Trigger.dev or local scheduler fallback
- [ ] Implement `morning-operating-loop`
- [ ] Implement `night-bpr-loop`
- [ ] Implement `stalled-workflow-detector`
- [ ] Implement `pmf-deadline-checker`

### Phase 6-8 — Optional Services (Langfuse, Formbricks, Activepieces)
- [ ] Add trace abstraction for Langfuse
- [ ] Add Formbricks webhook adapter
- [ ] Add Activepieces notification adapter (approval-gated)

### Phase 9 — End-to-End Demo
- [ ] Create `scripts/demo-mvp-loop.ts`
- [ ] Run full MVP loop: Idea → Founder Fit → PMF Plan → Workflow → Memory
- [ ] Export results to JSON/Markdown

### Phase 10-11 — QA & Finalization
- [ ] Run linting, tests, type checking
- [ ] Use Codex CLI for architecture QA
- [ ] Fix P0/P1 issues
- [ ] Update TASKS.md, HANDOFF.md, DECISIONS.md
- [ ] Write final session report

## Key Implementation Decisions

### Database Schema First

**Decision**: Define all entity schemas before building UI.  
**Reason**: Source of truth lives in PostgreSQL, UI only renders it.

### L5 Core Portability

**Decision**: `packages/l5-core` must have zero dependency on NocoBase.  
**Reason**: Core logic should be testable and reusable independently.

### Approval Gates Over Automation

**Decision**: All D3/D4/D5 external actions require explicit Founder approval before execution.  
**Reason**: Trust and control over fully autonomous actions.

### Memory Separation

**Decision**: Founder DNA + Business Insights separate from Customer PII.  
**Reason**: Insights can be reused; PII is purpose-bound and access-controlled.

### Open-Source First

**Decision**: Use actual open-source components; fallback adapters only when necessary.  
**Reason**: MVP should prove the architecture with real components, not mocks.

## Success Criteria

The MVP is successful **only if**:

1. ✅ New business idea → Founder Fit score generated
2. ✅ PMF Experiment Plan generated before Tool Request
3. ✅ Workflow + Agent Staffing generated
4. ✅ Hermes detects stalled workflows and deadline misses
5. ✅ BPR logs bottlenecks and improvements
6. ✅ Memory Room stores insights
7. ✅ PII and Business Insights separated
8. ✅ Founder approval required for D4/D5 actions
9. ✅ `l5-core` tests pass without NocoBase
10. ✅ All open-source components installed/scaffolded or documented as fallback

## Next Immediate Steps

1. **Complete Phase 0**: Setup package.json, pnpm-workspace.yaml, docker-compose.yml
2. **Create scripts**: check-env.sh, validate.sh, demo-mvp-loop.ts
3. **Install NocoBase**: Get running locally with PostgreSQL
4. **Begin Phase 1**: Create core collections and plugin scaffolds

---

**Written by**: Claude Code Orchestrator  
**Status**: Ready for Phase 0 Completion & Phase 1 Launch
