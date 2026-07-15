# PRD: Pulk CMO Video Room

**Version:** 1.1  
**Date:** 2026-06-04  
**Owner:** Founder / CMO Agent  
**Related System:** Pulk L5 Business OS, AI Slide Video Factory  
**Viewtrap URL:** https://app.viewtrap.com/video-search

---

## 1. Product Name

**Pulk CMO Video Room**

### One-line Definition

Pulk CMO Video Room은 Founder가 CMO와 직접 대화하기 전에 Second Brain의 최신 비즈니스 PT 자료를 먼저 흡수하고, 그 컨텍스트를 기반으로 Viewtrap 기반 레퍼런스 리서치와 Second Brain 인사이트를 결합해 **하나의 키 콘텐츠와 그에 연결되는 5개의 풀링 콘텐츠 세트**를 기획하고, 승인된 콘텐츠만 AI Slide Video Factory로 넘겨 영상 제작, QA, 업로드 초안까지 관리하는 전략형 콘텐츠 운영실이다.

---

## 2. Background

기존 Pulk 구조는 Founder가 CEO에게 방향을 주고, CEO가 각 Agent에게 task를 배정하는 방식에 가깝다. 이 구조는 일반적인 회사 운영, 개발 작업, 조사 업무에는 적합하지만, 유튜브 콘텐츠 제작에는 한계가 있다.

유튜브 영상 제작은 단순 산출물 작업이 아니라 다음 요소들이 연결된 전략 워크플로우다.

```text
Business PT Context Loading
→ 상품 정의
→ 고객 문제 정의
→ 키 콘텐츠 기획
→ Viewtrap 리서치
→ 키 콘텐츠 1개 확정
→ 풀링 콘텐츠 리서치
→ 풀링 콘텐츠 5개 선별
→ 레퍼런스 썸네일 구조 분석
→ 영상 초반 30초 원고 분석
→ Second Brain 인사이트 결합
→ 썸네일/제목/도입부 승인
→ 원고 작성
→ Founder 녹음
→ 슬라이드 영상 제작
→ QA
→ 업로드 초안
```

따라서 영상 제작은 CEO가 CMO에게 단일 task를 배정하는 구조가 아니라, Founder가 CMO와 직접 대화하고 의사결정하는 전용 공간에서 다뤄야 한다.

---

## 3. Core Product Decision

### 기존 방식

```text
Founder
→ CEO
→ CMO에게 task 배정
→ CMO 산출물 생성
→ Founder 검토
```

### 변경 방식

```text
Founder
↔ CMO Video Room
→ 콘텐츠 전략 워크플로우
→ 승인 게이트
→ AI Slide Video Factory
→ QA
→ 업로드 초안
```

CEO는 완전히 빠지지 않는다. 다만 CEO는 다음 상황에서만 관여한다.

- 콘텐츠 방향이 전체 사업 방향을 바꾸는 경우
- 가격, 계약, 정책, 리스크가 포함되는 경우
- 브랜드 방향이 크게 바뀌는 경우
- 법적/재무적 리스크가 있는 경우
- 중요한 외부 공개 메시지에 해당하는 경우

---

## 4. Product Philosophy

### 4.0 기획 시작 전 Business PT Context Loading을 먼저 수행한다

Video Room에서 새 영상 프로젝트를 시작하면 CMO는 바로 상품/키 콘텐츠 기획으로 들어가지 않는다. 먼저 Second Brain 또는 Notion에 축적된 최신 비즈니스 PT 자료를 불러와 현재 프로젝트의 기획 컨텍스트로 흡수해야 한다.

이유:

```text
비즈니스 PT 강의가 진행될수록
키 콘텐츠/풀링 콘텐츠/썸네일/도입부/원고 구조에 대한 인사이트가 계속 깊어진다.
따라서 CMO가 고정된 오래된 프롬프트만 보고 기획하면 안 된다.
매 프로젝트 시작 시점에 최신 비즈니스 PT 인사이트를 다시 로딩해야 한다.
```

CMO는 다음 자료를 우선 검색한다.

```text
비즈니스 PT 강의 자료
비즈니스 PT 컨설팅 기록
키 콘텐츠 기획 자료
풀링 콘텐츠 기획 자료
썸끝/원끝 분석 자료
Viewtrap 기반 레퍼런스 분석 자료
마케팅 자동화 사업 관련 콘텐츠 기획 자료
이전 Video Room 프로젝트의 성과/실패 Memory
```

Context Loading 결과는 단순 참고가 아니라 `BusinessPTContextSnapshot`으로 저장한다. 이후 키 콘텐츠 후보, 풀링 콘텐츠 세트, 썸네일/제목/도입부 후보를 만들 때 CMO는 이 스냅샷을 근거로 사용해야 한다.

금지 규칙:

```text
Business PT Context Loading 없이 키 콘텐츠 후보 생성 금지
최신 비즈니스 PT 자료 검색 없이 풀링 콘텐츠 세트 확정 금지
Second Brain 인사이트 스냅샷 없이 원고 구조 확정 금지
```

---

### 4.1 Video Room은 단순 채팅방이 아니다

CMO와 대화하는 채팅은 필요하지만, 채팅만 있으면 중요한 기획과 승인이 대화 로그 안에 묻힌다.

따라서 Video Room은 다음 세 가지를 동시에 제공해야 한다.

```text
CMO 대화
+ 구조화된 콘텐츠 워크플로우
+ 승인/수정/보류 의사결정 패널
```

### 4.2 한 화면에 모든 것을 넣지 않는다

영상 제작 과정은 매우 길다. 한 화면에 채팅, 키 콘텐츠, 풀링 콘텐츠, Viewtrap 리서치, 썸네일, 원고, 렌더링, QA, 업로드를 모두 넣으면 복잡도가 과도하게 올라간다.

따라서 Video Room 내부에 네비게이션을 두고 3개 페이지로 나눈다.

```text
1. Strategy Page
2. Production Page
3. Review & Publish Page
```

### 4.3 승인 없는 자동화는 금지한다

아래 단계는 반드시 Founder 승인 후 진행한다.

- 키 콘텐츠 확정
- 풀링 콘텐츠 5개 세트 확정
- 썸네일/제목/도입부 확정
- 전체 원고 확정
- 영상 QA 통과
- 업로드 초안 승인

### 4.4 CMO는 영상 제작자가 아니라 콘텐츠 전략 총괄자다

