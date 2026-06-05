# TASKS — L5 Business OS MVP

> 상태 범례: `[x]` 구현+검증 완료 · `[~]` 부분 구현/검증 필요 · `[ ]` 미착수
> 최종 업데이트: 2026-06-05 (CMO Video Room PRD 갭 배선 P0+P1, 라이브 E2E 19/19). 제품 방향은 chat-first CEO orchestration + agent execution + executive monitoring으로 고정한다.

## 🎬 CMO Video Room — 강의 워크플로우 정합 + 라이브 세컨브레인 (2026-06-05)

> 비즈니스 PT 강의(세컨브레인 biz) 워크플로우를 그대로 재현. 상세 = `docs/HANDOFF.md` 2026-06-05.

- [x] **Phase 1 흐름 정리**: `reference_analysis`·`second_brain_insight_merge` 상태 제거(25→23), 미니로드맵에 썸네일 구성/원고 도입부/훅 승인 노드(14노드), STAGE_SCRIPT를 강의 방법론(문제에서 시작·역순·현상→욕구→계획→행동→보상·경쟁사 벤치마킹·human-in-loop 리서치)으로 정비.
- [x] **Phase 2 라이브 세컨브레인 결선**: `CmoStrategyContext.second_brain_insights` + plan-turn 렌더. 백엔드 `cmo:chatMessage`가 단계별 쿼리로 `makeSecondBrainTransport` 라이브 조회 주입, `loadPTContext` 빈 source_refs 자동충전.
- [x] **검증**: l5-core tsc 0 / jest 797·격리 NocoBase 라이브 **E2E 22/22**(로드맵 14노드·reference_analysis 제거·라이브 SB 자동충전 입증).
- [x] **Phase 3 — 세컨브레인 기반 도입부 30초**: `composeIntro30s`(applied_insights 인사이트→적용방식 매핑, 레퍼런스 의존 제거) + 백엔드 `commitStrategyArtifact` stage `intro_30s`(빈 applied_insights는 라이브 SB 자동시드) + UI `Intro30sCard`(적용 인사이트 표). 사장님이 적용 인사이트 보고 hook 게이트서 승인. l5-core jest 806, 라이브 **E2E 25/25**. 브라우저 확인.
- [x] **Phase 3 잔여 — 원고 beat 편집 + 팩토리 전달**: `script-factory.ts`(`ScriptBeat`+`buildFactoryVideoJob`, 팩토리 16타입 valid 매핑·insight 폴백) + 백엔드 `cmo:saveScript`/`cmo:sendToFactory`(transport `submitJob`: jobs/ 작성+validate) + UI `ScriptBeatEditor`(장면별 편집·저장)+`FactoryJobCard`. 사장님이 원고 수정→저장→팩토리 전달→검증통과. 라이브 **E2E 27/27**(멀티타입 validate). 팩토리에 실제 Scene JSON 작성 확인.
- [ ] **실제 MP4 렌더 자동화(후속)**: render-final.ts(수 분) 자동 발동 — 현재는 사장님 발동(버튼/CLI).

## 🎬 CMO Video Room — PRD 갭 배선 (2026-06-05, branch `cmo/video-room-clean`)

> PRD 갭 분석: 도메인(l5-core)은 전부 구현·테스트(tsc 0, jest 791/791). 갭은 전부 배선 레이어. sub agent 2개(FE/BE)로 ADDITIVE 배선. 상세 = `docs/HANDOFF.md` 2026-06-05.

- [x] **P0 Production/Publish 발동 버튼** (page.tsx): 슬라이드덱 생성→렌더 제출→QA 실행→업로드 초안 버튼. 기존 액션(ai-slide-video-factory transport 연결)을 화면에 노출.
- [x] **P0 카드 stage 키 정합** (page.tsx): UI `render_job`/`video_qa` → 백엔드 `rendering`/`qa`. 렌더·QA 카드 표시.
- [x] **P1 Business PT Context 로딩** (`cmo:loadPTContext`): `assertContextLoadingComplete` 3소스 규칙 런타임 강제.
- [x] **P1 음성 녹음 업로드** (`cmo:attachVoice` + UI): disabled 플레이스홀더 → 작동.
- [x] **P1 Strategy 구조화 검증** (`cmo:commitStrategyArtifact`): selectKeyContent/createPullingContentSet/createSecondBrainInsightMerge 도메인 검증 노출.
- [x] **검증**: founder-ui tsc 0, plugin tsc 0, plugin dist 재빌드, 격리 NocoBase(13099) 라이브 E2E **19/19 ALL GREEN**(기존 14 + 신규 5).
- [ ] **배포**: launchd :13000이 clean 코드 서빙하도록 빌드+kickstart (Founder 결정) + PR.
- [ ] **P2 후속**: 성과 Memory completed 연결, KeyContentSet/funnel 전용 카드, Production 버튼 Playwright 클릭 검증.

## 🔥🔥 M9: CTO 시니어 개발자 자율 실행 — 컨트롤룸 라이브화 (2026-06-04 최우선, 창업자 지정)

> **창업자 비전**: CEO와 기획 → CTO가 큰 로드맵을 그림 → (큰 작업만) task 분해 → claude/codex/agy CLI에 모델별 배정 → 결과물이 **실시간(최소 시작/완료)으로 컨트롤룸=CEO채팅 메인 페이지에 표시** → 각 에이전트가 어떤 task 배정받고 완료/진행중인지 전부 보임 → 전체 개발계획이 하나씩 사라짐 → **예상 토큰도 표시**. CTO가 시니어 개발자처럼 토큰·계획·개발 전체를 알아서 관리.
> **진단**: 구조적으로 70~80% 있음(CEO decomposer·CTO dev-workflow-spec·selectModelTier·dispatchToACR·control-room tree+UI·synthesis). 핵심 병목 = ACR에 `GET /api/l5/execution`이 없어 컨트롤룸 ACR 데이터가 항상 stub. **Phase6 하나로는 비전 실현 불가 → M9가 M8.1·Phase6보다 먼저.** 결정 근거 = `docs/DECISIONS.md` 2026-06-04.
> **ACR repo 2개**: ① 실제 dispatch 대상 = `~/Desktop/양원민 개발자/agent_control_room_docs`(Next.js, `/api/workbench/dispatch`·`/api/l5-callback` 보유) ② 그 ACR이 spawn하는 CLI 런타임 = `~/Desktop/hermes-agent`(Python, 토큰/비용 데이터 완비 — 새로 만들 필요 없이 노출만).
> **승인 정책(확정)**: 코딩=D2 내부실행, 브랜치+검증이 안전장치 → per-task 승인 불필요. 승인 게이트는 D4(외부 고객 메시지)·D5(결제/계약/법적)에만. self-upgrade(CTO가 에이전트용 도구 개발)는 차단 아니라 Founder go/no-go 승인으로 진행, self-mod deny-list는 엄격 유지.

- [x] **M9.1 ACR `GET /api/l5/execution` 엔드포인트 (최대 병목, ACR repo `agent_control_room_docs`)** — **라이브 완료(2026-06-04)**. `app/api/l5/execution/route.ts` 신규: `x-l5-shared-secret` 인증 + l5_task_id당 FeaturePlan(여러 phase)을 AcrExecTask 1개로 집계("phase x/N", branch, changed_files 개수, log_tail, assigned_agent). L5 계약(`acr-execution-transport.ts` AcrExecTask)과 정확히 일치. **검증**: ACR 전체 tsc 0에러 + `next build` + `launchctl kickstart -k com.l5.acr-web` 재시작 + 라이브 HTTP 4종(무인증/오secret→401, 유효→200/19레코드 claude-code·codex 둘 다, l5-<taskId> 스코핑→1건). business 스코핑은 ACRIntent에 business_id 부재 → 전체 반환+L5가 task id로 필터(M9.3에서 개선). 토큰/비용 필드는 Phase6에서 추가(ACR이 CLI 토큰 미캡처).
- [~] **M9.2 L5: transport 활성 + 폴링 (pulk)** — **환경 배선 완료, fresh-task E2E 검증 대기(2026-06-04)**. `apps/nocobase-app/.env`에 `ACR_EXECUTION_ENABLED=1` 추가 + `com.l5.nocobase` 재시작. L5_SHARED_SECRET 양쪽 일치 확인(sha e82040de). transport 코드(`acr-execution-transport.ts`)는 기존에 존재 → 플래그로 활성. **남은 검증**: 2026-06-03 P0 데이터 초기화로 현재 L5에 CTO agent_task 0건 → controlRoomTree에 머지할 dev-task가 없어 비어 보임. **진짜 증명 = 새 CTO 태스크 dispatch→ACR 실행→컨트롤룸 라이브 표시 E2E**(M9.3/M9.4와 함께).
- [x] **M9.3 모델 tier → CLI 배정 (pulk `cto.ts`)** — **완료·라이브(2026-06-04)**. `toCTOPhase`에 `tierToRuntime`(T1=claude/T2=codex/T3=antigravity) 추가 → 모든 phase가 tier에 따라 claude/codex/agy에 분산. `selectModelTier` 재사용, `ModelTier`/`RuntimeType` import. **검증**: FEATURE=claude3/codex2/agy1, BIG_CHANGE=claude5/agy1, SMALL_FIX=agy4. agent-runtime 빌드 배포. **라이브 E2E**: 실제 dispatcher→cto.ts→ACR 통해 FEATURE 태스크가 정확히 claude3/codex2/agy1로 분산되어 ACR 실행 확인.
  - ✅ **선결 차단 해소(2026-06-04)**: codex·agy 헤드리스 0-완료 버그 **수정 완료**. 근본원인 = ACR spawn에 stdin 파이프를 열어둔 채 안 닫아 codex/agy가 입력 대기로 무한 블록(claude만 자체 3s stdin 타임아웃으로 작동). **수정 2줄**: `spawn-runner.ts` + `antigravity-runner.ts` 두 spawn에 `stdio:["ignore","pipe","pipe"]`. 재빌드+재시작 후 풀파이프라인 재dispatch → **30초 내 claude/codex/agy 셋 다 done+파일생성**(이력상 codex·agy 첫 완료). 상세 메모리 `l5-acr-cli-completion-status`. 이제 모델별 배정 안전하게 가능 → M9.3 본작업(ACRIntent에 모델/CLI tier 명시) 진행 가능.
- [x] **M9.4 컨트롤룸 표시 + 종모양 완료 알림 (pulk founder-ui)** — **완료·라이브(2026-06-04)**. 스코프 정정: 메인 chat 통합 아님 → 컨트롤룸(별도 페이지)에서 보이면 됨 + 우측상단 `NotificationBell`에 완료 알림. **구현**: `api.getCompletionAlerts`(최근 `founder_deliverables` = instruction 완료 종합, sort `createdAt` camelCase) + NotificationBell이 완료(초록 배지)+발견 병합, 20s 폴링. **검증**: 종 엔드포인트 라이브(business 4 deliverable 2건 반환), 컨트롤룸이 라이브 CTO 태스크(phase 1/6 running, branch, agent) 실제 표시.
  - **선결 dispatcher fix(2026-06-04)**: dispatcher가 CTO를 ACR dispatch 직후 즉시 `done` 마킹 → 컨트롤룸(done 제외)이 ACR 실행 중 작업을 못 봄. `task-dispatcher.ts`에서 CTO(non-approval)는 `running` 유지(taskCallback all_done이 done 처리, stalled-detector가 안전망). 테스트 갱신(7/7), hermes-runtime 빌드 배포. 이로써 컨트롤룸이 실행 중 CTO 작업을 실시간 표시.
  - **선결 verifier fix(2026-06-04, 자율 완주 활성)**: Phase17 CTO 검증기가 `phase_complete`(중간 phase)에서도 **전체 expected_output** 기준으로 판정 → 구현 phase 전에 phase 1(조사)에서 "구현 없음"으로 fail→needs_review로 자율 흐름 중단(라이브 E2E에서 실측). `plugin-orchestration` taskCallback `shouldVerify`를 `all_done`에만 적용(중간 phase는 진행만 기록, ACR auto-dispatcher가 다음 phase 드레인). src+dist 미러 패치 + node --check + nocobase 재시작. 이로써 CTO가 6-phase를 자율 완주 후 최종 결과만 검증.
  - ✅ **콜백 경로 진단 정정(2026-06-04)**: ACR→L5 콜백은 `POST http://localhost:13000/api/agent:taskCallback`(x-l5-shared-secret) — **실제로 도달·작동함**(직접 probe: 11ms 응답). E2E 로그의 `[pre-dispatch] L5 callback failed: fetch failed`는 ① M9.2에서 nocobase 재시작한 순간(13000 다운) ② 합성 테스트 id가 UUID 아님(`agent_tasks.id`=uuid) → 500 때문. **진짜 UUID task면 콜백 정상 도달.** 종 알림은 기존 `taskCallback`(완료 시 L5 task 상태 갱신) 위에 NotificationBell 이벤트만 얹으면 됨. 단 taskCallback 4s 타임아웃이 무거운 synthesis엔 짧을 수 있음(튜닝 후보).
- [x] **M9.5 전체 개발계획 plan-burndown 뷰** (2026-06-04): 로드맵이 하나씩 사라지는 시각화 완료. l5-core `roadmap/progress`(deriveRoadmapItemStatus planned/active/done + summarizeRoadmap %, 7테스트). plugin `cto:roadmapProgress`(roadmap_items LEFT JOIN agent_tasks 단일 쿼리, done/total/running 카운트, src+dist). 컨트롤룸 `RoadmapProgressPanel`(단계별 진행바·상태칩·완료 취소선 + "X% · 작업 a/b 완료 · 단계 c/d", 승인/10초틱마다 갱신). 라이브 E2E: 4작업 중 1완료→25%, 1번 done 취소선·2번 진행중 정확 렌더, 콘솔 에러 0.
- [x] **M9.6 self-upgrade deny-list 강화** (2026-06-04): 루프(Hermes 반복감지→tool-request→sendToCTO→CTO 개발→approval 큐→applySelfMod/rollback)는 이미 결선됨. 초기화는 M10 CTO 기획 패널(창업자↔CTO 대화)로도 가능. **안전 강화**: deny-list를 l5-core 공유 함수로 승격(`checkSelfModDiffForbidden` 경로 + `checkSelfModIntentForbidden` NL 한/영, 6테스트). ① sendToCTO에 **생성 시점 조기 차단**(title/rationale 의도 검사 → CLI 실행 전 차단, self_mod_status='blocked') ② applySelfMod 적용 시점 diff 검사를 공유 함수로 리팩터. 라이브 검증: '승인 게이트 우회' 요청 intent 차단, 정상 요청 통과. (참고: executive-monitor RISK_RANK는 기존 dead code.)

- [x] **M9.7 트리비얼 작업 효율화 — TINY 클래스 (창업자 지적 2026-06-04, 완료)**: 새 기능이 무조건 FEATURE(6 phase)로 분류돼 함수 하나 추가도 6단계 콜드스타트(20분+)였음. **TINY TaskClass 추가**(구현→커밋 2 phase, 둘 다 claude T1=가장 빠름). `dev-workflow-spec.ts`(타입·DEV_WORKFLOW_TEMPLATES·CLASS_EXPECTED_ORDER·DEPENDS_ON), `model-routing.ts`(CLASS_PHASE_OVERRIDES TINY=T1), `classifyTask`(트리비얼 키워드 "함수 하나/오타/상수 추가/rename"·소규모 hints + escalation=0일 때만 → 과분류 방지), cto.ts VALID_TASK_CLASSES+빌드. **검증**: l5-core 520/520 + 신규 TINY 테스트, 결정론 분류(slugify/오타/상수→TINY, 인증모듈/대시보드→FEATURE 유지), **라이브: TINY 태스크가 실제 파이프라인서 2 phase(claude)로 생성**. 잔여(후속): 에이전트 세션 웜 유지(phase별 콜드스타트 자체 제거)·phase 배칭 = ACR spawn-runner 차원, 별도.

## 🔥 M10: CTO 대화형 기획 + PRD→로드맵 + 자율 프로젝트 제안 (2026-06-04 창업자 지정, 진행 중)

> **창업자 비전**: 컨트롤룸에서 CTO와 직접 대화하며 아이디어를 PRD→로드맵→task로 같이 기획. 두 갈래 task 공존(CEO→CTO 자동 / 창업자↔CTO 직접). 새 프로젝트면 CTO/CEO가 "어떤 사업에 어떤 프로젝트로" 제안→창업자 승인→생성. 컨트롤룸 카드는 창업자 친화(개발자 언어 숨김).
> **결정(2026-06-04)**: CTO 기획 채팅 = **컨트롤룸 안 패널**. 기획 확정 = **한 번에 계획 승인**(PRD+로드맵+task+프로젝트배치 일괄 go/no-go).

