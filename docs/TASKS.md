# TASKS — L5 Business OS MVP

> 상태 범례: `[x]` 구현+검증 완료 · `[~]` 부분 구현/검증 필요 · `[ ]` 미착수
> 최종 업데이트: 2026-05-28 (Phase 13 완료 — LLM 역할 분류 + 6개 에이전트 실제 OpenAI 실행 + Task Dispatcher). 제품 방향은 chat-first CEO orchestration + agent execution + executive monitoring으로 고정한다.

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
- `services/agent-runtime`와 `services/hermes-runtime/src/loops/*`는 아직 실제 Mastra runtime이 아니라 placeholder/scaffold이다. 이번 구현의 실제 경로는 `@l5/core` orchestration + NocoBase persistence + minimal chat action이다.
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
  - implemented: `trigger-schedules.ts` (Hermes cron 스케줄 상수)

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
- [x] P2 Implement Phase Transition Summary ✅ (2026-05-29) — see Phase 9 P2

## Phase 8 — Real LLM & Advanced Logic (진행 중)

- [x] P1 OpenAI GPT-4o 연결 (Anthropic → OpenAI 전환 완료)
  - `createOpenAIClient()` in `packages/l5-core/src/functions/ceo-orchestration/anthropic-client.ts`
  - `OPENAI_API_KEY` 없으면 stub fallback 자동 동작
- [x] P1 Workflow Factory LLM 연결 ✅ (2026-05-29)
  - `generateWorkflowWithLLM(input, llm?)` 신규 — deterministic baseline + LLM 시 JSON 응답 partial merge, throw/parse-fail/empty 시 fallback
  - plugin `generateWorkflow` 액션이 OPENAI_API_KEY gated로 LLM 경로 선택
  - 5 new tests PASS (baseline, throw fallback, junk fallback, partial merge, fenced JSON)
- [ ] P2 Memory → CEO 컨텍스트 주입
- [~] **OUT OF SCOPE** PMF Score 실제 계산 (Formbricks 연동) — DECISIONS.md 2026-05-29 참조. Hermes 반복 감지 + Founder 정성 판단으로 대체
- [x] P2 Tool Request 워크플로 ✅ (2026-05-29 오후) — Founder UI `/tool-requests` + plugin-executive-monitor `monitor:toolRequests` 액션. 사이드바 노출 라이브 확인

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

- [x] P2 Implement Phase Transition Summary ✅ (2026-05-29)
  - `packages/l5-core/src/functions/bpr/transition-summary.ts` 신규 — pure `buildPhaseTransitionSummary()` (8/8 tests PASS)
  - `bpr:transitionSummary` 액션 + `api.transitionSummary()` 클라이언트
  - `PhaseTransitionPanel`이 전환 요청 전에 요약 인라인 미리보기 (성공 기준, 미해결 항목, 인사이트, 다음 단계 계획)

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

- [x] Hermes Agent 로컬 스케줄러 사용 (launchd 기반)
- [x] `l5-repetition-analyzer` cron — 2시간마다, 반복 태스크 감지 ✅ 실행 확인
- [x] `l5-approval-brief` cron — 매일 09:00
- [x] `l5-cto-weekly-review` cron — 매주 월요일 10:00
- [x] `l5-daily-brief` cron — 매일 18:00
- [x] OpenAI gpt-4o-mini 연동 (`providers.openai-direct`, `api_mode: chat_completions`)

## Phase 13 — 완료 (2026-05-28)

### [x] P1 — LLM 기반 역할 분류 (decomposeIntoWorkstreams)
- `packages/l5-core/src/functions/ceo-orchestration/decomposer.ts`: async + LLM 호출, 키워드 fallback 유지
- `instructions.action.ts`: `await decomposeIntoWorkstreams(...)` + `llm` 전달

### [x] P1 — 에이전트 실제 OpenAI 실행
- CMO, CRO, CPO, COO, CFO: GPT-4o 호출 + deterministic fallback 구현
- RiskQA, ChiefOfStaff: 기존 placeholder → 실제 LLM 구현
- `@l5/agent-runtime` index.ts에 모두 export

### [x] P1 — Task Dispatcher (1분 Hermes cron)
- `services/hermes-runtime/src/tasks/task-dispatcher.ts`: queued + approval_required=false 태스크 자동 실행
- `fetchQueuedTasks()`, `runTaskDispatcherLive()` 추가
- launchd plist: `com.l5.hermes.task-dispatcher.plist`

## Phase 12 — 완료 (2026-05-28)

