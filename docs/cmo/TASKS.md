# CMO — TASKS (개발 계획)

> 라우터 = [CLAUDE.md](./CLAUDE.md) · 현재 상태 = [HANDOFF.md](./HANDOFF.md).
> 범례: `[x]` 완료·검증 · `[~]` 부분/검증 필요 · `[ ]` 미착수.

## ✅ 안정성 개선 완료 (2026-06-12)

- [x] **S3** Sonnet 분류 CLI → Anthropic SDK 직접 호출 전환 (4곳, launchd cold-spawn 제거)
- [x] **S1** 상태머신 단일화 검증 (state-machine.ts 이미 완전 구현 확인)
- [x] **Q3** generateVideoExecutionBrief 400 폴백 강화 (fullScript/title 빈값 처리)
- [x] **T3** 런타임 에러 텔레그램 알림 (sendRuntimeErrorTelegram + QA fail 알림)
- [x] Tiger 진행 중 프로젝트 2개 활성화

## 📋 다음 안정성 개선 작업 (ACR Work Order)

- [ ] **S2** CDP RPC 세션 자동 재연결 강화 (viewtrap WebSocket close → reconnect 1회)
- [ ] **S4** rebuild-plugin.mjs 스크립트 정규화 (src→build→launchctl 자동화)
- [ ] **Q1** Viewtrap Skill → 키 콘텐츠 파이프라인 내부 통합 (C3, PRD Phase 3)
- [ ] **Q4** 말투 변환 Voice Style Agent 구현 (l5-core/cmo-strategy/voice-style.ts 신규)

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

## ✍️ 제목/썸네일 기획 (Phase 7)

- [x] **제목·썸네일 디벨롭 강의 방법론 도메인 반영** *(2026-06-11 도메인 완료)*: SOURCE = `docs/cmo/prd/cmo-title-thumbnail-develop-notes.SOURCE.md`.
  - 제목: `cmo-strategy/title-reference-discovery.ts`(신규) — `discoverTitleReferences(input, deps)` 레퍼런스 2개 YouTube API 자동 발굴(5만+ 필터·등급 실측 시 Good/Great 필터·채널 다양성·기존 검증 재통과·미실측 투명 표기). `title-development-llm.ts` — `hot_videos`(뷰트랩 실측) 컨텍스트 → 5단계(수식어)·7단계(구조 치환) 프롬프트 주입, 미주입 시 `HOT_VIDEO_MISSING_NOTE`. STEP_GUIDANCE 2~8단계 강의 디테일 보강(잘못하는 경우/조회수 합계 기준/조사→수식어 제거 순서 등). `shouldSwapTitle`(업로드 7일 100회 미만→교체, 설정형).
  - 썸네일: `thumbnail-matrix.ts` — `THUMBNAIL_COMPONENT_WEIGHTS`(45/45/10)·`THUMBNAIL_REVIEW_CHECKLIST`(데드존/작은화면/무게중심)·`reviewThumbnailCandidate`(글자수·디자인 과투자 경고), 매트릭스 프롬프트 8규칙(공감 중심/16자/왼쪽 위/벤치마킹 이유 분석). `thumbnail-ab-test.ts` — `THUMBNAIL_SWAP_WINDOW_DAYS=7`·`validateRotationWindow`(로테이션 7일 내 완료 검사)·`evaluateThumbnailSwapSignal`(설정형 임계: 분당 조회수=강의 원기준 옵션 + 보수적 일할 추세 기본).
  - 검증: tsc 0 · 신규 jest 30/30(title-reference-discovery 11 + hotvideo 4 + title swap 4(통합) + thumbnail-develop-rules 14) · 회귀 title-development 59/59 + thumbnail 5스위트 60/60 + cmo-v3-e2e 4/4.
- [ ] **배선 후속 (다른 세션 plugin.ts/StrategyBoard 작업 종료 후)**:
  - ① `cmo:proposeTitleDevelopment`가 references 미입력 시 `discoverTitleReferences` 자동 발굴(@l5/youtube search/stats + 확장 scrapeGrades graceful 주입), `hot_videos`는 뷰트랩 CDP(구독자 적은 순·Good/Great·10만+) 수집해 주입.
  - ② 승인③(hook_draft_approval) 화면에서 **제목 후보(final_candidates) + 썸네일 9개 후보를 한 보드에서** 사장님 최종 택1(통합 승인 뷰).
  - ③ 업로드 후 모니터링: `shouldSwapTitle`/`evaluateThumbnailSwapSignal`을 성과 수집(M5) 경로에 연결해 교체 권장 알림(텔레그램).
  - ④ 검수(Stage E) UI에 `reviewThumbnailCandidate` 경고·체크리스트 표시.

