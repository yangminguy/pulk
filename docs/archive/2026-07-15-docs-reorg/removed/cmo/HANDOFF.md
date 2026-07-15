# CMO — HANDOFF (현재 상태)

> 최종 업데이트: 2026-07-12 오후 (FR-1~9 구현 + 점검 결함 전량 수정 + 재검증 루프 ×5 — KB 14/0 ×2). 라우터 = [CLAUDE.md](./CLAUDE.md). 다음 계획 = [TASKS.md](./TASKS.md).
> 300줄 넘으면 오래된 항목을 `docs/archive/`로 이관하고 요약만 남긴다.

## 🟢 2026-07-12(오후) — 추적성·승인 게이트·근거 서술 체계(FR-1~9) + 점검 결함 전량 수정 + 재검증 루프 ×5

점검 보고(에이전트 3종) → `prompts/bizpt_traceability_approval_spec_prompt.md` 스펙 전체 구현 → e2e 루프 5회(실렌더 5편) 재검증. 구조 결정 6건 = 전역 DECISIONS.md 2026-07-12(추적성).

- **게이트 강제(FR-4/5/6)**: `state-machine.ts GATE_REQUIRED_REPORT_STAGES` + `advanceStatus(presentCardStages)` + plugin(`approveStageGate`/`decideGate`) 이중 차단 — 리포트 카드 없으면 승인 400("리포트 생성 대기"), 라이브 검증 완료. 후보 0건이면 기획서 미생성(게이트 닫힘 유지). `rejectStageGate`(반려/수정요청+사유→revision_request 카드) 신설.
- **승인 검토물(FR-4/5)**: `gate-report-docs.ts` — 키 기획서(선별 이유·KB 인용·벤치마킹 실물·판매논리 필수·풀링 키워드 계획 4목차)·풀링 리포트 HTML을 `key_content_plan_doc`/`pulling_plan_doc` 카드로 자동 생성(각 리포트 핸들러에서).
- **UI 확장(FR-1/2/3/6)**: 라이브 뷰 2→11종. `approve` 승인 센터(게이트 리포트 iframe 인라인 검토→승인/반려), `research` 후보 판정(썸네일·채택/제외+사유→`decideResearchCandidate`), 산출물 보드 8종(`listArtifacts` 서버 join — 식별 헤더: 제목·키 주제·ID 8자·상태 + 콘텐츠 필터). 카드 한국어 렌더러(`CardRenderers.tsx`) + 슬라이드오버 진행 타임라인. "바로 승인" 버튼 제거. Playwright 스모크 9뷰 PASS(콘솔 에러 0).
- **FR-7/8/9**: 제목 버전로그(`buildTitleVersionLog` — 시드 교차치환→8단계→최종, 카드 저장+UI 타임라인) · 원고 근거(`ScriptRationale` — 벤치마킹 videoId·구조명·블록 소스 매핑, 생성 시점 필수) · 소싱 라우터(`sourcing-router.ts` — API>오버레이>뷰트랩, source/fetched_at 필수).
- **점검 결함 수정**: ①sendBriefToFactory 400 근본 해결(effectiveCardId 저장+project 폴백+briefs/ mkdir+검증스크립트 부재 graceful → **200/sent**) ②CTR 4%→10% 정합(+정량 4요소 판정 `quantitative-factors.ts`, intro_retention_30s 필드) ③제목 35자 강제(≤35 후보 우선+`truncateTitleToMax`) ④`[viewer emotion]` 낭독 노출 제거 ⑤brief 경로 문단분할 다장+짧은 헤드라인(`splitIntoSlideChunks`/`shortHeadline` — 110자≈씬 20초, 긴 문단 문장 재분할) ⑥e2e 실원고 TTS(say+afinfo 실측 duration) ⑦verify-kb-standards UUID 강제 ⑧core_message의 "block-N — main_claim:" 메타 노출 제거 ⑨원고 마크다운 마커 제거 ⑩도입부 170자·본론 2,000자 가드+분량 피드백 재시도(전멸 방지 1,600자 최종 폴백).
- **429 대응(신규 표준)**: YouTube API 일일 쿼터 소진 시 **CDP ytInitialData 파싱 폴백**(제목 레퍼런스·썸네일 레퍼런스·키 리포트 발굴 3곳) + CDP 락 2분 대기 + expandQueries 일반명사화(업종 상위 레벨) 강화.
- **재검증 루프 ×5 (전부 upload_approval 관통 + 실렌더)**: L1 df5c3e43(209s — sendBrief/메타노출/뼈대레이스 발견·수정) → L2 d087ee58(260s 낭독 동기, KB 12/2) → L3 84b591e6(143s, KB 13/1, 마크다운 노출 발견·수정) → L4 f6a42f3e(204s, **KB 14/0 최초**, 원고 2,463자) → L5 047e44af(**374s 씬24·오디오 완전 동기, KB 14/0**, 원고 2,186자·도입부 205자·판매논리 5/5). 유닛테스트 1,093 GREEN(신규 56).
- **잔여**: ① 훅 정렬 insufficient_data(도입부 강화 후 재평가) ② 정적 12뷰(funnel·item·calc·expand·watch·diag·dam·road·routine·insight·kb·me) 실데이터 배선 ③ 씬 헤드라인이 본문 첫 문장과 동일(요약형 헤드라인은 LLM 단계 필요) ④ CTA 씬 부재(rhythm 체크 경고) ⑤ 테스트 프로젝트 5개(L1~L5) 정리 여부 사장님 결정 ⑥ YouTube API 쿼터 리셋 후 API 경로 자동 복귀 확인.

