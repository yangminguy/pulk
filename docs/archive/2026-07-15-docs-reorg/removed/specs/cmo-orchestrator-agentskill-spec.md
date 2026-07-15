# Spec: CMO Orchestrator & AgentSkill 인터페이스 설계

> Phase 1 — 인터페이스 정의 + 레지스트리 + CMO Supervisor 배선
> 채택 프레임워크: **Mastra** (현행 스택 확장, 신규 의존성 없음)

## 1. 배경 및 문제

### 현재 상태
- `runCMOAgent()` (`services/agent-runtime/src/agents/cmo.ts`): 단일 프롬프트 → JSON. 스킬 분해 없음.
- `cmoHandler()` (`packages/l5-core/.../handlers/cmo-handler.ts`): 하드코딩된 PMF experiment 응답. 동적 스킬 호출 불가.
- `ExecutiveTool` + `ToolRegistry` (`packages/l5-core/.../tools/`): role-based 필터링 존재하나, CMO 전용 스킬 미등록.
- Video Room CMO는 `CmoStrategyTurnResult`를 반환하는 대화 엔진이지만, 하위 스킬(리서치, 스크립트, SEO 등)을 개별 호출하는 구조 없음.

### 목표
CMO가 복수의 마케팅 스킬을 **동적으로 선택·호출**할 수 있는 오케스트레이터 레이어를 만든다. 이를 위해:
1. **AgentSkill** 인터페이스를 정의한다 (ExecutiveTool과 호환, 마케팅 도메인 특화).
2. **SkillRegistry**를 구현한다 (기존 ToolRegistry 패턴 확장).
3. **CMO Orchestrator**를 구현한다 (supervisor 패턴으로 스킬 선택·실행·결과 조합).

## 2. 설계 원칙

1. **l5-core에 도메인 로직** — UI 플러그인에 하드코딩 금지.
2. **ExecutiveTool 호환** — AgentSkill은 ExecutiveTool을 확장. 기존 ToolRegistry에도 등록 가능.
3. **Mastra 네이티브** — `createTool()` + Zod 스키마와 1:1 매핑 가능한 구조.
4. **NocoBase 독립** — l5-core만으로 테스트 가능.
5. **점진적 확장** — Phase 1은 인터페이스 + 2개 스킬 PoC. 이후 스킬 추가는 인터페이스 변경 없이 가능.

## 3. AgentSkill 인터페이스

### 위치
`packages/l5-core/src/functions/cmo-orchestrator/types.ts`

### 정의

```typescript
import type { ExecutiveTool, ToolResult } from '../executive-runtime/tools/types';
import type { AgentRole } from '../../types/orchestration';
import type { RiskLevel } from '../../types/entities';

/** 스킬 카테고리 — CMO 도메인 범위 */
export type SkillCategory =
  | 'research'       // 시장조사, VOC, 경쟁분석
  | 'content'        // 스크립트, 블로그, 소셜
  | 'positioning'    // 메시지, USP, 타겟 세그먼트
  | 'experiment'     // A/B 테스트, PMF 실험 설계
  | 'analysis';      // 성과 분석, 인사이트 추출

/** AgentSkill — ExecutiveTool 확장, 마케팅 도메인 메타데이터 추가 */
export interface AgentSkill extends ExecutiveTool {
  /** 스킬 고유 ID (e.g. "cmo.research.market") */
  skill_id: string;
  /** 도메인 카테고리 */
  category: SkillCategory;
  /** 이 스킬이 의존하는 다른 스킬 ID 목록 (순서 보장용) */
  depends_on: string[];
  /** 스킬 실행의 기본 위험도 */
  default_risk: RiskLevel;
  /** 예상 실행 시간 힌트 (ms) — 오케스트레이터 스케줄링용 */
  estimated_duration_ms?: number;
}

/** 스킬 실행 결과 — ToolResult 확장 */
export interface SkillResult extends ToolResult {
  skill_id: string;
  /** 후속 스킬 추천 (오케스트레이터가 참고) */
  suggested_next?: string[];
  /** 인사이트 — Second Brain에 기록할 내용 */
  insight?: string;
}

/** 오케스트레이터가 스킬을 호출할 때 전달하는 컨텍스트 */
export interface SkillExecutionContext {
  role: AgentRole;
  task_id: string;
  /** 이전 스킬 결과 체인 (의존성 해소용) */
  prior_results: Map<string, SkillResult>;
  /** Video Room 상태 (해당 시) */
  video_room_status?: string;
}
```

