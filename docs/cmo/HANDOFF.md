# CMO — HANDOFF (현재 상태)

> 최종 업데이트: 2026-06-10. 라우터 = [CLAUDE.md](./CLAUDE.md). 다음 계획 = [TASKS.md](./TASKS.md).
> 300줄 넘으면 오래된 항목을 `docs/archive/`로 이관하고 요약만 남긴다.

## 🟢 2026-06-10 — runDiscovery 서버 CDP 라이브 발굴 정식 주입 (2단계 기본·3단계 옵션)

NocoBase `cmo:runDiscovery`가 launchd 상시 9222 CDP 크롬에 서버에서 직접 붙어 2·3단계 라이브 발굴을 돌린다. 이전엔 client(YouTube API)+classify(Sonnet)만 주입했고 CDP 어댑터는 미주입이었다.

- **배선**(`plugin-orchestration/src/server/plugin.ts` `runDiscovery`): 핸들러에서 `yt.connectCdp(9222)` 시도 → 성공 시 `createExtensionScraperAdapter`(2단계)·(옵션)`createViewtrapScraperAdapter`(3단계, `resolveExposure:true`)를 만들어 `createLiveDiscoveryDeps`에 주입. 사용 후 `cdpSession.browser.close()`(연결만 해제, 크롬은 launchd 유지).
- **이용횟수 보호**: 신규 요청 옵션 `use_viewtrap`(불리언). **기본 OFF** → 2단계(YouTube 플러그인, 무료)까지만 라이브. 3단계(viewtrap 사이트 검색, 이용횟수 차감)는 `use_viewtrap===true`일 때만. extension이 이미 채운 노출확률 영상은 deps 병합이 재검색 스킵.
- **graceful**: CDP 연결 실패/viewtrap 미로그인 시 throw 없이 1단계(YouTube API)+classify로 폴백. 파이프라인 scrapeMetrics가 throw하면 scrapeMetrics 제거 후 1회 재시도. 응답에 `provenance`(searched/stats/scraped/classified) + `degraded` + `live_notes`(사유) 명시.
- **동시성**: 모듈 레벨 `_discoveryInFlight` lock으로 직렬화 — 실행 중 호출은 **409**("another runDiscovery is in flight"). finally에서 항상 해제.
- **검증**: youtube/l5-core tsc 0 · youtube jest **60/60** 무회귀 · `yarn build @l5/plugin-orchestration` OK(dist에 connectCdp/createExtensionScraperAdapter/createViewtrapScraperAdapter/_discoveryInFlight/use_viewtrap/live_notes grep 1+) · NocoBase 재기동 `app:getInfo` 200. **라이브 HTTP E2E**(port 13000, admin): (a) 기본 2단계 → `provenance` 전부 true(scraped=true=extension·classified=true), degraded=false, 후보 5건, viewtrap 스킵 note. (b) `use_viewtrap=true` → 3단계 enabled note, scraped+classified true, 후보 6건(기여/성과 등급 실측), **이용횟수 1회만 차감**. (c) 동시 2콜 → 1×200 + 1×409 확인.
- **메모**: (b)에서 일부 후보 exposure 미병합 — viewtrap 사이트 검색 결과 테이블의 videoId 집합이 YouTube API 검색 집합과 교집합이 적어 exposure 보강 대상이 없었던 것(정상 graceful, 실패 아님).

## 🟢 2026-06-10 — viewtrap 검색 코드 트리거 정식 배선 (제약2 해결: 확인 모달)

이전 "프로그래밍 재검색 불가"는 **오판**이었다. 실제 원인 = **검색 확인 모달을 안 눌렀던 것**.

