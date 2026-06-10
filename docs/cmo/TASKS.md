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

- [x] **M1. Viewtrap/확장 크롤링 배선** *(지표 검증)* *(2026-06-10 라이브 완료)*
  - `services/youtube/src/viewtrap/{cdp,parse,filters,transform,adapter}.ts` + `discovery/deps.ts`로 정식 이관. **raw CDP**(page WebSocket + Runtime.evaluate — 크롬149 connectOverCDP 폐기), 연결 직후 화면 밖(-4000px).
  - 2단계 `scrapeYoutubeSearchExtension`(deepWalk) + 3단계 `scrapeVideoSearchTable`/`clickExposureProbability`(노출확률 다건). 어댑터 = `createExtensionScraperAdapter`·`createViewtrapScraperAdapter`.
  - 필터: 조회수 5만+ · 성과도 good·great · 기여도 good·great · 노출확률 normal·good·great.
  - `createLiveDiscoveryDeps`가 `scrapeMetrics`에 2+3단계 병합 주입 → `runDiscoveryPipeline` deps(l5-core 무수정). 키 Step8 변환은 통합 항목 참조.
  - **라이브 실수신**: 2단계 등급("부동산 경매" Good+3 등), 3단계 노출확률, 통합 후보 3건. tsc 0·jest 58/58.
  - **실측 제약**: viewtrap 사이트는 가상화로 상단 ~6행만 videoId 매칭(2단계가 보완) · 프로그래밍 재검색 불가(사장님 in-app 검색 전제, `alreadyOnQuery`로 로드된 테이블 읽음). 상세 = features 문서.

- [ ] **M3. Sonnet 의도 분류 엔진** *(핵심 "생각")*
  - 크롤링 결과를 **상품·타깃 컨텍스트**로 분류. 모델 = Claude Sonnet 고정.
  - 키: ① 타깃이 볼 주제인가 ② 판매논리(문제→카테고리FBB→카테고리→아이템FBB로 해결→아이템)가 녹는가.
  - 풀링: ① 같은 타깃인가 ② 키로 브릿지되는가 ③ (롱테일)꾸준 수요인가.
  - 출력: 적합/모호/부적합. 적합+성과좋음 = 후보 근거.
  - 위치: `l5-core/cmo-strategy` 또는 `video-room` 신규.

- [x] **M1~M3 통합** *(2026-06-10 완료)*: 키 Step8 + 풀링 Step5/8에 발굴→크롤링→분류 연결. 후보의 "viewtrap 선정이유"를 LLM 추측 → 실데이터로.
  - 도메인: `l5-core/video-room/discovery-pipeline.ts`(신규) — `runDiscoveryPipeline({query,product,target,mode}, deps)` 순수 오케스트레이터. ① searchVideos ② getVideoStats+5만+필터 ③ (옵션)scrapeMetrics 병합 ④ classify(M3 Sonnet) ⑤ fit+성과좋음 후보. **각 단계 실패는 그 단계만 폴백**, `provenance`에 실데이터 소스 기록.
  - 변환: `toKeyViewtrapValidationInput`(키 Step8 buildViewtrapValidation 입력) · `toPullingViewtrapValidationInput`(풀링 Step5) · `toLongtailCandidateInputs`(풀링 Step8 findLongtailEvergreen) · `buildSelectionReason`(조회수·성과도·기여도·노출확률+분류사유 → 선정이유). growth_status='unknown'(추측 금지).
  - 실어댑터: `services/youtube/src/discovery/deps.ts` `createLiveDiscoveryDeps({client, viewtrapAdapter?, classify})` — @l5/youtube 클라이언트로 search/stats, viewtrap 어댑터(옵션)로 scrapeMetrics, Sonnet classify 주입. @l5/youtube는 l5-core 비의존(미러 타입).
  - 플러그인: `cmo:runDiscovery {project_id, query, mode?}` — @l5/youtube ESM dynamic import + Sonnet 분류로 파이프라인 실행 → discovery 카드 저장 + viewtrap_validation 초안 반환. ACL 추가. 함정: @l5/youtube는 ESM이라 require 불가 → `await import()`. dist 재빌드 = `cd apps/nocobase-app && corepack yarn build @l5/plugin-orchestration`.
  - 검증: l5-core tsc 0 + discovery-pipeline jest **11/11** + youtube jest 40/40 + l5-core video-room 무회귀(737/738, 실패 1은 사전존재 wall-clock 타이밍 플레이키 — 격리 시 통과). **라이브 부분 파이프라인 1회 PASS**: 실 YouTube 검색 15→5만+ 8건→실 Sonnet 분류 8건 fit, 실데이터 선정이유 생성(`services/youtube/scripts/verify-live-discovery.mjs`). CDP scrapeMetrics는 서버 미주입(로그인 크롬 전제) — stats+Sonnet 부분 파이프라인까지 라이브 확인.

## 🎬 영상 산출 마감 (M4)

- [x] **M4. 영상 제작 파이프라인 잔여** (2026-06-10): 도메인 = `l5-core/video-room/render-pipeline.ts`(신규).
  - brief 직접참조 슬라이드덱(`buildSlideDeckSpecFromBrief`) → factory 렌더 잡(`buildFactoryJobFromSlideDeck`→transport.submitJob, jobs/ 인박스) → 파일 기반 상태 폴링(transport `getRenderJobStatus` facts + `deriveRenderJobStatus`/`reconcileRenderJob`) → 산출물 QA(`evaluateRenderArtifacts`: 파일·길이·해상도·메타) → 업로드 **초안만**(`buildYoutubeUploadDraftFromBrief`, private/pending — 실제 업로드 절대 없음).
  - plugin: `cmo:buildSlideDeck`(brief 우선) · `cmo:submitRender`(실 잡 push) · `cmo:getRenderStatus`(신규, ACL 포함) · `cmo:createUploadDraft`(title 미입력 시 brief 자동초안). dist 재빌드 = `cd apps/nocobase-app && corepack yarn build @l5/plugin-orchestration`.
  - 검증: render-pipeline jest 21/21 + l5-core tsc 0 + **실 렌더 E2E PASS**(R6 brief→슬라이드덱 4장→잡 validate→queued→rendering→remotion 실렌더(80s, 6.9MB)→completed→QA pass→RenderJob reconcile). NocoBase 재기동은 오케스트레이터 일괄.