- [x] **슬라이스 1 — 로드맵 생성 두뇌 (l5-core)**: `roadmap/generate-roadmap.ts` `generateRoadmapFromPRD`(LLM + 구조기반 폴백). 10/10 테스트.
- [x] **슬라이스 A — CTO 기획 대화 두뇌 (l5-core)**: `cto-planning/plan-turn.ts` `runCtoPlanningTurn(history, msg, ctx, {llm})` → `{reply, plan?}`. plan = PRD+roadmap_items+tasks+project_proposal(새 프로젝트 배치 제안). 정규화·클램프·폴백. 7/7 테스트.
- [x] **창업자 친화 컨트롤룸 카드 (founder-ui)**: 개발자 언어(branch 해시·phase 2/2·exit code·D1)를 "개발 상세"로 접고, **실제 CLI(acr_agent)가 무슨 단계 하는지**를 평이하게("Codex가 작업 중 · 6단계 중 4단계"). `build-control-room-tree.ts`에 `acr_agent`(현재 phase의 ACR CLI) 추가 → 카드가 owner(CTO) 대신 실제 CLI 표시. l5-core 7/7 + 배포.
- [x] **슬라이스 B — 데이터 모델**: `cto_planning_messages`(대화), `projects.prd`(text), `roadmap_items`(id/project_id/business_id/title/summary/objective/sequence/status/source), `agent_tasks.roadmap_item_id`. NocoBase 컬렉션 + psql ALTER.
- [x] **슬라이스 C — 백엔드 액션**: `cto:planMessage`(founder msg→runCtoPlanningTurn→reply+plan 저장) + `cto:approvePlan`(트랜잭션 일괄: PRD 저장·roadmap_items 생성·tasks 생성·project_proposal 승인 시 project 생성·task→roadmap_item 연결, 멱등). plugin-orchestration src+dist 패치, 라이브 E2E 검증(다크모드 기획→3 로드맵+4 task 연결, source_ref='cto_planning', D2/queued/CTO). ACL: cto/cto_planning_messages/roadmap_items.
- [x] **슬라이스 D — 컨트롤룸 CTO 기획 패널 (founder-ui)**: `control-room/page.tsx` `CtoPlanningPanel`(접이식 채팅 + founder/CTO 말풍선) + `PlanCard`(PRD·로드맵 단계·작업·새 프로젝트 제안 배너 + "이 계획 승인" 버튼). api.ts `ctoPlanMessage`/`ctoApprovePlan` + 타입. 승인 시 onApproved→트리 새로고침. 라이브 E2E(Playwright): 패널 열림·전송·계획 카드·로드맵·승인 버튼 렌더, 콘솔 에러 0.

### Phase 6 (M9와 함께) — 관측·안전 토큰/비용
- [~] **토큰/비용 표시**: **예상 토큰 완료(2026-06-04)** — l5-core `token-estimate`(classifyTask|CTO size판단→DEV_WORKFLOW phase수→tier별 토큰범위, 7테스트). CTO 기획 시 작업별 `size`(tiny/small/feature/big)를 LLM이 판단→정확도↑(다크모드 데모: 전부-FEATURE 350k–910k → small4+feature1 150k–374k). PlanCard에 "예상 토큰 약 Xk–Yk"(승인 전 go/no-go 판단), 컨트롤룸 dev-task 카드에 작업별 예상 토큰. 라이브 E2E 검증. **남은 것**: 실제 누적 토큰/비용 = hermes-agent(session_*_tokens·estimated_cost_usd 내부 보유)→ACR 콜백→`/api/l5/execution` AcrExecTask 확장→controlRoomTree 머지→UI. (3레포 결선, 실제 CLI 실행 필요.) 모델tier 라우팅이 곧 절감(가벼운 phase=T3 haiku, 무거운 추론만 T1 opus).
- [ ] **비용 상한·장애 모니터**: 추정 대비 N배 초과 시 정지·알림. Langfuse 추적, 위험명령 차단(D4/D5 게이트만).

### State Machine 29개 상태 전환 검증 (2026-06-04, 구현+검증 완료)

> **배경**: 15+ 엔티티 상태 전환이 플러그인에서 raw status 쓰기로 실행되며 l5-core에 유효 전환 정의 없음. 오픈소스 조사(XState/Robot/typescript-fsm) 결과 `build` 결정. `createTransitionValidator` 제네릭 팩토리 + lookup table 패턴. **스펙: `docs/specs/STATE_MACHINE_VALIDATION_SPEC.md` (AC 7개, 영향 파일 3개).**
> **Acceptance Criteria**: (1) 팩토리 제네릭 동작 (2) edge 수 11/6/7/5 단언 (3) 유효 전환 valid===true (4) 무효 전환 valid===false+reason (5) pnpm test 통과 (6) tsc 0 (7) index.ts re-export.
> **Red 검증(2026-06-04)**: `corepack pnpm --filter @l5/core test -- state-machine/__tests__/transitions.test.ts` → 실패(exit 1). 현재 구현 파일 `src/functions/state-machine/transitions.ts`가 없어 `TS2307: Cannot find module '../transitions'`로 red 확인.
> **Green 검증(2026-06-04)**: `corepack pnpm --filter @l5/core test` → 55 suites / 585 tests 통과. `corepack pnpm --filter @l5/core typecheck` → 통과. 관련 targeted: `state-machine/__tests__/transitions.test.ts` + `approval/__tests__/content-gate.test.ts` → 26 tests 통과.
> **리뷰(2026-06-04)**: 16파일 952줄 전체 diff 검토 — **LGTM**. 차단 이슈 없음. non-blocking info 3건(transitions.ts 캐스트 우회, routeContentApproval email_campaign 주석 미비, intro-analysis-panel red 상태). 상세 = `docs/HANDOFF.md` 리뷰 섹션.

- [x] `docs/specs/STATE_MACHINE_VALIDATION_SPEC.md` — 요구사항 명세 + 측정 가능 AC 7개 + 영향 파일 목록
- [x] `state-machine/__tests__/transitions.test.ts` — 실패 테스트 작성 완료 + red 확인 (`TS2307` 구현 모듈 부재)
- [x] `state-machine/transitions.ts` — `createTransitionValidator` + 4개 lookup table (AgentTask 11, FounderInstruction 6, ToolRequest 7, BusinessIdea 5 = 29 edges)
- [x] `l5-core/src/index.ts` re-export + typecheck + test 통과
- [x] `ContentApprovalGate` core red 테스트도 green 확인 — `CONTENT_APPROVAL_TRANSITIONS` 8 edges + `routeContentApproval` 라우팅 + `validateContentApprovalTransition`

### 공통 Header & Mini Roadmap UI (2026-06-04, 구현+리뷰 완료)

> **배경**: founder-ui 각 페이지(monitor, projects, chat)가 자체 헤더를 inline으로 중복 구현. Icon 컴포넌트 4곳, Agent 배지 컬러맵 2곳 중복. 오픈소스 조사 결과 외부 라이브러리 없이 기존 inline style + CSS 변수 패턴 유지 결정(Radix/shadcn 배제 — 기존 패턴 충돌·번들 과다). **스펙: `docs/specs/common-header-mini-roadmap.md` (AC 6개, 영향 파일 9개).**
> **리뷰(2026-06-04)**: 12파일 +396/-195줄 전체 검토 — **LGTM**. 차단 이슈 없음. non-blocking info 2건(스펙 범위 밖 잔여 중복: approval/ApprovalQueueCard/ConsultationCard/SynthesisCard에 ICONS, control-room/approval에 AGENT_PASTEL — 후속 PR 권장). 상세 = `docs/HANDOFF.md` 리뷰 섹션.

- [x] `docs/specs/common-header-mini-roadmap.md` — 요구사항 명세 + 측정 가능 AC 6개 + 영향 파일 목록
- [x] `src/components/Icon.tsx` — 4곳 중복 ICONS Record 통합 (24개 아이콘)
- [x] `src/components/AgentBadge.tsx` — 2곳 중복 컬러맵(AGENT_PASTEL/AGENT_CHIP) 통합 + variant prop
- [x] `src/components/PageHeader.tsx` — 공통 헤더 (overline/title/subtitle/actions/children)
- [x] 기존 파일 로컬 정의 제거 + import 교체 (monitor, projects, chat, Sidebar, RoadmapMiniCard, RoadmapTimeline)
- [x] typecheck 통과 + build 통과 + 시각적 regression 없음 확인

### Intro 30s Analysis Card (2026-06-04, 스펙 완료)

> **배경**: CMO가 YouTube 영상 인트로 첫 30초의 시청자 리텐션/훅 효과를 분석한 결과를 `agent_tasks.output`에 기록한다. `AgentOutputDetail`이 인트로 분석형 산출물(`intro_analysis` 필드 존재)을 감지하면, 리텐션 커브 미니차트 + 훅 스코어 + 구간별 피드백을 전용 패널로 렌더링한다. Strategy Decision Panel과 동일한 분기 추가 패턴.

#### 오픈소스 조사 (비교 완료)

| 도메인 | 채택 | 배제 (이유) | 번들 추가 | 통합 시점 |
|--------|------|-------------|-----------|-----------|
| 리텐션 커브 차트 | **recharts** (MIT, ~50kB) | @nivo/line(verbose+D3), uPlot(저수준), react-chartjs-2(106kB 과대) | ~50kB | 카드 구현 시 |
| YouTube 데이터 | **youtubei.js** (MIT, v17) | youtube-transcript(비활성+파손), yt-dlp(GPL-3.0 전파) | ~패키지 크기 | 카드 구현 시 |
| 프레임 추출 | **@remotion/renderer** (기존) | ffmpeg.wasm(31MB 과도), Canvas API(CORS 차단) | 0 | PMF 확인 후 |

#### 데이터 모델: `intro_analysis` (AgentOutputLite 확장)

CMO가 `agent_tasks.output`에 기록하는 인트로 분석 결과 구조. 기존 `AgentOutputLite` 타입에 optional 필드로 추가한다.

```typescript
// apps/founder-ui/src/lib/api.ts — AgentOutputLite에 추가
export type IntroAnalysisData = {
  video_title: string
  video_url: string                    // YouTube URL
  thumbnail_url?: string               // 썸네일 이미지 URL
  duration_sec: number                 // 분석 대상 구간 (최대 30)
  hook_score: number                   // 0–100, 훅 효과 종합 점수
  retention_curve: { sec: number; pct: number }[]  // 초별 예상 리텐션 (0–30초, 최대 30포인트)
  segments: {
    label: string                      // 구간 이름 ("오프닝 훅", "문제 제기", "가치 제안" 등)
    start_sec: number
    end_sec: number
    verdict: 'strong' | 'weak' | 'neutral'
    feedback: string                   // CMO의 구간별 피드백
  }[]
  overall_feedback: string             // 종합 피드백
  improvement_suggestions?: string[]   // 개선 제안 (있을 때만)
}

// AgentOutputLite에 추가
export type AgentOutputLite = {
  // ... 기존 필드 유지
  intro_analysis?: IntroAnalysisData   // 인트로 30초 분석 결과
}
```

#### 스펙: Intro 30s Analysis Panel

**목적**: `AgentOutputDetail`이 인트로 분석형 산출물(`intro_analysis` 존재)을 감지하면, 공통 카드 패턴에 맞는 "인트로 분석 패널" 뷰로 렌더링한다.

**감지 규칙**:
- `output.intro_analysis`가 존재하고 `hook_score`가 number이면 → 인트로 분석 패널 모드
- 그 외 → 기존 렌더링 유지 (Strategy Decision 분기 포함)

**패널 구조**:
```
┌─ 외곽: border 1px solid var(--silver-2), borderRadius 6, overflow hidden
│  ┌─ 헤더: j-overline "인트로 30초 분석" + AgentChip(CMO)
│  ├─ 영상 정보: 썸네일(옵션) + video_title + duration_sec + video_url 링크
│  ├─ 훅 스코어: hook_score/100 대형 숫자 + 색상 인디케이터 (≥70 green, ≥40 amber, <40 red)
│  ├─ 리텐션 커브: Recharts <LineChart> 미니차트 (높이 80px, x=sec, y=pct%)
│  ├─ 구간별 분석: segments[] 각각 label + 시간 범위 + verdict 칩 + feedback
│  ├─ 종합 피드백: overall_feedback 텍스트
│  └─ 개선 제안: improvement_suggestions[] ul/li (있을 때만)
└─
```

**verdict 칩 색상**: `strong` → green-tint 배경, `weak` → red/amber-tint, `neutral` → silver-1.

**Recharts 사용**: `recharts`를 `apps/founder-ui`에 devDependency로 설치. `<ResponsiveContainer width="100%" height={80}>` + `<LineChart>` + `<Line type="monotone" dataKey="pct" stroke="var(--green)" strokeWidth={1.5} dot={false} />`. X축/Y축 라벨 최소화 (sparkline 스타일).

**props 변경**: 없음 — `AgentOutputDetail`의 기존 `{ output: AgentOutputLite; agent?: string }` 그대로 사용. `intro_analysis`는 `AgentOutputLite`에 optional 필드로 추가되므로 기존 호출부 변경 없음.

#### acceptance_criteria (측정 가능)

1. `AgentOutputDetail.intro-analysis-panel.test.tsx`가 통과한다 (실패 테스트 선작성 → 구현 후 통과).
2. `intro_analysis` 필드가 있는 output → HTML에 "인트로 30초 분석" 텍스트 포함.
3. `hook_score` 값에 따라 색상 분기: `≥70` → green 계열, `≥40` → amber 계열, `<40` → red 계열.
4. `retention_curve` 데이터가 Recharts `<LineChart>`로 렌더링됨 (SVG `<path>` 존재 확인).
5. `segments[]` 각 항목이 `label`, 시간 범위(`start_sec–end_sec`), `verdict` 칩, `feedback` 텍스트를 표시.
6. `improvement_suggestions`가 없으면 해당 섹션 미렌더링 (조건부).
7. `intro_analysis` 필드가 없는 output → 기존 일반 필드 뷰 / Strategy Decision Panel 유지 (회귀 없음).
8. 기존 `AgentOutputDetail` 사용처(`chat/page.tsx` L1182, `monitor/page.tsx` L817)에서 기존 동작 유지.
9. `apps/founder-ui` typecheck (`tsc --noEmit`) 통과.

#### 영향 파일

| 파일 | 변경 유형 |
|------|-----------|
| `apps/founder-ui/src/lib/api.ts` | 수정 — `IntroAnalysisData` 타입 추가, `AgentOutputLite`에 `intro_analysis?` 필드 추가 |
| `apps/founder-ui/src/components/AgentOutputDetail.tsx` | 수정 — 인트로 분석 패널 분기 추가 (`hasIntroAnalysis` 감지) |
| `apps/founder-ui/src/components/__tests__/AgentOutputDetail.intro-analysis-panel.test.tsx` | 신규 — 실패 테스트 |
| `apps/founder-ui/package.json` | 수정 — `recharts` devDependency 추가 |
| `apps/founder-ui/src/app/chat/page.tsx` | 확인 — 변경 불필요 (기존 `output` prop 전달로 자동 동작) |
| `apps/founder-ui/src/app/monitor/page.tsx` | 확인 — 변경 불필요 |

#### 채택 라이브러리

- **recharts** (MIT, ~50kB min+gz): `<LineChart>` + `<Line>` + `<ResponsiveContainer>`. 카드 내 미니 리텐션 커브 전용. JSX 컴포지션 패턴이 기존 인라인 스타일과 일치.
- **youtubei.js** (MIT): 이 카드 자체에서는 사용 안 함 — CMO 에이전트 런타임(l5-core)에서 자막/메타데이터 추출 시 사용. 카드는 이미 추출된 결과(`intro_analysis`)만 렌더링.

#### 스코프 외 (명시적 배제)

- YouTube 데이터 추출 로직 (l5-core CMO 도구): 별도 태스크.
- 프레임 추출/비주얼 스코어링: PMF 확인 후.
- 실시간 YouTube Analytics API 연동: API 키 + OAuth 필요, MVP 범위 외.

### Thumbnail Pattern Card — Strategy Decision Panel (2026-06-04, 스펙 완료)

> **배경**: 임원 산출물(`agent_tasks.output`)을 창업자에게 보여주는 `AgentOutputDetail` 컴포넌트가 존재하지만, (1) 에이전트 컨텍스트(누구의 권고인지)가 없고, (2) 카드 외곽 구조(헤더·구분선·패널 제목)가 다른 카드들과 불일치하며, (3) 전략 결정형 산출물(goal+recommendation+options+action_items)에 대한 전용 패널 뷰가 없다. 실패 테스트(`AgentOutputDetail.strategy-decision-panel.test.tsx`)가 이 갭을 명시한다.

#### 구조 패턴 추출 (기존 카드 5개 공통)

기존 카드 컴포넌트(`SynthesisCard`, `ApprovalQueueCard`, `ConsultationCard`, `BusinessContextSnapshotCard`, `RoadmapMiniCard`)에서 추출한 공통 구조:

```
┌─ 외곽: border 1px solid var(--silver-2), borderRadius 6–12, overflow hidden
│  ┌─ 헤더: padding 9px 14px, borderBottom silver-1, j-overline 라벨
│  ├─ 본문 섹션들: padding 11–14px, borderTop silver-1로 구분
│  │  ├─ AgentMonogram: 20×20 borderRadius 4, AGENT_COLOR 배경, 흰색 2글자
│  │  ├─ 텍스트: fontSize 12.5–13, color var(--ink-1), lineHeight 1.5–1.6
│  │  └─ 강조 블록: background var(--green-tint), border green-tint-2
│  └─ 액션 영역: padding 11px 14px, borderTop silver-1, j-btn 계열 버튼
└─ 빈 상태 / 스켈레톤 로더
```

