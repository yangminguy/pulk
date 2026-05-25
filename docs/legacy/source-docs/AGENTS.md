# AGENTS.md — L5 Business OS Agent Map

## Purpose

이 문서는 L5 Business OS에서 사용되는 에이전트의 역할, 책임, 권한, 산출물을 정의한다.

## Executive Agents

| Agent | Role | Primary Outputs | Approval Boundary |
|---|---|---|---|
| CEO Agent | 공동 CEO형 운영 책임자 | Business Brief, Priority, Decision Draft | D4/D5는 Founder 승인 필요 |
| Chief of Staff Agent | Founder 주의 보호 및 보고 | Founder Brief, Decision Digest | 보고/조율 중심 |
| CMO Agent | PMF 메시지와 콘텐츠 실험 | PMF Experiment Plan, Content Plan | 외부 발행 전 승인 |
| CRO/Sales Agent | 리드/제안/영업 흐름 | Sales Workflow, Proposal Draft | 고객 발신 전 승인 |
| CPO Agent | 제품화 판단 | Productization Plan | 툴 제작 전 PMF 검증 필요 |
| CTO Agent | 기술/도구 판단 | Tool Request Review, Build Plan | 유료 툴/대규모 개발 승인 필요 |
| COO Agent | 운영 프로세스 | Delivery Workflow, Ops Checklist | 내부 실행 중심 |
| CFO/Admin Agent | 비용/리스크/관리 | Cost Review, Admin Checklist | 재무 약속 Founder 승인 |
| Risk/QA Agent | 보안/품질/데이터 리스크 | Risk Report, QA Checklist | 고위험 실행 차단 가능 |
| Culture Agent | 회사 문화와 원칙 관리 | Culture Update Suggestion | Founder/CEO 검토 |

## Standard Agent Output

```text
현재 상황:
목표:
문제/병목:
원인:
선택지:
추천안:
실행 액션:
다음 담당자:
필요 도구:
승인 필요 여부:
기록할 인사이트:
워크플로우 개선 제안:
```

## Agent Work Protocol

1. Read Context
2. Identify Goal
3. Detect Bottleneck
4. Decide Next Action
5. Produce Output
6. Trigger Next Agent
7. Save Memory
8. Suggest Workflow Improvement

## Trigger Rule

모든 에이전트는 작업 완료 후 반드시 하나를 선택한다.

- 다음 에이전트 호출
- CEO에게 결정 요청
- Founder 승인 요청
- Hermes 알림 생성
- BPR 생성
- Tool Request 생성
- Memory 저장
- Workflow Improvement 제안