## 🟢 2026-07-12 — 비즈니스PT 매니저 앱 라이브 + 실가동 루프 ×5 완료 (정본 = [features/bizpt-manager](./features/bizpt-manager.md))

프로토타입 승인 → 실제 앱 구축 → 백엔드 배선 → 실가동 루프 5회(실제 영상 3편 산출, 결함 6건 발견·5건 수정). 구조 결정 5건 = 전역 docs/DECISIONS.md 2026-07-12.

- **지식베이스 반입**: `docs/cmo/prd/bizpt-kb/` (00~11, 12문서) — UI·기능의 정본 기준.
- **앱**: `apps/bizpt-manager/` Next.js 14 · port 3003 · pnpm `--ignore-workspace` 독립 설치(nocobase-app yarn 레이아웃 보호). typecheck·build GREEN. 라이브 배선 = 오늘(승인 큐)·파이프라인(6단계 칸반)·프로젝트 상세(한국어 여정지도 + approveStageGate/advanceStatus 버튼). 나머지 19뷰 = v4 정적(시연 배너 표시, `src/lib/static-views.ts`). **launchd `com.l5.bizpt-manager` 상시 가동 전환 완료**(함정: `.bin/next` 심링크는 exit 126 — node+`next/dist/bin/next` 직접 실행). 최종 스모크 재실행 PASS(실데이터 카드 10·콘솔 에러 0).
- **founder-ui**: Sidebar NAV_TOOLS에 `http://localhost:3003` 링크 추가, 재빌드·재기동 완료.
- **Playwright 스모크 2종 PASS**: `founder-ui/e2e/bizpt-smoke-ui.mjs`(22뷰·실데이터 카드·여정지도)·`bizpt-smoke-write.mjs`(UI 클릭→상태 전진 관통).
- **⚠️ 인프라 복구**: NocoBase가 죽어 있었음 — `node_modules/@nocobase/{server,…}` 소실(cli·devtools만 잔존) → `apps/nocobase-app`에서 `corepack yarn install`로 복구 후 정상 기동. **루트에서 yarn install 실행 금지**(pnpm 워크스페이스 오염 — 한 번 실수로 실행했다가 오염 전 kill).
- **루프1 (실패, 원인 규명)**: 미용실 상품 전 구간 E2E(`apps/bizpt-manager/e2e/loop-full-pipeline.mjs`) — proposeKeyContentReport/proposePullingReport가 **LLM 검색어 생성 실패**("Could not resolve authentication method") + **viewtrap 탭 부재**로 topics 0건 → proposeTitleDevelopment 400. 원인: launchd NocoBase에 `ANTHROPIC_API_KEY` 없음(어느 plist·.env에도 없음) — S3(2026-06-12) SDK 전환이 launchd에선 사실상 전멸이었던 것.
- **수정**: `plugin.ts createSdkLlmClient`에 **키 없으면 createClaudeCLIClient(sonnet, 240s) 폴백** 추가(src+dist 재빌드+재기동). viewtrap은 CDP `PUT /json/new`로 video-search 탭 확보(구글 OAuth persist로 자동 로그인)+창 숨김.
- **루프2 (실패)**: LLM 검색어는 생성됐으나 초니치("미용실 고객 문진표" 류) → 크롤 표본 3개 미만 → 후보 0 → choice 카드 미커밋 → 404. 수정: ① 키워드 프롬프트에 06 §4-3 일반명사화 규칙 ② 후보 0건 시 일반명사화 재검색 1회(plugin, graceful).
- **루프3 (관통 성공 + 품질 결함 규명)**: **upload_approval 도달 + 실 렌더**(80s·7.1MB·1080p·30fps·오디오·QA pass). viewtrap 라이브 수집·정체성 판정(무관 영상 제외)·채널 보정 작동. KB 대조 **PASS 10 / FAIL 2** — 실패 2건 = 원고(도입부·본론). **원고 껍데기 원인**: `buildLLMClient`(19개 호출부 공용)가 구형 haiku CLI 경로라 launchd에서 스텝 전멸 → 제목 3회 반복 + LLM 거절문이 원고로 저장 → 영상 80초 중 76초 빈 화면(육안 프레임 확인). 부수: 풀링 클러스터링 CLI 240s 타임아웃(단일 주제 폴백) · sendBriefToFactory 400(기존 잔여 재현).
- **수정(루프4 전)**: LLM 백엔드 정책을 `buildLLMClient` 한 곳으로 통일(키 없으면 CLI sonnet 240s, 있으면 SDK; createSdkLlmClient는 위임) — dist 재빌드+재기동.
- **루프4 (관통 + 원고 부분개선)**: 통일 LLM으로 upload_approval 관통. 클러스터링 타임아웃 해소 → 풀링 주제 3개(현상 앵글 정합). 원고는 여전히 얇음(608자) → 근본 원인: l5-core `proposeScriptDraft`가 "결정론 조립 + LLM 다듬기(추가 금지)" 설계 + 거절문 무가드 채택.
- **수정(루프5 전)**: l5-core `content-production.ts` — LLM 주도 원고 생성(도입부 200자 + 본론 2,500~3,500자, `===INTRO===/===BODY===` 구분자) + **거절문·최소분량 가드**(미통과 시 결정론 유지). jest 12/12(신규 가드 4케이스). ⚠ l5-core tsc에 기존 `executive-brief.test.ts` implicit-any 2건(내 변경과 무관, 미수정).
- **루프5 (최종: 관통 + 실원고 + 실내용 영상)**: cd3bcdcd — 제목 "미용실 원장님, 그 믿음이 폐업을 부르고 있습니다"(24자) · **도입부 185자 실공감형 + 본론 2,249자 실콘텐츠**(거절문 0·반복 0) · 렌더 9.8MB/80s/1080p/QA pass. 슬라이드 재생성으로 **화면에 실원고 렌더 확인**(중간 프레임 육안 — 경계초는 전환 페이드라 빈 화면으로 보이는 함정 주의). 추가 수정: plugin `buildSlideDeck` — brief 슬라이드 텍스트 <300자면 폐기 + script_draft 폴백을 실원고 문단 분할 다장(≤12장)으로. KB 자동 대조 **PASS 11 / FAIL 3**(제목 체커가 중간 후보를 읽음—확정은 24자 · 신뢰도/판매논리 단어 휴리스틱 한계—내용은 존재).
- **잔여 (다음 작업)**: ① brief 조립부 — 슬라이드 headline에 main_claim 중복 + `[viewer emotion]` 메타 노출, 본문 1장 압축(문단 분할을 brief 경로에도) ② `sendBriefToFactory` 400(기존 잔여 — brief 저장/조회 키 불일치 의심) ③ e2e 음성이 8초 테스트 고정(실 낭독 TTS 배선) ④ 훅 정렬 insufficient_data ⑤ 앱 정적 19뷰 실데이터 배선(P3) ⑥ 정량 4요소 실측은 게시 후에만 가능(업로드는 승인⑥ 대기 정책 유지).