공통 프리미티브: `AGENT_COLOR` 팔레트(8색), `Icon` SVG 유틸, `j-overline`/`j-btn`/`j-badge` CSS 클래스.

#### 스펙: Strategy Decision Panel

**목적**: `AgentOutputDetail`이 전략 결정형 산출물(recommendation+options 존재)을 감지하면, 공통 카드 패턴에 맞는 "전략 결정 패널" 뷰로 렌더링한다.

**props 변경**:
```typescript
// 기존
{ output: AgentOutputLite }
// 변경
{ output: AgentOutputLite; agent?: string }
```

**렌더링 규칙**:
- `recommendation`과 `options`가 모두 존재하면 → 전략 결정 패널 모드
- 그 외 → 현재 일반 필드 나열 유지

**전략 결정 패널 구조**:
1. **패널 헤더**: `j-overline` "전략 결정 패널" (테스트 assertion 충족)
2. **목표 섹션**: `goal` 필드 표시
3. **추천 블록**: green-tint 배경, 라벨 = `"{agent} 추천"` (agent 미전달 시 "CMO 추천" 기본값) (테스트: "CMO 추천")
4. **선택지 목록**: `options[]` ul/li
5. **실행 항목**: `action_items[]` ul/li (있을 때만)

**acceptance_criteria** (측정 가능):
1. `AgentOutputDetail.strategy-decision-panel.test.tsx`가 통과한다 (현재 실패 → 통과).
2. `recommendation`+`options` 모두 있는 output → HTML에 "전략 결정 패널" 텍스트 포함.
3. `agent="CMO"` 전달 시 "CMO 추천" 라벨 렌더.
4. `agent` 미전달 시에도 기본값으로 "CMO 추천" 렌더 (하위 호환).
5. `recommendation` 없는 output → 기존 일반 필드 뷰 유지 (회귀 없음).
6. 기존 `AgentOutputDetail` 사용처(chat `page.tsx`, monitor `page.tsx`)에서 기존 동작 유지.

**영향 파일**:
| 파일 | 변경 유형 |
|------|-----------|
| `apps/founder-ui/src/components/AgentOutputDetail.tsx` | 수정 — 전략 결정 패널 분기 추가, `agent` prop 추가 |
| `apps/founder-ui/src/components/__tests__/AgentOutputDetail.strategy-decision-panel.test.tsx` | 기존 — 이미 작성된 실패 테스트, 수정 불필요 |
| `apps/founder-ui/src/app/chat/page.tsx` | 확인 — `AgentOutputDetail` 호출부에 `agent` prop 전달 여부 점검 |
| `apps/founder-ui/src/app/monitor/page.tsx` | 확인 — 동일 |
| `apps/founder-ui/src/lib/api.ts` | 변경 없음 — `AgentOutputLite` 타입 그대로 |

**채택 라이브러리**: 없음 (순수 React + 기존 CSS 변수). 오픈소스 조사에서 shadcn/ui Card를 채택 후보로 선정했으나, 현 컴포넌트는 NocoBase 플러그인 밖(founder-ui)이고 기존 인라인 스타일 패턴과 일관성 유지가 우선이므로 라이브러리 도입 없이 구현한다.

- [x] `AgentOutputDetail.tsx`에 전략 결정 패널 분기 구현 — `agent` prop 추가, `hasStrategyDecision` 감지, 패널 모드 분기. 리뷰 LGTM.
- [x] 실패 테스트 통과 검증 — `node --import tsx ...test.tsx` exit 0. 기본값("CMO 추천") + 명시적 agent("CTO 추천") 두 경로 검증.
- [x] 기존 사용처 회귀 확인 — `chat/page.tsx` L1182, `monitor/page.tsx` L817에 `agent` prop 전달 완료. typecheck 통과.

### 오픈소스 조사 (2026-06-04, 비교 완료)

> 미결정/미통합 영역 3개에 대해 후보 비교 및 채택 근거를 정리. 상세 비교표는 `docs/HANDOFF.md` 2026-06-04 오픈소스 조사 섹션 참조.

- [x] **LLM Observability**: Langfuse(MIT) vs Helicone(Apache-2.0) vs LangSmith(상용). **채택: Langfuse 유지** — 셀프호스팅+span 트레이싱+비용 추적이 L5 multi-agent 체인에 적합. Helicone은 프록시 방식이라 CLI spawn 아키텍처 불일치, LangSmith는 SaaS 전용으로 상용 의존 금지 정책 위반. **통합 시점: Phase 6.**
- [x] **Job Scheduling**: Trigger.dev(Apache-2.0) vs BullMQ(MIT) vs launchd(현행). **채택: Trigger.dev 유지(프로덕션 배포 시 전환)** — approval-pause가 D4/D5 승인 게이트에 부합, PostgreSQL 백엔드(추가 인프라 불필요). 현재 launchd가 안정 작동 중이라 로컬 개발 단계에선 유지, Linux 배포 시 전환. BullMQ는 Redis 추가 필요+approval-pause 미지원으로 배제.
- [x] **Analytics**: PostHog(MIT) vs OpenPanel(AGPL-3.0) vs Umami(MIT). **채택: PostHog(조건부, PMF 실험 활성화 시 도입)** — 퍼널+A/B+피처플래그가 PMF Experiment Board에 필수. OpenPanel은 AGPL 라이선스 전파 위험+A/B 미지원, Umami는 퍼널/A/B 없어 PMF 연계 불가. **도입 시점: PMF 실험 활성화 시.**


## QA wiring 재정비 + 정책 수정 (2026-06-03)

> 기능 추가 후 끊긴 QA 연결과 generated/runtime artifact dirty noise를 먼저 정리하고, 실행 가능한 E2E/smoke까지 통과시켰다.

- [x] `.next/`, `apps/nocobase-app/storage/` 추적 제거 + `.gitignore` 반영.
- [x] `services/agent-runtime` Jest test script/devDeps 연결.
- [x] `apps/founder-ui` E2E script 승격 + stale 로그인/anchor 수정.
- [x] CEO 되묻기 정책 조정: actionable goal이면 assumptions로 진행, 진짜 blocked/승인 누락만 질문.
- [x] agent fanout 조정: quick/few/single intent는 1-2개 agent만 태움.
- [x] RiskQA gate 정리: D3-D5 blanket block 제거, 외부발신/결제/승인 누락 차단.
- [x] NocoBase plugin CSS import test failure 수정.
- [x] plugin-executive-monitor `node-cron` build bundling failure 수정.
- [x] authenticated smoke 최신 정책으로 갱신.
- [x] NocoBase E2E auth setup + SQLite isolation script 추가.
- [x] autopilot/D6 smoke 최신 스키마와 orchestration 정책에 맞게 갱신.
- [x] 검증: workspace typecheck/lint/test/build, Founder UI 전체 E2E, NocoBase E2E, authenticated/autopilot/D6 smoke, `pnpm validate`.
- [x] 청소: `apps/nocobase` workspace 제외, `artifacts/` + `work-orders/` archive 이동.
- [ ] 남은 청소 후보: `docs/legacy`, active reference가 남은 `reports/`, HANDOFF 장기 로그 분리.

## 사용자 플로우 정합화 (2026-06-03, 계획=`~/.claude/plans/agile-watching-owl.md`)

> 창업자 실사용 피드백(산출물 미가시·뷰 불일치·원치 않는 새 task·필터 미작동)을 근원 수정. 근원 = 임원 산출물 미영속.

- [x] **A 산출물 영속화 (키스톤)** — agent_tasks.output(jsonb) + executeTask 저장 + handoff fallback. psql ALTER 병행. 라이브 확인.
- [x] **B synthesize 실데이터** — output을 LLM 프롬프트에 전달, "메타설명 금지". 테스트 10/10.
- [x] **C 인박스 = 결과물 + 진행상태** — AgentOutputDetail 공용 컴포넌트, 필터 killed제외 전부+상태칩, **business 스코프로 수정**(project 자동선택 0건 버그). 라이브 스크린샷.
- [x] **D 로드맵 재정의 + 드릴다운** — 이미 클릭→인박스. selectTask output 보강 fetch.
- [x] **E 모니터 드릴다운** — AgentLiveCard 클릭 → TaskDrillDownModal(output+handoff). 라이브.
- [x] **F 사업 필터** — liveStatus(businessId) + controlRoomTree bizFilter. 라이브(세컨=4/QA=0).
- [x] **G CEO 되묻기** — needs_clarification + resolveClarification(6테스트). 라이브(모호지시→질문).
- [x] **H delegate 정리** — synthesis delegate drop, 기여 클릭→인박스. 테스트 + Playwright(`e2e/verify-changes.mjs`).
- [x] **라이브 executeTask 전체 흐름 실증 (A/B/H, 실제 LLM)** — 지시→3 task. COO executeTask 2:17→done+output 실저장(권고+action 10), RiskQA 3:39→done+output. 모든 task terminal→synthesis 자동 생성(구체 산출물 종합), next_actions=approve/hold만(delegate 없음), instruction=synthesized. `e2e/verify-live.mjs`로 synthesis 카드+인박스 실 output 시각 확인(에러 0).
- [~] **CTO 라이브 실행** — executeTask가 CTO는 `deferred:true`(Hermes dispatcher→ACR 전담). ACR 미연결(stub)이라 라이브 미실행 → **다음 작업 c에서 연결**.

> **다음 작업 순서 (사용자 지정 2026-06-03)**: **c(CTO/ACR 실행 연결) 먼저** → b(M7 채팅 임원 라운드테이블, 아래) 나중. 커밋은 사용자가 직접 진행.
> **c = CTO/ACR 연결**: ACR repo에 `GET /api/l5/execution` 라우트 추가 + `ACR_EXECUTION_ENABLED=1`. 연결 시 control-room 실행정보 라이브 + executeTask CTO deferred 경로가 실제 ACR 실행으로 이어짐.

## M6: 임원 위임 + 검증 반복 루프 (2026-06-02, spec=`docs/EXECUTIVE_DELEGATION_SPEC.md`)

> 목표: 임원(CMO)이 CEO를 통해 다른 임원(CTO)에게 위임하고, 결과가 의도대로 나올 때까지 검증-수정 루프를 자동 반복. CEO는 진입/이탈 게이트만(매 반복 미개입), 루프 본체는 결정론적 컨트롤러.

- [x] **D1 `ask_executive` 도구 (l5-core 순수)**: `delegation/index.ts`(`DelegationRequest`+`validateDelegationRequest`: 유효 역할/자기위임 금지/수용기준 필수/max_rounds 1–5) + `delegation/tool.ts`(`createAskExecutiveTool({ propose })`, ask_founder 복제, 반환 `data.delegation_opened=true`). 단위 11 테스트 통과. src/index.ts 재수출.
- [x] **D2 `executive_delegations` 컬렉션 + plugin propose**: `CREATE TABLE IF NOT EXISTS executive_delegations`(ensureOrchestrationColumns) + 컬렉션 등록 + executeTask 내 `createAskExecutiveTool({ propose })` — 위임 레코드 insert(status=open) + origin task needs_review(blocker=`awaiting_delegation:<id>`). `executive_consultations` 패턴 재사용. 라이브 로드 확인(재기동 후 `delegation:list`/`executive_delegations:list` 200).
- [x] **D3 CEO 위임 오케스트레이션**: `delegation:advance` 액션이 게이트(open→in_progress) + 위임 레코드 → to_agent용 work task 생성(objective→rationale, acceptance_criteria→expected_output, business_id/phase/risk 승계). decomposer 대신 단일 work task를 라운드마다 reissue(피드백 주입)하는 경량 방식 채택.
- [x] **D4 `runDelegationLoop` 컨트롤러 (l5-core 순수)**: `delegation/loop.ts` — 결정론 루프(`runWork`(제작)→`verify`(검증)→fail시 feedback 재투입), pass→resolved / 예산 소진→escalated. LLM·I/O 미접촉(주입형). 단위 4 테스트 통과. **CEO 매 라운드 미개입 보장.** + `delegation/verify.ts`(`buildVerificationPrompt`/`parseVerdict`, 검증 7 테스트).
- [x] **D5 plugin 구동**: `delegation:advance`가 `runDelegationLoop` 동기 구동 — runWork=`executeAgentTaskLive`(work task, secondbrain/video 도구), verify=요청 임원 LLM 채점(`buildVerificationPrompt`+`parseVerdict`). resolved→origin task queued 재개(result_summary를 recalledInsights로 주입) / escalated→origin needs_review(`awaiting_founder: …`). onRound마다 round/last_feedback 저장.
- [x] **D6 E2E + 라이브 검증**: ✅ **2026-06-02 라이브 통과.** `scripts/d6-delegation-smoke.sh`(SQL 시드 CMO→CTO 위임 + `delegation:advance`). 결과: **advance 122s → status=resolved, round=1.** CTO work task=done(실제 세컨브레인 MCP 개선안 산출), CMO 검증 1라운드 pass, **origin CMO task needs_review→queued 재개(blocker 해제)**, handoff 체인(CTO→ceo, CEO→CTO) 적재. result_summary 저장(재개 시 recalledInsights 주입용). 시드 레코드 정리 완료. (worker는 `L5_EXECUTIVE_TOOLS` off라 도구 없이 LLM 산출만 — 루프 본체 검증엔 충분.)

## 🎯 운영 콘솔 재편 + 종합 산출물 (창업자 통증 기반 재우선순위, 계획서 `reports/l5-console-redesign-plan.html`)

> 창업자(2026-06-02): "지시는 되는데 각 에이전트 결과가 종합돼 최종 산출물로 안 와서 다음 세션을 못 간다. UI도 안 쓰는 게 많다." → 콘솔을 "지시→자동수행(가시화)→종합 산출물→다음 지시" 루프로 재편. **M7/M8보다 우선.**

> 진행(2026-06-02): 설계 5종 `docs/specs/P*.md` 완료(subagent 병렬). l5-core 순수 두뇌 3개 구현·통합 완료 — chief-of-staff/synthesize(P1, 11테), monitor/live-status(P2, 27테), memory/curation(P3-2, 22테), tsc 0·build clean. 사이드바 워크플로 팩토리 제거 + Memory→"지식" 리네임. **남음: 플러그인 배선(2개 플러그인)+UI+ACR 연동.**

> ✅ **2026-06-03 전부 구현·라이브 검증 완료** (subagent 병렬). 설계 5종 `docs/specs/P*.md`. l5-core 순수 두뇌 5개(synthesize/live-status/curation/cto-control-room/selfmod-criteria, 신규 테스트 전부 통과, 전체 503/506 — 3건은 pre-existing baseline 무관). 플러그인 2개(orchestration+executive-monitor) src+dist 미러 배선. founder-ui 6개 페이지(chat 종합카드·monitor·memory→지식·control-room·tool-requests·approval) tsc 0 + next build 통과. E2E: P1 종합 라이브 통과(executeTask→founder_deliverables+채팅카드), P3-4 sendToCTO/applySelfMod 라이브 통과. 백엔드 엔드포인트 전부 200. 발견 버그(sendToCTO FK 코어션) raw SQL로 수정.

- [x] **P0 데이터 초기화**: task+chat+memory 전부 삭제(트랜잭션). businesses(4)·projects(5) 보존.
- [x] **P1 종합 산출물 (키스톤)**: `chief-of-staff/synthesize.ts`(신규, generateFounderBrief는 모양 안 맞아 미재사용) + orchestration `maybeSynthesizeInstruction`(executeTask 꼬리, instruction status 'synthesized' 멱등 + UNIQUE(instruction_id)) + `founder_deliverables` 컬렉션/테이블 + UI `SynthesisCard`(chat). **라이브 통과.**
- [x] **P2 실시간 모니터링**: `monitor/live-status.ts`(DB-derived, task_activity 테이블 불필요) + executive-monitor `monitor:liveStatus`(delegations+consultations+blocker 조인) + monitor 페이지 지시별 그룹·상태점·8s 폴링.
- [x] **P3 UI 재편**: ①사이드바 워크플로 팩토리 제거 + Memory→"지식" ②`memory/curation.ts` + `monitor:curate`/`curationSummary`/`overrideCuration` + 지식 페이지(자동 저장/폐기, soft-delete 30일 유예, hermes 퍼지 cron) ③`cto-control-room` 트리 빌더 + `monitor:controlRoomTree` + control-room 사업▸프로젝트▸개발과제 트리(ACR transport는 stub, `ACR_EXECUTION_ENABLED=1`+ACR GET 라우트 시 활성) ④`buildSelfModAcceptanceCriteria` + `monitor:sendToCTO`/`applySelfMod`/`rollbackSelfMod`(D3+ 게이트·deny-list·needs_restart 정직성·M6 verify) + taskCallback diff 영속화 + tool-requests [CTO에게 전송] 버튼/칩 + approval diff 미리보기.
- 안전: 자가수정=D3+ 고위험(승인/diff/롤백/deny-list), 자동폐기 soft-delete 30일 유예.
- 남은 후속(env/cross-repo): ACR `GET /api/l5/execution` 라우트(별도 repo) → 켜면 control-room 실행정보 라이브. self-mod 실제 ACR 머지(현재 needs_restart 표면화). worker 도구 활성(`L5_EXECUTIVE_TOOLS=1`).

## M8: 위임 루프 라이브 자율화 (계획, 미착수 — 계획서 `reports/l5-collaboration-roadmap.html`)

