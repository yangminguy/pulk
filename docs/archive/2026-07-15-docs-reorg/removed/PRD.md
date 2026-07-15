# PRD — L5 Business OS MVP

## Product Overview

L5 Business OS는 Founder가 채팅으로 CEO Agent와 방향을 잡으면, CEO Agent가 임원 Agent들에게 과제를 분배하고, 각 Agent가 병렬로 실행하며, Founder는 전체 진행 상황과 승인 필요 항목만 모니터링하는 AI 기반 회사 운영체계다.

NocoBase 화면은 Founder가 매일 조작하는 최종 UX가 아니다. MVP에서는 Agent들이 안정적으로 읽고 쓰는 내부 운영 DB, task state, approval queue, audit log, monitoring shell로 사용한다. Founder-facing experience의 중심은 채팅과 executive monitor다.

## Problem

새로운 사업을 시도할 때 대부분의 병목은 아이디어 부족이 아니다.

문제는 다음과 같다.

- Founder의 방향성 지시가 각 임원 Agent의 실행 과제로 안정적으로 분해되지 않는다.
- 각 Agent가 지금 무엇을, 왜, 어떤 원본 지시 때문에 하는지 한눈에 보이지 않는다.
- 병렬로 움직이는 Agent들의 상태, 산출물, 병목, handoff가 추적되지 않는다.
- 매번 Founder가 직접 프롬프트와 작업 지시를 만들어야 한다.
- PMF 검증 전에 툴부터 만들게 된다.
- 실행 결과가 다음 사업의 자산으로 축적되지 않는다.
- 에이전트와 자동화 도구가 많아져도 회사 운영 원칙이 없다.
- 고객 데이터와 재사용 가능한 인사이트가 섞여 데이터 거버넌스가 불안정하다.

## Product Goal

MVP의 목표는 완전 자율 회사를 만드는 것이 아니라, Founder가 CEO Agent와 채팅으로 방향을 정하고, CEO Agent가 임원 Agent들의 병렬 실행을 orchestrate하며, Founder가 monitoring/approval만 수행하는 운영 루프를 만드는 것이다.

```text
Founder Chat Direction
→ CEO Agent Interpretation
→ Workstream / Task Decomposition
→ Executive Agent Parallel Execution
→ Agent Handoff / Status Logging
→ Hermes Monitoring
→ Founder Approval Queue
→ BPR / Memory Update
→ Workflow Evolution
```

## Target User

### Primary User

- Founder / 1인 창업가 / 소규모 팀 운영자
- AI를 활용해 여러 사업 아이디어를 빠르게 실험하고 싶은 사람
- 직접 모든 실무를 하지 않고 방향과 판단에 집중하고 싶은 사람

### Internal Actors

- CEO Agent
- Chief of Staff Agent
- CMO/CRO/CPO/CTO/COO/CFO Agents
- Risk/QA Agent
- Hermes Runtime

## Core Philosophy

1. 사업보다 워크플로우가 먼저다.
2. No Demand, No Tool.
3. Founder는 방향과 최종 판단을 담당한다.
4. CEO Agent는 실행을 밀어붙이는 공동 CEO 역할을 한다.
5. 모든 실행은 Memory와 BPR로 축적되어야 한다.
6. 고객 PII와 재사용 가능한 Business Insight는 분리한다.
7. MVP는 빠르게 만들되, 핵심 로직은 Shell에 종속시키지 않는다.
8. Founder-facing UX는 chat-first다. Admin UI는 Agent 작업장이다.
9. 모든 Agent 작업은 원본 Founder/CEO 지시와 연결되어야 한다.

## MVP Features

### 1. Founder Chat Interface

Founder가 CEO Agent와 대화하는 주 인터페이스다.

- 방향성 지시 입력
- CEO Agent 해석 확인
- phase / workstream 제안 확인
- 승인 필요 항목에 대한 결정
- executive summary 질의

### 2. CEO Agent Orchestrator

Founder 지시를 실행 가능한 agent task로 분해한다.

- 원본 지시 저장
- 목표/성공 기준 정리
- BPR phase 분류
- Agent별 task 생성
- 병렬 실행 가능 여부 판단
- 승인 게이트 지정
- 다음 보고 시점 지정

### 3. Executive Monitor

전체 운영 상태를 한 화면에서 본다.

- 어떤 Agent가 움직이는지
- 각 Agent가 어떤 task를 수행 중인지
- 해당 task가 어떤 원본 지시에서 파생됐는지
- 왜 지금 이 일을 하는지
- 현재 상태, 병목, 다음 산출물
- 병렬 workstream 관계
- Founder 승인 필요 항목
- Hermes 알림과 stalled task

