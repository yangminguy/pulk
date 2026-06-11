# PRD: CMO 썸네일 9개 A/B 자동화

- 문서 버전: v1.0
- 작성일: 2026-06-11
- 대상 제품: Pulk / CMO Video Room / AI CMO
- 대상 기능: 썸네일 9개 기획·심리분석·이미지 소스 수집·순차 A/B 테스트·성과 디벨롭
- 우선순위: P0
- 상태: Draft

---

## 0. 한 줄 정의

CMO가 확정된 영상 주제·제목을 받으면, **클릭 가설이 서로 다른 9개 썸네일 기획안**을 자동 생성하고, 외부 이미지를 수집·위험도 분류한 뒤, YouTube Data API 기반 **순차 A/B 테스트**로 승자를 판별하며, 기존 R7 성과 루프에 결과를 접목해 다음 썸네일을 계속 진화시키는 워크플로우 모듈이다.

---

## 1. 배경

### 1.1 현재 CMO Video Room 워크플로우와의 연결

Video Room 상태머신(`VideoRoomStatus`)은 다음 흐름을 갖는다:

```
pulling_content_set_approval
→ thumbnail_pattern_extraction   ← 이 단계가 대상
→ intro_30s_analysis
→ hook_draft_approval
```

현재 `thumbnail_pattern_extraction` 단계에서는 `buildThumbnailPlan`이 레퍼런스 패턴(`ThumbnailPattern`)을 기반으로 최소 3개 썸네일 후보를 생성하고, `proposeThumbnailDraft`가 LLM/결정론 폴백으로 카피·시각방향을 만든다. 그러나 현재 구조에는 다음이 없다:

1. **클릭 가설 기반 9개 매트릭스**(이미지전략×문구전략) — 현재는 훅 타입 회전(loss/gain/curiosity…)으로 3개 후보만 생성
2. **이미지 소스 수집·출처·위험도 관리** — 이미지 자체는 범위 밖이었음
3. **Post-publish A/B 테스트** — 업로드 후 썸네일 교체·비교 자동화 없음
4. **승자 판단 점수식** — CTR 단독이 아닌 watch_time/avg_view_duration 포함 복합 점수

### 1.2 기존 재사용 대상

| 기존 모듈 | 파일 | 재사용 방식 |
|---|---|---|
| `buildThumbnailPlan` | `thumbnail-plan.ts` | 9개 후보 생성의 기반 확장 |
| `ThumbnailCandidate` | `thumbnail-plan.ts` | 후보 타입 확장(가설·심리분석 필드 추가) |
| `proposeThumbnailDraft` | `content-production.ts` | LLM 초안 생성 재사용 |
| `ThumbnailPattern` | `types.ts` | 레퍼런스 패턴 입력 |
| `recordVideoPerformance` | `performance-ingestion.ts` | A/B 기간별 성과 기록 |
| `extractCompletionInsight` | `completion-insight-extraction.ts` | 승자/패자 인사이트 추출 |
| `mapAnalyticsToPerformanceInput` | `performance-auto-mapping.ts` | YouTube Analytics 자동 매핑 |
| Viewtrap 레퍼런스 | `reference-adapters.ts` | 성과 썸네일 구조 학습 |

---

## 2. 계획 단계 — 워크플로우 통합 설계

### 2.1 전체 흐름 (기존 워크플로우 내 위치)

```
[기존] pulling_content_set_approval
  ↓
[기존] thumbnail_pattern_extraction  ← 내부 확장 (새 상태 추가 없음)
  │
  ├─ Stage A. 9개 썸네일 매트릭스 생성          ← 신규
  │    └─ 클릭 가설 × 이미지전략 × 문구전략
  ├─ Stage B. 클릭 이유 심리분석 3단계          ← 신규
  │    └─ 문구구조 → 이미지연상 → 결합심리
  ├─ Stage C. 이미지 소스 수집                  ← 신규
  │    └─ 외부 자동 수집 + 출처·위험도 기록
  ├─ ★ Founder 승인: 9개 기획안 세트 + 이미지 후보
  │
  ├─ Stage D. 썸네일 제작 (기존 buildThumbnailPlan 확장)
  ├─ Stage E. 검수 (모바일 가독성 + 데드존)
  │
  ↓
[기존] intro_30s_analysis → hook_draft_approval
  ↓
[기존] ... → upload_approval → completed
  ↓
[Post-publish] Stage F. Track B 순차 A/B 테스트  ← 신규
  │    └─ thumbnails.set 교체 + Analytics 수집
  ├─ ★ Founder 승인: A/B 시작
  ├─ Stage G. 승자 판단 + 점수식              ← 신규 (R7 접목)
  ├─ ★ Founder 승인: 승자 적용
  └─ Stage H. 패배 원인별 디벨롭 → 다음 라운드
```

