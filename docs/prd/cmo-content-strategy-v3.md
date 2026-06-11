# PRD v3 — CMO 콘텐츠 전략 시스템 전체 워크플로우

## 0. 핵심 수정 사항

이번 v3의 가장 중요한 수정은 다음이다.

```text
Viewtrap Expert Agent는 독립적인 대형 단계로 존재하지 않는다.
Viewtrap은 키 콘텐츠 기획 단계 안에서 한 번 쓰이고,
풀링 콘텐츠 기획 단계 안에서 다시 쓰이는 검증/확장 도구다.
```

즉 전체 구조는 다음처럼 바뀐다.

## 잘못된 구조

```text
상품 입력
→ 키 콘텐츠 기획
→ 풀링 콘텐츠 기획
→ Viewtrap 검증
→ 제목/썸네일
→ 원고
```

## 올바른 구조

```text
상품 입력
→ 키 콘텐츠 기획
   └─ Viewtrap 검증 사용
→ 풀링 콘텐츠 기획
   └─ Viewtrap 검증 사용
→ 키/풀링 콘텐츠 세트 확정
→ 제목/썸네일
→ 도입부 30초
→ 원고
→ 내 말투 변환
→ CMO Brief
→ AI Slide Factory
```

Viewtrap은 별도의 목적지가 아니라, 키 콘텐츠와 풀링 콘텐츠를 더 정확하게 기획하기 위해 호출되는 전문 스킬이다.

---

# 1. 전체 기능 로드맵

전체 제품의 실제 사용 흐름은 다음과 같다.

```text
1. 상품 정보 입력
2. 상품의 기능/특징/장점 정리
3. 키 콘텐츠 기획
   3-1. 내 아이템 일반화
   3-2. 카테고리 확장
   3-3. 기능/특징/장점 → 문제 도출
   3-4. 현상/욕구/계획/행동/보상 퍼널 구성
   3-5. 키 콘텐츠 진입 단계 결정
   3-6. 키 콘텐츠용 Viewtrap 검색축 생성
   3-7. Viewtrap으로 키 콘텐츠 후보 검증
   3-8. 판매 논리 삽입
   3-9. 키 콘텐츠 주제 확정

4. 풀링 콘텐츠 기획
   4-1. 키 콘텐츠 판매 논리 불러오기
   4-2. 키 콘텐츠를 볼 준비가 된 사람 정의
   4-3. 논리적 확장
   4-4. 풀링 주제 후보 생성
   4-5. 에버그린/데일리/시즌성/히어로 분류
   4-6. 풀링용 Viewtrap 기본 검증
   4-7. 핫 비디오 문맥 구조 응용
   4-8. 노출 확률 높은 주제 확인
   4-9. 오래됐는데도 노출 확률 높은 주제 확인
   4-10. 키 콘텐츠와의 자연스러운 연결성 평가
   4-11. 소비자 행동 5단계 설명 가능성 평가
   4-12. 풀링 콘텐츠 세트 확정

5. 키/풀링 콘텐츠 전략 패키지 확정
6. 제목/썸네일 기획
7. 도입부 30초 기획
8. 본문 원고 작성
9. 내 말투 변환
10. CMO Brief 생성
11. 녹음 파일 업로드
12. AI Slide Factory 전달
13. 영상 렌더링
14. 성과 분석 및 재학습
```

---

# 2. 에이전트 구조

CMO는 전체를 지휘하는 오케스트레이터다.

```text
CMO Orchestrator
├─ Key Content Planning Agent
│  └─ Viewtrap Skill 호출
├─ Pulling Content Planning Agent
│  └─ Viewtrap Skill 호출
├─ Title & Thumbnail Agent
├─ Script Agent
├─ Voice Style Agent
├─ CMO Brief Builder
└─ Performance Learning Agent
```

중요한 점은 Viewtrap이 독립된 큰 단계가 아니라는 것이다.

```text
Viewtrap Skill =
키 콘텐츠 기획 Agent와 풀링 콘텐츠 기획 Agent가 필요할 때 호출하는 검증 스킬
```

---

# 3. Key Content Planning Agent

## 3.1 목적

키 콘텐츠 기획 에이전트는 상품을 설명하는 주제를 만드는 것이 아니다.

이 에이전트는 상품의 기능/특징/장점이 해결하는 문제를 역으로 도출하고, 그 문제를 고객의 구매 흐름에 배치해 자연스러운 판매 논리를 만든다.

## 3.2 키 콘텐츠 기획 워크플로우

사용자가 정의한 키 콘텐츠 기획 워크플로우를 정확히 반영한다.