### [x] P1 — Hermes gateway launchd 자동 시작 등록
### [x] P1 — Memory → CEO 컨텍스트 재주입
### [x] P2 — ACR 프로젝트 자동 등록
### [x] Trigger.dev 참조 제거 (의도적 미구현)

## Phase 8 — Future: Real LLM & Advanced Logic

- [ ] P2 Replace stub LLMClient with actual Anthropic Claude API
  - replace stub buildDeterministicLLM with real createOpenAIClient/createClaudeClient
- [ ] P2 Add real PMF metric ingestion path
- [ ] P3 Add Tool Request workflow after repeated task/PMF signals
- [~] **OUT OF SCOPE** Formbricks adapter — DECISIONS.md 2026-05-29

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

- [~] **OUT OF SCOPE** OMC/OMX 연동 — DECISIONS.md 2026-05-29. ACR 내장 agent-model-router로 충분

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

### P1: ACR daemon 자동 시작 관리 ✅ (2026-05-29 오후)

- [x] launchd LaunchAgent 등록 — ACR `launchd/com.l5.acr-daemon.plist` + `scripts/install-launchd.sh`
  - KeepAlive=true, RunAtLoad=true, CONTROL_ROOM_URL=http://localhost:3001
  - `launchctl list | grep com.l5.acr-daemon` 등록 확인 (PID stable)
  - 로그: `~/Library/Logs/l5-acr-daemon.{out,err}.log`
  - 설치: `export L5_SHARED_SECRET=... L5_ADMIN_TOKEN=... && bash scripts/install-launchd.sh`

### P1: Supabase 영속화

- [ ] FeaturePlan, ExecutionLog, ReleaseGate를 Supabase에 영속화
  - 현재: JSON 파일 fallback 사용 중 (서버 재배포 시 데이터 소실 위험)
  - 해결: Supabase 프로젝트 설정 + 마이그레이션 적용

### ~~P2: OMC/OMX 설치 및 연동~~ — **OUT OF SCOPE** (DECISIONS.md 2026-05-29)

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

- [x] launchd 자동 시작 등록 (4개 cron job, `scripts/install-launchd.sh`)
- [x] ACR 프로젝트 자동 등록 (`runCTOAgent()` 시작 시 `registerWithACR()` 호출)
- [x] Memory → CEO context 재주입 (`interpretFounderInstruction` memories 파라미터)
- [~] **OUT OF SCOPE** OMC/OMX 연동 — DECISIONS.md 2026-05-29
- [ ] ACR daemon 자동 시작 관리

---

## Phase 14 — ACR 무인 실행 루프 (P0, ✅ 코드 완료 / 라이브 E2E 대기)

**목표:** CTO가 dispatch한 D1-D2 phase가 사람 클릭 없이 자동으로 spawn → 콜백까지 흐른다.

**왜:** 현재 `/api/runner`는 approval token + UI 클릭 필요. CTO가 자율적으로 코딩하려면 헤드리스 자동 실행 루프가 필수.

### P0-1: ACR PlanTask에 CTO 메타데이터 보존 ✅

- [x] ACR `lib/storage/cto-task-metadata-store.ts` 신규 — planId+taskId → { auto_execute, release_gate_type, risk_level, runtime, cwd, l5_task_id } 저장 (파일+메모리 fallback)
- [x] `dispatch/route.ts`: phase별 metadata를 sidecar store에 함께 저장 (`saveCTOTaskMetadataBatch`)

### P0-2: 내부 approval token 자동 발급 엔드포인트 ✅

- [x] ACR `app/api/orchestration/internal-token/route.ts` 신규
- [x] `L5_SHARED_SECRET` 헤더 검증 (없으면 503 fail-closed)
- [x] `issueApprovalToken()` 호출 후 token + expiresIn 반환
- [x] 발급 로그 기록

### P0-3: Auto-dispatcher worker ✅

- [x] ACR `lib/orchestration/auto-dispatcher.ts` 신규
  - `dispatchNextTask(planId, excludeTaskIds)`: 다음 적격 task 1건 실행 (in-drain 중복 방지)
  - `runAutoDispatchForPlan(planId)`: 최대 20 phase 드레인
  - `scheduleAutoDispatch(planId)`: setImmediate fire-and-forget
  - cwd 해석: metadata.cwd → project lookup → `L5_DEFAULT_PROJECT_PATH` env
  - `issueApprovalToken()` in-process → `/api/runner` POST → SSE 끝까지 소비
- [x] `app/api/orchestration/auto-dispatch/route.ts` 신규 — POST { planId } 수동 트리거

### P0-4: Dispatch 후 자동 트리거 ✅

