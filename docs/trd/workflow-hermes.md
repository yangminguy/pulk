# TRD 하위 — 스케줄/워크플로우 팩토리

> [TRD.md](../TRD.md)로 돌아가기.

## Hermes (운영 신경계)

`services/hermes-runtime`에 위치. 문서상 Trigger.dev 기반으로 설계됐으나 실제로는 Trigger.dev SDK 의존성이 없고, launchd(macOS 상시 실행) + cron 문자열로 동작한다 (`trigger-schedules.ts` 주석: "Wire a dedicated Trigger.dev task if needed" — 아직 미적용). 61개 소스 파일, 8600+ LOC로 services 중 가장 크고 활발하다.

주요 스케줄 작업:
- morning-operating-loop / night-bpr-loop
- stalled-workflow-detector (24h/72h 임계)
- pmf-deadline-checker
- founder-approval-checker
- tool-request-candidate-detector (2회 이상 반복 + 회당 20분 이상 소요 시 후보 등록)
- memory-update-suggestion-generator

## Workflow Factory

```
아이디어 → Founder DNA 필터(7개 Fit: Founder/Interest/Skill/Energy/Brand/Risk/Long-term Asset)
→ Memory 검색 → PMF 실험 설계 → Agent 스태핑
→ 워크플로우 생성(Revenue/Marketing/Sales/Delivery/BPR/Tool Request)
→ Kill/Scale 기준 판정
```

규칙: PMF Experiment는 항상 Tool Request보다 먼저 만든다. Tool Request는 반복 작업이거나 강한 수요 신호가 있어야 발생한다.

## BPR(사업 진행 단계) 6단계

1. Direction Alignment
2. PMF Diagnosis (PMF ≥ 0.6 필요)
3. Execution Build
4. Sales/Distribution Test (LTV/CAC 기준)
5. Productization Review
6. Scale/Automation

## 실제 운영중인 스케줄 서비스 상태

| 서비스 | 상태 | 비고 |
|---|---|---|
| `hermes-runtime` | 상시 launchd 실행 | 22 커밋, 최근 활동 |
| `services/cmo-insight-loop` | **휴면** | 2026-06-12 1회 실행 후 등록된 스케줄(Routine) 없음. 재등록 필요 — [TASK.md](../TASK.md) |
| `telegram-gateway` | 상시 launchd 실행 | 안정화 단계, 변경 적음 |
| `slack-gateway` | 상시 실행, 개발중 | research-engine 연동 진행중 |

## 관련 문서

- 오케스트레이션 실행: [orchestration.md](./orchestration.md)
- 에이전트 역할/권한: [agent-protocol.md](./agent-protocol.md)
