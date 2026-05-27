# HANDOFF — L5 Business OS

최종 업데이트: 2026-05-28 (Phase 9 Founder UI 완성 + CEO 채팅 승인 플로우 구현)

---

## Current State

**Phase 0-9 구현 완료 (단, 실제 Agent 실행은 미구현)**

- `@l5/core`: 19 suites / 174 tests PASS
- `@l5/hermes-runtime`: 2 suites / 13 tests PASS
- NocoBase 서버: `http://localhost:13001` (port 13001, `yarn dev`로 실행)
- Founder UI: `http://localhost:3000` (Next.js, `npm run dev`로 실행)
- LLM: OpenAI GPT-4o 연결 (`OPENAI_API_KEY` → `apps/nocobase-app/.env`)
- DB: 로컬 PostgreSQL (`nocobase` DB, user: `wonminyang`)

### ⚠️ 중요: 현재 구현 범위

**구현됨 (DB 저장/상태 전환까지):**
- Founder → CEO 채팅 → `proposed` 태스크 생성
- Founder 승인 클릭 → `queued` 상태로 전환
- Founder 거절 클릭 → `killed` 상태로 전환
- D3-D5 태스크 → `approval_required=true` 플래그 자동 설정
- BPR Phase 표시 + 다음 Phase 전환 요청 (D5 승인 대기 태스크 생성)

**미구현 (다음 단계):**
- 실제 Executive Agent 실행 — `queued` 태스크를 Mastra 런타임이 픽업해서 수행
- Trigger.dev Hermes cron 실제 연동 (daily-brief, stalled-task)
- Memory → CEO 컨텍스트 재주입 (founder_memory 조회 후 해석 컨텍스트 활용)

**한 줄 요약:** 태스크는 DB에 쌓이고 상태는 바뀌지만, 에이전트가 실제로 일을 하지는 않는다.

---

## What Works

### Backend API (NocoBase @ localhost:13001)
| 엔드포인트 | 역할 |
|---|---|
| `POST /api/auth:signIn` | JWT 인증 |
| `POST /api/chat:submitInstruction` | CEO 채팅 → GPT 해석 → AgentTask[] **proposed** 상태로 생성 |
| `POST /api/chat:approvePlan` | instruction_id 기준 proposed → **queued** 일괄 전환 |
| `POST /api/chat:rejectPlan` | instruction_id 기준 proposed → **killed** 일괄 전환 |
| `POST /api/chat:generateWorkflow` | 아이디어 → Brief + PMF Plan + Staffing |
| `GET /api/bpr:currentPhase` | 현재 BPR Phase + 다음 Phase 정보 |
| `POST /api/bpr:requestTransition` | Phase 전환 요청 → D5 승인 태스크 생성 |
| `GET /api/monitor:currentTasks` | 활성 task 목록 (queued/running/blocked/needs_review) |
| `GET /api/monitor:blockedTasks` | blocked task 목록 |
| `GET /api/monitor:approvalQueue` | 승인 대기 목록 (approval_required=true) |
| `POST /api/monitor:approveTask` | task 승인 (status → done) |
| `POST /api/monitor:rejectTask` | task 거절 (status → killed) |
| `GET /api/monitor:memoryCandidates` | 메모리 후보 목록 |
| `POST /api/monitor:saveMemory` | 메모리 저장 |
| `POST /api/monitor:discardMemory` | 메모리 폐기 |

### @l5/core 도메인 로직
- CEO 오케스트레이터 (interpret → decompose → assign → summarize)
- 8개 Executive Handler (ChiefOfStaff, CMO, CRO, CPO, CTO, COO, CFO, RiskQA)
- D3 24h 자동승인 / D4 수동 / D5 더블게이트 (RiskQA → Founder)
- Memory 수집/리뷰/저장 (collector, reviewer, founder_memory 테이블)
- BPR Phase Manager (6단계 state machine, 순수 함수)
- Workflow Factory (아이디어 → Brief/PMF/Staffing, 규칙 기반)
- Hermes 스케줄 태스크 (daily-brief 09:00, memory-review 금 17:00, stalled-task 1h)
- OpenAI GPT-4o 클라이언트 (`createOpenAIClient`, API Key 없으면 stub fallback)

