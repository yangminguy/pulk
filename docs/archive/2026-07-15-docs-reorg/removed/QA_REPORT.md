# QA_REPORT — L5 Business OS MVP

작성일: 2026-05-26
작성자: worker-6 (docs-qa-updater)
대상 브랜치: `main` (full-build 세션 결과)

이 리포트는 보고서 인용이 아니라 worker-6가 직접 실행한 명령 결과에 기반한다.

## 0. Current QA Addendum — 2026-06-03

작성자: Codex  
범위: 신규 기능 변경분 중심 QA wiring 복구, CEO 되묻기/agent fanout 정책 수정, generated/runtime artifact 추적 제거, 전체 smoke/E2E 재검증, archive 청소

### 최종 판정

PASS. 이번 변경분 기준 workspace typecheck/lint/test/build, NocoBase E2E, Founder UI E2E 전체, authenticated smoke, autopilot smoke, D6 delegation smoke가 통과했다. Docker CLI 부재는 계속 optional warning이며 현재 SQLite/NocoBase smoke에는 필요하지 않았다.

### 직접 실행 결과

| 검증 | 명령 | 결과 |
|------|------|------|
| `@l5/core` typecheck/build/test | `corepack pnpm --filter @l5/core typecheck`, `build`, `test -- --runInBand` | PASS (48 suites / 516 tests) |
| `@l5/agent-runtime` test | `corepack pnpm --filter @l5/agent-runtime test -- --runInBand` | PASS (1 suite / 5 tests) |
| `@l5/hermes-runtime` test/typecheck | `corepack pnpm --filter @l5/hermes-runtime test -- --runInBand`, `typecheck` | PASS (13 suites / 86 tests) |
| Founder UI typecheck/build | `corepack pnpm --dir apps/founder-ui typecheck`, `build` | PASS |
| Founder UI E2E smoke | `corepack pnpm --dir apps/founder-ui e2e` | PASS (`/chat`, `/monitor`, `/memory`, `/control-room`, `/tool-requests`, `/approval`) |
| NocoBase app tests | `corepack pnpm --dir apps/nocobase-app test` | PASS |
| Plugin builds | `nocobase build @l5/plugin-orchestration`, `nocobase build @l5/plugin-executive-monitor` | PASS |
| Authenticated NocoBase smoke | `corepack pnpm smoke:nocobase-auth` | PASS |
| Structural validate | `corepack pnpm validate` | PASS (22 passed / 1 optional Docker warning / 0 failed) |
| Workspace typecheck/lint/test/build | `corepack pnpm -r typecheck`, `corepack pnpm -r --if-present lint`, `corepack pnpm -r test`, `corepack pnpm -r build` | PASS |
| NocoBase E2E | `corepack pnpm --dir apps/nocobase-app e2e test` | PASS (1 passed) |
| Founder UI detailed E2E | `verify-changes.mjs`, `verify-live.mjs`, `e2e-projects.mjs` | PASS |
| Autopilot smoke | `corepack pnpm tsx scripts/smoke-autopilot-e2e.ts` | PASS |
| D6 delegation smoke | `node scripts/d6-delegation-smoke.mjs` | PASS |

### 이번 QA에서 정리한 항목

| 항목 | 상태 |
|------|------|
| `.next/`, `apps/nocobase-app/storage/` tracked artifact noise | fixed: git index에서 제거하고 `.gitignore`에 추가 |
| `services/agent-runtime` test script 누락 | fixed: Jest test script/devDeps 추가 |
| `apps/founder-ui` E2E script 누락 | fixed: `pnpm --dir apps/founder-ui e2e` 추가 |
| CEO 되묻기 과다 | fixed: actionable goal+assumptions/success criteria면 진행, 진짜 blocked/승인 누락만 질문 |
| agent task fanout 과다 | fixed: quick/few/single intent를 감지해 기본 1-2개 agent로 제한 |
| RiskQA gate 정책 | fixed: D3-D5 자체가 아니라 외부발신/결제/승인 누락을 차단 |
| NocoBase plugin test CSS import failure | fixed: client CSS import 대신 package/source 구조 검증 |
| `node-cron` plugin build bundling failure | fixed: app-level runtime dependency로 lazy load |
| authenticated smoke stale expectations | fixed: vague prompt는 clarification, concrete internal prompt는 task 생성으로 검증 |
| NocoBase E2E auth setup | fixed: generated auth setup + SQLite isolation script |
| Claude CLI smoke invocation | fixed: `claude -p <prompt>` invocation and token log redaction |
| Project E2E stale dependency/text checks | fixed: `@playwright/test` import and current header assertions |
| `apps/nocobase` legacy scaffold | fixed: excluded from pnpm workspace QA; remains reference-only |
| `artifacts/`, `work-orders/` active-doc noise | fixed: moved under `docs/archive/2026-06-03-cleanup/` |