CMO의 핵심 역할은 영상을 직접 렌더링하는 것이 아니다.

CMO는 다음을 담당한다.

- 상품/타깃/고객 문제 정리
- 키 콘텐츠 후보 기획
- Viewtrap 기반 성과 콘텐츠 탐색
- 같은 고객이 보고 있는 콘텐츠 지도 분석
- 키 콘텐츠 1개 확정 제안
- 키 콘텐츠에 연결될 풀링 콘텐츠 5개 선별
- 레퍼런스 썸네일 구조 분석
- 영상 초반 30초 원고 분석
- Second Brain 인사이트 결합
- 썸네일/제목/도입부 후보 생성
- 승인된 기획을 Production Page로 전달

실제 영상 렌더링은 AI Slide Video Factory가 담당한다.

---

## 5. Overall Information Architecture

### 5.1 Video Room Internal Navigation

```text
[Strategy] [Production] [Review & Publish]
```

각 탭은 독립 페이지처럼 동작한다.

### 5.2 Common Header

모든 페이지 상단에는 공통 헤더가 존재한다.

표시 정보:

- Video Project Title
- 현재 상태
- 현재 단계
- 승인 필요 여부
- 마지막 업데이트
- 담당 Agent
- 연결된 Business / Product
- Viewtrap Research 상태
- 연결된 Key Content Set

예시:

```text
AI 마케팅팀 상품 판매용 콘텐츠 세트

Status: Strategy Research In Progress
Current Stage: Viewtrap Pulling Content Research
Content Set: Key Content 1개 + Pulling Content 5개
Approval Needed: 0
Connected Product: AI 마케팅 자동화 팀
```

### 5.3 Common Mini Roadmap

모든 페이지 상단에는 전체 흐름을 작게 보여준다.

```text
PT 컨텍스트 ✓
→ 상품정의 ✓
→ 키콘텐츠 후보 ✓
→ Viewtrap 키 리서치 ●
→ 키콘텐츠 승인 ○
→ 풀링 5개 ○
→ Hook 승인 ○
→ 원고 ○
→ 녹음 ○
→ 렌더 ○
→ QA ○
→ 업로드 ○
```

단, 상세 정보는 현재 페이지의 본문에서만 보여준다.

---

## 6. Page 1: Strategy Page

### 6.1 Purpose

Strategy Page는 CMO와 Founder가 함께 **하나의 키 콘텐츠와 그 키 콘텐츠로 연결되는 5개의 풀링 콘텐츠 세트**를 기획하는 페이지다.

### 6.2 Strategy Page Scope

이 페이지에서는 다음을 다룬다.

```text
Business PT 자료 흡수
Business PT Context Snapshot 생성
상품/타깃/문제 정의
키 콘텐츠 후보 생성
Viewtrap 키 콘텐츠 리서치
키 콘텐츠 1개 확정
Viewtrap 풀링 콘텐츠 리서치
풀링 콘텐츠 5개 선별
레퍼런스 영상 저장
썸네일 구조 분석
영상 주소 진입
초반 30초 원고 분석
Second Brain 인사이트 적용
썸네일/제목/도입부 승인
```

### 6.3 Layout

```text
┌──────────────────────────────────────────────────────┐
│ Video Room Header                                    │
├──────────────────────────────────────────────────────┤
│ Mini Roadmap                                         │
├────────────────────┬────────────────────┬────────────┤
│ CMO Chat            │ Strategy Board      │ Decision   │
│                    │                    │ Panel      │
└────────────────────┴────────────────────┴────────────┘
```

### 6.4 Left: CMO Chat

CMO Chat은 Founder와 CMO가 콘텐츠 전략을 논의하는 공간이다.

CMO는 현재 단계에 맞춰 질문하고, 검색 결과와 판단 근거를 설명하며, 다음 승인 항목을 명확히 제안한다.

CMO 응답 포맷:

```text
현재 페이지:
현재 단계:
현재 상황:
Business PT Context Snapshot:
핵심 판단:
Viewtrap에서 확인한 근거:
Second Brain에서 가져온 인사이트:
선택지:
추천안:
Founder 승인 필요 여부:
다음 액션:
```

### 6.5 Center: Strategy Board

Strategy Board는 대화와 리서치에서 나온 내용을 카드로 구조화한다.

카드 구성:

```text
Business PT Context Snapshot Card
Product Strategy Card
Customer Problem Card
Key Content Candidate Card
Viewtrap Key Research Card
Selected Key Content Card
Viewtrap Pulling Research Card
Pulling Content Set Card
Reference Video Card
Thumbnail Pattern Card
Intro 30s Analysis Card
Second Brain Insight Merge Card
Hook Draft Card
```

### 6.6 Right: Strategy Decision Panel

현재 단계에서 Founder가 결정해야 하는 항목만 보여준다.

예시:

```text
승인 필요: 키 콘텐츠 확정

CMO 추천안:
“마케팅 대행사 쓰기 전에 작은 브랜드 대표가 먼저 알아야 할 것”

추천 이유:
- 고객 문제와 직접 연결됨
- 계획 단계까지 자연스럽게 이동 가능
- 풀링 콘텐츠 5개를 붙이기 쉬움
- 상담 신청 CTA가 자연스럽게 붙음

선택지:
[승인] [수정 요청] [다른 후보 보기] [보류]
```

---

## 7. Strategy Workflow Detail

### 7.0 Business PT Context Loading

새 VideoProject가 생성되면 Strategy Page의 첫 단계는 `business_pt_context_loading`이다. CMO는 Founder에게 바로 콘텐츠 후보를 던지지 않고, 먼저 Second Brain에서 비즈니스 PT 관련 자료를 검색해 현재 프로젝트에 적용할 기획 원칙을 정리한다.

CMO가 실행해야 하는 검색 쿼리 예시:

```text
비즈니스 PT 키 콘텐츠 기획
비즈니스 PT 풀링 콘텐츠 기획
현상 욕구 계획 행동 보상 콘텐츠 구조
썸끝 원끝 썸네일 도입부 원고 구조
Viewtrap 검색 키워드 확장 콘텐츠 지도
마케팅 자동화 사업 키 콘텐츠 풀링 콘텐츠
```

CMO 출력:

```text
이번 프로젝트에 적용할 비즈니스 PT 원칙:
키 콘텐츠 판단 기준:
풀링 콘텐츠 판단 기준:
Viewtrap 리서치 기준:
썸네일/제목 분석 기준:
초반 30초 도입부 분석 기준:
원고 구조에 반영할 인사이트:
주의해야 할 금지 패턴:
```