---

## What Does Not Work

- **NocoBase 브라우저 UI** — `http://localhost:13001` 접속 시 "App warning: paths[1] null" 에러. 원인: 플러그인 client entry 빌드 실패. **→ 별도 UI 앱으로 해결 예정**
- **Trigger.dev 실제 연동** — Hermes 스케줄은 상수/함수만 구현. 실제 cron 실행 안됨
- **Mastra agent-runtime** — placeholder 상태
- **Memory → CEO 컨텍스트 주입** — `founder_memory` 저장은 되나 CEO가 조회하지 않음 (P2)

---

## QA 검증 결과 (2026-05-27)

| 항목 | 결과 |
|---|---|
| `@l5/core` 유닛 테스트 | ✅ 19 suites / 174 tests PASS |
| NocoBase e2e auth setup | ✅ 1 passed (Playwright API 인증) |
| `corepack pnpm -r build` | ✅ 전체 빌드 통과 |
| plugin-orchestration core 경로 | ✅ `packages/l5-core/dist/` 직접 참조 |
| plugin-executive-monitor src/server | ✅ NocoBase build 구조 충족 |

**e2e 재실행 시 주의:** `apps/nocobase-app/storage/db/nocobase-e2e.sqlite` 파일이 이전 실행으로 잠겨 있으면 삭제 후 재실행.

---

## Phase 9 Founder UI 완료 (2026-05-28)

**앱 위치:** `apps/founder-ui/` (Next.js 14 App Router, port 3000)

**실행:**
```bash
cd apps/founder-ui && npm run dev   # → http://localhost:3000
```

**구현된 페이지:**

| 경로 | 기능 | 핵심 동작 |
|---|---|---|
| `/chat` | CEO Agent 채팅 + 태스크 승인 | 지시 → proposed 태스크 생성 → 인라인 승인/거절 → queued/killed |
| `/monitor` | Executive Monitor (30초 자동갱신) | BPR Phase 진행바 + 전환 요청, 태스크 필터(전체/진행중/차단/승인필요) |
| `/approval` | 승인 대기 큐 + approve/reject | D3-D5 approval_required 태스크 처리 |
| `/workflow` | Workflow Factory | 아이디어 → Brief + PMF Plan + Staffing |
| `/memory` | Memory Review + save/discard | founder_memory 후보 검토 |

**채팅 플로우 (2026-05-28 개편):**
1. Founder가 지시 입력 → `submitInstruction` → CEO 해석 + `proposed` 태스크 생성
2. 채팅창에 `ProposedTasksPanel` 인라인 표시 (에이전트별 색상, Risk 배지, 성공 기준)
3. "승인" 클릭 → `approvePlan` → `proposed` → `queued` 일괄 전환
4. "거절" 클릭 → `rejectPlan` → `proposed` → `killed` 일괄 전환
5. D3-D5 태스크는 queued 전환 후에도 `approval_required=true` 유지 → 승인 큐로 진입

**공통 인프라:**
- `src/lib/api.ts` — unwrap() 헬퍼 포함, 모든 NocoBase 이중 래핑 처리
- `src/lib/auth-context.tsx` — JWT 토큰 Context (localStorage 영속)
- `src/components/AuthGate.tsx` — 미인증 시 로그인 폼 자동 표시
- TypeScript 에러 0개 (`npm run typecheck` 통과)

## 다음 세션에서 할 일

**우선순위 순서:**

1. **Agent 실행 연결 (필수)** — `queued` 태스크를 agent-runtime이 픽업 → `executeAgentTask()` 실행 → status 업데이트
2. **Phase 10 P0: CTO → Agent Control Room 브리지** — CTO 태스크를 ACR에 전달, Claude/Codex/Antigravity 자동 라우팅
   - ACR 위치: `~/Desktop/양원민 개발자/agent_control_room_docs/` (별도 Next.js 앱)
   - 구현 위치: `services/agent-runtime/src/agents/cto.ts`
   - 참고 문서: `~/Downloads/agent_control_room_fast_track_prd_auto_runtime_selection.md`
