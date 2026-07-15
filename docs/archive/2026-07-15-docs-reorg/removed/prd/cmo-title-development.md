# PRD: CMO 제목 디벨롭 8단계 워크플로우 모듈

- 문서 버전: v1.0
- 작성일: 2026-06-10
- 대상 제품: Pulk / CMO Video Room / AI CMO
- 대상 기능: 풀링 콘텐츠 제목·썸네일 디벨롭 워크플로우
- 우선순위: P0
- 상태: Draft
- 작성 목적: 개발자가 바로 구현 가능한 수준으로, 제목 디벨롭 전체 워크플로우와 데이터 구조, UI, 상태머신 접목 방식, 수용 기준을 정의한다.

---

## 0. 한 줄 정의

CMO가 풀링 콘텐츠 주제를 입력받으면, Viewtrap에서 검증된 같은 주제 또는 같은 의미 범위의 레퍼런스 콘텐츠 2개를 기반으로 제목·썸네일 재료를 교차 조합하고, 8단계 제목 디벨롭을 거쳐 최종 업로드 후보 제목과 썸네일 방향을 선택하게 만드는 워크플로우 모듈이다.

---

## 1. 배경

Pulk의 CMO Video Room은 Founder와 CMO가 대화하며 유튜브 콘텐츠 전략을 설계하는 상태머신 기반 워크플로우를 갖고 있다. 현재 구조상 CMO는 단계별로 현재 워크플로우 상태를 읽고, 현재 단계의 산출물 카드인 `proposal`과 승인 요청인 `gate`를 만든다.

현재 CMO 워크플로우에는 다음 단계들이 있다.

1. 전략 대화 시작
2. Business PT 컨텍스트 로딩
3. 상품/문제 정의
4. 키 콘텐츠 후보 기획
5. Viewtrap 키 리서치
6. 키 콘텐츠 승인
7. Viewtrap 풀링 리서치
8. 풀링 콘텐츠 5개 선별
9. 풀링 세트 승인
10. 썸네일 구성
11. 원고 도입부 30초
12. 썸네일/제목/도입부 승인
13. 원고 기획
14. 원고 작성
15. 원고 승인
16. 녹음
17. 슬라이드 스펙 생성
18. 렌더링
19. QA
20. 업로드 초안
21. 업로드 승인
22. 완료

이 중 이번 PRD는 다음 구간을 세분화한다.

```text
Viewtrap 풀링 리서치
→ 풀링 콘텐츠 5개 선별
→ 풀링 세트 승인
→ 제목 디벨롭 8단계
→ 썸네일 구성
→ 원고 도입부 30초
→ 썸네일/제목/도입부 승인
```

기존에는 `thumbnail_pattern_extraction` 단계에서 썸네일 구성과 제목 후보가 함께 처리되는 흐름에 가까웠다. 그러나 실제 강의/컨설팅 기반 워크플로우에서는 제목 디벨롭이 별도의 사고 과정으로 존재한다. 특히 풀링 콘텐츠의 제목은 단순히 주제를 설명하는 문장이 아니라 클릭률을 높이기 위한 후킹 구조이며, Viewtrap에서 이미 성과가 확인된 제목·썸네일 재료를 기반으로 개발되어야 한다.

---

## 2. 문제 정의

### 2.1 현재 문제

현재 CMO가 제목을 만들 때 다음 문제가 발생할 수 있다.

1. 제목을 감으로 만든다.
2. Viewtrap 성과 데이터 없이 제목을 확정한다.
3. 풀링 콘텐츠 주제와 다른 레퍼런스를 가져온다.
4. 제목과 썸네일이 같은 말을 반복한다.
5. 제목은 후킹되지만 원고 내용과 맞지 않는다.
6. 대표/창업자가 볼 제목이 아니라 마케터나 개발자만 볼 제목이 된다.
7. 8단계 디벨롭 과정 없이 곧바로 최종 후보를 만든다.
8. 최종 후보가 왜 베스트인지 평가 기준이 기록되지 않는다.

### 2.2 해결해야 할 핵심 질문

CMO는 제목을 만들 때 반드시 아래 질문에 답해야 한다.

1. 이 풀링 콘텐츠와 같은 주제의 검증된 콘텐츠 2개를 찾았는가?
2. 같은 주제가 없다면, 같은 의미 범위 안에서 확장한 근거가 있는가?
3. 각 레퍼런스는 조회수 5만 이상인가?
4. 각 레퍼런스는 성과도 Good 또는 Great인가?
5. 각 레퍼런스는 기여도 Good 또는 Great인가?
6. 레퍼런스 1과 2의 제목/썸네일 재료를 교차 조합했는가?
7. 조합이 어색한 경우 반대 조합도 시도했는가?
8. 이 재료를 기반으로 8단계 디벨롭을 모두 거쳤는가?
9. 최종 제목이 대표가 실제로 볼 만한 문장인가?
10. 최종 제목과 썸네일이 원고 내용과 일치하는가?

---

## 3. 제품 목표

### 3.1 기능 목표

| 목표 | 설명 | 성공 기준 |
|---|---|---|
| Viewtrap 기반 제목 개발 | 감이 아니라 성과 레퍼런스 기반으로 제목을 만든다. | 레퍼런스 2개 모두 조건 통과 |
| 1단계 교차 조합 구현 | 제목과 썸네일 재료를 서로 다른 콘텐츠에서 가져와 조합한다. | 최소 2개, 권장 4개 조합 후보 생성 |
| 8단계 디벨롭 강제 | 제목을 단계적으로 발전시킨다. | 각 단계별 입력/출력/이유 저장 |
| 최종 평가 게이트 도입 | 베스트 제목을 점수로 판단한다. | 최종 제목 1개, 후보 3개, 점수표 출력 |
| CMO 상태머신 접목 | 기존 Video Room 흐름에 자연스럽게 붙인다. | `proposal.data`로 저장 가능 |
| 세컨 브레인 저장 | 최종 학습 구조를 재사용 가능한 인사이트로 저장한다. | Memory 후보 요약 생성 |

### 3.2 비즈니스 목표

1. 풀링 콘텐츠의 클릭률 개선
2. 키 콘텐츠로 이어지는 브릿지 강화
3. Founder가 제목 디벨롭 과정을 학습할 수 있게 만들기
4. 콘텐츠 제작 과정을 반복 가능한 마케팅 자산으로 만들기
5. Pulk가 단순 영상 자동화가 아니라 실제 사업 운영 툴로 발전할 수 있게 하기

---

## 4. 범위

### 4.1 MVP 포함 범위

1. 수동 Viewtrap 레퍼런스 입력
2. 레퍼런스 조건 검증
3. 동일 주제/확장 주제 판정
4. 레퍼런스 2개 기반 제목·썸네일 교차 조합
5. 8단계 제목 디벨롭 실행
6. 최종 평가 점수화
7. 최종 제목/썸네일 방향 산출
8. CMO `proposal.data`에 저장 가능한 구조 출력
9. 승인 게이트 생성
10. 세컨 브레인 저장용 요약 생성

### 4.2 MVP 제외 범위

1. Viewtrap 자동 크롤링
2. Viewtrap 계정 자동 로그인
3. 썸네일 이미지 자동 생성
4. YouTube/Instagram 자동 업로드
5. 업로드 후 성과 자동 수집
6. 실제 A/B 테스트 자동 집행
7. 이미지 기반 썸네일 OCR 분석
8. 외부 콘텐츠 직접 게시

---

## 5. 기존 Pulk 구조와의 접목 지점

### 5.1 현재 CMO Agent 구조

현재 `services/agent-runtime/src/agents/cmo.ts`의 CMO Agent는 다음 역할을 가진다.

- PMF message
- content
- positioning
- demand experiments
- customer research

CMO Agent는 외부 게시 전에는 멈추고 Founder approval을 요구해야 하며, 외부-facing 작업은 위험도 D3 이상으로 분류하고 승인 필요 상태로 둔다.