이 단계의 완료 조건:

```text
최소 3개 이상의 관련 Business PT/Second Brain 자료 참조
현재 프로젝트에 적용할 기획 원칙 요약
키 콘텐츠/풀링 콘텐츠 판단 기준 생성
Context Snapshot 저장
```

출력 타입:

```ts
type BusinessPTContextSnapshot = {
  id: string;
  video_project_id: string;
  loaded_at: string;
  source_refs: {
    source_id: string;
    title: string;
    source_type: 'notion' | 'second_brain' | 'memory' | 'manual';
    url?: string;
  }[];
  key_principles: string[];
  key_content_rules: string[];
  pulling_content_rules: string[];
  thumbnail_intro_rules: string[];
  script_structure_rules: string[];
  caution_notes: string[];
  freshness_status: 'fresh' | 'stale' | 'needs_refresh';
};
```

---

### 7.1 Product Strategy

입력 항목:

```text
상품명
타깃 고객
고객 문제
비즈니스 목표
핵심 USP
판매 방식
CTA
```

예시:

```text
상품:
AI 마케팅 자동화 팀

타깃:
마케팅팀을 둘 여력이 없는 작은 브랜드 대표

문제:
마케팅을 잘 모르고, 콘텐츠를 올려도 성과를 판단하지 못함

비즈니스 목표:
상담 신청 / 대기자 모집

CTA:
AI 마케팅팀 진단 신청
```

### 7.2 Key Content Ideation

CMO는 먼저 키 콘텐츠 후보를 만든다. 이 단계에서는 확정하지 않는다.

출력 타입:

```ts
type KeyContentCandidate = {
  id: string;
  title: string;
  target_problem: string;
  consumer_stages: ('현상' | '욕구' | '계획' | '행동' | '보상')[];
  sales_logic: string;
  cta: string;
  why_this_can_sell: string;
  research_status: 'not_researched' | 'researching' | 'validated' | 'rejected';
};
```

### 7.3 Viewtrap Key Research

CMO는 Viewtrap에서 키 콘텐츠 관련 키워드를 검색한다.

Viewtrap URL:

```text
https://app.viewtrap.com/video-search
```

전제:

- 사용자의 브라우저에서 Viewtrap에 접속하면 자동 로그인되어 있다.
- 초기 MVP에서는 사용자가 직접 검색하거나 CMO가 검색 키워드와 체크리스트를 제공한다.
- 추후 브라우저 자동화 단계에서는 사용자의 로컬 브라우저 세션을 열어 Viewtrap에 접속하고, 저장된 로그인 세션을 활용한다.
- 비밀번호나 인증 정보를 시스템에 저장하지 않는다.

검색 전략:

```text
1. 상품 키워드 검색
2. 고객 문제 키워드 검색
3. 기능 키워드 검색
4. 욕구 키워드 검색
5. 대체재/경쟁재 키워드 검색
6. 같은 고객이 볼 만한 인접 카테고리 검색
```

예시 키워드:

```text
마케팅 자동화
AI 마케팅
콘텐츠 마케팅
인스타그램 마케팅
작은 브랜드 마케팅
1인 창업 마케팅
광고비 낭비
마케팅 대행사
AI 콘텐츠 자동화
```

CMO가 확인해야 하는 것:

```text
조회수
업로드일
최근 조회수 상승 여부
구독자 대비 조회수
기여도
홈 화면 선택 가능성이 높은 썸네일인지
같은 고객이 보는 콘텐츠인지
콘텐츠가 현상/욕구/계획/행동/보상 중 어디에 있는지
```

### 7.4 Key Content Selection

Viewtrap 리서치 후 키 콘텐츠 1개를 확정한다.

선택 기준:

```text
이 콘텐츠를 보면 상품을 사고 싶어지는가?
고객의 문제와 직접 연결되는가?
계획 또는 행동 단계까지 갈 수 있는가?
CTA가 자연스럽게 붙는가?
풀링 콘텐츠 5개를 붙일 수 있는가?
레퍼런스가 충분히 있는가?
```

출력 타입:

```ts
type SelectedKeyContent = {
  id: string;
  title: string;
  core_problem: string;
  consumer_stages: ('욕구' | '계획' | '행동' | '보상')[];
  sales_logic: string;
  cta: string;
  selected_reason: string;
  viewtrap_evidence: ViewtrapReference[];
  approval_status: 'draft' | 'approved' | 'needs_revision';
};
```

### 7.5 Viewtrap Pulling Content Research

키 콘텐츠가 확정되면, 그 키 콘텐츠를 볼 만한 사람을 끌어올 풀링 콘텐츠를 찾는다.

핵심 질문:

```text
이 풀링 콘텐츠를 본 사람이 키 콘텐츠를 볼까?
```

Viewtrap 검색 전략:

```text
1. 키 콘텐츠 제목을 그대로 검색
2. 키 콘텐츠 핵심 문제를 검색
3. 고객이 겪는 현상 키워드 검색
4. 고객이 원하는 욕구 키워드 검색
5. 고객이 이미 보고 있는 인접 콘텐츠 검색
6. 성과 좋은 영상의 제목 키워드를 다시 검색
7. 좋은 썸네일의 반복 키워드로 재검색
```

### 7.6 Pulling Content Set Selection

풀링 콘텐츠는 하나만 고르지 않는다. 키 콘텐츠 1개에 연결될 **풀링 콘텐츠 5개**를 선별한다.

구조:

```text
Key Content 1개
+
Pulling Content 5개
```

풀링 콘텐츠 5개 역할:

| 번호 | 역할 | 소비자 단계 | 목적 |
|---:|---|---|---|
| 1 | 문제 인식 | 현상 | “내 문제다”라고 느끼게 함 |
| 2 | 문제 심화 | 현상 → 욕구 | 문제의 심각도를 키움 |
| 3 | 욕구 형성 | 욕구 | “나도 저렇게 되고 싶다”를 만듦 |
| 4 | 계획 진입 | 계획 | 해결 방식에 관심을 갖게 함 |
| 5 | 키 콘텐츠 브릿지 | 계획 | 키 콘텐츠를 볼 이유를 만듦 |

출력 타입:

```ts
type PullingContentSet = {
  id: string;
  key_content_id: string;
  pulling_contents: PullingContentPlan[];
  set_logic: string;
  funnel_coverage: {
    phenomenon: string[];
    desire: string[];
    plan: string[];
    action_bridge: string;
  };
  approval_status: 'draft' | 'approved' | 'needs_revision';
};
```

