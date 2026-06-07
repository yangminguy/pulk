# AGENT_TEAM_ARCHITECTURE — Hierarchical Agent Team Orchestration

- 출처 PRD: `FINAL_pulk_cto_acr_kernel_harness_agent_team_prd.md` §29 전체
- 구현 위치: `packages/l5-core/src/functions/cto-harness/`
- 상태: 타입 + Router 판단 로직 구현 완료 (순수 함수, 실제 병렬 실행은 미구현)

이 문서는 PRD §29(Hierarchical Agent Team Orchestration)를 **실제 코드와 1:1로 일치**하도록 정리한 아키텍처 레퍼런스다. 모든 타입은 `cto-harness/types.ts`, 모든 함수는 `team-router.ts` / `prompt-builder.ts` / `complexity-router.ts`에 있다.

---

## 1. 핵심: 2-Level Orchestration

전체 구조는 2단계 위계다. pulk CTO는 코드를 직접 쓰지 않고 판단·분해만 하며, ACR Kernel은 기획하지 않고 실행만 한다.

```text
Level 1: pulk CTO가 큰 PRD를 메인 에이전트 단위 Work Package로 분해한다.
Level 2: 각 메인 에이전트가 자기 Work Package 안에서 sub-agent/team으로 다시 세분화한다.
```

```text
사용자 / 큰 PRD
  ↓
pulk CTO: 1차 Task Decomposition  (decomposeLargePRDToPackages)
  ↓
Main Agent Assignment              (selectMainAgent)
  ├─ Claude Code Work Package      (구현/리팩터링)
  ├─ Codex Work Package            (검증/테스트/리뷰)
  └─ Antigravity Work Package      (UI/UX/Playwright)
        ↓
각 Main Agent 내부 2차 Orchestration  (selectInternalOrchestrationMode)
  ├─ sub-agent
  ├─ role-based mini team           (recommendedInternalRoles)
  └─ self-verification loop
        ↓
ACR Harness  (실행 안전장치, 별도 저장소)
        ↓
ExecutionRun / AgentTeamRun
        ↓
TeamResultPacket
        ↓
pulk CTO 통합 판단
```

원칙 한 줄: **작은 일은 solo, 중간 일은 sub-agent, 큰 일은 sequential team, 진짜 큰 일만 parallel team. 항상 pulk CTO가 상위 판단자, 항상 ACR Harness가 실행 안전장치.**

---

## 2. 데이터 모델 (`cto-harness/types.ts`)

PRD §29의 타입은 모두 `types.ts`에 정의돼 있다. 코드가 source of truth이며, 아래는 그 요약이다.

### 2.1 MainAgentWorkPackage

각 메인 에이전트에게 전달되는 세부 작업 단위. (단순 prompt가 아니라 이 구조체를 전달한다.)

```ts
interface MainAgentWorkPackage {
  packageId: string;
  parentTaskId: string;
  parentPlanId: string;

  assignedMainAgent: MainAgent;              // 'claude-code' | 'codex' | 'antigravity'

  objective: string;

  scope: {
    includedDomains: WorkPackageDomain[];    // 'api'|'ui'|'db'|'runner'|'harness'|'test'|'docs'
    allowedFiles: string[];
    blockedFiles: string[];
    expectedOutputs: string[];
  };

  orchestrationHint: {
    useSubAgents: boolean;
    useInternalTeam: boolean;
    recommendedInternalRoles: string[];
    maxInternalSteps: number;
    avoidOverEngineering: boolean;
    reason?: string;                         // team/sub-agent 사용 사유 (없으면 ACR Harness가 rejected)
  };

  executionMode: InternalExecutionMode;      // 'solo'|'solo_with_subagents'|'internal_sequential_team'|'internal_parallel_team'

  verificationProfile: {
    requiredChecks: CheckName[];
    optionalChecks: string[];
  };

  acceptanceCriteria: string[];
  outputContract: OutputContract;            // 'patch'|'review_report'|'test_patch'|'ui_report'|'handoff'|'result_packet'
  dependencies: string[];
  riskLevel: RiskLevel;                      // 'D0'..'D4'
}
```