- [x] **제목 디벨롭 8단계 워크플로우** *(2026-06-10 완성)*: PRD = `docs/prd/cmo-title-development.md`. 기능 문서 = [features/title-development-workflow](./features/title-development-workflow.md).
  - 도메인 = `l5-core/cmo-strategy/title-development{,-types,-llm}.ts`(레퍼런스 검증→4교차조합→어색함→2~8단계→100점 평가). AC-01~15 매핑, jest 59/59.
  - 오케스트레이터 스킬 `cmo.title.development`(pulling→title→script 체인) + `cmo-skill-registry` 등록(e2e 통과).
  - 라이브 액션 `cmo:proposeTitleDevelopment`(plugin src+dist+ACL) → `title_development` 카드. founder-ui `TitleDevelopmentBoard`(승인3=hook_draft) + ProductionBoard 확정제목 노출(승인4=script).
  - 검증: 회귀 68 suites/865 tests 0실패 · tsc 0 · `next build` 0 · dist node --check OK. **활성화 = NocoBase 재기동(dev 프로세스)** → 라이브 HTTP/Playwright smoke 후속.

## 🎬 영상 산출 마감 (M4)

- [x] **M4+. 영상 일괄 렌더 + 텔레그램 알림** *(2026-06-12 코드 완료 · launchd 라이브)*
  - 도메인 = `l5-core/video-room/batch-render.ts`(`planBatchRender`/`summarizeBatchRender`, jest 13) · 오케스트레이터 = hermes `tasks/video-batch-render.ts`(jest 6) + `runVideoBatchRenderLive`(runner.ts) + nocobase-client 2함수.
  - 데몬 = `services/hermes-runtime/scripts/video-batch-render-daemon.mjs`(--once/5분 폴링) + `launchd/com.l5.video-batch-render.plist`. 잡 단위 **순차** 렌더(Remotion 내부 병렬 — 동시 N프로세스 비채택).
  - [x] **launchd 등록 완료**(2026-06-12, PID 7874): `~/Library/LaunchAgents/com.l5.video-batch-render.plist`에 NOCOBASE_TOKEN/TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID 주입(PlistBuddy). 첫 사이클 로그 `~/.l5/video-batch-render/daemon.out.log` "렌더 대상 없음" (rendering 0건이라 텔레그램 0스팸 정책 작동). 폴링 5분 간격.
  - [ ] 후속: 실 'rendering' 프로젝트 도달 시 텔레그램 요약 1건 수신 확인.

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

- [x] **M8 후속. runDiscovery 서버 CDP 라이브 2·3단계 주입** *(2026-06-10 완료)*: `plugin.ts runDiscovery`가 launchd 9222 CDP에 서버에서 붙어 `createExtensionScraperAdapter`(2단계 기본)·`createViewtrapScraperAdapter`(3단계 옵션 `use_viewtrap`, resolveExposure)를 `createLiveDiscoveryDeps`에 주입. graceful 폴백(CDP 실패→1단계+classify, throw 금지) + `provenance`/`degraded`/`live_notes` 응답 + in-process lock(409 직렬화) + 세션 close(크롬 유지). 검증: tsc 0 · jest 60/60 · dist 재빌드(신규 심볼 grep) · 재기동 getInfo 200 · 라이브 E2E (a)2단계 후보5·scraped+classified true (b)`use_viewtrap` 3단계 후보6·1회만 차감 (c)동시 409. 상세 = HANDOFF 상단.

## 🖼️ 6주차 썸네일 강의·컨설팅 보강 백로그 (2026-06-11, Notion 원문 재대조)

소스 = Notion 「비즈니스 pt 6주차 강의」(37a37e66) + 「6주차 컨설팅」(37b37e66). 기반영(45/45/10·9개·7일 윈도우·데드존·16자·임계 설정형) 제외, 미반영분만:

> ✅ B1~B7 전부 구현 완료 (2026-06-12, `l5-core/video-room/thumbnail-develop.ts` + plugin/UI 배선 — 상세 HANDOFF 최상단).