### 7.7 Reference Analysis

각 키 콘텐츠와 풀링 콘텐츠에 레퍼런스 영상을 연결한다.

저장 정보:

```ts
type ViewtrapReference = {
  id: string;
  content_plan_id: string;
  source: 'viewtrap' | 'youtube' | 'manual';
  title: string;
  url: string;
  channel_name?: string;
  subscriber_count?: number;
  view_count?: number;
  uploaded_at?: string;
  recent_view_growth?: string;
  contribution_score?: number;
  selected_reason: string;
  consumer_stage: '현상' | '욕구' | '계획' | '행동' | '보상';
  thumbnail_image_ref?: string;
};
```

### 7.8 Thumbnail Structure Extraction

레퍼런스에서 썸네일 구조를 추출한다. 문구를 베끼는 것이 아니라 구조를 추출한다.

분석 항목:

```text
썸네일 문구
강조 단어
숫자 사용 여부
대상 명시 여부
위협/손실/욕구/성과 중 어떤 감정을 쓰는지
이미지 구도
텍스트 배치
클릭 이유
우리 주제로 치환할 방식
```

출력 타입:

```ts
type ThumbnailPattern = {
  id: string;
  reference_video_id: string;
  raw_thumbnail_text: string;
  hook_type: 'loss' | 'gain' | 'curiosity' | 'warning' | 'authority' | 'result' | 'contrast';
  structure: string;
  reusable_formula: string;
  adapted_thumbnail_candidates: string[];
};
```

### 7.9 Intro 30s Analysis

각 영상 URL에 들어가 초반 30초 원고를 분석한다.

분석 항목:

```text
첫 문장
문제 제기 방식
시청자 지칭 방식
반전/긴장 형성 방식
기대감 형성 방식
A부터 Z까지 알려줄 것 같은 느낌이 있는지
개념 세팅 방식
다음 내용을 보게 만드는 표현
```

출력 타입:

```ts
type Intro30sAnalysis = {
  id: string;
  reference_video_id: string;
  transcript_30s: string;
  first_sentence: string;
  hook_structure: string;
  tension_device: string;
  viewer_identity_called: string;
  promise_made: string;
  curiosity_gap: string;
  reusable_intro_formula: string;
  adapted_intro_candidates: string[];
};
```

### 7.10 Second Brain Insight Merge

도입부와 원고 구조를 만들 때, 레퍼런스 구조만 사용하면 얕아진다. Second Brain에서 비즈니스 PT 인사이트, 썸끝/원끝, 해외 비즈니스 사례, 마케팅 자동화 인사이트를 검색해 논리를 강화한다.

역할:

```text
레퍼런스 구조를 가져온다
+
Second Brain 인사이트로 논리를 강화한다
+
내 상품의 판매 논리로 연결한다
```

출력 타입:

```ts
type SecondBrainInsightMerge = {
  id: string;
  content_plan_id: string;
  retrieved_insights: {
    source_id: string;
    title: string;
    insight: string;
    usage: 'hook' | 'logic' | 'example' | 'sales_argument' | 'cta';
  }[];
  applied_to_thumbnail: string[];
  applied_to_intro: string[];
  applied_to_script_structure: string[];
};
```

### 7.11 Hook Draft Approval

마지막으로 썸네일/제목/도입부를 승인한다.

승인 대상:

```text
키 콘텐츠 제목
풀링 콘텐츠 5개 제목
각 콘텐츠별 썸네일 후보
각 콘텐츠별 도입부 30초 후보
각 콘텐츠가 키 콘텐츠로 연결되는 브릿지
```

---

## 8. Page 2: Production Page

### 8.1 Purpose

Production Page는 승인된 전략을 실제 영상 제작 산출물로 바꾸는 페이지다.

### 8.2 Scope

```text
승인된 키 콘텐츠/풀링 콘텐츠 중 제작할 영상 선택
원고 구조 생성
전체 원고 작성
읽기용 원고 변환
Founder 녹음
음성 파일 업로드
SlideDeckSpec 생성
VideoJob 변환
AI Slide Video Factory 렌더링
```

### 8.3 Layout

```text
┌──────────────────────────────────────────────────────┐
│ Video Room Header                                    │
├──────────────────────────────────────────────────────┤
│ Mini Roadmap                                         │
├────────────────────┬────────────────────┬────────────┤
│ Production Chat     │ Production Board    │ Action     │
│ / CMO Assistant     │                    │ Panel      │
└────────────────────┴────────────────────┴────────────┘
```

### 8.4 Production Board Cards

```text
Selected Content Card
Script Plan Card
Script Draft Card
Reading Script Card
Voice Recording Card
Slide Deck Spec Card
Render Job Card
```

### 8.5 Script Plan Card

예시:

```text
원고 기획

승인된 제목:
마케팅을 몰라도 콘텐츠로 고객을 만드는 3단계

구성:
1. 흔한 실수 제시
2. 왜 광고부터 켜면 안 되는지 설명
3. 데이터 기반 마케팅 구조 소개
4. 작은 브랜드가 먼저 봐야 하는 3가지
5. 키 콘텐츠로 연결
```

### 8.6 Reading Script Card

Founder가 직접 녹음하기 좋게 변환된 원고를 보여준다.

예시:

```text
[Slide 1]
작은 브랜드가 / 마케팅할 때 / 가장 많이 하는 실수가 있습니다.

[강조]
광고부터 켜는 겁니다.

[Slide 2]
그런데 문제는 / 광고가 아닙니다.
광고를 켜기 전에 / 봐야 할 숫자를 모르는 게 문제입니다.
```

기능:

```text
복사
다운로드
프린트
녹음 가이드 보기
```

### 8.7 Voice Recording Card

```text
녹음 상태:
업로드 필요

파일:
없음

Actions:
[음성 파일 업로드] [녹음 가이드 보기]
```

업로드 후:

```text
녹음 상태:
업로드 완료

파일 길이:
4분 12초

품질 상태:
Unchecked / Pass / Needs Rerecording
```

### 8.8 Slide Deck Spec Card

```text
SlideDeckSpec

상태:
생성 대기 / 생성 완료 / 수정 필요

슬라이드 수:
28

형식:
16:9

Design Theme:
Pulk Clean Green Slide Deck

Actions:
[SlideDeckSpec 생성] [JSON 보기] [VideoJob 변환]
```

