# State Machine Validation Spec

> 최종 업데이트: 2026-06-04

## 문제

15+ 엔티티의 상태 전환이 플러그인(`plugin-orchestration`, `plugin-executive-monitor`)에서 raw string 쓰기(`updates.status = 'done'`)로 실행된다. l5-core에 유효 전환 정의가 없어 (1) 잘못된 전환(예: `done→running`)을 컴파일/런타임에서 잡지 못하고, (2) 새 상태 추가 시 어떤 전환이 허용되는지 추론하려면 플러그인 코드 2000+ 줄을 읽어야 한다.

## 오픈소스 조사 결론

XState(MIT, 30k+ stars), Robot(MIT, 1.8k stars), typescript-fsm(MIT, 300 stars) 비교 결과 **`build` 결정** — 외부 라이브러리 없이 자체 구현.

- XState: 풍부하나 L5 요구(lookup table + valid/invalid 판정)에 비해 과도한 의존성(statecharts, actors, visualizer).
- Robot: 경량이나 stars 부족(1.8k) + 6개월 내 활동 미흡.
- typescript-fsm: stars 300 미만, 유지보수 불확실.

**채택 패턴**: `createTransitionValidator<S extends string>` 제네릭 팩토리 + `Record<S, readonly S[]>` lookup table. 의존성 0, 테스트 용이, l5-core 순수 로직 원칙 준수.

## 요구사항

### R1. 전환 룩업 테이블 4개

각 엔티티별 유효 상태 전환을 `Record<Status, readonly Status[]>` 형태로 정의한다.

#### R1.1 AgentTask (11 edges)

소스 타입: `'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed'`

| From | To | 근거 |
|------|-----|------|
| queued | running | dispatcher가 실행 시작 |
| queued | killed | 취소 |
| running | done | 정상 완료 |
| running | needs_review | 검증 실패/승인 필요 |
| running | blocked | 의존성 대기/위임 대기 |
| running | killed | 실행 중 취소 |
| blocked | queued | 블로커 해소 |
| blocked | killed | 블록 상태에서 취소 |
| needs_review | queued | 재작업 승인 |
| needs_review | done | 수동 승인으로 완료 |
| needs_review | killed | 검토 후 폐기 |

#### R1.2 FounderInstruction (6 edges)

소스 타입: `'new' | 'interpreted' | 'in_progress' | 'needs_clarification' | 'synthesized' | 'closed'`

| From | To | 근거 |
|------|-----|------|
| new | interpreted | CEO 해석 완료 |
| new | needs_clarification | CEO가 되묻기 |
| needs_clarification | interpreted | 창업자 답변 후 재해석 |
| interpreted | in_progress | 태스크 분배 시작 |
| in_progress | synthesized | 모든 태스크 terminal → 종합 |
| in_progress | closed | 수동 종료 |

#### R1.3 ToolRequest (7 edges)

소스 타입: `'candidate' | 'proposed' | 'approved' | 'in_development' | 'deployed' | 'rejected'`

| From | To | 근거 |
|------|-----|------|
| candidate | proposed | Hermes가 후보 제안 |
| proposed | approved | 창업자 승인 |
| proposed | rejected | 창업자 거부 |
| approved | in_development | CTO 개발 시작 |
| in_development | deployed | 배포 완료 |
| in_development | rejected | 개발 중 폐기 |
| rejected | candidate | 재검토 대상 복귀 |

#### R1.4 BusinessIdea (5 edges)

소스 타입: `'idea' | 'scoring' | 'pmf_experiment' | 'killed' | 'converted_to_business'`

| From | To | 근거 |
|------|-----|------|
| idea | scoring | Founder Fit 평가 시작 |
| scoring | pmf_experiment | 실험 진입 |
| scoring | killed | 평가 탈락 |
| pmf_experiment | converted_to_business | PMF 통과 |
| pmf_experiment | killed | 실험 실패 |

### R2. 제네릭 팩토리 함수

```typescript
type TransitionResult = { valid: true; reason: string } | { valid: false; reason: string };

function createTransitionValidator<S extends string>(
  transitions: Record<S, readonly S[]>
): (from: S, to: S) => TransitionResult;
```

- 유효 전환 → `{ valid: true, reason: 'Transition is valid' }`
- 무효 전환 → `{ valid: false, reason: 'Invalid transition: <from> -> <to>' }`

### R3. 편의 함수 4개

각 엔티티별 pre-bound validator를 export:
- `validateAgentTaskTransition(from, to)`
- `validateFounderInstructionTransition(from, to)`
- `validateToolRequestTransition(from, to)`
- `validateBusinessIdeaTransition(from, to)`

### R4. re-export

`packages/l5-core/src/index.ts`에서 위 함수와 상수를 re-export.

## Acceptance Criteria

| # | 기준 | 측정 방법 |
|---|------|----------|
| AC1 | `createTransitionValidator`가 제네릭 팩토리로 동작 | 임의 lookup table로 생성한 validator가 유효/무효를 정확히 판정 |
| AC2 | 4개 lookup table의 edge 수가 스펙과 일치 | `countEdges(TABLE) === 11/6/7/5` 단언 통과 |
| AC3 | 모든 유효 전환에 대해 `valid === true` | 엔티티별 최소 2개 유효 전환 테스트 |
| AC4 | 모든 무효 전환에 대해 `valid === false` + reason 포함 | 엔티티별 최소 1개 무효 전환 테스트 (terminal→non-terminal) |
| AC5 | `pnpm --filter @l5/core test` 전체 통과 | 기존 테스트 regression 없음 + 신규 테스트 통과 |
| AC6 | `pnpm --filter @l5/core typecheck` 통과 | tsc 에러 0 |
| AC7 | `l5-core/src/index.ts`에서 re-export | import 가능 확인 |

## 영향 파일

| 파일 | 변경 유형 |
|------|----------|
| `packages/l5-core/src/functions/state-machine/transitions.ts` | **신규** — 팩토리 + 4 lookup table + 4 validator |
| `packages/l5-core/src/functions/state-machine/__tests__/transitions.test.ts` | **신규** (이전 phase에서 실패 테스트 작성 완료) |
| `packages/l5-core/src/index.ts` | **수정** — re-export 추가 |

## 영향받지 않는 파일 (이 단계에서)

- `plugin-orchestration/src/server/plugin.ts` — 기존 raw status 쓰기를 validator로 교체하는 작업은 **후속 단계**. 이 스펙은 순수 로직 모듈 생성만 다룬다.
- `plugin-executive-monitor` — 동일하게 후속.

## 설계 결정

1. **외부 라이브러리 없이 자체 구현** — XState/Robot 대비 의존성 0, L5 요구사항(유효성 판정)에 정확히 맞는 최소 구현.
2. **lookup table = Record<S, readonly S[]>** — 가장 단순한 데이터 구조. `as const`로 타입 안전.
3. **플러그인 통합은 별도 단계** — 순수 로직 먼저, 배선은 나중. l5-core 테스트 독립성 유지(CLAUDE.md 규칙 2).