---

## Step 0. 상품 정하기

상품은 이미 정해졌다고 가정한다.

입력값:

```text
상품명
상품 설명
가격
제공 방식
타깃 고객
CTA
```

---

## Step 1. 내 아이템 일반화

내 아이템을 일반화한다.

```text
내 아이템
→ 직접 카테고리
→ 상위 카테고리
→ 고객이 인식하는 문제 카테고리
```

예시:

```text
AI 마케팅팀
→ AI 마케팅 자동화
→ 콘텐츠 마케팅 시스템
→ 작은 브랜드 마케팅 구조
→ 손님이 오게 만드는 콘텐츠 흐름
```

산출물:

```ts
export interface ItemGeneralization {
  item_name: string;
  direct_category: string;
  parent_category: string;
  customer_problem_category: string;
  reason: string;
}
```

---

## Step 2. 내 아이템의 기능/특징/장점 정리

내 아이템의 기능, 특징, 장점을 정리한다.

```text
기능: 무엇을 하는가?
특징: 어떤 방식으로 하는가?
장점: 고객에게 왜 좋은가?
```

예시:

```text
기능: 콘텐츠 기획을 자동으로 구조화한다.
특징: 상품 정보, 고객 문제, 키/풀링 콘텐츠를 연결한다.
장점: 감으로 콘텐츠를 만드는 대신 판매 흐름에 맞춰 콘텐츠를 만든다.
```

산출물:

```ts
export interface ItemFeatureBenefitMap {
  features: FeatureBenefit[];
  characteristics: FeatureBenefit[];
  benefits: FeatureBenefit[];
}
```

---

## Step 3. 내 아이템이 속한 카테고리의 기능/특징/장점 정리

내 상품 자체가 아니라, 고객이 이해할 수 있는 카테고리의 기능/특징/장점도 정리한다.

예시:

```text
카테고리: 콘텐츠 마케팅 시스템

기능: 고객 문제를 콘텐츠로 바꾼다.
특징: 유입 콘텐츠와 판매 콘텐츠를 분리한다.
장점: 콘텐츠가 흩어지지 않고 구매 흐름에 쌓인다.
```

이 단계가 있어야 고객이 먼저 “이런 종류의 해결책이 필요하구나”라고 이해한다.

산출물:

```ts
export interface CategoryFeatureBenefitMap {
  category_name: string;
  features: FeatureBenefit[];
  characteristics: FeatureBenefit[];
  benefits: FeatureBenefit[];
}
```

---

## Step 4. 기능/특징/장점이 해결하는 문제 도출

내 아이템과 카테고리의 기능/특징/장점이 해결하는 문제를 도출한다.

```text
내 아이템의 기능/특징/장점 → 해결 문제
카테고리의 기능/특징/장점 → 해결 문제
```

예시:

| 기능/특징/장점 | 해결 문제 |
|---|---|
| 고객 문제 기반 기획 | 콘텐츠 주제가 감으로 정해짐 |
| 키/풀링 분리 | 콘텐츠가 흩어져서 구매로 이어지지 않음 |
| 제목/썸네일 먼저 설계 | 내용은 좋은데 클릭이 안 됨 |
| 말투 변환 | AI 원고가 어색함 |
| 영상 공장 연결 | 원고 이후 편집 시간이 오래 걸림 |

산출물:

```ts
export interface ProblemDerivationMap {
  item_problem_candidates: ProblemCandidate[];
  category_problem_candidates: ProblemCandidate[];
  selected_problem_ids: string[];
}
```

---

## Step 5. 현상/욕구/계획/행동/보상 퍼널 구성

문제 후보를 소비자 행동 5단계에 배치한다.

```text
현상 → 욕구 → 계획 → 행동 → 보상
```

각 단계의 의미는 다음이다.

| 단계 | 의미 | 콘텐츠 역할 |
|---|---|---|
| 현상 | 고객이 문제를 마주치는 상황 | “나도 저 문제 있는데” |
| 욕구 | 문제를 해결하고 싶은 마음 | “나도 저렇게 되고 싶다” |
| 계획 | 해결 방법을 찾는 단계 | 방법, 비교, 노하우, 카테고리 설명 |
| 행동 | 구매, 문의, 신청 | CTA |
| 보상 | 행동 이후 얻게 되는 결과 | 후기, 변화, 성과 |

산출물:

```ts
export interface FunnelPlanningMap {
  phenomenon: FunnelStageItem[];
  desire: FunnelStageItem[];
  plan: FunnelStageItem[];
  action: FunnelStageItem[];
  reward: FunnelStageItem[];
}
```