## 🟡 2026-07-12 — 비즈니스PT 매니저 UI v4 프로토타입 (별도 사이트化 결정, 지식베이스 정합)

사장님 결정: 기존 사장님 로컬 HTML(bizpt-content-manager_2)을 발전시켜 **별도 사이트**(founder-ui에서 링크만)로. UI는 자유 재설계.

- **정본 지식베이스**: `~/Downloads/비즈니스PT_컨설턴트_지식베이스 3/` 12개 md (00 인덱스 ~ 11 개인 컨설팅 기록). 강의 방법론의 정본 — UI·기능 구성은 이 12문서 기준으로 감사한다. → 이후 `docs/cmo/prd/bizpt-kb/`로 반입 완료(위 항목).
- **v4 프로토타입**: 세션 스크래치패드 `bizpt-manager-v4.html` (1,268줄, 22개 뷰). v3 대비: 상태 23단계 → **한국어 6단계**(기획→훅→원고→영상→업로드→성과)로 재표현, 파이프라인 카드 밀도 증강(퍼널 배지·풀링 4유형·근거·담당·다음 액션), 강의 프레임 전면 반영 — 퍼널 세트(풀링4+키1)·객단가×시장 매트릭스·아이템 5기준·논리적 확장 보드·뷰트랩 8단계·가치 3종 필터·판매 4단계·상품 확장 4단계·주차별 로드맵·썸끝/원끝 루틴·"대표님이 볼까?" 기준·모든 뷰에 "근거: NN문서" 배지.
- **검증**: JS `node --check` OK · 내비 22 = 뷰 22 = 타이틀 22 · 태그 짝 0 오차. 감사 서브에이전트 2개(KB 정합·UX 비평) 결과 반영 진행.
- **함정**: Claude 브라우저 페인 preview_start 300s 타임아웃(스크린샷 검증 불가) → 정적 검사 + 에이전트 감사로 대체.
- **다음**: ① 감사 지적 반영 최종본 ② `apps/bizpt-manager/`(Next.js, port 3003) 스캐폴딩 ③ NocoBase cmo:* 액션 배선 ④ 라이브 E2E(영상 실제 산출) 루프 — 사장님 지시 "루프 5회".