3. **Phase 10 P1: Founder UI Control Room 패널** — CLI 세션 목록, Release Gate 승인, 출력 미리보기
4. **Memory → CEO 컨텍스트 주입** — `founder_memory` 조회 → CEO 해석 컨텍스트 (P2)
5. **Trigger.dev 실제 연동** — Hermes daily-brief, stalled-task cron 실행

---

## How to Continue

### 서버 실행
```bash
cd /Users/wonminyang/Desktop/pulk/apps/nocobase-app
yarn dev   # → http://localhost:13001
```

### 인증 토큰 발급
```bash
TOKEN=$(curl -s -X POST http://localhost:13001/api/auth:signIn \
  -H "Content-Type: application/json" \
  -d '{"account":"admin@nocobase.com","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
```

### CEO 채팅 테스트
```bash
curl -X POST http://localhost:13001/api/chat:submitInstruction \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"raw_text":"PMF 메시지 실험 계획해줘","source":"chat"}'
```

### 테스트 실행
```bash
corepack pnpm --filter @l5/core test -- --runInBand
corepack pnpm --filter @l5/hermes-runtime test
```

---

## Next 3 Actions

1. **별도 Founder UI 앱 구축** — Next.js 또는 HTML로 CEO 채팅 + Executive Monitor + Approval Queue + Workflow Factory. `localhost:13001` API 호출
2. **Memory → CEO 컨텍스트 주입** — `founder_memory` 테이블 조회 → `interpretFounderInstruction()` 컨텍스트 주입 (P2)
3. **Trigger.dev 실제 연동** — Hermes daily-brief, stalled-task 실제 cron 실행

---

## Open Questions

- Founder UI: Next.js vs 단순 HTML 선택 미결정
- Trigger.dev 연동 시점 미결정
- NocoBase "paths[1] null" 에러의 정확한 원인 미확인 (별도 UI로 우선순위 낮음)

---

**Session Summary:**
1. Codex hardening pass (protocol.ts, handlers, migration hardened)
2. Documentation synchronization (AGENT_PROTOCOL, FOUNDER_BRIEF_SPEC updated)
3. Antigravity UI regression QA (Executive Monitor UI verified + fixes)
4. Implementation status matrix created (12 implemented, 3 partial, 4 documented-only)
5. Next phase planning (Brief auto-gen, Approval routing, Memory persistence)
6. Phase 6c: Memory Entry Persistence 구현 완료 — collector, reviewer, hermes task, DB migration, 21 new tests

## Current Product Direction

L5 Business OS의 Founder-facing UX는 NocoBase admin UI가 아니다.

Founder는 CEO Agent와 채팅으로 비즈니스 방향성, BPR phase, 승인 결정을 다룬다. CEO Agent는 지시를 해석해 CMO/CRO/CPO/CTO/COO/CFO/RiskQA Agent에게 병렬 task를 배정한다. Founder는 Executive Monitor에서 각 Agent가 무엇을, 왜, 어떤 원본 지시 때문에 수행 중인지 확인하고, Approval Queue에서 필요한 승인만 처리한다.

NocoBase는 다음 역할로 제한한다.

- Agent-readable/writable internal shell
- source-of-truth records over PostgreSQL
- task, handoff, approval, memory, BPR audit log
- internal monitor backend (Executive Monitor + Approval Queue)
- quick admin/debug view

NocoBase page UI를 Founder의 최종 제품 경험으로 고도화하지 않는다.

## Current Technical State — MVP Phase 1-5 완성 + 검증

**구현 검증 (May 27, 2026 - Hardening Pass):**

- ✅ `packages/l5-core` orchestration 완성 — 110 tests across 13 suites, all PASS
- ✅ `@l5/core` typecheck 통과 (0 errors)
- ✅ `@l5/core` unit tests: 13 suites / 110 tests (Phase 0-5 complete)
- ✅ Executive Agent Handlers 구현 완료:
  - CMO: PMF message experiment draft (D3 risk, approval_required)
  - CRO: Sales workflow draft (D4 risk for customer-facing)
  - CPO: Productization readiness check (D2)
  - CTO: Tool request review + PMF gate enforcement (D2-D4)
  - COO: Delivery workflow (D2)
  - CFO: Financial commitment (D5)
  - RiskQA: Risk validation + PII check + blocking authority (D2-D5)