---

## Step 6. 키 콘텐츠 진입 단계 결정

키 콘텐츠가 어느 단계에서 시작해야 자연스럽게 판매 논리가 적용되는지 결정한다.

판단 기준:

```text
계획 단계 고객이 충분하다 → 계획형 키 콘텐츠 가능
계획 단계 고객이 부족하다 → 현상 또는 욕구로 내려간다
상품 장점이 너무 빨리 나온다 → 더 앞단으로 이동한다
문제 공감 없이 카테고리 설명이 나온다 → 현상 단계 추가
```

산출물:

```ts
export interface KeyContentEntryDecision {
  selected_entry_stage: 'phenomenon' | 'desire' | 'plan';
  rationale: string;
}
```

---

## Step 7. 키 콘텐츠 주제 찾기용 Viewtrap 검색축 생성

키 콘텐츠를 찾기 위해 Viewtrap에서 검색할 축을 만든다.

사용자가 정의한 5개 축을 그대로 반영한다.

```text
1. 문제
2. 내 아이템 명
3. 내 아이템이 속한 카테고리 명
4. 내 아이템의 기능/특징/장점
5. 내 아이템이 속한 카테고리의 기능/특징/장점
```

산출물:

```ts
export interface KeyContentSearchKeywordSet {
  problem_keywords: string[];
  item_name_keywords: string[];
  category_name_keywords: string[];
  item_feature_benefit_keywords: string[];
  category_feature_benefit_keywords: string[];
}
```

---

## Step 8. Viewtrap으로 키 콘텐츠 후보 검증

이 단계에서 Viewtrap Skill을 호출한다.

Viewtrap은 독립 단계가 아니라, 키 콘텐츠 기획 안에서 호출된다.

키 콘텐츠 검증 시 확인할 것:

```text
문제 검색
내 아이템명 검색
카테고리명 검색
내 아이템의 기능/특징/장점 검색
카테고리의 기능/특징/장점 검색
성과도 good/great 확인
기여도 good/great 확인
구독자 낮은 채널에서도 먹힌 주제 확인
조회수 성장 그래프 확인
채널 가치/인물 가치 제외
```

산출물:

```ts
export interface KeyContentViewtrapValidation {
  validated_keywords: string[];
  candidate_titles: string[];
  performance_score: 'normal' | 'good' | 'great';
  contribution_score: 'normal' | 'good' | 'great';
  growth_status: 'growing' | 'stalled' | 'unknown';
  channel_value_risk: boolean;
  person_value_risk: boolean;
  verdict: 'use' | 'watch' | 'reject';
}
```

---

## Step 9. 내 아이템을 판매할 수 있는 콘텐츠 산정

Viewtrap 후보 중 실제로 내 상품을 팔 수 있는 콘텐츠만 산정한다.

판단 질문:

```text
이 콘텐츠를 보는 사람이 실제 고객이 될 수 있는가?
이 콘텐츠가 내 상품과 연결되는가?
이 문제를 해결하는 솔루션이 내 상품인가?
이 콘텐츠가 내가 생각한 수익구조와 단가에 맞는가?
```

---

## Step 10. 설득 구조 삽입

키 콘텐츠는 최종적으로 다음 순서로 전개된다.

```text
문제 제시
→ 내 아이템이 속한 카테고리의 기능/특징/장점 제시
→ 내 아이템이 속한 카테고리 제시
→ 내 아이템의 기능/특징/장점으로 문제 해결 가능성 제시
→ 내 아이템 제안
→ CTA
```

산출물:

```ts
export interface SalesLogicMap {
  problem_statement: string;
  category_feature_benefit: string;
  category_need: string;
  item_feature_benefit: string;
  item_solution_statement: string;
  cta: string;
}
```

---

## Step 11. 키 콘텐츠 주제 확정

최종 키 콘텐츠 주제를 확정한다.

산출물:

```ts
export interface ApprovedKeyContentTopic {
  title: string;
  thumbnail_promise: string;
  entry_stage: 'phenomenon' | 'desire' | 'plan';
  sales_logic: SalesLogicMap;
  viewtrap_validation: KeyContentViewtrapValidation;
  intro_direction: string;
  body_structure: string[];
  cta: string;
}
```

---

# 4. Pulling Content Planning Agent

## 4.1 목적

풀링 콘텐츠 기획 에이전트는 키 콘텐츠를 볼 만한 사람을 만드는 콘텐츠 포트폴리오를 설계한다.

중요한 수정 사항:

```text
풀링 콘텐츠는 꼭 하나의 단계로 정의할 필요가 없다.
어떤 풀링이 꼭 현상만, 어떤 풀링이 꼭 욕구만 담당해야 하는 것이 아니다.
중요한 것은 풀링과 키 콘텐츠가 연결될 때 자연스럽게 판매 논리와 소비자 행동 5단계가 설명되는가이다.
```

---

## 4.2 풀링 콘텐츠 기획 워크플로우

---

## Step 0. 키 콘텐츠 판매 논리 불러오기

풀링 콘텐츠는 키 콘텐츠 없이 만들면 안 된다.

입력값:

```text
키 콘텐츠 제목
키 콘텐츠 핵심 문제
키 콘텐츠 판매 논리
키 콘텐츠 CTA
키 콘텐츠 Viewtrap 검증 결과
```

---

## Step 1. 키 콘텐츠를 볼 준비가 된 사람 정의

질문:

```text
키 콘텐츠를 보기 전 고객은 어떤 문제를 인식해야 하는가?
어떤 욕구가 생겨야 하는가?
어떤 계획을 고민하고 있어야 하는가?
어떤 걱정, 오해, 욕망, 문제를 먼저 건드려야 하는가?
```

산출물:

```ts
export interface KeyReadyAudience {
  required_problem_awareness: string;
  required_desire: string;
  required_plan_awareness: string;
  not_ready_reasons: string[];
}
```

---

## Step 2. 논리적 확장

사용자가 정의한 풀링 콘텐츠 논리적 확장을 그대로 반영한다.

```text
내 상품
→ 카테고리 확장
→ 기능/특징/장점
→ 문제
→ 그 문제를 가진 사람
→ 그 사람이 보고 싶어 할 콘텐츠 주제
```

예시:

```text
알티지 부스터 3
→ 오메가3
→ 심혈관 건강
→ 목 어깨 통증
→ 목 어깨 통증 관련 콘텐츠
```

원민님 상품 예시:

```text
AI 마케팅팀
→ 콘텐츠 마케팅 시스템
→ 고객 구매 흐름 설계
→ 콘텐츠가 매출로 안 이어짐
→ 작은 브랜드 대표
→ 인스타 열심히 해도 손님이 안 오는 이유
```

산출물:

```ts
export interface PullingLogicalExpansionMap {
  product: string;
  category: string;
  feature_benefit: string[];
  problems: string[];
  audience_situations: string[];
  possible_content_topics: string[];
}
```

---

## Step 3. 풀링 문제 축 만들기

풀링 후보는 다음 축에서 만든다.

```text
증상형 문제
원인형 문제
욕구형 주제
계획형 주제
오해 깨기형 주제
보상/사례형 주제
```

단, 이 축은 분류를 위한 도구이지 고정된 단계가 아니다.

하나의 콘텐츠가 여러 축을 동시에 가질 수 있다.

산출물:

```ts
export interface PullingProblemAxisMap {
  symptom_topics: string[];
  cause_topics: string[];
  desire_topics: string[];
  plan_topics: string[];
  misconception_topics: string[];
  reward_case_topics: string[];
}
```

---

## Step 4. 콘텐츠 유형 분류

콘텐츠는 총 4가지 구조로 분류한다.

```text
에버그린
데일리
시즌성
히어로
```

정의:

```text
에버그린: 꾸준하게 트래픽이 발생하는 콘텐츠
데일리: 투입 시간과 제작 비용이 적은 콘텐츠
시즌성: 일시적 또는 일정 기간 폭발적인 트래픽이 발생하는 콘텐츠
히어로: 투입 시간과 제작 비용이 큰 콘텐츠
```

운영 원칙:

```text
에버그린, 데일리 콘텐츠를 중심으로 깔아놓는다.
그리고 그 결에 맞는 시즌성, 히어로 콘텐츠를 찍는다.
유통기한이 긴 상품과 문제를 중심으로 깔아두어야 한다.
```

산출물:

```ts
export interface ContentTypePortfolio {
  evergreen_candidates: PullingTopicCandidate[];
  daily_candidates: PullingTopicCandidate[];
  seasonal_candidates: PullingTopicCandidate[];
  hero_candidates: PullingTopicCandidate[];
}
```

---

## Step 5. 풀링용 Viewtrap 기본 검색 검증

풀링 콘텐츠 기획 안에서 Viewtrap Skill을 호출한다.

실제 검색 단계:

```text
1. 영상 찾기 메뉴에서 영상으로 다루고 싶은 키워드를 검색한다.
2. 필터창에서 기여도 good/great를 클릭한다.
3. 필터창에서 성과도 good/great를 클릭한다.
4. 미드폼을 만들고 있으면 shorts를 제거한다.
5. 검색된 결과를 구독자가 적은 순으로 정렬한다.
6. 영상을 클릭하여 상세 팝업 창에서 영상 조회수 성장 추정 그래프를 확인한다.
7. 그래프를 확인했을 때 조회수 성장이 멈춘 영상이라면 그 영상의 주제보다 지금도 그래프가 올라가고 있는 영상의 주제를 확인한다.
8. 채널 가치, 인물 가치가 들어간 영상은 제외한다.
```

판단 기준:

```text
성과도
기여도
재현성
성장성
채널 가치 배제
인물 가치 배제
키 콘텐츠 연결성
상품 논리 연결성
```

---

## Step 6. 핫 비디오 기능으로 문맥 구조 응용하기

풀링 콘텐츠 기획 안에서 Viewtrap의 핫 비디오 기능을 사용한다.

사용자가 정의한 단계:

```text
핫 비디오 기능을 통해 문맥 구조 응용하기
- 유튜브 홈 화면에 노출 확률이 큰 영상들을 일자별로 확인할 수 있는 기능인 핫 비디오 기능을 이용한다.
- 영상들의 제목을 보고 문맥 구조를 생각한다.
- 영상의 제목과 썸네일을 보고 성과도, 기여도 모두 좋고 실제 내 판매 논리와 고객 설득 기준, 소비자 판매 5가지 요소를 잘 설명할 수 있겠다 판단하면 영상들의 제목을 추출해 디벨롭하여 주제를 정해본다.
- 꼭 나와 같은 주제일 필요는 없다.
```

예시:

```text
눈이 안 보일 때
→ 타깃: 눈이 안 보일까 걱정하는 사람
→ 걱정 기반의 핫 비디오 콘텐츠를 찾는다.
```

원본 구조:

```text
부동산 매매 임대차 계약 할 때 특약란에 이 문구 쓰면 망합니다!
```

구조:

```text
타깃이 겪을 일반적 상황에서 특정 행동을 잘못하면 큰 손실이 생긴다.
```

응용:

```text
아침에 눈 떴을 때 이 행동 하면 제대로 안구건조증 옵니다.
```

원민님 상품 응용:

```text
광고 켜기 전에 이 구조 없으면 돈만 날립니다.
인스타 올릴 때 이 문구만 반복하면 손님 절대 안 옵니다.
AI로 콘텐츠 만들 때 이 순서 틀리면 매출 안 납니다.
```

산출물:

```ts
export interface HotVideoStructureTemplate {
  original_title: string;
  original_thumbnail_copy?: string;
  structure_pattern: string;
  emotional_trigger: 'worry' | 'loss' | 'desire' | 'comparison' | 'mistake' | 'prohibition' | 'checklist' | 'twist';
  adapted_title: string;
  adapted_thumbnail_promise: string;
  connected_sales_logic: string;
}
```

---

## Step 7. 노출 확률이 높은 주제 확인

풀링 콘텐츠 기획 안에서 Viewtrap의 노출 확률 기능을 사용한다.

사용자가 정의한 실제 단계:

```text
1. 노출 확률 버튼을 클릭하고 분석이 완료되면 normal, good, great만 클릭하여 설정한 뒤 결과를 확인한다.
2. 검색된 결과를 노출 확률이 높은 순으로 정렬한다.
3. 지금 어떤 주제의 영상이 노출 확률이 높은지 확인한다.
4. 노출 확률은 지금 유튜브에서 알고리즘을 타고 있을 확률로 계속 달라질 수 있다.
```

활용:

```text
데일리 콘텐츠 후보
시즌성 콘텐츠 후보
지금 홈 화면에서 먹히는 문맥 구조 후보
```

산출물:

```ts
export interface ExposureProbabilityCandidate {
  source_title: string;
  exposure_probability: 'normal' | 'good' | 'great';
  adapted_topic: string;
  recommended_content_type: 'daily' | 'seasonal' | 'evergreen' | 'hero';
  reason: string;
}
```

---

## Step 8. 게시한 지 오래된 영상인데도 노출 확률이 높은 주제 확인

풀링 콘텐츠 기획 안에서 Viewtrap의 오래된 영상 정렬을 사용한다.

사용자가 정의한 단계:

```text
1. 게시일을 오래된 순으로 정렬한다.
2. 게시한 지 오래됐는데도 노출 확률이 좋은 영상들은 어떤 주제를 다루고 있는지 확인한다.
3. 게시일이 오래됐음에도 노출 확률이 좋은 영상은 나중에 노출 확률이 안 좋아져도 한 번 더 올라갈 수 있는 주제를 다룬 영상일 가능성이 크기 때문에 좋은 주제다.
```

강한 규칙:

```text
이 단계는 노다지다.
만약 4단계 콘텐츠를 못 찾겠다면 넘겨도 된다.
단, 4단계에 해당하는 콘텐츠를 발견했다면 반드시 그 주제를 써야 한다.
```

산출물:

```ts
export interface LongtailEvergreenCandidate {
  source_title: string;
  published_age: 'old';
  exposure_probability: 'good' | 'great';
  evergreen_reason: string;
  adapted_topic: string;
  must_use: true;
}
```

---

## Step 9. 풀링 후보 점수화

풀링 후보는 다음 기준으로 점수화한다.

| 항목 | 질문 |
|---|---|
| 성과도 | 실제 조회 성과가 있었는가? |
| 기여도 | 채널 규모 대비 잘 된 주제인가? |
| 노출 확률 | 지금 홈/탐색 알고리즘을 타고 있는가? |
| 성장성 | 조회수 그래프가 계속 올라가는가? |
| 에버그린성 | 오래됐는데도 노출 확률이 살아 있는가? |
| 재현성 | 구독자 낮은 채널에서도 성과가 났는가? |
| 채널/인물 가치 배제 | 채널빨/인물빨이 아닌가? |
| 키 콘텐츠 연결성 | 키 콘텐츠를 볼 이유가 생기는가? |
| 상품 논리 연결성 | 내 판매 논리와 연결되는가? |
| 홈 선택 가능성 | 제목/썸네일이 선택받을 구조인가? |

산출물:

```ts
export interface PullingTopicScore {
  performance_score: number;
  contribution_score: number;
  exposure_probability_score: number;
  growth_score: number;
  evergreen_score: number;
  reproducibility_score: number;
  key_connection_score: number;
  sales_logic_connection_score: number;
  home_selection_score: number;
  total_score: number;
  verdict: 'use' | 'watch' | 'reject';
}
```

---

## Step 10. 키 콘텐츠와의 자연스러운 연결성 평가

풀링 콘텐츠는 하나의 단계로 고정하지 않는다.

다음 문장을 완성할 수 있으면 통과한다.

```text
이 콘텐츠는 [고객]이 겪는 [문제/상황/오해/욕망]을 건드려서,
[키 콘텐츠의 핵심 문제]를 인식하게 만들고,
결국 [키 콘텐츠 제목]을 볼 이유를 만든다.
```

예시:

```text
이 콘텐츠는 작은 브랜드 대표가 겪는 “인스타를 열심히 해도 손님이 안 오는 현상”을 건드려서,
콘텐츠 양이 아니라 고객 구매 흐름이 문제라는 점을 인식하게 만들고,
결국 “마케팅 대행사 쓰기 전에 작은 브랜드 대표가 먼저 알아야 할 것”을 볼 이유를 만든다.
```

---

## Step 11. 소비자 행동 5단계 설명 가능성 평가

전체 풀링 세트와 키 콘텐츠를 합쳤을 때 다음 흐름이 설명되는지 평가한다.

```text
현상
→ 욕구
→ 계획
→ 행동
→ 보상
```

중요:

```text
각 콘텐츠가 꼭 하나의 단계만 담당할 필요는 없다.
하나의 콘텐츠가 현상과 욕구를 동시에 건드려도 된다.
하나의 콘텐츠가 욕구와 계획을 동시에 건드려도 된다.
전체 세트로 봤을 때 흐름이 자연스러우면 된다.
```

산출물:

```ts
export interface ConsumerJourneyCoverageReport {
  phenomenon_covered: boolean;
  desire_covered: boolean;
  plan_covered: boolean;
  action_connected: boolean;
  reward_promised: boolean;
  natural_flow_score: number;
  notes: string[];
}
```

---

## Step 12. 풀링 콘텐츠 세트 확정

최종 풀링 콘텐츠 세트를 확정한다.

산출물:

```ts
export interface ApprovedPullingContentSet {
  pulling_topics: ApprovedPullingTopic[];
  key_content_topic: ApprovedKeyContentTopic;
  journey_coverage_report: ConsumerJourneyCoverageReport;
  set_logic: string;
  approval_status: 'approved';
}
```

---

# 5. 키/풀링 통합 콘텐츠 전략 패키지

키 콘텐츠와 풀링 콘텐츠가 모두 확정되면 최종 전략 패키지를 만든다.