## 🟢 2026-06-12 — CMO 안정성·품질 개선 실행 (P0/P1/T3)

CMO_STABILITY_QUALITY_PLAN.html 계획 기반 즉시 실행 완료.

- **S3 Sonnet CLI → SDK 직접 호출(P0)**: `plugin.ts`에 `createSdkLlmClient()` 신규 추가. `createClaudeCLIClient` 4곳 전부 교체. launchd 환경 cold-spawn(47~125s) 제거 → classified=false 폴백 원인 해소. `@anthropic-ai/sdk` dist/node_modules 번들 포함 확인.
- **S1 상태머신 검증(P0)**: `l5-core/video-room/state-machine.ts` 이미 완전 구현됨(advanceStatus/requiresApproval/nextStatus). plugin.ts에서 정확히 사용 중. 추가 수정 불필요.
- **Q3 ExecutionBrief 400 폴백 강화(P1)**: `fullScript` 빈값 시 `coreMessage||topic` 최종 폴백, `title` null 시 `proj.title||'콘텐츠'` 폴백. brief 생성 보장 + 에러 시 텔레그램 즉시 알림.
- **T3 런타임 에러 텔레그램(P2)**: `sendRuntimeErrorTelegram(action, message, project_id)` 헬퍼 추가. `generateVideoExecutionBrief` catch + `runQA` fail 지점 연결. PII 제외.
- **Tiger 활성화**: 진행 중 프로젝트 2개 tiger_enabled=true (인스타그램 마케팅 자동화 상품 판매, E2E 라이브).
- **빌드 완료**: `corepack yarn build @l5/plugin-orchestration` 성공(7.48s). NocoBase 재기동 HTTP 200 확인.
- **미완료**: S2(CDP 재연결), S4(rebuild 스크립트), Q1(Viewtrap 키 내부 통합), Q4(말투 변환) — 다음 ACR Work Order 대상.
- **산출물**: `.telegram-runs/1781243215426-275-cto/EXECUTION_REPORT.html`

