# ACR Kernel Refactor Plan — Phase 1 설계

> 출처 PRD: `FINAL_pulk_cto_acr_kernel_harness_agent_team_prd.md` (§20 Phase 1, §24 1차 프롬프트, §30 최종 구현 순서)
> 작성 범위: 설계 문서 1건. 이 단계에서는 대규모 코드 수정을 하지 않는다(PRD §24 제약).

---

## 0. 최상위 원칙 (변경 불가)

> **pulk CTO = source of truth (상위 판단자/기획자). ACR = 실행 커널(execution kernel)일 뿐이다.**

- **pulk CTO가 유일한 source of truth다.** roadmap / task / plan / 위험도 / 복잡도 판단은 모두 pulk(`packages/l5-core`)에서 결정된다.
- **ACR은 planning brain이 아니다.** ACR(별도 저장소 `agent-control-room`)은 ExecutionRun / TeamRun 생성, worktree 생성, agent 실행, 로그·diff 수집, verification, result packet 생성만 담당한다.
- **모든 agent 실행은 Harness를 통해서만 수행한다.** 간단한 작업에는 가벼운 harness, 위험한 작업에만 strict harness.
- **main repo는 직접 수정하지 않는다.** 모든 변경은 run별 worktree 안에서 일어나고, `blockedFiles` 수정은 `boundary_violation`으로 처리한다.

이 원칙을 깨는 변경은 이 문서(`docs/DECISIONS.md` 포함)를 먼저 갱신하지 않고 진행하지 않는다.

---

## 1. 현재 구조 분석 (이 저장소 = pulk)

PRD §24가 요구한 5가지 확인 항목을 이 저장소 기준으로 정리한다.

### 1.1 pulk → ACR dispatch 경로 (확인 1)

```
NocoBase task (approval_required=false)
  └─ services/hermes-runtime/src/tasks/task-dispatcher.ts   (runTaskDispatcher)
       └─ AGENT_MAP["CTO"] → runCTOAgent (services/agent-runtime)
            └─ CTO 에이전트가 ACRIntent(phases[]) 생성 → ACR로 async dispatch
       └─ services/hermes-runtime/src/api/acr-client.ts      (ACR HTTP client)
```

핵심 사실(코드 근거):

- `task-dispatcher.ts`는 **CTO task만 async로 취급한다.** 디스패처는 intent만 쏘고 task를 `running`으로 둔 채 반환하며, ACR이 분 단위로 phase를 돌린 뒤 `taskCallback(all_done)`으로 완료시킨다(line 92–103 주석).
- `acr-client.ts`의 현재 ACR 표면:
  - `POST /api/approvals` — D3+ 승인 알림 (`notifyACRApprovalRequired`)
  - `POST /api/projects` — 프로젝트 등록 (`registerACRProject`)
  - `GET /api/projects/:id` — 프로젝트 조회 (`getProject`)
  - `GET /api/feature-plans?projectId=` — **feature plan/phase 조회 (`getFeaturePlans`)** ← planning brain 잔재(§1.4 deprecated 후보)
  - `ACR_BASE_URL` 기본값 `http://localhost:3001`, 실패해도 pulk는 계속 동작(graceful fallback).

### 1.2 ACR runner/approval/orchestration API (확인 2)

- ACR repo(`agent-control-room`)는 **이 워크스페이스 밖**이다. 이 저장소에서 ACR 표면은 위 4개 엔드포인트로만 노출된다.
- 실제 runner / approval UI / phase orchestration은 ACR 저장소 책임이며, 본 문서는 그 계약(contract)만 정의한다.

### 1.3 중복 state 목록 (확인 3)

| state | pulk (source of truth) | ACR (현재) | 처리 방향 |
|---|---|---|---|
| task / project | NocoBase DB + l5-core | `/api/projects`, 자체 JSON | pulk 정본 유지, ACR은 mirror만 |
| roadmap / feature plan / phase 재해석 | CTO 에이전트가 ACRIntent로 확정 | `/api/feature-plans` 가 phase status를 자체 보관·재해석 | **deprecated 후보** — ExecutionRun status로 대체 |
| 위험도 / 복잡도 | l5-core `cto-harness` (D0~D4, C0~C5) | (ACR 자체 재판단 금지) | pulk 단일화 |
| 승인 게이트 | `approval_required` + `l5_approved` 플래그 | `/api/approvals` Release Gate 패널 | `l5_approved`를 단일 정본으로(ACRIntent 주석 근거) |

### 1.4 ACR JSON state ↔ pulk DB 분리 지점 (확인 4)

