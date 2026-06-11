# 기능 — YouTube/Viewtrap 콘텐츠 발굴 자동화

> CMO 라우터 = [../CLAUDE.md](../CLAUDE.md) · 상태 = [../HANDOFF.md](../HANDOFF.md) · 계획 = [../TASKS.md](../TASKS.md) (M1·M2·M3).
> 이 문서 = 발굴 자동화의 **기술 재현법 + 자격증명 + 셀렉터**. 코드 배선은 TASKS M1~M3.

## 목적

키/풀링 콘텐츠 기획에서 "타깃이 실제로 보고 실제로 터진 주제"를 찾는다.
**발굴 = YouTube(검색 한도 없음), 지표 검증 = Viewtrap(한도 있음).** 분류 = Claude Sonnet.

## 전체 흐름

```
① YouTube 검색(API)      → 제목·썸네일·조회수 (한도 없음)
② Viewtrap 확장(검색결과) → 기여도·성과도 1차 거름
③ Sonnet 분류            → 같은 타깃인가 / 판매논리 녹는가 / (풀링)키 브릿지
④ Viewtrap 노출확률      → 추려진 주제만, 제목행 버튼 클릭, 다건 확인
⑤ 후보 산정             → 제목·썸네일·지표 실데이터 근거 → 사장님 선택
```

필터: **조회수 5만+ · 성과도 good·great · 기여도 good·great · 노출확률 normal·good·great.**

## 자격증명 (services/youtube/.credentials.json)

gitignore·권한 600. 절대 커밋 금지. 구조:
```json
{ "project_id":"youtube-data-api-dripda",
  "api_key":"AIza...",
  "oauth":{ "client_id":"...apps.googleusercontent.com","client_secret":"GOCSPX-...",
            "refresh_token":"1//0e...","token_uri":"https://oauth2.googleapis.com/token",
            "scopes":["yt-analytics.readonly","youtube.readonly","youtube.upload"] },
  "channel":{ "title":"디립다 dripda","owner":"firstpulk0543@gmail.com" } }
```
발급 경위: CDP로 GCP 콘솔 운전(2026-06-10). YouTube Data API v3 + Analytics API 활성화.

### access_token 갱신 (refresh_token → 1시간짜리 토큰)
```
curl -s -X POST https://oauth2.googleapis.com/token \
 -d client_id=$CID -d client_secret=$CSEC \
 -d refresh_token=$RT -d grant_type=refresh_token
```

## YouTube Data API (API 키)

### 검색 (search.list) — 발굴
```
GET https://www.googleapis.com/youtube/v3/search
   ?part=snippet&q=<문장 OK>&type=video&maxResults=N&key=$API_KEY
```
- 문장 검색 가능("인스타그램 릴스 만드는 방법"). 타깃 수식어 결합 불필요(분류는 ③에서).
- 반환: videoId, title, channelTitle, thumbnails. 조회수는 videos.list로 별도.

### 통계 (videos.list)
```
GET .../youtube/v3/videos?part=statistics,snippet&id=<id,id,...>&key=$API_KEY
→ viewCount 등. 5만+ 필터는 클라이언트에서.
```

## YouTube Analytics API (OAuth, 비공개) — M5 핵심

채널 소유자 토큰으로 비공개 지표. `Authorization: Bearer <access_token>`.
```
GET https://youtubeanalytics.googleapis.com/v2/reports
   ?ids=channel==MINE&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   &metrics=views,estimatedMinutesWatched,averageViewDuration,subscribersGained
```
- 검증됨(디립다): 28일 조회 1395·시청 225분·평균 21초·구독+1.
- **노출/CTR ✗ (2026-06-10 실측 정정)**: targeted-query API는 썸네일 노출/CTR **미지원**. `impressions`는 "Unknown identifier", `videoThumbnailImpressions`/`videoThumbnailImpressionsClickRate`는 식별자는 인식되나 모든 쿼리 조합이 400 "query is not supported". 노출/CTR은 **Reporting API(벌크) reach report**(`channel_reach_basic_a1`, 2026-01-15 추가)로만 가능 → ① GCP 프로젝트에 `youtubereporting.googleapis.com` 활성화 필요(현재 비활성, SERVICE_DISABLED 확인) ② job 생성 후 데이터 비동기 생성(최대 ~48h). M5에서 배선.
- 트래픽 소스: `dimensions=insightTrafficSourceType`. 검색 유입어: `dimensions=insightTrafficSourceDetail&filters=insightTrafficSourceType==YT_SEARCH`.
- 내 채널 확인: `youtube/v3/channels?part=snippet,statistics&mine=true`.