- ✅ AgentOutput protocol 구현: flat interface, 14 required fields
- ✅ Handler validation: missing field detection built in
- ✅ PostgreSQL orchestration schema:
  - 4 tables: founder_instructions, ceo_interpretations, agent_tasks, agent_handoffs
  - 11 indexes + foreign keys
  - RLS policies: l5_agent (full access), l5_founder (read-only)
- ✅ NocoBase plugins: plugin-orchestration (8 endpoints), plugin-executive-monitor (3 endpoints)
- ✅ Orchestration flow verified:
  - Chat submit → FounderInstruction saved → CEOInterpretation → AgentTask[] → Monitor/Approval Queue
  - executeAgentTask() routes to handler, validates output, builds handoff
- ✅ Smoke tests passing: authenticated chat, task creation, monitor query, approval queue
- ✅ Migration idempotent: fresh DB + existing DB both pass

## Latest Regression QA — Antigravity Founder UI Pass

**검증 시점:** 2026-05-27 14:52 KST  
**목적:** Antigravity가 업데이트한 Founder-facing UI가 runtime, schema, approval safety, memory safety를 깨지 않았는지 최종 회귀 확인.

**검증 범위:**

- Executive Monitor Phase View
- Approval Queue readability
- Founder Brief preview
- Memory Candidate Review surface
- `protocol.ts`, `executeAgentTask()`, Executive runtime tests, authenticated NocoBase smoke flow와의 호환성

**발견 및 수정:**

- Monitor/Founder Brief UI가 `/api/monitor/currentTasks`를 호출하고 있었으나, 실제 NocoBase action route는 `/api/monitor:currentTasks`였다. UI fetch 경로를 수정했다.
- `plugin-executive-monitor` server 응답이 UI가 렌더링해야 하는 `risk_level`, `phase`, `source_ref`를 누락하고 있었다. `currentTasks`, `blockedTasks`, `approvalQueue` 응답에 세 필드를 추가했다.
- Approval Queue parsing에서 `any`가 stale field name을 가릴 수 있어 `unknown` 기반 guard로 좁혔다.
- Memory Candidate Review는 승인 대기 항목만 보여야 하므로 `approval_status === 'pending'` 후보만 표시하도록 제한했다.
- Approval Queue와 Memory Review의 action 버튼은 여전히 read-only alert만 수행한다. 실제 승인/저장 실행은 backend gate 구현 전까지 연결하지 않는다.

**검증 명령 결과:**

```bash
corepack pnpm --filter @l5/core typecheck
# PASS

corepack pnpm -r typecheck
# PASS

corepack pnpm --filter @l5/core test -- --runInBand
# PASS: 13 suites / 110 tests

corepack pnpm exec tsc -p apps/nocobase/packages/plugins/@l5/plugin-executive-monitor/tsconfig.json --noEmit
# PASS

corepack pnpm exec tsc -p apps/nocobase/packages/plugins/@l5/plugin-orchestration/tsconfig.json --noEmit
# PASS
```

**조건부/환경 이슈:**

- `corepack pnpm smoke:nocobase-auth`는 `localhost:13000`에 NocoBase 서버가 떠 있지 않아 `fetch failed`로 중단됐다. `curl`로도 port 13000 연결 실패를 확인했다. 제품 로직 실패가 아니라 로컬 런타임 미기동 상태다.
- `corepack pnpm -r --if-present lint`는 `@l5/core`에 ESLint config가 없어 실패했다. 현재 UI 회귀와 무관한 tooling gap이다.
- `docker compose ps`는 현재 환경에 `docker` 명령이 없어 실행 불가했다.

**현재 verdict:** Conditional Pass. Core/runtime/type contracts는 통과했고, UI contract mismatch는 수정 완료. Authenticated NocoBase smoke는 서버 기동 후 재실행 필요.