### 8.9 Render Job Card

```text
Render Job

상태:
Queued / Rendering / Completed / Failed

Output:
video.mp4
thumbnail.png
qa_report.md
youtube_metadata.json
```

### 8.10 Production Page Completion Criteria

```text
ScriptPlan 생성 완료
ScriptDraft 승인 완료
ReadingScript 생성 완료
VoiceRecording 업로드 완료
SlideDeckSpec 생성 완료
VideoJob 변환 완료
RenderJob completed
```

---

## 9. Page 3: Review & Publish Page

### 9.1 Purpose

Review & Publish Page는 생성된 영상이 승인된 전략과 원고에 맞는지 검수하고, 업로드 초안을 만든 뒤 최종 승인을 받는 페이지다.

### 9.2 Scope

```text
영상 미리보기
QA 체크리스트
승인본과 결과물 비교
수정 요청
업로드 메타데이터
썸네일 연결
최종 승인
업로드 준비
성과 기록
Memory 저장 후보
```

### 9.3 Layout

```text
┌──────────────────────────────────────────────────────┐
│ Video Room Header                                    │
├──────────────────────────────────────────────────────┤
│ Mini Roadmap                                         │
├────────────────────┬────────────────────┬────────────┤
│ Preview / QA        │ Publish Board       │ Approval   │
│                    │                    │ Panel      │
└────────────────────┴────────────────────┴────────────┘
```

### 9.4 Video QA Card

QA 항목은 렌더링 품질뿐 아니라 전략 일치성까지 포함한다.

```text
Business PT 구조 일치: Pass / Fail
풀링 → 키 콘텐츠 브릿지: Pass / Fail
승인된 원고와 일치: Pass / Fail
슬라이드 가독성: Pass / Fail
오디오 싱크: Pass / Fail
시각 품질: Pass / Fail
업로드 메타데이터 준비: Pass / Fail
```

### 9.5 Revision Request Card

```text
수정 필요 항목:
3번 섹션 슬라이드가 너무 길다.
도입부 자막이 빠르게 지나간다.
CTA가 약하다.

Actions:
[CMO에게 수정 요청] [Production Page로 보내기] [보류]
```

### 9.6 Upload Draft Card

```text
제목:
마케팅을 몰라도 콘텐츠로 고객을 만드는 3단계

설명:
작은 브랜드가 마케팅할 때 가장 먼저 봐야 하는 구조를 설명합니다.
다음 영상에서는 실제 데이터 기반 마케팅 설계 순서를 다룹니다.

태그:
마케팅, 콘텐츠마케팅, 작은브랜드, AI마케팅, 자영업마케팅

공개 상태:
Private

Actions:
[수정 요청] [승인] [예약 설정]
```

기본 visibility는 `private`이다. 공개 또는 예약 업로드는 Founder 최종 승인 후에만 가능하다.

### 9.7 Performance Memory Card

초기 MVP에서는 성과 자동 수집은 제외할 수 있다. 다만 업로드 후 기록할 Memory 후보는 생성할 수 있어야 한다.

예시:

```text
Memory 후보:
이 콘텐츠는 AI 마케팅팀 상품의 풀링 콘텐츠로 제작됨.
키 콘텐츠로 이동시키기 위한 브릿지는 “마케팅 설계 순서” 질문을 만드는 방식.
```

---

## 10. Full Workflow State Machine

```text
strategy_chat
→ business_pt_context_loading
→ product_defined
→ key_content_ideation
→ viewtrap_key_research
→ key_content_approval
→ viewtrap_pulling_research
→ pulling_content_set_selection
→ pulling_content_set_approval
→ reference_analysis
→ thumbnail_pattern_extraction
→ intro_30s_analysis
→ second_brain_insight_merge
→ hook_draft_approval
→ script_planning
→ script_draft
→ script_approval
→ voice_recording
→ slide_deck
→ rendering
→ qa
→ video_qa_approval
→ upload_draft
→ upload_approval
→ completed
```

---

## 11. Page Ownership by State

| Page | 담당 상태 |
|---|---|
| Strategy Page | `strategy_chat`, `business_pt_context_loading`, `product_defined`, `key_content_ideation`, `viewtrap_key_research`, `key_content_approval`, `viewtrap_pulling_research`, `pulling_content_set_selection`, `reference_analysis`, `thumbnail_pattern_extraction`, `intro_30s_analysis`, `second_brain_insight_merge`, `hook_draft_approval` |
| Production Page | `script_planning`, `script_draft`, `script_approval`, `voice_recording`, `slide_deck`, `rendering` |
| Review & Publish Page | `qa`, `video_qa_approval`, `upload_draft`, `upload_approval`, `completed` |

---

## 12. Data Model

### 12.0 BusinessPTContextSnapshot

```ts
type BusinessPTContextSnapshot = {
  id: string;
  video_project_id: string;
  loaded_at: string;
  source_refs: {
    source_id: string;
    title: string;
    source_type: 'notion' | 'second_brain' | 'memory' | 'manual';
    url?: string;
  }[];
  key_principles: string[];
  key_content_rules: string[];
  pulling_content_rules: string[];
  thumbnail_intro_rules: string[];
  script_structure_rules: string[];
  caution_notes: string[];
  freshness_status: 'fresh' | 'stale' | 'needs_refresh';
};
```

역할:

```text
CMO가 기획을 시작하기 전 최신 Business PT/Second Brain 자료를 흡수한 결과를 저장한다.
프로젝트별로 스냅샷을 남겨, 나중에 강의 인사이트가 업데이트되더라도 당시 어떤 기준으로 기획했는지 추적할 수 있게 한다.
```

---

### 12.1 VideoProject

```ts
type VideoProject = {
  id: string;
  title: string;
  business_id?: string;
  product: string;
  target_audience: string;
  business_goal: 'consulting_lead' | 'product_sale' | 'waitlist' | 'brand_growth';
  project_type: 'single_video' | 'key_content_set';
  status:
    | 'strategy_chat'
    | 'business_pt_context_loading'
    | 'product_defined'
    | 'key_content_ideation'
    | 'viewtrap_key_research'
    | 'key_content_approval'
    | 'viewtrap_pulling_research'
    | 'pulling_content_set_selection'
    | 'pulling_content_set_approval'
    | 'reference_analysis'
    | 'thumbnail_pattern_extraction'
    | 'intro_30s_analysis'
    | 'second_brain_insight_merge'
    | 'hook_draft_approval'
    | 'script_planning'
    | 'script_draft'
    | 'script_approval'
    | 'voice_recording'
    | 'slide_deck'
    | 'rendering'
    | 'qa'
    | 'video_qa_approval'
    | 'upload_draft'
    | 'upload_approval'
    | 'completed'
    | 'paused';
  current_page: 'strategy' | 'production' | 'review_publish';
  owner_agent_id: 'cmo';
  created_at: string;
  updated_at: string;
};
```

