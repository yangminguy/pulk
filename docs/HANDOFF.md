# HANDOFF — L5 Business OS

## Current Status

**Phase 0 완료**: 모노레포 구조, 문서 패키지, 설정 파일 전체 세팅 완료.

**Phase 2 핵심 완료**: `packages/l5-core` 에 5개 스코어링/판단 함수 구현, 25개 엔티티 타입 정의, 27개 유닛 테스트 100% 통과.

**Phase 1 미착수**: NocoBase + PostgreSQL 로컬 설치 및 컬렉션 생성 아직 진행되지 않음.

**Phase 2 일부 미완**: `generateWorkflow`, `generate7DayExperiment`, `assignAgents`, `createMemoryEntry`, `retrieveRelevantMemory` 미구현.

**현재 다음 단계**: Phase 1 (NocoBase + PostgreSQL 로컬 설치 및 컬렉션 생성) 또는 Phase 2 나머지 함수 구현.

## Current Architecture Decision

- Use NocoBase as MVP Shell.
- Keep all core domain logic in `packages/l5-core`.
- Build L5 features as NocoBase plugins.
- Use Mastra for Agent Runtime.
- Use Trigger.dev for Hermes Runtime.
- Use Langfuse for LLM observability.
- Use Formbricks for PMF signal collection.
- Use Activepieces for external automations.
- Keep customer PII separate from reusable business insights.

## Last Changes

- Phase 0: 모노레포 구조, pnpm workspace, docker-compose, .env.example, scripts 생성.
- Phase 2: `packages/l5-core` 구현 완료 — scoreFounderFit, calculatePmfScore, decideToolCandidate, requiresFounderApproval, generateBusinessBrief.
- Phase 2: 25개 TypeScript 엔티티 타입 (FounderDNA, Business, PMFExperiment 등) 정의.
- Phase 2: 27개 유닛 테스트 작성 — 100% 통과.
- 전체 문서 패키지 작성 (PRD, ARCHITECTURE, DATA_MODEL, AGENT_PROTOCOL, HERMES_SPEC, WORKFLOW_FACTORY_SPEC 등).

## Next Recommended Tasks

1. Phase 1: `docker-compose up -d postgres` 로 PostgreSQL 시작.
2. Phase 1: NocoBase 소스 설치 후 플러그인 개발 경로 확인.
3. Phase 1: FounderDNA, BusinessIdea, PMFExperiment 컬렉션 생성.
4. Phase 1: Founder DNA Room, Business Portfolio Board, PMF Experiment Board 구성.
5. Phase 2 나머지: `generateWorkflow`, `generate7DayExperiment`, `assignAgents`, `createMemoryEntry`, `retrieveRelevantMemory` 구현.
6. Phase 3: `@l5/plugin-founder-dna`, `@l5/plugin-business-portfolio`, `@l5/plugin-pmf-experiment` 구현.

## Known Risks

- NocoBase plugin development may require source install rather than Docker-only setup.
- Commercial plugin boundaries must be rechecked before commercialization.
- Customer PII must not be sent broadly to LLM traces or external tools.
- Trigger.dev/Mastra integration should be isolated behind adapters.
- MVP should not attempt to integrate every open-source tool at once.

## Important Notes

Do not start with polished custom UI.

The MVP success condition is the operating loop:

```text
Idea → PMF Experiment → Workflow → Agent Staffing → Hermes Monitoring → BPR → Memory → Evolution
```