### 2.2 신규 vs 재사용 요약

| 구분 | 내용 | 신규/재사용 |
|---|---|---|
| 9개 매트릭스 생성 | 3×3 이미지전략×문구전략 조합 | **신규** (`buildThumbnailMatrix9`) |
| 심리분석 3단계 | 문구구조/이미지연상/결합심리 | **신규** (`analyzeThumbnailPsychology`) |
| 이미지 소스 수집 | 외부 이미지 검색·다운로드·출처 기록 | **신규** (`collectImageSources`) |
| 썸네일 후보 생성 | 9개 기획안 → 제작 가능 후보 | **재사용** `buildThumbnailPlan` 확장 |
| A/B 썸네일 교체 | `thumbnails.set` 호출 | **신규** (`swapThumbnail`, D3 위험도) |
| 기간별 성과 수집 | Analytics/Reporting API | **재사용** `mapAnalyticsToPerformanceInput` 확장 |
| 승자 판단 점수식 | CTR+watch_time+avg_duration 복합 | **신규** (`scoreAbTestResults`) |
| 인사이트 추출 | 패배 원인 → 다음 기획 | **재사용** `extractCompletionInsight` 확장 |

### 2.3 Founder 승인 지점 (4개)

| 게이트 | 시점 | 승인 대상 |
|---|---|---|
| **G1** | Stage A~C 완료 후 | 9개 기획안 세트 + 이미지 후보 |
| **G2** | 업로드 완료 후 | A/B 테스트 시작 (3개 선택) |
| **G3** | 라운드 종료 후 | 승자 썸네일 적용 |
| **G4** | 디벨롭 완료 후 | 다음 라운드 3개 시작 (선택) |

나머지는 AI 자동 초안 → 사장님은 승인/수정만.

---

## 3. 9개 썸네일 매트릭스 생성 로직

### 3.1 매트릭스 구조: 이미지전략(3) × 문구전략(3) = 9개

| # | 이미지 전략 | 문구 전략 | 클릭 가설 |
|--:|---|---|---|
| 1 | 확대 이미지 | 이득 문구 | 주인공이 명확하면 클릭한다 |
| 2 | 확대 이미지 | 손해 회피 문구 | 위험을 느끼면 클릭한다 |
| 3 | 확대 이미지 | 궁금증 문구 | 뭔지 궁금하면 클릭한다 |
| 4 | 증거 이미지 | 이득 문구 | 결과가 보이면 클릭한다 |
| 5 | 증거 이미지 | 손해 회피 문구 | 손실의 증거가 보이면 클릭한다 |
| 6 | 증거 이미지 | 궁금증 문구 | 증거 일부만 보이면 확인하려고 클릭한다 |
| 7 | 공감 이미지 | 이득 문구 | 내 상황의 해결책처럼 보이면 클릭한다 |
| 8 | 공감 이미지 | 손해 회피 문구 | 내 문제를 건드리면 클릭한다 |
| 9 | 공감 이미지 | 궁금증 문구 | 내 상황인데 답이 숨겨져 있으면 클릭한다 |

### 3.2 입력

```ts
{
  video_id: string;            // 대상 영상
  title: string;               // 확정된 영상 제목
  main_click_reason: string;   // "왜 이 영상을 클릭해야 하는가?"
  target_audience: string;
  target_problem: string;
  target_desire: string;
  target_loss_to_avoid: string;
  reference_patterns: ThumbnailPattern[];  // 기존 레퍼런스
}
```

### 3.3 출력

9개 `ThumbnailMatrixCandidate` — 각각 이미지전략/문구전략/클릭가설/썸네일문구/이미지구성/디자인노트 포함.

### 3.4 생성 규칙

1. 9개는 반드시 서로 다른 클릭 가설을 가져야 한다.
2. 모든 후보에서 제목·문구·이미지는 같은 클릭 이유를 강화해야 한다.
3. 제목과 썸네일 문구가 같은 말을 반복하면 안 된다.
4. 레퍼런스 패턴(`ThumbnailPattern`)이 있으면 구조를 참고하되 직접 복사 금지.

