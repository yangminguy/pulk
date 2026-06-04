# 오픈소스 조사: ContentApprovalGate 모델 & 로직

> 조사일: 2026-06-04

## 요구사항 요약

| # | 요구사항 | 현재 구현 |
|---|---------|----------|
| 1 | 리스크 레벨 기반 승인 라우팅 (D1-D5) | `l5-core/functions/approval.ts` 순수 함수 |
| 2 | LLM 기반 D3 자율 판단 | `l5-core/functions/cto-decision/d3-judge.ts` |
| 3 | 시간 기반 자동 승인 (24h 타이머) | `hermes-runtime/api/approval-queue.ts` |
| 4 | 승인 큐 (approve/reject/escalate) | `hermes-runtime/tasks/approval-checker.ts` |
| 5 | Self-modification 보호 가드 | `l5-core/functions/tool-request.ts` deny-list |

## 후보 비교표

| 기준 | XState v5 (상태 머신) | Trigger.dev v4 (워크플로우 엔진) | Casbin Node (정책 엔진) |
|------|----------------------|-------------------------------|------------------------|
| **라이선스** | MIT | Apache 2.0 | Apache 2.0 |
| **TypeScript 품질** | 경계 추론 약함, v4→v5 문서 혼재 | 강함, 제약 없음 | 미흡 (정책은 별도 .conf DSL) |
| **내구성 대기 (서버 재시작 안전)** | 불가 (인프로세스) | 핵심 기능 (`wait.forToken`) | 불가 |
| **시간 기반 자동 승인** | 수동 타이머 필요 | 빌트인 timeout | 불가 |
| **LLM 판단 통합** | 어색함 (invoked actor) | 자연스러움 (async step) | 불가 |
| **승인/거절/에스컬레이션** | 수동 이벤트 버스 필요 | 빌트인 signal/token | 불가 |
| **Self-mod 보호** | 없음 | 없음 | 정책으로 가능하나 과잉 |
| **L5 스택 포함 여부** | 미포함 | **이미 채택** (Hermes Runtime) | 미포함 |
| **소규모 팀 복잡도** | 높음 (actor 모델 학습) | 낮음 (이미 채택) | 중간 (DSL 학습) |

## 채택/배제 근거

### Trigger.dev v4 — 채택 (이미 스택에 포함)

- `ARCHITECTURE.md`, `CLAUDE.md`에 Hermes Runtime으로 명시됨
- `wait.forToken({ timeout: "24h" })`가 D3 자동 승인 타이머, D4/D5 Founder 대기를 정확히 커버
- 새로운 도입이 아니라 기존 스택 활용이므로 추가 비용 없음

### XState v5 — 배제

- D1-D5 라우팅은 5단계 선형 분기이지 병렬 상태차트가 아님
- 순수 TypeScript discriminated union이 동일한 컴파일 타임 보장을 런타임 오버헤드 없이 제공
- actor 모델 학습 비용 대비 이점 없음
- 승인 흐름이 다중 병렬 분기로 복잡해지면 재검토 가능하나 현재 MVP에는 과잉

### Casbin (Node) — 배제

- Casbin은 인가(authorization) 문제를 풀지만, L5의 문제는 라우팅(routing)임
  - Casbin: "이 주체가 이 자원에 이 행위를 할 수 있는가?"
  - L5: "이 리스크 레벨과 액션 타입에 어떤 경로를 적용할 것인가?"
- Self-mod 보호도 `l5-core`의 deny-list 순수 함수로 충분하며 정책 엔진 DSL 도입은 과잉

## 추가 조사 후 즉시 탈락

| 라이브러리 | 탈락 사유 |
|-----------|----------|
| Temporal.io | Trigger.dev가 이미 채택됨 + 결정론적 replay 모델 제약 + 셀프호스팅 운영 부담 |
| Hatchet | Trigger.dev와 기능 중복, 추가 이점 없음 |
| CASL | Casbin과 동일 범주 (인가 ≠ 승인 라우팅) |
| OPA/Rego | 별도 DSL + 사이드카 프로세스, 인프로세스 5단계 라우터에 과잉 |
| Inngest | 클라우드 우선; 셀프호스팅 성숙도가 Trigger.dev v4보다 낮음 |

## 결론

**새 라이브러리 추가 불필요.** 현재 아키텍처가 최적:

- **순수 함수** (`l5-core`) → 리스크 라우팅 규칙 + self-mod 가드 + LLM 판단 스코어링
- **Trigger.dev** (`hermes-runtime`) → 내구성 대기, 타임아웃, Founder 시그널 수신

`docs/DECISIONS.md`에 "순수 함수 패턴, 워크플로우 프레임워크 미채택" 결정이 이미 기록되어 있어 기존 방향과 일치한다.
