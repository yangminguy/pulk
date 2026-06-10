# CMO — HANDOFF (현재 상태)

> 최종 업데이트: 2026-06-10. 라우터 = [CLAUDE.md](./CLAUDE.md). 다음 계획 = [TASKS.md](./TASKS.md).
> 300줄 넘으면 오래된 항목을 `docs/archive/`로 이관하고 요약만 남긴다.

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