---

## 4. 클릭 이유 심리분석 3단계

9개 후보 각각에 대해 3단계 분석을 수행한다.

### 4.1 1단계: 문구 구조 분석

| 문구 구조 | 자극 심리 | 예시 |
|---|---|---|
| 이득 제시 | 얻고 싶은 미래 | "3시간 일을 10분으로" |
| 손해 회피 | 잃고 싶지 않은 두려움 | "이러면 광고비 샙니다" |
| 비밀/은닉 | 알고 싶은 욕구 | "여기 하나만 바꿨습니다" |
| 반전 | 기존 믿음의 붕괴 | "열심히 할수록 망합니다" |
| 증거 | 믿을 수 있는 결과 | "직접 돌려봤습니다" |
| 비교 | 선택을 쉽게 만드는 차이 | "수작업 vs 자동화" |
| 금지/경고 | 실수 방지 욕구 | "이건 절대 하지 마세요" |
| 숫자 | 구체성·신뢰 | "7일 만에 3배" |

분석 질문: 어떤 욕구를 자극하는가? 어떤 손해를 피하게 만드는가? 어떤 궁금증을 남기는가? 제목과 같은 이유를 말하는가?

### 4.2 2단계: 이미지 연상 분석

| 이미지 유형 | 연상 작용 | 클릭 이유 |
|---|---|---|
| 얼굴 클로즈업 | 감정, 놀람 | 감정 전염 |
| 제품/도구 | 실전성 | 나도 써보고 싶음 |
| 결과 화면 | 증거, 신뢰 | 진짜 되는지 확인 |
| 전후 비교 | 변화, 개선 | 결과의 크기 확인 |
| 실패 장면 | 문제, 손실 | 나도 피하고 싶음 |
| 자동화 플로우 | 질서, 해결 | 자동화 가능성 기대 |

분석 질문: 무엇을 연상시키는가? 타깃이 자기 상황을 떠올리는가? 제목의 약속을 증명하는가?

### 4.3 3단계: 결합 심리 분석

| 결합 구조 | 최종 심리 | 예시 |
|---|---|---|
| 이득 문구 + 결과 이미지 | "나도 저 결과를 얻고 싶다" | 자동화 성과 화면 + "3시간 → 10분" |
| 손해 문구 + 실패 이미지 | "나도 저 실수를 피해야 한다" | 광고비 낭비 화면 + "이래서 돈이 샙니다" |
| 궁금증 문구 + 가려진 이미지 | "정답을 확인하고 싶다" | 가려진 플로우 + "여기 하나만 바꿨습니다" |
| 공감 문구 + 현실 이미지 | "이거 내 얘기다" | 지친 작업자 + "아직도 직접 하나요?" |
| 반전 문구 + 의외 이미지 | "내가 알던 것과 다르다" | 실패한 고퀄 디자인 + "예쁘면 망합니다" |
| 증거 문구 + 실전 화면 | "진짜 해본 것 같다" | 실제 대시보드 + "직접 돌려봤습니다" |

최종 질문: 문구+이미지가 합쳐졌을 때 생기는 감정은? 클릭 이유가 제목·문구·이미지에서 모두 같은 방향인가?

---

## 5. 이미지 소스 수집 + 위험도·출처

### 5.1 수집 대상 (외부 자동, "내 영상 캡처" 제외)

사장님 지시: **직접 캡처한 내 영상 장면은 소스에서 제외**. 외부 의존 허용, 출처 정확 수집이 핵심.

| 우선순위 | 소스 | 위험도 기본값 |
|--:|---|---|
| 1 | 직접 촬영한 사진 | Low |
| 2 | 무료 이미지 사이트 (Unsplash, Pexels 등) | Medium |
| 3 | CC 라이선스 이미지 | Medium |
| 4 | 구글 이미지 검색 | High |
| 5 | 뉴스/블로그/웹페이지 이미지 | High |

### 5.2 위험도 분류

| 위험도 | 기준 | 자동화 처리 |
|---|---|---|
| **Low** | 직접 촬영, 명확한 무료/상업 가능 | 사용 우선 |
| **Medium** | 무료 사이트, CC 이미지 (조건 확인 필요) | 조건 확인 후 사용 |
| **High** | 구글/뉴스/블로그, 권리 관계 불명확 | 출처 표기 필수 + 대체 후보 보관 |
| **Critical** | 민감 이미지, 사생활 침해, 미성년자 | **사용 금지** |