- pulk: NocoBase PostgreSQL이 task/approval/project 정본.
- ACR: 자체 JSON state(run/log/diff/artifact)는 **실행 산출물**이므로 ACR가 보관해도 무방.
- 분리 원칙: **"판단/계획 state는 pulk, 실행 산출물 state는 ACR."** `/api/feature-plans`가 phase **status를 재해석**하는 부분이 이 경계를 침범하므로 deprecated 대상이다.

### 1.5 기능을 깨지 않고 execution-runs를 추가하는 최소 변경 경로 (확인 5)

- 기존 `/api/runner`·`/api/projects`·`/api/approvals`는 **제거 금지**(PRD §31 제약).
- 신규 `/api/execution-runs`는 **기존 runner 위에 thin adapter**로 얹는다(§5 adapter-first).
- pulk 측은 이미 `cto-harness` 타입/순수함수가 준비됨 → ACR가 계약만 구현하면 양쪽이 맞물린다.

---

## 2. 이번에 pulk에 추가된 `cto-harness` 모듈 역할표

위치: `packages/l5-core/src/functions/cto-harness/`. **전부 순수 판단 로직**이며 I/O·네트워크·git 실행이 없다(`l5-core`는 NocoBase 없이 테스트 가능 — CLAUDE.md 규칙 2). 실제 실행은 ACR Kernel 책임.

| 모듈 | 핵심 export | 역할 | PRD 근거 |
|---|---|---|---|
| `types.ts` | `ExecutionRun`, `CTOExecutionWorkOrder`, `HarnessInput/Output`, `ExecutionResultPacket`, `MainAgentWorkPackage`, `AgentTeamRun`, `TeamResultPacket`, `Complexity`, `RiskLevel` | pulk CTO ↔ ACR Kernel 사이의 **표준 타입 계약** | §8, §10, §14, §16, §29 |
| `complexity-router.ts` | `classifyComplexity`, `complexityToMode`, `complexityToHarnessMode`, `buildVerificationProfile` | 입력 신호(파일 수/변경 라인/위험영역/키워드)를 **C0~C5로 분류**하고 ExecutionMode·HarnessMode·VerificationProfile로 매핑 | §6 |
| `command-guard.ts` | `checkCommand`, `checkCommands` | 실행 전 CLI 명령을 **safe/warning/blocked**로 사전 분류(rm -rf, git push, .env 변경, 의존성 설치, deploy, migration apply 등 차단) | §14.8, §19.1 |
| `boundary-check.ts` | `checkBoundary`, `matchGlob`, `DEFAULT_BLOCKED` | changed 파일이 `allowedFiles` 안 / `blockedFiles` 밖인지 glob으로 검사 → `blocked` / `outOfScope` / `boundary_violation` 산출 | §12.3 |
| `work-order.ts` | `buildWorkOrder`, `validateWorkOrder` | `CTOExecutionWorkOrder`를 결정적으로 조립·검증(D4면 최소 C4 하한, D3/D4면 승인 필수, C3+면 boundary 필수) | §10 |
| `team-router.ts` | `selectMainAgent`, `selectInternalOrchestrationMode`, `recommendedInternalRoles`, `canParallelize`, `decomposeLargePRDToPackages` | 대형 PRD를 메인 에이전트별 Work Package로 **분해**하고 내부 오케스트레이션 모드·병렬 가능성 판단(C0/C1 team 금지, C5만 parallel) | §29, §9, §12 |
| `prompt-builder.ts` | `buildMainAgentPrompt`, `AGENT_ROLE_HEADERS` | Work Package → 메인 에이전트용 **9블록 프롬프트** 결정적 생성(ROLE/OBJECTIVE/SCOPE/ALLOWED/BLOCKED/TEAM/VERIFY/OUTPUT/STOP) | §7.1, §29 |
| `result-aggregator.ts` | `aggregateTeamResult`, `detectConflicts` | 여러 패키지 결과를 받아 **파일 충돌 탐지 + 팀 status/최종 권고** 산출(conflict→manual_review) | §11, §16 |

> 에이전트 명명 주의: `cto-harness`는 PRD가 정의한 4종(`claude-code`/`codex`/`antigravity`/`hermes`)을 쓰고, 기존 `acr-intent.ts`의 `RuntimeType`은 `claude`/`codex`/`antigravity`/`omc`다. 두 표기는 별개이며 `types.ts`가 `RuntimeType`을 re-export해 한 곳에서 참조한다. adapter 단계에서 매핑을 명시한다(§5).

---

## 3. ACR 저장소(`agent-control-room`)가 구현해야 할 부분 — **이 워크스페이스 밖**

아래는 모두 **ACR repo 책임**이며 본 저장소(pulk)에서는 구현하지 않는다. pulk는 위 §2 타입/순수함수로 계약만 제공한다.