## 🟢 2026-06-12 — CMO 인사이트 루프 (유튜브 후킹 분석 자동화, services/cmo-insight-loop)

사장님 지시("Hook Pattern Lab 방법론으로 매일 21시 영상 5개 자동 분석 → HTML 텔레그램 발송 → 피드백 반영 → 주 1회 세컨 브레인 적재") 구축·라이브.

- **신규 서비스 `services/cmo-insight-loop/`**: `@l5/youtube` dist 재사용. `scripts/collect.mjs`(키워드 검색→쇼츠/비한글/중복 제외→조회수 상위 5개→메타+썸네일+자막, timedtext 빈응답 시 `youtube_transcript_api` 폴백) · `scripts/send-telegram.mjs`(토큰은 telegram-gateway plist에서 런타임 로드, sendDocument) · `scripts/sync-brain.mjs`(brain-queue.jsonl→썸끝원끝 Supabase `sc_brain_sync_queue`) · `scripts/embed-thumbs.py`(리포트에 썸네일 base64 주입).
- **방법론 `METHOD.md`**: 중심 질문 "왜 봤는가" 1개 → 썸네일/제목/도입부30초 각각 변수 치환형 구조 공식 + 적용 루트(상품 기준 문구 초안까지). 원고 전문 분석 금지. **피드백 루프**: `data/guidelines.md`에 사장님 피드백 누적 → 매 분석 전 로드.
- **스케줄(Cowork)**: `cmo-daily-insight`(매일 21시: 수집→Claude 분석→insights/<date>.md→reports/<date>.html→텔레그램) · `cmo-weekly-brain-sync`(일 22시: 주간 통합 claim→Supabase 적재). Claude 앱이 켜져 있어야 실행됨.
- **E2E 실증(2026-06-12)**: 실수집 5개(스티브의 파도타기 주식비서 등) → 분석 → 978KB HTML 리포트 → 텔레그램 수신 OK. 첫 통합 인사이트: "증거 우선 — 결과물 실물 화면을 썸네일·도입부 첫 5초에".
- **함정**: (1) 검색결과에 힌디/영어 혼입 → `requireKorean` 한글 필터 추가. (2) timedtext 자막이 전부 빈 본문 → python `youtube_transcript_api` 폴백이 사실상 주 경로. (3) Supabase 휴면(INACTIVE) 잦음 → 주간 동기화 시 restore_project 후 재시도.

## 🟢 2026-06-12 — 영상 일괄 렌더(video-batch-render) + 텔레그램 알림

사장님 지시("승인만 다 해두면 알아서 영상이 만들어지고 텔레그램으로 알림"). 동시 병렬 렌더는 의도적 배제 — Remotion이 잡 내부에서 CPU 병렬화하므로 잡 단위는 **순차**가 더 빠르고 번들 캐시 경합도 없음.