- **검색 = 확인 모달 "확인" 클릭 필요, ~20초**: 검색어 입력 후 실행하면 **"이용횟수가 차감되며 검색이 진행됩니다. '<키워드>'(으)로 검색하시겠습니까?" 모달**이 뜨고, **"확인" 버튼(`innerText==='확인'`)을 클릭해야** 검색이 진행된다. 확인 후 **~20초** 뒤 결과 테이블 갱신(첫 행 `td:nth-child(4)` 변화로 감지).
- **`scrapeVideoSearchTable` 교체**(`viewtrap/cdp.ts`): `fill`(native setter) → `press(Enter)`(안 먹으면 `bg-primary-300` 버튼 클릭) → **`clickSearchConfirm`(확인 모달 폴링→"확인" 클릭)** → **`waitForResultChange`(첫 행 변화 폴링, 기본 30s, `resultWaitMs` 옵션)**. `clickExposureProbability`의 확인 모달 패턴 재사용.
- **`alreadyOnQuery` 가드 유지**: input value 일치 + 행 존재 시 재검색 안 함(이용횟수 차감 절약). 재검색/새로고침/이동 금지(인메모리 인증 보호), 창 minimized 유지.
- **검증**: `services/youtube` tsc 0 + jest **60/60**(신규: 검색 확인모달 클릭 / alreadyOnQuery 스킵 단위테스트). 라이브 재검증 안 함(이용횟수 차감 — 오케스트레이터가 "숏폼 편집"으로 라이브 검증 완료).

## 🟢 2026-06-10 — 발굴 크롤러 raw CDP 정식 배선 + 2·3단계 라이브 실수신

3단계 발굴 흐름(YouTube API → 확장 deepWalk → viewtrap 노출확률)을 `services/youtube`에 raw CDP로 정식 이식·라이브 검증. 상세 = [features/youtube-viewtrap-discovery](./features/youtube-viewtrap-discovery.md) "라이브 배선 완료".

- **raw CDP**: `viewtrap/cdp.ts` `connectCdp()`를 page WebSocket + `Runtime.evaluate`로(크롬 149는 `connectOverCDP`가 `setDownloadBehavior` 거부 → playwright 폐기). 연결 직후 **모든 창 `-4000px`**(화면 점유 금지). 탭 0개면 `PUT /json/new`.
- **2단계(라이브 OK)**: `scrapeYoutubeSearchExtension` deepWalk shadow DOM — "AI로 돈벌기" 15카드 Good+8, "릴스 편집" 11/11, "부동산 경매" 12·Good+3 실수신. 조회수 영문 로케일("6.5M views") 파싱 추가. `createExtensionScraperAdapter`.
- **3단계(제약 실측)**: 노출확률 헤더 버튼 1회 클릭→모달 확인→~14s 다건 로드. 이미 로드돼 있으면 재클릭 안 함. **가상화로 상단 ~6행만 videoId 매칭**(텍스트 등급은 41행 전부, 썸네일/href는 viewport 6행분만). ~~프로그래밍 재검색 불가~~ → **해결**(상단 2026-06-10 항목: 확인 모달 "확인" 클릭으로 코드 트리거, ~20초). `alreadyOnQuery`로 캐시 우선(재검색/새로고침/이동 금지).
- **배선**: `discovery/deps.ts` `createLiveDiscoveryDeps`가 `scrapeMetrics`에 **2단계 extension(우선)+3단계 viewtrap exposure 보강** 병합 주입. l5-core `runDiscoveryPipeline` 무수정.
- **라이브 통합**: `createLiveDiscoveryDeps`→`runDiscoveryPipeline`("부동산 경매") 1회 → provenance 전부 true, 10영상 분류, **최종후보 3건**(183K/1M/2.9M, 기여/성과 good 실측).
- **검증**: `services/youtube` tsc 0 · jest **58/58**(신규 `discovery-deps.test.ts` + deepWalk 노이즈/영문조회수 케이스) · build OK.

---

## 🟢 2026-06-10 — 후속3 완료: runDiscovery Sonnet 분류 서버 폴백 해소 (timeout 근본원인)

M8의 ⚠️ "Sonnet 분류 서버 폴백"(`classified=false`, 10개 ambiguous 폴백)을 **launchd 서버 컨텍스트의 claude CLI cold-spawn 타임아웃**으로 규명·수정.

