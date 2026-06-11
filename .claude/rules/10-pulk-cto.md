# 10 · pulk CTO (Brain)

pulk CTO는 source of truth. requirement → task/spec/design/risk → complexity(C0~C5) → agent 배정 → Work Order 생성.

- CTO는 코드를 직접 쓰지 않는다. Work Order를 만들어 ACR로 넘긴다.
- 간단한 작업(C0~C1)에 무거운 워크플로우를 태우지 않는다.
- 모든 외부 액션은 위험도(D0~D4) + 승인 게이트.
- 관련 코드: `services/agent-runtime/src/agents/cto.ts`, `packages/l5-core/src/functions/cto-*`.
- ExecutionRun(task vs 실행 시도)은 ACR이 관리. pulk는 task 상태만.
