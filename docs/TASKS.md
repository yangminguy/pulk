# TASKS — L5 Business OS MVP

> 상태 범례: `[x]` 구현+검증 완료 · `[~]` 부분 구현/검증 필요 · `[ ]` 미착수
> 최종 업데이트: 2026-05-28 (Phase 11 완료 — Hermes Agent OpenAI 연동 완성, 4개 cron job 정상 동작). 제품 방향은 chat-first CEO orchestration + agent execution + executive monitoring으로 고정한다.

## QA 검증 현황 (2026-05-27)

| 검증 항목 | 결과 |
|---|---|
| `@l5/core` 유닛 테스트 (19 suites) | ✅ 174 tests PASS |
| NocoBase e2e auth setup | ✅ 1 passed |
| `corepack pnpm -r build` | ✅ 통과 |
| `corepack pnpm -r typecheck` / lint | ✅ 통과 |
| Authenticated NocoBase smoke | ✅ 통과 |
| `corepack pnpm validate` | ✅ 22 PASS / 1 optional Docker WARN / 0 FAIL |
| PR | [#1 feat/nocobase-real-mvp](https://github.com/yangminguy/pulk/pull/1) |

**다음 세션 진입점:** Phase 9 — Founder UI 앱 구축 (`[ ] P0` 항목부터)

## Direction Lock

- Founder-facing UX는 NocoBase admin UI가 아니라 CEO Agent와의 chat이다.
- NocoBase는 Agent들이 안정적으로 읽고 쓰는 internal shell, DB, approval queue, audit log, monitor backend다.
- 실행 기준 NocoBase 플러그인은 `apps/nocobase-app/packages/plugins/@l5/*`이다. `apps/nocobase/packages/plugins/@l5/*`는 현재 scaffold/source reference 성격이므로 대규모 병합 없이 사용 경로만 명확히 둔다.
- `services/agent-runtime`와 `services/hermes-runtime/src/loops/*`는 아직 실제 Mastra/Trigger.dev runtime이 아니라 placeholder/scaffold이다. 이번 구현의 실제 경로는 `@l5/core` orchestration + NocoBase persistence + minimal chat action이다.
- 다음 개발의 중심은 예쁜 보드가 아니라 `instruction → task → agent execution → handoff → monitor → approval → memory/BPR` 루프다.
- 모든 Agent task는 원본 Founder/CEO 지시, 수행 이유, 담당 Agent, 상태, 다음 산출물을 가져야 한다.

## Phase 0 — Verified Foundation

- [x] P0 Create monorepo structure
- [x] P0 Add development docs and workspace config
- [x] P0 Implement `packages/l5-core`
- [x] P0 Validate `@l5/core` typecheck
- [x] P0 Validate `@l5/core` unit tests: 5 suites / 42 tests
- [x] P0 Validate MVP demo loop with `pnpm demo`
  - current local command when `pnpm` is not on PATH: `corepack pnpm demo`
- [x] P0 Validate NocoBase plugin MVP can load and call core actions

## Phase 1 — Chat-First Orchestration Contract

- [x] P0 Add CEO Chat API entrypoint v1
  - verify: `/api/chat:submitInstruction` stores FounderInstruction, CEOInterpretation, AgentTask[] ✅
  - implemented: NocoBase `plugin-orchestration` action with deterministic LLMClient path
- [x] P0 Define Founder instruction schema
  - verify: instruction stores raw text, intent, constraints, desired phase, created_by, created_at ✅
  - implemented: `/packages/l5-core/src/types/orchestration.ts` (FounderInstruction)
- [x] P0 Define CEO interpretation schema
  - verify: each interpretation includes goal, assumptions, phase, success criteria, risk level ✅
  - implemented: `CEOInterpretation` type with phase, success_criteria[], risk_level
- [x] P0 Define Agent task schema
  - verify: task includes instruction_id, assigned_agent, rationale, status, expected_output, approval_required ✅
  - implemented: `AgentTask` type with all required fields + risk_level, blocker, due_at
- [x] P0 Define Agent handoff schema
  - verify: handoff includes from_agent, to_agent, context, blocker, next_action, created_at ✅
  - implemented: `AgentHandoff` type with extended fields (what_was_completed, what_remains_open, etc)
- [x] P1 Add persistence layer for instructions/tasks/handoffs
  - verify: records can be created/read without relying on page UI ✅
  - implemented: `/apps/nocobase/packages/plugins/@l5/plugin-orchestration/` (8 resource actions)
- [x] P1 Add API/action endpoints for creating and updating task state
  - verify: CEO Agent can create tasks programmatically ✅
  - implemented: POST/GET endpoints for founder_instructions, ceo_interpretations, agent_tasks, agent_handoffs

## Phase 2 — CEO Agent Orchestrator

- [x] P0 Implement CEO Agent `interpretFounderInstruction`
  - verify: chat instruction becomes structured goal + phase + assumptions ✅
  - implemented: `/packages/l5-core/src/functions/ceo-orchestration/interpreter.ts` (LLM call, AGENT_PROTOCOL format, 7 tests)
- [x] P0 Implement CEO Agent `decomposeIntoWorkstreams`
  - verify: one Founder instruction creates multiple parallel workstreams when appropriate ✅
  - implemented: `decomposer.ts` (domain-based routing CMO/CRO/CPO/CTO/COO/CFO/RiskQA, 10 tests)
- [x] P0 Implement CEO Agent `assignExecutiveTasks`
  - verify: CMO/CRO/CPO/CTO/COO/CFO/RiskQA tasks are created with rationale ✅
  - implemented: `assigner.ts` (AgentTask contract compliance, 4 tests)
- [x] P1 Implement CEO Agent approval routing
  - verify: D3/D4/D5 tasks automatically set approval_required flag ✅
  - implemented: decomposer에서 risk_level 기반 자동 설정
- [x] P1 Implement CEO Agent status synthesis
  - verify: CEO can summarize current company state from task/handoff logs ✅
  - implemented: `summarizer.ts` (status counts, pending approvals, blockers, brief generation, 6 tests)

## Phase 3 — Executive Agent Runtime

- [x] P0 Implement common Agent work protocol runner
  - verify: every agent output includes current situation, goal, bottleneck, recommendation, next owner ✅
  - implemented: `/packages/l5-core/src/functions/executive-runtime/protocol.ts` (AgentOutput interface with 14 fields, validateOutput, buildHandoff)

- [x] P1 Implement all 7 Executive Agent handlers
  - [x] CMO (cmo-handler.ts): PMF message experiment → D3 risk, approval_required=true, status=needs_review
  - [x] CRO (cro-handler.ts): Sales workflow draft → D4 risk (customer-facing), approval_required=true
  - [x] CPO (cpo-handler.ts): Productization readiness check → D2 risk, internal logic
  - [x] CTO (cto-handler.ts): Tool request review + PMF gate → D2-D4 risk, blocks premature builds
  - [x] COO (coo-handler.ts): Delivery workflow → D2 risk
  - [x] CFO (cfo-handler.ts): Financial commitment → D5 risk, approval_required=true
  - [x] RiskQA (risk-handler.ts): Risk validation, PII check, blocks unsafe items → D2-D5, can block

- [x] P1 AgentOutput protocol implemented flat (not nested)
  - 14 required fields: current_situation, source_instruction, goal, why_now, bottleneck, root_cause, options[], recommendation, action_items[], next_owner, required_tools[], confidence_level, risk_level, approval_required, insight_to_record, workflow_improvement_suggestion
  - validateOutput() detects missing fields

- [x] P2 Handler validation and error handling
  - validateOutput() checks all required fields present
  - Default handler returns D1 blocked status if agent not found
  - buildHandoff() creates AgentHandoff from output

## Phase 4 — Executive Monitor (Agent Control Tower)

- [x] P0 Build Agent Task Monitor view/API
  - verify: shows Agent, current task, source instruction, rationale, status, next output, phase, updated_at ✅
  - implemented: `TaskMonitorView.tsx` with Phase/Risk/Approval/Blocked filtering
  - API: GET /api/monitor:currentTasks
- [x] P0 Build Founder Approval Queue UI
  - verify: only decisions needing Founder attention surface here, read-only approve/reject buttons ✅
  - implemented: `ApprovalQueueView.tsx` fetching from GET /api/monitor:approvalQueue
- [x] P1 Build Workstream/Phase Monitor
  - verify: tasks are grouped by BPR phase and business direction ✅
  - implemented: `TaskMonitorView.tsx` and `FounderBriefPreview.tsx` dynamically group by phase
- [x] P1 Build Founder Brief Preview UI
  - verify: dynamically aggregates moved/blocked/approval-needed tasks and current phase ✅
  - implemented: `FounderBriefPreview.tsx` (read-only MVP)
- [x] P1 Build Memory Candidate Review UI
  - verify: memory review surface handles missing API gracefully and shows PII warnings ✅
  - implemented: `MemoryReview.tsx`
- [x] P2 Build read-only Founder view
  - verify: Founder can monitor without editing operational records directly ✅
  - implemented: plugin-executive-monitor with RLS (l5_founder role: read-only)

## Phase 5 — Approval Queue & Hermes Monitoring

- [x] P0 Implement approval queue API
  - verify: approval_required=true & status='needs_review' task 조회 ✅
  - implemented: `/services/hermes-runtime/src/api/approval-queue.ts` (getApprovalQueue, approveTask, rejectTask)
- [x] P1 Implement stalled task detector
  - verify: status=blocked 또는 overdue task 감시 ✅
  - implemented: `/services/hermes-runtime/src/tasks/stalled-task-detector.ts` (1시간마다 실행)
- [x] P1 Implement approval-required checker
  - verify: approval 필요 task daily brief 생성 ✅
  - implemented: `/services/hermes-runtime/src/tasks/approval-checker.ts` (매일 09:00)
- [x] P1 Implement daily CEO/Founder brief trigger
  - verify: summarizeAgentStatus() 기반 daily brief ✅
  - implemented: `trigger-schedules.ts` (Trigger.dev cron 설정)

## Phase 6 — NocoBase Internal Shell

- [x] P0 Keep business portfolio MVP routes working
  - verify: existing routes intact ✅
- [x] P0 Keep PMF experiment MVP routes working
  - verify: existing routes intact ✅
- [x] P0 Keep Control Room approval actions working
  - verify: existing routes intact ✅
- [x] P0 Add task/instruction/handoff collections
  - verify: 4개 NocoBase collection 등록 ✅
  - implemented: `/apps/nocobase/packages/plugins/@l5/plugin-orchestration/` + `plugin-executive-monitor/`
- [x] P1 Add permission boundaries for Founder/admin/agent records
  - verify: RLS policies (l5_agent, l5_founder) ✅
  - implemented: PostgreSQL RLS + NocoBase ACL

## Phase 6 — Policy Enforcement & Brief Implementation ✅

**Status:** 완료 (2026-05-27)

### Phase 6a: Chief of Staff Brief Auto-Generation ✅

- [x] P0 Implement Chief of Staff handler
  - implemented: `packages/l5-core/src/functions/executive-runtime/handlers/chief-of-staff-handler.ts`
  - test: chief-of-staff-handler.test.ts (9 cases PASS)

- [x] P1 Wire Hermes daily brief trigger
  - implemented: `services/hermes-runtime/src/tasks/daily-brief-generator.ts`
  - schedule constant: HERMES_SCHEDULES.DAILY_BRIEF_GENERATOR = "0 9 * * *"
  - test: daily-brief-generator.test.ts (6 cases PASS)

- [x] P1 Decision Brief routing
  - implemented: approvalQueue.length > 0 시 recommendations에 포함

### Phase 6b: Approval Queue Auto-Routing ✅

- [x] P0 Task submission D3-D5 detection
  - implemented: `executeAgentTask()` → `resolveApprovalRouting()` 함수
  - D3 → approval_routing='D3_auto_24h', D4 → 'D4_manual', D5 → 'D5_double_gate' + blocked=true

- [x] P1 D3 async auto-approve (24h window)
  - implemented: `autoApproveExpiredD3Tasks()` in `approval-queue.ts`
  - `runApprovalChecker()` 실행 시 자동 호출

- [x] P1 D4 manual approval
  - implemented: `POST /api/monitor:approveTask` / `rejectTask` 실제 DB 연결

- [x] P1 D5 double-gate
  - implemented: D5 → blocked=true 강제, RiskQA 통과 후 Founder 승인 필요

### Phase 6c: Memory Entry Persistence (Priority 2 — 1 day)

- [x] P0 Collect insights from all agent outputs
  - source: insight_to_record field from each agent
  - frequency: weekly aggregation by Chief of Staff
  - implemented: `packages/l5-core/src/functions/memory/collector.ts` (collectInsights, pii_level derivation)
  - test: 9 cases in collector.test.ts (empty, short, valid, D1/D3/D4/D5 pii_level, workflow_improvement)

- [x] P1 Memory Review Brief generation
  - schedule: Friday 17:00 weekly summary
  - implemented: `packages/l5-core/src/functions/memory/reviewer.ts` (buildMemoryReviewBrief, applyMemoryDecision)
  - hermes task: `services/hermes-runtime/src/tasks/memory-review-generator.ts` (runMemoryReviewGenerator)
  - schedule constant: HERMES_SCHEDULES.MEMORY_REVIEW_GENERATOR = "0 17 * * 5"
  - test: reviewer.test.ts (5 cases), memory-review.test.ts (6 cases)

- [x] P1 Memory approval in Approval Queue
  - actions: Founder SAVE/DISCARD decisions via applyMemoryDecision()
  - logic: SAVE/DISCARD → ok=true + decision returned; DB write handled by NocoBase plugin layer
  - DB schema: `apps/nocobase/migrations/20260527000000_create_founder_memory.sql`

- [ ] P2 Memory retrieval integration
  - CEO orchestrator: query founder_memory for context
  - use case: phase transitions, pattern recognition
  - test: verify CEO can retrieve saved memories

## Phase 7 — BPR Phase Manager ✅ (도메인 로직 완료)

- [x] P0 Define BPR phase states
  - implemented: `packages/l5-core/src/functions/bpr/types.ts`
  - 6단계: direction_alignment → pmf_diagnosis → execution_build → sales_distribution_test → productization_review → scale_automation
  - DB migration: `apps/nocobase/migrations/20260527100000_create_bpr_phases.sql`
- [x] P1 Map CEO tasks to BPR phases
  - implemented: `derivePhaseFromTasks()` in phase-manager.ts
- [x] P1 Add phase transition rules
  - implemented: `validateTransition()` — 전진만 허용, 후퇴는 Founder 승인 필요
  - phase 전환은 항상 requires_approval=true (D5 수준)
- [ ] P2 Implement Phase Transition Summary (미착수)
  - NocoBase plugin 또는 별도 UI에서 표시 필요

## Phase 8 — Real LLM & Advanced Logic (진행 중)

- [x] P1 OpenAI GPT-4o 연결 (Anthropic → OpenAI 전환 완료)
  - `createOpenAIClient()` in `packages/l5-core/src/functions/ceo-orchestration/anthropic-client.ts`
  - `OPENAI_API_KEY` 없으면 stub fallback 자동 동작
- [ ] P1 Workflow Factory LLM 연결 (현재 규칙 기반)
- [ ] P2 Memory → CEO 컨텍스트 주입
- [ ] P2 PMF Score 실제 계산 (Formbricks 연동)
- [ ] P2 Tool Request 워크플로

## Phase 9 — Founder UI ✅ (2026-05-28 완료)

**배경:** NocoBase 프론트엔드 플러그인이 "paths[1] null" 에러로 동작 안함. NocoBase는 backend API만으로 사용하고, 별도 UI 앱 구축.

**⚠️ 현재 범위:** UI + DB 상태 전환까지만 구현. 실제 Executive Agent 실행(Mastra 런타임)은 미구현.

- [x] P0 별도 Founder UI 앱 구축
  - 구현: `apps/founder-ui/` — Next.js 14 App Router (port 3000)
  - API: `localhost:13001` 호출 (JWT 인증, localStorage 토큰 관리)
  - 탭 구성: CEO 채팅 / 현황 모니터 / 승인 대기 / 워크플로 팩토리 / Memory Review
  - TypeScript 에러 0개 (`npm run typecheck` 통과)
  - 실행: `cd apps/founder-ui && npm run dev`

- [x] P1 CEO 채팅 승인 플로우 (2026-05-28)
  - `submitInstruction` → `proposed` 상태로 태스크 생성 (즉시 queued 아님)
  - `ProposedTasksPanel`: 에이전트별 색상, Risk 배지(D1-D5), 성공 기준 표시
  - "승인" → `approvePlan` → `proposed` → `queued` 일괄 전환
  - "거절" → `rejectPlan` → `proposed` → `killed` 일괄 전환
  - D3-D5 태스크: queued 전환 후 `approval_required=true` 유지 → 승인 큐 진입
  - 버그 수정: 필드명 `agent` / `task_title` / `task_id` 일치 (이전: `assigned_agent` / `title` / `id`)

- [x] P1 BPR Phase Transition Panel (2026-05-28)
  - 구현: `GET /api/bpr:currentPhase` — 활성 task 기반 현재 BPR 단계 도출
  - 구현: `POST /api/bpr:requestTransition` — 전환 검증 후 D5 승인 task 생성
  - UI: `monitor/page.tsx` PhaseTransitionPanel — 6단계 진행 바, 다음 단계 전환 폼
  - 도메인: `l5-core` `validateTransition()` / `buildTransitionResult()` 사용
  - 모든 phase 전환은 requires_approval=true (D5 수준)

- [x] P1 실제 Agent 실행 연결 (2026-05-28 완료)
  - `/api/agent:executeTask` 액션 구현 (plugin-orchestration)
    * task_id 기반 executeAgentTask() 호출
    * AgentOutput + AgentHandoff DB 저장
    * task status 업데이트 (queued → needs_review/done/blocked)
  - Founder UI 자동 실행 연결
    * approvePlan 후 각 task 자동 호출 (api.executeTask)
    * 승인 후 모든 queued 태스크 병렬 실행
  - 검증: CEO 채팅 → 승인 → executeTask 자동 호출 → Monitor 결과 반영 ✅

- [ ] P2 Implement Phase Transition Summary
  - reference: `docs/FOUNDER_BRIEF_SPEC.md` section "Phase Transition Summary"
  - include results, learnings, metrics, next phase plan

## Phase 10 — PMF 개념 정정 + Hermes 반복 분석기 ✅ (2026-05-28 완료)

### ✅ Phase 10 P0: PMF 게이트 제거 + Hermes 반복 분석기 (2시간 배치)

**완료된 작업:**
- [x] PMF 개념 명확화 (신규 사업만, 모든 태스크 게이트 아님)
- [x] CPO Handler에서 PMF 게이트 제거 (cpo-handler.ts)
  - pmfEvidence, pmfScore, hasStrongEvidence 제거
  - 모든 productization → `status: 'needs_review'` (blocked 조건 제거)
  - 단순 Offer Shape 분석으로 단순화
- [x] CTO Handler에서 PMF 게이트 제거 (cto-handler.ts)
  - PMF 점수 검증 제거
  - Phase 기반 build 블록킹 제거
  - Tool feasibility 독립 평가 → `status: 'needs_review'`
- [x] Hermes 2시간 반복 분석기 구현 (trigger-schedules.ts)
  - `REPETITION_ANALYZER: "0 */2 * * *"` 스케줄 추가
- [x] 반복 분석기 작업 파일 생성 (repetition-analyzer.ts)
  - 7일 내 동일 task_title 3회 이상 감지
  - CTO tool request 자동 생성
- [x] @l5/core 반복 감지 함수 추가 (repetition-detection.ts)
  - `analyzeRepetitionPattern()` — 패턴 메타데이터 분석
  - `generateToolRequestTask()` — CTO task 생성
  - `detectRepeatingTasks()` — 제목별 그룹화
- [x] 타입 체크 / 빌드 검증 통과
- [x] 커밋 완료 (Phase 10 PMF gates + Hermes repetition analyzer)

**개념 변경:**
- **PMF (Product-Market Fit)** = 신규 사업: 찾기 → 구현 → 판매 (시작 시에만)
- **반복 감지** = 별개 시스템: 동일 작업 3회+ → CTO 도구화 요청 (독립적)

### ✅ Phase 10 P1: Hermes Agent 로컬 cron 연동 완료 (2026-05-28)

- [x] Hermes Agent (NousResearch) 를 Trigger.dev 대신 로컬 스케줄러로 사용
- [x] `l5-repetition-analyzer` cron — 2시간마다, 반복 태스크 감지 ✅ 실행 확인
- [x] `l5-approval-brief` cron — 매일 09:00
- [x] `l5-cto-weekly-review` cron — 매주 월요일 10:00
- [x] `l5-daily-brief` cron — 매일 18:00
- [x] OpenAI gpt-4o-mini 연동 (`providers.openai-direct`, `api_mode: chat_completions`)

## Phase 12 — 남은 작업

### P1 — Hermes gateway launchd 자동 시작 등록
- 현재 gateway는 터미널 닫으면 종료됨
- `~/Library/LaunchAgents/com.l5.hermes-gateway.plist` 생성 필요
- 재부팅 후에도 자동 시작되어야 함

### P1 — Memory → CEO 컨텍스트 재주입
- CEO `interpretFounderInstruction`에서 `founder_memory` 조회
- 과거 패턴/결정/학습 내용 컨텍스트 주입 (동일 도메인 매칭)
- LLM 호출 시 memory context 포함

### P2 — ACR 프로젝트 자동 등록
- CTO 개발 태스크 시작 시 `registerACRProject()` 호출
- CTO handler에서 ACR client 연결

### P2 — Hermes → Telegram 알림
- cron job 결과를 Telegram으로 전달 (`--deliver telegram`)
- Hermes Telegram 봇 설정 필요

### P3 — OMC/OMX 연동
- 의존성 불명확, 별도 스펙 필요

### P3 — Workflow Factory LLM 연결
- 현재 규칙 기반 → 실제 LLM 연결

## Phase 8 — Future: Real LLM & Advanced Logic

- [ ] P2 Replace stub LLMClient with actual Anthropic Claude API
  - replace stub buildDeterministicLLM with real createOpenAIClient/createClaudeClient
- [ ] P2 Add real PMF metric ingestion path
- [ ] P3 Add Tool Request workflow after repeated task/PMF signals
- [ ] P3 Add Formbricks adapter when actual PMF surveys are needed

## Documentation — Phase 5 Complete ✅

**New Documents Created (May 27, 2026):**
- [x] AGENT_PROTOCOL.md (업그레이드) — 6단계 BPR + 10개 Agent output contract
- [x] FOUNDER_BRIEF_SPEC.md (신규) — 7종류 Founder brief template + timing + examples
- [x] SECURITY_DATA_GOVERNANCE.md (업그레이드) — D1-D5 상세 규칙 + RiskQA override + PMF gates

**Key Specs Documented:**
- [x] Agent output contract (CEO, ChiefOfStaff, CMO, CRO, CPO, CTO, COO, CFO, RiskQA, Culture)
- [x] Phase-based orchestration (6단계: Direction → PMF → Build → Sales → Productization → Scale)
- [x] Founder brief timing & templates (daily, decision, approval, blocked, phase transition, memory, weekly)
- [x] D1-D5 approval gates + RiskQA blocking authority
- [x] PII handling & consent scope rules
- [x] PMF-gate for tool build & productization
- [x] Memory entry approval workflow
- [x] External action safety checklist

## QA / Safety Tasks — MVP Phase 1-5

- [x] P0 Validate `l5-core` runs without NocoBase ✅
- [x] P0 Validate NocoBase plugin build ✅ (13 suites / 110 tests)
- [x] P0 Validate full orchestration flow smoke test ✅ (authenticated chat + task creation + monitor + approval queue)
- [x] P0 Validate `scripts/validate.sh`: 22 passed / 1 optional Docker warning / 0 failed ✅
  - current local command when `pnpm` is not on PATH: `corepack pnpm validate`
- [x] P0 Validate every task has source instruction reference ✅
- [x] P0 Validate every handoff has next owner or explicit stop reason ✅
- [x] P1 Validate external actions require approval gate ✅ (reference: SECURITY_DATA_GOVERNANCE.md D3-D5)
  - CMO sets approval_required=true (D3)
  - CRO sets approval_required=true (D4)
  - CFO sets approval_required=true (D5)
  - RiskQA can block unsafe items
- [x] P1 Validate monitor is read-only for Founder by default ✅ (RLS l5_founder: read-only)
- [x] P1 Validate PII separation: customer data stays out of LLM calls by default ✅
- [x] P2 Validate migration idempotent (fresh DB + existing DB both pass) ✅

## MVP Phase 1-5 Complete + Verified ✅

**Product Code Completed & Verified:**
- [x] Development document package (PRD → ARCHITECTURE → DATA_MODEL → AGENT_PROTOCOL → FOUNDER_BRIEF_SPEC → SECURITY_DATA_GOVERNANCE)
- [x] Monorepo + pnpm workspace
- [x] `@l5/core` orchestration (110/110 tests PASS across 13 suites)
- [x] CEO Agent orchestrator (interpretFounderInstruction, decompose, assign, summarize)
- [x] Executive Agent runtime (7 handlers FULLY IMPLEMENTED — not stubs)
  - CMO, CRO, CPO, CTO, COO, CFO, RiskQA all have real business logic
- [x] Executive Monitor UI (read-only, 3 API endpoints)
- [x] Approval Queue (approval routing, can handle D3-D5 gates)
- [x] Hermes monitoring (stalled-task, approval-checker, daily-brief — wiring in progress)
- [x] NocoBase plugins (2個: plugin-orchestration, plugin-executive-monitor)
- [x] PostgreSQL schema (4 tables, 11 indexes, RLS policies, idempotent migration)
- [x] Complete orchestration flow: instruction → interpretation → task → execution → handoff → monitor → approval
- [x] AgentOutput protocol (14 required fields, flat structure, validation)

**Policy & Governance Completed (May 27, 2026):**
- [x] Agent Protocol Upgrade (phase-based orchestration + actual output contracts + 7 agent specs)
- [x] Founder Brief Spec (7 brief templates + timing + examples)
- [x] Risk & Governance Spec (D1-D5 detailed + approval gates + RiskQA authority + PMF gates)
- [x] Documentation synchronized with implementation

## Phase 6+ — Implementation Tasks

Next immediate work:

**Phase 6a: Chief of Staff Brief Auto-Generation (Low Risk)**
- [ ] Chief of Staff handler to aggregate parallel task results
- [ ] Daily Brief formatting from CEO output
- [ ] Hermes integration to trigger brief generation

**Phase 6b: RiskQA Policy Enforcement (Medium Risk)**
- [ ] RiskQA handler enforcement of PII/external/D3-D5 gates
- [ ] Risk/PII/approval validation (already drafted in code, needs enforcement)
- [ ] Blocking unsafe items before Founder sees them

**Phase 6c: Memory Entry Workflow (Low Risk)**
- [ ] Collect `insight_to_record` from all agent outputs
- [ ] Weekly memory review brief generation
- [ ] Founder approval → save to founder_memory table
- [ ] Memory retrieval integration

---

## Phase 10 — CTO Agent + Agent Control Room 연동 (실제 기술 실행 레이어)

**핵심 역할 분리:**

```
CTO Agent (뇌)                      Agent Control Room (손 + 눈)
──────────────────────              ────────────────────────────────
개발자 워크플로우 이해                실행 + 트래킹 + 모니터링 UI
작업 단계 설계 (LLM 1회)             로드맵/에이전트 상태 실시간 표시
런타임 지정 (Claude/Codex/AGY)       Release Gate 관리
품질 게이트 판단                     Hermes 감시
결과 검토 → L5 피드백               CLI 세션 제어
```

**전체 플로우:**
```
L5 Business OS
  Founder → CEO → CTO 태스크 (queued)
                      ↓ LLM 1회: 개발 단계 설계 + 런타임 지정
               CTO Agent (services/agent-runtime/src/agents/cto.ts)
                      ↓ 구조화된 작업 패킷 (런타임 이미 지정 → 규칙 기반 라우팅)
          Agent Control Room (~/Desktop/양원민 개발자/agent_control_room_docs/)
               ├── Phase 1 → Claude CLI   (설계 / 스펙 / 리뷰)
               ├── Phase 2 → Codex CLI    (코드 생성 / 리팩터)
               └── Phase 3 → Antigravity  (UI / 컴포넌트)
                      ↓ 로드맵 트래킹 + 실행 상태 UI (ACR 기존 UI 그대로 활용)
               CTO: 단계별 결과 검토 → 다음 phase 승인 or 수정 지시
                      ↓ 최종 결과 callback
               AgentOutput → L5 agent_tasks 업데이트 → Monitor 반영
```

**설계 원칙:**
- CTO LLM 호출 1회 — 작업 분해 + 각 단계 런타임 지정까지 한 번에
- ACR 라우팅은 규칙 기반 — CTO가 이미 런타임 지정해서 전달하므로 추가 LLM 불필요
- ACR 트래킹 UI 재구현 없이 그대로 활용 (로드맵, 에이전트 상태, Hermes 감시 모두 포함)
- Founder는 L5 채팅에서 방향 결정 + ACR에서 실행 현황 모니터링

**ACR 위치:** `~/Desktop/양원민 개발자/agent_control_room_docs/` (Next.js, 별도 실행)
**CTO Agent:** `services/agent-runtime/src/agents/cto.ts`

---

### P0: CTO Agent 실제 구현

- [x] `services/agent-runtime/src/agents/cto.ts` 구현
  - `queued` CTO 태스크 수신 → LLM으로 개발 단계 설계
  - 출력: `phases[]` — 각 phase에 `{ name, runtime, prompt_packet, expected_output, risk_level }`
  - 런타임 지정 기준 (LLM 프롬프트에 포함):
    - 아키텍처 / 스펙 / 리뷰 → `claude`
    - 코드 생성 / 리팩터 / 테스트 → `codex`
    - UI / 컴포넌트 → `antigravity`
    - 3개 이상 파일 병렬 수정 → `omc`
  - 각 phase 패킷을 ACR API로 전달 (`POST /api/workbench:dispatch`)

- [x] L5 AgentTask → ACR intent 변환 스키마 정의
  - `l5_task_id` 포함 — ACR 완료 시 L5 태스크 업데이트에 사용
  - phase 간 의존성 표현 (phase 2는 phase 1 완료 후 시작)

- [x] Release Gate ↔ L5 D-level 동기화
  - D1-D2 → ACR 자동 실행
  - D3 → ACR Release Gate 생성 → 24h 자동 승인
  - D4-D5 → ACR Release Gate + L5 승인 큐 동시 표시 → Founder 수동 승인

---

### P0: ACR → L5 결과 피드백

- [x] ACR phase 완료 시 L5 callback 엔드포인트 구현
  - `POST /api/agent:taskCallback` (신규)
  - 페이로드: `{ l5_task_id, phase, status, output_summary, next_owner }`
  - 모든 phase 완료 → `status = done`, `insight_to_record` → founder_memory 후보 추가

- [x] ACR 실패/차단 → L5 에스컬레이션
  - 쿼터 부족 → `status = blocked`, `blocker` 기록
  - 3회 재시도 실패 → `needs_review` + 승인 큐 진입

---

### P1: Founder UI ↔ ACR 연결

- [x] L5 Founder UI 사이드바에 "Control Room" 탭 추가
  - ACR(`http://localhost:3001`) 새 탭 링크 또는 iframe 임베드
  - L5 모니터(현황) + ACR(실행 추적) 함께 사용

---

### P2: CTO 단계별 검토 루프

- [ ] phase 1 완료 → CTO LLM 검토 → "다음 진행" or "수정 후 재시도"
  - 이전 phase 산출물이 다음 phase 프롬프트 패킷에 자동 포함
  - ACR `taskCallback(status='phase_complete')` 수신 후 CTO handler 재호출 트리거
  - **→ Phase 11로 이관 (ACR runner 안정화 선행 필요)**

- [ ] OMC/OMX 연동
  - OMC smoke test 통과 확인 후 자동 선택 후보 등록
  - **→ Phase 11로 이관 (OMC 설치 및 검증 환경 선행 필요)**

---

### 완료 기준

| 항목 | 상태 | 확인 방법 |
|---|---|---|
| CTO → ACR 전달 | ✅ | `POST /api/workbench/dispatch` 라우트 구현. FeaturePlan + PlanTask 저장 |
| ACR runner → L5 결과 반영 | ✅ | runner `onComplete`에서 `l5-` prefix 감지 → L5 taskCallback 자동 호출 |
| L5 결과 반영 | ✅ | `POST /api/agent:taskCallback` — all_done/failed/blocked/phase_complete 처리 |
| D4-D5 동기화 | ⚠️ | L5 로직 구현 완료. ACR Release Gate UI 연동은 Phase 11 |
| ACR 실행 트래킹 | ⚠️ | ACR `/api/runner` 실제 실행 가능. 단, approval token + project 등록 필요 |

---

## Phase 11 — ACR 실제 사용 가능 상태로 보완 (다음 Phase)

> ACR 코드베이스 분석 결과, 아래 항목들이 해결되어야 실제로 사용 가능함.

### 현재 ACR 상태 요약

```
구현됨 (실제 작동):
  ✅ spawnAgent() — claude/codex/antigravity CLI 실제 spawn
  ✅ local-runner-daemon.mjs — 작업 큐 폴링 → CLI 실행 루프
  ✅ feature-plan-store — FeaturePlan/PlanTask JSON + Supabase fallback 저장
  ✅ agent-model-router — 라우팅 로직 (TaskKind → AgentType)
  ✅ /api/runner — approval token 검증 + spawn (SSE 스트리밍)
  ✅ /api/workbench/dispatch — (신규 추가) L5 CTO → ACR FeaturePlan 변환
  ✅ /api/l5-callback — (신규 추가) ACR → L5 완료 신호 중계
  ✅ runner onComplete → L5 callback 자동 호출 (신규 추가)

스캐폴딩/미완성:
  ⚠️ Release Gate — in-memory만 구현, UI 승인 플로우 미완성
  ⚠️ OMC/OMX — 레지스트리 등록됨, 실제 설치/검증 없음
  ⚠️ Supabase — 선택적 연동, 미설정 시 JSON 파일 fallback
```

### P0: approval token 자동 발급 플로우 연결

- [ ] L5 dispatch → ACR `/api/workbench/approval` 자동 호출 → token 발급
  - 현재: `/api/runner`는 항상 approval token 요구
  - 문제: L5에서 dispatch만 하면 runner 실행 불가 (token 없음)
  - 해결: dispatch 라우트에서 approval token 자동 발급 후 runner까지 연결
  - 또는: D1-D2 자동 실행 시 token 없이 실행 가능한 내부 직접 실행 경로 추가

### P0: project 등록 자동화

- [ ] L5 dispatch 시 ACR project 자동 등록
  - 현재: runner는 projectId가 ACR에 등록된 project여야 실행 가능
  - 문제: L5에서 보낸 FeaturePlan의 projectId가 ACR DB에 없으면 실패
  - 해결: dispatch 라우트에서 project 없으면 auto-create

### P1: Release Gate UI ↔ L5 승인 큐 연동

- [ ] D3-D5 태스크 → ACR Release Gate 생성 + L5 승인 큐 동시 표시
  - 현재: Release Gate는 in-memory Map만 사용 (서버 재시작 시 소멸)
  - 해결: Release Gate를 file/DB 영속화 + L5 approval queue와 양방향 동기화

### P1: ACR daemon 자동 시작 관리

- [ ] `local-runner-daemon.mjs` 시작/종료를 ACR UI에서 관리
  - 현재: daemon을 수동으로 `node scripts/local-runner-daemon.mjs`로 실행
  - 해결: ACR 시작 시 daemon 자동 실행 또는 UI에서 on/off

### P1: Supabase 영속화

- [ ] FeaturePlan, ExecutionLog, ReleaseGate를 Supabase에 영속화
  - 현재: JSON 파일 fallback 사용 중 (서버 재배포 시 데이터 소실 위험)
  - 해결: Supabase 프로젝트 설정 + 마이그레이션 적용

### P2: OMC/OMX 설치 및 연동

- [ ] OMC 설치 → smoke test → runtime registry에 `available_verified` 상태로 등록
  - 현재: registry에 등록됐지만 `status: 'not_installed'`에 해당하는 상태
  - 해결: `omc doctor` 통과 후 자동 선택 후보 등록

### P2: CTO phase 검토 루프

- [ ] ACR `phase_complete` callback → L5 CTO handler 재호출 → "진행" or "재시도" 결정
  - 이전 phase 산출물을 다음 phase prompt_packet에 자동 포함
  - L5 monitor에서 phase별 진행 상태 표시

### 완료 기준 (Phase 11) — ✅ 2026-05-28 완료

| 항목 | 결과 |
|---|---|
| founder_memory 컬렉션 등록 | ✅ plugin-executive-monitor defineCollection 추가 |
| Hermes NocoBase HTTP 클라이언트 | ✅ `services/hermes-runtime/src/api/nocobase-client.ts` |
| Hermes runner (Live 데이터 연결) | ✅ `services/hermes-runtime/src/runner.ts` |
| ACR 승인 토큰 자동 발행 | ✅ agent_tasks.acr_token + executeTask 자동 생성 |
| ACR 콜백 엔드포인트 | ✅ `POST /api/acr:approvalCallback` |
| CTO Phase Review 태스크 | ✅ `services/hermes-runtime/src/tasks/cto-phase-review.ts` |
| ACR HTTP 클라이언트 | ✅ `services/hermes-runtime/src/api/acr-client.ts` |
| 타입체크 | ✅ hermes-runtime + plugin-orchestration + plugin-executive-monitor |
| 테스트 | ✅ 174 tests PASS (l5-core) + 13 tests PASS (hermes-runtime) |

## Phase 12 — 다음 단계

- [ ] Trigger.dev 실제 cron 등록 (runner.ts 함수들 → Trigger.dev task 래핑)
- [ ] ACR 프로젝트 자동 등록 (Business 생성 이벤트 → `registerACRProject()` 호출)
- [ ] OMC/OMX 연동 (별도 스펙 작성 후 착수)
- [ ] ACR daemon 자동 시작 관리