### 5.3 이미지별 저장 필드

```yaml
image_id: string
source_type: self_photo | free_stock | cc_license | google_image | news_blog
source_url: string
source_page_title: string
creator_or_owner: string
license: string
commercial_use_allowed: boolean
modification_allowed: boolean
attribution_required: boolean
download_date: date
risk_level: Low | Medium | High | Critical
attribution_text: string        # 영상 설명란 출처 표기용
usage_note: string
```

### 5.4 출처 표기 (영상 설명란 자동 삽입)

```
[이미지 출처]
- Image 1: {creator_or_owner} / {source_url} / {license_or_source_note}
본 영상의 썸네일 및 자료 이미지는 출처를 확인하여 사용했으며,
문제가 있을 경우 확인 후 즉시 수정하겠습니다.
```

### 5.5 외부 액션 위험도

| 액션 | 위험도 | 승인 |
|---|---|---|
| 이미지 검색 (API/크롤) | D2 | 자동 |
| 이미지 다운로드·저장 | D2 | 자동 |
| Critical 이미지 사용 시도 | D4 | **차단** (사용 금지) |
| High 이미지 최종 사용 | D3 | Founder 승인 |

---

## 6. Track B 순차 A/B 설계 + 점수식 + confidence_level

### 6.1 설계 결정

**Track B(순차 테스트) = MVP 정본** — YouTube Data API `thumbnails.set`으로 N일마다 썸네일 교체 + Analytics/Reporting API로 기간별 수집·비교. 순차 테스트이므로 `confidence_level` 필수 기록.

**Track A(공식 Studio A/B) = 보조 경로** — 공개 API로 테스트 생성·버전별 CTR 추출 불가. 사장님이 Studio 결과를 수동 입력하는 반자동.

### 6.2 Track B 운영 플로우

```
[1] Founder 승인(G2): 3개 선택 + 테스트 기간(기본 2일/후보)
  ↓
[2] Thumbnail A 적용 (thumbnails.set, D3)  ← Founder G2 승인으로 커버
  ↓  2~3일
[3] 기간 종료 → Analytics 수집 (자동)
  ↓
[4] Thumbnail B 적용 (thumbnails.set)
  ↓  2~3일
[5] 기간 종료 → Analytics 수집
  ↓
[6] Thumbnail C 적용 (thumbnails.set)
  ↓  2~3일
[7] 기간 종료 → Analytics 수집
  ↓
[8] 3개 비교 → 점수 산출 → 승자 판단
  ↓
[9] Founder 승인(G3): 승자 적용
```

### 6.3 수집 지표 (기간별)

```yaml
thumbnail_candidate_id: string
start_datetime: datetime
end_datetime: datetime
impressions: number | null          # Reporting API 필요
ctr: number | null                  # Reporting API 필요
views: number
watch_time_minutes: number
average_view_duration_seconds: number
average_view_duration_percentage: number | null
```

기존 `mapAnalyticsToPerformanceInput`을 재사용하되, **기간 필터(startDate/endDate)를 추가**하여 후보별 구간 데이터를 분리 수집한다.

### 6.4 점수식

```
score =
  (CTR 표준화 점수 × 0.35)
+ (watch_time_minutes 표준화 점수 × 0.35)
+ (average_view_duration_percentage 표준화 점수 × 0.20)
+ (impressions 안정성 점수 × 0.10)
```

- **CTR 단독 판단 금지** — watch_time/avg_view_duration 포함 필수.
- CTR이 null(Reporting API 미활성)이면 CTR 가중치 0.35를 watch_time에 재분배(0.525/0.35/0.125).
- 표준화: 동일 라운드 내 min-max 정규화(0~1).

### 6.5 confidence_level

순차 테스트는 요일·시간·알고리즘 영향을 받으므로 신뢰도를 반드시 기록한다.

| confidence_level | 기준 |
|---|---|
| `high` | 각 후보 impressions ≥ 5,000 + 테스트 기간 ≥ 3일/후보 + 요일 분포 균등 |
| `medium` | impressions ≥ 1,000 또는 기간 ≥ 2일/후보 |
| `low` | impressions < 1,000 또는 기간 < 2일 |
| `insufficient` | 판단 불가 — 테스트 연장 필요 |

