# @l5/plugin-tool-request

도구 요청 평가 랩 (P1 Essential).

## 책임

- 도구 요청 접수 및 도구화 후보 평가
- 빌드 공수 추정 및 우선순위
- 게이트: PMF 신호가 존재할 때만 도구 빌드 승인

## L5 Core 연동

- `decideToolCandidate` — 도구화 후보 판정
- `estimateToolBuildingEffort` — 빌드 공수 추정

## Collections

- `tool_request`

## 상태

Scaffold only. 도메인 로직은 `@l5/core`, NocoBase 호출은 미구현 (TODO).