| 항목 | 책임 | PRD |
|---|---|---|
| Worktree Manager (`createWorktree`/`cleanupWorktree`, branch naming, diff 수집) | ACR | §20 Phase 3, §30 Phase 4 |
| `POST /api/execution-runs` (run 생성) | ACR | §9, §20 Phase 2 |
| `GET /api/execution-runs/:run_id` (run 조회) | ACR | §9, §20 Phase 2 |
| `POST /api/execution-runs/:run_id/result` (result packet 수신) | ACR | §9, §30 Phase 2 |
| Harness 실행 레일(direct/safe_solo/standard/strict/parallel_patch) 실제 실행 | ACR | §14 |
| Verification 실제 실행(typecheck/lint/test/build/playwright 러너) | ACR | §13, §20 Phase 5 |
| ACR debug UI / raw 실행 화면 | ACR | §18 |
| Playwright artifact(screenshot, DOM snapshot, locator suggestion) | ACR | §20 Phase 8 |
| Handoff 자동 생성(`.handoff/runs/{run_id}`) | ACR | §15, §20 Phase 6 |
| Dagu 정기 운영 자동화(cleanup/drift/full verify) | ACR | §17, §20 Phase 9 |

> pulk UI(Control Room) 통합(§20 Phase 7, §30 Phase 8: latest run / history / log tail / retry·review / team summary)은 pulk 측 작업이지만 **Phase 1 범위 밖**이다.

---

## 4. Deprecated 후보 (ACR planning/roadmap 재해석 경로)

ACR가 **planning brain처럼 동작하던 경로**를 단계적으로 폐기한다. 즉시 삭제하지 않고 adapter로 우회 후 사용처가 0이 되면 제거한다.

| 경로 | 문제 | 대체 | 비고 |
|---|---|---|---|
| `GET /api/feature-plans?projectId=` (`acr-client.getFeaturePlans`) | ACR가 phase **status를 자체 보관·재해석**(planning brain 잔재) | pulk CTO가 확정한 ExecutionRun status / TeamRun status를 정본으로 | pulk 사용처 grep 후 제거 |
| ACR 측 roadmap/task planning UI·state (ACR repo) | source of truth 이원화 | pulk CTO 단독 | ACR repo 책임 |
| ACR 자체 Release Gate 재질의 | 승인 이원화 | ACRIntent `l5_approved` 단일 정본(acr-intent.ts 주석 근거) | `manual_founder`만 적용, `auto_24h`는 별도 시간정책 |
| ACR 측 위험도/복잡도 재판단 | pulk `cto-harness`와 중복 | l5-core C0~C5 / D0~D4 단일화 | ACR는 받은 값 그대로 실행 |

> `/api/runner`, `/api/projects`, `/api/approvals`는 **deprecated 아님** — 유지(PRD §31 제약).

---

## 5. Adapter-first 마이그레이션 전략

PRD §30 Phase 1·2의 "기존 runner는 유지하고 adapter-first로 접근" 원칙.

1. **Contract-first**: pulk가 §2 타입/순수함수로 계약을 먼저 고정(완료). ACR는 이 타입을 정본으로 구현.
2. **Thin adapter**: ACR의 신규 `/api/execution-runs`는 **기존 runner를 호출하는 얇은 어댑터**로 시작. 기존 `/api/runner` 동작은 그대로.
3. **Dual-run 기간**: 신규 `execution-runs` 경로와 기존 dispatch(`acr-client`)를 병행. pulk 디스패처는 기능 플래그로 점진 전환.
4. **에이전트 표기 매핑**: adapter에서 `RuntimeType`(`claude`/`omc`) ↔ `ExecutionAgent`(`claude-code`/`hermes`)를 명시 변환. 한 곳(adapter)에서만 매핑.
5. **사용처 0 → 제거**: §4 deprecated 경로는 pulk grep으로 사용처가 0이 된 뒤에만 삭제.

원칙: **타입 → 문서 → router mock → adapter layer 순서로만 추가하고, 실제 병렬 실행은 아직 구현하지 않는다**(PRD §31).

---

## 6. 위험 요소 및 Rollback 전략

