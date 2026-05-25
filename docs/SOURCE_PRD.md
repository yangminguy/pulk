# L5 Business OS PRD


> Version note: This PRD has been extended with an Open Source Integration Strategy for the NocoBase-based MVP shell, L5 plugin layer, agent runtime, Hermes runtime, LLM observability, PMF signal collection, and migration guardrails.

## 0. Document Purpose

이 문서는 **L5 Autonomous Business OS**의 초기 개발을 위한 상위 PRD이다.

이 PRD는 단순 기능 명세서가 아니라, 이후 다음 문서로 분해될 수 있도록 작성된 **구현 지시형 기획 문서**다.

- `TASKS.md`
- `CLAUDE.md`
- `ARCHITECTURE.md`
- `DATA_MODEL.md`
- `AGENT_PROTOCOL.md`
- `HERMES_SPEC.md`
- `WORKFLOW_FACTORY_SPEC.md`

---

# 1. Product Name

## Primary Name

**L5 Business OS**

## Alternative Names

- Founder OS
- Autonomous Business OS
- AI Executive Operating System
- Business Workflow Factory

---

# 2. One-line Definition

**L5 Business OS는 Founder의 성향, 회사 문화, 누적 인사이트를 기반으로 새로운 사업을 자동으로 기획하고, 워크플로우를 생성하고, 에이전트를 배치하고, 콘텐츠/메시지 기반 PMF 실험을 실행하고, 결과를 학습해 다음 사업과 워크플로우를 진화시키는 AI 회사 운영체계다.**

---

# 3. Core Philosophy

## 3.1 이 제품은 특정 사업 자동화 도구가 아니다

이 시스템은 단순히 아래 중 하나가 아니다.

- 마케팅 자동화 툴
- 회사 운영 SaaS
- Agent Control Tower
- CRM
- 업무 관리툴
- 챗봇
- 에이전트 데모

이 제품은 **새로운 사업이 계속 태어나고, 실험되고, 운영되고, 개선되는 회사 문화/워크플로우 OS**다.

## 3.2 L5로 처음부터 기획한다

초기 MVP가 완전 자율 실행을 모두 구현하지 않더라도, 전체 구조는 처음부터 L5를 전제로 설계한다.

L5의 의미는 다음과 같다.

```text
Sense
→ Think
→ Design
→ Execute
→ Measure
→ Learn
→ Evolve
→ Repeat
```

즉, 에이전트가 스스로 다음을 수행할 수 있어야 한다.

- 기회 감지
- 사업 아이디어 평가
- Founder DNA 적합도 판단
- 워크플로우 생성
- 에이전트 배치
- PMF 실험 설계
- 실행
- 측정
- BPR
- 인사이트 저장
- 워크플로우 개선
- 다음 실행 생성

## 3.3 사업보다 워크플로우가 먼저다

이 시스템은 특정 사업을 먼저 고도화하지 않는다.

대신 다음 순서를 따른다.

```text
회사 문화
→ Founder DNA
→ 생성형 워크플로우
→ 에이전트 배치
→ PMF 실험
→ 수요 검증
→ 필요 시 툴 제작
→ 매출화
→ 인사이트 축적
→ 워크플로우 진화
```

## 3.4 No Demand, No Tool

툴은 먼저 만들지 않는다.

모든 사업 아이디어는 먼저 콘텐츠/메시지/랜딩/제안 형태로 작게 PMF를 검증한다.

```text
No Demand → No Tool
Small Signal → More Experiment
Strong Signal → Tool Request
Paid Demand → Productization
```

---

# 4. Founder Role

## 4.1 Founder의 역할

Founder는 실무 오퍼레이터가 아니라 **방향 제시자이자 최종 판단자**다.

Founder가 하는 일:

- 회사의 큰 방향 제시
- CEO Agent와 전략 논의
- Founder DNA 업데이트
- 중요한 D4/D5 의사결정 승인
- 사업 확장/중단 최종 판단
- 아침/밤 BPR 참여 또는 검토
- 모니터링과 트래킹
- 방향 수정

## 4.2 Founder가 하지 않아야 하는 일

Business OS는 Founder가 아래 일을 직접 하지 않도록 설계되어야 한다.

- 매번 에이전트에게 작업 분배
- 매번 프롬프트 작성
- 매번 QA 결과 해석
- 매번 고객군 조사
- 매번 콘텐츠 주제 결정
- 매번 리드 리스트 작성
- 매번 툴 필요성 판단
- 매번 회의록 정리
- 매번 다음 액션 생성

---

# 5. CEO Agent Role

## 5.1 CEO Agent의 성격

CEO Agent는 단순 비서가 아니라 **공동 CEO에 가까운 운영 책임자**다.

성향:

- 공격적 성장형
- 전략가형
- 운영은 위임하는 리더형
- Founder와 방향을 논의하는 코치형

## 5.2 CEO Agent가 할 수 있는 일

CEO Agent는 다음을 자율적으로 진행할 수 있다.

- 하루 단위 우선순위 변경
- 콘텐츠 주제 결정
- SaaS/시스템 기능 우선순위 변경
- 고객 인터뷰 대상 선정
- 가격 제안 초안 작성
- 메시지 기반 영업 실행
- BPR 제안
- Founder에게 회의 요청
- 임원/에이전트에게 작업 지시
- 워크플로우 생성 요청
- 에이전트 배치 요청
- PMF 실험 승인
- Tool Request 우선순위 지정

## 5.3 CEO Agent가 Founder를 따라야 하는 영역

CEO Agent는 전체 방향에서는 Founder DNA를 따라야 한다.

Founder 승인 필요:

- 전체 사업 방향 변경
- 강의 커리큘럼 초안 확정
- 최종 가격 확정
- 계약/결제/환불 정책
- 전화 영업
- 브랜드 방향 대폭 변경
- 고위험 외부 발신
- 법적/재무적 약속
- 중요한 공개 메시지

---

# 6. Chief of Staff Agent Role

## 6.1 목적

Chief of Staff Agent는 Founder와 CEO 사이의 운영 보고/조율 레이어다.

## 6.2 책임

- Founder에게 보고할 내용 압축
- Daily BPR 요약
- Decision Queue 관리
- CEO 결정사항 정리
- 임원별 진행상황 취합
- Founder 승인 필요 항목 선별
- 회의 요청 생성
- follow-up 추적
- Memory 업데이트 확인

## 6.3 출력물

- Founder Brief
- Daily Company BPR Report
- Decision Digest
- Escalation Queue
- Follow-up Tracker
- Weekly Operating Summary

---

# 7. Core Product Modules

## 7.1 Founder DNA Engine

### 목적

Founder의 성향, 판단 기준, 사업 선호, 리스크 기준을 자동 관리한다.

### 관리 항목

- 선호 사업 유형
- 싫어하는 사업 유형
- 강점
- 약점/주의점
- 의사결정 기준
- 브랜드 톤
- 고객 선호
- 수익화 선호
- 리스크 허용 범위
- 좋아한 제안
- 거절한 제안
- 승인/보류/반려 패턴
- 과거 성공 사업 패턴
- 과거 실패 사업 패턴

### 자동 업데이트 기준

Founder DNA는 수동 작성뿐 아니라 다음 이벤트에서 자동 업데이트 후보를 생성해야 한다.

- Founder가 승인한 결정
- Founder가 거절한 결정
- Founder가 좋아한 사업 아이디어
- Founder가 싫어한 사업 아이디어
- 성과가 좋았던 실행
- 성과가 나빴던 실행
- BPR에서 반복 언급된 기준
- CEO와 Founder의 전략 대화 결과

### 기능 요구사항

- Founder DNA 항목을 구조화해서 저장한다.
- 각 항목은 출처와 업데이트 날짜를 가진다.
- 자동 업데이트는 바로 반영하지 않고 “Founder DNA Update Suggestion”으로 제안한다.
- Founder 또는 CEO가 승인하면 Founder DNA에 반영한다.

---

## 7.2 Culture Engine

### 목적

회사 전체가 일하는 방식, 판단 기준, 에이전트 행동 원칙을 관리한다.

### 기본 문화 원칙

```text
1. 모든 사업은 워크플로우로 시작한다.
2. 에이전트는 직책이 아니라 책임과 산출물로 정의된다.
3. 병목은 숨기지 않고 즉시 드러낸다.
4. 반복 업무는 반드시 Tool Request 후보가 된다.
5. 모든 실행은 인사이트로 남아야 한다.
6. 실패는 중단이 아니라 다음 워크플로우 개선 재료다.
7. Founder는 모든 일을 하지 않는다. 방향과 판단을 제공한다.
8. CEO는 실행을 멈추지 않는다. 단, 큰 방향은 Founder DNA를 따른다.
9. Chief of Staff는 Founder의 주의를 보호한다.
10. 모든 사업은 매출 가능성과 자동화 가능성을 동시에 평가한다.
11. 에이전트는 말이 아니라 결과물로 일한다.
12. 툴은 필요할 때만 만든다.
13. 외부 실행은 자동화하되 위험도에 따라 승인 단계를 둔다.
14. 사업은 사람이 운영하는 것이 아니라 시스템이 운영하게 만든다.
15. Business OS는 매번 더 똑똑해져야 한다.
```