### 6.6 Track A (보조 — Studio 수동 입력)

사장님이 YouTube Studio에서 A/B 테스트 결과를 확인 후, 다음 필드를 수동 입력:

```yaml
test_type: "official_youtube_ab"
winner_candidate_id: string
watch_time_share_winner: number    # Studio가 보여주는 값
notes: string                      # Studio 스크린샷 등
```

수동 입력 데이터는 동일한 `ab_tests`/`ab_test_results` 테이블에 저장.

---

## 7. 승자 판단 + 패배 원인별 디벨롭 규칙

### 7.1 판단표

| 결과 | 의미 | 액션 |
|---|---|---|
| CTR 높음 + 시청 지속 높음 | 좋은 클릭 이유 | **승자 후보** |
| CTR 높음 + 시청 지속 낮음 | 낚시성 가능성 | 문구/이미지 정직도 조정 |
| CTR 낮음 + 시청 지속 높음 | 영상은 좋지만 클릭 이유 약함 | 썸네일/제목 강화 |
| CTR 낮음 + 시청 지속 낮음 | 전체 문제 | 전체 재검토 |
| 노출수 부족 | 판단 불가 | 테스트 기간 연장 |
| 세 버전 차이 미미 | 뚜렷한 클릭 이유 없음 | 더 다른 가설로 재제작 |

### 7.2 패배 원인별 디벨롭 규칙

| 패배 원인 | 다음 액션 |
|---|---|
| 클릭 이유 불명확 | 제목·문구·이미지의 이유를 하나로 통일 |
| 주인공 불명확 | 이미지 확대, 배경 제거 |
| 증거 부족 | 결과 화면, 숫자, Before/After 추가 |
| 궁금증 부족 | 일부 정보 숨기기 |
| 공감 부족 | 현실 상황 이미지 사용 |
| 타깃 불일치 | 채널 시청층 선호 이미지로 변경 |
| 문구 약함 | 이득/손해/궁금증 구조로 재작성 |
| 제목과 불일치 | 하나의 클릭 이유로 통합 |
| 모바일 가독성 부족 | 글자 수 축소, 대비 강화 |

### 7.3 R7 성과 루프 접목

승자/패자 분석 결과는 기존 `extractCompletionInsight`에 `usage` 확장으로 주입:

```ts
// 기존 usage: 'hook' | 'intro' | 'pulling' | 'topic'
// 확장: 'thumbnail_ab' 추가
type InsightUsage = 'hook' | 'intro' | 'pulling' | 'topic' | 'thumbnail_ab';
```

`recordVideoPerformance` 입력에 `thumbnail_candidate_id`(선택)를 추가하여 어떤 썸네일 기간의 성과인지 연결한다.

### 7.4 3라운드 운영

```
1차: 클릭 이유가 다른 3개 (확대형 vs 증거형 vs 공감형)
2차: 1차 승자 방향을 세분화 (예: 증거 → 숫자증거/전후비교/실제화면)
3차: 최종 승자 주변 미세 조정 (문구축약/이미지확대/대비강화)
```

---

## 8. 데이터 모델

소스의 6개 테이블을 L5 NocoBase 컬렉션 규약으로 매핑한다. 모든 테이블에 `business_id`(FK), `created_at`/`updated_at`(camelCase, NocoBase 규약) 포함.

### 8.1 videos (기존 VideoRoomProject 확장)

기존 `VideoRoomProject`에 다음 필드 추가(별도 테이블 불필요):

| 필드 | 타입 | 설명 | pii_level |
|---|---|---|---|
| `main_click_reason` | `string` | 이 영상의 단 하나의 클릭 이유 | none |
| `target_problem` | `string` | 타깃의 현재 문제 | none |
| `target_desire` | `string` | 타깃이 원하는 이득 | none |
| `target_loss_to_avoid` | `string` | 타깃이 피하고 싶은 손해 | none |

### 8.2 thumbnail_candidates