### 12.2 KeyContentSet

```ts
type KeyContentSet = {
  id: string;
  video_project_id: string;
  product: string;
  target_audience: string;
  selected_key_content_id: string;
  pulling_content_ids: string[];
  funnel_logic: string;
  approval_status: 'draft' | 'approved' | 'needs_revision';
};
```

### 12.3 ViewtrapResearchSession

```ts
type ViewtrapResearchSession = {
  id: string;
  video_project_id: string;
  research_type: 'key_content' | 'pulling_content' | 'thumbnail' | 'intro_30s';
  viewtrap_url: 'https://app.viewtrap.com/video-search';
  search_keywords: string[];
  browser_session_ref?: string;
  status: 'not_started' | 'researching' | 'completed' | 'needs_more_research';
  findings_summary: string;
  created_at: string;
  completed_at?: string;
};
```

### 12.4 ReferenceCandidate

```ts
type ReferenceCandidate = {
  id: string;
  research_session_id: string;
  title: string;
  url: string;
  source: 'viewtrap' | 'youtube' | 'manual';
  view_count?: number;
  subscriber_count?: number;
  uploaded_at?: string;
  recent_growth_signal?: 'low' | 'medium' | 'high';
  contribution_score?: number;
  thumbnail_ref?: string;
  consumer_stage: '현상' | '욕구' | '계획' | '행동' | '보상';
  selected_for:
    | 'key_content'
    | 'pulling_content'
    | 'thumbnail_pattern'
    | 'intro_pattern'
    | 'script_structure';
  selection_reason: string;
};
```

### 12.5 PullingContentSet

```ts
type PullingContentSet = {
  id: string;
  key_content_id: string;
  pulling_contents: PullingContentPlan[];
  set_logic: string;
  funnel_coverage: {
    phenomenon: string[];
    desire: string[];
    plan: string[];
    action_bridge: string;
  };
  approval_status: 'draft' | 'approved' | 'needs_revision';
};
```

### 12.6 ThumbnailPattern

```ts
type ThumbnailPattern = {
  id: string;
  reference_video_id: string;
  raw_thumbnail_text: string;
  hook_type: 'loss' | 'gain' | 'curiosity' | 'warning' | 'authority' | 'result' | 'contrast';
  structure: string;
  reusable_formula: string;
  adapted_thumbnail_candidates: string[];
};
```

### 12.7 Intro30sAnalysis

```ts
type Intro30sAnalysis = {
  id: string;
  reference_video_id: string;
  transcript_30s: string;
  first_sentence: string;
  hook_structure: string;
  tension_device: string;
  viewer_identity_called: string;
  promise_made: string;
  curiosity_gap: string;
  reusable_intro_formula: string;
  adapted_intro_candidates: string[];
};
```

### 12.8 SecondBrainInsightMerge

```ts
type SecondBrainInsightMerge = {
  id: string;
  content_plan_id: string;
  retrieved_insights: {
    source_id: string;
    title: string;
    insight: string;
    usage: 'hook' | 'logic' | 'example' | 'sales_argument' | 'cta';
  }[];
  applied_to_thumbnail: string[];
  applied_to_intro: string[];
  applied_to_script_structure: string[];
};
```

### 12.9 ContentApprovalGate

```ts
type ContentApprovalGate = {
  id: string;
  video_project_id: string;
  gate_type:
    | 'key_content_approval'
    | 'pulling_content_set_approval'
    | 'hook_draft_approval'
    | 'script_approval'
    | 'video_qa_approval'
    | 'upload_approval';
  page: 'strategy' | 'production' | 'review_publish';
  title: string;
  context: string;
  options: string[];
  recommended_option?: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  decided_by?: 'founder' | 'ceo';
  decided_at?: string;
};
```

### 12.10 SlideDeckSpec

```ts
type SlideDeckSpec = {
  id: string;
  video_project_id: string;
  script_draft_id: string;
  voice_recording_id: string;
  aspect_ratio: '16:9' | '9:16';
  design_theme: string;
  slides: {
    index: number;
    start_time?: number;
    end_time?: number;
    headline: string;
    body?: string;
    visual_type: 'text' | 'comparison' | 'framework' | 'quote' | 'checklist' | 'bridge' | 'cta';
    speaker_text: string;
    animation_hint?: string;
  }[];
};
```

### 12.11 RenderJob

```ts
type RenderJob = {
  id: string;
  video_project_id: string;
  slide_deck_spec_id: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  output_video_ref?: string;
  thumbnail_ref?: string;
  qa_report_ref?: string;
  youtube_metadata_ref?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
};
```

### 12.12 VideoQAResult

```ts
type VideoQAResult = {
  id: string;
  video_project_id: string;
  render_job_id: string;
  checks: {
    business_pt_structure: 'pass' | 'fail';
    pulling_to_key_bridge: 'pass' | 'fail';
    script_matches_approved_draft: 'pass' | 'fail';
    slide_readability: 'pass' | 'fail';
    audio_sync: 'pass' | 'fail';
    visual_quality: 'pass' | 'fail';
    upload_metadata_ready: 'pass' | 'fail';
  };
  overall_status: 'pass' | 'needs_revision';
  notes?: string;
};
```

---

## 13. Browser / Viewtrap Automation Policy

### 13.1 MVP

MVP에서는 완전 자동 브라우저 제어를 만들지 않는다.

초기 방식:

- CMO는 먼저 Business PT Context Snapshot을 생성한다.
- CMO가 검색 키워드를 제안한다.
- Founder 또는 operator가 Viewtrap에서 검색한다.
- 검색 결과 URL, 제목, 조회수, 썸네일, 선택 이유를 입력한다.
- CMO가 이를 분석한다.

### 13.2 Later Phase

추후 자동화에서는 다음을 구현한다.

