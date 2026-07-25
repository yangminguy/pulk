# PROMPT — 원본 수집과 구간 후보

## A. 조사 수급 (원고 전)

```
spec/04-harvest.md 와 docs/craft/SOURCE-PLAYBOOK.md 를 읽어라.

브랜드: <브랜드명>

작업:
1. SOURCE-PLAYBOOK §3 의 검색군으로 원본을 수집해라.
   브랜드 본국 언어와 영어를 함께 사용해라.
2. 영상 길이 제한을 두지 마라. 90분짜리 인터뷰도 대상이다.
3. 각 원본의 전체 자막을 확보해 sources/transcripts/ 에 저장해라.
   수동 자막 우선, 자동 자막 보조.
4. sources/catalog.json 에 메타데이터를 기록해라.
   원본 게시자·URL·게시일·라이선스·공식 여부·자막 유무는 필수다.
5. 핵심 숫자와 인용은 research/evidence.json 에 원문 위치까지 기록해라.

최소 기준:
공식 영상 10편 이상, 인터뷰 3편 이상, 광고 5편 이상,
제품·가격 화면, 뉴스·독립 검증 자료, 소비자 반응

주의:
- 재업로드보다 최초 게시물을 우선해라
- 출처 불명 재업로드는 후보에 넣지 말고 원본 추적 단서로만 써라
- 출처를 적는 것과 사용 허가는 별개다. rights_status 를 반드시 기록해라
```

## B. 편집 수급 (원고·정렬 후)

```
spec/04-harvest.md 를 읽어라.
shot-plan.json 의 selection_status: "need" 인 샷을 읽고 그 비트의 후보를 수집해라.
**shot-plan.json 을 직접 쓰지 마라.** 후보는 candidates/<beat_id>/ 에만 쓴다.
승인 구간 다운로드 결과는 assets/selected/manifest.json 에 쓴다.
shot-plan.json 은 review --apply 가 Z2 구역에 병합한다.

작업:
1. 비트의 search_intent, must_show, 고유명사로 sources/transcripts/ 를 검색해라.
2. 일치 지점 앞뒤 20~40초를 프리뷰로 만들어라.
   영상의 10/30/50/70/90% 프레임을 기계적으로 뽑는 방식은 쓰지 마라.
3. edit-profile.json 의 harvest.score_weights 로 후보를 정렬해라.
   의미 일치가 35점으로 가장 크다. 권리 위험은 점수에 넣지 말고 배지로 표시해라.
4. 모든 후보에 rights_status 와 score_source 를 기록해라.
5. 최소 후보는 beats.min_candidates 를 따른다.
6. 영상을 우선한다. 사진은 critical 비트에만 배치하고
   15분당 상한(sources.still_image_max_per_15min, 3~6장)을 넘기지 마라.

처리 순서: 훅 전체 → reveal 전체 → 숫자·인용·제품 → build → bridge

critical 비트에 맞는 후보가 없으면:
- 자동으로 강등하지 마라
- caption_card 로 대체하지 마라
- 검색어·언어·인물명을 바꿔 계속 찾고, 그래도 없으면 blocked 로 보고하고 중단해라

작업용 클립 (화질 2단):
- 프록시 720p 전량 (스토리보드 전), 승인분만 원해상도 (스토리보드 승인 후)
- 앞뒤 2초 핸들 보존
- 원본은 삭제하지 마라
```
