# TRD 하위 — 에이전트 프로토콜

> [TRD.md](../TRD.md)로 돌아가기.

## 자율성 5단계

| 레벨 | 이름 | 의미 |
|---|---|---|
| L1 | Suggest | 제안만, 실행 없음 |
| L2 | Draft | 초안 작성, 사람이 최종화 |
| L3 | Internal Execute | 내부 실행, 승인 불필요 |
| L4 | External Execute with Approval | 외부 실행, 승인 필요 |
| L5 | Autonomous Loop | 완전 자율 루프 |

## 위험도 D1~D5

| 등급 | 의미 | 승인 |
|---|---|---|
| D1 | 내부 초안 | 자동 |
| D2 | 내부 실행 | 자동 + 로그 |
| D3 | 저위험 외부 초안 | 발송 전 승인, 24h 후 자동발송 가능 |
| D4 | 고객 대면 | Founder 명시 승인 필수 |
| D5 | 법적/재무 | Founder + RiskQA 이중 승인 |

## 표준 Agent 작업 프로토콜 (10단계)

Read Context → Link Source → Identify Goal → Detect Bottleneck → Decide Next Action → Produce Output → Update Status → Trigger Handoff → Save Memory → Suggest Improvement

## AgentOutput 표준 계약

`packages/l5-core/src/functions/executive-runtime/protocol.ts` 기준:

```
current_situation, source_instruction, goal, why_now, bottleneck, root_cause,
options, recommendation, action_items, next_owner, required_tools,
confidence_level, risk_level, approval_required,
insight_to_record, workflow_improvement_suggestion
```

## 임원 Agent 역할·권한

| Agent | 역할 | 산출물 | 승인 경계 |
|---|---|---|---|
| CEO | 공동 CEO, 전략 결정 | Business Brief, Decision Draft | D4/D5는 Founder 승인 |
| Chief of Staff | Founder 주의 보호/보고 | Founder Brief, Decision Digest | 보고/조율만, 승인권한 없음 |
| CMO | PMF 메시지·콘텐츠 실험 | PMF Experiment Plan, Content Plan | D3, 외부 발송 전 승인 |
| CRO | 리드/제안/영업 | Sales Workflow, Proposal Draft | D4, 고객 대면 승인 필요 |
| CPO | 제품화 판단 | Productization Plan | PMF ≥ 0.6 필수 |
| CTO | 기술/툴 판단 | Tool Request Review, Build Plan | D2, PMF 반복신호 >3회/주 있어야 빌드 승인 |
| COO | 운영 프로세스 | Delivery Workflow, Ops Checklist | D2, 내부 프로세스 |
| CFO | 비용/리스크/관리 | Cost Review | D5, 모든 재무 약속 Founder 승인 필수 |
| RiskQA | 보안/품질/데이터 리스크 | Risk Report, QA Checklist | D3-D5 block 가능, override authority |

전체 10종 Agent 맵(문서/도구 포함)은 루트 [AGENTS.md](../../AGENTS.md) 참고.

## 게이트웨이별 진입 경로

- Slack: 채널별 `@CEO`/`@CMO`/`@CTO` 멘션 → 헤드리스 claude 서브에이전트 실행 → 스레드 회신 (`services/slack-gateway`)
- Telegram: `@executive` 명령 → 서브에이전트 라우팅 → 결과/파일 응답 (`services/telegram-gateway`)
- Chat(founder-ui `/chat`): 지시 제출 → CTO 플랜 승인/거절

## 관련 문서

- 오케스트레이션 실행 방식: [orchestration.md](./orchestration.md)
- 보안/PII: [data-governance.md](./data-governance.md)