```text
사용자의 로컬 브라우저 열기
→ https://app.viewtrap.com/video-search 접속
→ 기존 로그인 세션 사용
→ 키워드 검색
→ 검색 결과 수집
→ 후보 영상 저장
→ 썸네일 구조 분석
→ 영상 URL 진입
→ 초반 30초 원고 분석
```

### 13.3 Security Rule

```text
Viewtrap 비밀번호 저장 금지
쿠키/세션 토큰 직접 저장 금지
로컬 브라우저 세션 사용
외부 전송 금지
Founder 승인 없이 자동 스크래핑 대량 실행 금지
```

---

## 14. CMO Agent Rules

CMO는 다음 순서로 일한다.

```text
1. Second Brain에서 최신 비즈니스 PT 자료를 먼저 검색한다.
2. Business PT Context Snapshot을 만든다.
3. 해당 스냅샷을 기준으로 상품과 고객 문제를 정리한다.
4. 키 콘텐츠 후보를 만든다.
5. Viewtrap에서 키 콘텐츠 관련 키워드를 검색한다.
4. 같은 고객이 이미 보고 있는 영상 지도를 만든다.
5. 키 콘텐츠 1개를 추천한다.
6. Founder 승인을 받는다.
7. 승인된 키 콘텐츠에 연결될 풀링 콘텐츠 후보를 찾는다.
8. Viewtrap에서 풀링 콘텐츠 키워드를 검색한다.
9. 현상/욕구/계획 단계별로 풀링 콘텐츠 5개를 선별한다.
10. 각 콘텐츠별 레퍼런스 영상을 저장한다.
11. 썸네일 구조를 추출한다.
12. 영상 URL에 들어가 초반 30초 원고를 분석한다.
13. Second Brain에서 관련 인사이트를 가져온다.
14. 레퍼런스 구조 + Second Brain 인사이트 + 내 상품 판매 논리를 결합한다.
15. 썸네일/제목/도입부 후보를 만든다.
16. Founder 승인 후 Production Page로 넘긴다.
```

### CMO 금지 행동

```text
Business PT Context Loading 없이 키 콘텐츠 후보 생성 금지
Viewtrap 리서치 없이 키 콘텐츠 확정 금지
키 콘텐츠 1개 승인 없이 풀링 콘텐츠 5개 확정 금지
풀링 콘텐츠가 키 콘텐츠로 연결되는 브릿지 없이 승인 요청 금지
레퍼런스 영상 URL 없이 썸네일 구조 분석 완료 처리 금지
초반 30초 분석 없이 도입부 작성 금지
Second Brain 인사이트 검색 없이 원고 구조 확정 금지
Founder 승인 없이 Production Page로 이동 금지
```

---

## 15. UI Design Principles

### 15.1 Visual Tone

```text
밝은 테마
카드형 UI
미니멀한 선 정리
블랙 중심
핑크는 승인/중요 상태/핵심 액션에만 제한 사용
```

### 15.2 Complexity Management

```text
한 화면에 모든 단계 상세를 보여주지 않는다.
현재 페이지와 관련 있는 정보만 본문에 표시한다.
전체 진행 상황은 Mini Roadmap으로만 제공한다.
의사결정 패널에는 현재 필요한 결정만 보여준다.
Viewtrap 리서치 결과는 카드/테이블로 구조화한다.
중요 결정은 chat log 안에 묻히지 않고 ApprovalGate로 저장한다.
```

### 15.3 Status Expression

| 상태 | UI 표현 |
|---|---|
| Pending | 연한 회색 |
| Active | 블랙 테두리 + 진행 점 |
| Needs Approval | 핑크 배지 |
| Approved | 체크 아이콘 |
| Needs Revision | 노란 배지 |
| Blocked | 빨간 배지 |
| Completed | 완료 체크 |

---

## 16. MVP Scope

### Included

```text
Video Room 생성
3페이지 내부 네비게이션
CMO Chat
VideoProject 생성
Mini Roadmap
Strategy Page
Production Page
Review & Publish Page
Approval Panel
KeyContentSet
ViewtrapResearchSession
ReferenceCandidate
PullingContentSet
ThumbnailPattern
Intro30sAnalysis
SecondBrainInsightMerge
ScriptDraft
VoiceRecording
SlideDeckSpec
RenderJob
VideoQAResult
UploadDraft
Video Factory Adapter 연결
```

### Excluded

```text
Viewtrap 완전 자동 브라우저 제어
YouTube 자동 공개 업로드
성과 데이터 자동 수집
자동 썸네일 이미지 생성
완전 자동 TTS 영상 생성
다중 채널 자동 배포
모바일 앱
```

---

## 17. Development Phases

### Phase 0. Documentation

```text
docs/CMO_VIDEO_ROOM_PRD.md
docs/CMO_VIDEO_ROOM_UI_SPEC.md
docs/VIDEO_ROOM_DATA_MODEL.md
docs/VIDEO_ROOM_AGENT_PROTOCOL.md
docs/VIEWTRAP_RESEARCH_WORKFLOW.md
docs/VIDEO_ROOM_APPROVAL_GATES.md
```

### Phase 1. Video Room Shell

```text
Video Room 메뉴 추가
VideoProject 목록
VideoProject 상세 페이지
내부 네비게이션 3개 탭
공통 Header
공통 Mini Roadmap
```

### Phase 2. Strategy Page MVP

```text
CMO Chat UI
Business PT Context Snapshot Card
Business PT Context Loader
Product Strategy Card
Key Content Candidate Card
Viewtrap Research Card
Selected Key Content Card
Pulling Content Set Card
Reference Candidate Card
Thumbnail Pattern Card
Intro 30s Analysis Card
Second Brain Insight Merge Card
Strategy Decision Panel
ApprovalGate 생성/승인/수정 요청
```

### Phase 3. Viewtrap Research Manual Workflow

```text
Viewtrap URL 저장
검색 키워드 저장
수동 입력 결과 저장
ReferenceCandidate 생성
조회수/구독자/업로드일/선택 이유 저장
소비자 단계 분류
키 콘텐츠/풀링 콘텐츠 후보 연결
```

### Phase 4. Production Page

```text
ScriptPlan Card
ScriptDraft Card
ReadingScript Card
VoiceRecording Upload
SlideDeckSpec Card
RenderJob Card
Production Action Panel
```

### Phase 5. Review & Publish Page

```text
Video Preview
VideoQAResult Card
Revision Request Card
UploadDraft Card
Final Approval Panel
Memory Candidate Card
```

### Phase 6. Video Factory Integration