### ExecutiveTool 호환성 매핑

| AgentSkill 필드 | ExecutiveTool 필드 | 관계 |
|---|---|---|
| `skill_id` | `name` | `skill_id`를 `name`으로 사용 |
| `category` | — | 신규 (메타데이터) |
| `depends_on` | — | 신규 (의존성 그래프) |
| `default_risk` | — | 신규 (위험도 힌트) |
| `description` | `description` | 동일 |
| `parameters` | `parameters` | 동일 |
| `allowed_roles` | `allowed_roles` | 동일 (CMO 기본) |
| `permission` | `permission` | 동일 |
| `run()` | `run()` | 시그니처 호환 |

## 4. SkillRegistry

### 위치
`packages/l5-core/src/functions/cmo-orchestrator/skill-registry.ts`

### 책임
- 스킬 등록/조회 (기존 `ToolRegistry` 패턴)
- 카테고리별 필터링
- 의존성 그래프 검증 (순환 참조 탐지)
- `ToolRegistry`에 동시 등록 가능 (ExecutiveTool 호환이므로)

### API

```typescript
export class SkillRegistry {
  register(skill: AgentSkill): void;
  get(skillId: string): AgentSkill | undefined;
  byCategory(category: SkillCategory): AgentSkill[];
  all(): AgentSkill[];
  /** 의존성 순서대로 정렬된 실행 계획 반환 */
  resolveDependencies(skillIds: string[]): string[];
}

export function createSkillRegistry(skills?: AgentSkill[]): SkillRegistry;
```

## 5. CMO Orchestrator

### 위치
`packages/l5-core/src/functions/cmo-orchestrator/orchestrator.ts`

### 책임
1. 태스크를 받아 필요한 스킬 세트를 결정한다 (LLM 기반 또는 규칙 기반).
2. 의존성 순서대로 스킬을 실행한다.
3. 결과를 조합하여 `HandlerResult` 형태로 반환한다.
4. 실행 중 위험도가 D3 이상이면 승인 게이트를 삽입한다.

### API

```typescript
export interface OrchestratorConfig {
  registry: SkillRegistry;
  /** 스킬 선택 전략: 'rule' = 규칙 기반, 'llm' = LLM 결정 */
  selection_strategy: 'rule' | 'llm';
}

export interface OrchestratorInput {
  task: AgentTask;
  context?: Record<string, unknown>;
}

export interface OrchestratorResult {
  /** 실행된 스킬과 결과 */
  skill_results: SkillResult[];
  /** 조합된 최종 결과 */
  handler_result: HandlerResult;
  /** 실행되지 않은 스킬 (승인 대기 등) */
  pending_skills: string[];
}

export class CmoOrchestrator {
  constructor(config: OrchestratorConfig);
  execute(input: OrchestratorInput): Promise<OrchestratorResult>;
}
```

### 스킬 선택 흐름 (Phase 1: `rule` 전략)

```
태스크 수신
  → task.title + task.expected_output 키워드 매칭
  → 매칭된 카테고리의 스킬 후보 추출
  → depends_on 기반 실행 순서 결정
  → 순차 실행 (Phase 1은 병렬 불필요)
  → 결과 조합 → HandlerResult
```

## 6. Phase 1 PoC 스킬 (2개)