---

## 7.3 Workflow Factory

### 목적

새로운 사업 아이디어가 들어오면 사업별 실행 워크플로우를 생성한다.

### 입력

- 사업 아이디어
- Founder DNA
- Company Culture
- 관련 과거 Memory
- 현재 Business Portfolio
- 리소스 상태
- 실행 가능 도구
- 시장/고객 가설

### 출력

새 사업마다 아래 문서를 생성한다.

```text
BUSINESS_BRIEF.md
FOUNDER_FIT_SCORE.md
OPPORTUNITY_SCORE.md
BUSINESS_MODEL_DRAFT.md
PMF_EXPERIMENT_PLAN.md
AGENT_STAFFING_PLAN.md
REVENUE_WORKFLOW.md
MARKETING_WORKFLOW.md
SALES_WORKFLOW.md
DELIVERY_WORKFLOW.md
BPR_WORKFLOW.md
TOOL_REQUESTS.md
7_DAY_EXPERIMENT.md
KILL_OR_SCALE_CRITERIA.md
```

### 핵심 규칙

- 워크플로우는 고정형이 아니라 생성형이다.
- 기본 템플릿은 존재하지만, 사업 유형별로 세부 단계는 달라져야 한다.
- 생성된 워크플로우는 실행 결과와 BPR을 통해 계속 진화해야 한다.

---

## 7.4 PMF Experiment Engine

### 목적

실제 툴을 만들기 전, 콘텐츠/메시지/랜딩/제안 형태로 작게 수요를 검증한다.

### 기본 원칙

```text
실제 툴을 만들기 전, 콘텐츠 형태로 먼저 실험한다.
수요가 있으면 그때 툴을 만든다.
```

### 실험 형태

- 콘텐츠 주제 테스트
- 숏폼/롱폼 스크립트 테스트
- 인스타/유튜브/블로그 콘텐츠 테스트
- DM/이메일 메시지 테스트
- 랜딩페이지 테스트
- 제안서 테스트
- 고객 인터뷰
- 사전 신청 폼
- waitlist
- 가짜문/컨시어지 MVP
- 수동 납품형 MVP

### PMF Score 항목

- Problem Resonance
- Audience Pull
- Reply/DM Signal
- Content Save Signal
- Comment Quality
- Sales Conversation Signal
- Founder Fit
- Automation Potential
- Revenue Speed
- Delivery Difficulty
- Risk Level

### 점수화 방식

각 항목은 1~5점으로 평가한다.

예시:

```text
1점: 신호 없음
2점: 약한 관심
3점: 의미 있는 반응
4점: 구매/상담 신호
5점: 돈을 내겠다는 신호
```

### 툴 제작 기준

툴 제작은 아래 조건 중 2개 이상 충족할 때만 검토한다.

- 반복 수요 발생
- 실제 결제 의향 확인
- 수동 납품이 반복됨
- Founder/에이전트 병목 발생
- 매출 전환 가능성 높음
- 자동화로 시간/비용 절감 효과 명확
- 여러 사업에 재사용 가능

---

## 7.5 Agent Staffing Engine

### 목적

사업별로 필요한 에이전트 팀을 자동 구성한다.

### 상시 임원진

- CEO Agent
- Chief of Staff Agent
- CMO Agent
- CRO/Sales Agent
- CPO Agent
- CTO Agent
- COO Agent
- CFO/Admin Agent
- Risk/QA Agent
- Culture Agent

### 사업별 임시 Squad

새 사업이 생성되면 필요한 실무 에이전트를 자동 배치한다.

예시:

#### 마케팅 자동화 시스템 판매

- CEO
- CMO
- CRO/Sales
- CPO
- CTO
- COO
- Risk/QA
- Lead Research Agent
- Copy Agent
- Proposal Agent
- Sales Ops Agent

#### 바이브 코딩 강의

- CEO
- CMO
- CPO
- Curriculum Agent
- Content Agent
- Community Agent
- Sales Agent
- Chief of Staff

#### 에이전트 기반 신사업 실험

- CEO
- Venture Analyst
- CPO
- CMO
- CFO/Admin
- Rapid Test Agent
- Risk/QA
- Chief of Staff

### Agent Staffing Output

```text
사업명
목표
필요 에이전트
각 에이전트 책임
각 에이전트 산출물
회의 리듬
권한 범위
Founder 보고 기준
자동화 가능 영역
```

---

## 7.6 Agent Work Protocol

모든 에이전트는 같은 방식으로 일해야 한다.

### 표준 작업 프로토콜

```text
1. Read Context
2. Identify Goal
3. Detect Bottleneck
4. Decide Next Action
5. Produce Output
6. Trigger Next Agent
7. Save Memory
8. Suggest Workflow Improvement
```

### 에이전트 출력 포맷

모든 에이전트 출력은 아래 구조를 따른다.

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

### Agent Trigger Rule

에이전트는 작업을 완료하면 다음 중 하나를 반드시 실행해야 한다.

- 다음 에이전트 호출
- CEO에게 결정 요청
- Founder 승인 요청
- Hermes 알림 요청
- BPR 생성
- Tool Request 생성
- Memory 저장
- Workflow Improvement 제안

---

## 7.7 Hermes Coordination Layer

### 목적

Hermes는 단순 알림봇이 아니라 **운영 신경망 + 트리거 엔진 + 상태 감시자**다.

### Hermes 개입 수준

Hermes는 최강 개입형으로 설계한다.

Hermes가 할 수 있어야 하는 일:

- 아침 운영 루프 시작
- 밤 BPR 루프 시작
- 각 워크플로우 상태 감시
- 멈춘 작업 감지
- 에이전트에게 다음 액션 요청
- PMF 실험 마감 확인
- 반응 데이터 누락 감지
- 반복 업무 감지
- Tool Request 생성 트리거
- BPR 필요 시 CEO에게 회의 제안
- Founder 승인 필요 시 알림
- Memory 업데이트 요청
- 워크플로우 재시작
- CEO/Chief of Staff/Founder 간 메시지 전달
- Slack 또는 웹사이트 기반 소통 지원

### Hermes Trigger Examples

```text
“Revenue Workflow의 Sales 단계가 24시간 멈춰 있습니다.
CRO에게 후속 액션을 요청할까요, 아니면 BPR을 실행할까요?”
```

```text
“같은 유형의 콘텐츠 성과 정리 작업이 3회 반복되었습니다.
CTO에게 Tool Request 생성을 제안합니다.”
```

```text
“PMF 실험 마감 시간이 지났지만 반응 데이터가 없습니다.
CMO에게 데이터 입력을 요청하겠습니다.”
```

### Hermes Channel

초기에는 웹사이트 내부 알림으로 시작한다.

이후 확장 후보:

- Slack
- Telegram
- Email
- 웹 푸시
- 모바일 앱 알림

---

## 7.8 BPR Engine

### 목적

사업과 워크플로우에서 병목을 발견하고 프로세스를 재설계한다.

### BPR Loop

```text
Bottleneck
→ Problem Definition
→ Root Cause
→ Collective Intelligence
→ Action Design
→ Execution
→ Review
→ Process Redesign
→ Memory Update
```

### BPR 유형

#### Local BPR

각 에이전트/사업부가 자체적으로 실행한다.

#### Company BPR

CEO와 Chief of Staff가 주도하고, Founder가 아침/밤에 검토한다.

#### Triggered BPR

Hermes가 병목/반복/지연/실패를 감지하면 제안한다.

### BPR Output

```text
BPR ID
발생 위치
관련 사업
관련 워크플로우
병목
원인
해결안
실행 액션
담당자
승인 필요 여부
반복 여부
Tool Request 필요 여부
Memory 저장 항목
Workflow Improvement 제안
```

---

## 7.9 Tool Request Engine

### 목적

반복되는 수작업이나 병목을 툴 제작 후보로 전환한다.

### Tool Request 발생 조건

아래 조건 중 2개 이상 충족하면 Tool Request 후보를 생성한다.

- 같은 작업이 2회 이상 반복됨
- 회당 20분 이상 소요
- 실수/누락 위험이 있음
- Founder 또는 임원 병목을 유발함
- 매출/PMF/납품에 직접 영향이 있음
- 여러 사업에서 재사용 가능
- 자동화 시 명확한 비용 절감 효과 있음

### CTO의 판단 옵션

CTO는 Tool Request를 보고 다음 중 하나를 선택한다.

- Manual for now
- Local script
- No-code/free tool
- Internal feature
- Agent Control Tower 사용
- Claude Code 사용
- Codex 사용
- Antigravity 사용
- Hermes 자동화 연결
- Future external SaaS
- Reject

### 중요 규칙

Agent Control Tower는 Business OS가 아니다.  
Agent Control Tower는 CTO가 코딩/개발 작업을 실행할 때 사용하는 도구 중 하나다.

---

## 7.10 Memory Engine

### 목적

모든 실행, 반응, 실패, 결정, 인사이트를 저장하고 다음 워크플로우에 반영한다.

### Memory Types

- Founder DNA Memory
- Culture Memory
- Business Idea Memory
- PMF Experiment Memory
- Market Memory
- Message Memory
- Sales Memory
- Product Memory
- Workflow Memory
- Tool Memory
- Failure Memory
- BPR Memory
- Revenue Memory

