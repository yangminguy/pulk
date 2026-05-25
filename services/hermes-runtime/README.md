# @l5/hermes-runtime

L5 Business OS의 Hermes 런타임. [Trigger.dev](https://trigger.dev) 기반으로 회사 운영 리듬을 만드는 스케줄/트리거 루프를 실행한다.

## 상태

현재는 **scaffold 단계**다. 모든 loop는 `skipped` 결과를 반환하며, 실제 로직은 각 파일의 `TODO` 위치에 Trigger.dev 통합으로 채운다.

## 구조

```text
src/
  index.ts                       # public exports
  loops/
    types.ts                     # 공통 LoopContext / LoopResult
    morning-operating-loop.ts    # 아침 운영 시작: 우선순위 설정, 에이전트 큐잉
    night-bpr-loop.ts            # 야간 BPR: 결과 집계, BPR 계산, 인사이트 기록
    stalled-workflow-detector.ts # 정체된 워크플로우 감지 및 플래그
    pmf-deadline-checker.ts      # PMF 실험 마감 임박 감시
    approval-required-checker.ts # 승인 게이트 대기 액션 노출
```

## 규칙

- 판단 로직은 `@l5/core`, 에이전트 실행은 `@l5/agent-runtime`에 위임한다. Hermes는 스케줄링과 조율만 한다.
- 승인 게이트가 필요한 액션은 자동 실행하지 않고 Founder 승인을 거친다.
- 고객 대상 외부 메시지는 승인 없이 자동화하지 않는다.

## 다음 단계

1. Trigger.dev 의존성 추가 및 각 loop를 task로 정의.
2. 스케줄(cron) 및 트리거 조건 설정.
3. `@l5/core` / `@l5/agent-runtime` 연결.