따라서 제목 디벨롭 모듈 역시 외부 노출 가능성이 있는 콘텐츠 카피 작업이므로 다음 원칙을 따른다.

1. 최종 제목은 자동 게시되지 않는다.
2. 최종 제목은 승인 게이트로 넘긴다.
3. 위험도는 기본 D3로 본다.
4. Founder 승인 전에는 `draft` 상태다.
5. CMO는 최소 2개 이상의 변형 후보를 만든 뒤 추천해야 한다.

### 5.2 현재 CMO Strategy Turn 구조

`runCmoStrategyTurn`은 다음을 수행한다.

1. 현재 `VideoRoomStatus`를 읽는다.
2. `STAGE_SCRIPT`에서 현재 단계의 label/focus/prompt를 가져온다.
3. LLM 또는 deterministic fallback으로 응답한다.
4. `proposal`을 만든다.
5. 승인 단계에서는 `gate`를 만든다.
6. `ready_to_advance`로 다음 단계 진행 여부를 반환한다.

따라서 제목 디벨롭 모듈은 다음 방식으로 붙인다.

```text
현재 상태:
thumbnail_pattern_extraction

개선안:
pulling_title_development
→ thumbnail_pattern_extraction
→ intro_30s_analysis
→ hook_draft_approval
```

MVP에서는 상태 추가보다 기존 단계 내부 확장이 더 안전하다.

권장 MVP 방식:

```ts
proposal: {
  stage: "thumbnail_pattern_extraction",
  summary: "풀링 콘텐츠 제목 디벨롭 8단계 결과",
  data: {
    title_development_workflow: TitleDevelopmentWorkflowRun
  }
}
```

향후 확장 방식:

```ts
VideoRoomStatus에 "pulling_title_development" 추가
```

### 5.3 현재 Video Room 타입과 연결

현재 타입에는 다음 구조가 이미 존재한다.

- `ViewtrapResearchSession`
- `ReferenceCandidate`
- `ViewtrapReference`
- `PullingContentPlan`
- `ThumbnailPattern`
- `Intro30sAnalysis`
- `VideoRoomApprovalGate`
- `ScriptPlan`
- `UploadDraft`

제목 디벨롭 모듈은 이 중 다음과 직접 연결된다.

| 기존 타입 | 연결 방식 |
|---|---|
| `ViewtrapResearchSession` | 제목 디벨롭용 레퍼런스 검색 세션 |
| `ReferenceCandidate` | 레퍼런스 후보 저장 |
| `ViewtrapReference` | 최종 사용한 레퍼런스 저장 |
| `PullingContentPlan` | 디벨롭 대상 풀링 콘텐츠 |
| `ThumbnailPattern` | 썸네일 문구/구조 재료 |
| `Intro30sAnalysis` | 제목과 도입부의 약속 일치 검증 |
| `VideoRoomApprovalGate` | 최종 제목/썸네일/도입부 승인 |

---

## 6. 사용자 시나리오

### 6.1 기본 시나리오

1. Founder가 풀링 콘텐츠 주제를 입력한다.
   - 예: `인스타그램 릴스 자동화 기초 작업을 보여주는 영상`

2. CMO가 주제를 일반명사화한다.
   - 릴스 자동화
   - 인스타 릴스 자동화
   - 릴스 제작 자동화
   - 쇼츠 자동화
   - 영상 자동화
   - 콘텐츠 자동화

3. CMO가 Viewtrap 검색 기준을 제안한다.
   - 같은 주제 우선
   - 같은 주제가 없으면 같은 의미 범위 확장
   - 조회수 5만 이상
   - 성과도 Good/Great
   - 기여도 Good/Great

4. Founder가 Viewtrap에서 레퍼런스 2개를 찾아 입력한다.
5. CMO가 레퍼런스 조건을 검증한다.
6. CMO가 1단계 교차 조합을 실행한다.
7. CMO가 2~8단계 제목 디벨롭을 진행한다.
8. CMO가 최종 후보를 점수화한다.
9. CMO가 최종 제목 1개와 후보 3개, 썸네일 방향 1개를 제안한다.
10. Founder가 승인/수정/다른 후보 보기/보류 중 선택한다.

---

## 7. Viewtrap 리서치 워크플로우

### 7.1 리서치 목적

Viewtrap 리서치는 제목을 만들기 위한 감각 수집이 아니다. 이미 시장에서 클릭된 문장과 썸네일 구조를 찾기 위한 검증 단계다.

Viewtrap에서 찾는 것은 다음 4가지다.

1. 같은 주제에서 성과가 난 제목
2. 같은 주제에서 성과가 난 썸네일 문구
3. 제목과 썸네일의 역할 분담 구조
4. 지금도 반응하는 핫비디오 문장 구조

### 7.2 검색 순서

#### 1순위: 완전히 같은 주제

예시:

- 릴스 자동화
- 인스타 릴스 자동화
- 릴스 제작 자동화
- 인스타 콘텐츠 자동화

#### 2순위: 같은 의미 범위의 확장 주제

완전히 같은 주제 콘텐츠가 없을 때만 허용한다.

예시:

- 쇼츠 자동화
- 영상 자동화
- 숏폼 자동화
- 콘텐츠 자동화
- AI 영상 제작 자동화

#### 3순위: 인접 주제

이 단계는 원칙적으로 제목 디벨롭 재료로 쓰지 않는다. 단, 수식어/구조 참고용으로만 사용한다.

예시:

- 인스타 브랜딩
- 마케팅 자동화
- 콘텐츠 제작 루틴
- 1인 사업자 콘텐츠 운영

#### 허용 불가

다음은 제목 재료로 쓰면 안 된다.

- 일반 인스타 브랜딩
- 네이버 광고 세팅법
- 상세페이지 제작
- 오프라인 영업법
- 대기업 브랜드 전략
- 완전히 다른 산업의 흥미 콘텐츠

단, 5단계 수식어 참고나 7단계 핫비디오 구조 참고로는 사용할 수 있다.

### 7.3 필수 필터 조건

레퍼런스 콘텐츠 2개는 모두 다음 조건을 만족해야 한다.

| 조건 | 기준 |
|---|---|
| 조회수 | 50,000 이상 |
| 성과도 | Good 또는 Great |
| 기여도 | Good 또는 Great |
| 주제 유사도 | exact 또는 expanded_same_meaning |
| 제목 | 반드시 존재 |
| 썸네일 문구 | 반드시 존재 |
| URL | 가능하면 입력 |
| 선택 이유 | 반드시 기록 |

### 7.4 레퍼런스 탈락 조건

다음 중 하나라도 해당하면 탈락한다.

1. 조회수 5만 미만
2. 성과도 Good 미만
3. 기여도 Good 미만
4. 제목은 좋지만 썸네일 문구가 없음
5. 썸네일은 좋지만 주제가 너무 다름
6. 채널 가치나 개인 가치 때문에 뜬 영상으로 보임
7. Founder의 풀링 콘텐츠 주제와 연결이 약함
8. 제목을 가져오면 원고 내용과 충돌함

### 7.5 레퍼런스 입력 템플릿

```markdown
## 레퍼런스 1

- 제목:
- URL:
- 조회수:
- 성과도:
- 기여도:
- 썸네일 문구:
- 썸네일 구조:
- 주제:
- 내 풀링 콘텐츠와의 관계: exact / expanded_same_meaning
- 왜 이걸 레퍼런스로 선택했는가:

## 레퍼런스 2

- 제목:
- URL:
- 조회수:
- 성과도:
- 기여도:
- 썸네일 문구:
- 썸네일 구조:
- 주제:
- 내 풀링 콘텐츠와의 관계: exact / expanded_same_meaning
- 왜 이걸 레퍼런스로 선택했는가:
```

---

## 8. 제목 디벨롭 8단계 전체 워크플로우

8단계는 다음 순서로 진행한다.