### Memory Entry Format

```text
ID:
Type:
Date:
Source:
Related Business:
Related Workflow:
Insight:
Evidence:
Confidence:
Recommended Usage:
Update Target:
```

### Memory Usage

새 사업 생성 시 Memory Engine은 자동으로 관련 기억을 검색해야 한다.

예:

- 과거 반응 좋은 메시지
- 과거 실패한 고객군
- 원민님이 거절한 사업 방식
- 잘 먹힌 콘텐츠 구조
- 반복된 병목
- 매출 전환이 있었던 제안 방식

---

## 7.11 Workflow Evolution Engine

### 목적

누적된 인사이트를 바탕으로 워크플로우를 계속 개선한다.

### Evolution Loop

```text
실행 결과
→ BPR 분석
→ Insight 추출
→ Founder DNA와 비교
→ Workflow Improvement Proposal
→ CEO 검토
→ 적용
→ 다음 실행 반영
```

### Workflow Improvement Proposal Format

```text
대상 워크플로우:
발견된 문제:
근거:
제안 변경:
예상 효과:
리스크:
승인 필요:
적용 우선순위:
```

---

## 7.12 Business Portfolio Engine

### 목적

여러 사업 아이디어와 실험을 관리한다.

### Portfolio Status

각 사업은 아래 상태 중 하나를 가진다.

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

### Kill / Scale Criteria

각 사업은 시작 시점에 중단/확장 기준을 가져야 한다.

예:

```text
Kill:
- 콘텐츠 5개 테스트 후 의미 있는 반응 없음
- 메시지 30개 발송 후 답장 0건
- Founder Fit 낮음
- Delivery가 너무 무거움

Scale:
- 유료 상담/결제 의향 발생
- 반복 문의 발생
- 동일 문제를 가진 고객군 확인
- 콘텐츠 반응이 반복적으로 좋음
```

---

# 8. Business Creation Workflow

새 사업은 반드시 아래 흐름을 통과한다.

```text
1. Idea Intake
2. Founder DNA Filter
3. Memory Retrieval
4. Market Problem Scan
5. Opportunity Score
6. PMF Experiment Design
7. Agent Staffing
8. Workflow Generation
9. Hermes Monitoring Setup
10. Execution Launch
11. PMF Measurement
12. BPR Review
13. Memory Update
14. Scale / Pivot / Kill Decision
```

## 8.1 Idea Intake

아이디어는 다음 경로에서 들어올 수 있다.

- Founder 직접 입력
- CEO 제안
- CMO 시장/콘텐츠 반응 기반 제안
- CRO 고객 반응 기반 제안
- BPR 중 발견
- Memory 기반 자동 제안
- 외부 트렌드/레퍼런스 기반 제안

## 8.2 Founder DNA Filter

아이디어를 Founder DNA와 비교한다.

평가 항목:

- Founder Fit
- Interest Fit
- Skill Fit
- Energy Fit
- Brand Fit
- Risk Fit
- Long-term Asset Fit

## 8.3 PMF Experiment Design

툴 제작 전 반드시 작은 PMF 실험을 설계한다.

실험은 다음 형태 중 하나 이상이어야 한다.

- 콘텐츠
- 메시지
- 랜딩
- 제안서
- 수동 납품
- 상담/인터뷰
- 사전 신청
- waitlist

## 8.4 Workflow Generation

사업 유형에 맞는 생성형 워크플로우를 만든다.

기본 워크플로우:

- Revenue Workflow
- Marketing Workflow
- Sales Workflow
- Delivery Workflow
- BPR Workflow
- Tool Request Workflow

---

# 9. Autonomy Levels

## L1 — Suggest

에이전트가 제안만 한다.

## L2 — Draft

에이전트가 문서/메시지/계획 초안을 만든다.

## L3 — Internal Execute

에이전트가 내부 작업을 실행한다.

예:

- 리서치
- 문서 생성
- 데이터 정리
- 콘텐츠 기획
- PMF 실험 설계
- BPR 로그 작성

## L4 — External Execute with Approval

에이전트가 외부 행동을 수행하되 승인 게이트가 있다.

예:

- 메시지 기반 영업
- 고객 인터뷰 요청
- 제안서 발송
- 콘텐츠 발행

## L5 — Autonomous Loop

에이전트 조직이 다음 루프를 지속 실행한다.

```text
감지
→ 판단
→ 설계
→ 실행
→ 측정
→ 학습
→ 개선
→ 재실행
```

초기 기획은 L5를 기준으로 하되, 실제 외부 실행은 위험도에 따라 승인 게이트를 둔다.

---

# 10. Decision Authority

## CEO 자율 가능

- 하루 단위 우선순위 변경
- 콘텐츠 주제 결정
- SaaS 기능 우선순위 변경
- 고객 인터뷰 대상 선정
- 가격 제안 초안 작성
- 메시지 기반 영업
- BPR 제안
- 에이전트 작업 배정
- 워크플로우 재생성 요청
- PMF 실험 승인

## Founder 승인 필요

- 전체 방향 변경
- 강의 커리큘럼 초안 확정
- 최종 가격 확정
- 계약/결제/환불 정책
- 전화 영업
- 법적/재무적 약속
- 큰 브랜드 방향 변경
- 고위험 공개 메시지
- 유료 툴 구독
- 검증 전 대규모 개발 착수

---

# 11. MVP Scope

## 11.1 MVP 목표

MVP는 완전 자율 실행체가 아니라, L5 구조를 시각화하고 반자동으로 운영할 수 있는 시스템이다.

MVP에서 반드시 보여야 할 것:

- Founder DNA 자동 관리 구조
- Culture Engine
- Workflow Factory
- PMF Experiment Engine
- Agent Staffing Engine
- Hermes Autonomy Layer
- BPR Engine
- Tool Request Engine
- Memory Engine
- Workflow Evolution Engine
- Business Portfolio Board

## 11.2 MVP 핵심 화면

### 1. Autonomy Dashboard

전체 자율 운영 상태를 보여준다.

표시 항목:

- 현재 실행 중인 워크플로우
- 멈춘 워크플로우
- Hermes 알림
- CEO 결정
- Founder 승인 필요 항목
- 오늘의 PMF 실험
- 오늘의 BPR
- Tool Request
- Memory 업데이트

### 2. Workflow Factory

새 사업 아이디어를 입력하고 워크플로우를 생성한다.

기능:

- 아이디어 입력
- Founder DNA 평가
- Memory 참조
- PMF 실험 설계
- Agent Staffing 생성
- 7-Day Experiment 생성

### 3. Founder DNA Room

Founder DNA를 관리한다.

기능:

- 현재 DNA 보기
- 업데이트 후보 보기
- 승인/반려
- 사업 평가에 반영된 DNA 확인

### 4. Hermes Control Room

Hermes가 감시 중인 워크플로우와 트리거를 보여준다.

기능:

- 멈춘 작업
- 다음 액션 요청
- BPR 제안
- Founder 알림
- Memory 업데이트 요청
- Tool Request 후보

### 5. PMF Experiment Board

콘텐츠/메시지 기반 실험을 관리한다.

기능:

- 실험 목록
- 가설
- 콘텐츠/메시지
- 지표
- PMF Score
- 다음 결정

### 6. BPR Engine Room

병목과 개선안을 관리한다.

기능:

- Local BPR
- Company BPR
- Triggered BPR
- 반복 병목
- 개선안
- 적용 여부

### 7. Memory Room

실행 인사이트를 저장하고 검색한다.

기능:

- Memory 타입별 보기
- 사업별 보기
- 워크플로우별 보기
- 다음 실행에 반영된 Memory 확인

### 8. Tool Request Lab

반복 업무를 툴화 후보로 관리한다.

기능:

- 요청 목록
- 반복성
- 소요 시간
- 매출 영향
- CTO 판단
- 선택 도구
- 상태

### 9. Business Portfolio Board

사업 아이디어와 실험을 상태별로 관리한다.

기능:

- Idea
- Scoring
- PMF Experiment
- Revenue Test
- Tool Candidate
- Productization
- Scaling
- Paused
- Killed

---

# 12. Initial Data Structure

초기에는 외부 툴과 DB 없이 Markdown + JSON 기반으로 시작한다.

```text
business-os/
  founder/
    FOUNDER_DNA.md
    FOUNDER_DNA_UPDATES.json

  company/
    CULTURE.md
    OPERATING_PRINCIPLES.md
    DECISION_RULES.md

  workflows/
    templates/
    generated/

  agents/
    executives/
    squads/

  businesses/
    ideas/
    active/
    killed/
    scaled/

  experiments/
    pmf/

  hermes/
    triggers.json
    alerts.json
    stalled_workflows.json

  memory/
    founder_dna/
    market/
    message/
    sales/
    product/
    workflow/
    tool/
    failure/
    bpr/
    revenue/

  bpr/
    local/
    company/
    triggered/

  tool_requests/
    pending/
    approved/
    rejected/

  dashboards/
    autonomy_status.json
    portfolio_status.json
    workflow_status.json
    pmf_status.json
```

---

# 13. Non-goals

MVP에서 하지 않는다.