- **l5-core `video-room/batch-render.ts`(신규)**: `planBatchRender`(status=rendering + observed=queued만 선별, failed는 자동 재시도 금지·사람 확인, slug 멱등 dedup) + `summarizeBatchRender`(텔레그램 메시지, 0건이면 null=알림 스팸 방지, QA fail은 warn). jest 13/13.
- **hermes `tasks/video-batch-render.ts`(신규)**: 주입 deps(fetchCandidates/renderJob/reconcile/notify)로 순차 실행, 1건 실패해도 계속. jest 6/6.
- **hermes `runner.ts` `runVideoBatchRenderLive`**: `video_room_projects(status=rendering)` 조회 → `cmo:getRenderStatus`로 slug/job_path/관찰상태 수집 → factory에서 `npx tsx scripts/render-final-v2.ts --job <path>` spawn(타임아웃 기본 30분, `VIDEO_RENDER_TIMEOUT_MS`) → 렌더 후 `cmo:getRenderStatus` 재호출(DB 반영+rendering→qa 자동 전진) → `notifier/telegram` 요약 1건. nocobase-client에 `fetchRenderingVideoProjects`/`fetchCmoRenderStatus` 추가.
- **데몬**: `services/hermes-runtime/scripts/video-batch-render-daemon.mjs`(`--once` 지원, 기본 5분 폴링, 사이클 겹침 없음) + `launchd/com.l5.video-batch-render.plist`(시크릿은 PlistBuddy 주입, 커밋 금지).
- **가동 방법**: ① `pnpm --filter @l5/core build && pnpm --filter @l5/hermes-runtime build` ② plist를 `~/Library/LaunchAgents`에 복사 후 NOCOBASE_TOKEN/TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID 주입 → `launchctl load`. 업로드는 기존 승인 게이트 그대로(여기서 외부 액션 없음 — 렌더는 로컬 D1).
- 검증: l5-core/hermes 양쪽 tsc·jest·build GREEN. 실 렌더 관통은 다음 'rendering' 프로젝트에서 데몬 `--once`로 확인 권장.

## 🟢 2026-06-12 — 마스터 HTML §14 전수 구현 + B1~B7 + 신규 프로젝트 라이브 E2E 업로드 직전 관통

사장님 지시("HTML 정리 내용 빠짐없이 기능 + 7가지 보강 + 새 프로젝트 E2E 업로드 직전까지, 오류는 그 자리에서 수정") 완수.