- **진단(폐기된 가설 포함)**: PATH/ENOENT 아님 — launchd plist PATH(`/usr/local/bin:/Users/wonminyang/.npm-global/bin:...`)에 claude(`~/.npm-global/bin/claude`) 존재. 최소 launchd env(HOME 없음 포함)로 격리 spawn 시 4~15s 정상 작동. **실 라이브 HTTP runDiscovery 측정이 결정타**: 분류 콜이 47s·79s·**125s**까지 걸림(서버 busy + cold-spawn + 배치 순차). claude-cli-client 기본 timeout=60s → 한 배치(10개) 양 attempt(maxRetries=1) 모두 60s 타임아웃 → `classifyBatch`가 throw → `classifyDiscoveredVideos`가 그 배치만 ambiguous 폴백 → fallback_count=10 → `provenance.classified=false`. 이게 "10개 영상 폴백(ambiguous)"의 정체.
- **수정(1줄, 호출부 한정)**: `plugin.ts` runDiscovery의 `createClaudeCLIClient({ model: 'sonnet' })` → `{ model: 'sonnet', timeoutMs: 240_000 }`. claude-cli-client.ts 기본 60s는 **불변**(다른 호출부 보호, 외과적). dist는 `corepack yarn build @l5/plugin-orchestration`로 재빌드(`timeoutMs: 24e4` 번들 확인) + `launchctl kickstart -k` 재기동(app:getInfo 200).
- **검증 전후 비교**: 수정 전(M8 기록) classified=false/10개 폴백. 수정 후 라이브 HTTP 4개 쿼리 연속 — `인스타그램 릴스 만드는 방법`/`숏폼 편집 강의`/`유튜브 알고리즘`/`인스타 마케팅 전략` 전부 **status 200 · classified=true · notes=[] · fallback_count=0**(35~125s). `classified = (fallback_count===0)`이므로 전 영상이 실 LLM verdict 획득 = 폴백 0. claude-cli-client 단위테스트 8/8, l5-core tsc 0.
- **메모**: candidates 0개는 분류 실패 아님 — candidate_basis(`verdict==='fit' && hasGoodPerformance`)를 만족한 영상이 없는 데이터 결과. 분류 자체는 라이브. 한 배치 양 attempt 최악 = 2×240s지만 5만+ 필터 후 통상 1배치(≤10) 1콜이라 실측 worst 125s로 여유. M8 ③ 후속 종료.

---

## 🟡 2026-06-10 — M5 후속 1: Reporting API 노출수·CTR 클라이언트 (리포트 대기중)

남은 후속 ①(노출/CTR)의 클라이언트·M5 배선·검증 완료. 리포트는 구글 비동기 생성 대기중(정상).

- **클라이언트**: `services/youtube/src/reporting/client.ts` `ReportingClient` — `listJobs`(GET /v1/jobs) · `listReports(jobId,{createdAfter})` · `downloadReport(url)`(Bearer CSV) · `collectImpressionsCtr(videoIds,{jobId?,createdAfter?})`(job 자동선택→최신 리포트→CSV 파싱→영상별 {impressions,impressionCtr}). `parseReachReport(csv)`는 channel_reach_basic_a1 CSV를 영상/날짜별 행으로(컬럼명 유연 매핑: video_id/date/impressions, CTR 직접컬럼 없으면 clicks/impressions 계산, 공식 스키마 기준 주석). `TokenManager` 재사용. index.ts에 export 추가(최소 diff).
- **M5 연결(무회귀)**: `performance-auto-mapping.ts` `mapAnalyticsToPerformanceInput`에 optional `reach:{impressions,impression_ctr}` 추가. 있으면 ctr/impressions 채우고 metrics_note 갱신(0~1 클램프), 없으면 기존대로 null + `IMPRESSIONS_UNAVAILABLE_NOTE` 유지.
- **검증**: reporting jest **10/10** + auto-mapping jest **9/9**(reach 케이스 3개 추가) + 양쪽 tsc 0. **라이브 listJobs로 job 확인**: `dee313e0-6d7e-4d61-92d8-8b5d00bd6558` type=`channel_reach_basic_a1` name=`l5-reach-basic`. **리포트 0건 — 구글 비동기 생성 대기중(정상, 실패 아님)**. 스크립트=`services/youtube/scripts/verify-live-reporting.mjs`.
- **남은 것**: 리포트 백필(보통 다음날)되면 실 노출/CTR 수신값 확인 + plugin 액션에서 collectImpressionsCtr→map reach 배선(현재 도메인/클라이언트까지만).