### 4. Agent Task Board

Agent들이 안정적으로 작업하기 위한 내부 task state layer다.

- task 생성/할당
- status: queued / running / blocked / needs_review / done / killed
- source instruction reference
- rationale
- expected output
- due/check-in time
- handoff target
- approval requirement

### 5. BPR Phase Manager

CEO Agent와 임원 Agent들이 비즈니스 방향성 및 프로세스 재설계를 phase 단위로 진행한다.

- Direction Alignment
- Market / PMF Diagnosis
- Offer / Workflow Redesign
- Execution System Build
- Monitoring / Optimization

### 6. Workflow Factory

새 사업 아이디어를 입력하면 사업 운영 흐름을 생성한다.

- 아이디어 입력
- Founder DNA 평가
- 관련 Memory 참조
- Business Brief 생성
- PMF Experiment Plan 생성
- Agent Staffing Plan 생성
- 7-Day Experiment 생성
- Kill / Scale Criteria 생성

### 7. Founder DNA Room

Founder의 성향, 판단 기준, 사업 선호, 리스크 기준을 관리한다.

- 현재 DNA 보기
- DNA 업데이트 후보 보기
- 승인/반려
- 사업 평가에 반영된 기준 확인

### 8. PMF Experiment Board

툴 제작 전 수요 검증 실험을 관리한다.

- 콘텐츠/메시지/랜딩/제안서 실험
- waitlist / 설문 / 인터뷰 신호
- PMF Score
- Tool Candidate 판단

### 9. Hermes Control Room

Hermes가 감시 중인 상태와 트리거를 보여준다.

- 멈춘 작업 감지
- 마감 지난 PMF 실험 감지
- 승인 필요 항목 알림
- 반복 업무 감지
- BPR 제안
- Tool Request 후보 생성

### 10. BPR Engine Room

병목을 기록하고 프로세스 개선안을 만든다.

- Local BPR
- Company BPR
- Triggered BPR
- 반복 병목
- 개선안
- 적용 여부

### 11. Tool Request Lab

반복 업무나 병목을 툴 제작 후보로 관리한다.

- 반복성
- 소요 시간
- 실수/누락 위험
- 매출/PMF 영향
- CTO 판단
- 선택 도구
- 상태

### 12. Memory Room

실행 결과와 인사이트를 저장하고 검색한다.

- Founder DNA Memory
- PMF Experiment Memory
- Market / Message / Sales Memory
- Workflow / Tool / Failure / BPR Memory
- Revenue Memory

### 13. Business Portfolio Board

여러 사업 아이디어와 실험 상태를 관리한다.

상태:

- Idea
- Scoring
- PMF Experiment
- Active Experiment
- Tool Candidate
- Revenue Test
- Productization
- Scaling
- Paused
- Killed

## MVP Scope

### Include

- Founder chat interface
- CEO Agent orchestrator
- Executive monitor
- Agent task board
- Agent handoff log
- BPR phase manager
- Internal operating console for agents/admin
- Founder DNA management
- Business idea intake
- Founder Fit scoring
- PMF experiment plan generation
- Workflow generation
- Agent staffing generation
- Hermes alert queue
- BPR log
- Tool Request candidate
- Memory entry creation
- Data export basics
- PII level and consent scope fields

### Exclude

- Founder가 매일 직접 조작해야 하는 complex admin UI
- NocoBase를 최종 customer-facing product UI로 다듬는 작업
- 완전 자동 외부 실행
- 결제/계약 자동화
- 유료 SaaS 의존
- 고객용 최종 UX
- 고위험 공개 콘텐츠 자동 발행
- 전화 영업 자동화
- 검증 전 대규모 툴 제작
- NocoBase commercial plugin 의존

## Success Metrics

MVP 성공 기준은 다음이다.

1. Founder가 채팅으로 방향성 지시를 남기면 CEO Agent가 목표/phase/workstream/task로 분해한다.
2. 각 task는 source instruction, 담당 Agent, rationale, expected output, status를 가진다.
3. Executive Monitor에서 병렬로 움직이는 Agent와 현재 과제/이유/상태/병목이 보인다.
4. Agent handoff가 기록되고 다음 담당자와 승인 필요 여부가 명확하다.
5. Founder 승인 필요 항목이 Approval Queue에 표시된다.
6. PMF Experiment Plan이 Tool Request보다 먼저 생성된다.
7. BPR Log가 병목과 개선안을 기록한다.
8. Memory Room이 실행 인사이트를 저장한다.
9. Customer PII와 Business Insight가 분리된다.
10. `l5-core`가 NocoBase 없이 테스트 가능하다.
