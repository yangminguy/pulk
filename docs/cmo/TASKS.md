# CMO — TASKS (개발 계획)

> 라우터 = [CLAUDE.md](./CLAUDE.md) · 현재 상태 = [HANDOFF.md](./HANDOFF.md).
> 범례: `[x]` 완료·검증 · `[~]` 부분/검증 필요 · `[ ]` 미착수.

## 🎯 다음 마일스톤 — 발굴 자동화 배선 (M1~M3)

오늘 실증한 YouTube/Viewtrap 발굴을 키/풀링 기획에 실제 연결. 가장 우선.

- [x] **M2. YouTube API 발굴 어댑터** *(2026-06-10 완료)*
  - `services/youtube/`(`@l5/youtube`)에 검색·채널·analytics 클라이언트. `.credentials.json` 읽어 refresh_token→access_token 인메모리 캐시(`TokenManager`).
  - 기능: `searchVideos(query)` (search.list), `getVideoStats(ids)` (videos.list 50개 청크), `getChannelAnalytics(metrics, range)` (Analytics v2), `filterByMinViews`(5만+).
  - 검증: tsc + jest 10/10 + `scripts/verify-live.mjs` 실수신(검색 15건 → 5만+ 8건, 디립다 28일 조회 1395·시청 225분·구독+1).
  - **단, 노출수·CTR은 targeted Analytics API 미지원 실측 확인** → Reporting API reach report(`channel_reach_basic_a1`) 필요, API 활성화+job 생성은 M5로 이관. 상세: [features/youtube-viewtrap-discovery](./features/youtube-viewtrap-discovery.md).

- [ ] **M1. Viewtrap/확장 크롤링 배선** *(지표 검증)*
  - 오늘 `/tmp/cdp-*.mjs` 실증 코드를 `services/youtube/` 또는 `apps/founder-ui/e2e/viewtrap/`로 정식 이관.
  - 흐름: 주제 추려지면 → Viewtrap 검색창 자동입력 → 제목행 노출확률 버튼 클릭 → 기여도·성과도·노출확률 다건 크롤링.
  - 필터: 조회수 5만+ · 성과도 good·great · 기여도 good·great · 노출확률 normal·good·great.
  - `l5-core/.../reference-adapters.ts`에 scraper 주입(심 → 실 어댑터). 키 콘텐츠 Step8(`buildViewtrapValidation`) 자동 채움.
  - 전제: CDP 운전(로그인 크롬), 새로고침 금지. 실패 시 수동 폴백 유지.

- [ ] **M3. Sonnet 의도 분류 엔진** *(핵심 "생각")*
  - 크롤링 결과를 **상품·타깃 컨텍스트**로 분류. 모델 = Claude Sonnet 고정.
  - 키: ① 타깃이 볼 주제인가 ② 판매논리(문제→카테고리FBB→카테고리→아이템FBB로 해결→아이템)가 녹는가.
  - 풀링: ① 같은 타깃인가 ② 키로 브릿지되는가 ③ (롱테일)꾸준 수요인가.
  - 출력: 적합/모호/부적합. 적합+성과좋음 = 후보 근거.
  - 위치: `l5-core/cmo-strategy` 또는 `video-room` 신규.

- [ ] **M1~M3 통합**: 키 Step8 + 풀링 Step5/8에 발굴→크롤링→분류 연결. 후보의 "viewtrap 선정이유"를 LLM 추측 → 실데이터로.

## 🎬 영상 산출 마감 (M4)

- [x] **M4. 영상 제작 파이프라인 잔여** (2026-06-10): 도메인 = `l5-core/video-room/render-pipeline.ts`(신규).
  - brief 직접참조 슬라이드덱(`buildSlideDeckSpecFromBrief`) → factory 렌더 잡(`buildFactoryJobFromSlideDeck`→transport.submitJob, jobs/ 인박스) → 파일 기반 상태 폴링(transport `getRenderJobStatus` facts + `deriveRenderJobStatus`/`reconcileRenderJob`) → 산출물 QA(`evaluateRenderArtifacts`: 파일·길이·해상도·메타) → 업로드 **초안만**(`buildYoutubeUploadDraftFromBrief`, private/pending — 실제 업로드 절대 없음).
  - plugin: `cmo:buildSlideDeck`(brief 우선) · `cmo:submitRender`(실 잡 push) · `cmo:getRenderStatus`(신규, ACL 포함) · `cmo:createUploadDraft`(title 미입력 시 brief 자동초안). dist 재빌드 = `cd apps/nocobase-app && corepack yarn build @l5/plugin-orchestration`.
  - 검증: render-pipeline jest 21/21 + l5-core tsc 0 + **실 렌더 E2E PASS**(R6 brief→슬라이드덱 4장→잡 validate→queued→rendering→remotion 실렌더(80s, 6.9MB)→completed→QA pass→RenderJob reconcile). NocoBase 재기동은 오케스트레이터 일괄.

## 🔁 재학습 무인화 (M5)

- [x] **M5. 성과 자동 수집** *(2026-06-10 완료)*
  - 수집 러너 `services/youtube/src/performance/collect.ts` `collectVideoPerformance`(video 디멘전→축소→채널합계 폴백) + l5-core 매핑 `performance-auto-mapping.ts`(`parseVideoAnalyticsRecords`/`mapAnalyticsToPerformanceInput`)로 자동 수집→기존 `recordVideoPerformance` ingest 연결. 수동 경로 폴백 유지.
  - 검증: auto-mapping jest 6/6 + collect jest 4/4 + 양쪽 tsc 0. **라이브 1회 실수신**(디립다 28일): scope=video, 영상 2건(조회 1391·완료율 30.18% 등), dist로 parse→map→ingest 체인 통과.
  - **노출·CTR**: targeted API 미지원(M2 실측) → ctr/impressions=null + metrics_note 사유. Reporting API(`channel_reach_basic_a1`, `youtubereporting.googleapis.com` 활성화 + job + 비동기 ~48h)는 후속.

## 🛠️ 운영·개선 (M6~M8, 병행)

- [x] **M6. 텔레그램 알림 실작동** (2026-06-10): launchd plist 주입 + 재기동 확인(프로세스 env에 키 존재) + getMe ok + 테스트 메시지 발송 성공 + hermes plist chat_id 일치. 레포 코드 변경 없음.
- [ ] **M7. 속도 최적화**: 키 초안 LLM 순차(~178~218초). 추가 독립 스텝 병렬 + 모델/프롬프트 튜닝. 품질 회귀 없이.
- [ ] **M8. 라이브 HTTP E2E + 정리**: NocoBase 실 E2E(generate→send→briefs/ 확인). `/tmp/cdp-*.mjs`·데모 산출물 정리. 미커밋 hunk 분리.

## 구현 순서

1. **M2** YouTube API 발굴 (자격증명 있음, 바로 가능)
2. **M1** Viewtrap/확장 크롤링 배선
3. **M3** Sonnet 분류 엔진
4. M1~M3 통합 → 키/풀링 Step 자동화
5. **M4** 영상 제작 마감
6. **M5** 성과 자동수집 → 재학습 무인화
7. M6·M7·M8 병행

## ✅ 완료 (요약, 상세는 HANDOFF)

- [x] R1 풀링 v3 · [x] R4 콘텐츠 제작 · [x] R6 실 factory 전달 · [x] R7 재학습 코드 · 전체 E2E 19/19.
- [x] YouTube/Viewtrap 발굴 **실증** + API 키·OAuth refresh_token 발급(2026-06-10).