- 완전 자동 외부 실행
- 결제/계약 자동화
- 유료 SaaS 도입
- 대규모 DB 설계
- Agent Control Tower 통합 필수화
- 검증 전 툴 제작
- 검증 전 SaaS 기능 개발
- 전화 영업 자동화
- 고객에게 법적/재무적 약속
- 고위험 공개 콘텐츠 자동 발행

---

# 14. Success Criteria

MVP 성공 기준:

1. 새 사업 아이디어를 입력하면 Founder DNA 기반 평가가 생성된다.
2. 관련 Memory를 참조해 사업 가설이 정리된다.
3. 툴 제작 전 PMF 실험이 자동 설계된다.
4. 사업별 생성형 워크플로우가 생성된다.
5. 필요한 에이전트 Squad가 자동 배치된다.
6. Hermes가 워크플로우 상태와 멈춤을 감시한다.
7. BPR이 병목을 기록하고 개선안을 제안한다.
8. Tool Request가 반복 업무 기반으로 생성된다.
9. 실험 결과가 Memory에 저장된다.
10. Memory가 다음 워크플로우 개선안에 반영된다.
11. Founder는 모니터링과 승인, 방향 제시만 하면 된다.
12. Business OS가 특정 사업이 아니라 “사업 생성/운영 문화”로 작동한다.

---

# 15. First Build Recommendation

첫 구현은 다음 순서로 진행한다.

## Phase 1 — Core Data Skeleton

- Founder DNA
- Culture
- Decision Rules
- Agent Protocol
- Memory Types
- Workflow Templates

## Phase 2 — Autonomy Dashboard

- 실행 중인 워크플로우
- Hermes 알림
- Founder 승인 필요
- BPR 상태
- Tool Request 상태

## Phase 3 — Workflow Factory

- 사업 아이디어 입력
- Founder Fit 평가
- PMF 실험 생성
- Agent Staffing 생성
- 7-Day Experiment 생성

## Phase 4 — Hermes Control Room

- 멈춘 워크플로우 감지
- BPR 제안
- 다음 액션 요청
- 알림 큐

## Phase 5 — PMF Experiment Board

- 콘텐츠/메시지 실험
- PMF Score
- Tool Request 전환 기준

## Phase 6 — Memory + Workflow Evolution

- 인사이트 저장
- 워크플로우 개선 제안
- Founder DNA 업데이트 후보

---

# 16. Key Implementation Instruction for Claude Code

이 PRD를 기반으로 개발할 때 반드시 지켜야 한다.

```text
1. Business OS는 특정 사업 자동화 도구가 아니다.
2. Business OS는 사업이 계속 생성되고 운영되는 L5 회사 운영체계다.
3. Agent Control Tower는 Business OS가 아니라 CTO가 사용할 수 있는 선택적 코딩 도구다.
4. 처음에는 외부 유료 툴을 쓰지 않는다.
5. 실제 툴 제작보다 PMF 실험이 먼저다.
6. 워크플로우는 고정형이 아니라 생성형이다.
7. Hermes는 단순 알림봇이 아니라 최강형 운영 트리거 엔진이다.
8. Founder는 실무자가 아니라 모니터링/방향/승인 담당이다.
9. CEO는 공격적 성장형 + 전략가형으로 내부 실행을 강하게 밀어붙인다.
10. 모든 실행 결과는 Memory와 BPR로 이어져야 한다.
11. 모든 Memory는 다음 워크플로우 개선에 사용되어야 한다.
```

---

# 17. Glossary

## Founder DNA

Founder의 성향, 판단 기준, 취향, 리스크 기준, 사업 선호를 구조화한 데이터.

## Workflow Factory

새로운 사업 아이디어에 맞는 실행 워크플로우를 생성하는 엔진.

## PMF Experiment

툴 제작 전 콘텐츠/메시지/랜딩/수동 납품으로 수요를 검증하는 실험.

## Hermes

Business OS의 운영 신경망. 알림, 상태 감시, 트리거, BPR 제안, 워크플로우 재시작을 담당한다.

## BPR Engine

병목을 발견하고 프로세스를 재설계하는 엔진.

## Tool Request

반복 업무나 병목이 발견되었을 때 CTO에게 도구 제작/도입 검토를 요청하는 구조.

## Workflow Evolution

실행 결과와 인사이트를 바탕으로 기존 워크플로우를 개선하는 과정.

---

# 18. Final Product Direction

L5 Business OS의 최종 방향은 다음과 같다.

```text
새 사업이 들어온다
→ Founder DNA와 Culture로 필터링된다
→ CEO가 사업화 가능성을 판단한다
→ Workflow Factory가 사업 운영 흐름을 만든다
→ Agent Staffing Engine이 팀을 만든다
→ PMF Experiment Engine이 콘텐츠/메시지 기반 수요를 검증한다
→ Hermes가 실행 상태를 감시하고 멈춤을 재시작한다
→ 에이전트들이 작업하고 결과를 저장한다
→ BPR이 병목을 발견하고 개선안을 만든다
→ Tool Request Engine이 반복 업무를 CTO에게 넘긴다
→ Memory Engine이 인사이트를 축적한다
→ Workflow Evolution Engine이 다음 실행을 개선한다
→ 다음 사업은 더 Founder답게, 더 빠르게, 더 자동화되어 실행된다
```

이것이 MVP부터 지켜야 할 제품의 핵심 방향이다.


---

# 19. Open Source Integration Strategy

## 19.1 Purpose

이 섹션은 L5 Business OS MVP를 빠르게 구현하기 위해 사용할 오픈소스 기반 통합 전략을 정의한다.

핵심 원칙은 다음과 같다.

```text
1. NocoBase는 MVP 단계의 Business OS Shell로 사용한다.
2. L5 Business OS의 핵심 로직은 NocoBase에 종속시키지 않고 별도 `l5-core` 패키지로 분리한다.
3. NocoBase 위에는 L5 전용 플러그인 레이어를 만든다.
4. 장기 실행, 에이전트 판단, LLM 관측, 외부 자동화, PMF 신호 수집은 검증된 오픈소스 서비스를 연결한다.
5. 판매/SaaS화 전까지는 무료/오픈소스 범위에서 MVP를 만든다.
6. 나중에 다른 베이스로 옮길 수 있도록 핵심 로직과 UI Shell을 분리한다.
```

이 전략은 “오픈소스를 단순히 사용하는 것”이 아니라, **검증된 오픈소스 코드베이스 위에 L5 Business OS 레이어를 입히는 방식**이다.

---

# 20. Open Source Stack Decision

## 20.1 Primary Base: NocoBase

### 선택 이유

NocoBase는 MVP 단계에서 Business OS의 데이터 모델, 관리자 화면, 권한, CRUD, 플러그인, 워크플로우, 대시보드를 빠르게 구성하기 위한 기본 Shell로 사용한다.

NocoBase는 다음 역할을 맡는다.

```text
- Business OS Admin Shell
- Founder DNA Room
- Business Portfolio Board
- PMF Experiment Board
- BPR Engine Room
- Tool Request Lab
- Memory Room
- Hermes Control Room
- Decision Queue
- Workflow Factory 입력/출력 UI
- L5 Plugin Host
```

### 사용 방식

```text
NocoBase core는 최대한 수정하지 않는다.
L5 Business OS 기능은 플러그인으로 개발한다.
NocoBase commercial plugin에는 의존하지 않는다.
외부 판매/SaaS화 전까지 Community Edition 기준으로 사용한다.
```

### 다운로드 / 설치 대상

```text
Repository:
https://github.com/nocobase/nocobase

Recommended install for MVP:
- Docker install for quick local evaluation
- Git source install if plugin/core debugging is required
```

### 사용 기능

```text
- Main database collection
- Collection manager
- Relation fields
- Markdown fields
- Formula fields
- Sort fields
- Data visualization blocks
- ECharts visualization
- Gantt block if workflow timeline is needed
- Embed NocoBase if later separate app shell is used
- Variables and secrets
- Error handler
- Plugin system
- Custom client/server plugins
```

### 사용하지 않을 기능 / 주의 기능

```text
- Commercial plugins are not required for MVP.
- Custom brand removal is not required for MVP.
- External database data source is not required for MVP.
- REST API data source plugin is Standard Edition+, so MVP should connect to external services through custom plugins or server-side code instead.
- NocoBase core patching should be avoided unless absolutely necessary.
```

---

## 20.2 Agent Runtime: Mastra

### 선택 이유

Mastra는 TypeScript 기반 AI agent/application framework로 사용한다. L5 Business OS의 CEO Agent, Chief of Staff Agent, CMO/CRO/CTO Agent 등은 NocoBase 내부에 직접 넣지 않고 Mastra 기반 Agent Runtime으로 분리한다.

### 담당 영역

```text
- CEO Agent
- Chief of Staff Agent
- CMO Agent
- CRO/Sales Agent
- CTO Agent
- Risk/QA Agent
- Agent tool calling
- Agent workflows
- Founder DNA 기반 판단
- PMF Experiment 생성
- BPR 요약
- Tool Request 판단
```

### 다운로드 / 설치 대상

```text
Repository:
https://github.com/mastra-ai/mastra

Service path:
services/agent-runtime/
```

