# @l5/plugin-pmf-experiment

PMF 실험 계획 및 점수화 (P0 Core MVP).

## 책임

- PMF 실험 설계/실행 추적
- 실험 지표 입력 및 PMF 점수 계산
- Tool Candidate 신호 판정 (도구는 PMF 신호 이후에만 만든다)

## L5 Core 연동

- `calculatePmfScore` — 지표로부터 PMF 점수
- `isToolCandidate` — PMF 점수 기반 도구화 후보 판정

## Collections

- `pmf_experiment`
- `pmf_experiment_metric`

## 상태

Scaffold only. 도메인 로직은 `@l5/core`, NocoBase 호출은 미구현 (TODO).