## Implementation Source Of Truth

**Fully Implemented:**
- `packages/l5-core/src/functions/executive-runtime/` — protocol.ts + 7 handlers (CMO, CRO, CPO, CTO, COO, CFO, RiskQA)
- `packages/l5-core/src/functions/ceo-orchestration/` — CEO agent orchestrator (interpret, decompose, assign, summarize)
- `/api/chat:submitInstruction` — endpoint that executes full flow: FounderInstruction → CEOInterpretation → AgentTask[] (with status tracking)
- `apps/nocobase/migrations/20260526000000_create_orchestration_tables.sql` — hardened migration (idempotent, fresh+existing DB safe)
- Orchestration API endpoints (8 in plugin-orchestration, 3 in plugin-executive-monitor)
- RLS policies: `l5_agent` (full access), `l5_founder` (read-only)

**Partially Implemented / Placeholder:**
- `services/agent-runtime/` — Mastra integration placeholder (not yet connected to CEO orchestrator)
- `services/hermes-runtime/src/loops/*` — Trigger.dev Hermes placeholder (structure exists, not yet live)
- Brief generation (Founder Brief templates documented, auto-generation in Chief of Staff not yet wired)
- Memory entry workflow (insight_to_record field exists, approval/persist flow not yet implemented)

**Not Yet Implemented:**
- Chief of Staff brief auto-generation (Hermes integration)
- Real Claude/Mastra LLM calls in CEO orchestrator
- PMF scoring integration (policy documented, not enforced)
- Tool request workflow
- BPR phase transition enforcement

## What Was Recently Fixed & Completed

**Phase 1: Orchestration Schema & API (Complete)**
- FounderInstruction, CEOInterpretation, AgentTask, AgentHandoff 4개 타입 정의
- plugin-orchestration: 8개 API endpoints (CRUD + query)
- PostgreSQL 4개 테이블 + 5개 인덱스 + RLS policies

**Phase 2: CEO Agent Orchestrator (Complete)**
- interpretFounderInstruction(): LLM call + AGENT_PROTOCOL format
- decomposeIntoWorkstreams(): domain-based workstream routing
- assignExecutiveTasks(): CMO/CRO/CPO/CTO/COO/CFO/RiskQA 자동 할당
- summarizeAgentStatus(): 회사 상태 합성 + Founder brief 생성

**Phase 3: Executive Agent Runtime (Complete + Implemented)**
- executeAgentTask() framework + 7개 handler 구현 (stubs가 아님)
- AgentOutput protocol 구현 (14 required fields, flat structure)
- Handler validation: validateOutput() detects missing required fields
- All handlers return HandlerResult with:
  - status: completed | needs_review | blocked
  - created_tasks: agent task candidates
  - output: AgentOutput
  - handoff: AgentHandoff (auto-generated via buildHandoff())
  - approval_required, blocked, risk_level
- AgentHandoff 자동 생성 (buildHandoff() utility)

**Phase 4: Executive Monitor (Complete)**
- plugin-executive-monitor: read-only UI + 3개 API endpoints
- Agent별 current task, source instruction, status, blocker 표시
- blocked/approval-required 필터 및 자동갱신

**Phase 5: Approval Queue & Hermes (Complete)**
- Approval Queue: approval_required task 조회/승인/거절
- stalled-task-detector: 1시간마다 blocked/overdue task 감시
- approval-checker: 매일 09:00 daily brief 생성
- Trigger.dev 스케줄 설정

## Complete Orchestration Flow (MVP Ready)

```text
Founder Chat Instruction
  ↓ (FounderInstruction saved)
CEO Agent Interpretation
  ├─ interpretFounderInstruction() → CEOInterpretation
  ├─ decomposeIntoWorkstreams() → workstreams
  └─ assignExecutiveTasks() → AgentTask[] (CMO/CRO/CPO/CTO/COO/CFO/RiskQA)
  ↓ (AgentTask saved)
Executive Agent Runtime
  └─ executeAgentTask(task) → AgentOutput + AgentHandoff
  ↓ (AgentHandoff saved)
Executive Monitor
  ├─ currentTasks (활성 task 조회)
  ├─ blockedTasks (차단된 task)
  └─ approvalQueue (승인필요 task)
  ↓
Founder Approval
  ├─ approve → task.status = done
  └─ reject → task.status = killed
  
Hermes Monitoring (24/7)
├─ stalled-task-detector (매 1시간)
├─ approval-checker (매일 09:00)
└─ daily-brief-generator
```

