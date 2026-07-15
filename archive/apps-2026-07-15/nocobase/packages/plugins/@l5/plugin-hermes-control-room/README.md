# @l5/plugin-hermes-control-room

알림 및 의사결정 큐 모니터링 (P1 Essential).

## 책임

- Hermes 알림 표시 및 처리
- 의사결정 큐: Founder 승인 필요 항목 관리
- 위험도(D1-D5)별 승인 게이트, 데드라인/만료 처리
- Trigger.dev Hermes runtime 연동 (services/hermes-runtime)

## L5 Core 연동

- `requiresFounderApproval` — 위험도 기반 승인 필요 여부
- `getApprovalDeadline` — 승인 데드라인 계산
- `isApprovalExpired` — 승인 만료 여부

## Collections

- `hermes_alert`
- `decision_queue`

## 상태

Scaffold only. 도메인 로직은 `@l5/core`, NocoBase 호출은 미구현 (TODO).