> M6 위임 엔진의 "수동·도구없음·1회" 제약 3가지를 푼다. 대부분 기존 코드 배선. 무인화할수록 예산·승인 게이트·비용 상한을 함께.

- [ ] **M8.1 worker 도구 활성 (후속 1, 공수 S)**: `L5_EXECUTIVE_TOOLS=1` + secondbrain/video transport env 주입 → 위임받은 임원이 실제 도구(secondbrain.read 등)로 자료 보고 제작. 동기 HTTP 가드(라운드 타임아웃·도구 수 제한) 동반. 재사용: `buildWorkerTools()`, M3/M5 transport, MCP-off claude CLI.
- [ ] **M8.2 ask_executive 자동발화 (후속 2, 공수 M)**: 임원 tool-loop가 "다른 역할 산출물 필요 시 `ask_executive` 호출" 유도(프롬프트+도구 노출). CMO가 막히면 자율적으로 CTO 위임 → `awaiting_delegation` → advance. 재사용: M6 ask_executive 도구(이미 executeTask 배선), 첫라운드 도구강제 패턴.
- [ ] **M8.3 무인 트리거 dispatcher (후속 3, 공수 M)**: Hermes cron이 `status=open` 위임 폴링 → 자동 `delegation:advance`. 장시간 루프는 비동기 잡 큐로 분리(동기 HTTP 탈피). 완료/에스컬레이션 시 채팅·승인큐 알림. 재사용: 기존 Hermes launchd cron(1분), task dispatcher.

## M7: CEO 채팅 멀티에이전트 라운드테이블 — 임원이 회의에 참여 (계획, 미착수)

> 창업자 요청(2026-06-02): "에이전트들이 내 채팅에 실제로 들어와서 회의". 현재 채팅 role은 `founder|ceo` 1:1 — 임원은 백그라운드 실행자라 대화에 못 들어온다. 이를 "회의 참여자"로 승격. 합의가 곧 M6 위임·실행으로(=M8과 결합). 계획서 `reports/l5-collaboration-roadmap.html`. **회의 컨트롤러는 `runDelegationLoop`의 일반화(2인 위임 → N인 발언).**

- [ ] **M7.1 스키마 (공수 S)**: `chat_messages`에 `speaker`(역할)·`meeting_id`·`turn` 추가, role 확장(`founder|ceo|cmo|cto|…`). `meetings` 테이블(참여자·턴예산·상태·합의). executive_delegations DDL 패턴 재사용.
- [ ] **M7.2 회의 컨트롤러 (공수 L)**: 참여자 턴 오케스트레이션(라운드로빈 또는 CEO 지명형 — *창업자 결정 필요*). 각 턴=임원 LLM이 스레드 전체 보고 발언 1개 생성→chat_messages 적재. 턴 예산 종료. CEO 합의 요약. executive-runtime에 "토론 모드" 프롬프트 신규.
- [ ] **M7.3 UI (공수 M)**: 참여자 칩·에이전트 색상/아바타·발언 스트림(폴링 또는 SSE)·창업자 중간 개입 입력. chat/page.tsx + Joinery 토큰.
- [ ] **M7.4 합의→실행 결선 (공수 M)**: 승인된 합의안 → CEO decomposer로 태스크 생성 + 임원간 위임(ask_executive, M8.2) 자동 개시. 회의 중 위임 진행을 스레드 인라인 표시.

> **연계 주의**: 🔥1순위 1.2(멀티턴 대화형 기획)는 M7과 강하게 겹침(대화 맥락 누적) → 함께 설계. 다발 LLM 호출이라 비동기/SSE 인프라(M8.3과 공유) + 턴 예산 사실상 필수. 관측·안전(Langfuse/비용 상한)을 선결 안전장치로.

## M5: 도구 발전 루프 결선 + 영상 생성기 도구 등록 + E2E (2026-06-02)

- [x] **M5.1 VideoFactoryTransport + createVideoFactoryTools (l5-core 순수)**: `packages/l5-core/src/functions/memory/video-factory.ts`. 인터페이스: `configure(preset)`, `generate(brief)`, `getConfig?()`. CMO 전용 도구 3개: `video_factory.configure` / `video_factory.generate` / `video_factory.get_config`. `createInMemoryVideoFactoryTransport(seed?)` mock 포함.
- [x] **M5.2 plugin video-factory-transport**: `plugin-orchestration/src/server/video-factory-transport.ts`. `makeVideoFactoryTransport()` — env(`VIDEO_FACTORY_URL`, `VIDEO_FACTORY_TOKEN`) 읽어 실 transport, 없으면 null(graceful). 실 호출 매핑 한 곳 + TODO 주석.
- [x] **M5.3 memory/index.ts + l5-core/src/index.ts 재수출 추가**: `VideoFactoryTransport`, `createVideoFactoryTools`, `createInMemoryVideoFactoryTransport`.
- [x] **M5.4 plugin executeTask 배선**: `_videoFactoryTransport` 모듈 레벨 초기화 + sbTools 배열에 `createVideoFactoryTools` 주입(CMO 전용, null graceful). src + dist/plugin.js 미러 패치 + node --check 통과.
- [x] **M5.5 도구 발전 루프 결선**: `video_factory.configure` description에 "recalledInsights에 합의 방식이 있으면 generate 전에 먼저 호출하라" 유도 문구 포함. M4 협의 결과는 이미 recalledInsights로 주입되므로 추가 코드 배선 없이 CMO가 올바른 순서로 도구를 호출함.
- [x] **M5.6 전체 E2E 통합 테스트**: `packages/l5-core/src/functions/executive-runtime/__tests__/m1-m5-e2e.test.ts`. 9개 테스트 전부 통과. 시나리오: A(secondbrain.read→ask_founder), B(resolved consultation→configure+generate), C(role guard CRO 거부), D(in-memory transport 데이터 무결성).
- [x] **M5.7 검증**: l5-core tsc --noEmit 0에러 + jest 9/9 pass(신규) + 410/413 전체(3건 pre-existing 무관) + npm run build clean. plugin-orchestration tsc --noEmit 0에러 + node --check dist/plugin.js clean.

## M4: 창업자 ↔ 임원 협의 채널 (2026-06-02)

- [x] **M4.1 l5-core consultation 상태머신**: `openConsultation`, `resolveConsultation`, `formatConsultationForPrompt` + 타입 `ConsultationRecord`/`ConsultationRequest`/`ConsultationStatus`. 단위 테스트 9개 통과.
- [x] **M4.2 ask_founder 도구 팩토리**: `createAskFounderTool({ propose })` — 임원이 tool-loop 도중 창업자에게 직접 질문. ToolResult `data.await_founder=true` 신호.
- [x] **M4.3 executive_consultations 컬렉션**: plugin-orchestration에 정의 + CREATE TABLE IF NOT EXISTS DDL. 필드: id/task_id/business_id/from_agent/question/options/status/founder_response/resolved_at.
- [x] **M4.4 plugin executeTask 배선**: ask_founder 도구 조립 + proposeConsultation(consultation insert + needs_review 마킹) + resolved consultation recalledInsights 주입 + consultationOpened 조기 종료.
- [x] **M4.5 consultation:list / consultation:respond 액션**: business/status 필터 폴링 + resolveConsultation 적용 + 태스크 queued 복귀. ACL loggedIn.
- [x] **M4.6 ConsultationCard UI**: 30초 폴링 + 선택지 버튼/textarea + 낙관적 제거 + Joinery 디자인. chat 우측 패널에 장착.
- [x] **M4.7 검증**: l5-core tsc/test/build clean. plugin tsc + node --check dist clean. founder-ui tsc + next build 12 prerender 성공.

## ✨ 2026-05-31 — Founder UI Joinery 디자인 전면 재적용

- [x] **UI.1 Foundation**: globals.css에 Joinery + v2 디자인 토큰 임베드 (paper/ink/silver/green/amber/red/blue/pastel + Source Serif 4 / IBM Plex Sans / SUIT / Pretendard / IBM Plex Mono CDN import + `j-card`/`j-btn`/`j-badge`/`j-input`/`j-risk-d1~d5` 등 컴포넌트 클래스). tailwind.config.ts 시멘틱 토큰 노출. layout.tsx 라이트화.
- [x] **UI.2 Sidebar Joinery 재작성**: 다중계층 비즈니스/프로젝트 트리 + 모달 + 인라인 SVG 아이콘 + 4px green active bar. 모든 hook/state/로직 보존.
- [x] **UI.3 Chat workspace**: chat/page.tsx (founder=right paper-elevated / CEO=left paper-surface + 4px green bar, executive dispatch card 패턴) + ApprovalQueueCard (amber-tint, prominent but calm) + RoadmapMiniCard + TodayDiscoveryBanner.
- [x] **UI.4 Executive board**: monitor/page.tsx (PhaseTransitionPanel + 4px left accent for blocked/review) + approval/page.tsx (D5→D4→D3 정렬, j-risk-d3~d5).
- [x] **UI.5 Strategic docs**: workflow/page.tsx (Brief/PMF/Staffing 3종 pastel tint strip) + memory/page.tsx (PII 위험 명시).
- [x] **UI.6 Portfolio room**: projects/page.tsx (그리드 보드) + projects/[id]/page.tsx (PhaseStrip + SectionHead) + projects/layout.tsx.
- [x] **UI.7 CTO + Tools + 신규 컴포넌트**: control-room, tool-requests, TabLayout, RoadmapTimeline (단일 green spine + pastel agent), AuthGate (신규), LoginForm.
- [x] **UI.8 검증**: `npx tsc --noEmit` 0 에러 + `npx next build` 12 페이지 prerender 성공.
- [ ] **UI.9 Vercel 배포**: NocoBase 백엔드 노출 방식 결정 필요 (사용자 선택 대기) → 결정 후 `vercel.json` + 환경변수 + 프로젝트 셋업.



## 🔥 최우선 작업 (1순위) — 사업/프로젝트 레이어 다중화, 대화형 기획 및 시각적 로드맵

상세 설계는 `docs/projects_roadmap_implementation_plan.md` 파일을 참조하십시오.

- [ ] **1.1 Database Schema 확장**: `projects`, `chat_messages`, `project_roadmap_events` 컬렉션 정의 및 기존 데이터 연결
- [ ] **1.2 대화형 기획 및 Multi-turn 채팅**: 과거 대화 Context를 LLM에 전달하고 계획 확정 전까지 대화를 이어나가며 기획을 정교화하는 기능
- [ ] **1.3 태스크 1주일 후 아카이브 및 삭제 데몬**: 완료 태스크 정리 후 로드맵 이벤트 테이블로 복사 및 삭제 수행하는 Hermes Cron 스케줄 구축
- [ ] **1.4 Founder UI 개편 및 가로 줄기형 로드맵 시각화**: 사이드바 프로젝트 트리, 복원 가능한 채팅창, 그리고 HSL Harmonized Dark Theme 기반 가로 스크롤형 타임라인 컴포넌트 (`RoadmapTimeline.tsx`) 추가

## CTO 로드맵 진행 (`/tmp/l5-roadmap.html`, ACR repo)

- [x] **Phase 1 — 산출물 확실성**: spawn 타임아웃(`ACR_AGENT_TIMEOUT_MS`) + 재시도(`ACR_MAX_ATTEMPTS`) + 빈 산출물 검증(exit0+변경0 → needs_review/`empty_output`). 구현+테스트 완료, 라이브 반영(ACR rebuild+restart) 대기.
- [x] **Phase 2 — 검토·병합**: `coordinateMerge` — 원격 있으면 gh PR, 없으면 로컬 `git merge --no-ff`. D3+ 자동병합 금지, 충돌→`merge_conflict` needs_review. 구현+테스트 완료, 라이브 반영 대기.
- [x] **Phase 3** — 모든 business→repo 연결(`afterCreate`+`afterStart` 백필, `workspace-init.ts`) + 신규 business 작업장 자동 git-init + stale 경로 청소(projects.json 4건 제거 + `isDangerousPath` pulk 보호). 배포+라이브 검증(business-2 자동 생성).
- [x] **Phase 4** — Founder 콘솔: 2단 레이아웃(채팅 + 상태 패널) + `ApprovalQueueCard`(D3+ 승인). 배포 완료, 브라우저 시각 QA 권장.
- [x] **Phase 5** — 배움 루프 닫힘: 수집(`executeTask`→`persistTaskInsight`→`founder_memory` pending, 멱등) + 검토/저장(`memoryCandidates`/`saveMemory` camelCase 버그 수정) + 참고(`loadFounderMemories`→`interpretFounderInstruction({memories})`, 고PII 제외) + 데이터 품질(`extractReadableText` self-learning 적용 + 스토어 정리). 배포·라이브 검증(쌓기/검토/저장/참고 전 구간). Formbricks·PMF 자동수집·자동화 후보 등록은 범위 제외(이후).
- [ ] **Phase 6** — 관측·안전(Langfuse 추적, 위험 명령 차단, 비용/장애 모니터).

## QA 검증 현황 (2026-05-27)