| 필드 | 타입 | 설명 | pii_level |
|---|---|---|---|
| `id` | `string` PK | | — |
| `business_id` | `string` FK | | — |
| `video_project_id` | `string` FK | VideoRoomProject 참조 | — |
| `round` | `integer` | 테스트 라운드 (1, 2, 3) | none |
| `slot` | `enum` | A~I (9개) | none |
| `image_strategy` | `enum` | `zoom` / `evidence` / `empathy` | none |
| `text_strategy` | `enum` | `gain` / `loss_avoidance` / `curiosity` | none |
| `thumbnail_text` | `string` | 썸네일 문구 | none |
| `title_version` | `string` | 이 후보에 맞는 제목 버전 | none |
| `click_hypothesis` | `string` | 클릭 가설 | none |
| `image_source_ids` | `string[]` | 사용된 이미지 소스 ID 배열 | none |
| `design_notes` | `string` | 디자인 지침 | none |
| `mobile_readability_score` | `number` | 0~100 | none |
| `deadzone_passed` | `boolean` | 데드존 검수 통과 | none |
| `risk_level` | `enum` | Low/Medium/High/Critical | none |
| `status` | `enum` | `draft`/`approved`/`rejected`/`testing`/`winner`/`loser` | none |

### 8.3 thumbnail_psychology_analysis

| 필드 | 타입 | 설명 | pii_level |
|---|---|---|---|
| `id` | `string` PK | | — |
| `business_id` | `string` FK | | — |
| `thumbnail_candidate_id` | `string` FK | | — |
| `text_structure` | `string` | 문구 구조 유형 (이득/손해/비밀…) | none |
| `text_psychology` | `string` | 문구가 자극하는 심리 | none |
| `image_association` | `string` | 이미지가 연상시키는 것 | none |
| `combined_click_psychology` | `string` | 결합 최종 심리 | none |
| `expected_viewer_question` | `string` | 시청자가 떠올릴 질문 | none |
| `expected_viewer_desire` | `string` | 시청자 기대 이득 | none |
| `expected_viewer_fear` | `string` | 시청자 기대 손해 | none |
| `click_reason_clarity_score` | `number` | 0~100 | none |
| `title_text_image_alignment_score` | `number` | 0~100 | none |

### 8.4 image_sources

| 필드 | 타입 | 설명 | pii_level |
|---|---|---|---|
| `id` | `string` PK | | — |
| `business_id` | `string` FK | | — |
| `source_type` | `enum` | `self_photo`/`free_stock`/`cc_license`/`google_image`/`news_blog` | none |
| `source_url` | `string` | 원본 URL | none |
| `source_page_title` | `string` | 원본 페이지 제목 | none |
| `creator_or_owner` | `string` | 저작자/소유자 | low |
| `license` | `string` | 라이선스 표기 | none |
| `commercial_use_allowed` | `boolean` | 상업적 사용 가능 여부 | none |
| `modification_allowed` | `boolean` | 수정 허용 여부 | none |
| `attribution_required` | `boolean` | 출처 표기 필수 여부 | none |
| `download_date` | `date` | 다운로드 일시 | none |
| `risk_level` | `enum` | Low/Medium/High/Critical | none |
| `attribution_text` | `string` | 출처 표기 문구 | none |
| `usage_note` | `string` | 사용 메모 | none |

외부 액션 위험도: 이미지 다운로드 = **D2**, Critical 이미지 사용 = **D4(차단)**.

### 8.5 ab_tests

| 필드 | 타입 | 설명 | pii_level |
|---|---|---|---|
| `id` | `string` PK | | — |
| `business_id` | `string` FK | | — |
| `video_project_id` | `string` FK | | — |
| `round` | `integer` | 라운드 번호 | none |
| `test_type` | `enum` | `sequential_api_test` / `official_youtube_ab` | none |
| `candidate_ids` | `string[]` | 테스트 대상 후보 ID 3개 | none |
| `days_per_candidate` | `integer` | 후보당 노출 일수 (기본 2~3) | none |
| `start_datetime` | `datetime` | 테스트 시작 | none |
| `end_datetime` | `datetime` | 테스트 종료 | none |
| `status` | `enum` | `pending`/`running`/`collecting`/`completed`/`cancelled` | none |
| `winner_candidate_id` | `string` FK nullable | 승자 | none |
| `confidence_level` | `enum` | `high`/`medium`/`low`/`insufficient` | none |
| `notes` | `string` | 메모 | none |

외부 액션: `thumbnails.set` 호출 = **D3** (Founder G2 승인으로 커버).

### 8.6 ab_test_results