> 구현 주의: PRD §5 원문에는 `orchestrationHint.reason`이 없지만, §12 가드레일("이유 없는 team 사용은 rejected")을 강제하기 위해 `types.ts`는 `reason?: string`을 추가했다. `decomposeLargePRDToPackages`는 sub-agent/team을 쓰면서 reason이 비어 있으면 기본 사유 문자열로 채운다.

### 2.2 AgentTeamRun

여러 ExecutionRun을 묶는 상위 실행 단위.

```ts
interface AgentTeamRun {
  teamRunId: string;
  parentTaskId: string;
  parentPlanId: string;

  mode: TeamRunMode;                          // 'main_agent_solo'|'main_agent_with_subagents'|'multi_main_agent_sequential'|'multi_main_agent_parallel'
  workPackages: MainAgentWorkPackage[];

  executionRuns: Array<{
    runId: string;
    packageId: string;
    mainAgent: MainAgent;
    status: string;
  }>;

  dependencyGraph: Array<{
    fromPackageId: string;
    toPackageId: string;
    type: DependencyEdgeType;                 // 'blocks'|'informs'|'verifies'|'merges_after'
  }>;

  conflictPolicy: ConflictPolicy;             // 'fail_on_overlap'|'ordered_merge'|'manual_review'
  status: TeamRunStatus;                      // 'planned'|'running'|'partial'|'verifying'|'passed'|'failed'|'needs_human_review'
  finalResultPacket?: TeamResultPacket;
}
```

### 2.3 TeamResultPacket

각 메인 에이전트 결과를 CTO가 회수할 때 쓰는 표준 결과.

```ts
interface TeamResultPacket {
  teamRunId: string;
  parentTaskId: string;

  status: 'passed' | 'partial' | 'failed' | 'blocked' | 'needs_human_review';

  packageResults: Array<{
    packageId: string;
    mainAgent: MainAgent;
    status: string;
    summary: string;
    changedFiles: string[];
    checks: Record<string, string>;
    risks: string[];
    recommendation: PackageRecommendation;    // 'merge_ready'|'retry'|'human_review'|'discard'|'split_task'
  }>;

  conflicts: Array<{
    files: string[];
    packages: string[];
    reason: string;
    resolution: 'none' | 'ordered_merge' | 'manual_review' | 'discard_one';
  }>;

  finalChecks: {
    typecheck?: string; build?: string; test?: string; playwright?: string; boundary?: string;
  };

  finalRecommendation: FinalTeamRecommendation; // 'merge_ready'|'retry_failed_package'|'manual_review'|'split_again'|'discard_team_result'
  nextAction: string;
}
```

---

## 3. Router 함수 사용법 (`cto-harness/team-router.ts`)

모든 함수는 순수·결정적이다. I/O·네트워크·git 실행 없음.

### 3.1 `selectMainAgent(domains)`

도메인 집합 → 메인 에이전트 매핑. **분기 우선순위가 코드에 고정돼 있다.**

```ts
function selectMainAgent(domains: WorkPackageDomain[]): MainAgent
```

| 조건 | 결과 |
|---|---|
| `domains`에 `'ui'` 포함 | `antigravity` |
| `domains`가 비어있지 않고 전부 `'test'` | `codex` |
| 그 외 (`api`/`db`/`runner`/`harness`/`docs` 등) | `claude-code` (기본 구현자) |

주의: ui가 포함되면 다른 도메인이 섞여 있어도 antigravity가 우선이다. codex는 도메인이 `test` **하나뿐**일 때만 선택된다 (`every(d => d === 'test')`).

### 3.2 `selectInternalOrchestrationMode(complexity, opts?)`

복잡도 → 내부 오케스트레이션 모드. C0~C5 guardrail이 여기에 박혀 있다.

```ts
function selectInternalOrchestrationMode(
  c: Complexity,
  opts?: { distinctFileScopes?: number; reason?: string },
): InternalExecutionMode
```

| Complexity | 결과 |
|---|---|
| C0, C1 | `solo` (내부 팀 금지) |
| C2 | `solo_with_subagents` (sub-agent까지만) |
| C3, C4 | `internal_sequential_team` |
| C5 | `distinctFileScopes > 1` 이면 `internal_parallel_team`, 아니면 `internal_sequential_team` |