산출물:

```ts
export interface ApprovedContentStrategyPackage {
  product_brief: ProductBrief;
  key_content_strategy: ApprovedKeyContentTopic;
  pulling_content_set: ApprovedPullingContentSet;
  content_type_portfolio: ContentTypePortfolio;
  title_thumbnail_direction: string;
  script_direction: string;
  cta_strategy: string;
}
```

---

# 6. 이후 단계

키/풀링 콘텐츠 전략 패키지가 확정된 뒤에야 다음 단계로 넘어간다.

```text
1. 제목/썸네일 기획
2. 도입부 30초 기획
3. 본문 원고 작성
4. 내 말투 변환
5. CMO Brief 생성
6. 녹음 파일 업로드
7. AI Slide Factory 전달
8. 영상 렌더링
9. 성과 분석 및 재학습
```

---

# 7. Phase별 개발 로드맵

## Phase 1. CMO Orchestrator와 Skill 호출 구조

목표:

```text
CMO가 각 전문 스킬을 필요한 위치에서 호출할 수 있게 한다.
```

개발 항목:

- [ ] `CMOOrchestrator` 생성
- [ ] `AgentSkill` 인터페이스 정의
- [ ] `KeyContentPlanningAgent` 등록
- [ ] `PullingContentPlanningAgent` 등록
- [ ] `ViewtrapSkill` 등록
- [ ] Viewtrap을 독립 단계가 아니라 각 Agent 내부에서 호출 가능하게 설계

---

## Phase 2. Key Content Planning Agent

목표:

```text
사용자가 정의한 키 콘텐츠 기획 워크플로우를 그대로 코드화한다.
```

개발 항목:

- [ ] 아이템 일반화
- [ ] 카테고리 확장
- [ ] 내 아이템 기능/특징/장점 정리
- [ ] 카테고리 기능/특징/장점 정리
- [ ] 기능/특징/장점 → 문제 도출
- [ ] 현상/욕구/계획/행동/보상 퍼널 구성
- [ ] 키 콘텐츠 진입 단계 결정
- [ ] 키 콘텐츠용 Viewtrap 검색축 생성
- [ ] Viewtrap Skill 호출
- [ ] 판매 가능한 콘텐츠 산정
- [ ] 설득 구조 삽입
- [ ] 키 콘텐츠 확정

---

## Phase 3. Viewtrap Skill for Key Content

목표:

```text
키 콘텐츠 기획 안에서 Viewtrap을 검증 도구로 사용한다.
```

개발 항목:

- [ ] 문제 검색축 지원
- [ ] 내 아이템명 검색축 지원
- [ ] 카테고리명 검색축 지원
- [ ] 내 아이템 기능/특징/장점 검색축 지원
- [ ] 카테고리 기능/특징/장점 검색축 지원
- [ ] 성과도/기여도 입력
- [ ] 성장 그래프 상태 입력
- [ ] 채널/인물 가치 위험 체크
- [ ] use/watch/reject 판단

---

## Phase 4. Pulling Content Planning Agent

목표:

```text
풀링 콘텐츠를 키 콘텐츠와 자연스럽게 연결되는 콘텐츠 포트폴리오로 설계한다.
```

개발 항목:

- [ ] 키 콘텐츠 판매 논리 불러오기
- [ ] 키 콘텐츠를 볼 준비가 된 사람 정의
- [ ] 논리적 확장
- [ ] 풀링 문제 축 생성
- [ ] 에버그린/데일리/시즌성/히어로 분류
- [ ] 풀링용 Viewtrap Skill 호출
- [ ] 키 콘텐츠 연결성 평가
- [ ] 소비자 행동 5단계 설명 가능성 평가
- [ ] 풀링 콘텐츠 세트 확정

---

## Phase 5. Viewtrap Skill for Pulling Content

목표:

```text
풀링 콘텐츠 기획 안에서 Viewtrap의 모든 검증 기능을 사용한다.
```

개발 항목:

- [ ] 성과도 good/great 입력
- [ ] 기여도 good/great 입력
- [ ] 미드폼일 경우 shorts 제거 체크
- [ ] 구독자 적은 순 정렬 여부 입력
- [ ] 조회수 성장 추정 그래프 상태 입력
- [ ] 채널 가치/인물 가치 제외 체크
- [ ] 핫 비디오 제목/썸네일 입력
- [ ] 문맥 구조 추출
- [ ] 노출 확률 normal/good/great 입력
- [ ] 노출 확률 높은 순 정렬 결과 입력
- [ ] 게시일 오래된 순 정렬 결과 입력
- [ ] 오래됐는데 노출 확률 good/great 후보 must_use 처리