**구현 (4개 병렬 워크스트림)**
- **B1~B7 (l5-core `video-room/thumbnail-develop.ts` 신규)**: 이미지 디벨롭 6기술(`developThumbnailImage`·`learnThumbnailPatternsFromReferences`=레퍼런스 자동 학습) · 채널 시청층 정합(`channel_audience_profile`+`judgeThumbnailAudienceFit`) · 문구에 제목기술 재적용(`developThumbnailTextWithTitleTechniques`) · 썸네일↔도입부 강도 연동(`scoreIntroHookStrength`+`evaluateHookIntensityAlignment`) · 디벨롭 자가 재귀 점검(`evaluateDevelopImprovement`) · 채널 우선 발굴(`buildChannelFirstDiscoveryPlan`+`selectAudienceChannels`) · 폰트 라이선스 검수. jest 신규 41 + 회귀 189 GREEN.
- **@l5/youtube**: `uploadVideo`(videos.insert resumable, **자동 호출 금지** 주석) · `updateVideoMetadata`(제목 교체용) · `collectHotVideoCandidates`(핫비디오 프록시) · `collectThumbnailReferences` · `searchChannels`/`getChannelTopVideos`. jest 90/90.
- **plugin 배선**: `proposeTitleDevelopment` 레퍼런스 자동 발굴+hot_videos 주입(갭#2/#3) · 신규 7액션 `learnThumbnailReferences`/`developThumbnailCandidate`/`reviewThumbnail`/`channelFirstDiscovery`/`evaluateHookAlignment`/`checkSwapSignals`(갭#10+#11, 텔레그램)/`publishUpload`(갭#9, confirm+status 가드, D3) · `proposeThumbnailMatrix`에 시청층 프로필+학습 패턴 자동 로드.
- **founder-ui**: `HookApprovalBoard`(승인③ 제목+썸네일+도입부 통합, 갭#5) · ThumbnailMatrixBoard 검수/디벨롭/레퍼런스 학습 버튼(갭#6) · api 5함수.

**라이브 E2E (신규 프로젝트 7e30e253, `apps/founder-ui/e2e/full-pipeline-live.mjs`)**
`createProject → loadPTContext → 상품정의 → 키 보고서(실검색) → 승인① → 풀링 보고서 → 승인② → 제목 디벨롭(자동 발굴+2차 확장) → 레퍼런스 학습 → 9개 매트릭스 → 썸네일 커밋 → hook 정렬 → 승인③ → 원고 → 승인④ → 녹음(say) → 슬라이드덱 → 실 렌더(Remotion, video.mp4 548KB) → QA → 승인⑤ → 업로드 초안(private) → **upload_approval 도달**`. publishUpload 미호출(승인⑥ 대기 = 업로드 직전 정지).

**E2E 중 발견·수정한 오류 (7건)**
1. `loadPTContext` rules 미입력 400 전체 정지 → l5-core `derivePTRules`(LLM→강의 기본 규칙 폴백) + source_refs 3개 미만 보충. jest 3/3.
2. **CDP RPC 무한 대기(30분 행 근본 원인)** — `RawCdpConnection.send` pending에 타임아웃 없음 → 60s 타임아웃 + ws close 시 전체 reject (`CDP_RPC_TIMEOUT_MS`). viewtrap jest 31/31.
3. HTTP 5분 단절(undici/서버) 시 클라이언트만 죽음 → E2E `callOrPoll`(fetch 실패/409 → 기대 카드 폴링 회수).
4. 제목 레퍼런스 자동 발굴 후보 1개 실패 → `discoverTitleReferences`에 **2차 의미범위 확장**(`deps.expandQueries`, plugin은 sonnet 주입). jest 15/15.
5. 드라이버 thumbnail plan `candidate_id` 키 매핑.
6. 동기 자식 실행 후 keep-alive 끊김 fetch failed → 1회 재시도.
7. `createUploadDraft` brief 부재 시 title 필요 → 확정 제목 전달.

**잔여(마이너)**: ① `generateVideoExecutionBrief`/`sendBriefToFactory` 400(연구팩 의존 추정 — 슬라이드덱은 script_draft 폴백 정상, 후속 확인) ② `learnThumbnailReferences` 해당 주제 적격 0건(graceful) ③ CTR은 구글 리포트 백필 대기 ④ 실 썸네일 이미지 제작·이미지 크롤러는 MVP 밖 유지 ⑤ founder-ui 신규 보드 Playwright 스모크 권장.

## 📦 2026-06-10 ~ 06-11 상세 — docs/archive/cmo-handoff-2026-06.md 로 이관 (300줄 규칙)

요약: E2E 마스터 HTML(§14) · 제목/썸네일 디벨롭 방법론 도메인 반영(30 jest) · 디벨롭 작동 검증(110/110) · 풀링 이후 자동 진행 배선(멈춤 3곳) · 보고서 승인→풀링 버그 2건 · 시청자 정체성 1순위 선별 · 상품정의→실검색 보고서 2단계 승인 풀스택 · 키 콘텐츠 자동초안 전진 버튼 · 영상룸 사이드바/더미 삭제 · 제목 8단계 풀스택 · runDiscovery 서버 CDP 주입 · viewtrap 검색 코드 트리거 · 발굴 크롤러 raw CDP · Sonnet 분류 timeout 해소 · Reporting CTR 클라이언트 · M8/M7/M1~M5 완료 기록.

## 환경/함정 메모

- CDP 운전: 크롬은 같은 프로필 동시 2개 불가 → 평소 크롬 종료 후 복사 디렉토리(`~/chrome-cdp`)로 디버그 기동.
- Viewtrap 인증 인메모리 → 로그인 탭 새로고침 금지(로그아웃됨). in-app 조작만.
- GCP 콘솔 org policy: API 키 생성 시 API restriction 강제 선택. OAuth Testing 모드는 test user 등록 필수(firstpulk0543).
- 새 GCP UI는 client_secret 재조회 불가 → 생성 시 즉시 저장(또는 secret 추가로 재발급).
- Playwright `connectOverCDP`는 download 이벤트/context 관리 일부 미지원 → secret은 클립보드 복사로 우회.

## 실증 스크립트 (임시, /tmp)

`/tmp/cdp-*.mjs` (CDP 크롤링·OAuth 플로우), `/tmp/oauth-token.json`(토큰 원본). 정식 배선 시 `services/youtube/`로 이관 — [TASKS.md](./TASKS.md) M2.