## Documentation Completed — Agent Control Tower Specs (Phase 6 Foundation)

**새로운 문서 3개 생성됨:**

1. **AGENT_PROTOCOL.md (업그레이드)**
   - Phase-based orchestration (6단계 BPR) 명확화
   - 모든 Executive Agent (CEO, ChiefOfStaff, CMO, CRO, CPO, CTO, COO, CFO, RiskQA, Culture)의 표준 output contract JSON 정의
   - Agent별 구체적인 역할, 입력, 출력, 승인 규칙 명시
   - Agent Trigger Rules 업데이트

2. **FOUNDER_BRIEF_SPEC.md (신규)**
   - Founder-facing brief 6종류 정의:
     * Daily Brief (매일 09:00)
     * Decision Brief (승인 필요 항목)
     * Approval Request (D4/D5 승인)
     * Blocked Task Alert (1시간마다 감시)
     * Phase Transition Summary (단계 변경 시)
     * Memory Candidate Review (주 1회)
     * Weekly Summary (매주 금요일)
   - 각 brief의 template, 예시, 타이밍, Founder 소비 시간 포함
   - Golden Rule: Founder가 15분 내에 결정 가능해야 함

3. **SECURITY_DATA_GOVERNANCE.md (업그레이드)**
   - D1-D5 레벨별 상세 규칙 (각 level의 definition, examples, approval, action)
   - Phase-based approval gate matrix
   - Agent별 승인 권한 명시
   - External action safety checklist (10단계)
   - PMF-Gate Rules: tool build, productization은 PMF 신호 없으면 차단
   - Memory Entry 승인 workflow
   - RiskQA override authority (unsafe D3-D5 block 권한)

## Session 1 (May 27) — Codex Hardening + Docs Sync Complete ✅

**Completed:**

1. ✅ **Codex Hardening Pass**
   - protocol.ts: AgentOutput flat interface finalized (14 fields)
   - All 7 handlers: Actual implementation (not stubs)
   - Migration: Idempotent, both fresh and existing DB pass
   - Tests: 110/110 passing (13 suites)
   - Smoke: authenticated chat + monitor + approval queue working

2. ✅ **Documentation Synchronization**
   - AGENT_PROTOCOL.md: Updated with actual AgentOutput structure
   - FOUNDER_BRIEF_SPEC.md: Memory section corrected (insight_to_record)
   - HANDOFF.md: Test count, handler status, current state accurate
   - TASKS.md: Phase 3-6 accurate, Phase 6a-c detailed plan added
   - IMPLEMENTATION_STATUS.md: Created (12 impl + 3 partial + 4 documented-only + 3 planned)

3. ✅ **Antigravity UI Regression QA**
   - Executive Monitor: Phase/Risk/Approval filtering ✅
   - Founder Brief Preview: Task aggregation ✅
   - Approval Queue: Action buttons (read-only for now) ✅
   - Memory Review: Pending items display ✅
   - API route fixes: /api/monitor:currentTasks correction
   - Response payload fixes: risk_level, phase, source_ref added
   - Type safety: `any` → `unknown` guard improvements

4. ✅ **Key Mismatches Corrected**
   - Handler status: "stubs" → "fully implemented"
   - Test count: 98 → 110 tests
   - AgentOutput: nested JSON → flat TypeScript interface
   - Memory: struct approval → insight_to_record string + template
   - Brief gen: "complete" → "templates done, wiring incomplete"

---

## Next Development Goal (Phase 6+)

**3-4 Days to Beta Ready**