## 🔁 재학습 무인화 (M5)

- [x] **M5. 성과 자동 수집** *(2026-06-10 완료)*
  - 수집 러너 `services/youtube/src/performance/collect.ts` `collectVideoPerformance`(video 디멘전→축소→채널합계 폴백) + l5-core 매핑 `performance-auto-mapping.ts`(`parseVideoAnalyticsRecords`/`mapAnalyticsToPerformanceInput`)로 자동 수집→기존 `recordVideoPerformance` ingest 연결. 수동 경로 폴백 유지.
  - 검증: auto-mapping jest 6/6 + collect jest 4/4 + 양쪽 tsc 0. **라이브 1회 실수신**(디립다 28일): scope=video, 영상 2건(조회 1391·완료율 30.18% 등), dist로 parse→map→ingest 체인 통과.
  - **노출·CTR**: targeted API 미지원(M2 실측) → ctr/impressions=null + metrics_note 사유.
- [~] **M5 후속 1. Reporting API 노출수·CTR** *(2026-06-10 클라이언트 완료, 리포트 대기중)*
  - 클라이언트 `services/youtube/src/reporting/client.ts` `ReportingClient`(`listJobs`/`listReports(createdAfter)`/`downloadReport`/`collectImpressionsCtr`) + `parseReachReport`(channel_reach_basic_a1 CSV→영상/날짜별, 컬럼명 유연 매핑). TokenManager 재사용(Bearer).
  - M5 연결: `performance-auto-mapping.ts` `mapAnalyticsToPerformanceInput`에 optional `reach` 입력 추가 — 노출/CTR 있으면 채우고(metrics_note 갱신), 없으면 기존대로 null+사유 유지(무회귀).
  - 검증: reporting jest 10/10 + auto-mapping jest 9/9 + 양쪽 tsc 0. **라이브 listJobs로 job 확인**(`dee313e0-6d7e-4d61-92d8-8b5d00bd6558` type=channel_reach_basic_a1 name=l5-reach-basic). 리포트는 **0건 — 구글 비동기 생성 대기중(정상)**. 스크립트=`services/youtube/scripts/verify-live-reporting.mjs`.
  - **남은 것**: 리포트 백필(보통 다음날)되면 다운로드·파싱해 실 노출/CTR 수신값 확인 + plugin 액션에서 collectImpressionsCtr→mapAnalyticsToPerformanceInput reach 배선.

## 🛠️ 운영·개선 (M6~M8, 병행)

- [x] **M6. 텔레그램 알림 실작동** (2026-06-10): launchd plist 주입 + 재기동 확인(프로세스 env에 키 존재) + getMe ok + 테스트 메시지 발송 성공 + hermes plist chat_id 일치. 레포 코드 변경 없음.
- [~] **M7. 속도 최적화**: step2‖step3, step6‖step10 병렬화 적용(코드 기존 반영). 이번 세션은 플레이키 테스트만 안정화 — `key-content-draft.test.ts` "실측: 병렬 구간…" 테스트가 wall-clock 절대비교라 전체 jest 동시 실행 시 CPU 경합으로 간헐 실패 → **라운드 수 직접 관측**(maxConcurrency≥2 + rounds<5)으로 부하 비의존화. 의도(병렬<순차 라운드) 보존. `npx jest video-room` **2회 연속 738/738 GREEN**(이전 737/738). 모델/프롬프트 추가 튜닝은 후속.
- [x] **M8. 라이브 HTTP E2E + 정리** *(2026-06-10 완료)*: 플러그인 dist 재빌드(`corepack yarn build @l5/plugin-orchestration`, 신규 심볼 runDiscovery/getRenderStatus/buildSlideDeckSpecFromBrief grep 확인 + node --check) + NocoBase 재기동(`launchctl kickstart`) → `app:getInfo` **200**. **라이브 HTTP E2E PASS**: ① `cmo:sendBriefToFactory` 200 → `handoff_status=sent`, stub=false, factory `briefs/1b0c2e9c….json` **실파일 생성 확인**(R6 경로). ② `cmo:runDiscovery` 200 → 실 YouTube 검색+stats 라이브(provenance searched/stats=true), **후보 3개**(최고 112,661회 verdict=fit). 스크립트=`apps/founder-ui/e2e/m8-live-http-e2e.mjs`(재현 가능). **단 Sonnet 분류는 서버(launchd) 컨텍스트에서 폴백**(classified=false, "10개 영상 폴백(ambiguous)") — claude CLI cold-spawn 제약. 셸 컨텍스트 `verify-live-discovery.mjs`는 분류 라이브됨. 정리: `/tmp/cdp-*.mjs`+`oauth-token.json` 47개 → `/tmp/_archive/m8-cdp-tmp/`(핵심 로직은 `services/youtube/src/{token,credentials,viewtrap/cdp}.ts`에 이관 확인 후), M4 스모크(`jobs/l5-l5-m4-smoke.json`·`outputs/l5-m4-smoke/`) 삭제, demo-3min 등 기존 산출물 보존.

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
