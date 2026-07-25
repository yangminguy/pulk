> **이 문서는 편집 기준입니다. 코드를 작성할 때는 읽지 마세요.**
> 코드가 사용하는 수치는 전부 `config/edit-profile.json`에 있습니다.
> 이 문서와 `edit-profile.json`의 값이 다르면 **`edit-profile.json`이 우선**합니다.

# SOURCE PLAYBOOK — 화면 소스 수급

## 1. 후보 단계에서는 넓게 가져온다

공개적으로 접근 가능한 다음 자료를 모두 후보 저장소에 넣을 수 있다.

- 브랜드 공식 유튜브·인스타그램·틱톡
- 공식 광고·캠페인·브랜드 필름
- 창업자·임원 인터뷰
- 뉴스·방송·다큐멘터리
- 패션쇼·행사·공연
- 제품 페이지·가격·결제 화면
- 공시·연차보고서·투자자 자료
- 팬·고객·리뷰·UGC
- 영화·TV·뮤직비디오·스포츠
- 사진 아카이브·신문·잡지
- 스톡과 자체 촬영

후보 수집과 최종 발행 승인을 분리한다.

출처를 적는 것만으로 사용 허가가 생기지는 않는다. 따라서 후보를 폭넓게 수집하되 `rights_status`와 대체 화면을 함께 기록한다.

---

## 2. 원본 저장소

영상 하나마다 다음을 만든다.

```text
source_id
title
publisher
original_url
published_at
duration
language
transcript
description
rights_status
visual_topics
usable_ranges
```

원본은 프로젝트 종료까지 보존한다.

---

## 3. 검색군

### 공식 화면

```text
[brand] official
[brand] campaign film
[brand] commercial
[brand] archive
[brand] factory
[brand] craftsmanship
[brand] runway
```

### 인물

```text
[founder] interview
[founder] full interview
[designer] talk
[CEO] presentation
[person] on [specific decision]
```

### 사건과 숫자

```text
[brand] annual report
[brand] revenue
[brand] sales growth
[brand] controversy
[brand] launch event
[specific event] footage
```

### 소비자

```text
[product] review
[brand] fan
[product] unboxing
[brand] queue
[brand] sold out
```

브랜드 본국 언어와 영어를 함께 사용한다.

---

## 4. 긴 영상 구간 찾기

영상 길이 제한을 두지 않는다.

1. 전체 자막을 확보한다.
2. 비트의 인물·행동·숫자·핵심 동의어로 검색한다.
3. 일치 지점 앞뒤 20~40초를 본다.
4. 발언 맥락을 확인한다.
5. 사용할 3~9초와 앞뒤 2초 핸들을 저장한다.
6. 얼굴·행동·제품·공장 등 OCR·프레임 태그를 추가한다.

영상의 일정 비율 지점만 캡처하는 방식은 보조 썸네일에만 사용한다.

---

## 5. 비트별 검색 패키지

핵심 비트 하나에 다음 후보를 만든다.

- 직접 증거 2개 이상
- 감정 또는 현실 장면 1개
- 대체 표현 1개
- 출처 위험이 낮은 대체안 1개

후보 상한은 없다. 정확한 화면이 없는 상태를 성공 처리하지 않는다.

---

## 6. 후보 랭킹

```text
의미 일치 35
증거 강도 25
움직임과 화면성 15
원본성 10
앞뒤 다양성 10
해상도 5
```

권리 위험은 랭킹에서 숨기지 않고 별도 배지로 표시한다. 관련 없는 저위험 스톡이 관련 있는 공식 영상을 밀어내지 못하게 한다.

---

## 7. 실제 사용 방식

- 원본 클립은 보통 2~6초
- 핵심 원본 발언은 3~9초
- 동일 원본의 서로 다른 구간을 원고의 다른 위치에 재배치
- 원본 오디오는 필요한 순간만 살림
- 화면을 말로 비평·설명·분석하는 구간에 연결
- 워터마크를 숨기기 위해 과도하게 확대하지 않음
- 원본 URL·원본 인/아웃·영상 내 인/아웃을 기록

짧게 사용한다는 사실만으로 권리 문제가 해결되는 것은 아니다.

---

## 8. 화면을 못 찾았을 때

순서:

1. 검색어·언어·인물명 변경
2. 인터뷰 자막과 설명란의 원출처 추적
3. 웹 아카이브·공시·보도자료 확인
4. 직접 웹 화면 녹화
5. 직접 촬영
6. 근거 기반 자체 그래픽
7. 원고를 보여줄 수 있는 문장으로 수정

`fallback_text`로 자동 완료하지 않는다.

