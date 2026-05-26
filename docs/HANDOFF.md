# HANDOFF — L5 Business OS

최종 업데이트: 2026-05-26 (MVP Phase 1-5 완성)

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

## Current Technical State — MVP Phase 1-5 완성

검증된 것:

- ✅ `packages/l5-core` orchestration 완성 (98/98 unit tests PASS)
- ✅ `@l5/core` typecheck 통과 (0 errors)
- ✅ `@l5/core` unit tests 통과: 11 suites / 98 tests (Phase 0-2 + orchestration)
- ✅ NocoBase plugin 2개 완성: plugin-orchestration, plugin-executive-monitor
- ✅ Hermes integration 완성: approval-queue, stalled-task-detector, daily-brief
- ✅ PostgreSQL 4개 테이블 생성: founder_instructions, ceo_interpretations, agent_tasks, agent_handoffs
- ✅ NocoBase 서버 실행 확인: `http://localhost:13000`
- ✅ 전체 orchestration flow: instruction → CEO interpretation → task decomposition → agent assignment → execution → handoff → monitor → approval
- ✅ 로컬 NocoBase 마이그레이션 실행 완료

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

**Phase 3: Executive Agent Runtime (Complete)**
- executeAgentTask() framework + 7개 handler stubs
- AGENT_PROTOCOL.md standard output format 전체 구현
- AgentHandoff 자동 생성

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

## Next Development Goal

MVP Phase 1-5 완성 후 다음 iteration 목표:

1. **Real LLM Integration**: CEO orchestrator에 실제 Claude/Mastra API 연결 (현재는 stub)
2. **Executive Agent Logic**: 각 handler (CMO/CRO/CPO/CTO/COO/CFO/RiskQA)에 실제 작업 로직 추가
3. **BPR Phase Manager**: BPR phase 상태 관리 및 transition rules
4. **Memory & Learning Loop**: 완료된 task → Memory 저장 및 BPR 업데이트
5. **Tool Request Workflow**: 반복되는 task → Tool request 자동 생성
6. **Advanced Monitoring**: Workstream/phase별 모니터링, 성과 분석

## How to Continue

**로컬 테스트:**
```bash
cd /Users/wonminyang/Desktop/pulk
pnpm start  # NocoBase 서버 실행 (port 13000)

# 플러그인 로드 확인 후 다음 테스트
curl -X POST http://localhost:13000/api/founder_instructions:create \
  -H "Content-Type: application/json" \
  -d '{"raw_text":"Test instruction","source":"chat"}'
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
  phase: 'direction_alignment' | 'market_pmf_diagnosis' | 'offer_workflow_redesign' | 'execution_system_build' | 'monitoring_optimization';
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