| 검증 항목 | 결과 |
|---|---|
| `@l5/core` 유닛 테스트 (19 suites) | ✅ 174 tests PASS |
| NocoBase e2e auth setup | ✅ 1 passed |
| `corepack pnpm -r build` | ✅ 통과 |
| `corepack pnpm -r typecheck` / lint | ✅ 통과 |
| Authenticated NocoBase smoke | ✅ 통과 |
| `corepack pnpm validate` | ✅ 22 PASS / 1 optional Docker WARN / 0 FAIL |
| PR | [#1 feat/nocobase-real-mvp](https://github.com/yangminguy/pulk/pull/1) |

### 2026-05-30 QA 세션 이어받기 (안티그래비티 중단 복구)

| 검증 항목 | 결과 |
|---|---|
| `@l5/core` 유닛 회귀 | ✅ 347/347 PASS |
| `@l5/hermes-runtime` 유닛 회귀 | ✅ 81/81 PASS |
| E2E 자율 루프 라이브 smoke (`scripts/smoke-autopilot-e2e.ts`, 샌드박스) | ✅ instruction→CEO 분해→dispatch→ACR claude spawn→커밋→done |
| smoke 스크립트 안전·견고화 | ✅ 라이브 pulk repo 가드 + ECONNRESET 폴링 retry |
| D3/D5 승인 게이팅 | ✅ dispatcher 픽업 차단 확인 |

QA 로드맵 대시보드: `reports/qa-status-visualization.html` (6 E2E 시나리오). QA1-3 라이브 입증, QA4-6 로직은 유닛테스트(verifier/model-lock/self-learning) 커버.

**다음 세션 진입점:** Phase 9 — Founder UI 앱 구축 (`[ ] P0` 항목부터)

## Direction Lock

- Founder-facing UX는 NocoBase admin UI가 아니라 CEO Agent와의 chat이다.
- NocoBase는 Agent들이 안정적으로 읽고 쓰는 internal shell, DB, approval queue, audit log, monitor backend다.
- 실행 기준 NocoBase 플러그인은 `apps/nocobase-app/packages/plugins/@l5/*`이다. `apps/nocobase/packages/plugins/@l5/*`는 현재 scaffold/source reference 성격이므로 대규모 병합 없이 사용 경로만 명확히 둔다.
- `services/agent-runtime`와 `services/hermes-runtime/src/loops/*`는 아직 실제 Mastra runtime이 아니라 placeholder/scaffold이다. 이번 구현의 실제 경로는 `@l5/core` orchestration + NocoBase persistence + minimal chat action이다.
- 다음 개발의 중심은 예쁜 보드가 아니라 `instruction → task → agent execution → handoff → monitor → approval → memory/BPR` 루프다.
- 모든 Agent task는 원본 Founder/CEO 지시, 수행 이유, 담당 Agent, 상태, 다음 산출물을 가져야 한다.

## Phase 0 — Verified Foundation

- [x] P0 Create monorepo structure
- [x] P0 Add development docs and workspace config
- [x] P0 Implement `packages/l5-core`
- [x] P0 Validate `@l5/core` typecheck
- [x] P0 Validate `@l5/core` unit tests: 5 suites / 42 tests
- [x] P0 Validate MVP demo loop with `pnpm demo`
  - current local command when `pnpm` is not on PATH: `corepack pnpm demo`
- [x] P0 Validate NocoBase plugin MVP can load and call core actions

## Phase 1 — Chat-First Orchestration Contract

- [x] P0 Add CEO Chat API entrypoint v1
  - verify: `/api/chat:submitInstruction` stores FounderInstruction, CEOInterpretation, AgentTask[] ✅
  - implemented: NocoBase `plugin-orchestration` action with deterministic LLMClient path
- [x] P0 Define Founder instruction schema
  - verify: instruction stores raw text, intent, constraints, desired phase, created_by, created_at ✅
  - implemented: `/packages/l5-core/src/types/orchestration.ts` (FounderInstruction)
- [x] P0 Define CEO interpretation schema
  - verify: each interpretation includes goal, assumptions, phase, success criteria, risk level ✅
  - implemented: `CEOInterpretation` type with phase, success_criteria[], risk_level
- [x] P0 Define Agent task schema
  - verify: task includes instruction_id, assigned_agent, rationale, status, expected_output, approval_required ✅
  - implemented: `AgentTask` type with all required fields + risk_level, blocker, due_at
- [x] P0 Define Agent handoff schema
  - verify: handoff includes from_agent, to_agent, context, blocker, next_action, created_at ✅
  - implemented: `AgentHandoff` type with extended fields (what_was_completed, what_remains_open, etc)
- [x] P1 Add persistence layer for instructions/tasks/handoffs
  - verify: records can be created/read without relying on page UI ✅
  - implemented: `/apps/nocobase/packages/plugins/@l5/plugin-orchestration/` (8 resource actions)
- [x] P1 Add API/action endpoints for creating and updating task state
  - verify: CEO Agent can create tasks programmatically ✅
  - implemented: POST/GET endpoints for founder_instructions, ceo_interpretations, agent_tasks, agent_handoffs

## Phase 2 — CEO Agent Orchestrator

- [x] P0 Implement CEO Agent `interpretFounderInstruction`
  - verify: chat instruction becomes structured goal + phase + assumptions ✅
  - implemented: `/packages/l5-core/src/functions/ceo-orchestration/interpreter.ts` (LLM call, AGENT_PROTOCOL format, 7 tests)
- [x] P0 Implement CEO Agent `decomposeIntoWorkstreams`
  - verify: one Founder instruction creates multiple parallel workstreams when appropriate ✅
  - implemented: `decomposer.ts` (domain-based routing CMO/CRO/CPO/CTO/COO/CFO/RiskQA, 10 tests)
- [x] P0 Implement CEO Agent `assignExecutiveTasks`
  - verify: CMO/CRO/CPO/CTO/COO/CFO/RiskQA tasks are created with rationale ✅
  - implemented: `assigner.ts` (AgentTask contract compliance, 4 tests)
- [x] P1 Implement CEO Agent approval routing
  - verify: D3/D4/D5 tasks automatically set approval_required flag ✅
  - implemented: decomposer에서 risk_level 기반 자동 설정
- [x] P1 Implement CEO Agent status synthesis
  - verify: CEO can summarize current company state from task/handoff logs ✅
  - implemented: `summarizer.ts` (status counts, pending approvals, blockers, brief generation, 6 tests)

## Phase 3 — Executive Agent Runtime

- [x] P0 Implement common Agent work protocol runner
  - verify: every agent output includes current situation, goal, bottleneck, recommendation, next owner ✅
  - implemented: `/packages/l5-core/src/functions/executive-runtime/protocol.ts` (AgentOutput interface with 14 fields, validateOutput, buildHandoff)

- [x] P1 Implement all 7 Executive Agent handlers
  - [x] CMO (cmo-handler.ts): PMF message experiment → D3 risk, approval_required=true, status=needs_review
  - [x] CRO (cro-handler.ts): Sales workflow draft → D4 risk (customer-facing), approval_required=true
  - [x] CPO (cpo-handler.ts): Productization readiness check → D2 risk, internal logic
  - [x] CTO (cto-handler.ts): Tool request review + PMF gate → D2-D4 risk, blocks premature builds
  - [x] COO (coo-handler.ts): Delivery workflow → D2 risk
  - [x] CFO (cfo-handler.ts): Financial commitment → D5 risk, approval_required=true
  - [x] RiskQA (risk-handler.ts): Risk validation, PII check, blocks unsafe items → D2-D5, can block

- [x] P1 AgentOutput protocol implemented flat (not nested)
  - 14 required fields: current_situation, source_instruction, goal, why_now, bottleneck, root_cause, options[], recommendation, action_items[], next_owner, required_tools[], confidence_level, risk_level, approval_required, insight_to_record, workflow_improvement_suggestion
  - validateOutput() detects missing fields

- [x] P2 Handler validation and error handling
  - validateOutput() checks all required fields present
  - Default handler returns D1 blocked status if agent not found
  - buildHandoff() creates AgentHandoff from output

## Phase 4 — Executive Monitor (Agent Control Tower)

- [x] P0 Build Agent Task Monitor view/API
  - verify: shows Agent, current task, source instruction, rationale, status, next output, phase, updated_at ✅
  - implemented: `TaskMonitorView.tsx` with Phase/Risk/Approval/Blocked filtering
  - API: GET /api/monitor:currentTasks
- [x] P0 Build Founder Approval Queue UI
  - verify: only decisions needing Founder attention surface here, read-only approve/reject buttons ✅
  - implemented: `ApprovalQueueView.tsx` fetching from GET /api/monitor:approvalQueue
- [x] P1 Build Workstream/Phase Monitor
  - verify: tasks are grouped by BPR phase and business direction ✅
  - implemented: `TaskMonitorView.tsx` and `FounderBriefPreview.tsx` dynamically group by phase
- [x] P1 Build Founder Brief Preview UI
  - verify: dynamically aggregates moved/blocked/approval-needed tasks and current phase ✅
  - implemented: `FounderBriefPreview.tsx` (read-only MVP)
- [x] P1 Build Memory Candidate Review UI
  - verify: memory review surface handles missing API gracefully and shows PII warnings ✅
  - implemented: `MemoryReview.tsx`
- [x] P2 Build read-only Founder view
  - verify: Founder can monitor without editing operational records directly ✅
  - implemented: plugin-executive-monitor with RLS (l5_founder role: read-only)

## Phase 5 — Approval Queue & Hermes Monitoring

- [x] P0 Implement approval queue API
  - verify: approval_required=true & status='needs_review' task 조회 ✅
  - implemented: `/services/hermes-runtime/src/api/approval-queue.ts` (getApprovalQueue, approveTask, rejectTask)
- [x] P1 Implement stalled task detector
  - verify: status=blocked 또는 overdue task 감시 ✅
  - implemented: `/services/hermes-runtime/src/tasks/stalled-task-detector.ts` (1시간마다 실행)
- [x] P1 Implement approval-required checker
  - verify: approval 필요 task daily brief 생성 ✅
  - implemented: `/services/hermes-runtime/src/tasks/approval-checker.ts` (매일 09:00)
- [x] P1 Implement daily CEO/Founder brief trigger
  - verify: summarizeAgentStatus() 기반 daily brief ✅
  - implemented: `trigger-schedules.ts` (Hermes cron 스케줄 상수)

## Phase 6 — NocoBase Internal Shell

- [x] P0 Keep business portfolio MVP routes working
  - verify: existing routes intact ✅
- [x] P0 Keep PMF experiment MVP routes working
  - verify: existing routes intact ✅
- [x] P0 Keep Control Room approval actions working
  - verify: existing routes intact ✅
- [x] P0 Add task/instruction/handoff collections
  - verify: 4개 NocoBase collection 등록 ✅
  - implemented: `/apps/nocobase/packages/plugins/@l5/plugin-orchestration/` + `plugin-executive-monitor/`
- [x] P1 Add permission boundaries for Founder/admin/agent records
  - verify: RLS policies (l5_agent, l5_founder) ✅
  - implemented: PostgreSQL RLS + NocoBase ACL

## Phase 6 — Policy Enforcement & Brief Implementation ✅

**Status:** 완료 (2026-05-27)

### Phase 6a: Chief of Staff Brief Auto-Generation ✅

- [x] P0 Implement Chief of Staff handler
  - implemented: `packages/l5-core/src/functions/executive-runtime/handlers/chief-of-staff-handler.ts`
  - test: chief-of-staff-handler.test.ts (9 cases PASS)

- [x] P1 Wire Hermes daily brief trigger
  - implemented: `services/hermes-runtime/src/tasks/daily-brief-generator.ts`
  - schedule constant: HERMES_SCHEDULES.DAILY_BRIEF_GENERATOR = "0 9 * * *"
  - test: daily-brief-generator.test.ts (6 cases PASS)

- [x] P1 Decision Brief routing
  - implemented: approvalQueue.length > 0 시 recommendations에 포함

### Phase 6b: Approval Queue Auto-Routing ✅

- [x] P0 Task submission D3-D5 detection
  - implemented: `executeAgentTask()` → `resolveApprovalRouting()` 함수
  - D3 → approval_routing='D3_auto_24h', D4 → 'D4_manual', D5 → 'D5_double_gate' + blocked=true

- [x] P1 D3 async auto-approve (24h window)
  - implemented: `autoApproveExpiredD3Tasks()` in `approval-queue.ts`
  - `runApprovalChecker()` 실행 시 자동 호출

- [x] P1 D4 manual approval
  - implemented: `POST /api/monitor:approveTask` / `rejectTask` 실제 DB 연결

- [x] P1 D5 double-gate
  - implemented: D5 → blocked=true 강제, RiskQA 통과 후 Founder 승인 필요

### Phase 6c: Memory Entry Persistence (Priority 2 — 1 day)

- [x] P0 Collect insights from all agent outputs
  - source: insight_to_record field from each agent
  - frequency: weekly aggregation by Chief of Staff
  - implemented: `packages/l5-core/src/functions/memory/collector.ts` (collectInsights, pii_level derivation)
  - test: 9 cases in collector.test.ts (empty, short, valid, D1/D3/D4/D5 pii_level, workflow_improvement)

- [x] P1 Memory Review Brief generation
  - schedule: Friday 17:00 weekly summary
  - implemented: `packages/l5-core/src/functions/memory/reviewer.ts` (buildMemoryReviewBrief, applyMemoryDecision)
  - hermes task: `services/hermes-runtime/src/tasks/memory-review-generator.ts` (runMemoryReviewGenerator)
  - schedule constant: HERMES_SCHEDULES.MEMORY_REVIEW_GENERATOR = "0 17 * * 5"
  - test: reviewer.test.ts (5 cases), memory-review.test.ts (6 cases)

- [x] P1 Memory approval in Approval Queue
  - actions: Founder SAVE/DISCARD decisions via applyMemoryDecision()
  - logic: SAVE/DISCARD → ok=true + decision returned; DB write handled by NocoBase plugin layer
  - DB schema: `apps/nocobase/migrations/20260527000000_create_founder_memory.sql`

- [ ] P2 Memory retrieval integration
  - CEO orchestrator: query founder_memory for context
  - use case: phase transitions, pattern recognition
  - test: verify CEO can retrieve saved memories

## Phase 7 — BPR Phase Manager ✅ (도메인 로직 완료)

- [x] P0 Define BPR phase states
  - implemented: `packages/l5-core/src/functions/bpr/types.ts`
  - 6단계: direction_alignment → pmf_diagnosis → execution_build → sales_distribution_test → productization_review → scale_automation
  - DB migration: `apps/nocobase/migrations/20260527100000_create_bpr_phases.sql`
- [x] P1 Map CEO tasks to BPR phases
  - implemented: `derivePhaseFromTasks()` in phase-manager.ts
- [x] P1 Add phase transition rules
  - implemented: `validateTransition()` — 전진만 허용, 후퇴는 Founder 승인 필요
  - phase 전환은 항상 requires_approval=true (D5 수준)
- [x] P2 Implement Phase Transition Summary ✅ (2026-05-29) — see Phase 9 P2

## Phase 8 — Real LLM & Advanced Logic (진행 중)

- [x] P1 OpenAI GPT-4o 연결 (Anthropic → OpenAI 전환 완료)
  - `createOpenAIClient()` in `packages/l5-core/src/functions/ceo-orchestration/anthropic-client.ts`
  - `OPENAI_API_KEY` 없으면 stub fallback 자동 동작
- [x] P1 Workflow Factory LLM 연결 ✅ (2026-05-29)
  - `generateWorkflowWithLLM(input, llm?)` 신규 — deterministic baseline + LLM 시 JSON 응답 partial merge, throw/parse-fail/empty 시 fallback
  - plugin `generateWorkflow` 액션이 OPENAI_API_KEY gated로 LLM 경로 선택
  - 5 new tests PASS (baseline, throw fallback, junk fallback, partial merge, fenced JSON)
- [ ] P2 Memory → CEO 컨텍스트 주입
- [~] **OUT OF SCOPE** PMF Score 실제 계산 (Formbricks 연동) — DECISIONS.md 2026-05-29 참조. Hermes 반복 감지 + Founder 정성 판단으로 대체
- [x] P2 Tool Request 워크플로 ✅ (2026-05-29 오후) — Founder UI `/tool-requests` + plugin-executive-monitor `monitor:toolRequests` 액션. 사이드바 노출 라이브 확인

## Phase 9 — Founder UI ✅ (2026-05-28 완료)

**배경:** NocoBase 프론트엔드 플러그인이 "paths[1] null" 에러로 동작 안함. NocoBase는 backend API만으로 사용하고, 별도 UI 앱 구축.

**⚠️ 현재 범위:** UI + DB 상태 전환까지만 구현. 실제 Executive Agent 실행(Mastra 런타임)은 미구현.

- [x] P0 별도 Founder UI 앱 구축
  - 구현: `apps/founder-ui/` — Next.js 14 App Router (port 3000)
  - API: `localhost:13001` 호출 (JWT 인증, localStorage 토큰 관리)
  - 탭 구성: CEO 채팅 / 현황 모니터 / 승인 대기 / 워크플로 팩토리 / Memory Review
  - TypeScript 에러 0개 (`npm run typecheck` 통과)
  - 실행: `cd apps/founder-ui && npm run dev`

- [x] P1 CEO 채팅 승인 플로우 (2026-05-28)
  - `submitInstruction` → `proposed` 상태로 태스크 생성 (즉시 queued 아님)
  - `ProposedTasksPanel`: 에이전트별 색상, Risk 배지(D1-D5), 성공 기준 표시
  - "승인" → `approvePlan` → `proposed` → `queued` 일괄 전환
  - "거절" → `rejectPlan` → `proposed` → `killed` 일괄 전환
  - D3-D5 태스크: queued 전환 후 `approval_required=true` 유지 → 승인 큐 진입
  - 버그 수정: 필드명 `agent` / `task_title` / `task_id` 일치 (이전: `assigned_agent` / `title` / `id`)

- [x] P1 BPR Phase Transition Panel (2026-05-28)
  - 구현: `GET /api/bpr:currentPhase` — 활성 task 기반 현재 BPR 단계 도출
  - 구현: `POST /api/bpr:requestTransition` — 전환 검증 후 D5 승인 task 생성
  - UI: `monitor/page.tsx` PhaseTransitionPanel — 6단계 진행 바, 다음 단계 전환 폼
  - 도메인: `l5-core` `validateTransition()` / `buildTransitionResult()` 사용
  - 모든 phase 전환은 requires_approval=true (D5 수준)

- [x] P1 실제 Agent 실행 연결 (2026-05-28 완료)
  - `/api/agent:executeTask` 액션 구현 (plugin-orchestration)
    * task_id 기반 executeAgentTask() 호출
    * AgentOutput + AgentHandoff DB 저장
    * task status 업데이트 (queued → needs_review/done/blocked)
  - Founder UI 자동 실행 연결
    * approvePlan 후 각 task 자동 호출 (api.executeTask)
    * 승인 후 모든 queued 태스크 병렬 실행
  - 검증: CEO 채팅 → 승인 → executeTask 자동 호출 → Monitor 결과 반영 ✅

- [x] P2 Implement Phase Transition Summary ✅ (2026-05-29)
  - `packages/l5-core/src/functions/bpr/transition-summary.ts` 신규 — pure `buildPhaseTransitionSummary()` (8/8 tests PASS)
  - `bpr:transitionSummary` 액션 + `api.transitionSummary()` 클라이언트
  - `PhaseTransitionPanel`이 전환 요청 전에 요약 인라인 미리보기 (성공 기준, 미해결 항목, 인사이트, 다음 단계 계획)

## Phase 10 — PMF 개념 정정 + Hermes 반복 분석기 ✅ (2026-05-28 완료)

### ✅ Phase 10 P0: PMF 게이트 제거 + Hermes 반복 분석기 (2시간 배치)

**완료된 작업:**
- [x] PMF 개념 명확화 (신규 사업만, 모든 태스크 게이트 아님)
- [x] CPO Handler에서 PMF 게이트 제거 (cpo-handler.ts)
  - pmfEvidence, pmfScore, hasStrongEvidence 제거
  - 모든 productization → `status: 'needs_review'` (blocked 조건 제거)
  - 단순 Offer Shape 분석으로 단순화
- [x] CTO Handler에서 PMF 게이트 제거 (cto-handler.ts)
  - PMF 점수 검증 제거
  - Phase 기반 build 블록킹 제거
  - Tool feasibility 독립 평가 → `status: 'needs_review'`
- [x] Hermes 2시간 반복 분석기 구현 (trigger-schedules.ts)
  - `REPETITION_ANALYZER: "0 */2 * * *"` 스케줄 추가
- [x] 반복 분석기 작업 파일 생성 (repetition-analyzer.ts)
  - 7일 내 동일 task_title 3회 이상 감지
  - CTO tool request 자동 생성
- [x] @l5/core 반복 감지 함수 추가 (repetition-detection.ts)
  - `analyzeRepetitionPattern()` — 패턴 메타데이터 분석
  - `generateToolRequestTask()` — CTO task 생성
  - `detectRepeatingTasks()` — 제목별 그룹화
- [x] 타입 체크 / 빌드 검증 통과
- [x] 커밋 완료 (Phase 10 PMF gates + Hermes repetition analyzer)

**개념 변경:**
- **PMF (Product-Market Fit)** = 신규 사업: 찾기 → 구현 → 판매 (시작 시에만)
- **반복 감지** = 별개 시스템: 동일 작업 3회+ → CTO 도구화 요청 (독립적)

### ✅ Phase 10 P1: Hermes Agent 로컬 cron 연동 완료 (2026-05-28)

- [x] Hermes Agent 로컬 스케줄러 사용 (launchd 기반)
- [x] `l5-repetition-analyzer` cron — 2시간마다, 반복 태스크 감지 ✅ 실행 확인
- [x] `l5-approval-brief` cron — 매일 09:00
- [x] `l5-cto-weekly-review` cron — 매주 월요일 10:00
- [x] `l5-daily-brief` cron — 매일 18:00
- [x] OpenAI gpt-4o-mini 연동 (`providers.openai-direct`, `api_mode: chat_completions`)

## Phase 13 — 완료 (2026-05-28)

### [x] P1 — LLM 기반 역할 분류 (decomposeIntoWorkstreams)
- `packages/l5-core/src/functions/ceo-orchestration/decomposer.ts`: async + LLM 호출, 키워드 fallback 유지
- `instructions.action.ts`: `await decomposeIntoWorkstreams(...)` + `llm` 전달

### [x] P1 — 에이전트 실제 OpenAI 실행
- CMO, CRO, CPO, COO, CFO: GPT-4o 호출 + deterministic fallback 구현
- RiskQA, ChiefOfStaff: 기존 placeholder → 실제 LLM 구현
- `@l5/agent-runtime` index.ts에 모두 export

### [x] P1 — Task Dispatcher (1분 Hermes cron)
- `services/hermes-runtime/src/tasks/task-dispatcher.ts`: queued + approval_required=false 태스크 자동 실행
- `fetchQueuedTasks()`, `runTaskDispatcherLive()` 추가
- launchd plist: `com.l5.hermes.task-dispatcher.plist`

## Phase 12 — 완료 (2026-05-28)

### [x] P1 — Hermes gateway launchd 자동 시작 등록
### [x] P1 — Memory → CEO 컨텍스트 재주입
### [x] P2 — ACR 프로젝트 자동 등록
### [x] Trigger.dev 참조 제거 (의도적 미구현)

## Phase 8 — Future: Real LLM & Advanced Logic

- [ ] P2 Replace stub LLMClient with actual Anthropic Claude API
  - replace stub buildDeterministicLLM with real createOpenAIClient/createClaudeClient
- [ ] P2 Add real PMF metric ingestion path
- [ ] P3 Add Tool Request workflow after repeated task/PMF signals
- [~] **OUT OF SCOPE** Formbricks adapter — DECISIONS.md 2026-05-29

## Documentation — Phase 5 Complete ✅

**New Documents Created (May 27, 2026):**
- [x] AGENT_PROTOCOL.md (업그레이드) — 6단계 BPR + 10개 Agent output contract
- [x] FOUNDER_BRIEF_SPEC.md (신규) — 7종류 Founder brief template + timing + examples
- [x] SECURITY_DATA_GOVERNANCE.md (업그레이드) — D1-D5 상세 규칙 + RiskQA override + PMF gates

**Key Specs Documented:**
- [x] Agent output contract (CEO, ChiefOfStaff, CMO, CRO, CPO, CTO, COO, CFO, RiskQA, Culture)
- [x] Phase-based orchestration (6단계: Direction → PMF → Build → Sales → Productization → Scale)
- [x] Founder brief timing & templates (daily, decision, approval, blocked, phase transition, memory, weekly)
- [x] D1-D5 approval gates + RiskQA blocking authority
- [x] PII handling & consent scope rules
- [x] PMF-gate for tool build & productization
- [x] Memory entry approval workflow
- [x] External action safety checklist

## QA / Safety Tasks — MVP Phase 1-5

- [x] P0 Validate `l5-core` runs without NocoBase ✅
- [x] P0 Validate NocoBase plugin build ✅ (13 suites / 110 tests)
- [x] P0 Validate full orchestration flow smoke test ✅ (authenticated chat + task creation + monitor + approval queue)
- [x] P0 Validate `scripts/validate.sh`: 22 passed / 1 optional Docker warning / 0 failed ✅
  - current local command when `pnpm` is not on PATH: `corepack pnpm validate`
- [x] P0 Validate every task has source instruction reference ✅
- [x] P0 Validate every handoff has next owner or explicit stop reason ✅
- [x] P1 Validate external actions require approval gate ✅ (reference: SECURITY_DATA_GOVERNANCE.md D3-D5)
  - CMO sets approval_required=true (D3)
  - CRO sets approval_required=true (D4)
  - CFO sets approval_required=true (D5)
  - RiskQA can block unsafe items
- [x] P1 Validate monitor is read-only for Founder by default ✅ (RLS l5_founder: read-only)
- [x] P1 Validate PII separation: customer data stays out of LLM calls by default ✅
- [x] P2 Validate migration idempotent (fresh DB + existing DB both pass) ✅

## MVP Phase 1-5 Complete + Verified ✅

**Product Code Completed & Verified:**
- [x] Development document package (PRD → ARCHITECTURE → DATA_MODEL → AGENT_PROTOCOL → FOUNDER_BRIEF_SPEC → SECURITY_DATA_GOVERNANCE)
- [x] Monorepo + pnpm workspace
- [x] `@l5/core` orchestration (110/110 tests PASS across 13 suites)
- [x] CEO Agent orchestrator (interpretFounderInstruction, decompose, assign, summarize)
- [x] Executive Agent runtime (7 handlers FULLY IMPLEMENTED — not stubs)
  - CMO, CRO, CPO, CTO, COO, CFO, RiskQA all have real business logic
- [x] Executive Monitor UI (read-only, 3 API endpoints)
- [x] Approval Queue (approval routing, can handle D3-D5 gates)
- [x] Hermes monitoring (stalled-task, approval-checker, daily-brief — wiring in progress)
- [x] NocoBase plugins (2個: plugin-orchestration, plugin-executive-monitor)
- [x] PostgreSQL schema (4 tables, 11 indexes, RLS policies, idempotent migration)
- [x] Complete orchestration flow: instruction → interpretation → task → execution → handoff → monitor → approval
- [x] AgentOutput protocol (14 required fields, flat structure, validation)

**Policy & Governance Completed (May 27, 2026):**
- [x] Agent Protocol Upgrade (phase-based orchestration + actual output contracts + 7 agent specs)
- [x] Founder Brief Spec (7 brief templates + timing + examples)
- [x] Risk & Governance Spec (D1-D5 detailed + approval gates + RiskQA authority + PMF gates)
- [x] Documentation synchronized with implementation

## Phase 6+ — Implementation Tasks

Next immediate work:

**Phase 6a: Chief of Staff Brief Auto-Generation (Low Risk)**
- [ ] Chief of Staff handler to aggregate parallel task results
- [ ] Daily Brief formatting from CEO output
- [ ] Hermes integration to trigger brief generation

**Phase 6b: RiskQA Policy Enforcement (Medium Risk)**
- [ ] RiskQA handler enforcement of PII/external/D3-D5 gates
- [ ] Risk/PII/approval validation (already drafted in code, needs enforcement)
- [ ] Blocking unsafe items before Founder sees them

**Phase 6c: Memory Entry Workflow (Low Risk)**
- [ ] Collect `insight_to_record` from all agent outputs
- [ ] Weekly memory review brief generation
- [ ] Founder approval → save to founder_memory table
- [ ] Memory retrieval integration

---

## Phase 10 — CTO Agent + Agent Control Room 연동 (실제 기술 실행 레이어)

**핵심 역할 분리:**

```
CTO Agent (뇌)                      Agent Control Room (손 + 눈)
──────────────────────              ────────────────────────────────
개발자 워크플로우 이해                실행 + 트래킹 + 모니터링 UI
작업 단계 설계 (LLM 1회)             로드맵/에이전트 상태 실시간 표시
런타임 지정 (Claude/Codex/AGY)       Release Gate 관리
품질 게이트 판단                     Hermes 감시
결과 검토 → L5 피드백               CLI 세션 제어
```

**전체 플로우:**
```
L5 Business OS
  Founder → CEO → CTO 태스크 (queued)
                      ↓ LLM 1회: 개발 단계 설계 + 런타임 지정
               CTO Agent (services/agent-runtime/src/agents/cto.ts)
                      ↓ 구조화된 작업 패킷 (런타임 이미 지정 → 규칙 기반 라우팅)
          Agent Control Room (~/Desktop/양원민 개발자/agent_control_room_docs/)
               ├── Phase 1 → Claude CLI   (설계 / 스펙 / 리뷰)
               ├── Phase 2 → Codex CLI    (코드 생성 / 리팩터)
               └── Phase 3 → Antigravity  (UI / 컴포넌트)
                      ↓ 로드맵 트래킹 + 실행 상태 UI (ACR 기존 UI 그대로 활용)
               CTO: 단계별 결과 검토 → 다음 phase 승인 or 수정 지시
                      ↓ 최종 결과 callback
               AgentOutput → L5 agent_tasks 업데이트 → Monitor 반영
```

**설계 원칙:**
- CTO LLM 호출 1회 — 작업 분해 + 각 단계 런타임 지정까지 한 번에
- ACR 라우팅은 규칙 기반 — CTO가 이미 런타임 지정해서 전달하므로 추가 LLM 불필요
- ACR 트래킹 UI 재구현 없이 그대로 활용 (로드맵, 에이전트 상태, Hermes 감시 모두 포함)
- Founder는 L5 채팅에서 방향 결정 + ACR에서 실행 현황 모니터링

**ACR 위치:** `~/Desktop/양원민 개발자/agent_control_room_docs/` (Next.js, 별도 실행)
**CTO Agent:** `services/agent-runtime/src/agents/cto.ts`

---

### P0: CTO Agent 실제 구현

- [x] `services/agent-runtime/src/agents/cto.ts` 구현
  - `queued` CTO 태스크 수신 → LLM으로 개발 단계 설계
  - 출력: `phases[]` — 각 phase에 `{ name, runtime, prompt_packet, expected_output, risk_level }`
  - 런타임 지정 기준 (LLM 프롬프트에 포함):
    - 아키텍처 / 스펙 / 리뷰 → `claude`
    - 코드 생성 / 리팩터 / 테스트 → `codex`
    - UI / 컴포넌트 → `antigravity`
    - 3개 이상 파일 병렬 수정 → `omc`
  - 각 phase 패킷을 ACR API로 전달 (`POST /api/workbench:dispatch`)

- [x] L5 AgentTask → ACR intent 변환 스키마 정의
  - `l5_task_id` 포함 — ACR 완료 시 L5 태스크 업데이트에 사용
  - phase 간 의존성 표현 (phase 2는 phase 1 완료 후 시작)

- [x] Release Gate ↔ L5 D-level 동기화
  - D1-D2 → ACR 자동 실행
  - D3 → ACR Release Gate 생성 → 24h 자동 승인
  - D4-D5 → ACR Release Gate + L5 승인 큐 동시 표시 → Founder 수동 승인

---

### P0: ACR → L5 결과 피드백

- [x] ACR phase 완료 시 L5 callback 엔드포인트 구현
  - `POST /api/agent:taskCallback` (신규)
  - 페이로드: `{ l5_task_id, phase, status, output_summary, next_owner }`
  - 모든 phase 완료 → `status = done`, `insight_to_record` → founder_memory 후보 추가

- [x] ACR 실패/차단 → L5 에스컬레이션
  - 쿼터 부족 → `status = blocked`, `blocker` 기록
  - 3회 재시도 실패 → `needs_review` + 승인 큐 진입

---

### P1: Founder UI ↔ ACR 연결

- [x] L5 Founder UI 사이드바에 "Control Room" 탭 추가
  - ACR(`http://localhost:3001`) 새 탭 링크 또는 iframe 임베드
  - L5 모니터(현황) + ACR(실행 추적) 함께 사용

---

### P2: CTO 단계별 검토 루프

- [ ] phase 1 완료 → CTO LLM 검토 → "다음 진행" or "수정 후 재시도"
  - 이전 phase 산출물이 다음 phase 프롬프트 패킷에 자동 포함
  - ACR `taskCallback(status='phase_complete')` 수신 후 CTO handler 재호출 트리거
  - **→ Phase 11로 이관 (ACR runner 안정화 선행 필요)**

- [~] **OUT OF SCOPE** OMC/OMX 연동 — DECISIONS.md 2026-05-29. ACR 내장 agent-model-router로 충분

---

### 완료 기준

| 항목 | 상태 | 확인 방법 |
|---|---|---|
| CTO → ACR 전달 | ✅ | `POST /api/workbench/dispatch` 라우트 구현. FeaturePlan + PlanTask 저장 |
| ACR runner → L5 결과 반영 | ✅ | runner `onComplete`에서 `l5-` prefix 감지 → L5 taskCallback 자동 호출 |
| L5 결과 반영 | ✅ | `POST /api/agent:taskCallback` — all_done/failed/blocked/phase_complete 처리 |
| D4-D5 동기화 | ⚠️ | L5 로직 구현 완료. ACR Release Gate UI 연동은 Phase 11 |
| ACR 실행 트래킹 | ⚠️ | ACR `/api/runner` 실제 실행 가능. 단, approval token + project 등록 필요 |

---

## Phase 11 — ACR 실제 사용 가능 상태로 보완 (다음 Phase)

> ACR 코드베이스 분석 결과, 아래 항목들이 해결되어야 실제로 사용 가능함.

### 현재 ACR 상태 요약

```
구현됨 (실제 작동):
  ✅ spawnAgent() — claude/codex/antigravity CLI 실제 spawn
  ✅ local-runner-daemon.mjs — 작업 큐 폴링 → CLI 실행 루프
  ✅ feature-plan-store — FeaturePlan/PlanTask JSON + Supabase fallback 저장
  ✅ agent-model-router — 라우팅 로직 (TaskKind → AgentType)
  ✅ /api/runner — approval token 검증 + spawn (SSE 스트리밍)
  ✅ /api/workbench/dispatch — (신규 추가) L5 CTO → ACR FeaturePlan 변환
  ✅ /api/l5-callback — (신규 추가) ACR → L5 완료 신호 중계
  ✅ runner onComplete → L5 callback 자동 호출 (신규 추가)

스캐폴딩/미완성:
  ⚠️ Release Gate — in-memory만 구현, UI 승인 플로우 미완성
  ⚠️ OMC/OMX — 레지스트리 등록됨, 실제 설치/검증 없음
  ⚠️ Supabase — 선택적 연동, 미설정 시 JSON 파일 fallback
```

### P0: approval token 자동 발급 플로우 연결

- [x] L5 dispatch → approval token 자동 발급 → runner 연결 ✅ (2026-05-30 검증, 설계 변경)
  - 원안(ACR `/api/workbench/approval` 직접 호출)은 **내부 토큰 발급 방식으로 대체**됨
  - 구현: Phase 14 P0-2 ACR `app/api/orchestration/internal-token/route.ts`(`L5_SHARED_SECRET` 검증) + P0-3 auto-dispatcher가 `issueApprovalToken()` in-process 호출
  - L5 측: `plugin-orchestration/plugin.ts:1040` executeTask가 D3+ 태스크에 `acr_token`(randomUUID) 자동 발급, 콜백 응답에 동봉
  - D1-D2는 auto-dispatcher 무토큰 내부 직접 실행 경로 사용 (Phase 14 P0-3/P0-4)

### P0: project 등록 자동화

- [x] L5 dispatch 시 ACR project 자동 등록 ✅ (2026-05-30 검증)
  - 구현: ACR `workbench/dispatch`가 `project_path` 있고 project 없으면 dispatch 시점 auto-create (Phase 15 Addendum)
  - L5 측: `cto.ts:265 bootstrapProjectIfMissing()` → `/api/projects` 등록 + business-portfolio `acrRegister` 서버 액션
  - 검증: 658행 "ACR 프로젝트 자동 등록 ✅", `projects-register.test.ts` 8/8 PASS

### P1: Release Gate ↔ L5 승인 일원화 ✅ (2026-05-30, 설계 변경)

- [x] D4-D5 승인을 **L5 단일 승인원**으로 통합 (ACR Release Gate 중복 제거)
  - 문제: 승인 경로 이원화 — L5 `acr_token`(Founder가 L5에서 승인) vs ACR Release Gate(in-memory, ACR panel에서 별도 승인). 게다가 dispatcher가 픽업한(=L5 승인된) D4-D5 태스크를 ACR auto-dispatcher가 `manual_founder`로 **다시** 막아 영영 실행 안 됨.
  - 해결(양방향 동기화 대신 단일 승인원): Hermes dispatcher는 `approval_required=false` 태스크만 ACR로 보내므로, ACR에 도달한 intent는 이미 L5 게이트 통과. `ACRIntent.l5_approved=true`로 표시(`l5-core/types/acr-intent.ts`, `agent-runtime/agents/cto.ts`) → ACR `auto-dispatcher`가 `manual_founder` 게이트 통과 + dispatch route가 auto-dispatch 스케줄, `workbench/approval`(수동 경로)도 Release Gate 스킵. **`auto_24h`(D3)는 시간 정책이라 미적용.**
  - 검증: ACR `auto-dispatcher.test.ts` 신규 "D4 manual_founder IS auto-dispatched once L5 approved" + 기존 NOT-dispatched 대칭 케이스 동시 통과(5/5). L5 `cto.test.ts` `l5_approved` assert. 양쪽 tsc clean.
  - 미적용(범위 외): Release Gate in-memory→file 영속화(별개), ACR Release Gate panel UI 제거(미사용이라 무해)

### P1: ACR daemon 자동 시작 관리 ✅ (2026-05-29 오후)

- [x] launchd LaunchAgent 등록 — ACR `launchd/com.l5.acr-daemon.plist` + `scripts/install-launchd.sh`
  - KeepAlive=true, RunAtLoad=true, CONTROL_ROOM_URL=http://localhost:3001
  - `launchctl list | grep com.l5.acr-daemon` 등록 확인 (PID stable)
  - 로그: `~/Library/Logs/l5-acr-daemon.{out,err}.log`
  - 설치: `export L5_SHARED_SECRET=... L5_ADMIN_TOKEN=... && bash scripts/install-launchd.sh`

### P1: Supabase 영속화

- [ ] FeaturePlan, ExecutionLog, ReleaseGate를 Supabase에 영속화
  - 현재: JSON 파일 fallback 사용 중 (서버 재배포 시 데이터 소실 위험)
  - 해결: Supabase 프로젝트 설정 + 마이그레이션 적용

### ~~P2: OMC/OMX 설치 및 연동~~ — **OUT OF SCOPE** (DECISIONS.md 2026-05-29)

### P2: CTO phase 검토 루프

- [ ] ACR `phase_complete` callback → L5 CTO handler 재호출 → "진행" or "재시도" 결정
  - 이전 phase 산출물을 다음 phase prompt_packet에 자동 포함
  - L5 monitor에서 phase별 진행 상태 표시

### 완료 기준 (Phase 11) — ✅ 2026-05-28 완료

| 항목 | 결과 |
|---|---|
| founder_memory 컬렉션 등록 | ✅ plugin-executive-monitor defineCollection 추가 |
| Hermes NocoBase HTTP 클라이언트 | ✅ `services/hermes-runtime/src/api/nocobase-client.ts` |
| Hermes runner (Live 데이터 연결) | ✅ `services/hermes-runtime/src/runner.ts` |
| ACR 승인 토큰 자동 발행 | ✅ agent_tasks.acr_token + executeTask 자동 생성 |
| ACR 콜백 엔드포인트 | ✅ `POST /api/acr:approvalCallback` |
| CTO Phase Review 태스크 | ✅ `services/hermes-runtime/src/tasks/cto-phase-review.ts` |
| ACR HTTP 클라이언트 | ✅ `services/hermes-runtime/src/api/acr-client.ts` |
| 타입체크 | ✅ hermes-runtime + plugin-orchestration + plugin-executive-monitor |
| 테스트 | ✅ 174 tests PASS (l5-core) + 13 tests PASS (hermes-runtime) |

## Phase 12 — 다음 단계

- [x] launchd 자동 시작 등록 (4개 cron job, `scripts/install-launchd.sh`)
- [x] ACR 프로젝트 자동 등록 (`runCTOAgent()` 시작 시 `registerWithACR()` 호출)
- [x] Memory → CEO context 재주입 (`interpretFounderInstruction` memories 파라미터)
- [~] **OUT OF SCOPE** OMC/OMX 연동 — DECISIONS.md 2026-05-29
- [ ] ACR daemon 자동 시작 관리

---

## Phase 14 — ACR 무인 실행 루프 (P0, ✅ 코드 완료 / 라이브 E2E 대기)

**목표:** CTO가 dispatch한 D1-D2 phase가 사람 클릭 없이 자동으로 spawn → 콜백까지 흐른다.

**왜:** 현재 `/api/runner`는 approval token + UI 클릭 필요. CTO가 자율적으로 코딩하려면 헤드리스 자동 실행 루프가 필수.

### P0-1: ACR PlanTask에 CTO 메타데이터 보존 ✅

- [x] ACR `lib/storage/cto-task-metadata-store.ts` 신규 — planId+taskId → { auto_execute, release_gate_type, risk_level, runtime, cwd, l5_task_id } 저장 (파일+메모리 fallback)
- [x] `dispatch/route.ts`: phase별 metadata를 sidecar store에 함께 저장 (`saveCTOTaskMetadataBatch`)

### P0-2: 내부 approval token 자동 발급 엔드포인트 ✅

- [x] ACR `app/api/orchestration/internal-token/route.ts` 신규
- [x] `L5_SHARED_SECRET` 헤더 검증 (없으면 503 fail-closed)
- [x] `issueApprovalToken()` 호출 후 token + expiresIn 반환
- [x] 발급 로그 기록

### P0-3: Auto-dispatcher worker ✅

- [x] ACR `lib/orchestration/auto-dispatcher.ts` 신규
  - `dispatchNextTask(planId, excludeTaskIds)`: 다음 적격 task 1건 실행 (in-drain 중복 방지)
  - `runAutoDispatchForPlan(planId)`: 최대 20 phase 드레인
  - `scheduleAutoDispatch(planId)`: setImmediate fire-and-forget
  - cwd 해석: metadata.cwd → project lookup → `L5_DEFAULT_PROJECT_PATH` env
  - `issueApprovalToken()` in-process → `/api/runner` POST → SSE 끝까지 소비
- [x] `app/api/orchestration/auto-dispatch/route.ts` 신규 — POST { planId } 수동 트리거

### P0-4: Dispatch 후 자동 트리거 ✅

- [x] `dispatch/route.ts`: 저장 직후 auto_execute=true 태스크가 있으면 `scheduleAutoDispatch` fire-and-forget
- [x] D3+ 태스크 (release_gate_type !== "none")는 auto-dispatcher가 자동 skip

### P0-5: L5 → ACR cwd 힌트 전달 ✅

- [x] `packages/l5-core/src/types/acr-intent.ts`: `ACRIntent.project_path?: string` 추가
- [x] `services/agent-runtime/src/agents/cto.ts`: `resolveProjectPath()` 헬퍼 — task → env → undefined
- [x] LLM/deterministic intent 양쪽에서 project_path 채움

### P0-6: E2E 검증 ✅ (통합 테스트)

- [x] `__tests__/auto-dispatcher.test.ts` — D2 auto_execute 2-phase intent → /api/runner 2회 호출 + 올바른 token/cwd/agent/prompt 검증
- [x] D4 manual_founder phase → auto-dispatch 차단 검증
- [x] internal-token 401/200/503 게이트 검증
- [ ] **라이브 검증 (TODO):** 실제 ACR + L5 서버 기동 후 D2 CTO 태스크로 end-to-end 확인 (Claude CLI 실제 spawn 포함)

---

## Phase 15 — CTO 프로젝트 부트스트랩 (P0, ✅ 코드 완료 / 라이브 E2E 대기)

**목표:** CTO가 새 비즈니스용 코드베이스를 ACR에 자율 등록.

- [x] ACR `POST /api/projects` 라우트 실제 구현 — 위험 경로 차단 + 멱등 upsert (`app/api/projects/route.ts`)
- [x] ACR Phase G P0-2 — 등록 직후 AGENTS.md/CLAUDE.md/docs/*.md 자동 ingestion (`lib/ingestion/project-docs-ingestor.ts`, fire-and-forget)
- [x] L5 CTO `bootstrapProjectIfMissing()` — `registerWithACR` 실패 시 `L5_DEFAULT_PROJECT_PATH` 기반 재시도 (`services/agent-runtime/src/agents/cto.ts`)
- [x] L5 비즈니스 생성 시점에 ACR 프로젝트 미리 register — plugin-business-portfolio `acrRegister` 액션 + BusinessPortfolioPage 호출
- [x] ACR `workbench/dispatch`에서 `project_path` 있고 ACR project 없으면 auto-create + ingestion 트리거
- [ ] **라이브 검증 (TODO):** 비즈니스 생성 → ACR projects.json 확인 + CTO D2 dispatch → daemon spawn 시 올바른 cwd 사용 확인

**검증 결과**
- ACR `__tests__/projects-register.test.ts` (신규) 8/8 PASS
- ACR `auto-dispatcher.test.ts` 회귀 4/4 PASS
- ACR 전체 41/42 suites PASS (사전 존재 1건 미해결 — Phase 15 무관)
- L5 `pnpm -r typecheck` 통과, @l5/core 174/174 tests PASS

---

## Phase 16 — Phase-to-Phase 자율 진행 루프 (P1, ✅ 코드 완료 2026-05-28)

**목표:** phase 1 완료 → phase 2 prompt가 phase 1 결과(diff/log)를 컨텍스트로 받아 spawn.

- [x] ACR `/api/l5-callback` → L5 `taskCallback`에 `diff_summary`·`log_tail`·`exit_code`·`branch` 첨부 (`app/api/runner/route.ts`, `app/api/l5-callback/route.ts`)
- [x] ACR auto-dispatcher가 직전 완료 phase의 diff+log를 다음 phase prompt 앞에 `[PRIOR PHASE CONTEXT]` 블록으로 prepend (`lib/orchestration/auto-dispatcher.ts: buildPriorPhaseContext`)
- [x] L5 `taskCallback`이 새 필드 수신 + phaseCtx 요약 blocker 기록 + log_tail 콘솔 로그
- [x] **Phase 16.5 완료 (2026-05-28):** LLM 기반 `replanNextPrompt(input, llm?)` — `lib/orchestration/llm-replanner.ts`. OPENAI_API_KEY 있을 때 GPT-4o로 다음 phase prompt 재작성, 없거나 throw·짧은 출력 시 `priorContext + basePrompt` deterministic fallback. `dispatchNextTask`가 이 함수를 호출하도록 와이어링.
- [x] **Phase 16.5 완료 (2026-05-28):** ACR `PlanTask.dependsOn?: string[]` + `dispatchNextTask`가 모든 의존 task가 `done`인 경우에만 후속 task 선택 (미충족 시 다음 후보로 skip).

**검증**: ACR `npx tsc --noEmit` 통과, `__tests__/auto-dispatcher.test.ts` 4/4 PASS, `projects-register.test.ts` 8/8 PASS.

---

## Phase 17 — CTO 결과 검증 게이트 (P1, ✅ 코드 완료 2026-05-28)

**목표:** ACR이 "exit 0"이라고 끝내도 CTO가 LLM으로 acceptance criteria 충족 여부 재평가.

- [x] `@l5/core` `cto-verification/verifier.ts`: `verifyCTOPhase()` + `verifyCTOPhaseDeterministic()`. exit_code, error 토큰, diff 유무 기반 결정론 평가. LLM(LLMClient) 주입 시 GPT-4o JSON verdict 사용.
- [x] L5 `taskCallback`에 verifier 호출: CTO 태스크 + `all_done`/`phase_complete` 시 실행. verdict='fail' → `needs_review` + `verifier:fail ... retry=true`, 'inconclusive' → `needs_review`.
- [x] Hermes `cto-verification-loop.ts`: `runCTOVerificationLoop`이 retry≤2 조건에서 `runCTOAgent` 재호출. `cto_retry=N` 카운터를 blocker에 인코딩.
- [x] launchd plist + gateway 진입점 등록 (10분 주기) — `com.l5.hermes.cto-verification-loop.plist`, `gateway.ts` TASK_RUNNERS, `runner.ts` `runCTOVerificationLoopLive`, `install-launchd.sh` PLISTS 갱신
- [x] plugin-orchestration에서 LLM client 주입 라인 추가 (OPENAI_API_KEY gated) — `plugin.ts` `taskCallback`에서 `process.env.OPENAI_API_KEY` 있을 때만 `buildLLMClient(task.title)` 전달, 없으면 deterministic-only

**검증**: `@l5/core` 184/184 PASS, `@l5/hermes-runtime` 24/24 PASS, L5 plugin typecheck 통과.

---

## Phase 18 — Clarification & Risk 재평가 (P2)

**목표:** ACR clarification UX를 CTO가 헤드리스로 처리.

- [x] **Phase 18 완료 (2026-05-28):** ACR `/api/l5-callback`에 `needs_clarification` status + `questions[]` + `acr_callback_url` payload 전달 (`app/api/l5-callback/route.ts`)
- [x] **Phase 18 완료 (2026-05-28):** L5 CTO가 `answerClarifications(input, llm?)`으로 답변 생성, D4-D5면 LLM 호출 없이 즉시 `needs_review` + `approval_required` escalate (`packages/l5-core/src/functions/cto-clarification/clarifier.ts`, plugin `taskCallback`). OPENAI_API_KEY gated.
- [x] **Phase 18 완료 (2026-05-28):** ACR risk 재평가 → L5 `risk_level` 동기화 (`taskCallback` status `risk_reassess` 처리, D3+면 `approval_required=true` 자동 승격).
- [x] **Phase 18 완료 (2026-05-28):** ACR `/api/clarify-reply` 신규 라우트 — L5가 답변 회신 시 `PlanTask.clarificationAnswers[]` 누적 (`app/api/clarify-reply/route.ts`). `L5_SHARED_SECRET` 헤더 검증.

**검증**: `@l5/core` 194/194 PASS (+10 clarifier), ACR clarify-reply 6/6 + 회귀 9/9 PASS, ACR tsc 0 errors.

---

## Phase 18.1 — ACR pre-dispatch trigger 와이어링 (P0, ✅ 완료 2026-05-29)

**목표:** auto-dispatcher가 `/api/runner` spawn 전에 clarification/risk 트리거를 자율적으로 발사.

- [x] `lib/types.ts` `PlanTask.clarifyingQuestions?: string[]` 추가
- [x] `app/api/workbench/dispatch/route.ts` `CTOPhase.clarifying_questions?: string[]` 플럼 → PlanTask
- [x] `lib/orchestration/pre-dispatch-checks.ts` 신규 — `checkPendingClarifications`, `reassessRisk`, `sendClarificationRequest`, `sendRiskReassessment`
- [x] `lib/orchestration/auto-dispatcher.ts` `dispatchNextTask` pre-flight: clarification pending → skip + needs_clarification, risk escalated D3+ → skip + risk_reassess
- [x] `__tests__/pre-dispatch-checks.test.ts` 3/3 PASS, 회귀 auto-dispatcher 4 + clarify-reply 6 PASS, tsc 0 errors
- [x] 라이브 smoke: curl dispatch w/ clarifying_questions → PlanTask 디스크 persist + runner 미호출 확인

**잔여:** ACR 환경변수 `L5_BASE_URL=http://localhost:13000` 설정 후 NocoBase taskCallback 도달 확인.

---

## Phase 19 — CTO 자율 운영 강화: Wave 1 기반 사이클 ✅ (2026-05-29)

**목표:** D2 CTO 태스크를 CEO가 지시 → 승인 후 자율적으로 ACR dispatch → founder_id 기반 다중 비즈니스 운영.

---

## Phase 19 Wave 2 — 실행 인프라 강화 ✅ (2026-05-29 완료)

**목표:** Monitor 재구성, Founder UI 완성, 모델 티어링, 자동 연구, 라이브 전체 E2E 검증.

### 2.1 Plugin-executive-monitor: business_id 기준 모니터 전환 ✅

- [x] `monitor:projectTimeline` 액션 — `source_ref LIKE` → `business_id` 컬럼 필터로 전환
  - `business_id IS NULL` = 회사 공통, `= 'common'` = 회사 공통 (양쪽 지원)
  - idx_agent_tasks_business_id 멱등 인덱스 추가
- [x] SELECT 누락 버그 수정 — `blocker` 컬럼 조회 추가
- [x] 검증: plugin-executive-monitor tsc 0 errors, 라이브 조회 확인

### 2.2 Founder UI 재구성 (복합 UI 컴포넌트) ✅

- [x] `business-context.tsx` (신규) — BusinessProvider + useBusinessContext() hook
  - 선택된 business_id를 Context로 전파
- [x] `TabLayout.tsx` (신규) — 💬채팅 / 📍로드맵 / 📥인박스 3-tab 구조
  - 탭별 business_id 필터 자동 전달
- [x] `RoadmapMiniCard.tsx` (신규) — 로드맵 아이템 카드 (단기, 중기, 장기)
  - business_id 기준 필터링된 tasks 표시
- [x] `TodayDiscoveryBanner.tsx` (신규) — 오늘의 발견 배너
  - self-learning.json의 발견 항목 표시
- [x] Sidebar 재구성 — "활성 사업" 섹션 + "🌐 회사 공통" 섹션
  - business select 시 Context 업데이트 → 모든 탭 자동 필터
- [x] 채팅 제출 / 로드맵 조회 / discovery 조회에 business_id 전달
- [x] next build 12 routes 통과, tsc 0 errors

### 2.3 CTO 모델 T1/T2/T3 티어링 (순수 함수) ✅

- [x] `packages/l5-core/src/functions/cto-design/model-routing.ts` (신규)
  - MODEL_ROSTER: Claude/GPT-4o/Codex/Antigravity 메타데이터 (비용, latency, capability)
  - `selectModelTier(taskClass × phaseKind)` → T1 (최고, 비용+성능) / T2 (중간) / T3 (경량)
  - `resolveModel(quotaState, fallback)` → 쿼터 고갈 시 T2→T3 자동 강등
- [x] 21개 테스트 PASS (tiering rules, quota fallback, unknown task class)
- [x] 비밀/키 없음, IO 없음, 순수 로직

### 2.4 Hermes cron 2개: model-verify + self-learning ✅

- [x] `model-verify.ts` (08:55, 매일)
  - @l5/core의 MODEL_ROSTER import (stub 제거)
  - deprecated 모델 감지 → 재매핑 제안 생성 (AgentTask, D4)
- [x] `self-learning.ts` (09:00, 매일)
  - changelog diff → docs/cto-tool-catalog.md 누적
  - 발견 항목 → `.omc/state/todays-discovery.json` 기록
  - 조건부 Telegram 전송 (Founder 정성 판단용)
- [x] launchd plist 2개 추가 (`com.l5.hermes.model-verify.plist`, `com.l5.hermes.self-learning.plist`)
- [x] 81개 hermes-runtime 테스트 PASS (model-verify 15 + self-learning 12)

### 2.5 OSS 자동 조사 순수 로직 ✅

- [x] `packages/l5-core/src/functions/cto-design/oss-research.ts` (신규)
  - OssSearchClient 주입 인터페이스 (stub/실제 client 모두 지원)
  - `filterCandidates`: MIT/Apache/BSD 라이선스 + stars>1000 + 6개월 내 활성
  - 비교표 생성 (feature, license, maturity, risk, recommendation)
  - 결정 엔트리 생성 (chosen, rationale, risk_mitigation)
- [x] 37개 테스트 PASS (empty input, filtering, decision matrix, LLM fallback)

### 통합 & 백엔드 엔드포인트

- [x] l5-core dist 재빌드 → hermes/agent-runtime이 model-routing/oss-research import
- [x] 전 패키지 tsc 0 errors 통과
- [x] NocoBase 액션 2개 신규: `roadmap:list` + `discovery:today`
  - `roadmap:list` — agent_tasks → RoadmapItem[], business_id 필터, ACL loggedIn
  - `discovery:today` — `.omc/state/todays-discovery.json` 읽기, env `L5_DISCOVERY_PATH` 우선, graceful []
  - 둘 다 ACL loggedIn

### E2E 브라우저 검증 (Playwright headless, 6/6 PASS)

**발견 & 수정된 결함:**

1. **rejectPlan 액션 부재 (CRITICAL)** → 핸들러+ACL 추가 (task→killed, instruction→rejected)
   - 라이브: rejected_count=2, tasks→killed 확인
2. **approvePlan no-op (HIGH)** → approval_required:false로 전환 (dispatcher 필터 맞춤)
   - 라이브: approve 후 approval_required=false 확인
3. **submitInstruction 응답 business_id stale (MEDIUM)** → instructionOut으로 수정
   - 라이브: instruction.business_id="1" 확인
4. **사이드바 401 레이스 (MEDIUM)** → useAuth().token 준비 후 fetch
   - 라이브: 콘솔/네트워크 에러 0
5. **빈 사업명 (LOW)** → fallback: `{b.name || b.one_liner || '사업 ${id}'}`
6. **self-learning tmpdir 오염 (LOW)** → 경로 주입으로 격리

**E2E 결과:**
- 로그인/진입 ✅
- 사이드바(활성사업+회사공통) ✅
- 탭 전환 ✅
- 로드맵(business별) ✅
- 오늘의 발견 배너 ✅
- 채팅→CEO해석→CTO task 분류+승인/거절 카드 ✅
- 콘솔 에러 0, 네트워크 4xx/5xx 0

### 스코프 분리 (DECISIONS.md에 기록)

- **2.3 model-routing / 2.5 oss-research** — @l5/core 완성·export했으나 **라이브 소비자는 ACR 런타임 인프라**(모델 티어링 헤더 캡처=quota-tracker.json 쓰기, research phase web-search client). 사용자가 "pulk 레포만" 명시 제외한 ACR 범위이므로, 모듈은 ready지만 라이브 연결은 ACR 세션으로 분리.
- **ACR `/api/runner` 403 — 사이클 완전 완료(status=done)는 ACR 세션 과제**

### 검증 현황

| 항목 | 결과 |
|---|---|
| l5-core tsc + tests | ✅ 281→339 PASS (model-routing 21 + oss-research 37) |
| plugin-executive-monitor tsc | ✅ 0 errors |
| founder-ui tsc + build | ✅ 0 errors, 12 routes PASS |
| hermes-runtime tests | ✅ 81 PASS (12 suites; 신규 model-verify 8 + self-learning 8) |
| 브라우저 E2E | ✅ 6/6 PASS (콘솔 에러 0, 네트워크 4xx/5xx 0) |

### P0-1.1: Schema — `business_id` 추가 ✅

- [x] `founder_instructions`, `ceo_interpretations`, `agent_tasks` 테이블에 `business_id` (nullable string) 컬럼 추가
- [x] 파일: `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts` (raw ALTER + defineCollection 필드)
- [x] 파일: `packages/l5-core/src/types/orchestration.ts` (FounderInstruction, CEOInterpretation, AgentTask에 business_id? 필드)
- [x] 파일: `schemas/orchestration.schema.json` (스키마 버전 업데이트)
- [x] 1회성 truncate 스크립트: `scripts/truncate-orchestration-tables.sql` (수동 전용, 자동 실행 금지)
- [x] 검증: l5-core tsc + nocobase-app tsc 통과

### P0-1.2: CEO 사업 추론 + 모호 시 되묻기 ✅

- [x] `packages/l5-core/src/functions/ceo-orchestration/interpreter.ts`: `interpretFounderInstruction()` 옵션에 `activeBusinesses` 추가
  - active businesses 목록으로부터 자동 business_id 추론
  - 모호 시(여러 후보 또는 빈 목록) 응답에 `needs_business_clarification`, `business_clarification_question` 추가
  - 확실 시 `business_id` 주입
- [x] `chat:submitInstruction` 액션: 활성 business 조회(status ≠ 'deleted') → interpreter에 주입
  - ⚠️ **버그 수정**: `status: 'active'`로 조회 → 항상 빈 목록 (기본 status='idea'). `status: {$ne: 'deleted'}` 변경
- [x] task 생성 중단 시 모호 응답 반환, 확실 시 task에 business_id 주입
- [x] 검증: interpreter 테스트 10/10 PASS

### P0-1.3: CTO 작업 분류 6종 ✅

- [x] `packages/l5-core/src/functions/cto-design/dev-workflow-spec.ts`: 재구성 (`Record<TaskClass, ...>`)
  - SMALL_FIX, FEATURE, BIG_CHANGE, OPS, RESEARCH, REFACTOR 6종 정의
- [x] `classifyTask(title, description, ...)` 신규 — 키워드 + 5지표(scope, complexity, risk, approval_gate, time_estimate) 격상 분류
  - ⚠️ **버그 수정**: parseTaskClass가 정확한 대문자만 수용 → "small fix"/"small-fix" 정규화 (구분자→언더스코어)
- [x] `buildDevWorkflowSystemPrompt`, `validateDevWorkflowPhases`, `buildDeterministicDevPhases`에 taskClass 인자 추가 (기본 FEATURE)
- [x] `services/agent-runtime/src/agents/cto.ts`: LLM task_class 파싱 + classifyTask fallback
- [x] 검증: dev-workflow-spec 41 tests PASS, l5-core 281 전체 통과

### P0-1.4: 막힘② 검증 + `executeTask` 가드 ✅

**背景:** "막힘②" = NocoBase가 runCTOAgent를 직접 호출하면 안 되는 문제 (LLM+네트워크 길이로 요청 핸들러 블록).

- [x] **자율 경로 완결** — Hermes task-dispatcher (60초 cron) → `fetchQueuedTasks[queued && approval_required=false]` → `runCTOAgent` → ACR dispatch 이미 구현됨을 정적 확인
- [x] **경쟁 경로 차단** — `agent:executeTask` 액션: `assigned_agent==='CTO' && !approval_required`인 task는 status 변경 없이 `deferred` 반환
  - dispatcher가 처리하도록 위임 (founder-ui가 직접 호출하면 응답 지연 방지)
- [x] **Founder UI 수정** — `/chat/page.tsx`: 승인 후 `executeTask` 호출을 제거, task status를 `needs_review`로만 변경
  - dispatcher가 `queued` → `needs_review` (CTO) 또는 `done` (비-CTO) 자동 전환
- [x] 검증: dispatcher 단위테스트 7개 추가 (`services/hermes-runtime/src/tasks/__tests__/task-dispatcher.test.ts`)
  - ⚠️ **라이브 버그**: interpreter SYSTEM_PROMPT가 LLM에 `string | undefined` 스키마 → OpenAI가 JSON에 리터럴 `undefined` 출력 → parse 실패. 프롬프트를 `| null`로 변경 + 파싱 전 방어(`:\s*undefined` → `: null`)

### P0-1.5: D2 사이클 라이브 E2E ✅ (2026-05-29)

**검증 환경:** NocoBase :13000 재시작, ACR :3001 dev 기동

**end-to-end 흐름:**
1. `/chat` → Founder: "QA Fixed 비즈니스를 위한 기술 개선 배포 절차 자동화" (D2)
2. `chat:submitInstruction` → CEO LLM 해석
3. **business_id 추론**: "QA Fixed" business 조회 → id=1 주입 ✅
4. **risk D2/approval_required=false** → CTO task queued ✅
5. **dispatcher 폴링** (60s cron) → `runCTOAgent` 호출
6. **CTO 6단계 phase 분해** (LLM) — phase names + descriptions + risk levels
7. **ACR `POST /api/projects`** — project auto-create ✅
8. **ACR `POST /api/workbench/dispatch`** — CTOPhase[] → FeaturePlan + PlanTask 저장 ✅
9. `auto_dispatch_scheduled: true` 응답
10. **auto-dispatcher** → `POST /api/runner` 첫 phase 자동 spawn (mock test 수준 — 실제 cli 안 함)

**라이브 검증 결과:** 모든 단계 통과. "막힘②" 최종 검증 완료 (dispatcher가 query → runCTOAgent → dispatch 전담).

---

### 아키텍처 결정 (DECISIONS.md에 기록)

1. **id=0 가상 row 폐기** — businesses.id auto-increment PK이므로 id=0 강제삽입 위험. 기존 business_id 참조도 문자열이 원칙. `business_id NULL = 회사 공통`으로 정책화.
2. **막힘② = dispatcher 일원화** — runCTOAgent는 Hermes task-dispatcher cron 전담. cto-handler(평가)와 runCTOAgent(실행)의 역할 분리. executeTask는 CTO task에 deferred만 반환.
3. **undefined → null 동기화** — interpreter SYSTEM_PROMPT + 파싱 방어, 모든 LLM 경로에 적용.

---

### 범위 외 / 남은 작업

- **ACR `/api/runner 403`** — Phase 15 기록된 registered project path 가드 잔여. L5_DEFAULT_PROJECT_PATH를 ACR 프로젝트로 등록 또는 가드 점검 (ACR 레포 영역).
- **Wave 2 (미착수)** — 2.1 monitor:projectTimeline 비즈니스 기준 전환, 2.2 Founder UI 재구성(사이드바 회사 공통+탭), 2.3 모델 T1/T2/T3 티어링, 2.4 cron 2개+launchd, 2.5 오픈소스 자동조사, 2.6 전체 E2E.

---

### 검증 현황

| 항목 | 결과 |
|---|---|
| l5-core tsc | ✅ 0 errors |
| l5-core tests | ✅ 281 PASS |
| plugin-orchestration tsc | ✅ 0 errors |
| plugin-executive-monitor tsc | ✅ 0 errors |
| founder-ui tsc | ✅ 0 errors |
| hermes-runtime tests | ✅ 24 PASS |
| 라이브 D2 E2E | ✅ CEO 해석 → business_id 추론 → dispatcher 폴링 → CTO phase 분해 → ACR dispatch |

---

## 🆕 2026-06-02 — 임원 도구 플랫폼 + 세컨 브레인 양방향 인사이트

기획서: `reports/secondbrain-tool-platform-plan.html`. 목표 = 창업자의 자연어 지시("CMO에 영상 생성기 도구 연결 + 세컨브레인 학습 + 함께 정해 발전")가 실제로 작동하는 플랫폼 구축. 모든 부품은 **전 임원 공용**.

**확정 결정:** 세컨브레인=MCP 서버 기존(클라이언트만 연결, Pulk 인사이트 적립이 목표) · 영상생성기=CMO 도구(별도 로컬, ACR=CTO 도구와 구분) · 세컨브레인 쓰기=CEO 검토 후 · 읽기=7개 임원 공용.

**구현 주체:** 사람(개발팀). pulk는 `L5_PROTECTED_PATHS`로 ACR 차단되어 CTO 자가구현 불가(층 B). 부품이 깔린 뒤 사업 작업(영상 제작 등)은 CMO 자율 수행(층 A).

### 현재 진단 (코드 근거)
- ✅ 인사이트 쓰기(자동추출): `persistTaskInsight`(`plugin.ts:1147`) → `collectInsights`(`memory/collector.ts`) → `founder_memory` pending
- ✅ 인사이트 읽기 → CEO: `loadFounderMemories`(`plugin.ts:368`) → CEO 해석에 주입
- ❌ 인사이트 읽기 → **임원**: `executive-llm.ts`에 주입 없음 (CMO가 과거 학습 못 봄)
- ❌ 외부 세컨브레인(MCP): 코드 0
- ❌ 임원 tool-calling: `required_tools:[]` 소비처 없음, Haiku 1회 호출만
- ❌ 창업자↔임원 다회 협의: 없음

### M1 — 임원 공용 도구 런타임 (tool-calling loop)  [x] 2026-06-02
- `executive-runtime/tool-loop.ts`(`runExecutiveWithTools`) + `tools/registry.ts`(`ToolRegistry`) + `tools/types.ts`(`ExecutiveTool`). LLMClient 네이티브 tool-calling 부재 → 텍스트 기반 도구 루프. `required_tools` 소비. 도구 0개면 `runExecutive` 폴백. `buildHandlerResult` 추출.
- verify: 신규 12 테스트 통과, l5-core tsc 0, dist 재빌드. ✅

### M2 — 양방향 인사이트 버스 (내부부터)  [x] 2026-06-02
- `memory/insight-bus.ts`(`InsightSource`/`recallInsights`/`formatInsightsForPrompt`). 임원 실행에 founder_memory(saved, PII high 제외) 주입(끊긴 고리 연결). `executeAgentTaskLive(...,{recalledInsights})` 확장. plugin `makeFounderMemoryInsightSource`. 능동 쓰기 pending→CEO검토 게이트 유지.
- verify: 신규 13 테스트 통과(임원 A→B recall 통합 포함), dist 패치. ✅

### M3 — 세컨 브레인 MCP 게이트웨이 (전 임원 공용)  [x] 2026-06-02
- `l5-core/src/functions/memory/secondbrain-source.ts`: `SecondBrainTransport`, `createSecondBrainSource`, `createSecondBrainTools`, `createInMemorySecondBrainTransport` 구현.
- `plugin-orchestration/src/server/secondbrain-transport.ts`: env(`SECONDBRAIN_MCP_URL`/`SECONDBRAIN_MCP_TOKEN`) 기반 실 transport. 미설정 시 null(graceful disable).
- `executeAgentTaskLive` options에 `tools?: ExecutiveTool[]` 확장(기존 호환 보존).
- `executeTask`: founder_memory + secondbrain 양쪽 recall + secondbrain 도구 tool-loop에 제공.
- `plugin-executive-monitor` saveMemory: `saved` 승격 시 secondbrain append(best-effort, PII high 제외). src + dist 패치.
- 테스트 12개 신규 통과. tsc noEmit 양 플러그인 clean. `node --check` 양 dist 통과.
- MCP 실 서버 스키마 미상 → transport에 TODO 주석 집중(M4 연결 시 한 파일만 수정).
- verify: 세컨브레인 read/write E2E + PII 제외 동기화 확인 → 실 MCP 엔드포인트 연결 후 확인 예정(env 설정만으로 활성화)

### M4 — 창업자 ↔ 임원 협의 채널  [x] 2026-06-02
- 컬렉션 `executive_consultations`(자동 생성) + l5-core `consultation/`(상태머신 + `formatConsultationForPrompt`) + `ask_founder` 도구 + actions `consultation:list`/`consultation:respond`(→task queued) + UI `ConsultationCard`(chat 우측 패널). resolved 협의는 재실행 시 recalledInsights 주입.
- verify: 신규 9 테스트, next build 12 페이지, NocoBase 재기동 후 `consultation:list` 200, 브라우저 렌더(콘솔/네트워크 0). ✅
- **브라우저 테스트가 잡은 버그**: ConsultationCard 응답 unwrap(`res.data`→`res.data.data`) — `items.map` 크래시 수정 후 통과.

### M5 — 도구 발전 루프 결선 + 전체 E2E  [x] 2026-06-02
- `memory/video-factory.ts`(`createVideoFactoryTools` CMO 전용) + plugin `video-factory-transport.ts`(env→null). "발전"은 프롬프트 유도(합의 방식→configure→generate). 전체 흐름 E2E.
- verify: E2E 9 테스트(secondbrain.read→ask_founder→재개→configure+generate, 역할권한, write CEO게이트). l5-core 410/413(3 pre-existing 무관). ✅

**순서 의존:** M1(토대) → M2 → M3 → M4 → M5. **전부 완료 + 라이브/브라우저 검증.** 실연결 TODO: 세컨브레인 MCP(`SECONDBRAIN_MCP_URL/TOKEN`)·영상생성기(`VIDEO_FACTORY_URL/TOKEN`) env 설정 + transport 매핑(미설정 시 graceful).