```text
1단계. 검증된 레퍼런스 2개 기반 제목·썸네일 교차 조합
2단계. 쉬운 단어로 전환
3단계. 상위어로 전환
4단계. 부정어/반대 구조로 전환
5단계. 수식어 추가
6단계. 답이 보이는 제목을 질문이 생기게 전환
7단계. 핫비디오 구조로 갈아끼우기
8단계. 강한 단어로 변경
```

각 단계는 반드시 다음을 남겨야 한다.

1. 입력 제목
2. 변경 방식
3. 출력 제목 후보
4. 버린 후보
5. 버린 이유
6. 다음 단계로 넘긴 후보
7. CMO 판단 코멘트

---

## 9. 1단계: 검증된 레퍼런스 2개 기반 제목·썸네일 교차 조합

### 9.1 단계 목적

1단계의 목적은 제목을 새로 쓰는 것이 아니다. 이미 클릭된 제목과 썸네일 재료를 모아 초기 조합 후보를 만드는 것이다.

이 단계에서는 반드시 풀링 콘텐츠와 같은 주제의 콘텐츠 2개를 찾아야 한다. 같은 주제를 찾지 못하면 같은 의미 범위 안에서만 확장한다.

예시:

```text
원래 풀링 주제: 릴스 자동화

1순위 검색:
- 릴스 자동화
- 인스타 릴스 자동화
- 릴스 제작 자동화

확장 가능:
- 쇼츠 자동화
- 영상 자동화
- 숏폼 자동화
- 콘텐츠 자동화
```

확장 가능하다는 것은 주제가 완전히 같지는 않지만, 시청자가 얻으려는 결과가 같은 경우를 의미한다.

즉, `반복되는 영상 제작을 AI/자동화로 줄인다`는 의미 범위 안에 있으면 허용한다.

### 9.2 레퍼런스 선택 조건

두 콘텐츠 모두 다음 조건을 만족해야 한다.

```text
성과도: Good 또는 Great
기여도: Good 또는 Great
조회수: 50,000 이상
주제 유사도: exact 또는 expanded_same_meaning
```

하나라도 만족하지 않으면 CMO는 다음 단계로 넘어가면 안 된다.

### 9.3 1단계 조합 규칙

레퍼런스 2개를 찾으면 다음 순서로 조합한다.

#### 조합 A: 1번 썸네일 + 2번 제목

가장 먼저 시도하는 기본 조합이다.

```text
썸네일 재료 = 레퍼런스 1의 썸네일 문구/구조
제목 재료 = 레퍼런스 2의 제목 구조
```

출력 예:

```markdown
Candidate A
- 제목 후보:
- 썸네일 후보:
- 조합 이유:
- 어색함 여부:
- 다음 단계로 넘길지:
```

#### 조합 B: 1번 제목 + 2번 썸네일

조합 A가 어색하면 반대로 조합한다.

```text
제목 재료 = 레퍼런스 1의 제목 구조
썸네일 재료 = 레퍼런스 2의 썸네일 문구/구조
```

#### 조합 C: 1번 썸네일 문구를 제목으로 사용 + 2번 썸네일 구조 사용

레퍼런스 1의 썸네일 문구가 강하면 그것을 제목화한다.

```text
제목 재료 = 레퍼런스 1의 썸네일 문구
썸네일 재료 = 레퍼런스 2의 썸네일 구조
```

#### 조합 D: 2번 썸네일 문구를 제목으로 사용 + 1번 썸네일 구조 사용

반대로 레퍼런스 2의 썸네일 문구를 제목화한다.

```text
제목 재료 = 레퍼런스 2의 썸네일 문구
썸네일 재료 = 레퍼런스 1의 썸네일 구조
```

### 9.4 왜 교차 조합을 하는가?

한 콘텐츠의 제목과 썸네일을 그대로 가져오면 표절 위험이 생긴다. 또한 원작자의 구조와 너무 비슷해질 수 있다.

교차 조합은 다음 목적을 가진다.

1. 원작자와 충돌 방지
2. 이미 검증된 제목 구조와 썸네일 구조를 분리해 재사용
3. 제목과 썸네일이 같은 말을 반복하지 않게 함
4. 더 넓은 디벨롭 재료 확보
5. CMO가 단순 복사가 아니라 구조 분석을 하게 만듦

### 9.5 어색함 판단 기준

| 판단 항목 | 어색한 경우 | 처리 |
|---|---|---|
| 제목-썸네일 중복 | 제목과 썸네일이 같은 말을 반복함 | 한쪽은 결과, 한쪽은 문제로 역할 분리 |
| 주제 불일치 | 제목은 릴스 자동화인데 썸네일은 브랜딩 일반론임 | 조합 탈락 |
| 타겟 불일치 | 대표가 아니라 개발자나 마케터만 볼 문장임 | 대표 욕망 중심으로 재작성 |
| 원고 불일치 | 제목은 매출을 약속하지만 내용은 툴 설명뿐임 | 제목 낮추기 또는 원고 보강 |
| 의미 과장 | 원본보다 훨씬 강한 약속을 함 | 8단계 전까지 보류 |
| 클릭 이유 부족 | 제목과 썸네일을 봐도 왜 봐야 하는지 모름 | 5~6단계에서 보강 |

### 9.6 1단계 출력물

```json
{
  "step": 1,
  "name": "reference_cross_combination",
  "references": ["ref_1", "ref_2"],
  "combinations": [
    {
      "id": "combination_a",
      "title_source": "ref_2.title",
      "thumbnail_source": "ref_1.thumbnail",
      "title_draft": "",
      "thumbnail_draft": "",
      "awkwardness_score": 0,
      "awkwardness_reason": "",
      "passed": true
    }
  ],
  "selected_combinations_for_next_step": ["combination_a", "combination_c"]
}
```

---

## 10. 2단계: 쉬운 단어로 전환

### 10.1 단계 목적

2단계의 목적은 제목을 일반 시청자가 바로 이해할 수 있는 말로 바꾸는 것이다.

특히 AI, 자동화, 마케팅, 브랜딩, 전환율 같은 단어는 타겟에 따라 어렵게 느껴질 수 있다.

### 10.2 실행 방법

1. 제목 안의 전문어를 표시한다.
2. 타겟이 실제로 쓰는 말로 바꾼다.
3. 의미가 바뀌지 않았는지 확인한다.
4. Viewtrap에서 비슷한 쉬운 표현이 더 많은 조회수를 만들었는지 확인한다.
5. 쉬운 말이지만 사람들이 쓰지 않는 표현이면 버린다.

### 10.3 변환 예시

| 원래 표현 | 쉬운 표현 |
|---|---|
| 콘텐츠 전략 | 뭘 올려야 하는지 |
| 브랜딩 | 사람들이 기억하게 만드는 것 |
| 전환율 | 문의가 들어오는 비율 |
| 자동화 프로세스 | 반복 작업을 줄이는 순서 |
| 릴스 제작 효율화 | 릴스 만드는 시간 줄이기 |
| 타겟 오디언스 | 봐야 할 사람 |
| CTA | 상담 신청하게 만드는 말 |

### 10.4 실패 기준

1. 쉬운 말로 바꿨는데 의미가 달라졌다.
2. 쉬운 말이지만 실제로 사람들이 쓰지 않는다.
3. 쉬운 말로 바꾸니 제목의 힘이 약해졌다.
4. 조회수 합계가 더 낮은 표현으로 바뀌었다.
5. 타겟이 오히려 더 헷갈린다.

---

## 11. 3단계: 상위어로 전환

### 11.1 단계 목적

3단계는 너무 좁은 단어를 더 넓은 욕망의 단어로 바꾸는 단계다.

예를 들어 `릴스 자동화`는 기능 중심이다. `인스타 콘텐츠 만드는 시간 줄이기`는 문제 중심이다. `작은 브랜드가 인스타로 매출 올리는 법`은 더 큰 욕망 중심이다.

단, 상위어로 넓힌다고 해서 주제가 흐려지면 안 된다.

### 11.2 실행 방법