---

## Phase 6. Content Strategy Package

목표:

```text
키 콘텐츠와 풀링 콘텐츠를 하나의 전략 패키지로 통합한다.
```

개발 항목:

- [ ] `ApprovedContentStrategyPackage` 생성
- [ ] 키 콘텐츠 전략 포함
- [ ] 풀링 콘텐츠 세트 포함
- [ ] Viewtrap 검증 결과 포함
- [ ] 콘텐츠 유형 포트폴리오 포함
- [ ] 소비자 행동 5단계 커버리지 포함
- [ ] 승인 게이트 추가

---

## Phase 7. 제목/썸네일 기획

목표:

```text
홈 화면에서 선택받는 제목/썸네일을 만든다.
```

개발 항목:

- [ ] 핫 비디오 문맥 구조 반영
- [ ] 제목 후보 생성
- [ ] 썸네일 약속 생성
- [ ] 걱정/손실/욕망/실수/비교/체크리스트 구조 반영
- [ ] 제목에 답이 다 들어가지 않도록 검수
- [ ] 키/풀링 콘텐츠별 썸네일 방향 생성

---

## Phase 8. 도입부 30초와 원고

목표:

```text
제목/썸네일의 약속을 도입부에서 회수하고, 판매 논리를 원고로 전개한다.
```

개발 항목:

- [ ] 도입부 30초 생성
- [ ] 제목/썸네일 약속 회수
- [ ] 문제 제시
- [ ] 기존 방식의 한계
- [ ] 새로운 관점
- [ ] 카테고리 필요성
- [ ] 내 상품 연결
- [ ] CTA 작성

---

## Phase 9. 내 말투 변환과 CMO Brief

목표:

```text
원고를 사용자 말투로 바꾸고, AI Slide Factory로 넘길 기획서를 만든다.
```

개발 항목:

- [ ] 사용자 말투 프로필
- [ ] 원고 말투 변환
- [ ] 논리 보존 검증
- [ ] CTA 보존 검증
- [ ] CMO Brief 생성
- [ ] 바꾸면 안 되는 판매 논리 명시

---

## Phase 10. AI Slide Factory 연결 및 성과 재학습

목표:

```text
기획서와 원고를 영상으로 만들고, 성과를 다음 기획에 반영한다.
```

개발 항목:

- [ ] ScriptBeat 변환
- [ ] Factory payload validation
- [ ] 녹음 파일 업로드
- [ ] 자막/장면 길이 생성
- [ ] 영상 렌더링
- [ ] 성과 지표 저장
- [ ] 잘 된 제목/문제/브릿지 구조 저장
- [ ] 다음 콘텐츠 기획에 재학습

---

# 8. 최종 성공 기준

이 PRD가 완료되면 다음이 가능해야 한다.

```text
1. 상품이 들어오면 키 콘텐츠 판매 논리가 만들어진다.
2. 키 콘텐츠 기획 안에서 Viewtrap을 사용해 실제 주제를 검증한다.
3. 풀링 콘텐츠 기획 안에서 Viewtrap을 사용해 주제, 핫 비디오 구조, 노출 확률, 오래된 영상 노출성을 검증한다.
4. Viewtrap은 독립 단계가 아니라 키/풀링 기획 안에서 쓰이는 스킬로 작동한다.
5. 풀링 콘텐츠는 하나의 단계로 고정되지 않고 키 콘텐츠와의 자연스러운 연결성으로 평가된다.
6. 전체 콘텐츠 세트는 소비자 행동 5단계를 자연스럽게 설명한다.
7. 키/풀링 전략이 확정된 뒤 제목/썸네일, 도입부, 원고, 말투 변환으로 이어진다.
8. 최종 CMO Brief가 AI Slide Factory로 넘어가 영상이 만들어진다.
9. 성과 데이터가 다시 콘텐츠 기획에 반영된다.
```

---

# 9. 최종 정의

```text
CMO 콘텐츠 전략 시스템 =
상품의 기능/특징/장점을 고객 문제와 판매 논리로 역설계하고,
키 콘텐츠 기획 안에서 Viewtrap으로 판매 가능한 주제를 검증하며,
풀링 콘텐츠 기획 안에서 Viewtrap으로 홈 화면 선택 가능성과 에버그린성을 검증한 뒤,
키 콘텐츠와 자연스럽게 연결되는 콘텐츠 세트를 만들고,
제목/썸네일/원고/영상 제작/성과 재학습까지 이어지는 AI CMO 운영 시스템
```