C5 병렬은 **서로 다른 파일 스코프가 2개 이상일 때만** 허용된다 (파일 범위 겹침 금지).

### 3.3 `recommendedInternalRoles(agent, mode)`

메인 에이전트 + 모드 → 내부 권장 역할 목록. `mode === 'solo'`면 빈 배열을 반환한다 (solo는 역할 분화 없음).

```ts
function recommendedInternalRoles(agent: MainAgent, mode: InternalExecutionMode): string[]
```

| Agent | 역할 (solo가 아닐 때) |
|---|---|
| `claude-code` | Context Scout, Architect, Implementer, Self Verifier, Handoff Writer |
| `codex` | Spec Checker, Test Reviewer, Risk Reviewer, Regression Analyst, Verdict Writer |
| `antigravity` | UI Flow Reviewer, Visual QA, Playwright Scout, Locator Reviewer, UX Verdict Writer |

### 3.4 `canParallelize(a, b, opts?)`

두 작업이 병렬 실행 가능한지 판단 (PRD §9). 결과는 `{ ok, reason? }`.

```ts
function canParallelize(
  a: { allowedFiles: string[] },
  b: { allowedFiles: string[] },
  opts?: { touchesDb?: boolean; touchesAuth?: boolean; touchesDeps?: boolean },
): { ok: boolean; reason?: string }
```

병렬 **금지** 조건 (`ok: false`):
- `touchesDb` → DB 스키마/마이그레이션은 공유 상태
- `touchesAuth` → 인증 경로 공유 위험
- `touchesDeps` → lockfile 충돌 위험
- `a`/`b`의 `allowedFiles` 디렉토리 prefix가 겹칠 가능성이 있음 (상위/하위 포함 관계). 빈 prefix는 전체 범위 → 항상 겹침으로 본다.

위 어디에도 안 걸리면 `{ ok: true }`.

### 3.5 `decomposeLargePRDToPackages(input)`

대형 PRD를 메인 에이전트별 Work Package 배열로 분해 (각 feature → 1개 패키지).

```ts
function decomposeLargePRDToPackages(input: {
  parentTaskId: string;
  parentPlanId: string;
  features: Array<{
    objective: string;
    domains: WorkPackageDomain[];
    allowedFiles: string[];
    blockedFiles?: string[];
    complexity: Complexity;
    riskLevel?: RiskLevel;
    dependencies?: string[];
    reason?: string;
  }>;
}): MainAgentWorkPackage[]
```

내부 동작 (결정적):
1. `assignedMainAgent = selectMainAgent(feature.domains)`
2. `distinctFileScopes` = `allowedFiles`의 고유 디렉토리 prefix 개수
3. `executionMode = selectInternalOrchestrationMode(complexity, { distinctFileScopes, reason })`
4. **GUARDRAIL**: complexity가 C0/C1이면 `executionMode = 'solo'` 강제
5. `useInternalTeam = executionMode.startsWith('internal')`, `useSubAgents = executionMode !== 'solo'`
6. sub-agent/team을 쓰는데 `reason`이 비면 `복잡도 {C} 작업이라 내부 오케스트레이션({mode}) 적용`으로 채움
7. `packageId = {parentTaskId}-pkg-{index}`
8. `maxInternalSteps`: solo=1, solo_with_subagents=3, internal_sequential_team=5, internal_parallel_team=8
9. `outputContract` / `expectedOutputs`: claude-code → `patch`, codex → `review_report`, antigravity → `ui_report`
10. `requiredChecks`: 기본 `[typecheck, boundary]`; 도메인에 api/db/runner/harness/test 있으면 `test` 추가; ui 있으면 `build`+`playwright` 추가
11. `acceptanceCriteria`는 빈 배열로 생성됨 (호출자가 채워야 함), `riskLevel` 기본 `D1`

### 3.6 `buildMainAgentPrompt(pkg)` (`prompt-builder.ts`)

`MainAgentWorkPackage` → 메인 에이전트 전달용 9블록 프롬프트 문자열 (PRD §7.1). 순수 함수.