1. 제목 안의 핵심 명사를 찾는다.
2. 그 명사가 속한 상위 카테고리를 적는다.
3. Viewtrap에서 각각 검색해 시장성을 비교한다.
4. 상위어로 바꿨을 때 원고 내용이 여전히 맞는지 확인한다.
5. 주제가 흐려지면 원래 단어로 되돌린다.

### 11.3 상위어 예시

| 좁은 단어 | 상위어 후보 | 더 큰 욕망 |
|---|---|---|
| 릴스 자동화 | 콘텐츠 자동화 | 반복 작업 줄이기 |
| 릴스 제작 | 인스타 콘텐츠 | 인스타 운영 |
| 인스타 자동화 | 마케팅 자동화 | 대표 시간 절약 |
| 썸네일 | 클릭률 | 사람들이 누르게 만들기 |
| 쇼츠 자동화 | 영상 자동화 | 콘텐츠 생산성 |

### 11.4 판단 질문

1. 상위어로 바꿨을 때 더 많은 사람이 볼 수 있는가?
2. 상위어로 바꿔도 원고의 핵심 내용이 유지되는가?
3. 타겟의 욕망이 더 선명해졌는가?
4. 너무 추상적으로 바뀌지 않았는가?
5. Viewtrap에서 상위어 표현의 성과가 더 좋은가?

---

## 12. 4단계: 부정어/반대 구조로 전환

### 12.1 단계 목적

4단계는 제목을 손실 회피 구조로 바꾸는 단계다.

사람은 얻는 것보다 잃는 것에 더 민감하다. 따라서 `이렇게 하면 됩니다`보다 `이렇게 하지 마세요`, `이 실수 때문에 안 됩니다`가 더 강하게 작동할 수 있다.

### 12.2 실행 방법

1. 현재 제목이 긍정형인지 확인한다.
2. 반대로 했을 때 어떤 손해가 생기는지 적는다.
3. 그 손해가 원고에서 설명되는지 확인한다.
4. 원고에 근거가 없으면 부정형 제목을 쓰지 않는다.
5. 문제 지적형 후보와 경고형 후보를 각각 만든다.

### 12.3 변환 예시

| 긍정형 | 부정형 |
|---|---|
| 릴스로 매출 올리는 법 | 인스타로 매출 올리려면 이런 릴스 만들지 마세요 |
| 콘텐츠 자동화로 시간을 줄이는 법 | 대표가 콘텐츠 만들 때 시간 낭비하는 이유 |
| 조회수 높이는 릴스 구조 | 조회수는 나오는데 문의가 안 오는 릴스의 공통점 |
| 작은 브랜드 인스타 운영법 | 작은 브랜드가 인스타에서 가장 많이 망하는 이유 |

### 12.4 주의점

부정형 제목은 강하지만 위험하다. 아래처럼 말하려면 원고 안에 반드시 근거가 있어야 한다.

- 망합니다
- 절대 하지 마세요
- 치명적인 실수
- 매출이 안 납니다
- 시간 낭비입니다

---

## 13. 5단계: 수식어 추가

### 13.1 단계 목적

5단계는 제목의 클릭 이유를 더 선명하게 만드는 단계다.

수식어는 제목의 힘을 키운다. 하지만 잘못 붙이면 주제가 흐려진다. 수식어는 반드시 본문 내용과 일치해야 한다.

### 13.2 수식어 찾는 방법

1. 같은 분야의 Good/Great 영상을 조회수 높은 순으로 본다.
2. 꼭 내 주제가 아니어도 수식어 구조만 참고한다.
3. 조회수 10만 이상, 구독자 낮은 채널의 제목을 우선 본다.
4. 수식어가 어떤 감정을 강화하는지 분류한다.
5. 내 제목에 붙였을 때 주제가 선명해지는지 확인한다.

### 13.3 수식어 유형

| 유형 | 예시 | 사용 상황 |
|---|---|---|
| 문제 지적 | 가장 많이 하는 실수, 놓치는 부분, 망하는 이유 | 잘못된 행동을 고치는 콘텐츠 |
| 결과 강조 | 매출 나는, 문의 들어오는, 저장되는 | 성과를 보여주는 콘텐츠 |
| 대상 한정 | 작은 브랜드가, 대표님이, 1인 사업자가 | 타겟을 좁혀야 할 때 |
| 시간 절약 | 10분 만에, 매번 반복하지 않는, 하루를 줄이는 | 자동화/효율 콘텐츠 |
| 강도 강화 | 치명적인, 절대, 반드시, 진짜 | 강한 후킹이 필요할 때 |
| 구조 강조 | 3단계, 전체 과정, 처음부터 끝까지 | 실전형 콘텐츠 |
| 대비 | 조회수는 나오는데, 열심히 하는데, 돈은 쓰는데 | 문제 대비형 콘텐츠 |

### 13.4 35자 초과 시 정리 순서

1. 조사 제거
2. 약한 수식어 제거
3. 중복 단어 제거
4. 타겟이 이미 명확하면 타겟 단어 제거
5. 핵심 욕망과 문제만 남기기

---

## 14. 6단계: 답이 보이는 제목을 질문이 생기게 전환

### 14.1 단계 목적

6단계는 제목에 정보 일부를 누락해 클릭 이유를 만드는 단계다.

제목에서 답이 다 보이면 시청자는 클릭하지 않는다. 시청자는 제목을 보고 머리에 질문이 생겨야 한다.

### 14.2 실행 방법

1. 제목 안에 결론이 다 들어가 있는지 확인한다.
2. 누가, 언제, 어디서, 무엇을, 어떻게, 왜 중 하나를 빼본다.
3. 빠진 정보가 시청자의 욕망과 연결되는지 확인한다.
4. 호기심, 문제 지적, 의혹 중 어떤 감정을 만드는지 표시한다.
5. 클릭하지 않으면 알 수 없는 정보가 남아 있는지 확인한다.

### 14.3 변환 예시

| 답이 보이는 제목 | 질문이 생기는 제목 |
|---|---|
| 릴스는 짧게 만들어야 조회수가 잘 나옵니다 | 왜 짧은 릴스인데도 매출은 안 날까? |
| AI로 릴스를 자동화하는 방법 | 대표가 릴스 만들 때 시간을 빼앗기는 진짜 이유 |
| 인스타 콘텐츠는 꾸준히 올려야 합니다 | 매일 올리는데도 인스타가 안 크는 이유 |
| 릴스 자동화는 템플릿이 중요합니다 | 자동화해도 퀄리티가 낮아 보이는 이유 |

---

## 15. 7단계: 핫비디오 구조로 갈아끼우기

### 15.1 단계 목적

7단계는 과거에 먹힌 제목이 아니라 지금 타고 있는 제목 구조를 적용하는 단계다.

여기서 중요한 것은 제목을 베끼는 것이 아니라 구조를 뜯어오는 것이다.

### 15.2 실행 방법

1. Viewtrap 핫비디오에서 현재 성과가 좋은 제목을 찾는다.
2. 구독자 낮은데 조회수가 높은 영상을 우선 본다.
3. 제목을 단어 단위가 아니라 구조 단위로 분해한다.
4. 그 구조를 내 주제에 치환한다.
5. 치환 후에도 타겟과 원고가 맞는지 확인한다.

### 15.3 구조 분석 예시

원본:

```text
거실 넓게 쓰려면 이렇게 배치하지 마세요
```

구조:

```text
타겟이 원하는 결과 + 그 결과를 막는 행동 금지
```

치환:

```text
인스타로 매출 올리려면 이렇게 릴스 만들지 마세요
```

### 15.4 자주 쓰는 핫비디오 구조