### 남은 청소 후보

`reports/` 안의 HTML 계획서는 현재 문서에서 active reference로 쓰이고 있어 통째로 이동하지 않았다. `docs/legacy`와 장기 `docs/HANDOFF.md` 로그 분리는 히스토리 참조가 많아 이번 패스에서는 보존했다.

아래 섹션은 이전 QA 기록이며, 현재 상태는 이 addendum을 우선한다.

## 0. Current QA Addendum — 2026-05-27

작성자: Codex  
범위: 현재 개발 문서 기준 구조 정리 후 전체 QA/e2e 회귀

### 최종 판정

PASS. 다음 UI/Phase Summary 작업으로 넘어갈 수 있는 상태다. 단, Docker CLI는 이 로컬 환경에 없어 `validate`에서 optional warning으로 분리했다. 현재 SQLite 기반 NocoBase e2e와 authenticated smoke에는 Docker가 필요하지 않았다.

### 직접 실행 결과

| 검증 | 명령 | 결과 |
|------|------|------|
| Workspace typecheck | `corepack pnpm -r typecheck` | PASS |
| Workspace lint | `corepack pnpm -r --if-present lint` | PASS |
| Workspace build | `corepack pnpm -r build` | PASS |
| Workspace tests | `corepack pnpm -r test` | PASS (`@l5/core`: 19 suites / 174 tests, `hermes-runtime`: 2 suites / 13 tests, `nocobase-app`: 1 test) |
| Authenticated NocoBase smoke | `corepack pnpm smoke:nocobase-auth` | PASS (`auth`, `chat:submitInstruction`, monitor endpoints) |
| NocoBase e2e | `corepack pnpm --dir apps/nocobase-app nocobase e2e test` | PASS (1 passed) |
| Validate | `corepack pnpm validate` | PASS (22 passed / 1 optional Docker warning / 0 failed) |

### 이번 QA에서 정리한 항목

| 항목 | 상태 |
|------|------|
| `apps/nocobase-app` 실행 플러그인 server entry 구조 | fixed |
| `plugin-orchestration` build-time workspace dependency 경로 문제 | fixed |
| `sqlite3` e2e dependency 누락 | fixed |
| NocoBase e2e auth state 파일 생성 경로 | fixed |
| Playwright auth setup 30초 타임아웃 | fixed |
| SQLite에서 PostgreSQL 전용 `ALTER TABLE` 경고 | fixed |
| Recursive lint용 `@l5/core` ESLint config 부재 | fixed |
| Docker CLI 부재로 인한 validate 실패 | fixed as optional warning |

## 1. Verification Results (직접 실행)

| 검증 | 명령 | 결과 | Exit |
|------|------|------|------|
| pnpm 버전 | `pnpm --version` | 9.15.0 | 0 |
| Typecheck | `pnpm --filter @l5/core typecheck` | 에러 0 | 0 |
| Build | `pnpm --filter @l5/core build` | `dist/` 정상 생성 | 0 |
| Unit Test | `pnpm --filter @l5/core test` | 5 suites / 42 tests 전부 PASS | 0 |
| MVP Demo | `pnpm demo` | 전체 루프 정상 실행, "Demo complete." | 0 |

### Demo Loop 실측 출력

```
Idea:            AI Workflow Automation for Solo Founders
Founder Fit:     69/100
PMF Score:       61/100 (medium)
Approval Gate:   REQUIRED (founder_only)
Tool Candidate:  YES (priority=high)
```

루프 경로 `Idea → FounderFit → Brief → PMF → Approval Gate → Tool Candidate`가
end-to-end로 동작함을 확인했다.

## 1-A. Regression QA Addendum — 2026-05-27

작성자: Codex  
대상: Antigravity Founder-facing UI 변경 후 최종 회귀 QA

### 범위

- Executive Monitor Phase View
- Approval Queue readability
- Founder Brief preview
- Memory Candidate Review surface
- `protocol.ts` handler contract, `executeAgentTask()` integration, Executive runtime tests, authenticated NocoBase smoke path

