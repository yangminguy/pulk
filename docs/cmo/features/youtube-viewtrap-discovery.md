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

## 다음 (배선)

- M2: 위 API들을 `services/youtube/` 클라이언트로. → [../TASKS.md](../TASKS.md).
- M1: CDP 크롤링을 정식 어댑터로(`reference-adapters.ts` scraper 주입).
- M3: Sonnet 분류 엔진. 키/풀링 Step에 통합.