---

## 🟢 2026-06-10 — M8 완료 + M7 안정화: dist 재빌드·재기동·라이브 HTTP E2E·정리

이번 세션으로 M1~M8 전부 구현·검증·라이브. NocoBase에 신규 cmo 액션이 실반영됐다.

- **dist 재빌드 + 재기동**: `cd apps/nocobase-app && corepack yarn build @l5/plugin-orchestration`(pnpm/nocobase build는 packageManager=yarn 때문에 거부 — yarn 필수 함정). dist/plugin.js에 신규 심볼(runDiscovery 5·getRenderStatus 3·buildSlideDeckSpecFromBrief 2·submitRender 6·createUploadDraft 5) grep 확인 + `node --check` OK. `launchctl kickstart -k gui/$(id -u)/com.l5.nocobase` → `app:getInfo` **200** 즉시 복귀.
- **라이브 HTTP E2E PASS** (스크립트=`apps/founder-ui/e2e/m8-live-http-e2e.mjs`, `auth:signIn` admin→Bearer. NocoBase는 액션 `{ok,data}`를 `{data:{...}}`로 한 번 더 감싸므로 실 payload=`json.data.data` — 함정):
  - `cmo:sendBriefToFactory`(R6 경로) **200** → handoff_status=`sent`, stub=false, factory `briefs/1b0c2e9c….json` **실파일 생성 확인**.
  - `cmo:runDiscovery` **200** → 실 YouTube 검색+stats 라이브(provenance searched/stats=true), **후보 3개**(최고 112,661회, verdict=fit), discovery 카드 저장.
- **⚠️ Sonnet 분류 서버 폴백**: runDiscovery의 분류 스텝이 launchd 서버 컨텍스트에서 폴백(`classified=false`, "10개 영상 폴백(ambiguous)"). claude CLI cold-spawn/MCP-off 제약으로 추정. 셸 컨텍스트(`services/youtube/scripts/verify-live-discovery.mjs`)에서는 분류 라이브됨. 후보는 stats+폴백 verdict로 도출되어 200/후보 응답 자체는 정상. **후속: 서버 프로세스에서 claude CLI 분류 안정화 필요.**
- **M7 플레이키 안정화**: `key-content-draft.test.ts` "실측: 병렬 구간…" 테스트가 wall-clock 절대비교(`elapsed < STEP_DELAY*5`)라 전체 jest 동시 실행 시 CPU 경합으로 간헐 실패 → **라운드 수 직접 관측**으로 교체(in-flight 0 복귀 사이를 한 라운드로 묶어 `rounds<5` + `maxConcurrency>=2`). 절대 시간 비교 제거, 의도(병렬<순차 라운드) 보존. `npx jest video-room` **2회 연속 738/738 GREEN**.
- **정리**: `/tmp/cdp-*.mjs`+`oauth-token.json` 47개 → `/tmp/_archive/m8-cdp-tmp/`(핵심 로직 `services/youtube/src/{token,credentials,viewtrap/cdp}.ts` 이관 확인 후 — rm -rf 미사용, mv). M4 스모크 `jobs/l5-l5-m4-smoke.json`·`outputs/l5-m4-smoke/` 삭제. demo-3min 등 기존 산출물 보존 확인.
- **남은 후속**: ① Reporting API(`channel_reach_basic_a1`) 노출수/CTR 노출. ② Viewtrap CDP 라이브 크롤링 서버 배선(현재 scrape 서버 미주입). ③ runDiscovery Sonnet 분류 서버 컨텍스트 안정화.

---

## 🟢 2026-06-10 — M1~M3 통합 완료: 발굴→크롤링→분류 파이프라인 + 키/풀링 Step 변환

키 Step8 + 풀링 Step5/8의 "viewtrap 검증·선정이유"를 LLM 추측/수동입력 → 실데이터 파이프라인으로 교체 가능하게 배선.