### 사용 방식

```text
NocoBase Plugin → Agent Runtime API 호출
Agent Runtime → L5 Core 로직 + LLM + Memory 검색 사용
Agent Runtime → 결과를 NocoBase collections에 저장
```

---

## 20.3 Hermes Runtime: Trigger.dev

### 선택 이유

Hermes는 단순 알림봇이 아니라 운영 신경망, 상태 감시자, 트리거 엔진이다. 따라서 장기 실행, 재시도, 큐, 지연 감지, 스케줄 실행, human-in-the-loop가 필요하다.

Trigger.dev는 Hermes의 실행 레이어로 사용한다.

### 담당 영역

```text
- Morning Operating Loop
- Night BPR Loop
- Stalled Workflow Detector
- PMF Deadline Checker
- Founder Approval Queue Watcher
- Tool Request Candidate Detector
- Memory Update Suggestion Trigger
- Workflow Restart Trigger
- Human-in-the-loop approval pause
```

### 다운로드 / 설치 대상

```text
Repository:
https://github.com/triggerdotdev/trigger.dev

Service path:
services/hermes-runtime/
```

### 사용 방식

```text
Trigger.dev Task 실행
→ NocoBase API 또는 L5 plugin endpoint 호출
→ 필요한 경우 Mastra Agent Runtime 호출
→ 결과를 HermesAlert / BPRLog / ToolRequest / MemoryEntry에 저장
```

### MVP 원칙

```text
초기에는 Trigger.dev Cloud 무료 범위 또는 로컬/self-host 평가로 시작한다.
서버 비용이 부담되면 단순 cron + queue로 대체 가능하게 설계한다.
Hermes task definition은 NocoBase core에 넣지 않고 별도 service로 둔다.
```

---

## 20.4 LLM Observability: Langfuse

### 선택 이유

L5 Business OS는 에이전트가 판단하는 시스템이다. 따라서 “왜 그런 결정을 했는지” 추적 가능해야 한다.

Langfuse는 LLM trace, prompt versioning, token/cost tracking, evaluation, user feedback tracking을 담당한다.

### 담당 영역

```text
- CEO Agent decision trace
- Founder Fit Score reasoning
- PMF Score reasoning
- Workflow Factory prompt versioning
- BPR recommendation reasoning
- Tool Request recommendation reasoning
- Token/cost tracking
- Prompt management
- Evaluation dataset
```

### 다운로드 / 설치 대상

```text
Repository:
https://github.com/langfuse/langfuse

Service path:
services/llm-observability/
```

### 사용 방식

```text
Mastra Agent Runtime → Langfuse trace 저장
Workflow Factory → prompt version 관리
Hermes Runtime → task/agent execution trace 연결
```

### MVP 원칙

```text
초기에는 Langfuse Cloud free tier 또는 local self-host 중 하나를 사용한다.
LLM 호출이 늘어나기 전까지는 최소 trace만 저장한다.
프롬프트는 코드에 하드코딩하지 않고 versioned prompt로 관리할 준비를 한다.
```

---

## 20.5 Automation Connector: Activepieces

### 선택 이유

외부 자동화 연결은 Business OS core에 직접 넣지 않는다. Slack, Telegram, Gmail, Google Sheets, Notion 등은 Activepieces Community Edition 또는 직접 API 연동으로 처리한다.

n8n도 가능하지만, 라이선스와 제품화 리스크를 줄이기 위해 MVP에서는 Activepieces를 우선한다.

### 담당 영역

```text
- Telegram notification
- Slack notification
- Gmail draft/send integration
- Google Sheets logging
- Notion sync
- Webhook-based PMF signal ingestion
- External app connector
```

### 다운로드 / 설치 대상

```text
Repository:
https://github.com/activepieces/activepieces

Service path:
services/automation-connectors/
```

### 사용 방식

```text
NocoBase / Hermes → webhook → Activepieces flow
Activepieces → external app action
External app response → Business OS webhook endpoint
```

### MVP 원칙

```text
초기에는 Telegram 또는 Slack 중 하나만 연결한다.
외부 발신은 반드시 Founder approval gate를 둔다.
고위험 외부 발신은 자동 실행하지 않는다.
```

---

## 20.6 PMF Signal Collection: Formbricks

### 선택 이유

PMF Experiment Engine은 실제 툴 제작 전 콘텐츠, 메시지, 랜딩, waitlist, 고객 인터뷰, 설문으로 수요를 검증해야 한다. Formbricks는 링크 설문, 웹사이트 설문, 인앱 설문, 피드백 수집에 사용한다.

### 담당 영역

```text
- Waitlist form
- Customer interview request form
- PMF signal survey
- Content/message feedback survey
- Landing page feedback
- Manual MVP feedback
```

### 다운로드 / 설치 대상

```text
Repository:
https://github.com/formbricks/formbricks

Service path:
services/pmf-signal/
```

### 사용 방식

```text
PMFExperiment 생성
→ Formbricks survey/link 생성
→ 응답 수집
→ PMFExperimentMetric / MemoryEntry로 저장
→ PMF Score 계산
```

### MVP 원칙

```text
Core/free features만 사용한다.
Enterprise features에는 의존하지 않는다.
초기에는 링크 설문과 waitlist만 사용한다.
```

---

## 20.7 Product Analytics: PostHog or OpenPanel

### 선택 이유

PMF 실험이 랜딩페이지/웹 이벤트 기반으로 확장되면 analytics가 필요하다. 초기 MVP에서는 필수 도입하지 않는다.

### 담당 영역

```text
- Landing page event tracking
- Button click tracking
- Waitlist conversion tracking
- Session replay if needed
- Feature flag / experiment if needed
```

### 다운로드 / 설치 대상

```text
Primary option:
PostHog Cloud free tier or self-host hobby deployment
https://github.com/posthog/posthog

Alternative lightweight option:
OpenPanel
https://github.com/Openpanel-dev/openpanel
```

### MVP 원칙

```text
Phase 1~3에서는 도입하지 않는다.
PMF Experiment가 실제 랜딩/제품 이벤트를 요구할 때 도입한다.
초기에는 Formbricks + 수동 지표 입력으로 충분하다.
```

---

# 21. Dependency Boundary Principle

## 21.1 핵심 원칙

NocoBase는 MVP 속도를 높이기 위한 Shell이다. 그러나 L5 Business OS의 핵심 로직은 NocoBase에 종속되면 안 된다.

```text
NocoBase-dependent:
- 화면
- collection 관리
- admin UX
- action button
- approval queue UI
- plugin adapter

NocoBase-independent:
- Founder DNA scoring logic
- PMF scoring logic
- Workflow Factory logic
- Agent role protocol
- BPR reasoning
- Tool Request criteria
- Memory retrieval policy
- Decision authority rules
```

## 21.2 핵심 로직 위치

```text
packages/l5-core/
  founder-dna/
  culture/
  workflow-factory/
  pmf-scoring/
  agent-staffing/
  bpr/
  tool-request/
  memory/
  decision-rules/
  workflow-evolution/
```

`l5-core`는 NocoBase 없이도 테스트 가능해야 한다.

## 21.3 NocoBase Plugin 위치

```text
apps/nocobase/packages/plugins/
  @l5/plugin-founder-dna/
  @l5/plugin-culture-engine/
  @l5/plugin-business-portfolio/
  @l5/plugin-pmf-experiment/
  @l5/plugin-bpr-engine/
  @l5/plugin-tool-request/
  @l5/plugin-memory-room/
  @l5/plugin-hermes-control-room/
  @l5/plugin-workflow-factory/
  @l5/plugin-agent-staffing/
```

각 플러그인은 `l5-core`를 호출하는 adapter 역할을 한다.

---

# 22. Open Source to PRD Module Mapping

| PRD Module | Primary OSS | Usage | Custom Layer |
|---|---|---|---|
| Founder DNA Engine | NocoBase | Collection, UI, approval queue | `l5-core/founder-dna` scoring and update suggestion |
| Culture Engine | NocoBase | Principles, rules, policy management | `l5-core/culture` |
| Workflow Factory | NocoBase + Mastra | Input/output UI + agent generation | `l5-core/workflow-factory` |
| PMF Experiment Engine | NocoBase + Formbricks | Experiment board + survey/waitlist | `l5-core/pmf-scoring` |
| Agent Staffing Engine | NocoBase + Mastra | Agent registry + assignment | `l5-core/agent-staffing` |
| Agent Work Protocol | Mastra | Agent runtime and workflows | `l5-core/agent-protocol` |
| Hermes Coordination Layer | NocoBase + Trigger.dev | Control room + scheduled/durable tasks | `l5-core/hermes-policy` |
| BPR Engine | NocoBase + Mastra | BPR records + root cause analysis | `l5-core/bpr` |
| Tool Request Engine | NocoBase + Trigger.dev | Candidate generation and CTO decision | `l5-core/tool-request` |
| Memory Engine | NocoBase + Langfuse + future pgvector | Memory room + trace + retrieval | `l5-core/memory` |
| Workflow Evolution Engine | Mastra + NocoBase | Improvement proposal generation | `l5-core/workflow-evolution` |
| Business Portfolio Engine | NocoBase | Status board and records | `l5-core/business-portfolio` |
| External Notifications | Activepieces | Telegram/Slack/Gmail/Sheets | `services/automation-connectors` |
| Product Analytics | PostHog/OpenPanel | Optional PMF event analytics | `services/analytics` |