| 구조 | 공식 | 예시 |
|---|---|---|
| 결과 + 금지 | ~하려면 이렇게 하지 마세요 | 인스타로 매출 올리려면 이렇게 릴스 만들지 마세요 |
| 노력 대비 실패 | 열심히 하는데 안 되는 이유 | 매일 올리는데 인스타가 안 크는 이유 |
| 문제 공통점 | ~의 공통점 | 조회수는 나오는데 문의가 안 오는 릴스의 공통점 |
| 대상 호출 | ~라면 꼭 보세요 | 작은 브랜드 대표라면 릴스 만들기 전에 보세요 |
| 순서 강조 | 먼저 해야 할 것 | 광고비 쓰기 전에 먼저 고쳐야 할 콘텐츠 구조 |
| 비교 | A와 B는 다릅니다 | 조회수 높은 릴스와 매출 나는 릴스는 다릅니다 |
| 실수 지적 | 가장 많이 하는 실수 | 대표님들이 릴스 만들 때 가장 많이 하는 실수 |

---

## 16. 8단계: 강한 단어로 변경

### 16.1 단계 목적

8단계는 제목의 에너지를 마지막으로 높이는 단계다.

하지만 강한 단어는 마지막 단계에서만 사용한다. 처음부터 강한 단어를 쓰면 제목은 자극적이지만 신뢰가 떨어질 수 있다.

### 16.2 실행 방법

1. 현재 제목에서 약한 단어를 찾는다.
2. 같은 의미의 강한 단어 후보를 만든다.
3. 강한 단어가 원고 내용과 맞는지 확인한다.
4. 너무 과하면 한 단계 낮춘다.
5. 최종 후보와 안전 후보를 함께 남긴다.

### 16.3 단어 강화 예시

| 약한 단어 | 강한 단어 |
|---|---|
| 문제 | 실수, 함정, 망하는 이유 |
| 도움 되는 | 바로 써먹는, 매출 나는, 문의 들어오는 |
| 효율화 | 시간 낭비 줄이기, 반복 작업 없애기 |
| 좋지 않은 | 망치는, 놓치는, 손해 보는 |
| 중요한 | 반드시 해야 할, 먼저 봐야 할 |
| 차이 | 결정적 차이, 진짜 차이 |

### 16.4 강도 단계

| 강도 | 예시 | 사용 조건 |
|---|---|---|
| 약함 | 자주 놓치는 부분 | 원고 근거가 약할 때 |
| 중간 | 가장 많이 하는 실수 | 사례가 있을 때 |
| 강함 | 치명적인 실수 | 근거와 사례가 충분할 때 |
| 매우 강함 | 이러면 망합니다 | 실제 손실 근거가 있을 때만 |

---

## 17. 최종 평가 게이트

### 17.1 평가 목적

8단계를 모두 거친 뒤에는 제목을 감으로 고르지 않는다. CMO는 최종 후보를 점수화하고, 왜 이 문장이 베스트인지 설명해야 한다.

### 17.2 평가 항목

| 항목 | 질문 | 배점 |
|---|---|---:|
| 타겟 적합도 | 이 제목을 작은 브랜드 대표/1인 사업자가 실제로 볼까? | 20 |
| 욕망 선명도 | 매출, 문의, 시간 절약, 콘텐츠 고민 해결 같은 욕망이 보이는가? | 20 |
| 문제 지적 | 시청자가 “내 얘기다”라고 느낄 문제를 건드리는가? | 20 |
| 호기심 | 제목에 답이 다 나와 있지 않고 클릭해야 확인할 정보가 남아 있는가? | 15 |
| 원고 일치도 | 제목에서 약속한 내용을 영상 안에서 실제로 보여줄 수 있는가? | 15 |
| 썸네일 결합도 | 제목과 썸네일이 서로 다른 역할을 하며 함께 후킹되는가? | 10 |
| 총점 |  | 100 |

### 17.3 점수별 처리

| 점수 | 처리 |
|---:|---|
| 85점 이상 | 업로드 후보 |
| 70~84점 | 수정 후 후보 |
| 69점 이하 | 레퍼런스 선정부터 재실행 |

---

## 18. CMO 응답 포맷

현재 CMO 전략 턴은 자연어 응답 안에서 다음 요소를 요구한다.

- 현재 단계
- 현재 상황
- 핵심 판단
- 근거
- 선택지
- 추천안
- 승인 필요 여부
- 다음 액션

제목 디벨롭 모듈에서도 동일한 포맷을 따른다.

### 18.1 단계 중 응답 예시

```markdown
현재 단계: 제목 디벨롭 1단계 - 레퍼런스 교차 조합

현재 상황:
풀링 콘텐츠 주제는 “인스타그램 릴스 자동화”입니다.
완전히 같은 주제의 레퍼런스가 부족하면 “쇼츠 자동화”, “영상 자동화”, “콘텐츠 자동화”까지 확장할 수 있습니다.

핵심 판단:
제목과 썸네일을 한 영상에서 그대로 가져오면 충돌 위험이 있으므로, 검증된 레퍼런스 2개의 제목/썸네일 재료를 교차 조합합니다.

근거:
두 레퍼런스 모두 조회수 5만 이상, 성과도 Good/Great, 기여도 Good/Great 조건을 만족해야 합니다.

선택지:
1. Ref1 썸네일 + Ref2 제목
2. Ref1 제목 + Ref2 썸네일
3. Ref1 썸네일 문구 제목화 + Ref2 썸네일 구조
4. Ref2 썸네일 문구 제목화 + Ref1 썸네일 구조

추천안:
먼저 1번 조합을 만들고, 어색하면 2번 조합으로 바꿔보겠습니다.

승인 필요 여부:
아직 내부 드래프트 단계라 승인은 필요하지 않습니다.

다음 액션:
레퍼런스 2개의 제목, 썸네일 문구, 조회수, 성과도, 기여도를 입력해 주세요.
```

### 18.2 최종 승인 단계 응답 예시

```markdown
현재 단계: 썸네일/제목/도입부 승인

현재 상황:
제목 디벨롭 8단계를 모두 거쳤고, 최종 후보 4개가 남았습니다.

핵심 판단:
가장 강한 후보는 “인스타로 매출 올리려면 이렇게 릴스 만들지 마세요”입니다.

근거:
대표가 원하는 결과인 “매출”이 선명하고, “이렇게 릴스 만들지 마세요”가 문제 지적과 호기심을 동시에 만듭니다.

선택지:
1. 승인
2. 수정 요청
3. 다른 후보 보기
4. 보류

추천안:
1번 승인 추천

승인 필요 여부:
필요합니다. 외부 노출 제목이므로 Founder 승인 후 Production으로 넘겨야 합니다.

다음 액션:
승인하시면 이 제목을 기준으로 도입부 30초와 원고 구조를 작성하겠습니다.
```

---

## 19. 데이터 모델

### 19.1 신규 타입 제안

```ts
export type ViewtrapGrade = 'Good' | 'Great';

export type TitleReferenceSimilarity =
  | 'exact'
  | 'expanded_same_meaning';

export interface TitleDevelopmentReference {
  id: string;
  research_session_id: string;
  source: 'viewtrap' | 'youtube' | 'manual';
  url?: string;

  title: string;
  thumbnail_text: string;
  thumbnail_structure: string;
  topic: string;

  view_count: number;
  performance_grade: ViewtrapGrade;
  contribution_grade: ViewtrapGrade;

  topic_similarity: TitleReferenceSimilarity;
  similarity_reason: string;
  selected_reason: string;
}
```

### 19.2 교차 조합 타입

```ts
export type CombinationType =
  | 'ref1_thumbnail_ref2_title'
  | 'ref1_title_ref2_thumbnail'
  | 'ref1_thumbnail_text_as_title_ref2_thumbnail'
  | 'ref2_thumbnail_text_as_title_ref1_thumbnail';

export interface TitleThumbnailCombination {
  id: string;
  combination_type: CombinationType;

  title_source_ref_id: string;
  thumbnail_source_ref_id: string;

  title_draft: string;
  thumbnail_text_draft: string;
  thumbnail_direction: string;

  awkwardness_score: number;
  awkwardness_reason?: string;

  passed: boolean;
  selected_for_next_step: boolean;
}
```