- **도메인(순수, 어댑터 주입)**: `l5-core/video-room/discovery-pipeline.ts`(신규). `runDiscoveryPipeline(input, deps)` — ① searchVideos ② getVideoStats+5만+필터 ③ (옵션)scrapeMetrics 병합 ④ classify(M3 classifyDiscoveredVideos, Sonnet) ⑤ candidate_basis(fit+성과좋음) 후보. **단계별 실패 = 그 단계만 폴백**(search 실패만 빈 결과 종료), `provenance{searched,stats,scraped,classified,notes}`에 실데이터 소스 기록.
- **변환(cross-step 규약 통과)**: `toKeyViewtrapValidationInput`→`buildViewtrapValidation`(키 Step8) · `toPullingViewtrapValidationInput`→`buildPullingViewtrapValidation`(풀링 Step5) · `toLongtailCandidateInputs`→`findLongtailEvergreen`(풀링 Step8 노다지) · `buildSelectionReason`(조회수·성과도·기여도·노출확률 실측 + 분류 사유). 등급은 6→3등급 환산(wow·great→great), growth_status='unknown'(테이블에 성장신호 없음 — 추측 금지).
- **실어댑터 조립**: `services/youtube/src/discovery/deps.ts` `createLiveDiscoveryDeps({client, viewtrapAdapter?, classify})`. search/stats=YouTubeClient 위임, scrapeMetrics=viewtrap 어댑터 selection_reason 파싱(없으면 키 자체 생략), classify 주입. @l5/youtube는 l5-core 비의존 유지(미러 타입).
- **플러그인 액션**: `cmo:runDiscovery {project_id, query, mode?='key'|'pulling', search_keyword?, validated_keywords?}` — @l5/youtube ESM **dynamic import**(require 불가 함정) + `createClaudeCLIClient({model:'sonnet'})` 분류 주입 → 파이프라인 실행 → `discovery` 카드 저장 + viewtrap_validation 초안/longtail 입력 반환. ACL 추가. CDP scrapeMetrics는 서버 미주입(로그인 크롬 전제).
- **검증**: l5-core tsc 0 + discovery-pipeline jest **11/11** + youtube jest 40/40 + video-room 무회귀(737/738, 실패 1=사전존재 wall-clock 플레이키, 격리 시 통과). **라이브 부분 파이프라인 1회 PASS**: 실 검색 "인스타그램 릴스 만드는 방법" 15건→5만+ 8건→실 Sonnet 분류 8건 fit(최고 272,415회), 실데이터 선정이유 생성. 스크립트=`services/youtube/scripts/verify-live-discovery.mjs`.
- **배포 메모**: l5-core dist + youtube dist + plugin dist(`corepack yarn build @l5/plugin-orchestration`) 재빌드 완료. **NocoBase 재기동 필요(미실행 — 오케스트레이터 일괄)**. dist 경로(`../../../../../../../`)는 `dist/plugin.js` 기준 repo root 해석 확인.

---

## 🟢 2026-06-10 — M5 완료: 성과 자동 수집 (Analytics → 재학습 ingest)

수동 성과 입력을 OAuth 자동 수집으로 대체. 수동 경로는 폴백으로 유지(동일 ingest 함수).