---

# 23. MVP Download and Setup Plan

## 23.1 Required from Day 1

```text
1. NocoBase
   Purpose: Business OS Shell / Admin / Plugin host
   Source: https://github.com/nocobase/nocobase

2. PostgreSQL
   Purpose: Main database for NocoBase
   Source: Docker image or managed free tier

3. L5 Core Package
   Purpose: Business OS domain logic
   Source: created in this repository

4. L5 NocoBase Plugins
   Purpose: Founder DNA, PMF, BPR, Tool Request, Hermes UI
   Source: created in this repository
```

## 23.2 Required after Core Screens Work

```text
5. Mastra
   Purpose: Agent Runtime
   Source: https://github.com/mastra-ai/mastra

6. Trigger.dev
   Purpose: Hermes Runtime / scheduled tasks / retry / long-running workflows
   Source: https://github.com/triggerdotdev/trigger.dev

7. Langfuse
   Purpose: LLM tracing / prompt management / cost tracking
   Source: https://github.com/langfuse/langfuse
```

## 23.3 Required for PMF Experiment Expansion

```text
8. Formbricks
   Purpose: waitlist / survey / customer interview request / PMF signal collection
   Source: https://github.com/formbricks/formbricks

9. Activepieces
   Purpose: external app automation and notifications
   Source: https://github.com/activepieces/activepieces
```

## 23.4 Optional Later

```text
10. PostHog
    Purpose: landing/product analytics and event tracking
    Source: https://github.com/posthog/posthog

11. OpenPanel
    Purpose: lightweight analytics alternative
    Source: https://github.com/Openpanel-dev/openpanel

12. Plane
    Purpose: reference only for Kanban/work management UX or external issue board integration
    Source: https://github.com/makeplane/plane

13. Twenty
    Purpose: later Sales/CRM module integration when PMF creates real leads
    Source: https://github.com/twentyhq/twenty
```

---

# 24. Implementation Phases with Open Source

## Phase 1 — NocoBase Shell + Data Skeleton

### Goal

Business OS의 기본 데이터 구조와 운영 콘솔을 만든다.

### Install

```text
- NocoBase
- PostgreSQL
```

### Build

```text
Collections:
- FounderDNA
- FounderDNAUpdateSuggestion
- CompanyCulture
- DecisionRule
- BusinessIdea
- Business
- Workflow
- WorkflowStep
- Agent
- AgentAssignment
- PMFExperiment
- PMFExperimentMetric
- HermesAlert
- DecisionQueue
- BPRLog
- ToolRequest
- MemoryEntry
- WorkflowImprovementProposal
```

### Output

```text
- Founder DNA Room
- Business Portfolio Board
- PMF Experiment Board
- BPR Room
- Tool Request Lab
- Memory Room
- Hermes Alert Queue
- Decision Queue
```

---

## Phase 2 — L5 Core Package

### Goal

NocoBase에서 독립된 Business OS 핵심 로직을 만든다.

### Build

```text
packages/l5-core/
  founder-dna/
    scoreFounderFit.ts
    suggestFounderDnaUpdate.ts

  pmf-scoring/
    calculatePmfScore.ts
    decideToolCandidate.ts

  workflow-factory/
    generateBusinessBrief.ts
    generateWorkflow.ts
    generate7DayExperiment.ts

  agent-staffing/
    assignAgents.ts

  bpr/
    detectBottleneck.ts
    generateBprProposal.ts

  tool-request/
    createToolRequestCandidate.ts

  memory/
    createMemoryEntry.ts
    retrieveRelevantMemory.ts

  decision-rules/
    requiresFounderApproval.ts
```

### Rule

```text
`l5-core` must be testable without NocoBase.
```

---

## Phase 3 — L5 NocoBase Plugins

### Goal

NocoBase를 L5 Business OS로 바꾸는 전용 plugin layer를 만든다.

### Build

```text
@l5/plugin-founder-dna
@l5/plugin-business-portfolio
@l5/plugin-pmf-experiment
@l5/plugin-bpr-engine
@l5/plugin-tool-request
@l5/plugin-memory-room
@l5/plugin-hermes-control-room
@l5/plugin-workflow-factory
@l5/plugin-agent-staffing
```

### Plugin Responsibilities

```text
- Register collections
- Register pages/blocks
- Add action buttons
- Call `l5-core`
- Call Agent Runtime APIs
- Store generated outputs
- Show approval queues
```

---

## Phase 4 — Mastra Agent Runtime

### Goal

CEO Agent와 Chief of Staff Agent를 실제로 작동시킨다.

### Install

```text
- Mastra
```

### Build

```text
services/agent-runtime/
  agents/
    ceo-agent.ts
    chief-of-staff-agent.ts
    risk-qa-agent.ts

  tools/
    read-founder-dna.ts
    read-memory.ts
    create-pmf-experiment.ts
    create-bpr-log.ts
    create-tool-request.ts

  workflows/
    idea-intake.workflow.ts
    daily-brief.workflow.ts
    pmf-review.workflow.ts
```

### Output

```text
- Founder Fit Score
- Business Brief
- PMF Experiment Plan
- Agent Staffing Plan
- Daily Founder Brief
- Decision Digest
```

---

## Phase 5 — Trigger.dev Hermes Runtime

### Goal

Hermes를 상태 감시자와 트리거 엔진으로 만든다.

### Install

```text
- Trigger.dev
```

### Build

```text
services/hermes-runtime/
  tasks/
    morning-operating-loop.ts
    night-bpr-loop.ts
    stalled-workflow-detector.ts
    pmf-deadline-checker.ts
    founder-approval-checker.ts
    tool-request-candidate-detector.ts
    memory-update-suggestion-generator.ts
```

### Output

```text
- HermesAlert
- BPRLog
- ToolRequest candidate
- Founder Brief
- Workflow restart suggestion
```

---

## Phase 6 — Langfuse Observability

### Goal

AI 판단의 근거를 추적하고 프롬프트를 관리한다.

### Install

```text
- Langfuse
```

### Track

```text
- Workflow Factory generation
- CEO Agent decisions
- Founder Fit Score
- PMF Score
- BPR recommendations
- Tool Request recommendations
- Memory retrieval usage
```

---

## Phase 7 — Formbricks PMF Signal

### Goal

PMF 실험에서 실제 수요 신호를 수집한다.

### Install

```text
- Formbricks
```

### Build

```text
- Waitlist form template
- Customer interview form template
- PMF validation survey template
- Content/message feedback survey template
```

### Integration

```text
Formbricks response
→ webhook
→ Business OS PMFExperimentMetric
→ PMF Score update
→ MemoryEntry suggestion
```

---

## Phase 8 — Activepieces External Automation

### Goal

외부 채널 연결을 시작한다.

### Install

```text
- Activepieces
```

### Initial Flows

```text
- HermesAlert → Telegram/Slack
- FounderApprovalRequired → Telegram/Slack
- PMFFormSubmitted → Business OS webhook
- DailyFounderBrief → Email draft or Telegram message
```

### Approval Rule

```text
External send actions must require Founder approval until explicitly downgraded by risk policy.
```

---

# 25. License and Cost Guardrails

## 25.1 MVP Cost Rule

```text
- Use free/community/open-source features only.
- LLM API cost is allowed and expected.
- Server cost should remain within free tier or local/self-host range.
- Do not depend on commercial plugins for MVP-critical features.
```

## 25.2 NocoBase Guardrails

```text
Allowed for MVP:
- Community Edition
- Self-hosting
- Full source review
- Open-source plugins
- Custom L5 plugins
- Internal/personal use

Avoid during MVP:
- NocoBase commercial plugins as core dependency
- Removing NocoBase logo/brand/version information
- Building public no-code/low-code/AI platform SaaS on top of NocoBase
- Deep core patches
```

## 25.3 Formbricks Guardrails

```text
Allowed for MVP:
- Core AGPL features
- Link surveys
- Website surveys
- Waitlist
- Feedback forms

Avoid during MVP:
- Enterprise-only features
- Private fork modifications without understanding AGPL obligations
- White-labeling dependency
```

## 25.4 Activepieces Guardrails

```text
Allowed for MVP:
- Community Edition
- MIT-licensed core features
- External app automations

Avoid during MVP:
- Enterprise-only features
- Building customer-facing automation platform around Activepieces
```

## 25.5 Langfuse Guardrails

```text
Allowed for MVP:
- OSS/self-host core
- Prompt management
- Tracing
- Cost tracking
- Evaluation

Avoid during MVP:
- Enterprise SSO/RBAC/audit log dependency
```

## 25.6 PostHog Guardrails

```text
Allowed later:
- Cloud free tier
- Self-host hobby deployment

Avoid during MVP:
- Overengineering analytics before PMF experiments require it
- Treating PostHog as mandatory for Phase 1
```

---

# 26. Fallback / Migration Strategy

## 26.1 Why fallback is needed

NocoBase is used for MVP speed. If the product later becomes a paid SaaS or customer-facing OS, the team may decide to move from NocoBase to a custom Next.js/Payload/Directus base.