### 발견 사항

| ID | 항목 | 설명 | 상태 |
|----|------|------|------|
| RQA-1 | Monitor route mismatch | UI가 `/api/monitor/currentTasks`를 호출했지만 NocoBase action route는 `/api/monitor:currentTasks`다. | fixed |
| RQA-2 | Monitor response field 누락 | `risk_level`, `phase`, `source_ref`가 server 응답에서 누락되어 UI 표시/필터와 맞지 않았다. | fixed |
| RQA-3 | Approval Queue parser | `any` 기반 mapping이 stale field name을 가릴 수 있었다. | fixed |
| RQA-4 | Memory Candidate 상태 | Review surface는 pending 후보만 표시해야 한다. | fixed |
| RQA-5 | Auth smoke 환경 | `localhost:13000` NocoBase 서버 미기동으로 authenticated smoke가 `fetch failed`에서 중단됐다. | blocked by local runtime |
| RQA-6 | Lint tooling | `@l5/core` ESLint config 부재로 recursive lint가 실패했다. | tooling gap |

### 수정 파일

- `apps/nocobase/packages/plugins/@l5/plugin-executive-monitor/src/client/components/TaskMonitorView.tsx`
- `apps/nocobase/packages/plugins/@l5/plugin-executive-monitor/src/client/components/FounderBriefPreview.tsx`
- `apps/nocobase/packages/plugins/@l5/plugin-executive-monitor/src/client/components/ApprovalQueueView.tsx`
- `apps/nocobase/packages/plugins/@l5/plugin-executive-monitor/src/client/components/MemoryReview.tsx`
- `apps/nocobase/packages/plugins/@l5/plugin-executive-monitor/src/server/index.ts`

### 검증 결과

| 검증 | 명령 | 결과 |
|------|------|------|
| Core typecheck | `corepack pnpm --filter @l5/core typecheck` | PASS |
| Workspace typecheck | `corepack pnpm -r typecheck` | PASS |
| Core tests | `corepack pnpm --filter @l5/core test -- --runInBand` | PASS, 13 suites / 110 tests |
| Executive Monitor plugin typecheck | `corepack pnpm exec tsc -p apps/nocobase/packages/plugins/@l5/plugin-executive-monitor/tsconfig.json --noEmit` | PASS |
| Orchestration plugin typecheck | `corepack pnpm exec tsc -p apps/nocobase/packages/plugins/@l5/plugin-orchestration/tsconfig.json --noEmit` | PASS |
| Authenticated smoke | `corepack pnpm smoke:nocobase-auth` | BLOCKED: no server on `localhost:13000` |
| App-specific lint | `corepack pnpm -r --if-present lint` | BLOCKED: missing ESLint config in `@l5/core` |

### Verdict

Conditional Pass. Runtime/core contracts and plugin typechecks pass. UI/server schema mismatches found during review were fixed. Authenticated NocoBase smoke must be rerun after the local NocoBase server is started on port 13000.

## 2. Issues

### Critical

없음. MVP 핵심 경로(l5-core 로직 + demo 루프)는 빌드/테스트/실행 모두 통과한다.

### High

| ID | 항목 | 설명 | 상태 |
|----|------|------|------|
| H1 | NocoBase Shell 미설치 | `apps/nocobase/packages/plugins/@l5/*`는 9개 플러그인 scaffold(README + server/client index)만 존재. NocoBase CE 본체와 PostgreSQL이 없어 플러그인 런타임 동작은 미검증. | scaffold only |
| H2 | Agent/Hermes runtime 미연결 | `services/agent-runtime`(CEO/COS/CMO/CTO/Risk-QA), `services/hermes-runtime`(5개 loop)는 entry/스텁만 존재. Mastra/Trigger.dev 실제 연동 및 LLM 호출 미구현. | scaffold only |

### Medium

| ID | 항목 | 설명 | 상태 |
|----|------|------|------|
| M1 | dist 모듈 형식 | l5-core에 `"type": "commonjs"` 명시로 루트 `type:module` 상속 충돌 해소됨. demo는 tsx로 src를 직접 실행하므로 영향 없음. 향후 dist 소비처가 ESM이면 재점검 필요. | resolved |
| M2 | catalog 프로토콜 의존 | `pnpm-workspace.yaml`의 `catalog:`는 pnpm 9.5+ 필요. `packageManager`가 9.15.0으로 고정되어 현재 OK이나, 9.0.0 환경에서는 install 실패. | mitigated |
| M3 | Observability/PMF Signal 미착수 | Langfuse trace 추상화, Formbricks 어댑터는 Phase 6-7로 이번 빌드 범위 밖. | deferred |