- **수집 러너**: `services/youtube/src/performance/collect.ts` — `collectVideoPerformance(client, {startDate,endDate,videoIds?,maxResults?})`. Analytics v2 `dimensions=['video']`+`sort=-views`로 영상별 views/estimatedMinutesWatched/averageViewDuration/averageViewPercentage/subscribersGained 수집. 폴백 사다리: ①전체메트릭 ②핵심메트릭 축소(400 시) ③채널 합계(video 디멘전 실패 시 `scope='channel'`+사유). index.ts에 export 추가(최소 diff).
- **매핑(l5-core 순수함수)**: `performance-auto-mapping.ts` — `parseVideoAnalyticsRecords(records)`→`VideoAnalyticsMetrics[]`, `mapAnalyticsToPerformanceInput({project_id,metrics,range})`→기존 `RecordVideoPerformanceInput`. completion_rate=averageViewPercentage/100(0~1 클램프), retention_notes에 `[자동수집:YouTube Analytics …]` 출처 표기. l5-core는 @l5/youtube 비의존(caller가 records 전달).
- **노출/CTR 제약 반영(M2 실측)**: ctr/impressions=null 고정 + `metrics_note`에 사유(Reporting API `channel_reach_basic_a1` 활성화 후 채움). `performance-ingestion.ts` 스키마는 이미 nullable이라 수정 없음 — completion_rate/ctr `.nullable()`, summary는 null이면 '미수집' 표기.
- **검증**: l5-core auto-mapping jest **6/6** + youtube collect jest **4/4** + 양쪽 tsc 0. **라이브 1회 실수신**(디립다 28일 2026-05-13..06-10): `scope=video`(폴백 불필요), 영상 2건 — `r87S8a0SclA` 조회 1391·시청 222분·평균21초·완료율 30.18%, `z8ZlhPym1SM` 조회 4·완료율 22.66%. 동일 records를 빌드된 dist로 parse→map→`recordVideoPerformance`까지 통과 확인(summary "조회수 1,391 · 완료율 30% · CTR 미수집", ctr/impressions=null+note set).
- **메모**: 라이브 스크립트 = `services/youtube/scripts/verify-live-collect.mjs`(신규). l5-core dist는 이번 검증에 사용한 빌드 기준 최신. 폴백 사다리 ②③은 라이브 미발동(unit test로 커버).

---

## 🟢 2026-06-10 — M4 완료: 영상 제작 파이프라인 마감 (렌더 이후 구간)

Brief 전달(R6) 이후가 전부 연결됨. 도메인은 전부 `l5-core/src/functions/video-room/render-pipeline.ts`(신규), plugin은 배선만.

- **brief 직접참조 슬라이드덱**: `buildSlideDeckSpecFromBrief(brief, ids)` — 인트로(intro_30s)+논리블록별+브릿지 슬라이드, visual_intent_hint→visual_type 추론, format→aspect_ratio.
- **렌더 잡 push**: `buildFactoryJobFromSlideDeck`(슬라이드→ScriptBeat→buildFactoryVideoJob, 길이=글자수/5.5s 클램프[3,20]) → transport.submitJob이 `${VIDEO_FACTORY_DIR}/jobs/`에 기록+validate. 렌더 실행 자체는 factory 쪽 `npm run render`(사람/오케스트레이터, 수 분).
- **상태 폴링(파일 프로토콜, briefs/와 대칭)**: transport `getRenderJobStatus(slug)`가 jobs/·outputs/<job.slug>/ 파일 사실만 수집 → l5-core `deriveRenderJobStatus`(queued/rendering/completed/failed/not_found) + `reconcileRenderJob`(RenderJob 상태머신 반영). 에러 마커 = outputs/<slug>/render_error.txt(옵션).
- **영상 QA**: `evaluateRenderArtifacts` — video.mp4 존재·비0바이트, render_report 파싱, totalSeconds 범위, 해상도-format 일치, youtube_metadata 존재.
- **업로드 초안만**: `buildYoutubeUploadDraftFromBrief` — 제목/설명/태그를 brief에서 결정론 생성, visibility=private·approval=pending 강제. **실제 업로드 없음(승인 게이트)**.
- **plugin 액션**: `cmo:buildSlideDeck`(slides 미입력 시 최신 brief 우선, 폴백 script_draft) · `cmo:submitRender`(실 factory면 잡 push+queued→rendering, 미설정 시 기존 심 폴백) · `cmo:getRenderStatus`(**신규**, ACL 추가) · `cmo:createUploadDraft`(title 미입력 시 brief 자동초안).
- **검증**: render-pipeline jest **21/21**, l5-core 전체 134 suites GREEN(실패 4는 사전존재 model-routing), tsc 0. **실 렌더 E2E PASS**: R6 brief→슬라이드덱 4장→잡 validate→`queued`→(remotion 실렌더 중)`rendering`→(완료, 80s/6.9MB)`completed`→QA 전항목 pass→RenderJob reconcile completed. 없는 slug→`not_found`, demo-3min(기존 실산출물)→`completed`+QA pass. E2E 산출물 = factory `jobs/l5-l5-m4-smoke.json` · `outputs/l5-m4-smoke/`(M8 정리 대상).
- **배포 메모**: l5-core dist 재빌드 완료 + plugin dist 재빌드 = `cd apps/nocobase-app && corepack yarn build @l5/plugin-orchestration` (corepack pnpm은 packageManager=yarn이라 거부, dist는 gitignore). **NocoBase 재기동 필요(미실행 — 오케스트레이터 일괄)**.