- [x] **B1. 이미지 디벨롭 6기술 완비** — 매트릭스는 ①확대②증거④공감만. ⑤시청층 선호 이미지 전환, ⑥뷰트랩 성과 썸네일 구성 반복 학습이 빠짐. ⑥은 **썸네일 레퍼런스 자동 학습**: 같은 카테고리(완전 동일 주제 불요) 성과도·기여도 Good↑ 영상의 썸네일 구성 학습 → `reference_patterns` 자동 주입(현재 수동). runDiscovery 후보의 썸네일 URL 재사용.
- [x] **B2. "내 채널에 모인 사람" 기준** — `ThumbnailMatrixInput`에 채널 시청층 프로필 입력 + `reviewThumbnailCandidate`에 "채널 시청층 정합" 경고(살빠지는/살찌는 음식 동시 운영 = 주제 매몰 실수 방지). 키 콘텐츠 `identity_match` 데이터 재사용.
- [x] **B3. 썸네일 문구에 5주차 제목 기술 재적용** — "제목에서 배운 방식 그대로": 문구 후보에 제목 디벨롭 2(쉬운 단어)·5(수식어)·6(질문 생기게) 1패스 추가 후 16자 검수.
- [x] **B4. 썸네일↔도입부 강도 연동** — "썸네일이 9점이면 도입부도 9점": intro_30s 단계에 썸네일 기대 강도 대비 도입부 강도 점검 + 승인③에서 함께 표시.
- [x] **B5. 디벨롭 후 자가 재귀 점검(컨설팅)** — "디벨롭 다 하고 다시: 더 후킹되게 됐나? 왜 후킹 된 거지?" — 원본 레퍼런스 대비 후킹 개선 비교 평가, 개선 없으면 해당 단계 재실행. 제목 7단계·썸네일 공통 게이트.
- [x] **B6. 타깃 채널 우선 발굴(컨설팅)** — 영상 검색 전에 "내 타깃(대표님)이 볼만한 채널 먼저 찾기(네이버/메타 포함) → 내 용어로 변환 → 재검색 → 잘된 채널 기반 확인". discovery에 채널 단위 경로 추가, 썸네일 레퍼런스 풀(B1)과 연계.
- [x] **B7. 폰트 소스·라이선스(눈누)** — 후보 design_notes/검수 체크리스트에 폰트 출처(눈누 라이선스 확인) 항목 추가. 이미지 분쟁 시 즉시 교체 원칙은 attribution 시스템에 기반영.

## 📜 E2E 워크플로우 정본 (2026-06-11)

- [x] **전체 워크플로우 마스터 HTML** *(2026-06-11)*: PRD 6종 전수 + 구현 대조 → `docs/cmo/CMO_E2E_WORKFLOW_MASTER.html`. 오류·제한 16건 표 + P0~P2 순서 포함. 이후 배선 작업은 이 문서 §14 기준으로 진행.
- [x] **P0. 활성화 + 라이브 E2E 관통** *(2026-06-12)*: 신규 프로젝트로 strategy_chat→**upload_approval** 전 구간 라이브 관통(`e2e/full-pipeline-live.mjs`, 실 렌더 포함). 발견 오류 7건 즉시 수정(CDP RPC 타임아웃·PT규칙 도출·2차 확장검색 등 — HANDOFF).
- [x] **P2. 실제 YouTube 업로드 배선** *(2026-06-12)*: `cmo:publishUpload`(videos.insert resumable, confirm+status 가드, D3, 자동 트리거 0). 라이브 호출은 사장님 승인⑥ 후에만 — E2E에서는 의도적으로 미호출.
- [ ] **후속**: ① generateVideoExecutionBrief 400 원인(연구팩 의존) 확인 ② CTR 리포트 백필 후 실수신 확인 ③ 신규 보드 Playwright 스모크 ④ 렌더 자동 워처(현재 오케스트레이터 실행).

## 🔁 풀링 이후 자동 진행 (2026-06-11)

- [x] **자동 진행 배선 — 멈춤 3곳 해소** *(2026-06-11)*: intro_30s 정지(`advanceProjectUntilGate`) · pulling_plan 자동 커밋(proposePullingReport) · 제작/발행 구간 단계별 전진(`advanceProjectFrom` 5개 액션) + `cmoGetRenderStatus` API/버튼 신설 + phases.ts 고아 status 제거. 상세 = HANDOFF 최상단. **재기동·라이브 E2E 후속.**
- [ ] **제목 디벨롭 레퍼런스 자동화**: Viewtrap 레퍼런스 2개 수동 입력을 발굴 결과 자동 선택으로 — 사장님 결정 대기.

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

## CMO 인사이트 루프 (2026-06-12 라이브)

- [x] `services/cmo-insight-loop/` 구축 — 매일 21시 유튜브 후킹 분석 5개→텔레그램 HTML, 일요일 22시 세컨 브레인(Supabase) 동기화. Cowork 스케줄 태스크 2종.
- [ ] followup: (1) 사장님 피드백 1주 누적 후 guidelines.md 기준 정교화 (2) 키워드 셋 튜닝(config.json) (3) viewtrap 핫비디오 소스 통합 검토.