## 3. PRD Coverage Table

PRD Success Metrics(10개) 기준 커버리지. "logic"은 l5-core에서 검증됨, "UI"는 NocoBase 플러그인 표면.

| # | PRD Success Metric | l5-core Logic | UI/Shell | Demo 검증 | 상태 |
|---|--------------------|:-------------:|:--------:|:---------:|------|
| 1 | 아이디어 입력 시 Founder Fit 평가 생성 | ✅ `scoreFounderFit` | scaffold | ✅ 69/100 | 로직 완료 |
| 2 | PMF Plan이 Tool Request보다 먼저 | ✅ gate 로직 | scaffold | ✅ 순서 보장 | 로직 완료 |
| 3 | Workflow + Agent Staffing Plan 생성 | ⚠️ brief 생성만 | scaffold | brief만 | 부분 |
| 4 | Hermes 멈춤/마감 감지 | ⚠️ loop scaffold | scaffold | 미검증 | scaffold |
| 5 | BPR Log 병목/개선안 기록 | ❌ 미구현 | scaffold | 미검증 | scaffold |
| 6 | Tool Request Lab 후보 수신 | ✅ `decideToolCandidate` | scaffold | ✅ YES/high | 로직 완료 |
| 7 | Memory Room 인사이트 저장 | ⚠️ 타입만 | scaffold | governance 분리 표시 | 부분 |
| 8 | Customer PII / Business Insight 분리 | ✅ pii_level 필드 + demo 분리 | scaffold | ✅ REDACTED 처리 | 로직 완료 |
| 9 | Founder 승인 항목 Decision Queue 표시 | ✅ `requiresFounderApproval` | scaffold | ✅ REQUIRED | 로직 완료 |
| 10 | l5-core가 NocoBase 없이 테스트 가능 | ✅ 42 tests 독립 실행 | n/a | ✅ | 완료 |

요약: 핵심 scoring/judgment 로직(메트릭 1, 2, 6, 8, 9, 10)은 구현 + 테스트 완료.
메트릭 3, 4, 5, 7은 scaffold 또는 부분 구현으로 다음 iteration 대상.

## 4. QA Findings (Accepted / Rejected)

### Accepted (수용 — 의도된 MVP 범위)

- NocoBase/Agent/Hermes가 scaffold만인 것은 PRD MVP 정의("핵심 로직을 Shell에 종속시키지 않는다", "검증 전 대규모 툴 제작 금지")와 일치. 핵심 판단 로직을 먼저 독립 검증한 것은 올바른 우선순위다.
- demo가 외부 호출/부수효과 없이 샘플 데이터로만 동작 — "외부 자동화 승인 게이트" 원칙 준수.
- PII high 레코드를 demo에서 `<REDACTED>` 처리하고 다운스트림(brief)에 미전달 — 데이터 거버넌스 규칙 준수.

### Rejected (현 시점 비채택 — 추적만)

- "모든 플러그인을 즉시 동작시켜야 한다" — NocoBase CE 본체 설치가 선행되어야 하므로 이번 빌드 범위 밖. H1으로 추적.
- "Langfuse/Formbricks 통합" — PMF signal이 아직 없으므로 PRD "No Demand, No Tool" 원칙상 보류. M3으로 추적.

## 5. Governance / Safety Check

| CLAUDE.md 규칙 | 준수 여부 | 근거 |
|----------------|:--------:|------|
| l5-core는 NocoBase 없이 테스트 가능 | ✅ | 42 tests 독립 실행 |
| 모든 scoring rule에 unit test | ✅ | founder-fit/pmf/tool-request/approval/brief 전부 테스트 존재 |
| 외부 action에 risk level (D1-D5) | ✅ | demo에서 D4 외부 발송 게이트 처리 |
| customer record에 pii_level | ✅ | MemoryEntry pii_level 필드 + demo 분리 |
| 상용 플러그인 의존 없음 | ✅ | 모든 의존성 OSS/workspace |
| secret/env 하드코딩 없음 | ✅ | `.env.example`만 존재, 코드 내 시크릿 없음 |
