# DECISIONS — L5 Business OS

## 2026-05-26 — Use NocoBase as MVP Shell

### Decision

Use NocoBase Community Edition as the MVP internal operating shell.

### Reason

NocoBase can quickly provide collections, CRUD, permissions, admin pages, dashboard blocks, and plugin extension points.

### Impact

The MVP can move faster, but NocoBase must not contain core Business OS logic.

## 2026-05-26 — Keep L5 Core Independent

### Decision

Put Founder DNA scoring, PMF scoring, Workflow Factory rules, BPR rules, Tool Request rules, Memory rules, and Decision Authority inside `packages/l5-core`.

### Reason

If NocoBase becomes limiting or expensive later, the shell can be replaced without rewriting the OS brain.

### Impact

Every L5 plugin should call `l5-core` instead of duplicating logic.

## 2026-05-26 — Use Mastra for Agent Runtime

### Decision

Use Mastra as a separate TypeScript agent runtime.

### Reason

CEO Agent and Chief of Staff Agent require multi-step reasoning, tool calls, and structured output. This should not live inside NocoBase UI.

### Impact

NocoBase plugins call agent runtime APIs.

## 2026-05-26 — Use Trigger.dev for Hermes Runtime

### Decision

Use Trigger.dev for long-running, scheduled, retryable, and approval-pause Hermes tasks.

### Reason

Hermes is a state watcher and trigger engine, not a simple notification bot.

### Impact

No scattered cron jobs inside plugin request handlers.

## 2026-05-26 — Separate Business Insights from Customer PII

### Decision

Customer-identifiable records and reusable anonymized insights must be separate entities.

### Reason

Business OS needs reusable learning, but customer data must remain purpose-bound and access-controlled.

### Impact

MemoryEntry, BusinessInsight, CustomerProfile, and CustomerConsent must include PII and usage fields.

## 2026-05-26 — PMF Before Tool

### Decision

Every business idea must pass through PMF experiment planning before tool production.

### Reason

The product philosophy is No Demand, No Tool.

### Impact

ToolRequest should be blocked or marked premature unless PMF/repetition criteria are met.

## 2026-05-29 — ACR is the CTO's End-to-End Responsibility

### Decision

Agent Control Room(ACR) 운영·실행은 전적으로 CTO Agent의 책임이다. Founder와 기획 단계(CEO·ChiefOfStaff·Founder 대화)에서 합의된 개발 항목은 모두 CTO에게 자동 위임되어 ACR을 통해 실행된다.

### Reason

- CTO Agent가 phase 설계(LLM 1회) + 런타임 지정 + 결과 검증 + 재시도까지 완결적으로 수행하도록 Phase 10-18에 걸쳐 와이어링됨
- Founder는 방향성·승인만 담당. ACR 내부 동작(런타임 선택, prompt 패킷, 의존성, 검증)을 직접 만지지 않음
- 기획 단에서 합의된 작업은 별도 사람 게이트 없이 CTO → ACR로 직행 (단, D3+는 approval queue 게이트 유지)

### Impact

- 새로운 개발 요구사항이 채팅에서 합의되면 CEO/ChiefOfStaff가 자동으로 CTO 태스크로 변환
- CTO Agent가 ACR `/api/workbench/dispatch`로 phase[] 전달 → auto-dispatcher가 무인 실행
- ACR 측 게이트(clarification, risk reassess, verifier)는 모두 L5 CTO 헤드리스 응답으로 처리
- Founder UI는 진행 모니터링과 D3+ 승인만 노출. ACR 직접 조작 UI는 만들지 않음

## 2026-05-29 — Out-of-Scope External Integrations

### Decision

다음 외부 서비스 통합은 MVP 범위에서 영구 제외한다.

- **OMC / OMX** — 사용자 명시 제외 (2026-05-29)
- **Formbricks (PMF Score 실제 계산)** — 사용자 명시 제외 (2026-05-29)

### Reason

- 외부 서비스 계정·API 키·운영 부담이 OS 핵심 가치(L5 운영체계)에 비례하지 않음
- PMF 신호는 Hermes 반복 감지 + Founder 정성 판단으로 대체 가능
- 멀티 에이전트 라우팅은 ACR 내장 `agent-model-router` (claude/codex/antigravity)로 충분

### Impact

- 관련 TASKS 항목은 "out-of-scope"로 마킹, 신규 작업은 만들지 않음
- 향후 도입 필요 시 새 ADR로 재논의
