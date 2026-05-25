# @l5/plugin-workflow-factory

워크플로우 생성 인터페이스 (P1 Essential).

## 책임

- 사업 목표로부터 워크플로우 및 스텝 초안 생성
- 워크플로우 편집/승인
- 생성된 워크플로우를 Agent Staffing / Hermes로 연결

## L5 Core 연동

- 워크플로우 생성 함수 (docs/WORKFLOW_FACTORY_SPEC.md 참고, l5-core에서 제공 예정)

## Collections

- `workflow`
- `workflow_step`

## 상태

Scaffold only. 도메인 로직은 `@l5/core`, NocoBase 호출은 미구현 (TODO).