| 필드 | 타입 | 설명 | pii_level |
|---|---|---|---|
| `id` | `string` PK | | — |
| `business_id` | `string` FK | | — |
| `test_id` | `string` FK | ab_tests 참조 | — |
| `thumbnail_candidate_id` | `string` FK | | — |
| `start_datetime` | `datetime` | 이 후보 노출 시작 | none |
| `end_datetime` | `datetime` | 이 후보 노출 종료 | none |
| `impressions` | `number` nullable | 노출수 | none |
| `ctr` | `number` nullable | 클릭률 (0~1) | none |
| `views` | `number` | 조회수 | none |
| `watch_time_minutes` | `number` | 시청 시간(분) | none |
| `average_view_duration_seconds` | `number` | 평균 시청 지속(초) | none |
| `average_view_duration_percentage` | `number` nullable | 평균 시청 완료율(%) | none |
| `score` | `number` | 산출 점수 | none |
| `winner_label` | `enum` | `winner`/`loser`/`inconclusive` | none |
| `failure_reason` | `string` nullable | 패배 원인 | none |
| `next_action` | `string` nullable | 다음 디벨롭 방향 | none |

외부 액션: Analytics API 호출 = **D1** (자동).

---

## 9. UI (승인 중심)

### 9.1 원칙

- 도메인 로직은 `l5-core`에. UI 컴포넌트에 점수식/가설생성/심리분석 하드코딩 금지.
- UI는 founder-ui video-room 페이지의 `thumbnail_pattern_extraction` 단계에 카드로 추가.
- 사장님은 **보고·승인·선택만** — 생성·분석·수집은 AI 자동.

### 9.2 화면 구성

#### A. 9개 기획안 보드 (Stage A~C 결과)

- 3×3 그리드 카드: 각 카드에 이미지전략 아이콘 + 문구전략 태그 + 클릭 가설 한 줄 + 썸네일 문구 + 심리분석 요약(1줄)
- 심리분석 드릴다운: 카드 클릭 → 3단계 분석 전체 표시
- 이미지 후보: 각 카드에 수집된 이미지 소스 목록(출처·위험도 뱃지)

#### B. 승인 패널 (G1)

```
[승인] [수정 요청] [다른 이미지 찾기] [보류]
```

#### C. A/B 테스트 대시보드 (Stage F)

- 3개 후보 카드 + 현재 활성 후보 표시(하이라이트)
- 기간별 지표 차트: impressions / CTR / views / watch_time
- 라운드 진행률 바
- confidence_level 뱃지

#### D. 승자 판단 패널 (Stage G)

- 점수 비교 표(4개 지표 × 3후보)
- 승자 추천 + 판단 이유
- 패자별 패배 원인 + 다음 액션 제안
- 승인 버튼 (G3)

### 9.3 데이터 흐름

```
UI → l5-core function 호출 → 결과를 proposal.data에 저장
UI ← proposal.data 읽기 → 렌더링
```

---

## 10. 상태머신 접목 방식

### 10.1 MVP: `thumbnail_pattern_extraction` 내부 확장

title-development PRD와 동일 선례 — **VideoRoomStatus에 새 값 추가 금지**. 기존 단계 안에서 카드 stage로 세분화.

```ts
proposal: {
  stage: "thumbnail_pattern_extraction",
  summary: "썸네일 9개 A/B 자동화 결과",
  data: {
    thumbnail_ab_workflow: ThumbnailAbWorkflowRun,
    card_stage: ThumbnailAbCardStage
  }
}
```

### 10.2 카드 Stage 명명

| card_stage | 설명 |
|---|---|
| `matrix_generation` | 9개 매트릭스 생성 중 |
| `psychology_analysis` | 심리분석 수행 중 |
| `image_source_collection` | 이미지 소스 수집 중 |
| `plan_approval_pending` | G1 승인 대기 |
| `production` | 썸네일 제작 중 |
| `inspection` | 모바일/데드존 검수 |
| `ab_test_pending` | G2 승인 대기 |
| `ab_testing` | A/B 테스트 진행 중 |
| `ab_collecting` | 성과 수집 중 |
| `winner_judgment` | 승자 판단 |
| `winner_approval_pending` | G3 승인 대기 |
| `develop_next_round` | 패배 원인 디벨롭 → 다음 라운드 |
| `completed` | 최종 승자 적용 완료 |

### 10.3 Post-publish A/B 진입

A/B 테스트는 `completed`(업로드 완료) 이후 시작. 기존 상태머신 흐름을 막지 않는다:

```
upload_approval → completed → [Post-publish A/B 진입]
```

card_stage가 `ab_test_pending` 이후 단계로 진입하면 post-publish 모드.