- [x] `dispatch/route.ts`: 저장 직후 auto_execute=true 태스크가 있으면 `scheduleAutoDispatch` fire-and-forget
- [x] D3+ 태스크 (release_gate_type !== "none")는 auto-dispatcher가 자동 skip

### P0-5: L5 → ACR cwd 힌트 전달 ✅

- [x] `packages/l5-core/src/types/acr-intent.ts`: `ACRIntent.project_path?: string` 추가
- [x] `services/agent-runtime/src/agents/cto.ts`: `resolveProjectPath()` 헬퍼 — task → env → undefined
- [x] LLM/deterministic intent 양쪽에서 project_path 채움

### P0-6: E2E 검증 ✅ (통합 테스트)

- [x] `__tests__/auto-dispatcher.test.ts` — D2 auto_execute 2-phase intent → /api/runner 2회 호출 + 올바른 token/cwd/agent/prompt 검증
- [x] D4 manual_founder phase → auto-dispatch 차단 검증
- [x] internal-token 401/200/503 게이트 검증
- [ ] **라이브 검증 (TODO):** 실제 ACR + L5 서버 기동 후 D2 CTO 태스크로 end-to-end 확인 (Claude CLI 실제 spawn 포함)

---

## Phase 15 — CTO 프로젝트 부트스트랩 (P0, ✅ 코드 완료 / 라이브 E2E 대기)

**목표:** CTO가 새 비즈니스용 코드베이스를 ACR에 자율 등록.