| skill_id | category | 설명 | depends_on |
|---|---|---|---|
| `cmo.research.market` | research | 시장 조사 팩 생성 (MarketResearchPack) | `[]` |
| `cmo.positioning.message` | positioning | PMF 메시지 + 포지셔닝 변형 2개 생성 | `["cmo.research.market"]` |

## 7. 영향 받는 파일 및 모듈

### 신규 생성

| 파일 | 설명 |
|---|---|
| `packages/l5-core/src/functions/cmo-orchestrator/types.ts` | AgentSkill, SkillResult, SkillExecutionContext |
| `packages/l5-core/src/functions/cmo-orchestrator/skill-registry.ts` | SkillRegistry 클래스 |
| `packages/l5-core/src/functions/cmo-orchestrator/orchestrator.ts` | CmoOrchestrator 클래스 |
| `packages/l5-core/src/functions/cmo-orchestrator/skills/market-research.ts` | PoC 스킬 1 |
| `packages/l5-core/src/functions/cmo-orchestrator/skills/positioning-message.ts` | PoC 스킬 2 |
| `packages/l5-core/src/functions/cmo-orchestrator/__tests__/skill-registry.test.ts` | 레지스트리 단위 테스트 |
| `packages/l5-core/src/functions/cmo-orchestrator/__tests__/orchestrator.test.ts` | 오케스트레이터 단위 테스트 |
| `packages/l5-core/src/functions/cmo-orchestrator/index.ts` | 모듈 barrel export |

### 기존 수정

| 파일 | 변경 내용 |
|---|---|
| `packages/l5-core/src/functions/executive-runtime/handlers/cmo-handler.ts` | 하드코딩 → `CmoOrchestrator.execute()` 위임 |
| `packages/l5-core/src/index.ts` (또는 barrel) | cmo-orchestrator 모듈 re-export |

### 수정하지 않는 파일
- `services/agent-runtime/src/agents/cmo.ts` — Phase 1 범위 밖 (Mastra agent-as-tool 전환은 Phase 2)
- `apps/founder-ui/` — UI 변경 없음
- Video Room 타입/로직 — 기존 인터페이스 유지

## 8. Acceptance Criteria

| # | 기준 | 측정 방법 |
|---|---|---|
| AC-1 | `AgentSkill` 인터페이스가 `ExecutiveTool`을 extends하고, `skill_id`, `category`, `depends_on`, `default_risk` 필드를 포함한다 | `tsc --noEmit` 통과 + 타입 테스트 |
| AC-2 | `SkillRegistry`가 등록·조회·카테고리 필터·의존성 해소를 지원하고, 순환 참조 시 에러를 던진다 | `pnpm test` — 단위 테스트 5개 이상 통과 |
| AC-3 | `CmoOrchestrator.execute()`가 `OrchestratorInput`을 받아 `OrchestratorResult`를 반환한다 | 단위 테스트: PoC 스킬 2개 순차 실행 성공 |
| AC-4 | `cmo-handler.ts`가 `CmoOrchestrator`로 위임하고, 기존 `HandlerResult` 시그니처를 유지한다 | `pnpm typecheck` 통과 |
| AC-5 | PoC 스킬 2개(`cmo.research.market`, `cmo.positioning.message`)가 `AgentSkill` 인터페이스를 구현하고 레지스트리에 등록된다 | 단위 테스트: 스킬 등록 + 실행 성공 |
| AC-6 | l5-core가 NocoBase 없이 독립 테스트 가능하다 | `pnpm --filter l5-core test` 통과 |
| AC-7 | `pnpm typecheck && pnpm build` 전체 통과 | CI 검증 |

## 9. 범위 밖 (Phase 2+)

- Mastra `createTool()`/`createAgent()` 기반 런타임 전환
- LLM 기반 스킬 선택 (`selection_strategy: 'llm'`)
- 병렬 스킬 실행
- Video Room과 Orchestrator 직접 연동
- 스킬 실행 결과 → Langfuse 트레이싱
- Hermes(Trigger.dev) 스케줄 연동