---

## 🟢 2026-06-10 — M2 완료: YouTube API 발굴 어댑터 (`services/youtube/`, @l5/youtube)

- **구현**: `src/credentials.ts`(자격증명 로드, 내용 비노출 에러) · `src/token.ts`(`TokenManager` — refresh_token→access_token 인메모리 캐시, 만료 60초 전 갱신) · `src/client.ts`(`searchVideos`=search.list, `getVideoStats`=videos.list 50개 청크, `getChannelAnalytics`=Analytics v2 + Bearer) · `src/filters.ts`(`filterByMinViews` 5만+).
- **검증**: `npx tsc --noEmit` OK · jest 10/10 (mock fetch) · `node scripts/verify-live.mjs` 실수신 — 검색 "인스타그램 릴스 만드는 방법" 15건 → 5만+ 8건(최고 272,415회), 디립다 28일 조회 1395·시청 225분·평균 21초·구독+1.
- **⚠️ 노출수·CTR 실측 정정**: targeted Analytics API는 썸네일 노출/CTR **미지원**(`impressions`=Unknown identifier, `videoThumbnailImpressions*`=전 조합 400). 유일 경로 = Reporting API reach report(`channel_reach_basic_a1`, 2026-01-15 추가) → GCP에 `youtubereporting.googleapis.com` 활성화(현재 SERVICE_DISABLED) + job 생성 + 비동기 ~48h. M5에서 배선.
- 에러 메시지에 API 키/토큰/응답본문 비노출(쿼리스트링 strip). `.credentials.json` gitignore 확인(`git check-ignore` PASS).

---

## 🟢 2026-06-10 — YouTube/Viewtrap 발굴 자동화 실증 + API 자격증명 발급

오늘의 핵심 돌파: **"Viewtrap 자동화는 OAuth·인메모리 인증으로 불가"였던 게, 이미 로그인된 실제 크롬 프로필을 CDP로 운전하는 방식으로 뚫림.**

**실증 완료 (코드 아직 미배선, 검증만):**
- **CDP로 로그인 크롬 운전**: 양우나 프로필(Profile 2) 복사 → 디버그 포트 → Playwright `connectOverCDP`. 화면 밖(−4000px)에서 작동, 세션 유지. 함정: Chrome 136+는 기본 user-data-dir로 디버깅 거부 → 복사본 디렉토리 필수.
- **Viewtrap 사이트 테이블 크롤링**: `<tr>` 행에서 제목·조회수·기여도·성과도·노출확률·게시일 + 썸네일 videoId. 5만+ 필터 동작.
- **YouTube 검색결과 확장 크롤링**: Viewtrap 확장이 shadow DOM에 `<dt>기여도</dt><dd>Good</dd>` 주입 → deepWalk로 영상별 추출. 등급순 `Wow > Great > Good > Normal > Bad > Worst`.
- **인사이트 실증**: 57,000회=성과도 Worst vs 270,000회=Good. 조회수만으론 못 가리는 걸 지표가 가려줌.

**YouTube API 자격증명 발급 (CDP로 GCP 콘솔 운전):**
- 프로젝트 `youtube-data-api-dripda`, YouTube Data API v3 + Analytics API 활성화.
- **API 키** 발급+검증(search.list 작동). **OAuth Desktop 클라이언트** + **refresh_token** 발급.
- 저장 = `services/youtube/.credentials.json` (gitignore, 권한 600).
- **검증된 비공개 데이터**: 채널 "디립다 dripda"(firstpulk0543, 구독 1/조회 1395/영상 3) — Analytics로 조회수·시청시간·구독증감 실수신. ~~노출수·CTR도 같은 토큰으로 가능~~ → M2 실측: targeted API 미지원, Reporting API reach report 필요(위 M2 섹션).
- 상세·재현법 = [features/youtube-viewtrap-discovery](./features/youtube-viewtrap-discovery.md).