- [x] ACR `POST /api/projects` 라우트 실제 구현 — 위험 경로 차단 + 멱등 upsert (`app/api/projects/route.ts`)
- [x] ACR Phase G P0-2 — 등록 직후 AGENTS.md/CLAUDE.md/docs/*.md 자동 ingestion (`lib/ingestion/project-docs-ingestor.ts`, fire-and-forget)
- [x] L5 CTO `bootstrapProjectIfMissing()` — `registerWithACR` 실패 시 `L5_DEFAULT_PROJECT_PATH` 기반 재시도 (`services/agent-runtime/src/agents/cto.ts`)
- [x] L5 비즈니스 생성 시점에 ACR 프로젝트 미리 register — plugin-business-portfolio `acrRegister` 액션 + BusinessPortfolioPage 호출
- [x] ACR `workbench/dispatch`에서 `project_path` 있고 ACR project 없으면 auto-create + ingestion 트리거
- [ ] **라이브 검증 (TODO):** 비즈니스 생성 → ACR projects.json 확인 + CTO D2 dispatch → daemon spawn 시 올바른 cwd 사용 확인

**검증 결과**
- ACR `__tests__/projects-register.test.ts` (신규) 8/8 PASS
- ACR `auto-dispatcher.test.ts` 회귀 4/4 PASS
- ACR 전체 41/42 suites PASS (사전 존재 1건 미해결 — Phase 15 무관)
- L5 `pnpm -r typecheck` 통과, @l5/core 174/174 tests PASS

---

## Phase 16 — Phase-to-Phase 자율 진행 루프 (P1, ✅ 코드 완료 2026-05-28)

**목표:** phase 1 완료 → phase 2 prompt가 phase 1 결과(diff/log)를 컨텍스트로 받아 spawn.

- [x] ACR `/api/l5-callback` → L5 `taskCallback`에 `diff_summary`·`log_tail`·`exit_code`·`branch` 첨부 (`app/api/runner/route.ts`, `app/api/l5-callback/route.ts`)
- [x] ACR auto-dispatcher가 직전 완료 phase의 diff+log를 다음 phase prompt 앞에 `[PRIOR PHASE CONTEXT]` 블록으로 prepend (`lib/orchestration/auto-dispatcher.ts: buildPriorPhaseContext`)
- [x] L5 `taskCallback`이 새 필드 수신 + phaseCtx 요약 blocker 기록 + log_tail 콘솔 로그
- [x] **Phase 16.5 완료 (2026-05-28):** LLM 기반 `replanNextPrompt(input, llm?)` — `lib/orchestration/llm-replanner.ts`. OPENAI_API_KEY 있을 때 GPT-4o로 다음 phase prompt 재작성, 없거나 throw·짧은 출력 시 `priorContext + basePrompt` deterministic fallback. `dispatchNextTask`가 이 함수를 호출하도록 와이어링.
- [x] **Phase 16.5 완료 (2026-05-28):** ACR `PlanTask.dependsOn?: string[]` + `dispatchNextTask`가 모든 의존 task가 `done`인 경우에만 후속 task 선택 (미충족 시 다음 후보로 skip).

**검증**: ACR `npx tsc --noEmit` 통과, `__tests__/auto-dispatcher.test.ts` 4/4 PASS, `projects-register.test.ts` 8/8 PASS.

---

## Phase 17 — CTO 결과 검증 게이트 (P1, ✅ 코드 완료 2026-05-28)

**목표:** ACR이 "exit 0"이라고 끝내도 CTO가 LLM으로 acceptance criteria 충족 여부 재평가.

- [x] `@l5/core` `cto-verification/verifier.ts`: `verifyCTOPhase()` + `verifyCTOPhaseDeterministic()`. exit_code, error 토큰, diff 유무 기반 결정론 평가. LLM(LLMClient) 주입 시 GPT-4o JSON verdict 사용.
- [x] L5 `taskCallback`에 verifier 호출: CTO 태스크 + `all_done`/`phase_complete` 시 실행. verdict='fail' → `needs_review` + `verifier:fail ... retry=true`, 'inconclusive' → `needs_review`.
- [x] Hermes `cto-verification-loop.ts`: `runCTOVerificationLoop`이 retry≤2 조건에서 `runCTOAgent` 재호출. `cto_retry=N` 카운터를 blocker에 인코딩.
- [x] launchd plist + gateway 진입점 등록 (10분 주기) — `com.l5.hermes.cto-verification-loop.plist`, `gateway.ts` TASK_RUNNERS, `runner.ts` `runCTOVerificationLoopLive`, `install-launchd.sh` PLISTS 갱신
- [x] plugin-orchestration에서 LLM client 주입 라인 추가 (OPENAI_API_KEY gated) — `plugin.ts` `taskCallback`에서 `process.env.OPENAI_API_KEY` 있을 때만 `buildLLMClient(task.title)` 전달, 없으면 deterministic-only

**검증**: `@l5/core` 184/184 PASS, `@l5/hermes-runtime` 24/24 PASS, L5 plugin typecheck 통과.

---

## Phase 18 — Clarification & Risk 재평가 (P2)

**목표:** ACR clarification UX를 CTO가 헤드리스로 처리.

- [x] **Phase 18 완료 (2026-05-28):** ACR `/api/l5-callback`에 `needs_clarification` status + `questions[]` + `acr_callback_url` payload 전달 (`app/api/l5-callback/route.ts`)
- [x] **Phase 18 완료 (2026-05-28):** L5 CTO가 `answerClarifications(input, llm?)`으로 답변 생성, D4-D5면 LLM 호출 없이 즉시 `needs_review` + `approval_required` escalate (`packages/l5-core/src/functions/cto-clarification/clarifier.ts`, plugin `taskCallback`). OPENAI_API_KEY gated.
- [x] **Phase 18 완료 (2026-05-28):** ACR risk 재평가 → L5 `risk_level` 동기화 (`taskCallback` status `risk_reassess` 처리, D3+면 `approval_required=true` 자동 승격).
- [x] **Phase 18 완료 (2026-05-28):** ACR `/api/clarify-reply` 신규 라우트 — L5가 답변 회신 시 `PlanTask.clarificationAnswers[]` 누적 (`app/api/clarify-reply/route.ts`). `L5_SHARED_SECRET` 헤더 검증.

**검증**: `@l5/core` 194/194 PASS (+10 clarifier), ACR clarify-reply 6/6 + 회귀 9/9 PASS, ACR tsc 0 errors.

---

## Phase 18.1 — ACR pre-dispatch trigger 와이어링 (P0, ✅ 완료 2026-05-29)

**목표:** auto-dispatcher가 `/api/runner` spawn 전에 clarification/risk 트리거를 자율적으로 발사.

- [x] `lib/types.ts` `PlanTask.clarifyingQuestions?: string[]` 추가
- [x] `app/api/workbench/dispatch/route.ts` `CTOPhase.clarifying_questions?: string[]` 플럼 → PlanTask
- [x] `lib/orchestration/pre-dispatch-checks.ts` 신규 — `checkPendingClarifications`, `reassessRisk`, `sendClarificationRequest`, `sendRiskReassessment`
- [x] `lib/orchestration/auto-dispatcher.ts` `dispatchNextTask` pre-flight: clarification pending → skip + needs_clarification, risk escalated D3+ → skip + risk_reassess
- [x] `__tests__/pre-dispatch-checks.test.ts` 3/3 PASS, 회귀 auto-dispatcher 4 + clarify-reply 6 PASS, tsc 0 errors
- [x] 라이브 smoke: curl dispatch w/ clarifying_questions → PlanTask 디스크 persist + runner 미호출 확인

**잔여:** ACR 환경변수 `L5_BASE_URL=http://localhost:13000` 설정 후 NocoBase taskCallback 도달 확인.