```ts
function buildMainAgentPrompt(pkg: MainAgentWorkPackage): string
```

생성되는 9블록: `1. ROLE`, `2. OBJECTIVE`, `3. SCOPE`, `4. ALLOWED FILES`, `5. BLOCKED FILES`, `6. INTERNAL AGENT TEAM INSTRUCTION`, `7. VERIFICATION REQUIREMENTS`, `8. OUTPUT CONTRACT`, `9. STOP CONDITIONS`.

동작 요점:
- ROLE 헤더는 `AGENT_ROLE_HEADERS[agent]` (export 됨).
- `executionMode === 'solo'`면 블록 6은 "Work alone, do NOT spawn sub-agents" 안내. 아니면 useSubAgents/useInternalTeam/역할/maxInternalSteps/reason + 에이전트별 팀 가이던스를 출력.
- 블록 8 OUTPUT CONTRACT는 PRD JSON 스키마(`status`/`summary`/`changedFiles`/`checks`/`risks`/`nextAction`/`handoff`)를 강제하며 마지막에 `outputContract type`을 명시.
- 블록 9 STOP CONDITIONS는 5개 고정: blockedFiles 수정 금지 / dependency 변경 금지 / env·secret 수정 금지 / production·deploy 명령 금지 / SCOPE·ALLOWED FILES 초과 금지.

---

## 4. C0~C5 Guardrail 표 (PRD §6.2 / §12)

내부 팀 사용 과잉 방지가 핵심이다. 아래 표는 `selectInternalOrchestrationMode` + `decomposeLargePRDToPackages`의 실제 동작과 일치한다.

| Complexity | 내부 오케스트레이션 | team 허용 | 비고 |
|---|---|---|---|
| C0 | `solo` | 금지 | 문서/텍스트. 내부 팀·sub-agent 금지 |
| C1 | `solo` | 금지 | 작은 코드. 내부 팀·sub-agent 금지 |
| C2 | `solo_with_subagents` | sub-agent만 | 내부 팀 금지, sub-agent까지만 |
| C3 | `internal_sequential_team` | 순차 팀 | scout→architect→implementer→verifier |
| C4 | `internal_sequential_team` | 순차 팀 | security/reviewer 역할 포함 권장 |
| C5 | `internal_parallel_team` (또는 sequential) | 병렬 팀 | **distinctFileScopes > 1일 때만 parallel**, 파일 범위 겹침 금지 |

추가 가드:
- CTO는 C0~C1 작업에 `AgentTeamRun`을 만들 수 없다.
- `internal_parallel_team`은 C5에서만 나온다.
- 각 메인 에이전트 내부 sub-agent 수는 `maxInternalSteps`로 제한된다.
- sub-agent/team 사용 시 `orchestrationHint.reason` 필수. 비면 `decompose`가 기본 사유로 자동 채움 → ACR Harness rejected 방지.

---

## 5. Claude / Codex / Antigravity 역할 분담 (PRD §3.3)

| Main Agent | 주요 강점 | 맡길 작업 | 도메인 트리거 | outputContract |
|---|---|---|---|---|
| Claude Code | 구현, 리팩터링, 파일 수정 | 실제 코드 구현, 기능 개발, 구조 변경 | 기본(ui/test-only 제외) | `patch` |
| Codex | 코드 이해, 검증, 테스트, 리뷰 | QA, 테스트 작성, diff review, 안전성 검토 | 도메인이 `test`만 | `review_report` |
| Antigravity | UI/UX, 브라우저 흐름, 시각 QA | UI 구현 검토, 화면 흐름, Playwright/UX | 도메인에 `ui` 포함 | `ui_report` |

(Hermes는 메인 에이전트가 아니다 — 감시/로그 요약/handoff 전용, 코드 수정 금지. 그래서 `MainAgent` 타입에서 제외돼 있다.)

---

## 6. 병렬 허용 / 금지 조건 (PRD §9)

병렬 **허용** (모두 만족해야 함):
- 수정 파일 범위가 명확히 다르다.
- dependency 순서가 없다.
- 같은 타입/상태 모델을 동시에 수정하지 않는다.
- 한 작업의 결과가 다른 작업의 전제 조건이 아니다.
- 충돌 시 discard 또는 ordered merge가 가능하다.