### Phase 6a: Chief of Staff Brief Auto-Generation (Priority 1)
**Why:** Founder needs daily visibility into parallel work  
**Work:**
- [ ] Chief of Staff handler: Aggregate currentTasks → Daily Brief format
- [ ] Hermes Trigger.dev: Schedule brief generation at 09:00 daily
- [ ] Brief delivery: Format per FOUNDER_BRIEF_SPEC.md (markdown → NocoBase/Slack)
- [ ] Tests: Verify brief includes moved/blocked/approval-queue items

**Success Criteria:**
- ✅ Daily Brief auto-generates at 09:00
- ✅ Includes: moved tasks (completed), blocked (>1h), approval queue, recommendations
- ✅ Founder can read brief in < 3 min

**Unblocks:** Approval queue auto-population, Founder monitoring loop

### Phase 6b: Approval Queue Auto-Routing (Priority 1)
**Why:** Risk gates currently manual → automate to prevent silent risk  
**Work:**
- [ ] Task submission: Detect risk_level in executeAgentTask()
- [ ] D3 routing: Add to approval queue, flag for 24h auto-approve
- [ ] D4 routing: Add to approval queue, require manual Founder approval
- [ ] D5 routing: RiskQA review first, only show to Founder if safe
- [ ] Hermes: D3 auto-approve after 24h if not rejected
- [ ] Tests: Verify no D3-D5 task executes without approval

**Success Criteria:**
- ✅ All D3-D5 tasks route to Approval Queue
- ✅ D3 auto-approves in 24h (unless Founder rejects)
- ✅ D4 requires manual Founder approval (blocking)
- ✅ D5 blocked by RiskQA until safe + Founder approves

**Unblocks:** Safe external action flow, compliance gates

### Phase 6c: Memory Entry Persistence (Priority 2)
**Why:** Insights captured in insight_to_record, but not saved → learning loop broken  
**Work:**
- [ ] Collection: Gather insight_to_record from all agent outputs
- [ ] Weekly review: Chief of Staff creates Memory Review brief (Fri)
- [ ] Founder approval: Read-only review + SAVE/DISCARD decision
- [ ] Persistence: Founder SAVE → insert to founder_memory table
- [ ] Retrieval: CEO orchestrator can query memory for context in future phases
- [ ] Tests: Verify memory persists across sessions

**Success Criteria:**
- ✅ Weekly memory review brief auto-generated
- ✅ Founder can SAVE/DISCARD insights
- ✅ Saved insights stored in founder_memory
- ✅ CEO can query memory for context

**Unblocks:** Company learning loop, long-term decision context

---

## Phase 7 — Future Work (After Phase 6)

### 7a: Real Claude API Integration
- Replace stub LLMClient with Anthropic SDK
- CEO orchestrator makes real Claude calls for interpretation
- Structured output parsing for CEOInterpretation

### 7b: BPR Phase Manager
- Track current_phase, progress_%, success_criteria
- Gate phase transitions on success criteria
- Phase-specific approval rigor

### 7c: PMF Scoring Integration
- Implement PMF score calculation in l5-core (Phase 8 docs)
- Enforce PMF gate in CTO/CPO handlers
- Block premature tool build/productization

### 7d: Tool Request Workflow
- Detect repeated tasks (repetition signal)
- Auto-generate tool request form
- Gate on PMF score + manual validation

---

## How to Continue (Next Session)

**Immediate:**
```bash
# Verify current state
corepack pnpm validate
corepack pnpm --filter @l5/core test -- --runInBand
corepack pnpm -r typecheck

# Review docs
cat docs/IMPLEMENTATION_STATUS.md  # Status matrix
cat docs/AGENT_PROTOCOL.md         # Actual AgentOutput structure
cat docs/FOUNDER_BRIEF_SPEC.md     # Brief templates
```

**Phase 6a Start:**
1. Implement Chief of Staff handler in `packages/l5-core/src/functions/executive-runtime/handlers/chief-of-staff-handler.ts`
2. Wire Hermes trigger at `/services/hermes-runtime/src/tasks/daily-brief-generator.ts`
3. Test: Brief aggregates currentTasks + blockedTasks + approvalQueue