## 26.2 What must be portable

```text
Portable:
- `l5-core` domain logic
- Agent prompts and policies
- Workflow templates
- PMF scoring rules
- BPR rules
- Tool Request rules
- Memory schema
- Decision authority rules

Not necessarily portable:
- NocoBase page layout
- NocoBase collection UI
- NocoBase-specific action blocks
- NocoBase-specific plugin lifecycle code
```

## 26.3 Migration Rule

```text
All critical logic must live in `packages/l5-core` or `services/*`, not inside NocoBase plugin UI code.
```

## 26.4 Future Alternative Bases

```text
If needed later:
- Payload + Next.js
- Directus + Next.js
- Custom Next.js + Postgres
```

---

# 27. Key Implementation Instruction for Claude Code — Open Source Version

Claude Code must follow these rules when implementing this PRD.

```text
1. Use NocoBase as the MVP shell, not as the place where all domain logic lives.
2. Do not modify NocoBase core unless explicitly required.
3. Implement L5 Business OS features as plugins and external services.
4. Keep `l5-core` independent from NocoBase.
5. Do not use NocoBase commercial plugins for MVP-critical functions.
6. Do not introduce paid SaaS dependencies unless the Founder approves.
7. Use Mastra for agent runtime, not NocoBase workflow alone.
8. Use Trigger.dev for Hermes long-running/scheduled tasks, not ad-hoc cron scattered in the app.
9. Use Langfuse to trace all important LLM decisions.
10. Use Formbricks only for PMF signal collection, not as the Business OS source of truth.
11. Use Activepieces only for external automation connectors, not as the Business OS brain.
12. Store source of truth in NocoBase/Postgres and `l5-core` schemas.
13. Every external action must have risk level and approval gate.
14. MVP success means the operating loop works, not that every final UI is custom-polished.
15. If NocoBase becomes limiting, preserve `l5-core` and migrate the shell later.
```

---

# 28. Open Source Download & Integration Plan

## 28.1 Purpose

This section defines exactly which open-source components should be downloaded or installed for the MVP, what each component is responsible for, and what must not be delegated to that component.

The goal is to maximize MVP development speed while preserving long-term migration optionality.

```text
Core principle:
Use NocoBase for MVP speed.
Keep L5 Core independent.
Use external services only for their strongest responsibility.
Do not let any single open-source tool become the entire Business OS.
```

---

## 28.2 Components to Download / Install

| Priority | Component | Install / Source Strategy | MVP Responsibility | Do Not Use For |
|---:|---|---|---|---|
| 1 | **NocoBase Community Edition** | Use Git source or Docker-based self-host. Prefer Git source if plugin development/debugging is required. | Business OS Shell, admin UI, data collections, CRUD, permissions, plugin host, internal rooms | L5 domain logic, long-running agent loops, final customer-facing SaaS UX |
| 2 | **PostgreSQL** | Docker/local managed DB | Source-of-truth database for NocoBase collections and L5 records | Business reasoning, agent execution |
| 3 | **L5 Core** | Build as first-party package under `packages/l5-core` | Founder DNA scoring, Workflow Factory rules, PMF scoring, BPR rules, Tool Request rules, Memory rules, Decision Authority | UI-only logic, NocoBase-specific adapters |
| 4 | **L5 NocoBase Plugins** | Build under `apps/nocobase/plugins/@l5/*` | Adapter layer between NocoBase UI and `l5-core` | Permanent home of core business logic |
| 5 | **Mastra** | Separate TypeScript service/package | CEO Agent, Chief of Staff Agent, agent workflows, agent tools, future RAG/agent memory | NocoBase UI rendering, source-of-truth DB |
| 6 | **Trigger.dev** | Self-host or free/cloud dev tier first | Hermes schedules, stalled workflow detection, retryable jobs, long-running tasks, approval-pause loops | Business data ownership, core UI |
| 7 | **Langfuse** | Self-host OSS/core first | LLM traces, prompt versions, reasoning logs, cost and quality review | Source-of-truth operational records |
| 8 | **Formbricks** | Self-host/core or free cloud for early PMF | Waitlist, survey, interview requests, PMF signal collection | Business OS database of record |
| 9 | **Activepieces Community Edition** | Self-host/community first | Telegram, Slack, Gmail, Google Sheets, Notion, webhook automation | Business OS brain, internal decision logic |
| Optional | **PostHog / OpenPanel** | Defer until landing/product analytics are needed | Event analytics, funnel, content/landing tracking | Phase 1 MVP requirement |

---

## 28.3 Installation Order

The MVP should not attempt to install and integrate all tools at once.

```text
1. NocoBase + PostgreSQL
2. L5 Core package
3. L5 NocoBase plugins
4. Mastra agent runtime
5. Trigger.dev Hermes runtime
6. Langfuse tracing
7. Formbricks PMF signal collection
8. Activepieces external automation
9. Optional analytics
```

---

## 28.4 Tool Responsibility Boundaries

### NocoBase

```text
Use for:
- Admin shell
- Business OS rooms
- Collection/schema management
- Basic permissions
- Internal operation pages
- Plugin extension
- Approval/status/action UI

Avoid:
- Deep L5 reasoning logic
- Durable agent execution
- Customer-facing SaaS product shell dependency
- Commercial plugins as MVP-critical dependency
```

### L5 Core

```text
Use for:
- Founder Fit scoring
- PMF score calculation
- Workflow generation rules
- Agent staffing rules
- BPR rules
- Tool Request rules
- Memory abstraction rules
- Decision Authority rules
- Data governance policies

Rule:
`l5-core` must run and pass tests without NocoBase.
```

### L5 NocoBase Plugins

```text
Use for:
- Registering L5 collections
- Rendering L5 rooms
- Calling L5 Core functions
- Calling Mastra/Trigger.dev APIs
- Writing outputs back to Postgres/NocoBase
- Founder approval/rejection actions

Avoid:
- Hardcoding domain scoring logic in UI components
- Storing secret prompts directly in plugin UI
- Long-running jobs inside plugin request handlers
```

### Mastra

```text
Use for:
- CEO Agent
- Chief of Staff Agent
- Agent workflows
- Agent tool calls
- Agent output validation
- Future multi-agent workflows

Avoid:
- Permanent operational data storage
- UI state management
```

### Trigger.dev

```text
Use for:
- Hermes daily loop
- Nightly BPR loop
- PMF experiment deadline checks
- Stalled workflow detection
- Retryable tasks
- Approval wait states
- Tool Request candidate triggers

Avoid:
- Business source-of-truth database
- Frontend workflow UI
```

### Langfuse

```text
Use for:
- LLM traces
- Prompt versioning
- Evaluation logs
- Debugging agent decisions
- Cost monitoring

Avoid:
- Storing unmasked customer personal data
- Replacing Memory Engine
```

### Formbricks

```text
Use for:
- PMF surveys
- Waitlists
- Interview requests
- Feedback collection
- Demand validation

Avoid:
- Source-of-truth CRM
- Business OS internal Memory database
```

### Activepieces

```text
Use for:
- External automation
- Notification delivery
- Webhook bridges
- Gmail/Slack/Telegram/Sheets/Notion connectors

Avoid:
- Core decision-making
- L5 workflow brain
- Sensitive customer data fan-out unless necessary
```

---

# 29. MVP Cost and License Guardrails

## 29.1 Cost Position

The MVP should be designed to run with minimal cost.

```text
Expected unavoidable cost:
- LLM API usage

Avoid during MVP:
- Paid NocoBase commercial plugins
- Paid automation SaaS dependency
- Paid analytics dependency
- Paid database dependency if local/free hosting is enough
- Paid user-seat software
```

## 29.2 NocoBase License Position

NocoBase Community Edition is acceptable for the MVP because the project is currently personal/internal and not yet commercialized.

However, this project must be designed with future optional migration in mind.

```text
Allowed during MVP:
- NocoBase Community Edition
- Self-hosting
- Open-source plugins
- Custom L5 plugins
- NocoBase logo/version/copyright retained

Avoid during MVP:
- Depending on commercial NocoBase plugins for critical features
- Removing NocoBase branding/version/copyright information
- Building a public no-code/low-code/AI platform SaaS on top of NocoBase
```

## 29.3 Future Commercialization Review Trigger

A license and architecture review is required before any of the following:

```text
- Selling L5 Business OS to external customers
- Offering L5 Business OS as a SaaS
- Removing NocoBase branding
- Giving customers app-building/no-code configuration capabilities
- Packaging NocoBase-based software for clients
- Using NocoBase commercial plugins as core dependencies
```

## 29.4 Migration Readiness Rule

```text
If NocoBase becomes expensive, limiting, or legally ambiguous later,
replace the Shell.
Do not rewrite the OS brain.
```

This is why `l5-core` must remain portable.

---

# 30. Data Ownership and Access Control

## 30.1 Data Ownership Principle

All core business data, insights, workflows, experiment results, memory entries, agent outputs, BPR logs, and Tool Request records must be stored in a self-controlled database.

```text
Source of truth:
PostgreSQL / NocoBase collections / L5 Core schemas

Not source of truth:
Langfuse
Formbricks
Activepieces
LLM provider logs
External automation tools
```

## 30.2 Founder Data Access Principle

The Founder must have full access to all core Business OS data.

```text
Founder can:
- View all core data
- Export all core data
- Back up all core data
- Delete internal records when appropriate
- Reuse non-personal business insights
- Migrate data to another shell
- Audit agent decisions
- Review customer data access logs
```

## 30.3 Data Categories

Business OS data must be classified into the following categories.

| Category | Example | Access Default | Usage Default |
|---|---|---|---|
| Founder Data | Founder DNA, preferences, decisions | Founder only / trusted admin | Internal OS improvement |
| Company Data | Culture, decision rules, workflows | Founder + authorized agents | Internal operations |
| Business Insight | PMF learnings, message patterns, BPR insights | Founder + relevant agents | Reusable across businesses |
| Customer PII | Name, email, phone, company, contact history | Restricted | Only within consented purpose |
| Customer Sensitive Context | Revenue, pain points, private consultation details | Highly restricted | Minimized and purpose-bound |
| Agent Logs | reasoning, outputs, tool calls | Founder + QA/admin | Debugging and improvement |
| External Automation Data | webhook payloads, notification events | Restricted | Delivery/notification only |

---

## 30.4 Insight vs Personal Data Separation

Business insights and customer-identifiable data must be separated.

```text
Good reusable insight:
"Small cafe owners responded better to revenue-improvement messages than automation-efficiency messages."

Restricted customer record:
"A specific cafe owner named X with phone number Y said their monthly ad budget is Z."
```

### Required Schema Pattern

```text
customer_profiles
  - customer_id
  - name
  - email
  - phone
  - company
  - pii_level
  - consent_status

customer_consents
  - consent_id
  - customer_id
  - consent_scope
  - consent_source
  - consent_date
  - expires_at

customer_interactions
  - interaction_id
  - customer_id
  - channel
  - summary
  - raw_content_location
  - pii_level

business_insights
  - insight_id
  - related_customer_segment
  - anonymized_insight
  - evidence_refs
  - confidence
  - reusable_scope

memory_entries
  - memory_id
  - type
  - insight
  - evidence
  - pii_level
  - allowed_usage
  - source_ref
```

---

# 31. Privacy and Customer Data Policy

## 31.1 Privacy Principle

Customer-identifiable information must be treated differently from business insights.

```text
Business insights can become company memory.
Customer personal data must remain purpose-bound, access-controlled, and minimized.
```

## 31.2 Purpose Limitation Rule

Customer personal data may only be used within the purpose disclosed or consented to at collection.

If the data is later used for a new purpose, such as a different business, new marketing campaign, third-party transfer, or unrelated product, additional consent may be required.

## 31.3 Consent Scope for PMF Experiments

PMF experiment forms should collect consent for realistic future usage without being overly broad.

Recommended consent scope:

```text
- Service and business idea validation
- Customer interview/contact
- Consultation or proposal follow-up
- Related service/product information
- Marketing, branding, automation, or AI solution development research
- Anonymized insight analysis and internal service improvement
```

Avoid vague or excessive wording such as:

```text
"We can use your information for any future purpose."
```

## 31.4 LLM and External Tool Data Minimization

When sending data to LLM APIs or external automation tools:

```text
Required:
- Remove or mask names, phone numbers, emails when not necessary
- Use customer segment or anonymized summaries by default
- Send minimum necessary fields only
- Avoid storing raw sensitive PII in Langfuse traces
- Keep external automation payloads narrow
- Mark every LLM call with pii_level
```

## 31.5 Agent Access Policy

```text
CEO Agent:
- Can access summarized business context
- Can access customer segment insights
- Needs approval for raw customer PII

Chief of Staff Agent:
- Can access decision queue and summary data
- Can prepare Founder Briefs
- Should use anonymized summaries where possible

CMO/CRO Agents:
- Can access PMF experiment summaries
- Can access contact data only for approved outreach tasks

Risk/QA Agent:
- Can audit PII usage and external action risk

External Automation:
- Receives only fields required for delivery
```

---

# 32. Data Export, Backup, and Migration Requirements

## 32.1 Export Requirement

The system must support export of all core records.

```text
Minimum export formats:
- JSON
- CSV
- Markdown for human-readable docs
```

## 32.2 Backup Requirement

```text
MVP backup:
- Manual database dump
- Git-tracked schema/config docs
- Periodic export of key collections

Later backup:
- Scheduled DB backup
- Object storage backup
- Encrypted backup retention
```

## 32.3 Migration Requirement

Every L5 Core domain entity must have an explicit schema independent of NocoBase UI.

```text
Must be portable:
- Founder DNA
- Memory Entry
- Business Idea
- PMF Experiment
- Workflow
- Workflow Step
- Agent Assignment
- Hermes Alert
- BPR Log
- Tool Request
- Decision Queue
- Workflow Improvement Proposal
- Customer Consent
- Business Insight
```

---

# 33. Security and Access Control Requirements

## 33.1 Roles

```text
Founder / Owner
- Full system access
- Data export
- Permission management
- External action approval
- License/commercialization decisions

Admin / Operator
- Operational data management
- No license/commercial decisions
- Limited export based on permission

Agent Runtime
- API-scoped access
- No direct DB superuser access
- No unrestricted customer PII access

Automation Connector
- Webhook-scoped access only
- No broad database access

Viewer / Collaborator
- Project-specific read-only or limited write access
```

## 33.2 Approval Gates

Every external action must include a risk level.

```text
D1 — Internal draft only
D2 — Internal execution only
D3 — Low-risk external draft, approval required before send
D4 — Customer-facing message, Founder approval required
D5 — Legal/financial/public commitment, Founder approval required and logged
```

## 33.3 Audit Log Requirement

The system should log:

```text
- Who accessed customer PII
- Which agent used which data
- Which LLM call included PII
- Which external automation sent data out
- Who approved external actions
- What was exported and by whom
```

---

# 34. New Feature Addition Protocol

When adding a new feature, classify it first.

## 34.1 Feature Placement Rule

| Feature Type | Where It Belongs |
|---|---|
| Domain rule / scoring / decision logic | `packages/l5-core` |
| Internal room / admin UI / status board | NocoBase plugin |
| Long-running task / schedule / retry | Trigger.dev |
| Agent reasoning / multi-step AI workflow | Mastra |
| LLM trace / prompt version / evaluation | Langfuse |
| Survey / waitlist / PMF response capture | Formbricks |
| Telegram / Gmail / Slack / Notion / Sheets connection | Activepieces |
| Customer-facing polished UX | Future custom Next.js shell |

## 34.2 Feature Development Flow

```text
1. Define domain logic in l5-core
2. Add or update schema
3. Add tests for l5-core
4. Add NocoBase plugin UI/action if needed
5. Add Mastra agent tool if AI execution is needed
6. Add Trigger.dev task if long-running/retry/schedule is needed
7. Add Langfuse trace if LLM is involved
8. Add access control and PII classification
9. Add export/migration compatibility
10. Update docs
```

---

# 35. MVP Acceptance Criteria — Updated

The MVP is successful when the following are true.

```text
1. Founder can enter a new business idea.
2. System creates Founder Fit evaluation using l5-core.
3. System generates PMF Experiment Plan before Tool Request.
4. System creates Workflow and Agent Staffing Plan.
5. System stores all outputs in NocoBase/Postgres.
6. CEO Agent and Chief of Staff Agent can generate structured outputs.
7. Hermes can detect stalled workflows or pending deadlines.
8. Decision Queue shows Founder approval items.
9. BPR Log captures bottlenecks and recommendations.
10. Tool Request Lab receives repeated-work candidates.
11. Memory Room stores business insights separately from customer PII.
12. Customer data has consent scope and pii_level.
13. LLM calls can be traced through Langfuse.
14. External automation is optional and limited by approval gates.
15. Core data can be exported.
16. l5-core can run tests without NocoBase.
17. NocoBase can be replaced later without rewriting the OS brain.
```

---

# 36. Final Development Doctrine

```text
Build fast with NocoBase.
Think independently with L5 Core.
Run agents outside the shell.
Run Hermes as durable jobs.
Trace every important LLM decision.
Collect PMF signals before building tools.
Separate customer PII from reusable insights.
Keep data exportable.
Avoid commercial plugin dependency.
Prepare for future migration before it is needed.
```

This is the implementation doctrine for the L5 Business OS MVP.

---

# 37. Source Notes for Current Open-Source / Legal Assumptions

These source notes are for implementation planning only. They must be rechecked before commercialization.

```text
NocoBase:
- Community Edition, commercial pricing, self-hosting, source code, unlimited usage assumptions should be checked against the official NocoBase commercial/pricing page before use.
- Plugin/microkernel assumptions should be checked against official NocoBase plugin development documentation.

Mastra:
- Agent runtime and Apache 2.0/open-source assumptions should be checked against Mastra official site and GitHub repository.

Trigger.dev:
- Long-running task, retry, queue, observability, self-host/open-source assumptions should be checked against Trigger.dev official site and GitHub repository.

Privacy:
- Korean personal-data processing assumptions should be checked against the current Personal Information Protection Act and, if needed, a qualified legal professional before external customer use.
```