**기획 확정 (HTML 보고서):**
- 발굴 워크플로우: YouTube 발굴 → 확장 1차거름(기여도·성과도) → Sonnet 의도분류 → Viewtrap 노출확률(제목행 버튼·다건) → 후보.
- 필터 기준: 조회수 5만+ · 성과도 good·great · 기여도 good·great · 노출확률 normal·good·great.
- 노출확률은 watch 1건씩 ✗ → 주제 추려지면 Viewtrap 검색 후 제목행 버튼으로 다건 확인.

**남은 것 → [TASKS.md](./TASKS.md) M1~M3** (발굴 배선/Sonnet 분류). 오늘 건 실증·자격증명까지, 코드 배선은 미착수.

---

## 🟢 R1~R7 콘텐츠 파이프라인 (커밋 완료, E2E 19/19)

이전 작업. 입력→키콘텐츠→풀링→제작→Brief→실Factory전달→성과까지 전 구간 연결·커밋·E2E 통과. 상세 커밋: `8e48cfb`(R4~R7) · `304ad73`(R6 실factory) · `6987561`(E2E 19/19) · `af7bc0a`(R5 Viewtrap 심).

**단계별 상태:**
- ② 키 콘텐츠: 11스텝 자동초안 + 3후보 + 선정이유4종 + HTML보고서 → **라이브 검증**.
- ③ 풀링: 12스텝 + N후보 + 선정이유4종 → **라이브 (R1)**.
- ④ 콘텐츠 제작: 제목/썸네일/원고 보드+액션 → **구현완료 (R4)**.
- ⑤ 영상 제작: 패키지→Brief→**실 factory 인박스 전달**(briefs/<slug>.json, stub=false 라이브). **잔여**: 슬라이드덱 brief 직접참조, submitJob 렌더, getRenderJobStatus 폴링, QA, 업로드.
- ⑥ 성과 재학습: 코드·UI 완료, **성과 입력 수동** → 이제 OAuth로 자동화 가능(M5).

**기존 잔여(코드 기준):**
- Viewtrap 실 연동: `reference-adapters.ts`는 어댑터 심만 → 오늘 CDP 방식으로 실제 가능 입증, 배선은 M1.
- 텔레그램 알림: **M6 완료(2026-06-10)** — NocoBase launchd plist에 TELEGRAM_BOT_TOKEN/CHAT_ID 주입·재기동 확인, getMe ok + 테스트 발송 성공, hermes plist chat_id 일치.
- 속도: 키 초안 LLM 순차 ~178~218초, step2‖step3 병렬은 됨(M7).

---

## 환경/함정 메모

- CDP 운전: 크롬은 같은 프로필 동시 2개 불가 → 평소 크롬 종료 후 복사 디렉토리(`~/chrome-cdp`)로 디버그 기동.
- Viewtrap 인증 인메모리 → 로그인 탭 새로고침 금지(로그아웃됨). in-app 조작만.
- GCP 콘솔 org policy: API 키 생성 시 API restriction 강제 선택. OAuth Testing 모드는 test user 등록 필수(firstpulk0543).
- 새 GCP UI는 client_secret 재조회 불가 → 생성 시 즉시 저장(또는 secret 추가로 재발급).
- Playwright `connectOverCDP`는 download 이벤트/context 관리 일부 미지원 → secret은 클립보드 복사로 우회.

## 실증 스크립트 (임시, /tmp)

`/tmp/cdp-*.mjs` (CDP 크롤링·OAuth 플로우), `/tmp/oauth-token.json`(토큰 원본). 정식 배선 시 `services/youtube/`로 이관 — [TASKS.md](./TASKS.md) M2.