### 19.3 단계별 결과 타입

```ts
export type TitleDevelopmentStepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface TitleDevelopmentStepResult {
  step_number: TitleDevelopmentStepNumber;
  step_name: string;

  input_titles: string[];
  output_titles: string[];

  method_explanation: string;
  cmo_reasoning: string;

  rejected_titles: {
    title: string;
    reason: string;
  }[];

  selected_titles_for_next_step: string[];
}
```

### 19.4 최종 평가 타입

```ts
export interface FinalTitleEvaluation {
  title: string;
  thumbnail_direction: string;

  target_fit: number;
  desire_clarity: number;
  problem_sharpness: number;
  curiosity_gap: number;
  script_match: number;
  thumbnail_fit: number;

  total_score: number;

  recommendation:
    | 'upload_candidate'
    | 'revise'
    | 'rerun_reference_search';

  reason: string;
  risks: string[];
  required_script_additions?: string[];
}
```

### 19.5 전체 실행 타입

```ts
export interface TitleDevelopmentWorkflowRun {
  id: string;
  video_project_id: string;
  pulling_content_id: string;

  pulling_topic: string;
  target_audience: string;
  business_goal?: string;

  exact_search_terms: string[];
  expanded_search_terms: string[];
  forbidden_search_terms: string[];

  references: [TitleDevelopmentReference, TitleDevelopmentReference];

  combinations: TitleThumbnailCombination[];

  step_results: TitleDevelopmentStepResult[];

  final_candidates: FinalTitleEvaluation[];

  selected_title: string;
  selected_thumbnail_direction: string;

  approval_status: 'draft' | 'approved' | 'needs_revision';

  second_brain_summary?: string;

  created_at: string;
  updated_at: string;
}
```

---

## 20. 상태머신 접목 설계

### 20.1 MVP: 기존 단계 내부 확장

MVP에서는 새 상태를 추가하지 않고 `thumbnail_pattern_extraction` 단계 안에서 제목 디벨롭을 수행한다.

이유:

1. 현재 상태머신 변경 부담이 낮다.
2. 기존 hook approval 단계와 자연스럽게 연결된다.
3. `ThumbnailPattern`과 직접 연결된다.
4. 기존 UI에 카드 형태로 추가하기 쉽다.

### proposal 구조

```ts
const proposal = {
  stage: 'thumbnail_pattern_extraction',
  summary: '풀링 콘텐츠 제목 디벨롭 8단계 결과',
  data: {
    title_development_workflow: workflowRun
  }
};
```

### 20.2 v2: 별도 상태 추가

향후에는 `VideoRoomStatus`에 다음 상태를 추가할 수 있다.

```ts
| 'pulling_title_development'
```

추가 위치:

```text
pulling_content_set_approval
→ pulling_title_development
→ thumbnail_pattern_extraction
→ intro_30s_analysis
```

### 20.3 STAGE_SCRIPT 추가안

```ts
pulling_title_development: {
  label: '풀링 제목 디벨롭',
  focus: '확정된 풀링 콘텐츠 각각에 대해 Viewtrap 검증 레퍼런스 2개를 기반으로 제목·썸네일 교차 조합 후 8단계 제목 디벨롭을 수행한다.',
  prompt: '확정된 풀링 콘텐츠의 제목을 디벨롭하겠습니다. 각 풀링 주제와 같은 주제의 Viewtrap 레퍼런스 2개를 찾아 주세요. 두 레퍼런스는 조회수 5만 이상, 성과도/기여도 Good 또는 Great 조건을 만족해야 합니다.'
}
```

### 20.4 승인 게이트

최종 제목과 썸네일 방향은 `hook_draft_approval` 게이트에서 승인받는다.

게이트 옵션:

```ts
[
  '승인',
  '수정 요청',
  '다른 제목 후보 보기',
  '레퍼런스 다시 찾기',
  '보류'
]
```

---

## 21. API / Function 설계

### 21.1 generateTitleSearchTerms

#### 목적

풀링 주제를 Viewtrap 검색어로 변환한다.

#### Input

```ts
{
  pulling_topic: string;
  target_audience: string;
  business_goal?: string;
}
```

#### Output

```ts
{
  exact_search_terms: string[];
  expanded_search_terms: string[];
  forbidden_search_terms: string[];
  reasoning: string;
}
```

---

### 21.2 validateTitleReferences

#### 목적

Founder가 입력한 레퍼런스 2개가 조건을 만족하는지 검증한다.

#### Output

```ts
{
  passed: boolean;
  passed_references: TitleDevelopmentReference[];
  failed_references: {
    reference_id: string;
    reasons: string[];
  }[];
  next_action: 'continue' | 'request_more_references';
}
```

#### 검증 로직

```ts
function validateReference(ref: TitleDevelopmentReference): string[] {
  const reasons: string[] = [];

  if (ref.view_count < 50000) reasons.push('조회수 5만 미만');
  if (!['Good', 'Great'].includes(ref.performance_grade)) reasons.push('성과도 Good/Great 미충족');
  if (!['Good', 'Great'].includes(ref.contribution_grade)) reasons.push('기여도 Good/Great 미충족');
  if (!['exact', 'expanded_same_meaning'].includes(ref.topic_similarity)) reasons.push('주제 유사도 미충족');
  if (!ref.title.trim()) reasons.push('제목 없음');
  if (!ref.thumbnail_text.trim()) reasons.push('썸네일 문구 없음');

  return reasons;
}
```

---

### 21.3 generateCrossCombinations

#### 목적

레퍼런스 1과 2를 기반으로 제목·썸네일 교차 조합 후보를 만든다.

#### 필수 생성 조합

1. Ref1 썸네일 + Ref2 제목
2. Ref1 제목 + Ref2 썸네일
3. Ref1 썸네일 문구 제목화 + Ref2 썸네일 구조
4. Ref2 썸네일 문구 제목화 + Ref1 썸네일 구조

---

### 21.4 judgeCombinationAwkwardness

#### 목적

제목·썸네일 조합의 어색함을 판단한다.

#### 판단 기준

| 항목 | 감점 조건 |
|---|---|
| 제목-썸네일 중복 | 같은 말을 반복함 |
| 주제 불일치 | 주제 범위가 달라짐 |
| 타겟 불일치 | 대표가 볼 문장이 아님 |
| 원고 불일치 | 영상 내용과 제목 약속이 다름 |
| 클릭 이유 부족 | 왜 봐야 하는지 부족함 |

---

### 21.5 runTitleDevelopmentSteps

선택된 조합 후보를 2~8단계로 디벨롭한다.

---

### 21.6 evaluateFinalTitles

최종 제목 후보를 평가해 베스트 제목을 선택한다.

---

### 21.7 buildSecondBrainSummary

이번 제목 디벨롭 결과를 세컨 브레인에 저장 가능한 형태로 요약한다.

---

## 22. UI 요구사항

### 22.1 화면 위치

CMO Video Room의 Strategy 페이지 또는 Hook Draft 단계에 다음 카드가 추가된다.

```text
Title Development Card
```

### 22.2 화면 구성

#### A. 풀링 콘텐츠 선택 영역

- 풀링 콘텐츠 제목
- 역할
  - 문제 인식
  - 문제 심화
  - 욕구 형성
  - 계획 진입
  - 키 콘텐츠 브릿지
- 소비자 여정 단계
- 키 콘텐츠로 이어지는 브릿지

#### B. Viewtrap 레퍼런스 입력 영역

레퍼런스 1과 2를 카드로 입력한다.

각 카드 필드:

- 제목
- URL
- 조회수
- 성과도
- 기여도
- 썸네일 문구
- 썸네일 구조
- 주제 유사도
- 선택 이유

#### C. 검증 결과 영역

- 조건 통과 여부
- 실패 이유
- 추가 레퍼런스 요청 버튼
- 확장 검색 허용 여부 표시

#### D. 교차 조합 보드

4개 조합을 보여준다.