```text
SlideDeckSpec → VideoJob 변환
AI Slide Video Factory 호출
RenderJob 상태 업데이트
output file ref 저장
QA report 연결
youtube metadata 연결
```

### Phase 7. Browser Automation Later

```text
로컬 브라우저 세션 열기
Viewtrap 자동 접속
검색어 입력
결과 후보 수집
레퍼런스 저장
썸네일/30초 원고 분석 자동화
```

---

## 18. Success Criteria

MVP 성공 기준:

```text
1. Founder가 Video Room에서 새 영상 프로젝트를 만들 수 있다.
2. Video Room 안에 Strategy / Production / Review & Publish 3개 페이지가 있다.
3. Strategy Page에서 CMO와 직접 대화할 수 있다.
4. 키 콘텐츠 후보가 카드로 저장된다.
5. Viewtrap 검색 키워드와 리서치 세션이 저장된다.
6. 키 콘텐츠 1개를 승인할 수 있다.
7. 키 콘텐츠에 연결되는 풀링 콘텐츠 5개를 선별하고 승인할 수 있다.
8. 각 콘텐츠별 레퍼런스 영상 URL과 선택 이유를 저장할 수 있다.
9. 썸네일 구조 분석 결과가 저장된다.
10. 초반 30초 원고 분석 결과가 저장된다.
11. Second Brain 인사이트가 연결된다.
12. 썸네일/제목/도입부 후보를 승인할 수 있다.
13. 승인된 콘텐츠만 Production Page로 넘어간다.
14. 원고 승인 후 녹음 단계로 이동한다.
15. 녹음 파일 업로드 후 SlideDeckSpec이 생성된다.
16. SlideDeckSpec이 VideoJob으로 변환된다.
17. AI Slide Video Factory가 렌더링을 수행한다.
18. QA 결과가 Review & Publish Page에 표시된다.
19. UploadDraft가 생성된다.
20. 공개 업로드는 Founder 최종 승인 전 실행되지 않는다.
```

---

## 19. Developer Handoff Prompt

```text
Pulk에 CMO Video Room을 구현한다.

이 기능은 CEO가 CMO에게 단일 task를 배정하는 구조가 아니다.
Founder가 CMO와 직접 대화하면서 유튜브 콘텐츠 전략, Viewtrap 리서치, 키 콘텐츠, 풀링 콘텐츠 5개, 썸네일, 도입부, 원고, 녹음, 영상 제작, QA, 업로드 승인까지 관리하는 전용 Room이다.

Video Room은 한 화면에 모든 정보를 넣지 않는다.
내부 네비게이션으로 3개 페이지를 가진다.

1. Strategy Page
- CMO Chat
- Product Strategy Card
- Key Content Candidate Card
- Viewtrap Key Research Card
- Selected Key Content Card
- Viewtrap Pulling Research Card
- Pulling Content Set Card
- Reference Candidate Card
- Thumbnail Pattern Card
- Intro 30s Analysis Card
- Second Brain Insight Merge Card
- Hook Draft Card
- Strategy Decision Panel

2. Production Page
- Selected Content Card
- ScriptPlan Card
- ScriptDraft Card
- ReadingScript Card
- VoiceRecording Card
- SlideDeckSpec Card
- RenderJob Card
- Production Action Panel

3. Review & Publish Page
- Video Preview
- VideoQAResult Card
- Revision Request Card
- UploadDraft Card
- Final Approval Panel
- Memory Candidate Card

Viewtrap 정보:
- URL: https://app.viewtrap.com/video-search
- 사용자의 브라우저에서 접속하면 자동 로그인되어 있음
- MVP에서는 수동 입력 방식으로 시작
- Later Phase에서 로컬 브라우저 세션 기반 자동화
- 비밀번호/쿠키/세션 토큰 저장 금지

핵심 워크플로우:
상품 정의
→ 키 콘텐츠 후보
→ Viewtrap 키 리서치
→ 키 콘텐츠 1개 승인
→ Viewtrap 풀링 리서치
→ 풀링 콘텐츠 5개 승인
→ 레퍼런스 영상 저장
→ 썸네일 구조 분석
→ 초반 30초 원고 분석
→ Second Brain 인사이트 결합
→ Hook 승인
→ 원고 작성
→ 녹음
→ SlideDeckSpec
→ VideoJob
→ Render
→ QA
→ Upload Draft

중요 규칙:
- Viewtrap 리서치 없이 키 콘텐츠 확정 금지
- 키 콘텐츠 승인 없이 풀링 콘텐츠 5개 확정 금지
- 브릿지 없는 풀링 콘텐츠 승인 금지
- 초반 30초 분석 없이 도입부 작성 금지
- Second Brain 인사이트 없이 원고 구조 확정 금지
- Founder 승인 없이 Production Page 이동 금지
- QA 통과 없이 업로드 승인 금지
- YouTube 공개 업로드는 Founder 최종 승인 전 실행 금지

완료 기준:
- Video Room에 3개 페이지 네비게이션이 존재한다.
- 현재 단계가 Mini Roadmap에 표시된다.
- Viewtrap 리서치 결과가 카드/테이블로 저장된다.
- 키 콘텐츠 1개와 풀링 콘텐츠 5개가 하나의 KeyContentSet으로 묶인다.
- 승인된 것만 다음 단계로 넘어간다.
- 최종적으로 Video Factory로 전달 가능한 SlideDeckSpec과 VideoJob이 생성된다.
```

---

## 20. Final Product Direction

Pulk CMO Video Room의 핵심은 영상 생성 버튼이 아니다.

핵심은 다음이다.

```text
CMO와 대화한다
→ Viewtrap에서 실제 성과 콘텐츠를 찾는다
→ 같은 고객이 보는 콘텐츠 지도를 만든다
→ 키 콘텐츠 1개를 확정한다
→ 그 키 콘텐츠로 연결될 풀링 콘텐츠 5개를 선별한다
→ 각 콘텐츠의 썸네일 구조를 따온다
→ 영상 URL에서 초반 30초 원고를 분석한다
→ Second Brain 인사이트로 도입부와 원고 구조를 강화한다
→ 승인된 것만 영상 제작으로 넘긴다
```

따라서 이 제품은 단순 영상 생성기가 아니라 **Viewtrap 기반 리서치와 Second Brain 인사이트를 활용해 콘텐츠 세트를 설계하고, 승인된 콘텐츠만 영상으로 실행하는 CMO 전용 콘텐츠 운영실**이다.