| 위험 | 영향 | 대응 / Rollback |
|---|---|---|
| 기존 `/api/runner` 회귀 | 라이브 CTO dispatch 중단 | runner 미변경(adapter만 추가). 문제 시 기능 플래그 off → 기존 경로 복귀 |
| ACR 미가동 시 pulk 멈춤 | 운영 중단 | `acr-client`의 graceful fallback 패턴 유지(실패해도 pulk 계속 동작) |
| source of truth 이원화 잔존 | 상태 불일치 | `feature-plans` 재해석 즉시 deprecated 표시, pulk status를 정본으로 |
| 에이전트 표기 불일치(`claude`/`claude-code`, `omc`/`hermes`) | dispatch 실패 | adapter 단일 매핑 지점 + 단위 테스트 |
| worktree 누수(ACR) | 디스크/브랜치 오염 | ACR `cleanupWorktree` + Dagu 정기 cleanup(§9 Phase) |
| boundary 우회 | main repo 직접 수정 | `checkBoundary` + `DEFAULT_BLOCKED`(.env/lockfile/node_modules/.git) 강제, 위반 시 `boundary_violation` |
| 승인 게이트 우회 | 위험 작업 무단 실행 | `l5_approved` 단일 정본, D3/D4 `requiresApproval` validateWorkOrder 강제 |

**문서 레벨 rollback**: 이 문서는 코드를 바꾸지 않으므로 rollback = 문서 revert. 후속 코드 단계는 모두 기능 플래그 뒤에서 진행해 즉시 비활성화 가능하게 한다.

---

## 7. 1차 구현 순서 (Phase 1 산출물 + 후속 진입점)

PRD §24 / §30 / §31의 1차 범위. **이 문서가 Phase 1의 산출물**이고, 이후 항목은 진입점만 명시한다.

1. **(완료) 이 문서 작성** — `docs/ACR_KERNEL_REFACTOR_PLAN.md`: 원칙·현황·역할표·deprecated·adapter 전략·위험/rollback.
2. **(완료, pulk 측) 타입·순수함수** — `cto-harness/*` (ExecutionRun, HarnessInput/Output, CommandGuard, complexityToHarnessMode, WorkPackage/TeamRun/TeamResultPacket, buildMainAgentPrompt, C0~C5 guardrail 테스트).
3. **(ACR repo) `POST/GET /api/execution-runs` + `/result` thin adapter** — 기존 runner 위에 얹기.
4. **(ACR repo) Worktree Sandbox** — run별 worktree, branch naming, diff 수집, cleanup.
5. **(ACR repo) Verification Layer** — typecheck/build 기본, C2+ relevant test, UI Playwright smoke.
6. **(ACR repo) Handoff 자동 생성** — `.handoff/runs/{run_id}`.
7. **(pulk 측, 후순위) Control Room UI 통합** — latest run / history / log tail / retry·review / team summary.

**Phase 1 완료 기준(PRD §20)**: ACR Kernel 역할 정의 문서 완료 / "pulk CTO = source of truth" 원칙 명시 / 기존 기능을 깨지 않는 migration path 확보. → 본 문서로 충족.

---

## 8. C0~C5 Complexity Router 표

`complexity-router.ts` 구현과 1:1 일치(코드가 정본).

| Level | 이름 | 분류 기준(`classifyComplexity`) | ExecutionMode (`complexityToMode`) | HarnessMode (`complexityToHarnessMode`) | VerificationProfile (`buildVerificationProfile`) |
|---|---|---|---|---|---|
| **C0** | Note/Doc | `isDocOnly` (위험영역 아님) | `safe_solo` | `direct` | boundary만 |
| **C1** | Small Code | 파일 ≤1개 또는 변경 ≤50줄, 신호 없으면 기본값 | `safe_solo` | `safe_solo` | typecheck + boundary |
| **C2** | Feature Slice | 파일 2~5개 | `implement_verify` | `standard` | typecheck + build + boundary (UI면 +playwright) |
| **C3** | Cross-Module | 파일 5개 초과 | `strict_sandbox` | `strict` | typecheck + test + build + boundary (UI면 +playwright) |
| **C4** | Risky/System | 위험영역 터치(auth/payment/migration/deploy/env/runner) 또는 위험 키워드 | `strict_sandbox` | `strict` | typecheck + lint + test + build + boundary (UI면 +playwright) |
| **C5** | Large Refactor | `isLargeRefactor` | `parallel_patch_queue` | `parallel_patch` | C4와 동일 |

분류 우선순위(코드): 위험영역/위험키워드 → **C4** > `isLargeRefactor` → **C5** > `isDocOnly` → **C0** > 파일≤1 또는 변경≤50 → **C1** > 파일 2~5 → **C2** > 파일>5 → **C3** > (신호 없음) → **C1**.

내부 오케스트레이션 가드레일(`team-router.selectInternalOrchestrationMode`, PRD §12):

| Level | InternalExecutionMode | 비고 |
|---|---|---|
| C0/C1 | `solo` | **내부 팀·서브에이전트 금지** |
| C2 | `solo_with_subagents` | 서브에이전트까지만 |
| C3/C4 | `internal_sequential_team` | 순차 내부 팀 |
| C5 | `internal_parallel_team` (독립 파일 스코프 ≥2) / 아니면 `internal_sequential_team` | **C5에서만 병렬 팀** |