1. Ref1 썸네일 + Ref2 제목
2. Ref1 제목 + Ref2 썸네일
3. Ref1 썸네일 문구 제목화 + Ref2 썸네일 구조
4. Ref2 썸네일 문구 제목화 + Ref1 썸네일 구조

각 조합마다:

- 제목 후보
- 썸네일 후보
- 어색함 점수
- 어색함 이유
- 다음 단계로 넘기기 체크

#### E. 8단계 디벨롭 타임라인

각 단계별로 다음을 보여준다.

- 단계명
- 입력 제목
- 출력 제목 후보
- 변경 이유
- 버린 후보
- 다음 단계 선택 후보

#### F. 최종 평가 패널

- 후보 제목 4개
- 점수표
- 최종 추천 제목
- 썸네일 방향
- 승인 버튼
- 수정 요청 버튼
- 레퍼런스 다시 찾기 버튼

---

## 23. 출력 포맷

### 23.1 CMO Proposal Data

```json
{
  "title_development_workflow": {
    "pulling_topic": "인스타그램 릴스 자동화 기초 작업",
    "target_audience": "작은 브랜드 대표",
    "business_goal": "릴스 자동화 컨설팅 문의",
    "references": [
      {
        "title": "",
        "thumbnail_text": "",
        "view_count": 50000,
        "performance_grade": "Great",
        "contribution_grade": "Good",
        "topic_similarity": "exact"
      },
      {
        "title": "",
        "thumbnail_text": "",
        "view_count": 80000,
        "performance_grade": "Good",
        "contribution_grade": "Great",
        "topic_similarity": "expanded_same_meaning"
      }
    ],
    "selected_title": "인스타로 매출 올리려면 이렇게 릴스 만들지 마세요",
    "selected_thumbnail_direction": "대표가 흔히 만드는 릴스 실수를 시각적으로 지적하는 썸네일",
    "score": 88,
    "approval_status": "draft"
  }
}
```

### 23.2 Founder-facing Summary

```markdown
## 최종 추천 제목

인스타로 매출 올리려면 이렇게 릴스 만들지 마세요

## 썸네일 방향

대표가 흔히 만드는 릴스 실수를 시각적으로 보여주고, “이렇게 만들지 마세요”를 강조합니다.

## 왜 이 제목인가?

- 타겟이 원하는 결과인 “매출”이 선명합니다.
- “이렇게 릴스 만들지 마세요”가 문제 지적과 호기심을 동시에 만듭니다.
- 영상에서 실제 릴스 제작 자동화 과정을 보여줄 수 있어 원고와 맞습니다.
- 제목과 썸네일이 같은 말을 반복하지 않고 역할을 나눌 수 있습니다.

## 대체 후보

1. 대표님들이 릴스 만들 때 가장 많이 하는 실수
2. 조회수는 나오는데 문의가 안 오는 릴스의 공통점
3. 작은 브랜드가 릴스 만들 때 시간 낭비하는 이유
```

---

## 24. 수용 기준

| ID | 수용 기준 | 필수 |
|---|---|---|
| AC-01 | 레퍼런스가 2개 미만이면 1단계를 진행하지 않는다. | MUST |
| AC-02 | 각 레퍼런스는 조회수 5만 이상이어야 한다. | MUST |
| AC-03 | 각 레퍼런스는 성과도 Good 또는 Great이어야 한다. | MUST |
| AC-04 | 각 레퍼런스는 기여도 Good 또는 Great이어야 한다. | MUST |
| AC-05 | 정확히 같은 주제를 못 찾은 경우에만 확장 주제를 허용한다. | MUST |
| AC-06 | 확장 주제를 사용한 경우 유사도 이유를 반드시 기록한다. | MUST |
| AC-07 | 1단계에서 4개 교차 조합 후보를 생성한다. | MUST |
| AC-08 | 어색한 조합은 어색함 이유를 기록하고 탈락 또는 수정 처리한다. | MUST |
| AC-09 | 2~8단계를 모두 실행한다. | MUST |
| AC-10 | 각 단계별 입력/출력/변경 이유/탈락 이유를 저장한다. | MUST |
| AC-11 | 최종 제목은 100점 기준 평가표를 통과해야 한다. | MUST |
| AC-12 | 69점 이하이면 레퍼런스 검색부터 다시 실행한다. | MUST |
| AC-13 | 최종 제목은 Founder 승인 전까지 외부 게시되지 않는다. | MUST |
| AC-14 | 최종 결과는 `proposal.data`에 저장 가능해야 한다. | MUST |
| AC-15 | 세컨 브레인 저장용 요약을 생성한다. | SHOULD |

---

## 25. 테스트 시나리오

### 25.1 정상 케이스

#### Given

- 풀링 주제: 릴스 자동화
- 레퍼런스 1: 조회수 8만, 성과도 Great, 기여도 Good
- 레퍼런스 2: 조회수 12만, 성과도 Good, 기여도 Great
- 둘 다 주제 유사도 exact 또는 expanded_same_meaning

#### When

CMO가 제목 디벨롭 워크플로우를 실행한다.

#### Then

- 1단계 조합 후보 4개가 생성된다.
- 2~8단계 결과가 저장된다.
- 최종 후보 4개가 생성된다.
- 최종 제목 1개가 선택된다.
- 승인 게이트가 생성된다.

### 25.2 레퍼런스 부족 케이스

#### Given

레퍼런스가 1개만 입력됐다.

#### Then

CMO는 다음 단계로 넘어가지 않고 추가 레퍼런스를 요청한다.

### 25.3 성과 조건 미달 케이스

#### Given

레퍼런스 1의 조회수가 3만이다.

#### Then

해당 레퍼런스는 탈락한다.

CMO는 다음 메시지를 보여준다.

```text
이 레퍼런스는 조회수 5만 미만이라 제목 디벨롭 재료로 쓰기 어렵습니다.
같은 주제 또는 같은 의미 범위 안에서 조회수 5만 이상, 성과도/기여도 Good 이상인 콘텐츠를 하나 더 찾아주세요.
```

### 25.4 확장 주제 허용 케이스

#### Given

릴스 자동화 검색 결과가 부족하다.

#### When

Founder가 쇼츠 자동화 레퍼런스를 입력한다.

#### Then

CMO는 다음을 확인한다.

1. 같은 숏폼 제작 자동화 범위인가?
2. 영상 자동화라는 의미가 유지되는가?
3. 풀링 콘텐츠 원고에 적용 가능한가?

통과하면 `topic_similarity = expanded_same_meaning`으로 저장한다.

### 25.5 최종 점수 미달 케이스

#### Given

최종 제목 점수가 65점이다.

#### Then

CMO는 최종 제목을 추천하지 않고 레퍼런스 재검색을 요청한다.

---

## 26. 개발 태스크 분해

### P0

1. `TitleDevelopmentReference` 타입 추가
2. `TitleThumbnailCombination` 타입 추가
3. `TitleDevelopmentStepResult` 타입 추가
4. `FinalTitleEvaluation` 타입 추가
5. `TitleDevelopmentWorkflowRun` 타입 추가
6. 레퍼런스 검증 함수 구현
7. 1단계 교차 조합 함수 구현
8. 8단계 디벨롭 실행 프롬프트 구현
9. 최종 점수 평가 함수 구현
10. CMO `proposal.data`에 결과 저장

### P1

1. CMO UI에 Title Development Card 추가
2. 레퍼런스 입력 카드 구현
3. 교차 조합 보드 구현
4. 8단계 타임라인 UI 구현
5. 최종 평가 패널 구현
6. `hook_draft_approval` 게이트와 연결

### P2

1. 세컨 브레인 저장 기능 연결
2. 성과 추적 후 제목 구조 재학습
3. Viewtrap 자동화 연동
4. 썸네일 이미지 분석 자동화
5. A/B 테스트 결과 저장

---

## 27. 구현 위치 제안

### 27.1 타입

```text
packages/l5-core/src/functions/cmo-strategy/title-development-types.ts
```