## CDP 크롬 운전 (Viewtrap 크롤링 전제)

Viewtrap은 API 없음 → 로그인된 크롬을 CDP로 운전해 화면 크롤링.

### 기동 (함정 주의)
- 크롬 136+는 **기본 user-data-dir로 원격 디버깅 거부** → 프로필 복사본 필요.
  ```
  # 평소 크롬 종료 후 (같은 프로필 동시 2개 불가)
  rsync -a --exclude='Cache/'... "~/.../Chrome/Profile 2/" ~/chrome-cdp/Default/
  "Google Chrome" --remote-debugging-port=9222 --user-data-dir=~/chrome-cdp
  ```
- Playwright 연결: `chromium.connectOverCDP('http://localhost:9222')`, `browser.contexts()[0]`.
- 화면 숨기기: `osascript ... set bounds of window 1 to {-4000,0,-2400,900}` (세션 유지).
- playwright는 nocobase-app node_modules. `createRequire('apps/nocobase-app/')`.

### 주의
- Viewtrap 인증은 인메모리 → **로그인 탭 새로고침/재이동 금지**(로그아웃). in-app 클릭/타이핑만.
- `connectOverCDP`는 download/일부 context API 미지원 → AppleScript로 탭 URL 읽기, 클립보드(`pbpaste`)로 우회.

## Viewtrap 셀렉터 (실측)

### 사이트 테이블 (app.viewtrap.com/video-search)
- 검색창: `input[name="search"]` (placeholder "단어 또는 문장 입력").
- 결과 행: `table tbody tr`. 컬럼: 선택·CC·썸네일(길이)·제목·조회수·구독자/채널·기여도·성과도·노출확률·총영상수·게시일.
- 썸네일 img src `i.ytimg.com/vi/<videoId>/...` → videoId 추출.
- **노출확률은 행의 버튼 클릭해야 로드**(기본 "-"). 주제 추려진 후 다건 확인용.

### YouTube 검색결과 확장
- 확장이 각 영상에 shadow DOM `<dt>기여도</dt><dd>Good</dd>` 주입.
- deepWalk(shadowRoot 재귀)로 `ytd-video-renderer` 단위 [제목·조회수·기여도·성과도] 묶기.
- 등급순: **Wow > Great > Good > Normal > Bad > Worst.**
- watch 페이지 패널(노출확률·성장속도)도 버튼 클릭 필요 → 비효율, 사이트 테이블 다건이 나음.

## 라이브 배선 완료 (2026-06-10) — raw CDP 정식 이식

3단계 발굴 흐름을 `services/youtube/src/viewtrap/` + `discovery/deps.ts`로 정식 이식·라이브 검증 완료.

### raw CDP (connectOverCDP 폐기)
- **크롬 149는 `connectOverCDP`가 `Browser.setDownloadBehavior`를 거부**해 실패 → playwright 미사용.
- `cdp.ts` `connectCdp()`: `/json/list`의 `webSocketDebuggerUrl`에 WebSocket 직접 + `Runtime.evaluate`.
  page 타겟마다 세션. 탭 0개면 `PUT /json/new`. **연결 직후 모든 창을 `Browser.setWindowBounds {left:-4000}`** (화면 점유 금지, 규칙 50). node 18+ 전역 `WebSocket`(폴백: nocobase-app `ws`).

### 2단계 — YouTube 확장 deepWalk (라이브 실수신 OK)
- `scrapeYoutubeSearchExtension()`: `ytd-video-renderer`별 shadowRoot 재귀 수집 후 `기여도/성과도/노출` 정규식 매핑. **innerText로는 안 잡힘 → shadowRoot 필수.**
- 실측: "AI로 돈벌기" 15카드 전부 등급추출, Good+ 8. "릴스 편집" 11/11. "부동산 경매" 12·Good+3.
- 조회수는 **영문 로케일도 처리**("6.5M views"/"1.2K views" → `parseViews` K/M/B). 한글 "조회수 27만회"도.
- 영상별 per-video 어댑터 = `createExtensionScraperAdapter(session)`. **대부분의 거름은 여기서.**

