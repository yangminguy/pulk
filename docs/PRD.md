# PRD — 제품 요구사항

> 문서 구조는 [ARCHITECTURE.md](./ARCHITECTURE.md) 참고. 기술 구조는 [TRD.md](./TRD.md).

## 제품 정의

**L5 Business OS**는 Founder(창업자)가 채팅으로 CEO Agent와 방향을 잡으면, CEO Agent가 임원 Agent들에게 과제를 분배해 병렬로 실행하고, Founder는 진행상황과 승인만 하면 되는 AI 회사 운영체계다. NocoBase는 최종 사용자 화면이 아니라 내부 운영 DB/승인큐/감사로그용 shell이며, 실제 Founder UX는 별도 콘솔(`founder-ui`, `bizpt-manager`)이 담당한다.

MVP 목표는 완전 자율 회사가 아니라, **반자동으로 운영 가능한 내부 콘솔 + 핵심 도메인 로직**을 만드는 것이다.

## 풀어야 할 문제

1. 창업자의 지시가 실행 가능한 과제로 안정적으로 분해되지 않는다.
2. 에이전트가 무엇을 하고 있는지 가시성이 없다.
3. 여러 에이전트가 병렬로 움직일 때 상태·핸드오프가 추적되지 않는다.
4. 매번 프롬프트를 수동으로 새로 짜야 한다.
5. PMF(제품시장적합성) 신호가 검증되기 전에 툴부터 만든다.
6. 실행 결과가 재사용 가능한 자산(메모리/인사이트)으로 축적되지 않는다.
7. 회사 운영 원칙이 코드/문서에 명시돼 있지 않다.
8. 고객 데이터와 재사용 가능한 인사이트가 거버넌스 없이 섞인다.

## 운영 루프

```
Founder Chat → CEO 해석 → Workstream/Task 분해 → 임원 병렬실행
→ Handoff/로깅 → Hermes 모니터링 → 승인큐 → BPR/메모리 업데이트 → 워크플로우 진화
```

## 타깃 유저

1인 창업가 또는 소규모 팀 운영자. 여러 사업 아이디어를 빠르게 실험하면서, 실행은 위임하고 본인은 방향 결정과 승인에만 집중하고 싶은 사람.

## 핵심 원칙

1. 사업(Business)보다 워크플로우가 우선이다 — 워크플로우가 검증되어야 사업이 는다.
2. No Demand, No Tool — 반복 수요/강한 신호 없이 툴을 먼저 만들지 않는다.
3. Founder는 방향과 판단만 한다. 실행은 Agent가 한다.
4. CEO Agent는 공동 CEO다. 단순 비서가 아니다.
5. 모든 실행 결과는 Memory와 BPR(사업 진행 단계)로 축적된다.
6. 고객 PII와 재사용 가능한 Business Insight는 반드시 분리한다.
7. 핵심 판단 로직(`packages/l5-core`)은 NocoBase 없이 테스트 가능해야 한다.
8. Founder UX는 chat-first. NocoBase 어드민 UI는 Agent의 작업장이다.
9. 모든 Agent 작업은 원본 지시(source_instruction)와 연결되어 있어야 한다.

## MVP 기능 (13개 도메인)

Founder Chat / CEO Orchestrator / Executive Monitor / Agent Task Board / BPR Phase Manager / Workflow Factory / Founder DNA Room / PMF Experiment Board / Hermes Control Room / BPR Engine Room / Tool Request Lab / Memory Room / Business Portfolio Board(10단계 상태: Idea→Scoring→PMF→Active→Tool Candidate→Revenue Test→Productization→Scaling→Paused→Killed)

## 지금 실제로 돌아가는 제품 — CMO 콘텐츠 파이프라인

MVP 13개 도메인 중 가장 구체적으로 구현되어 실사용 중인 것은 **유튜브 콘텐츠 마케팅 자동화(CMO Video Room)**다.

Founder가 상품/타깃을 입력하면, 키 콘텐츠 기획 → 풀링(발굴) 콘텐츠 기획 → 콘텐츠 제작(제목/썸네일/원고) → 영상 제작(녹음/렌더링/QA) → 업로드 → 성과 재학습까지를 반자동으로 운영한다. 전체 흐름과 승인 게이트는 [USER_FLOW.md](./USER_FLOW.md) 참고. 운영 콘솔 화면은 [SCREEN.md](./SCREEN.md) 참고.

## 범위에서 제외하는 것

- 복잡한 범용 admin UI를 직접 만드는 것 (NocoBase 어드민을 그대로 shell로 사용)
- 완전 자동 외부 실행 (결제/계약 등은 사람 승인 필수)
- 유료 SaaS에 대한 필수 의존
- PMF 검증 전 대규모 툴 제작

## 성공 지표

1. 지시가 목표/phase/workstream/task로 분해된다.
2. 모든 task가 source_instruction과 rationale을 갖는다.
3. 병렬 실행 상태가 화면에서 실시간으로 보인다.
4. 에이전트 간 handoff가 기록된다.
5. 승인 대기 항목이 승인큐에 노출된다.
6. PMF 실험 계획이 Tool Request보다 항상 선행한다.
7. BPR(사업 단계) 전이가 로그로 남는다.
8. Memory(재사용 인사이트)가 저장된다.
9. 고객 PII와 Business Insight가 분리되어 있다.
10. `packages/l5-core`가 NocoBase 없이 단독 테스트 가능하다.

## 관련 문서

- 기술 구조: [TRD.md](./TRD.md)
- 데이터 모델: [DB_DESIGN.md](./DB_DESIGN.md)
- 현재 작업: [TASK.md](./TASK.md)