병렬 **금지** (`canParallelize`가 `ok: false`로 잡는 것):
- 같은 파일 수정 가능성이 높음 (allowedFiles prefix 겹침).
- DB schema 변경 포함 (`touchesDb`).
- auth/permission 작업 (`touchesAuth`).
- runner/command 권한 변경.
- package dependency 변경 필요 (`touchesDeps`).
- UI와 API 계약이 아직 확정되지 않음.

---

## 7. 실제 적용 예시 (PRD §13)

예시 PRD: "ACR을 pulk CTO의 실행 커널로 축소하고, ExecutionRun API, Worktree Manager, Harness, Agent Team Router, Control Room UI까지 붙여줘."

CTO 1차 분해 결과 (`decomposeLargePRDToPackages` 입력 features에 대응):

| Package | Agent | executionMode | 권장 역할 |
|---|---|---|---|
| A: ExecutionRun API | Claude Code | `internal_sequential_team` (C3) | Context Scout, Architect, Implementer, Self Verifier, Handoff Writer |
| B: Worktree Manager + Boundary Check | Claude Code | `internal_sequential_team` (C3) | (위와 동일) |
| C: Type/Test/Boundary Review | Codex | `solo_with_subagents` (C2, domain=test) | Spec Checker, Test Reviewer, Risk Reviewer, ... |
| D: Control Room UI | Antigravity | `solo_with_subagents` (C2, domain=ui) | UI Flow Reviewer, Visual QA, Playwright Scout, ... |
| E: Final Integration Review | Codex | `solo` (C1) | (없음 — solo) |

병렬 가능 여부 (`canParallelize`):
- A와 D는 API 계약 확정 전에는 병렬 금지 (계약 미확정).
- A와 B는 순차 (`dependencyGraph`에서 B가 A 이후).
- C는 A/B 완료 후 검증 (`verifies` 엣지).
- D는 A API mock이 있으면 병렬 가능.
- E는 전체 후 최종 검증.

ACR Harness는 각 package를 별도 ExecutionRun으로 만들고, 결과를 `TeamResultPacket`으로 묶어 pulk CTO에 반환한다.

---

## 8. import 경로

```ts
import {
  // types
  MainAgentWorkPackage, AgentTeamRun, TeamResultPacket,
  MainAgent, WorkPackageDomain, InternalExecutionMode, OutputContract,
  // router
  selectMainAgent,
  selectInternalOrchestrationMode,
  recommendedInternalRoles,
  canParallelize,
  decomposeLargePRDToPackages,
  // prompt
  buildMainAgentPrompt, AGENT_ROLE_HEADERS,
  // complexity (보조)
  classifyComplexity, complexityToHarnessMode,
} from '@l5/core/functions/cto-harness'; // 실제 배럴: packages/l5-core/src/functions/cto-harness/index.ts
```

모든 export는 `cto-harness/index.ts`가 재노출한다.

---

## 9. 구현 범위 / 미구현

구현됨 (순수 판단 로직):
- 타입 3종 (`MainAgentWorkPackage` / `AgentTeamRun` / `TeamResultPacket`) + 부속 enum
- Router: `selectMainAgent`, `selectInternalOrchestrationMode`, `recommendedInternalRoles`, `canParallelize`, `decomposeLargePRDToPackages`
- Prompt: `buildMainAgentPrompt`
- 각 함수 단위 테스트 (`cto-harness/__tests__/`)

미구현 (PRD §15 Phase A4~A5, 의도적 보류):
- 실제 병렬 ExecutionRun 실행
- `POST /api/team-runs` (ACR Kernel 측, 별도 저장소)
- TeamRun → multiple ExecutionRun 생성 / dependency 순서 반영
- Result Aggregator의 실 ExecutionRun 결과 수집·conflict detection (현재 `result-aggregator.ts`는 판단 헬퍼만)

원칙 재확인: ACR을 다시 planning brain으로 만들지 않는다. pulk CTO가 분해/배정, ACR Harness가 실행 안전장치다.