---

## 11. 수용 기준

| ID | 수용 기준 | 필수 |
|---|---|---|
| AC-01 | 9개 썸네일 후보는 서로 다른 클릭 가설을 가져야 한다 (이미지전략×문구전략 3×3). | MUST |
| AC-02 | 각 후보에 3단계 심리분석(문구구조/이미지연상/결합심리) 결과가 저장된다. | MUST |
| AC-03 | 이미지 소스는 외부 자동 수집이며 "내 영상 캡처"는 소스에서 제외된다. | MUST |
| AC-04 | Critical 위험도 이미지는 사용 금지. High는 출처 표기 필수 + 대체 후보 보관. | MUST |
| AC-05 | Track B 순차 테스트에서 `thumbnails.set` 호출은 D3 위험도 + Founder 승인(G2). | MUST |
| AC-06 | 승자 판단 점수식은 CTR 단독 금지 — watch_time + avg_view_duration 포함. | MUST |
| AC-07 | 모든 A/B 테스트 결과에 `confidence_level`이 기록된다. | MUST |
| AC-08 | 패배 원인별 디벨롭 규칙이 적용되어 다음 라운드 후보가 제안된다. | MUST |
| AC-09 | 성과 데이터는 기존 `recordVideoPerformance` 경로로 저장된다 (R7 접목). | MUST |
| AC-10 | Founder 승인 지점은 정확히 4개(G1~G4). 나머지는 AI 자동 초안. | MUST |
| AC-11 | `VideoRoomStatus`에 새 값을 추가하지 않는다 (`thumbnail_pattern_extraction` 내부 확장). | MUST |
| AC-12 | 핵심 로직(매트릭스 생성/심리분석/점수식/승자판단)은 `l5-core`에 위치한다. UI 하드코딩 금지. | MUST |
| AC-13 | 6개 데이터 테이블 모두 `business_id` + `pii_level` 표기 포함. | MUST |
| AC-14 | Track A(Studio 수동 입력) 데이터도 동일 테이블에 저장 가능하다. | SHOULD |
| AC-15 | 이미지 출처 표기 텍스트가 영상 설명란에 자동 삽입 가능하다. | SHOULD |

---

## 12. Followup (이번 MVP 제외)

| 항목 | 이유 |
|---|---|
| 실 이미지 스크래퍼 구현 | MVP는 수집 인터페이스·저장 구조만. 실 크롤러는 M5+ |
| YouTube Studio 공식 A/B API | 공개 엔드포인트 미확인. API 공개 시 Track A 자동화 |
| 썸네일 이미지 자동 생성 (AI) | MVP는 기획안·소스 수집까지. 실 이미지 제작은 후속 |
| 슬라이드 연동 (썸네일→슬라이드 반영) | 슬라이드 팩토리와의 계약 별도 |
| OCR 기반 썸네일 분석 | 레퍼런스 썸네일 문구 자동 추출 |
| Viewtrap 자동 크롤링 연동 | CDP 운전 경로 활용 가능하나 MVP 범위 밖 |
| 멀티 영상 동시 A/B | MVP는 단일 영상 순차 테스트 |

---

## 구현 위치 제안

### 타입

```
packages/l5-core/src/functions/video-room/thumbnail-ab-types.ts
```

### 로직

```
packages/l5-core/src/functions/video-room/thumbnail-ab-matrix.ts      # buildThumbnailMatrix9
packages/l5-core/src/functions/video-room/thumbnail-ab-psychology.ts   # analyzeThumbnailPsychology
packages/l5-core/src/functions/video-room/thumbnail-ab-scoring.ts      # scoreAbTestResults
packages/l5-core/src/functions/video-room/thumbnail-ab-develop.ts      # diagnoseLossReason
```

### 기존 파일 확장

```
packages/l5-core/src/functions/video-room/performance-ingestion.ts     # thumbnail_candidate_id 추가
packages/l5-core/src/functions/video-room/completion-insight-extraction.ts  # 'thumbnail_ab' usage 추가
packages/l5-core/src/functions/video-room/performance-auto-mapping.ts  # 기간 필터 추가
```

### UI

```
apps/founder-ui/src/components/cmo/ThumbnailMatrixBoard.tsx
apps/founder-ui/src/components/cmo/ThumbnailAbDashboard.tsx
apps/founder-ui/src/components/cmo/ThumbnailWinnerPanel.tsx
```