### 3단계 — Viewtrap 사이트 테이블 + 노출확률 (제약 실측)
- 컬럼(11열): [3]제목 [4]조회수 [6]기여도 [7]성과도 [8]노출확률 [10]게시일. videoId = 썸네일 `i.ytimg.com/vi/<id>/`.
- **가상화(virtualization) 제약**: 테이블은 41행이어도 **렌더된 썸네일은 viewport 6행분뿐**. 나머지 행은 `<img>`/href 없음 → videoId 추출 불가(스크롤로도 미해결, 텍스트 등급은 41행 전부 존재). 따라서 사이트 path는 **상단 ~6개 영상의 노출확률만 videoId로 매칭**한다. 영상별 권위 소스는 2단계.
- **노출확률 헤더 버튼 1회 클릭 → 확인 모달 → ~14s 후 전 행 동시 로드(다건).** `clickExposureProbability`가 처리. 이미 로드돼 있으면(셀이 모두 채워짐) 재클릭 안 함(신용 절약).
- **프로그래밍 재검색 = 해결(2026-06-10)**: 이전엔 "트리거 불가"로 판단했으나 **원인은 확인 모달을 안 눌렀던 것**. viewtrap 검색은 검색어 입력 후 실행하면 **"이용횟수가 차감되며 검색이 진행됩니다. '<키워드>'(으)로 검색하시겠습니까?" 확인 모달**이 뜨고, **모달의 "확인" 버튼(`innerText==='확인'`)을 클릭해야** 실제 검색이 진행된다. 확인 후 **~20초** 뒤 결과 테이블 갱신(첫 행 `td:nth-child(4)` 변화로 감지). 흐름: `fill`(native setter) → `press(Enter)`(안 먹으면 bg-primary-300 버튼 클릭) → **확인 모달 대기→"확인" 클릭** → 첫 행 변화 폴링(최대 30s). `scrapeVideoSearchTable`이 처리(`clickSearchConfirm`/`waitForResultChange`). 실측 성공: "숏폼 편집" → 20초 후 갱신.
- **`alreadyOnQuery` 가드 유지**: `input[name="search"].value`가 같고 테이블이 차 있으면 재검색 안 함(이용횟수 차감 절약). 재검색/새로고침/이동 금지 — 인메모리 인증 보호.

### 배선 (deps.ts)
- `createLiveDiscoveryDeps({ client, extensionAdapter?, viewtrapAdapter?, classify? })`:
  - `searchVideos`/`getVideoStats` = `@l5/youtube` 클라이언트(1단계, API).
  - `scrapeMetrics` = **2단계 extension(우선) + 3단계 viewtrap exposure 보강** 병합(videoId 키). 둘 다 없으면 키 자체 생략(단계 스킵).
  - `classify` = 주입된 Sonnet(미주입 시 pipeline 결정론 폴백).
- l5-core `runDiscoveryPipeline` deps 인터페이스(`scrapeMetrics?`)에 맞춰 주입. **l5-core 무수정.**

### 라이브 통합 검증 (2026-06-10, 화면 밖)
- `createLiveDiscoveryDeps` → `runDiscoveryPipeline`("부동산 경매") 1회: provenance 전부 true, 10영상 분류, **최종후보 3건**(183K/1M/2.9M 조회수, 기여/성과 good 실측 metrics). API 쿼터/LLM 비용 절약 위해 search/stats/classify는 실 videoId 기반 stub, scrapeMetrics만 라이브.

### 검증 명령
- `cd services/youtube && corepack pnpm test`(60 통과) · `corepack pnpm typecheck`(0) · `corepack pnpm build`.
- 단위테스트: `viewtrap.test.ts`(파싱/필터/변환/deepWalk 노이즈/영문조회수 + **검색 확인모달 클릭 / alreadyOnQuery 스킵**), `discovery-deps.test.ts`(2+3단계 병합).

## 다음 (배선)

- M2: 위 API들을 `services/youtube/` 클라이언트로. → [../TASKS.md](../TASKS.md). (완료)
- M1: CDP 크롤링을 정식 어댑터로(`reference-adapters.ts` scraper 주입). (라이브 완료)
- M3: Sonnet 분류 엔진. 키/풀링 Step에 통합.
- 잔여: viewtrap 사이트 가상화로 상단 ~6개만 videoId 매칭(2단계가 보완). 프로그래밍 재검색은 **해결**(확인 모달 "확인" 클릭으로 코드 트리거 가능, ~20초) — 단 이용횟수 차감되니 `alreadyOnQuery` 캐시 우선.