**Phase 6b Start:**
1. Update executeAgentTask() to route D3-D5 to approval queue
2. Implement Hermes D3 auto-approve in approval-checker
3. Test: All D3-D5 tasks blocked until approval

**Key Files to Watch:**
- `packages/l5-core/src/functions/executive-runtime/` — handler implementations
- `apps/nocobase/migrations/20260526000000_create_orchestration_tables.sql` — schema
- `scripts/smoke-nocobase-authenticated.ts` — end-to-end test
- `docs/IMPLEMENTATION_STATUS.md` — status tracker

## How to Continue

**로컬 테스트:**
```bash
cd /Users/wonminyang/Desktop/pulk
corepack pnpm validate
corepack pnpm demo

cd apps/nocobase-app
yarn start  # NocoBase 서버 실행 (port 13000)

# 플러그인 로드 확인 후 다음 테스트
curl -X POST http://localhost:13000/api/founder_instructions:create \
  -H "Content-Type: application/json" \
  -d '{"raw_text":"Test instruction","source":"chat"}'

curl -X POST http://localhost:13000/api/chat:submitInstruction \
  -H "Content-Type: application/json" \
  -d '{"raw_text":"Create a PMF message experiment and customer outreach proposal","intent":"CEO chat smoke"}'

curl http://localhost:13000/api/monitor:currentTasks
curl http://localhost:13000/api/monitor:blockedTasks
curl http://localhost:13000/api/monitor:approvalQueue
```

**코드 위치:**
- Core orchestration: `/packages/l5-core/src/functions/ceo-orchestration/`
- Executive runtime: `/packages/l5-core/src/functions/executive-runtime/`
- NocoBase plugins: `/apps/nocobase/packages/plugins/@l5/plugin-orchestration/` 및 `/plugin-executive-monitor/`
- Hermes integration: `/services/hermes-runtime/src/`

## Data Contracts To Add

### FounderInstruction

```ts
type FounderInstruction = {
  id: string;
  raw_text: string;
  source: 'chat' | 'manual' | 'import';
  intent?: string;
  constraints?: string[];
  requested_phase?: string;
  status: 'new' | 'interpreted' | 'in_progress' | 'closed';
  created_at: string;
};
```

### CEOInterpretation

```ts
type CEOInterpretation = {
  id: string;
  instruction_id: string;
  goal: string;
  assumptions: string[];
  phase: 'direction_alignment' | 'pmf_diagnosis' | 'execution_build' | 'sales_distribution_test' | 'productization_review' | 'scale_automation';
  success_criteria: string[];
  risk_level: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
  approval_required: boolean;
  created_at: string;
};
```

### AgentTask

```ts
type AgentTask = {
  id: string;
  instruction_id: string;
  interpretation_id?: string;
  assigned_agent: 'CEO' | 'ChiefOfStaff' | 'CMO' | 'CRO' | 'CPO' | 'CTO' | 'COO' | 'CFO' | 'RiskQA' | 'Culture';
  title: string;
  rationale: string;
  expected_output: string;
  status: 'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed';
  approval_required: boolean;
  risk_level?: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
  phase?: 'direction_alignment' | 'pmf_diagnosis' | 'execution_build' | 'sales_distribution_test' | 'productization_review' | 'scale_automation';
  source_ref?: string;
  blocker?: string;
  due_at?: string;
  created_at: string;
  updated_at: string;
};
```

### AgentHandoff

```ts
type AgentHandoff = {
  id: string;
  task_id: string;
  from_agent: string;
  to_agent?: string;
  context: string;
  next_action: string;
  blocker?: string;
  approval_required: boolean;
  created_at: string;
};
```

## Non-Goals For The Next Iteration

- Do not polish NocoBase pages as the main product UI.
- Do not build complex dashboards before task/handoff contracts are stable.
- Do not add external autonomous execution before approval gates are enforced.
- Do not create tools before PMF/repetition signals exist.

## Recommended Implementation Order

1. Data model and API contracts.
2. CEO Agent orchestration over those contracts.
3. Minimal monitor view.
4. Approval queue.
5. Hermes stalled-task/approval checks.
6. BPR and Memory updates from completed tasks.