이유:

- 기존 video-room 타입 파일이 이미 크다.
- 제목 디벨롭은 CMO 전략 기능에 가깝다.
- 향후 독립 테스트가 쉽다.

### 27.2 로직

```text
packages/l5-core/src/functions/cmo-strategy/title-development.ts
```

포함 함수:

- `generateTitleSearchTerms`
- `validateTitleReferences`
- `generateCrossCombinations`
- `judgeCombinationAwkwardness`
- `runTitleDevelopmentSteps`
- `evaluateFinalTitles`
- `buildSecondBrainSummary`

### 27.3 Stage Script 수정

```text
packages/l5-core/src/functions/cmo-strategy/stage-script.ts
```

MVP에서는 `thumbnail_pattern_extraction`의 focus/prompt를 확장한다.

수정안:

```ts
focus: '확정된 풀링 5개+키 콘텐츠 각각에 대해 Viewtrap 검증 레퍼런스 2개를 기반으로 제목을 8단계 디벨롭하고, 이후 썸네일 문구·감정 훅·구도 구조를 우리 주제에 맞게 치환한다.'
```

### 27.4 UI

```text
apps/founder-ui/src/app/cmo/page.tsx
```

또는 컴포넌트 분리:

```text
apps/founder-ui/src/components/cmo/TitleDevelopmentCard.tsx
apps/founder-ui/src/components/cmo/ViewtrapReferenceCard.tsx
apps/founder-ui/src/components/cmo/TitleCombinationBoard.tsx
apps/founder-ui/src/components/cmo/TitleEvaluationPanel.tsx
```

---

## 28. LLM 프롬프트 요구사항

### 28.1 시스템 규칙 추가

```text
제목 디벨롭 규칙:
- 풀링 콘텐츠 제목을 만들 때는 반드시 Viewtrap 검증 레퍼런스 2개를 기반으로 한다.
- 두 레퍼런스는 조회수 5만 이상, 성과도 Good/Great, 기여도 Good/Great이어야 한다.
- 같은 주제를 우선 찾고, 없으면 같은 의미 범위 안에서만 확장한다.
- 1단계에서는 Ref1 썸네일 + Ref2 제목, Ref1 제목 + Ref2 썸네일, 썸네일 문구 제목화 조합을 모두 만든다.
- 이후 2~8단계를 모두 거친다.
- 최종 제목은 타겟 적합도, 욕망 선명도, 문제 지적, 호기심, 원고 일치도, 썸네일 결합도로 점수화한다.
- Founder 승인 전에는 외부 게시하지 않는다.
```

### 28.2 JSON 출력 규칙

```json
{
  "title_development_workflow": {
    "references": [],
    "combinations": [],
    "step_results": [],
    "final_candidates": [],
    "selected_title": "",
    "selected_thumbnail_direction": "",
    "approval_status": "draft"
  }
}
```

---

## 29. 예시 실행: 릴스 자동화 콘텐츠

### 29.1 입력

```text
풀링 주제:
인스타그램 릴스 자동화 기초 작업을 보여주는 영상

타겟:
작은 브랜드 대표, 1인 사업자

목표:
릴스 자동화 컨설팅 또는 CMO 툴에 대한 관심 유도
```

### 29.2 검색어

```text
정확 검색:
- 릴스 자동화
- 인스타 릴스 자동화
- 릴스 제작 자동화

확장 검색:
- 쇼츠 자동화
- 영상 자동화
- 숏폼 자동화
- 콘텐츠 자동화
```

### 29.3 1단계 조합 예시

```text
Ref1 썸네일:
"이렇게 만들지 마세요"

Ref2 제목:
"쇼츠 자동화로 콘텐츠 만드는 시간을 줄이는 법"

조합 A:
제목: 인스타로 매출 올리려면 이렇게 릴스 만들지 마세요
썸네일: 이렇게 만들지 마세요
```

### 29.4 2~8단계 변화 예시

| 단계 | 제목 변화 |
|---|---|
| 원본 | 인스타그램 릴스 자동화 하는 법 |
| 1단계 | 쇼츠 자동화 제목 구조 + 릴스 썸네일 경고 구조 |
| 2단계 | 대표가 혼자 릴스 만드는 시간을 줄이는 법 |
| 3단계 | 작은 브랜드가 인스타 콘텐츠 만드는 시간을 줄이는 법 |
| 4단계 | 작은 브랜드가 인스타 콘텐츠 만들 때 시간 낭비하는 이유 |
| 5단계 | 작은 브랜드가 매번 인스타 콘텐츠 만들 때 가장 많이 하는 시간 낭비 |
| 6단계 | 왜 작은 브랜드는 인스타를 열심히 해도 시간이 계속 부족할까? |
| 7단계 | 인스타로 매출 올리려면 이렇게 릴스 만들지 마세요 |
| 8단계 | 대표님들이 릴스 만들 때 가장 많이 하는 치명적인 실수 |

### 29.5 최종 추천

```text
최종 제목:
인스타로 매출 올리려면 이렇게 릴스 만들지 마세요

썸네일 방향:
대표가 자주 하는 릴스 제작 실수를 한 장면으로 보여주고, “이렇게 만들지 마세요”를 강하게 배치한다.

대체 후보:
1. 대표님들이 릴스 만들 때 가장 많이 하는 실수
2. 조회수는 나오는데 문의가 안 오는 릴스의 공통점
3. 작은 브랜드가 릴스 만들 때 시간 낭비하는 이유
```

---

## 30. 리스크와 대응

| 리스크 | 설명 | 대응 |
|---|---|---|
| 표절 위험 | 레퍼런스 제목/썸네일을 그대로 가져올 수 있음 | 교차 조합 후 2~8단계 디벨롭 필수 |
| 레퍼런스 부족 | 같은 주제 레퍼런스가 부족할 수 있음 | 같은 의미 범위 확장 허용 |
| 과장 제목 | 강한 단어 사용으로 원고와 불일치 | 원고 일치도 15점 평가 |
| 타겟 불일치 | 대표가 볼 제목이 아니라 마케터용 제목이 될 수 있음 | 타겟 적합도 20점 평가 |
| Viewtrap 수동 입력 오류 | 조회수/성과도/기여도 오기입 가능 | UI에서 필수 입력과 검증 메시지 제공 |
| 워크플로우 과도한 복잡성 | Founder가 입력 부담을 느낄 수 있음 | CMO가 단계별로 한 번에 하나씩 요청 |

---

## 31. 오픈 질문

1. Viewtrap의 성과도/기여도 값을 문자열로 저장할지, 수치로 환산할지?
2. 조회수 5만 기준을 모든 카테고리에 동일 적용할지?
3. 풀링 콘텐츠 5개 각각에 제목 디벨롭을 모두 적용할지, 우선 1개씩 순차 적용할지?
4. 확장 주제 허용 범위를 누가 최종 판단할지? CMO 자동 판단 vs Founder 승인
5. 최종 제목 점수 산정은 LLM 평가로 할지, 규칙 기반 가중치로 할지?
6. 세컨 브레인 저장은 자동 저장할지, Founder 승인 후 저장할지?

---

## 32. 최종 정리

이 PRD의 핵심은 단순한 제목 생성 기능이 아니다.

핵심은 다음이다.

```text
Viewtrap 검증 레퍼런스 2개
→ 제목/썸네일 교차 조합
→ 8단계 제목 디벨롭
→ 최종 평가 게이트
→ Founder 승인
→ 원고/도입부/썸네일 제작
→ 성과 추적
→ 세컨 브레인 재학습
```

이 구조를 CMO 워크플로우에 넣으면, Founder는 제목을 감으로 정하는 것이 아니라 검증된 시장 반응과 강의 기반 방법론을 결합해 콘텐츠를 만들 수 있다.

결과적으로 Pulk의 CMO는 단순 카피 생성기가 아니라, 콘텐츠의 클릭률과 판매 연결을 설계하는 마케팅 의사결정 시스템이 된다.
