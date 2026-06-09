# HANDOFF — L5 Business OS

최종 업데이트: 2026-06-09 (CTO SOP integrate phase 신설 — 트랙 A: CTO 개선)

---

## 🟢 2026-06-09 — CTO SOP에 integrate(통합·배선) phase 신설 (트랙 A: CTO 개선)

**배경**: ACR 산출물이 "고립 완료"(빌드 GREEN인데 orchestrator/진입점 미배선)되는 근본 원인 = CTO dev-workflow SOP에 통합 단계 부재. 방향 = ACR 레일 유지 + CTO 개선(사장님 확정). CMO PRD v3 재구축(사장님 직접, "기존 video-room 위에 v3 orchestrator 얇게")과 **파일 경계 분리 병렬**: 제 영역=`cto-*`/agent-runtime, 사장님 영역=`video-room`/`cmo-orchestrator`. 공유는 배럴(index.ts)뿐.

- **`cto-design/dev-workflow-spec.ts`**: `DevPhaseKind`에 `integrate` 추가. FEATURE/BIG_CHANGE 6→7단계(implement→**integrate**→review). integrate=claude·mutating, 합격기준=진입점 등록·기존자산 정렬·고립 금지. implement 합격기준에 "기존 자산 재활용·중복 금지" 추가. `CLASS_EXPECTED_ORDER`/`CLASS_EXPECTED_DEPENDS_ON`/`NAME_TO_KIND`/`ALL_KINDS` 동반 갱신.
- **`cto-design/model-routing.ts`**: `PHASE_TIER_DEFAULTS`에 `integrate: 'T1'`(exhaustive Record가 강제).
- **`cto-verification/verifier.ts`**: integrate 고립 룰 — 무변경=fail, `modified_existing_files=0`(새 파일만)=orphaned fail(ACR 입력 시, 없으면 graceful). `VerifyCTOPhaseInput`에 `modified_existing_files?` 추가.
- **테스트**: `dev-workflow-spec.test.ts`(7단계·integrate 전용), `verifier.test.ts`(+3: unwired/orphaned/pass), `agent-runtime/cto.test.ts`(7-phase 갱신 + 사전 실패한 runtime 단언 정정).

**검증**: l5-core typecheck 0, cto-design/cto-verification 관련 GREEN. agent-runtime cto.test **11/11**(l5-core dist 재빌드로 7-phase 반영). **회귀 0** — l5-core 전체 5 failed는 baseline과 동일(사전존재: model-routing 4 = 2026-06-07 implement T2→T1 드리프트, cmo-v3 미완 1 = 사장님 트랙 B 진행 중).

**후속 완료(트랙 A, 2026-06-09)**: ACR runner가 phase 콜백에 `changed_files`/`modified_existing_files` 포함 — ACR repo `lib/runner/file-boundary.ts`에 `countModifiedExistingFiles`(porcelain status로 신규 vs 기존수정 구분, 스모크 검증), `finalize-phase-execution.ts`가 commit 전 계산해 L5 콜백 body에 실음. pulk `plugin.ts` 콜백 수신부가 destructure→verifyCTOPhase에 전달(src+dist 미러 패치, node --check OK). runner-finalize.test.ts mock에 새 함수 추가. ACR 소스 tsc 클린·테스트 8/8(tsc 2건은 무관 사전존재 테스트 드리프트).

**per-phase integrate 검증 완료(2026-06-09)**: verifier가 `all_done`에만 돌던 한계 해소. `verifier.ts`에 `isIntegratePhaseName`(phase 이름 식별) + `verifyIntegratePhase`(고립 전용 결정적 검사, expected 합성으로 기존 룰 재사용·LLM 불요) 추가. plugin 콜백 핸들러: `status==='phase_complete' && isIntegratePhaseName(phase)`면 `verifyIntegratePhase`로 그 phase 단독 고립을 즉시 판정(각 phase는 commit 후 콜백→worktree clean→그 phase 단독 diff). fail이면 기존 phase_complete 분기(원래 dead였음)가 needs_review+retry로 흘림. src+dist 미러, require 경로 스모크 OK(orphan=fail, wired=pass). verifier 22/22, l5-core 회귀 0.

**남은 것(트랙 A)**: ① 라이브 kickstart(nocobase/agent-runtime, 현재 빌드만). ② model-routing.test.ts 사전존재 4건 정리. ③ (선택) integrate retry 루프가 ACR에서 실제로 재실행되는지 라이브 E2E 확인.

---

## 🟢 2026-06-07 — CMO Orchestrator & AgentSkill 인터페이스 설계 (Phase 1)

**배경**: CMO가 여러 개의 마케팅 스킬을 동적으로 선택 및 실행하고, 결과를 조합할 수 있도록 Mastra 프레임워크와 호환되는 오케스트레이터 및 스킬 인터페이스 레이어를 l5-core에 구현함.

- **l5-core (`src/functions/cmo-orchestrator/`)**:
  - `AgentSkill` 인터페이스 (`types.ts`): `ExecutiveTool`을 확장하며 `skill_id`, `category`, `depends_on`, `default_risk` 메타데이터를 추가.
  - `SkillRegistry` (`skill-registry.ts`): 스킬 등록/조회/카테고리 필터링과 의존성 그래프의 위상 정렬(resolving dependencies) 및 순환 참조 방지 구현.
  - `CmoOrchestrator` (`orchestrator.ts`): `selection_strategy: 'rule'` 기반으로 태스크 및 스킬 간의 매핑을 해석하고, 의존성 순서대로 순차 실행 후 결과를 조합하여 `HandlerResult`로 병합. 위험도가 D3(high) 이상인 경우 승인 대기 처리하는 승인 게이트 기능 포함.
  - PoC 스킬 2개 구현 (`skills/market-research.ts`, `skills/positioning-message.ts`): `cmo.research.market` 및 `cmo.positioning.message` (market 스킬에 의존) 구현.
  - 배럴 내보내기 및 re-export (`index.ts` 및 `packages/l5-core/src/index.ts`).
- **cmo-handler (`src/functions/executive-runtime/handlers/cmo-handler.ts`)**:
  - 기존 하드코딩 응답을 `CmoOrchestrator.execute()` 위임 방식으로 리팩터링하고 `HandlerResult` 계약 정합성 유지.

**검증**:
- l5-core typecheck 0, jest `cmo-orchestrator` 관련 테스트 7건 모두 통과.
- `npx pnpm -r typecheck` 및 l5-core `tsc` 빌드 전체 통과.
- NocoBase 외부 종속성 없이 l5-core 수준에서 독립 테스트 확인 완료.

---

## 🟢 2026-06-06 — CMO/Script Room v3.1 전체 구현 (P0~P6, workflow 연속 실행)

설계·근거 = `docs/CMO_SCRIPT_ROOM_EXECUTION_PLAN.md` + `docs/DECISIONS.md` 2026-06-06. PRD 3종(`~/Downloads/pulk_cmo_script_room_prd_v3_1_full.md` 정본, v2는 ScriptBeat 폐기, `ai_slide_video_factory_v2_1`은 수신측) 정합.

**확정 경계**: CMO = **무엇을 말할지** → 산출물 끝 = `VideoExecutionBrief`(schema_version `cmo_to_factory_v2`). scene_type/best_medium/duration/timeline **확정 금지**(Factory의 Scene Decision Engine 몫). v2식 `script-factory.ts`(scene_type 확정 VideoJob)는 `@deprecated`, `video-execution-brief.ts`로 교체.

**구현(기존 video-room 모듈에 통합, 평면 배치)** — l5-core `packages/l5-core/src/functions/video-room/`:
- 타입: types.ts +27 export(Research packs, CmoVideoStrategyBrief+LogicBlock, ContentSetValidation, Intro30s/ScriptPart/IntegratedScript/VoiceMatchedScript/ScriptQaReport, VideoExecutionBrief(BriefLogicBlock는 금지필드 타입레벨 부재), CmoContentCard, RevisionTarget, ConsumerStageEn 매핑).
- Research: market-research/voc-research/claim-verification/audience-fit/script-material-pack + research-gate(Gate1).
- Strategy: strategy-brief(logic_blocks/Gate3) + content-set-validation(Gate2, 5단계 자유배정) + thumbnail-plan.
- Script: intro-writer/logic-block-writers(블록 기준 분담)/script-integrator/founder-voice(논리 불변)/script-qa(전략80·타깃80·말투75·판매80·사실90)/revision-router(§16.15).
- 핸드오프: video-execution-brief(빌더) + brief-validators(scene_type 포함시 invalid) + script-room-pipeline(e2e runScriptRoomToBrief) + factory-handoff(transport 주입, 외부전달 승인게이트).
- 검증: **l5-core typecheck 0, video-room 509 tests / 34 suites GREEN**. 단일 카드 Research→Strategy→Script→QA→Brief→Handoff e2e 동작, 테스트6(scene_type 부재) 보장.

**풀스택(P6)**:
- NocoBase plugin-orchestration: cmo 리소스에 `generateVideoExecutionBrief` 액션 + `video_execution_briefs` 테이블 + ACL 추가. **src/server/plugin.ts와 dist/plugin.js 양쪽 패치**(빌드스크립트 없음 — 메모리 주의). dist `node --check` OK.
- founder-ui: 신규 라우트 `/video-room/script-room` + ResearchRoomPanel/StrategyBriefPanel/ScriptRoomPanel/VideoExecutionBriefPanel/ContentCardBoard(카드별 영상생성 버튼=순차제작) + api.ts cmo:* 헬퍼. 기존 page.tsx(3페이지) 무수정. **founder-ui typecheck 0**.

**커밋 완료**(2026-06-06, 브랜치 `cto/acr-kernel-harness`): CMO/Script Room v3.1만 분리 커밋 `45c8330`(63 파일 +12,895/−10). working tree에 섞여 있던 CTO Harness 변경분은 제외 — 공유 파일(`api.ts`/`DECISIONS.md`/`HANDOFF.md`/`TASKS.md`)은 hunk·블록 단위로 CMO 부분만 스테이징. 커밋 전 재검증: l5-core typecheck 0 · video-room 509 tests / 34 suites GREEN · founder-ui typecheck 0. (dist/plugin.js는 gitignored라 커밋 대상 아님.)

**남은 것(라이브 세션)**: NocoBase 기동 후 cmo:generateVideoExecutionBrief 실 DB E2E(테이블 생성·upsert·ACL) 확인 + script-room 페이지 브라우저 검증. 헤드리스 불가(실 DB/NocoBase 필요).

---

## 🟢 2026-06-06 — 데몬을 기본 실행 경로로 승격 (라이브)

`ACR_EXTERNAL_RUNNER=1` → auto-dispatcher가 인라인 대신 **잡큐 enqueue**, 상시 데몬(`com.l5.acr-phase-runner`)이 별도 프로세스에서 claim→prepare→spawn→finalize. acr-web 재시작이 in-flight phase를 못 죽임. 설계 = `docs/DECISIONS.md` 2026-06-06(마지막 항목).

- 신규: `lib/orchestration/phase-runner-queue.ts`, `app/api/runner/queue/claim`, `scripts/phase-runner-daemon.mjs` poll 모드, `launchd/com.l5.acr-phase-runner.plist`. `auto-dispatcher.ts` 외부 분기 + plan당 1 in-flight 가드. `prepare` prompt override.
- **라이브 검증**: FAKE + **실 claude** 둘 다 enqueue→claim→prepare→spawn→finalize→done(커밋+머지) 통과. 테스트 GREEN, tsc 0, 배포(BUILD_ID M0A5WLQiEMcXhDw2aW2m1).
- **롤백**: `.env.local` `ACR_EXTERNAL_RUNNER=0`+재빌드/재시작 → 인라인. 데몬 중지: `launchctl unload`.
- **주의**: stale plan 28개(2일+ 버려진 것)는 가드+dirty cwd 409로 inert. 별도 아카이브 권장(미변경).

---


## 🟢 2026-06-06 — 데몬 in-flight 생존 ③④ 라이브 시연 완료

설계·근거 = `docs/DECISIONS.md` 2026-06-06(네 번째 항목). ①특성화 테스트 ②finalizer 추출에 이어 ③데몬+엔드포인트 구현 ④라이브 시연까지 완료.

**③ 구현**: `app/api/runner/prepare/route.ts`(pre-spawn 컨텍스트) + `app/api/runner/finalize/route.ts`(공유 finalizePhaseExecution 호출) + `scripts/phase-runner-daemon.mjs`(별도 프로세스 spawn + acr-web 재시작 견디는 finalize 재시도). 둘 다 `x-l5-shared-secret` 인증. 인라인 `/api/runner` 무수정.

**④ 라이브 시연**(격리 `~/l5-workspace/daemon-demo`):
- **in-flight 생존 증명**: 40초 spawn 도중 acr-web 강제 종료(`kickstart -k`) → 데몬·spawn 자식 생존(acr-web=000 DOWN 동시 확인) → spawn 완주 → 복귀 후 finalize 안착.
- 결과: ACR 태스크 **done**, 격리 브랜치 커밋+main 머지(D2 자동머지), exec-log done/exit0, L5콜백 도달, 브라우저(acr-web)에 데몬-생성 프로젝트 렌더.
- 검증: 신규 4 + 기존 GREEN, tsc 0, rebuild(BUILD_ID 6vRuYYGfRK1FmGingK29S)+restart 배포.

**남은 1단계**: 데몬을 **기본 경로로 승격**(auto-dispatcher가 인라인 POST 대신 데몬 잡 큐로 enqueue + 워커 N개 동시성). 현재 데몬은 명시적/opt-in 경로로 동작.

---

## 🟢 2026-06-06 — 데몬 in-flight 생존 ①②단계 완료 (finalize 추출, 무회귀)

설계·근거 = `docs/DECISIONS.md` 2026-06-06(세 번째 항목). 데몬 in-flight 생존의 안전 순서(①특성화 테스트 →②추출 →③플래그 데몬 →④라이브 통합) 중 헤드리스로 안전 검증 가능한 ①②를 완료.

- **① 특성화 테스트**(`__tests__/runner-finalize.test.ts`): finalize의 관찰 행동(최종 PlanTask 상태 + L5 콜백 status)을 4 시나리오로 고정. 추출 전/후 동일 통과 = 무회귀 증명.
- **② finalizer 추출**(`lib/runner/finalize-phase-execution.ts`): `/api/runner` post-spawn 블록(상태·커밋·머지·**L5 taskCallback**·빈출력·경계)을 verbatim 추출(`controller.enqueue` → `emit` 콜백만 변경). route.ts 609→365줄. 고아 import 정리. **인라인 러너와 미래 별도-프로세스 러너가 공유**.
- 검증: 전체 ACR 742 GREEN(사전존재 ENOENT 1건 제외), tsc 0. **배포: ACR rebuild + acr-web restart**(behavior-identical, live==repo).

**남은 ③④(라이브 세션 필요)**: `/api/runner/prepare`+`/api/runner/finalize` 엔드포인트 + **별도 프로세스 데몬**(기본 OFF 플래그)이 CLI를 spawn → 플래그 켜고 실제 phase 1개로 "L5 콜백 도착" 확인. 실 acr-web·worktree·CLI 필요해 헤드리스 불가.

---

## 🟢 2026-06-06 — CTO 개선 후속 3종 적용 + 데몬 in-flight 보류 재확인

설계·근거 = `docs/DECISIONS.md` 2026-06-06(두 번째 항목).

**① per-phase agy 모델** (속도/비용): agy CLI `--model`(per-session=병렬 안전) 활용. `buildAgyArgs`에 `--model`, spawn 경로를 전역 settings.json 재작성(`withAntigravityModel`)에서 플래그로 전환. `/api/runner`가 phase kind로 모델 선택 — 경량=Gemini 3.5 Flash (High), 코딩=Gemini 3.1 Pro (High). env `ACR_AGY_MODEL_LIGHT`/`_CODE`/`_PER_PHASE_MODEL=0`.

**② 쿼터 추적 갱신부** (B5 read-path 완성): `lib/agents/quota-tracker-file.ts` 신규 — runtime-registry(claude→T1/codex→T2/agy→T3)를 `QuotaState`로 `ACR_QUOTA_TRACKER_PATH`에 원자적 영속화. `updateAgentRuntime` choke point에서 fire-and-forget. **전제: pulk 디스패처·acr-web이 같은 env 공유**(미설정 시 graceful).

**③ 브랜치 정리 자동화**: `scripts/git-acr-cleanup.sh`(머지+7일 경과 acr/* 만, 보호/워크트리 제외)를 일일 launchd(`com.l5.git-acr-cleanup.plist` 03:30) 스케줄. installer에 `__REPO_ROOT__` 치환 + 등록.

**데몬 in-flight 생존 — 보류 유지(근거 강화)**: runner 테스트가 **pre-spawn만** 커버, **post-spawn finalize(상태·커밋·머지·L5콜백)는 테스트 0** 확인 → 안전망 없는 ~250줄 리팩터는 라이브 자율 루프 회귀 위험. 올바른 순서 = finalize 특성화 테스트 선작성 → 추출 → 플래그 게이트 데몬 → 라이브 통합 테스트(헤드리스 불가 → 별도 세션).

**검증**: 신규 antigravity-runner `--model` 3종(+37)·quota-tracker-file 6 GREEN. 회귀 auto-dispatcher/resilience/pre-dispatch/execution-safety-regression/phase19 GREEN, ACR tsc 0. cleanup dry-run·plist plutil·installer bash -n OK. (qa-fixes-phase11 1건 실패는 사전 존재 ENOENT, 무관.) **반영: ACR rebuild+restart 시.**

---

## 🟢 2026-06-06 — ACR 자율 코딩 정체/재시작 낭비 근본 제거

**배경**: CTO/ACR 자율 코딩의 마지막 근본 병목 = 인메모리 plan 락 + abort 없는 SSE 드레인. 행 발생 시 락 점유 → 드라이버가 acr-web을 재시작 → 진행 phase 폐기·재실행(토큰 낭비). 설계·근거 = `docs/DECISIONS.md` 2026-06-06.

**수술적·무회귀 수정 (잡큐 전면 재작성 보류)**
- **하트비트 lease** (`agent_control_room_docs/lib/orchestration/auto-dispatcher.ts`): `planDrainLocks` 고정 20분 stale → 30초 갱신 하트비트. 산 drain은 유지, 죽은 홀더는 3분 내 stale → 자동 재청구. `acquirePlanDrain`/`releasePlanDrain`/`isPlanDrainLocked`.
- **/api/runner abort 타임아웃**: `dispatchNextTask`의 SSE 드레인에 `AbortController`(`ACR_RUNNER_TIMEOUT_MS`, 기본 `ACR_AGENT_TIMEOUT_MS`+90s). abort 시 `failed:runner_timeout` → lease 해제 → 다음 패스 재큐. 단일 phase 영구행 불가.
- **드라이버**(`~/l5-workspace/cmo-driver.mjs`): `GLOBAL_STALL → restartAcrWeb()` 제거(고아 `restartAcrWeb`/`sleep` 정리). 지속 정체 시 고아 running→planned 힐만(재시작·재실행 낭비 0).
- **`/api/runner` 무수정** → L5 `taskCallback`·머지·경계 검사·phase 커밋 전부 무회귀.

**원안(데몬 직접 spawn) 보류 이유**: `/api/runner`가 spawn 외에 L5 콜백·머지·경계·커밋까지 수행 → 데몬 직접 spawn 전환 시 이들 회귀(특히 펄크가 phase 완료를 인지하는 유일 경로인 L5 콜백). in-flight CLI의 재시작 생존은 후속(`/api/runner` 후처리를 공유 finalizer로 추출 후).

**검증**: `__tests__/auto-dispatcher-resilience.test.ts` 신규 2종(타임아웃 바운드 + lease 재청구) PASS. 기존 `auto-dispatcher.test.ts`(5)·`resilience-loop.test.ts`(9) 회귀 0 → 전부 GREEN. 드라이버 `node --check` OK.

---

## 🟢 2026-06-06 — 자가개선 루프 Phase B(일일 감시) + Phase C(에스컬레이션 배선) 완료

**배경**: Phase A(read-path)·Phase B 코어(`cmoStrategyWatch`)에 이어, 일일 감시 래퍼와 CTO 에스컬레이션 배선을 코드로 완성. 설계 = `docs/DECISIONS.md` 2026-06-06. **원칙 불변: 승인 전엔 코드 한 줄도 안 바뀜(기존 self_mod_status 게이트 보장).**

**Phase B — `services/hermes-runtime/src/tasks/cmo-strategy-watch.ts` (신규)**
- self-learning 패턴 복제. biz 브레인 `brains/biz/memory/inventory.jsonl` 읽기 → `.omc/state/cmo-strategy-snapshot.json` load/save → `cmoStrategyWatch`(l5-core 순수 판단) → diff.
- **첫 실행 베이스라인 가드**: prev 스냅샷이 비면 1059건 전체가 "added"로 잡혀 무의미한 알림이 되므로, 베이스라인만 조용히 저장하고 카드/알림 없이 종료. 둘째 실행부터 실제 변화만 보고.
- 변화 시: **CTO tool-request 카드 1건 생성**(`assigned_agent:CTO`, `source_ref:secondbrain-watch:<date>`, status queued, approval_required false) + 텔레그램(dedupKey 일별). 변화 없으면 조용히 skip. 절대 throw 안 함(오프라인/파일 없음 graceful).
- 배선: `runner.runCmoStrategyWatchLive`(createAgentTask 주입, repetition-analyzer와 동일하게 instruction FK 자동 provision) + `gateway` 등록(`cmo-strategy-watch`). launchd 템플릿 `launchd/com.l5.hermes.cmo-strategy-watch.plist`(09:05, self-learning 직후, RunAtLoad false).

**Phase C — 기존 체인 재사용 배선 (executive-monitor)**
- 갭은 단 하나: `toolRequests` 액션의 SQL이 `source_ref LIKE 'repetition-pattern:%'`만 잡아 B 카드가 안 보임. → `(repetition-pattern:% OR secondbrain-watch:%)`로 확장(`src/server/plugin.ts:448~` + `dist/plugin.js` 직접 패치).
- 그 외 전 체인(UI [CTO에게 전송] 버튼 → `sendToCTO` self-mod 생성 → `applySelfMod`/`rollbackSelfMod` + diff 미리보기 + blast-radius deny)은 source_ref에 무관하게 작동 → 추가 변경 불필요.
- `buildSelfModAcceptanceCriteria`(l5-core): `secondbrain-watch:<date>` prefix를 strip해 수용 기준이 날짜 대신 카드 제목으로 fallback(테스트 1건 추가).

**검증**
- hermes `cmo-strategy-watch` 테스트 4건 PASS(baseline/change-card+alert/silent/missing). hermes 빌드 tsc 0, gateway가 `cmo-strategy-watch` 등록 확인. 전체 hermes 89/90(실패 1건 `model-verify` roster_entries — 라이브 모델 데이터 네트워크 의존, 본 변경과 무관/기존).
- l5-core: selfmod-criteria + cmo-strategy + second-brain-query 테스트 PASS.
- **부수 수정**: Phase A의 `second-brain-query.ts` `QUERY_BY_STATUS`에 `paused` 누락(VideoRoomStatus exhaustiveness 타입 에러, 런타임 undefined 쿼리 버그) → `paused: null` 추가(일시정지 룸은 쿼리 안 함). hermes 테스트가 `@l5/core` 배럴을 타입체크하며 드러난 기존 갭.

**라이브 활성화 완료(2026-06-06 추가 실행)**:
- ① **hermes launchd 활성화 완료**: `com.l5.hermes.cmo-strategy-watch.plist` 설치(placeholder 치환 + `NOCOBASE_TOKEN`은 설치본에만 주입, repo 템플릿은 시크릿 없이 `NOCOBASE_URL`만)·`launchctl load`. `install-launchd.sh` PLISTS 목록에도 추가. **1회 수동 실행으로 베이스라인 수립 검증**: 1059줄 → 중복 source_id 제거 후 **606개 스냅샷**, 카드/알림 0, exit 0(첫 실행 = 조용한 베이스라인). 내일 09:05부터 실제 변화만 보고.
- ② **nocobase 재기동 완료**: `launchctl kickstart -k`(PID 70452, health 200). `toolRequests` OR 필터 라이브 확인(`ok=true`, SQL 에러 없음).
- ③ **환경 드리프트 해소 완료**: l5-core `zod` 미설치 → **전체 `pnpm install`(node_modules wipe, 라이브 서비스 중단 위험) 대신 안전한 방법으로 해결**. (a) `zod`는 이미 pnpm store에 있어(3.25.76, `^3.22.0` 충족) `packages/l5-core/node_modules/zod` **심링크만 생성**(기존 typescript 링크와 동일 패턴). (b) 동일 드리프트인 `pptxgenjs`(store에 없음)는 **그 폴더에 격리 npm 설치**(`--no-save`, 기존 심링크 전부 유지, 추적파일 무변경). 결과 **l5-core 빌드 tsc 0(완전 clean)**, 테스트 24/24, 서비스 정상. 루트 `pnpm-lock.yaml`엔 이미 둘 다 기록돼 있었으므로(설치만 누락) lockfile 무변경. 커밋된 stale `package-lock.json`은 원본 그대로 복원(npm이 덮어쓴 것 git checkout).

---

## 🟢 2026-06-06 — CMO 세컨브레인 자가개선 루프 Phase A: read-path 전 단계 확장 (배포 완료)

**배경**: 사장님 — 세컨브레인의 비즈니스 PT 정보에 맞춰 CMO가 진화해야 한다. 조사 결과 CMO 챗은 세컨브레인을 전략~리서치 중간 단계에서만 조회(첫 대화 strategy_chat·원고·제작·발행 누락), 학습 루프 없음. 전체 설계는 `docs/DECISIONS.md` 2026-06-06 (데이터층 자동 / 코드층 승인된 CTO 분리).

- **`l5-core/video-room/second-brain-query.ts` (신규)**: `secondBrainQueryForStatus(status)` — 23단계 전수 매핑(strategy_chat 포함, completed/unknown만 null). 단계별 PT 쿼리(원고=스토리텔링 현상욕구계획행동보상, 제작=나레이션/슬라이드/편집, 발행=유튜브 SEO 등). 단위테스트 `__tests__/second-brain-query.test.ts` 4건. **l5-core video-room 218/218 통과**(회귀 0).
- **plugin chatMessage 배선**: 하드코딩 `SB_STATUS_QUERY` 맵(10단계만) 제거 → `secondBrainQueryForStatus` 사용. 도메인 매핑을 l5-core로 이전(CLAUDE.md 규칙). graceful 유지(무히트/실패 시 무시).
- **배포**: l5-core dist 빌드(zod 미설치 typecheck 에러는 기존 환경 드리프트·내 파일은 정상 emit), plugin `dist/plugin.js` 직접 패치(require 추가 + 맵→함수, `node --check` OK), nocobase :13000 kickstart.
- **검증**: strategy_chat 첫 메시지 `cmo:chatMessage` → HTTP 200·실제 LLM 답변·ok=true(새 경로 정상). 세컨브레인 biz 직접 조회 시 첫 단계 쿼리에 **PT 인사이트 6건 반환**("초기 타깃=작은 브랜드 대표", "고객 문제 인식→여정", "풀링2 문제 심화", "고객 관점 출발") — 이제 첫 메시지부터 프롬프트 주입.

**Phase B 코어 완료 (2026-06-06)**: `l5-core/cmo-strategy/strategy-watch.ts` — `cmoStrategyWatch(prev, current)`가 biz 브레인 `brains/biz/memory/inventory.jsonl`(각 줄 source_id+hash)을 스냅샷 diff해 신규/수정 PT 감지 + 사장님 요약 생성(self-learning 동일 패턴, 시맨틱 추측 대신 파일 해시 diff = 신뢰적). `parsePTInventory`로 jsonl 파싱. 순수·NocoBase-free, 단위테스트 8건(cmo-strategy 16/16). **남은 것**: Hermes 래퍼 task(inventory 읽기→스냅샷 load/save→cmoStrategyWatch→🔔 제안+텔레그램, 없으면 skip) + launchd plist(09:00) + 라이브 배포.

**Phase C 인프라 발견 (대부분 존재)**: executive-monitor + founder-ui에 자가수정 승인 체인 완비 — `approval/page.tsx`(`api.approvalQueue`/`approveTask`/`rejectTask`/`applySelfMod`/`rollbackSelfMod` + `acr_diff` diff 미리보기), `plugin-executive-monitor/src/server/plugin.ts:542~`("[CTO에게 전송]→self-mod task 생성, self_mod_origin/self_mod_status awaiting_apply→applied/rejected"), `acr-client.notifyACRApprovalRequired`. **승인 전 코드 불변은 기존 self_mod_status 게이트가 보장.** 남은 것: Phase B의 🔔 제안 → "CTO에게 전송"을 이 기존 에스컬레이션에 배선(2단계 승인: 의뢰 승인 → 적용 승인).

**기타**: zod 미설치 환경 드리프트(전체 `pnpm install` 필요, 기존). Phase A·B 코어는 `cmo/video-room-ui-refactor` 브랜치 PR #5.

---

## 🟢 2026-06-06 — CMO Video Room UI 재설계: 단계 중심 단일 포커스 (frontend-only)

**배경**: 사장님 — Movie/Video Room이 "너무 많은 워크플로우를 한 곳에 담아" 복잡. 실제 화면 확인(스크린샷) 결과 3대 문제: ① 3열 그리드가 모든 탭에 강제 → 좌(빈 CMO챗)·우(빈 승인) 컬럼이 가로 ~40% 죽임 ② 단계 무관하게 제작 보드에 원고·팩토리·음성·렌더 폼이 한꺼번에 다 노출 → "지금 뭐 할지" 안 보임 ③ 25점 미니로드맵 라벨 잘림 + 헤더 우상단 배지/알림벨 충돌. **백엔드 25단계 status/`cmo:*` API/데이터는 불변, 프론트(`apps/founder-ui`)만 재구성.**

- **`video-room/_lib/phases.ts` (신규)**: 백엔드 status(25) → 5 Phase(전략/리서치/원고/제작/발행) 매핑. `STATUS_LABEL` 단일 출처화(page.tsx 중복 제거). `phaseOfStatus`/`phaseState`/`statusOrder`/`blockState`. 단위 테스트 `phases.test.ts`(`node --import tsx`, 기존 e2e 컨벤션) — 매핑 전수·순서·게이트 상태 검증.
- **`PhaseTimeline`**: 잘리던 25점 로드맵 대체. 5단계 진행중(●)·완료(✓)·잠금(🔒) 표시, 클릭=이동, 페이지별 pending 배지. `PHASE_TO_PAGE`로 5phase→백엔드 3page 매핑.
- **레이아웃**: 3열 강제 폐기 → **전체 폭 보드 + 접이식 우측 드로어(360px, CMO챗+승인 통합, 접으면 44px 레일+pending 배지)**. 죽은 빈 컬럼 제거.
- **소프트 게이팅 `StageGate`**: 제작 보드의 4블록(원고 Beat / 팩토리 전달 / 음성 첨부 / 파이프라인)을 현재 status 기준 `blockState`로 — active=펼침, done=접기(클릭 펼침), locked=🔒 비활성 바("이전 단계 완료 후"). 게이팅 수준은 사장님 선택(소프트). 모든 블록은 DOM에 존재(완전 숨김 아님).
- **헤더**: 알림벨 충돌 `paddingRight: 48`, 타임라인과 중복되던 page 라벨 제거, 내부 탭 내비 제거(타임라인이 대체).

**검증**: founder-ui **tsc 0**, **next build 성공**(/video-room 10.4kB 정적), `phases.test.ts` 통과. 라이브 백엔드(:13000) 대상 Playwright 스크린샷 — 전략/제작/발행/드로어접힘/원고-active(새 프로젝트 walk→script_planning) 5종 확인: locked 4바→active 원고편집기만 펼침 입증. 헬퍼 `e2e/shot-video-room.mjs`·`e2e/shot-active-stage.mjs`.

**후속 완료 (2026-06-06, 동일 frontend-only)**:
- **전 보드 게이팅 일관화**: StrategyBoard(Viewtrap 수동 입력 → range `key_content_ideation`~`hook_draft_approval`), ReviewPublishBoard(게시 파이프라인 QA·업로드 → range `qa`~`upload_approval`)에도 `StageGate` 적용. 이제 전략/제작/발행 3보드 모두 현재 status 기준 active/done/locked 일관.
- **`page.tsx` 컴포넌트 분리**: 2141줄 단일 파일 → 컨테이너(`VideoRoomContent`/`VideoRoomPage`)만 ~230줄로 슬림화. 추출: `_lib/types.ts`(공통 타입), `_components/`{`StageGate`,`cards`(Intro30s/FactoryJob/CardShell),`ScriptBeatEditor`,`DecisionPanel`,`CmoChatPanel`,`PhaseTimeline`(+`PHASE_TO_PAGE`),`VideoRoomHeader`,`StrategyBoard`,`ProductionBoard`(+`ProductionActionPanel`),`ReviewPublishBoard`(+`ReviewApprovalPanel`),`ProjectSelector`}.
- **검증**: tsc 0, next 프로덕션 빌드 성공, `phases.test.ts` 통과, 프로덕션 서버(3002) 대상 Playwright 스크린샷으로 전략(Viewtrap '완료·보기' done)·발행(게시 파이프라인 🔒 locked) 게이팅 확인. 헬퍼 `e2e/shot-full-gating.mjs`.
- **운영 주의(함정)**: launchd `com.l5.founder-ui`는 `next start -p 3002`(프로덕션). 떠 있는 수동 `next dev`(:3000)와 **같은 `.next`를 공유** → 실행 중 `next build`를 돌리면 청크가 깨져 화면이 로그인에서 안 넘어감(리소스 404). 복구: `rm -rf .next && next build && launchctl kickstart -k gui/$(id -u)/com.l5.founder-ui`.

---

## 🟢 2026-06-05 — CMO Video Room Phase 3 잔여: 원고(장면 beat) 편집 + 팩토리 전달 (branch `cmo/video-room-clean`)

**배경**: 사장님 — 원고 작성 구조는 AI Slide Factory에 이미 존재(format). 사장님이 **원고를 장면(beat) 단위로 수정·확인 → 확정본을 팩토리 Scene JSON으로 전달**(실제 MP4 렌더는 사장님이 별도 발동). sub agent 3개(l5-core/백엔드/UI).

- **l5-core** `video-room/script-factory.ts`: `ScriptBeat`(scene_id/scene_type/rhythm_role/headline/speaker_text/duration + 타입별 optional 필드) + `buildFactoryVideoJob` — 팩토리 16개 scene 타입 전부 valid 매핑(필수 sub-field 파생, 불가 타입은 insight 폴백, scene_type 때문에 throw 안 함). 팩토리 `src/lib/schema.ts` 준수. 55 테스트.
- **백엔드** `plugin.ts` + `video-factory-transport.ts`: `cmo:saveScript`(beats upsert→stage 'script' 카드), `cmo:sendToFactory`(script 카드 beats→buildFactoryVideoJob→`transport.submitJob`: `~/ai-slide-video-factory/jobs/l5-<slug>.json` 작성+validate-job.ts spawn→stage 'factory_job' 카드). require는 video-room 배럴(cmo-strategy 아님 — 수정).
- **UI** `video-room/page.tsx`+`api.ts`: `ScriptBeatEditor`(장면별 유형/헤드라인/대사/길이 편집·행 추가삭제·원고 저장) + 팩토리 전달 버튼 + `FactoryJobCard`(job_path·검증통과 배지). `cmoSaveScript`/`cmoSendToFactory`.

**검증**: l5-core tsc 0, jest **806→(script-factory +)**·founder-ui tsc 0·plugin tsc 0. 격리 NocoBase 라이브 **E2E 27/27 ALL GREEN**(+2: saveScript·sendToFactory 멀티타입 validate). 팩토리에 실제 job 파일(scenes [hero,problem,cta]) 작성·validate 통과 확인. 브라우저 스크린샷으로 원고 편집기+전달 완료 확인.

**남은 것**: 실제 MP4 렌더(render-final.ts, 수 분)는 사장님 발동(버튼/CLI) — 미자동화. 배포(launchd→clean), PR #3 머지.

---

## 🟢 2026-06-05 — CMO Video Room Phase 3: 세컨브레인 기반 도입부 30초 + 적용 인사이트 승인 (branch `cmo/video-room-clean`)

**배경**: 사장님 — 원고 작성 구조는 AI Slide Factory에 이미 있음(`docs/projects/ai-content-flow/`의 strategy_brief.md+script.md = Hook+beat-by-beat 포맷, review_only). Phase 3에서 추가할 것 = **세컨브레인 기반 도입부 30초 적용 + "어떤 인사이트를 어떻게 적용했는지" 보고 승인하는 단계**. 기존 `analyzeIntro30s`는 레퍼런스 영상 의존 → 세컨브레인 기반으로 교체(additive). sub agent 3개(l5-core/백엔드/UI).

- **l5-core** `video-room/reference-analysis.ts`+`types.ts`: `composeIntro30s` + `AppliedInsight{insight,how_applied}` + `Intro30sComposition`. 검증 throw: 키콘텐츠/도입부원고/applied_insights 비면 거부("세컨브레인 인사이트 적용 없이 도입부 작성 금지").
- **백엔드** `plugin.ts`: `cmo:commitStrategyArtifact`에 stage `'intro_30s'` 추가 → `composeIntro30s`. applied_insights 비면 라이브 세컨브레인("썸네일 도입부 후킹 빌드업") 쿼리로 자동 시드.
- **UI** `video-room/page.tsx`: `Intro30sCard` — 도입부 원고+훅구조 + **"적용된 Second Brain 인사이트" 표(인사이트 → 적용 방식)**. 승인은 기존 hook 게이트.
- 승인 흐름: CMO가 도입부 단계서 세컨브레인 적용해 제안 → 카드로 "인사이트→적용방식" 표시 → 사장님이 hook_draft_approval 게이트서 승인.

**검증**: l5-core tsc 0, jest **806/806**(+9). 격리 NocoBase 라이브 **E2E 25/25 ALL GREEN**(+3: 도입부 적용인사이트 구성·라이브 SB 자동시드·키콘텐츠 누락 거부). 브라우저 스크린샷으로 적용인사이트 표 렌더 확인.

**남은 것**: 원고(script) 단계를 팩토리 Scene JSON 포맷으로 산출 + 실제 MP4 렌더 자동화. 배포(launchd→clean), PR #3 머지.

---

## 🟢 2026-06-05 — CMO Video Room: 비즈니스 PT 강의 워크플로우 정합 + 라이브 세컨브레인 결선 (branch `cmo/video-room-clean`)

**배경**: 사장님이 듣는 "비즈니스 PT" 유튜브 강의(세컨브레인 `biz` 브레인에 1~4주차 저장)의 콘텐츠 제작 워크플로우를 CMO Video Room이 그대로 재현해야 함. 강의 흐름 = 판매 상품 → 키 콘텐츠 → 풀링 콘텐츠 → 썸네일/제목 → 내용 제작. sub agent 2개(l5-core/백엔드) 파일 분담.

### Phase 1 — 흐름 정리 (l5-core, 25→23 상태)
- `state-machine.ts`/`types.ts`: `reference_analysis`·`second_brain_insight_merge` 상태 제거(사장님: "레퍼런스 분석 단계 빠져야"). `pulling_content_set_approval → thumbnail_pattern_extraction → intro_30s_analysis → hook_draft_approval` 순서로 직결.
- `ROADMAP_NODES`: 단일 'hook' 노드 → **썸네일 구성 / 원고 도입부 / 훅 승인** 3노드로(미니로드맵 14노드). 사장님 흐름이 화면에 보이도록.
- `stage-script.ts`: 강의 방법론 반영 — 키 콘텐츠=문제 상황에서 시작·역순 기획, 풀링=현상→욕구→계획→행동→보상, 리서치=경쟁사 벤치마킹+human-in-loop(CMO 방법 안내→사장님이 Viewtrap 검색), 썸네일=레퍼런스 URL 없이 세컨브레인 후기+5콘텐츠 썸네일 분석.

### Phase 2 — 라이브 세컨브레인 결선
- l5-core `cmo-strategy/types.ts`·`plan-turn.ts`: `CmoStrategyContext.second_brain_insights?: string[]` 추가 + `buildUser`/`SYSTEM`에 렌더(강의 방법론대로 안내 지시).
- 백엔드 `plugin.ts`: 기존 `makeSecondBrainTransport()`(라이브 Python `biz` 쿼리) 재사용. `cmo:chatMessage`가 단계별 쿼리(키→"문제 상황 역순", 풀링→"현상 욕구 계획 행동 보상", 썸네일→"썸네일 도입부 후킹" 등)로 세컨브레인을 실제 조회해 `ctx.second_brain_insights` 주입. `cmo:loadPTContext`는 source_refs 비면 라이브 세컨브레인으로 자동충전(graceful null).

### 검증
- l5-core tsc 0, jest **797/797**(+6). dist 재빌드 + plugin tsc 0 + plugin dist 재빌드.
- 격리 NocoBase 13099 라이브 **E2E 22/22 ALL GREEN**(기존 19 + 신규 3): 로드맵 14노드·썸네일/도입부 노드 존재·reference_analysis 제거 확인 + **loadPTContext가 라이브 세컨브레인에서 자동충전(빈 source_refs→biz 실쿼리≥3 인사이트)** = 라이브 결선 입증.

### 남은 것(후속)
- 3단계: 원고 단계를 AI 슬라이드 팩토리 멀티에이전트 포맷(Strategy Brief→Script(Hook→…→CTA)→Scene JSON, `ai-content-flow` 구조)으로 결선 + 실제 MP4 렌더 자동화.
- 배포(launchd :13000 → clean 코드), PR #3 머지.

---

## 🟢 2026-06-05 — CMO Video Room PRD 갭 배선 (P0+P1, branch `cmo/video-room-clean`)

**배경**: PRD 갭 분석 결과 도메인 로직(l5-core)은 전부 구현·테스트 완료였고, 갭은 전부 **배선 레이어**에 있었다. (도메인 함수 → 백엔드 액션 미노출, 백엔드 액션 → UI 버튼 미연결, 카드 stage 키 불일치.) sub agent 2개(FE/BE)로 파일 분담해 ADDITIVE 배선만 추가.

**선행 확인**: clean 브랜치(264b3ce)는 메모리 기록(99c4369)보다 진전 — l5-core **tsc 0 + jest 791/791** 이미 통과(메모리의 미완 3건 해소됨).

### 변경 (4파일, ADDITIVE)
- **P0 — `founder-ui/video-room/page.tsx`**: Production 탭에 "슬라이드덱 생성→렌더 제출", Review&Publish 탭에 "QA 실행→업로드 초안 생성" 버튼 추가(기존 `cmoBuildSlideDeck/submitRender/runQA/createUploadDraft` 액션 노출 — 백엔드는 기존 ai-slide-video-factory transport에 연결됨). 음성 업로드 disabled 플레이스홀더 → 작동 입력(file_url+길이→`cmoAttachVoice`).
- **P0 — 카드 stage 키 정합**: UI 필터 `render_job`/`video_qa` → 백엔드 정본 `rendering`/`qa`로 수정(렌더·QA 카드가 화면에 표시되도록).
- **P1 — `plugin-orchestration/plugin.ts` 신규 액션 3종**: `cmo:loadPTContext`(Business PT Context 3소스 규칙 `assertContextLoadingComplete` 강제), `cmo:attachVoice`(`createVoiceRecording`+`attachVoiceFile`), `cmo:commitStrategyArtifact`(stage별 `selectKeyContent`/`createPullingContentSet`/`createSecondBrainInsightMerge` 도메인 검증 런타임 강제). ACL 3개 추가. `api.ts` 메서드 3종 추가.

### 검증
- founder-ui typecheck **0**, plugin-orchestration tsc **0**, l5-core build **0**.
- plugin dist 재빌드 후 격리 NocoBase(13099, `nocobase_cmoe2e`) 부팅.
- **라이브 E2E 19/19 ALL GREEN** (기존 14 + 신규 5). 신규 액션은 새 dist에만 존재 → 새 코드 서빙 입증. P1 음성/양성: PT Context <3소스 거부·≥3 수용, 음성 첨부, Second Brain 빈 인사이트 거부, 풀링 5개 아님 거부 = PRD 비즈니스 규칙 런타임 강제 확인.

### 남은 것
- **배포**: :13000 launchd는 여전히 구 main 코드 서빙. 신규 UI를 실제 화면에서 보려면 launchd가 clean 코드 서빙하도록 빌드+kickstart 필요(Founder 결정). PR도 Founder 리뷰 후.
- **후속(P2)**: 성과 Memory 후보 completed 연결, KeyContentSet/funnel 전용 카드 시각화(현재 raw JSON). Production 버튼 브라우저 클릭 검증(Playwright)은 권장 후속.
- 실제 MP4 렌더(`render-final.ts`, 수 분)는 factory PRD 설계대로 CLI 단계 유지 — transport.generate는 job작성+validate까지.

---

## 🟢 2026-06-05 — CMO Video Room 전체 구현 (PRD v1.1, branch `cmo/video-room-clean`)

**근본 문제 해결**: 사장님 지적 "CMO랑 대화 안 돼"의 원인 = `POST /api/cmo:chatMessage` 백엔드 부재(404). 신규 구현으로 해소.

### 산출물 (커밋 6개)
- **l5-core `functions/video-room/`**: PRD §12 15개 데이터모델 타입(types.ts) + 25단계 워크플로우 상태머신(state-machine.ts: 전이/페이지소유/승인게이트/미니로드맵) + 도메인 모듈 10종(business-pt-context, key-content, viewtrap-research, reference-analysis, pulling-content[5세트 퍼널검증], second-brain-merge, approval-gates, production, review-publish). 전부 순수함수+PRD 금지규칙 throw. **146 단위테스트**.
- **l5-core `functions/cmo-strategy/`**: `runCmoStrategyTurn` — 상태머신 기반 CMO 대화 턴 엔진(CTO planMessage 패턴 미러). STAGE_SCRIPT(25단계 가이드) + LLM주입/결정론적폴백 + 승인게이트 자동생성. **6 테스트**.
- **NocoBase `plugin-orchestration`**: `registerCmoResource` — `cmo:chatMessage/createProject/listProjects/getProject/advanceStatus/decideGate/approvePlan/saveCard/buildSlideDeck/submitRender/runQA/createUploadDraft` 12개 액션 + 컬렉션 4종(cmo_planning_messages, video_room_projects/_cards/_gates) + ACL. 영상팩토리 transport(makeVideoFactoryTransport, 인메모리 폴백). **계약테스트 15개**.
- **founder-ui `/video-room`**: 프로젝트 목록/생성 → 공통헤더 + 12노드 미니로드맵 + 3탭(Strategy/Production/Review&Publish) + CMO Chat + Strategy Board(단계별 카드) + Decision Panel(게이트 승인/수정/보류). api.ts 계약 확장.
- **e2e**: `apps/founder-ui/e2e/verify-cmo-video-room.mjs` — create→chat→gate→advance→slide→render→qa→upload 라이브 검증.

### 검증
- l5-core: **791 jest 통과**, tsc 클린, dist 빌드 성공.
- founder-ui: typecheck 클린, `next build` 성공(/video-room).
- 백엔드 계약테스트 15개 통과.
- **라이브 E2E: 14/14 ALL GREEN (2026-06-05)**. 격리 postgres DB(`nocobase_cmoe2e`) + 포트 13099로 clean 코드 NocoBase 부팅 → `cmo:chatMessage`가 404→**401(인증필요)→실동작**. create→chat→roadmap(12노드)→게이트 도달→decideGate(승인)→advance→buildSlideDeck→submitRender→runQA→createUploadDraft(private) 전부 통과. 사장님 #1 불만("CMO 대화 안 됨") 라이브 해소 입증.

### 격리 라이브 E2E 재현 방법
```
# clean worktree: ~/l5-workspace/pulk-cmo-clean
cd apps/nocobase-app && yarn install                       # 1회(런타임 deps)
rm -rf node_modules/@l5/core/node_modules/zod              # 번들러 zod 중첩 충돌 회피
yarn nocobase build @l5/plugin-orchestration               # dist 생성(cmo 코드)
createdb nocobase_cmoe2e                                    # 격리 DB
env APP_KEY=... APP_PORT=13099 DB_DIALECT=postgres DB_DATABASE=nocobase_cmoe2e DB_USER=wonminyang DB_PASSWORD= \
  APPEND_PRESET_LOCAL_PLUGINS=@l5/plugin-orchestration INIT_ROOT_EMAIL=admin@nocobase.com INIT_ROOT_PASSWORD=admin123 \
  yarn nocobase install -f
env (...동일...) yarn nocobase pm enable @l5/plugin-orchestration
env (...동일...) yarn nocobase start &
cd ../founder-ui && NOCOBASE_BASE_URL=http://localhost:13099 node e2e/verify-cmo-video-room.mjs
```

### 배포 메모
- 현재 :13000 launchd 서버는 **구 main 코드** 서빙. 이 기능을 실제 화면에 켜려면 launchd `com.l5.nocobase`가 clean 브랜치 코드를 서빙하도록 빌드+kickstart 필요(배포 결정은 Founder 확인 대상). 메모리 `cmo-video-room-clean-branch` 참조.

---

## 🟢 2026-06-05 — GitHub 정리(Track A) + CTO 최적화 pulk-side(Track B B1~B5)

### Track A — GitHub 정리 (완료·배포)
- 자동생성 ACR 브랜치 **로컬 291·원격 25 → 0**, `.git` **196M→64M**
- origin/main 5/26 방치 → 로컬 main(97커밋) push로 최신화. 메인 워크트리 낡은 acr 브랜치 → `main`
- `.gitignore` 보강(`.claude/`, `ai-slide-video-factory/` 보호), 가치 문서/리포트 추적
- 재발방지: `scripts/git-acr-cleanup.sh`(머지+N일 경과 acr 브랜치 정리, dry-run 기본)

### Track B — CTO 파이프라인 결정적화 (B1~B5, pulk-side, 배포 완료)
- **B1** `cto.ts`: `ACR_DETERMINISTIC_PHASES`(기본 on) — 정상 task LLM 호출/재시도 **0회**
- **B2** `dev-workflow-spec`: single-component→SMALL_FIX 휴리스틱 단위테스트
- **B3** `verifier`: 코드 산출 기대 phase가 변경 0이면 **fail+retry**(false-positive 차단)
- **B4** `d3-judge`: 외부/매출/비가역=escalate, 내부/read-only=pass 결정적 사전판단 → LLM 호출↓
- **B5** `cto.ts/model-routing`: 쿼터 소진 tier 우회(`resolveModel`) → 죽은 라우팅 0
- 검증: l5-core **596/596**, agent-runtime **8/8**, tsc 0. 배포: l5-core/agent-runtime/hermes 재빌드 + nocobase 재시작(B3), hermes 스케줄 태스크는 다음 실행 자동 반영
- 브랜치 `cto/dev-optimization` → main FF 머지(origin push)

### 남음 (B6/B7 — 라이브 ACR repo, 보류)
- **B6** per-phase 모델 배선(`antigravity-runner`에 `--model` 등 死코드 활성화)
- **B7** 잡큐 오케스트레이션(`auto-dispatcher` inline SSE→enqueue+worker, 인메모리 락 제거)
- 라이브 시스템 + CMO 병렬 디스패치와 겹쳐 별도 세션/조율 후. 라이브 ACR = `~/Desktop/양원민 개발자/agent_control_room_docs`

---

## 🟢 2026-06-04 — CMO Chat UI (오픈소스 조사 + 스펙 + Product Strategy Card 구현) 리뷰

**판정: LGTM.** 8파일 +864/-8줄. 차단 이슈 없음. non-blocking info 3건.

### 산출물 요약

이 diff는 두 가지 독립적 산출물로 구성된다:

**A. Product Strategy Card (코드 변경 — 3파일)**
- `api.ts`: `ProductStrategyData` 타입 + `AgentOutputLite` 확장 + `updateTaskOutput` API
- `AgentOutputDetail.tsx`: `ProductStrategyPanel` (읽기/편집) + `RetentionCurve` SVG 교체
- 테스트: SSR 기반 양성/음성 16개 assert

**B. CMO Chat UI 문서 산출물 (5파일, 코드 변경 없음)**
- `docs/research/cmo-chat-ui-comparison.md`: 3개 후보(Vercel AI SDK / @assistant-ui / 기존 패턴 확장) 비교 → 기존 패턴 확장 채택
- `docs/specs/cmo-chat-ui-spec.md`: `/cmo` 라우트, 2탭(대화/과제), `cmoChatMessage`/`cmoApprovePlan` API, AC 10개
- `docs/specs/product-strategy-card-oss-research.md`: 3도메인×2-3후보 비교
- `docs/specs/product-strategy-card-spec.md`: AC 8개, 영향 파일 2개

### 검증 결과

- `tsc --noEmit` exit 0
- product-strategy-panel 테스트 exit 0 (16개 assert 통과)

### 파일별 리뷰

#### 1. `apps/founder-ui/src/lib/api.ts` (+16줄) — LGTM

- `ProductStrategyData` (L55-62): 스펙 일치. 4 필수 + 2 optional. OK.
- `AgentOutputLite.product_strategy` (L74): optional 추가. 기존 호환성 유지. OK.
- `api.updateTaskOutput` (L454-458): NocoBase `filterByTk` + `values` 패턴. OK.

#### 2. `apps/founder-ui/src/components/AgentOutputDetail.tsx` (+153/-7줄) — LGTM

- 시그니처 (L8): `taskId?: string` optional 추가. 기존 호출부 regression 없음. OK.
- 분기 로직 (L12-13, L23-33): intro_analysis → product_strategy → 범용 순서. 스펙 4.3 일치. OK.
- `ProductStrategyPanel` (L101-213): 읽기/편집 모드, draft/current 분리, 4필드 그리드, confidence 배지, rationale details. OK.
- `RetentionCurve` (L295-318): recharts → 순수 SVG. SSR 안정화 + 번들 축소. OK.

#### 3. `__tests__/AgentOutputDetail.product-strategy-panel.test.tsx` (+54줄) — LGTM

- SSR `renderToStaticMarkup` 패턴. 양성 14 assert + 음성 2 assert. OK.

#### 4. `docs/research/cmo-chat-ui-comparison.md` (+142줄) — LGTM

- 3개 후보 비교표 + 채택/배제 근거 명확. 백엔드 호환성·의존성·재사용 기준으로 기존 패턴 확장 채택. OK.

#### 5. `docs/specs/cmo-chat-ui-spec.md` (+196줄) — LGTM

- 라우트(/cmo), UI 구조(2탭), API(cmoChatMessage/cmoApprovePlan), AC 10개 측정 가능, 범위 밖 명시. OK.

#### 6. `docs/specs/product-strategy-card-*` (+254줄) — LGTM

- OSS 조사: 3도메인 모두 자체 구현 채택 (일관). 스펙: AC 8개, 구현과 정합. OK.

#### 7. `docs/HANDOFF.md` (+57/-1줄) — LGTM

- 이전 리뷰 기록 정확. OK.

### Non-blocking info (수정 불필요, 참고용)

| # | 파일:줄 | 내용 | 심각도 |
|---|---------|------|--------|
| I-1 | `AgentOutputDetail.tsx:128` | `save()` catch 없음 — 저장 실패 시 사용자 피드백 무. ConsultationCard도 동일 패턴이므로 일관성 있음. 후속 toast 일괄 추가 시 해결 권장 | info |
| I-2 | `AgentOutputDetail.tsx:295-318` | `RetentionCurve` SVG가 linear 보간 — 기존 recharts cardinal spline과 차이. SSR 안정성 우선 트레이드오프로 수용 | info |
| I-3 | `cmo-chat-ui-spec.md:§3.1` | 사이드바 아이콘 `megaphone` — `Icon.tsx`에 해당 아이콘 존재 여부 구현 시 확인 필요 | info |

---

## 🟢 2026-06-04 — Product Strategy Card (상품/타깃/문제/목표 정의) 리뷰

**판정: LGTM.** 5파일 +470/-7줄. 차단 이슈 없음. non-blocking info 3건.

### AC 검증 결과

| AC | 기준 | 결과 |
|---|---|---|
| AC1 | `ProductStrategyData` 타입 + `AgentOutputLite` 확장 | PASS — `api.ts:55-62` 타입 정의, `api.ts:74` optional 필드 추가 |
| AC2 | `product_strategy` 존재 시 전용 패널 렌더링, 없으면 기존 동작 | PASS — 테스트에서 양성/음성 모두 확인 (`.product-strategy-panel.test.tsx:27-54`) |
| AC3 | 읽기 모드: 4개 필드 라벨+값 표시 | PASS — 테스트 assert로 상품/타깃/문제/목표 라벨+값 14개 단언 통과 |
| AC4 | 편집 모드: 수정→textarea→저장→API 호출→읽기 복귀 | PASS (구현 확인) — `AgentOutputDetail.tsx:119-137` useState+save+cancel, SSR 테스트에서 "수정" 버튼 존재 확인. 클릭 흐름은 브라우저 E2E 필요(후속) |
| AC5 | confidence 배지 조건부 표시 (3단계 색상) | PASS — 테스트에서 `72/100` + `var(--green` 단언 통과 |
| AC6 | 모바일 반응형 (2열→1열) | PASS (구현 확인) — `gridTemplateColumns: repeat(auto-fit, minmax(180px, 1fr))` 으로 자동 반응형 |
| AC7 | typecheck 통과 | PASS — 구현 phase에서 `corepack pnpm --dir apps/founder-ui typecheck` exit 0 |
| AC8 | 기존 패널 regression 없음 | PASS — intro-analysis + strategy-decision 테스트 모두 통과 |

### 파일별 리뷰

#### 1. `apps/founder-ui/src/lib/api.ts` (+16줄) — LGTM

- **`ProductStrategyData`** (L55-62): 스펙과 정확히 일치. 4개 필수 필드(product/target/problem/goal) + 2개 optional(confidence/rationale). OK.
- **`AgentOutputLite.product_strategy`** (L74): optional 추가. 기존 타입 호환성 유지. OK.
- **`api.updateTaskOutput`** (L454-458): NocoBase `filterByTk` + `values` 패턴. 기존 `closeInstruction`과 동일 패턴. OK.

#### 2. `apps/founder-ui/src/components/AgentOutputDetail.tsx` (+153/-7줄) — LGTM

- **시그니처** (L8): `taskId?: string` prop 추가. optional이므로 기존 호출부 regression 없음. OK.
- **분기 로직** (L12-13, L23-33): `hasProductStrategy = Boolean(productStrategy?.product)` — intro_analysis 다음 순서. 스펙 4.3 일치. OK.
- **`ProductStrategyPanel`** (L101-213): 읽기/편집 모드, draft/current 분리, save/cancel, 4필드 그리드, confidence 배지(`getHookScoreStyle` 재사용), rationale `<details>`. 스펙 4.1-4.2 충족. OK.
- **`RetentionCurve`** (L295-318): recharts `LineChart` → 순수 SVG 교체. SSR 테스트 안정화 + 번들 축소. OK.

#### 3. `__tests__/AgentOutputDetail.product-strategy-panel.test.tsx` (+54줄) — LGTM

- SSR `renderToStaticMarkup` 패턴 — 기존 테스트와 동일. OK.
- 양성 테스트 14개 assert + 음성 테스트 2개 assert. AC1-5,8 커버. OK.

#### 4. `docs/specs/product-strategy-card-oss-research.md` (+89줄) — LGTM

- 3개 도메인 × 2-3 후보 비교. 채택/배제 근거 명확. OK.

#### 5. `docs/specs/product-strategy-card-spec.md` (+165줄) — LGTM

- AC 8개, 영향 파일 2개, 데이터 모델, 레이아웃 명세. 구현과 정합. OK.

### Non-blocking info (수정 불필요, 참고용)

| # | 파일:줄 | 내용 | 심각도 |
|---|---------|------|--------|
| I-1 | `AgentOutputDetail.tsx:128` | **save() 에러 시 사용자 피드백 없음** — `try/finally`에서 catch 없이 에러가 조용히 무시됨. ConsultationCard도 동일 패턴(silent catch)이므로 일관성 있지만, 후속으로 저장 실패 toast 일괄 추가 권장 | info |
| I-2 | `AgentOutputDetail.tsx:295-318` | **RetentionCurve가 linear 보간** — 기존 recharts `type="monotone"`은 cardinal spline, 새 SVG는 직선 연결. 데이터 포인트 많으면 차이 미미. SSR 안정성 우선 트레이드오프로 판단 | info |
| I-3 | `AgentOutputDetail.tsx:128` | **`updateTaskOutput`이 output 전체를 덮어씀** — `{ ...output, product_strategy: draft }`로 기존 필드 보존하나, NocoBase JSON 컬럼이 deep merge가 아닌 replace일 수 있음. 현재는 product_strategy만 편집하므로 실질 문제 없으나, 동시 편집 시나리오에서 재검토 필요 | info |

---

## 🟢 2026-06-04 (최신) — 공통 Header & Mini Roadmap UI 리뷰

**판정: LGTM.** 12파일 +396/-195줄. 차단 이슈 없음. non-blocking info 2건(스펙 범위 밖 잔여 중복).

### AC 검증 결과

| AC | 기준 | 결과 |
|---|---|---|
| AC-1 | PageHeader가 monitor + projects에서 사용 | PASS — 2곳 import + render 확인 |
| AC-2 | `const ICONS` 가 Icon.tsx 1곳만 | **PARTIAL** — 스펙 대상 4곳 모두 제거됨. 스펙 범위 밖 4곳(approval, ApprovalQueueCard, ConsultationCard, SynthesisCard) 잔존. 아래 R-1 참조 |
| AC-3 | AGENT_PASTEL/AGENT_CHIP이 AgentBadge.tsx 1곳만 | **PARTIAL** — 스펙 대상 2곳 모두 제거됨. 스펙 범위 밖 2곳(control-room, approval) 잔존. 아래 R-2 참조 |
| AC-4 | 시각적 regression 없음 | PASS — 구현 phase에서 `/monitor`, `/projects`, `/chat` HTTP 200 확인 |
| AC-5 | typecheck 통과 | PASS — 구현 phase에서 `pnpm --filter @l5/founder-ui typecheck` exit 0 |
| AC-6 | package.json 변경 없음 | PASS — `git diff main...HEAD -- apps/founder-ui/package.json` 빈 출력 |

### 파일별 리뷰

#### 1. `Icon.tsx` (신규, 47줄) — LGTM
- 4곳의 ICONS 합집합 24개, 알파벳 정렬. `color` prop 포함으로 Sidebar의 `color="var(--green-press)"` 호출 호환.
- `'use client'` 올바름 (SVG 렌더링 전용, 서버 컴포넌트 불필요).

#### 2. `AgentBadge.tsx` (신규, 77줄) — LGTM
- `AGENT_PASTEL` (9 에이전트, badge용) + `AGENT_CHIP` (8 에이전트, chip용) 분리 유지. CTO 색상 차이 보존(pastel=butter, chip=sky).
- `EXECUTIVE_AGENTS` Set export로 monitor CounterpartChip의 `EXECUTIVES` 대체.
- `variant` prop 기본값 `'badge'` — 기존 monitor 호출부 (`<AgentBadge agent={...} />`)와 호환.

#### 3. `PageHeader.tsx` (신규, 56줄) — LGTM
- `subtitle`를 `ReactNode`로 선언하여 monitor의 JSX subtitle(`<>범위 · <span>...</span></>`) 대응.
- `children` slot으로 확장 가능 (스펙 4.4 Mini Roadmap 컨텍스트 대비).
- 스타일 값이 monitor 원본과 픽셀 단위 일치 (font-serif 500 30px, mono 10.5px 0.12em, etc).

#### 4. `monitor/page.tsx` (-97줄) — LGTM
- ICONS 9개 + Icon 함수 + AGENT_PASTEL 9개 + AgentBadge 함수 + EXECUTIVES Set 모두 제거.
- `EXECUTIVES` → `EXECUTIVE_AGENTS` import 교체 (`CounterpartChip` L405-407).
- 인라인 헤더 16줄 → `<PageHeader>` 6줄.

#### 5. `projects/page.tsx` (-22줄) — LGTM
- 인라인 SVG refresh 아이콘 → `<Icon name="refresh" size={14} stroke={1.8} />`.
- 원본 `alignItems: 'baseline'` → PageHeader `alignItems: 'flex-end'` 변경 — title/subtitle 구조가 다르므로 시각적 차이 미미.

#### 6. `chat/page.tsx` (-26줄) — LGTM
- ICONS 9개 + Icon 함수 제거, `import Icon from '@/components/Icon'` 1줄 추가.

#### 7. `Sidebar.tsx` (-27줄) — LGTM
- ICONS 12개 + Icon 함수 제거. `color` prop 사용하는 NavLink/IconButton 호출부 그대로 동작.

#### 8. `RoadmapMiniCard.tsx` (-20줄) — LGTM
- ICONS 4개 + Icon 함수 제거. 호출부에서 `size`/`stroke` 명시적 전달하므로 기본값 변경(13→16, 1.7→1.6) 영향 없음.

#### 9. `RoadmapTimeline.tsx` (-33줄) — LGTM
- AGENT_CHIP 맵 + AgentChip 함수 제거. `<AgentChip agent={...} />` → `<AgentBadge agent={...} variant="chip" />` 2곳(UpperCard L111, LowerCard L174) 교체.

#### 10. `__tests__/common-header-mini-roadmap.test.ts` (66줄) — LGTM
- `node:assert` 기반 정적 파일 분석. 스펙 대상 파일만 검사하므로 범위 적절.

#### 11. `docs/specs/common-header-mini-roadmap.md` (109줄) — LGTM
- 배경/목표/오픈소스 조사/요구사항/영향 파일/AC 6개/제외 범위 모두 명확.

#### 12. `docs/TASKS.md` (+11줄) — LGTM
- 체크리스트 6항목. `[x]` 스펙만, 나머지 `[ ]`는 구현 phase에서 체크 대상.

### Non-blocking 참고사항 (후속 PR 권장)

| # | 파일 | 내용 |
|---|---|---|
| R-1 | `approval/page.tsx:39`, `ApprovalQueueCard.tsx:21`, `ConsultationCard.tsx:46`, `SynthesisCard.tsx:5` | 로컬 `const ICONS` 잔존. 스펙 영향 파일 목록에 미포함이었으므로 구현 결함 아님. 후속 PR에서 `import Icon from '@/components/Icon'`으로 교체 권장. |
| R-2 | `control-room/page.tsx:83`, `approval/page.tsx:77` | 로컬 `AGENT_PASTEL` 잔존. 스펙에서 control-room은 "별도 판단 필요"로 명시적 제외. 후속 PR에서 `import AgentBadge` 교체 권장. |

---

## 🟢 2026-06-04 — Intro 30s Analysis Card 리뷰

**판정: 수정 1건 해결 후 LGTM.**

- **[P1] `AgentOutputDetail.tsx:132-139` — 수동 SVG path + Recharts LineChart 중복 렌더링.** 동일 `retentionData`로 수동 `<svg><path>` (L132-135)와 Recharts `<LineChart>` (L136-138) 두 개가 동시에 그려짐. Recharts `<LineChart>`만 남기고 수동 SVG + `buildRetentionPath` 함수(L192-207) 제거 필요. 테스트(L51 `<path` assertion)는 Recharts 내부 `<path>` 생성으로 통과.
- 나머지 LGTM: 타입(`IntroAnalysisData`), 감지(`typeof hook_score === 'number'`), 분기 우선순위(intro > strategy), 색상 분기(≥70 green/≥40 amber/<40 red), 조건부 섹션, 테스트 11 assertion + 회귀 검증, recharts devDep, 기존 사용처 변경 없음.

---

## 🟢 2026-06-04 — 코드 리뷰: State Machine + ContentApprovalGate + Intro Analysis

**판정: LGTM** — 16파일 952줄 전체 검토. 차단 이슈 없음. 테스트 26건 통과, l5-core tsc 0, hermes-runtime tsc 0.

### 리뷰 상세

#### 1. `packages/l5-core/src/functions/state-machine/transitions.ts` — **LGTM**
- `createTransitionValidator` 제네릭 팩토리: `<const T extends Record<string, readonly string[]>>` + `as const satisfies` 조합이 타입 안전하고 깔끔함.
- 4개 lookup table edge 수(11/6/7/5)가 스펙과 일치. Terminal 상태(`done`, `killed`, `closed`, `synthesized`, `deployed`, `converted_to_business`)는 빈 배열 — 정확.
- [minor] `transitionMap` 중간 변수 캐스트(`transitions as Record<string, readonly string[]>`)는 `const T` 제네릭 추론 한계 우회용으로 이해됨. 현행 유지 가능.

#### 2. `packages/l5-core/src/functions/approval.ts` — **LGTM**
- `ceo_only` dead variant 제거 완료. D3 주석 "CEO approval" → "CTO autonomous" 수정.
- `ContentApprovalGate extends ApprovalGate`: 기존 인터페이스 호환 유지하며 확장. `routeContentApproval` 라우팅 로직이 스펙 6행 테이블과 일대일 대응.
- `CONTENT_APPROVAL_TRANSITIONS` 8 edges — `createTransitionValidator` 재사용으로 패턴 일관성 유지.
- [minor] `buildContentApprovalGate` 내부 헬퍼가 `requiresFounderApproval` spread 후 `approval_level`을 덮어씀 — 의도적이고 문제 없음.

#### 3. `services/hermes-runtime/src/api/approval-queue.ts` — **LGTM**
- `approveTask`/`rejectTask` 시그니처에 `now: Date` 추가 → `new Date()` 제거. 순수 함수화 완료.
- 기존 호출부 3곳(`approval-queue.ts`, `approval-checker.ts`, `dry-run.ts`) 모두 업데이트 확인. hermes-runtime tsc 통과.

#### 4. `packages/l5-core/src/functions/state-machine/__tests__/transitions.test.ts` — **LGTM**
- `countEdges` 헬퍼로 edge 수 단언 + 팩토리 제네릭 동작 검증 + 엔티티별 유효/무효 전환 커버.
- 스펙 AC1-AC7 전부 충족.

#### 5. `packages/l5-core/src/functions/approval/__tests__/content-gate.test.ts` — **LGTM**
- `it.each` 패턴으로 라우팅 7개 조합 + 전환 유효 8개/무효 3개 커버. 스펙 AC5-AC6 충족.

#### 6. `apps/founder-ui/src/components/__tests__/AgentOutputDetail.intro-analysis-panel.test.tsx` — **LGTM**
- `renderToStaticMarkup` + `node:assert/strict`로 SSR 기반 구조 검증. React 런타임 없이 실행 가능.
- `intro_analysis` 필드 존재 시 패널 렌더링 + 부재 시 strategy decision 패널 유지 확인.
- [note] 이 테스트는 아직 red 상태(구현 UI 미작성). 다음 phase에서 green 전환 예정.

#### 7. 문서 (DECISIONS.md, 3 spec 파일) — **LGTM**
- `docs/DECISIONS.md`: XState/Robot/typescript-fsm 비교표 + build 결정 근거 명확.
- `docs/specs/STATE_MACHINE_VALIDATION_SPEC.md`: R1-R4 요구사항 + AC 7개 + 영향 파일 — 구현과 일치.
- `docs/specs/content-approval-gate-spec.md`: R1-R5 + AC 10개. 구현이 스펙을 정확히 충족.
- `docs/specs/content-approval-gate-oss-research.md`: Trigger.dev 재활용 결정 + XState/Casbin 배제 근거 합리적.

### 발견 사항 (non-blocking)

| # | 파일:위치 | 심각도 | 내용 |
|---|----------|--------|------|
| 1 | `transitions.ts:36` | info | `transitionMap` 캐스트는 TS 추론 한계 우회. `const T` 제네릭이 발전하면 제거 가능 |
| 2 | `approval.ts:128` | info | `routeContentApproval`의 `owned_media` + `email_campaign` → D4 경로가 테이블에는 있으나 주석 설명 없음. 의도는 이해됨(이메일은 고객 도달) |
| 3 | `intro-analysis-panel.test.tsx` | info | red 상태(UI 미구현). 다음 구현 phase에서 green 전환 필요 |

---

## 🟢 2026-06-04 (최신) — Intro 30s Analysis Card 스펙 작성

**오픈소스 조사 + 스펙 완료.** 상세는 `docs/TASKS.md` "Intro 30s Analysis Card" 섹션.

**설계 결정**: 독립 카드 컴포넌트가 아니라 기존 `AgentOutputDetail.tsx`에 분기 추가 (Strategy Decision Panel과 동일 패턴). `output.intro_analysis` 필드 감지 → 전용 패널 렌더링.

**데이터 모델**: `AgentOutputLite`에 `intro_analysis?: IntroAnalysisData` optional 필드 추가. 핵심 = `hook_score`(0–100), `retention_curve`(초별 pct[]), `segments`(구간별 verdict+feedback).

**라이브러리**: recharts(MIT, ~50kB) — 카드 내 미니 리텐션 커브. youtubei.js는 CMO 에이전트 런타임(l5-core) 쪽이라 이 카드 스코프 외.

**영향 파일 4개**: `api.ts`(타입), `AgentOutputDetail.tsx`(분기), `package.json`(recharts), 신규 테스트 1개. 기존 사용처(`chat/page.tsx`, `monitor/page.tsx`) 변경 불필요.

**다음 단계**: 실패 테스트 작성 → 구현 → acceptance_criteria 9개 검증.

---

## 🟢 2026-06-04 — State Machine Validation 구현 green

**완료**: `packages/l5-core/src/functions/state-machine/transitions.ts`와 `packages/l5-core/src/index.ts` re-export가 구현되어 전 단계 red 테스트가 green 전환됨.

- AgentTask 11, FounderInstruction 6, ToolRequest 7, BusinessIdea 5 edges lookup table 확인
- `createTransitionValidator` 제네릭 팩토리 유효/무효 판정 확인
- `validateAgentTaskTransition` / `validateFounderInstructionTransition` / `validateToolRequestTransition` / `validateBusinessIdeaTransition` export 확인
- 같은 core red 묶음의 `ContentApprovalGate`도 green 확인: `routeContentApproval`, `CONTENT_APPROVAL_TRANSITIONS`, `validateContentApprovalTransition`
- hermes-runtime `approveTask`/`rejectTask`는 호출자가 넘긴 `now`를 사용하도록 순수화, 관련 approval-checker 테스트 통과

**검증**:
- `corepack pnpm --filter @l5/core test` → 55 suites / 585 tests 통과
- `corepack pnpm --filter @l5/core typecheck` → 통과
- `corepack pnpm --filter @l5/hermes-runtime typecheck` → 통과
- `corepack pnpm --filter @l5/hermes-runtime test -- approval-checker.test.ts approval-checker-telegram.test.ts` → 2 suites / 11 tests 통과
- 참고: `corepack pnpm --filter @l5/hermes-runtime test` 전체는 기존 Telegram 환경변수/실네트워크 이슈(`src/notifier/__tests__/telegram.test.ts` 2건)로 실패. 이번 변경 관련 approval 테스트는 통과.

**다음**: 플러그인 raw status write를 validator로 교체하는 통합 단계는 별도 스펙/후속 작업으로 진행.

---

## 🟢 2026-06-04 — State Machine Validation 스펙 작성

**배경**: 15+ 엔티티 상태 전환이 플러그인에서 raw status 쓰기로 실행되며 l5-core에 유효 전환 정의 없음. 오픈소스 조사(XState/Robot/typescript-fsm) 결과 `build` 결정 → `createTransitionValidator` 제네릭 팩토리 + lookup table 패턴.

**완료**: `docs/specs/STATE_MACHINE_VALIDATION_SPEC.md` 작성.
- 4개 엔티티 전환 룩업 테이블 정의 (AgentTask 11, FounderInstruction 6, ToolRequest 7, BusinessIdea 5 = 29 edges)
- `createTransitionValidator<S>` 제네릭 팩토리 + 4개 편의 함수 API 설계
- 측정 가능한 acceptance criteria 7개 (edge 수 단언, 유효/무효 판정, tsc 0, 테스트 통과)
- 영향 파일 3개 식별 (`transitions.ts` 신규, `transitions.test.ts` 이전 phase 작성 완료, `index.ts` re-export)
- 플러그인 통합은 별도 후속 단계로 분리

**상태**: 구현 완료 및 core test/typecheck green.

---

## 🟢 2026-06-04 — State Machine Validation 실패 테스트 작성

**완료**: `packages/l5-core/src/functions/state-machine/__tests__/transitions.test.ts`가 스펙 AC를 red 테스트로 고정한다.
- edge count: AgentTask 11, FounderInstruction 6, ToolRequest 7, BusinessIdea 5
- `createTransitionValidator` 제네릭 팩토리 유효/무효 판정
- 엔티티별 validator 4개 유효 전환 2개 이상 + terminal→non-terminal 무효 전환

**Red 검증**:
- 명령: `corepack pnpm --filter @l5/core test -- state-machine/__tests__/transitions.test.ts`
- 결과: 실패(exit 1)
- 핵심 오류: `TS2307: Cannot find module '../transitions' or its corresponding type declarations.`

**상태**: 구현 완료 및 core test/typecheck green.

---

## 🟢 2026-06-04 (최신) — Thumbnail Pattern Card: Strategy Decision Panel 리뷰 완료

**판정: LGTM — 수정 요청 없음.**

### 리뷰 대상 diff (6 files, +223 −7)

| 파일 | 변경 | 판정 | 리뷰 코멘트 |
|------|------|------|-------------|
| `apps/founder-ui/src/components/AgentOutputDetail.tsx` L7,9-10,25-42,44,59 | `agent` prop 추가, 전략 결정 패널 분기 | LGTM | L9 `hasStrategyDecision` 감지 정확. L44 `!hasStrategyDecision` 가드로 기존 "핵심 권고" 뷰 회귀 방지 확인. L26 외곽 스타일이 기존 카드 패턴(border+radius+j-overline)과 일관. |
| `apps/founder-ui/src/components/__tests__/AgentOutputDetail.strategy-decision-panel.test.tsx` L1-37 | 테스트 확장 (기본값+명시적 agent 2경로) | LGTM | 기본값("CMO 추천") + 명시적 agent("CTO 추천") 두 경로 모두 검증. `renderToStaticMarkup` SSR 방식으로 `'use client'` 컴포넌트를 테스트 — React 18 호환 정상. |
| `apps/founder-ui/src/app/chat/page.tsx` L1182 | `agent={selectedTask.agent}` 전달 | LGTM | `selectedTask`는 `TaskItem` 타입, `.agent`는 `string` — prop 타입 일치. 기존 `output` prop만 전달하던 곳에 `agent` 추가, 하위 호환(기본값 'CMO'). |
| `apps/founder-ui/src/app/monitor/page.tsx` L817 | `agent={task.agent}` 전달 | LGTM | chat과 동일 패턴. `task`는 `TaskItem`, `.agent`는 `string`. |
| `docs/TASKS.md` | 스펙+패턴 추출+acceptance_criteria 문서화 | LGTM | 측정 가능한 기준 6개 명시. |
| `docs/HANDOFF.md` | 현재 상태 요약 | LGTM | 이 리뷰로 갱신. |

### 검증 결과

- `node --import tsx ...strategy-decision-panel.test.tsx` → **exit 0** (통과)
- `corepack pnpm --dir apps/founder-ui typecheck` → 통과 (구현 phase에서 확인)
- 미통과 테스트 2건은 **기존 환경 이슈**(nocobase `.env.e2e.example` 미존재, telegram 환경변수 불일치)로 본 변경과 무관

### acceptance_criteria 충족 확인

| # | 기준 | 결과 |
|---|------|------|
| 1 | 실패 테스트 통과 | ✅ exit 0 |
| 2 | recommendation+options → "전략 결정 패널" 렌더 | ✅ L27 `j-overline` |
| 3 | agent="CMO" → "CMO 추천" | ✅ L31 기본값 |
| 4 | agent 미전달 → 기본값 "CMO 추천" | ✅ 테스트 L24-25 |
| 5 | recommendation 없는 output → 기존 뷰 유지 | ✅ L44 가드 |
| 6 | 기존 사용처 동작 유지 | ✅ chat L1182, monitor L817 |

---

## 🟢 2026-06-04 — 오픈소스 조사: 미결정/미통합 영역 3개 비교 분석

**배경**: 프로젝트 CLAUDE.md에 기술 스택이 선언되어 있으나, 3개 영역이 미결정이거나 실제 통합이 안 된 상태. (1) LLM Observability — Langfuse 채택했으나 Phase 6 통합 미완, (2) Job Scheduling — Trigger.dev 선택했으나 실제론 launchd cron 사용 중, (3) Analytics — PostHog vs OpenPanel 미결정. 각 영역별 오픈소스 후보 2-3개를 비교하고 채택/배제 근거를 정리한다.

### 1. LLM Observability — Langfuse vs Helicone vs LangSmith

| 항목 | Langfuse | Helicone | LangSmith |
|------|----------|----------|-----------|
| 라이선스 | MIT | Apache-2.0 | 상용(무료 tier) |
| 셀프호스팅 | ✅ Docker Compose | ✅ Docker | ❌ SaaS only |
| 트레이싱 | span 기반, 중첩 지원 | 프록시 기반 로깅 | span 기반 |
| 비용 추적 | ✅ 모델별 비용 자동 계산 | ✅ 비용 대시보드 | ✅ |
| 프롬프트 관리 | ✅ 버전 관리 | ❌ | ✅ |
| SDK | JS/Python/OpenAI 호환 | 프록시(SDK 불필요) | Python/JS |
| GitHub Stars | ~10k | ~3k | 비공개 |
| 커뮤니티 | 활발, 주간 릴리즈 | 성장 중 | Langchain 종속 |

**채택: Langfuse (기존 결정 유지)**
- 근거: MIT 라이선스 + 셀프호스팅 가능(상업 플러그인 금지 정책 준수). span 기반 트레이싱이 L5의 multi-agent 체인(CEO→임원→위임)에 적합. 프롬프트 버전 관리로 executive-llm 프롬프트 관리 가능. 비용 추적이 Phase 6 요구사항(토큰/비용 모니터)과 직접 부합.
- 배제 — Helicone: 프록시 방식이라 claude CLI spawn 기반 L5 아키텍처에 맞지 않음(SDK 래핑이 불가). 배제 — LangSmith: SaaS 전용, 셀프호스팅 불가, 상용 의존 금지 정책 위반.

### 2. Job Scheduling — Trigger.dev vs BullMQ vs launchd(현행)

| 항목 | Trigger.dev | BullMQ | launchd(현행) |
|------|-------------|--------|---------------|
| 라이선스 | Apache-2.0 | MIT | macOS 내장 |
| 셀프호스팅 | ✅ Docker | ✅ Redis 필요 | ✅ (macOS only) |
| cron 스케줄 | ✅ | ✅ (bull-board) | ✅ plist |
| 재시도/백오프 | ✅ 내장 | ✅ 내장 | ❌ 수동 구현 |
| 장시간 실행 | ✅ (설계 목적) | ⚠️ 워커 타임아웃 관리 필요 | ✅ (데몬) |
| 일시 중지/재개 | ✅ (approval pause) | ❌ 수동 | ❌ 수동 |
| 대시보드 | ✅ 웹 UI | ✅ bull-board | ❌ 로그 직접 확인 |
| 이식성 | Linux/Docker | Linux/Docker | macOS only |
| 추가 인프라 | PostgreSQL(이미 보유) | Redis(신규) | 없음 |

**채택: Trigger.dev (기존 결정 유지, 통합 시점 = 프로덕션 배포 시)**
- 근거: Apache-2.0 + 셀프호스팅. approval-pause(승인 대기 일시 중지)가 L5의 D4/D5 승인 게이트와 직접 부합. 장시간 에이전트 실행(CTO 6-phase 파이프라인 등)에 적합. PostgreSQL 백엔드라 추가 인프라(Redis) 불필요.
- **현실적 판단**: 현재 launchd cron이 안정 작동 중(dispatcher·approval-checker·daily-brief 등 5+ 서비스). 로컬 개발 단계에서 Trigger.dev 마이그레이션은 순이익 없음. **프로덕션/Docker 배포 시점에 전환** — launchd는 macOS 전용이라 Linux 서버 배포 불가.
- 배제 — BullMQ: Redis 추가 인프라 필요, approval-pause 미지원, L5의 기존 PostgreSQL 스택과 불일치.

### 3. Analytics — PostHog vs OpenPanel vs Umami

| 항목 | PostHog | OpenPanel | Umami |
|------|---------|-----------|-------|
| 라이선스 | MIT | AGPL-3.0 | MIT |
| 셀프호스팅 | ✅ Docker (무거움, ~2GB+) | ✅ Docker (경량) | ✅ Docker (경량) |
| 이벤트 추적 | ✅ 풀스택 | ✅ 웹+앱 | ✅ 웹 중심 |
| 세션 리플레이 | ✅ | ❌ | ❌ |
| 퍼널 분석 | ✅ | ✅ | ❌ |
| A/B 테스트 | ✅ | ❌ | ❌ |
| 리소스 요구 | 높음 (ClickHouse) | 낮음 | 매우 낮음 |
| API | ✅ REST/JS SDK | ✅ REST/JS SDK | ✅ REST |
| PMF 실험 연계 | ✅ (퍼널+피처플래그) | ⚠️ 제한적 | ❌ |

**채택: PostHog (조건부, PMF 실험 활성화 시점에 도입)**
- 근거: MIT 라이선스 + 셀프호스팅. PMF Experiment Board(PRD Feature 8)에 필요한 퍼널 분석·A/B 테스트·피처 플래그를 단일 도구로 제공. Formbricks(설문)와 PostHog(행동 분석) 조합이 PMF 측정에 가장 풍부한 신호.
- **현실적 판단**: MVP 단계에서 Analytics는 범위 밖(CLAUDE.md "Optional Analytics, later only"). 리소스가 무거워(ClickHouse) 로컬 개발에 부담. **PMF 실험이 활성화되는 시점에 도입**.
- 대안 — OpenPanel: 경량이나 AGPL-3.0(L5 플러그인 배포 시 라이선스 전파 위험) + A/B 테스트 미지원. 대안 — Umami: 가장 경량이나 퍼널/A/B 없어 PMF 실험 연계 불가. 단순 페이지뷰 추적만 필요하면 재검토 후보.

**주의**: 세 영역 모두 즉시 통합 대상이 아님. Langfuse = Phase 6에서 통합, Trigger.dev = 프로덕션 배포 시 전환, PostHog = PMF 실험 활성화 시 도입.

---

## 🟢 2026-06-04 (최신) — 실제 토큰/비용 캡처 + M9.6 self-upgrade 안전강화 + 안정화

**실제 토큰/비용 캡처 (3레포, 라이브 골드검증)**: 예상 토큰에 더해 **측정 실제값**을 컨트롤룸까지 결선.
- **ACR**(`agent_control_room_docs`, 커밋 ac4942f): `ACR_CAPTURE_TOKENS=1` 시 claude를 `--output-format stream-json --verbose`로 실행 → 라이브 로그(텍스트 이벤트)와 최종 result usage(토큰/비용)를 둘 다 캡처. `claude-token-parser`(6테스트), spawn-runner onTokens, ExecutionLog 토큰 필드, `/api/l5/execution`이 phase별 합산해 `total_tokens`+`estimated_cost_usd` 반환. **ACR_CAPTURE_TOKENS=1을 .env.local에 활성화함.**
- **L5**(커밋 f5a1cd6): acr-execution-transport + build-control-room-tree가 actual_total_tokens·actual_cost_usd 머지. founder-ui dev-task 카드 = 실제값 있으면 "사용 토큰 Xk · $Y", 없으면 "예상 토큰 약 Xk–Yk".
- **골드 E2E**: 실제 TINY claude 디스패치 → claude stream-json 파싱 → ExecutionLog → /api/l5/execution → controlRoomTree → UI까지 **total_tokens=423914·$0.34** 흐름 + "사용 토큰 424k · $0.34" 화면 확인. (검증 데이터 정리함.)

**M9.6 self-upgrade deny-list 강화 (커밋 1744e5f)**: 루프(Hermes→tool-request→sendToCTO→CTO→approval→apply/rollback)는 기존 결선, 초기화는 M10 CTO 기획 패널로도 가능. 안전 강화 = deny-list를 l5-core 공유·테스트 함수로 승격(`checkSelfModDiffForbidden` 경로 + `checkSelfModIntentForbidden` NL 한/영, 6테스트). sendToCTO **생성 시점 조기 차단**(CLI 실행 전) + applySelfMod 적용 시점 diff 검사 리팩터. 라이브: '승인 게이트 우회' intent 차단 확인.

**안정화**: l5-core 559/559, hermes-runtime 86/86, agent-runtime 5/5(M9.3 commit→antigravity stale 테스트 수정), ACR claude-token-parser 6/6. founder-ui tsc+E2E(기획/번다운/실제토큰) 콘솔에러 0. 서비스 4종(nocobase·founder-ui·acr-web·dispatcher) 정상.

**주의**: ACR 레포엔 내 세션 이전의 미커밋 변경 다수 존재(AGENTS.md/CLAUDE.md/workbench routes 등) — 내 커밋 ac4942f는 토큰 캡처 8파일만. dist/plugin.js는 두 플러그인 모두 gitignore(src가 추적 소스). executive-monitor RISK_RANK는 기존 dead code.

---

## 🟢 2026-06-04 (최신) — Phase6 예상 토큰 + M9.5 로드맵 번다운

**Phase6 — 예상 토큰(완료, 실제 사용량은 후속)**: l5-core `token-estimate`(classifyTask|CTO size판단 → DEV_WORKFLOW phase수 → tier별 토큰범위 합산). **CTO 기획 시 LLM이 작업별 `size`(tiny/small/feature/big)를 시니어 개발자처럼 판단** → 키워드분류 기본값(전부 FEATURE) 문제 해결(다크모드 데모 350k–910k → 150k–374k). `CtoPlan.token_estimate`로 planMessage 응답 포함. PlanCard "예상 토큰 약 Xk–Yk"(승인 전 판단), 컨트롤룸 dev-task별 예상 토큰. **남은 것 = 실제 누적 토큰/비용**: hermes-agent가 session_*_tokens·estimated_cost_usd를 내부 보유하나 ACR로 전혀 안 흐름(SessionReport.tokensUsed 항상 0). 결선 경로 = hermes→ACR 콜백→`/api/l5/execution` AcrExecTask 확장→controlRoomTree 머지→UI(3레포, 실제 CLI 실행 필요).

**M9.5 — 로드맵 번다운(완료)**: l5-core `roadmap/progress`(deriveRoadmapItemStatus + summarizeRoadmap). plugin `cto:roadmapProgress`(roadmap_items LEFT JOIN agent_tasks 단일 쿼리, **done 포함 카운트** — controlRoomTree는 done 제외라 별도 쿼리 필요했음). 컨트롤룸 `RoadmapProgressPanel`(진행바·상태칩·완료 취소선 + "X% · 작업 a/b · 단계 c/d"). 라이브 E2E 검증.

**남은 것**: M9.6(self-upgrade 결선) · 실제 토큰/비용 캡처(hermes→ACR, 3레포) · 워밍 세션(cold-start). 데모 business 98(TINY, /tmp 샌드박스)·99(vision) 잔존.

---

## 🟢 2026-06-04 — M10 CTO 대화형 기획 패널 완성(슬라이스 1·A·B·C·D)

**배경**: 창업자가 "컨트롤룸에서 CTO와 직접 대화해 PRD→로드맵으로 같이 기획. CEO 경유 task도, CTO와 직접 넣는 task도 있고, 새 프로젝트면 CTO/CEO가 허락 받고 자율 생성". 확정: **CTO 기획 패널 = 컨트롤룸 안**, 승인 = **한 번에 계획 승인**.

**완료 (5 슬라이스 전부)**:
- **1·A (l5-core 두뇌)**: `roadmap/generate-roadmap`(PRD→로드맵, 10테스트) + `cto-planning/plan-turn`(`runCtoPlanningTurn` 창업자↔CTO 한 턴 → reply + plan{prd·roadmap_items·tasks·project_proposal}, 7테스트). l5-core 537/537.
- **B (데이터 모델)**: `cto_planning_messages`·`roadmap_items` 테이블, `projects.prd`·`agent_tasks.roadmap_item_id` 컬럼.
- **C (백엔드 액션)**: plugin-orchestration(src+dist)에 `cto:planMessage`(대화→reply+plan 저장) + `cto:approvePlan`(**트랜잭션 일괄**: PRD·roadmap_items·founder_instruction·agent_tasks(CTO/queued/D2)·task→roadmap 연결, project_proposal 시 project 생성, **멱등**). 컬렉션+ACL. 라이브 E2E: 다크모드 기획→3 로드맵+4 task 연결, 재승인 already_approved.
- **D (UI)**: 컨트롤룸 `CtoPlanningPanel`(접이식 채팅) + `PlanCard`(PRD·로드맵·작업·새 프로젝트 배너·"이 계획 승인"). 승인 시 트리 새로고침. Playwright E2E: 렌더·전송·계획 카드·승인 버튼, 콘솔 에러 0.

**핵심 주의**: dist/plugin.js는 **gitignore**(빌드 스크립트 없음) → src가 추적 소스, 런타임은 dist 직접 패치. 인증=admin@nocobase.com/admin123(+X-Authenticator: basic). 액션 ACL=loggedIn → Bearer 토큰만으로 호출.

**다음**: M9.5(plan-burndown) · M9.6(self-upgrade 결선) · Phase6(토큰/비용 표시) · 워밍된 에이전트 세션(cold-start 단축).

---

## 🟢 2026-06-04 (최신) — M9 우선순위 재정의 + M9.1 ACR execution 엔드포인트

**배경**: 창업자가 "Phase6만 하면 CTO/ACR 완벽?"을 묻고 비전 제시(CEO기획→CTO로드맵→멀티CLI 배정→실시간 컨트롤룸→토큰 표시). 코드 조사 결과 비전은 구조적 70~80% 존재하나 **컨트롤룸 ACR 데이터가 stub**(`GET /api/l5/execution` 부재가 최대 병목). → 우선순위 재배열: **M9(라이브화) > M8.1 > Phase6**. 상세 = `docs/TASKS.md` M9, `docs/DECISIONS.md` 2026-06-04, 메모리 `l5-cto-acr-vision-m9`.

**확정 결정**: ① 승인 게이트 = D4(외부 고객 메시지)·D5(결제/계약)만. 코딩=D2 내부실행, 브랜치+검증이 안전장치 → per-task 승인 불필요. ② self-mod 게이트 엄격 유지, 단 self-upgrade(CTO가 에이전트용 도구 개발) 경로는 Founder go/no-go 승인으로 살림. ③ ACR repo 2개 구분: 실제 dispatch 대상 = `~/Desktop/양원민 개발자/agent_control_room_docs`(Next.js), CLI 런타임 = `~/Desktop/hermes-agent`(Python, 토큰데이터 보유).

**M9.1 라이브 완료**: ACR에 `app/api/l5/execution/route.ts` 신규. `x-l5-shared-secret` 인증 + l5_task_id당 FeaturePlan(여러 phase)을 L5 `AcrExecTask` 1개로 집계. **검증**: ACR `tsc` 0에러 + `next build` + `launchctl kickstart -k com.l5.acr-web` 재시작 + 라이브 HTTP 4종(무인증/오secret→401, 유효→200/19레코드 claude-code·codex 둘 다, l5-<taskId> 스코핑→1건).

**M9.2 환경 배선 완료(E2E 검증 대기)**: `apps/nocobase-app/.env`에 `ACR_EXECUTION_ENABLED=1` + `com.l5.nocobase` 재시작. 양쪽 L5_SHARED_SECRET 일치(sha e82040de). **단, 2026-06-03 P0 데이터 초기화로 현재 L5 CTO agent_task 0건** → controlRoomTree에 머지할 dev-task가 없어 비어 보임(배선은 정상, 표시할 현재 데이터가 없음). 진짜 시각 증명 = 새 CTO 태스크 dispatch→ACR 실행→컨트롤룸 라이브 E2E.

**Fresh CLI E2E 실증(2026-06-04)**: 샌드박스 /tmp/l5-m9-e2e에 3개 D1 태스크(claude/codex/agy) 직접 dispatch. **결과**: claude ✅13초 완료(파일 생성), codex·agy는 13~15분 행으로 미완. execution-logs 전체 이력 = claude-code 30 done / **codex 0 done(10 running 멈춤) / agy 0 done(1 running)**. → 라우팅·dispatch·브랜치·M9.1 상태추적은 전부 동작하나 **헤드리스 완료 CLI는 claude뿐**. M9.3 선결 = codex/agy 헤드리스 호출 수정(메모리 `l5-acr-cli-completion-status`). 스코프 정정: M9.4는 메인chat 통합 아님 → 컨트롤룸 표시 + 우측상단 NotificationBell 완료 알림(ACR→L5 `taskCallback` 정상, UUID task면 도달).

**M9.3+M9.4 완료 + 비전 라이브 E2E(2026-06-04)**: ① codex/agy stdin 버그 수정(완료). ② **M9.3** cto.ts `tierToRuntime`(T1=claude/T2=codex/T3=antigravity)로 phase 분산 — 빌드 배포. ③ **dispatcher fix** — CTO를 ACR dispatch 후 `running` 유지(즉시 done 막아 컨트롤룸이 실행 중 작업 표시), 테스트 7/7, 배포. ④ **M9.4** NotificationBell에 완료 알림(`getCompletionAlerts`=최근 founder_deliverables) + 컨트롤룸 라이브.
**라이브 E2E 증명**: throwaway business 99(repo_path=/tmp/l5-vision-demo 샌드박스)+project+instruction+CTO task 시드 → `launchctl kickstart com.l5.hermes.task-dispatcher` → **실제 dispatcher→cto.ts(M9.3)→ACR** 통해 6-phase FeaturePlan 생성, **CLI 분산 claude3/codex2/agy1**(설계대로). L5 task=running, **controlRoomTree(biz 99)가 "phase 1/6 running, branch, agent" 라이브 표시**. = 창업자 비전(CTO 로드맵→모델별 배정→컨트롤룸 실시간) 실제 흐름 확인. (watcher가 6-phase 완료→종 알림까지 추적 중.)

**다음**: M9.5(plan-burndown 시각화) · M9.6(self-upgrade 결선) · Phase6(토큰/비용 표시, ACR 데이터 노출). NocoBase 인증=admin@nocobase.com/admin123(+X-Authenticator: basic). 데모 정리: business/project/task id 99 + founder_instruction + /tmp/l5-vision-demo는 데모용(필요시 제거).

---

## 🟢 2026-06-03 (최신) — QA wiring 재정비 + 전체 E2E/smoke + archive 청소

**배경**: 기능이 많이 추가된 뒤 QA wiring이 끊긴 상태였다. `.next/`와 `apps/nocobase-app/storage/`가 git 추적 대상이라 QA마다 dirty diff가 오염됐고, `agent-runtime` 테스트와 Founder UI E2E가 root QA 흐름에 제대로 연결되지 않았다.

**완료**:
- `.next/`, `apps/nocobase-app/storage/`를 git index에서 제거하고 `.gitignore`에 추가했다. 로컬 파일은 유지되며, 앞으로 빌드/런타임 산출물이 diff를 오염시키지 않는다.
- `services/agent-runtime`에 Jest `test`/`test:watch` script와 devDeps를 추가해 기존 `cto.test.ts`가 실제 QA에 포함되게 했다.
- `apps/founder-ui`에 `e2e` script를 추가하고 `e2e/new-cards.mjs`의 로그인 계정/env fallback 및 stale anchor를 최신 UI 문구에 맞췄다.
- CEO clarification 정책을 보수적으로 조정했다. 모호하지만 진행 가능한 내부 기획/초안/분석은 assumptions/success criteria로 진행하고, 정말 대상/목적/승인 정보가 없어 막힌 경우만 질문한다.
- decomposer fanout을 줄였다. `빠르게`, `초안`, `몇 개만`, `single/one agent` 같은 intent는 1-2개 agent만 태우고, normal도 기본 3개 이하로 제한한다.
- RiskQA 정책을 정리했다. D3-D5 자체가 차단 조건이 아니라, 외부 발신/결제/법적 실행처럼 founder gate가 빠진 실제 행동을 차단한다.
- NocoBase plugin test의 CSS import 실패를 구조 검증 방식으로 바꿨고, `node-cron`은 plugin build 번들 대상에서 빠지도록 app-level lazy load로 조정했다.
- authenticated smoke는 `vague prompt -> clarification`, `concrete internal prompt -> tasks`로 최신 정책을 검증하도록 고쳤다.
- NocoBase E2E는 Postgres `.env` 영향을 받지 않도록 SQLite override + generated auth setup을 추가했다.
- Founder UI 상세 E2E 3종(`new-cards`, `verify-changes`, `verify-live`, `e2e-projects`)을 현재 UI 계약에 맞췄다.
- autopilot smoke는 deterministic CTO 단일-task 지시로 바꿨고, 실행 커맨드 로그의 token 노출을 redaction 처리했다.
- D6 delegation smoke는 현재 FK 계약에 맞게 `ceo_interpretations` seed 후 `agent_tasks.interpretation_id`를 넣도록 고쳤다.
- `apps/nocobase` legacy scaffold는 pnpm workspace에서 제외했다. `artifacts/`, `work-orders/`는 `docs/archive/2026-06-03-cleanup/`으로 이동했다.

**검증**: workspace `typecheck`/`lint`/`test`/`build`, `@l5/core` 48 suites/516 tests, `@l5/agent-runtime` 1 suite/5 tests, `@l5/hermes-runtime` 13 suites/86 tests, Founder UI typecheck/build/E2E/detail E2E, NocoBase app tests/E2E, plugin-orchestration build, plugin-executive-monitor build, `smoke:nocobase-auth`, autopilot smoke, D6 delegation smoke, `pnpm validate` 모두 통과. Docker warning은 optional.

**남은 청소 후보**: `reports/`는 아직 active planning reference가 있어 보존했다. `docs/legacy`와 커진 HANDOFF 장기 로그는 히스토리 참조가 많아 별도 분리 대상으로 남긴다.

---

## 🟢 2026-06-03 (최신) — 사용자 플로우 정합화 (산출물 가시화 · 사업필터 · 역할 재정의 · CEO 되묻기)

**배경**: 창업자가 실제 시드(세컨브레인 안정화 지시)로 채워진 콘솔을 써보니 다수 어긋남 발견 — "synthesis가 구체적 결과물을 안 보여줌(판단 불가)", "로드맵엔 보이는데 인박스엔 안 보임", "최종 보고서 버튼이 RiskQA 새 task를 또 만듦", "사업 선택해도 monitor/control-room이 필터 안 됨". 조사(Explore 4 + DB)로 **근원 = 임원 산출물이 어디에도 영속되지 않음**을 확정. 계획 `~/.claude/plans/agile-watching-owl.md`. 전체 7개 작업을 의존순으로 구현.

**A 임원 산출물 영속화 (키스톤) — ✅ 라이브**: `agent_tasks.output`(jsonb) 컬럼 추가(plugin.ts 인라인 정의 + **psql ALTER**, 기존 테이블이라 NocoBase sync 미반영). executeTask가 `result.output`(전체 AgentOutput) 저장. `executive-llm.ts:165` `what_was_completed: recommendation || current_situation` fallback. 직전까지는 풍부한 output이 handoff.context 한 조각만 남고 버려졌음(synthesis/인박스가 빈약했던 근원).

**B synthesize 실데이터 — ✅ 테스트 10/10**: `synthesize.ts` TaskOutcome.output 추가, buildUserPrompt가 recommendation/options/action_items/insight 전달, fallbackSummary 보강, SYSTEM_PROMPT "구체적 산출물 반영(메타설명 금지)". `maybeSynthesizeInstruction`이 outcomes에 task.output 주입.

**C 인박스 = 실제 결과물 + 진행상태 — ✅ 라이브(스크린샷)**: 신규 `AgentOutputDetail.tsx`(목표/권고/선택지/실행항목/인사이트 구조 렌더, 인박스·모니터 공용). 인박스 상세에 output 렌더. `getInboxTasks` 필터 `needs_review만 → killed제외 전부`(진행중+검토+완료, 상태칩). 액션패널은 needs_review에만. **핵심 버그 수정**: getInboxTasks가 project_id로 좁혀 "로드맵엔 보이는데 인박스엔 없음" 발생 → **business_id 기준으로 변경**(task는 project=4인데 사이드바가 project=5 자동선택해 0건이던 정체).

**D 로드맵 재정의 + 드릴다운 — ✅**: RoadmapMiniCard/RoadmapTimeline은 이미 간결+클릭→인박스(openInboxTask) 구현돼 있었음. 갭은 ref 진입 task의 output 부재 → `selectTask`가 output 없으면 `getTaskDetail`로 보강 fetch.

**E 모니터 드릴다운 — ✅ 라이브**: monitor AgentLiveCard 클릭 → `TaskDrillDownModal`(getTaskDetail+getTaskHandoffs → AgentOutputDetail + handoff 체인). api `getTaskDetail` 추가.

**F 사업 필터 — ✅ 라이브**: monitor `api.liveStatus(businessId)` 파라미터 추가 + page에서 scope 전달(백엔드는 이미 지원). control-room 백엔드 `controlRoomTree` businesses/projects SQL에 `bizFilter`(scope.kind==='biz') parametrized 적용. **검증: liveStatus 세컨브레인=4/QA=0/공통=0, controlRoomTree 세컨브레인=[세컨브레인]/QA=[]**.

**G CEO 되묻기 (신규) — ✅ 라이브**: `interpreter.ts`에 `needs_clarification`/`clarification_question`(business 모호성과 평행). 순수 함수 `clarification.ts` `resolveClarification`(business 우선). submitInstruction 분기를 일반화(정보부족 시 task 미생성 + ceo 질문 메시지). **검증: 모호 지시 "그거 좀 잘 처리해줘" → needs_clarification=true, kind=general, 한국어 되묻기, tasks=[]**. **보수화(후속 보강)**: `resolveClarification`에 `isGenuinelyBlocked` 게이트 추가 — 구체적 goal+가정/성공기준이 있으면 되묻지 않고 가정으로 진행, 외부발신/결제(approval_required)거나 referential 모호("그거/지난번")일 때만 질문. 과도한 되묻기 방지. interpreter 프롬프트도 "정말 막혔을 때만 ask" 톤으로 강화.

**H delegate 정리 — ✅ 라이브**: synthesize가 delegate next_action 항상 drop(새 task 생성이 창업자를 놀라게 함). Contribution에 task_id 추가 → SynthesisCard 기여 행 클릭 → 인박스에서 기존 산출물 상세(openInboxTask). delegate 핸들러 dead코드 정리.

**검증 (Playwright 설치 + 라이브 executeTask 전체 흐름)**: `@playwright/test` 설치(`apps/founder-ui`, 바이너리 기존). E2E `e2e/verify-changes.mjs`·`e2e/verify-live.mjs`: 인박스 output(권고/선택지/실행항목) 표시 ✅, 모니터 드릴다운 모달 ✅, synthesis 카드 ✅, 6페이지 콘솔/네트워크 에러 0 ✅. founder-ui tsc 0 + next build 12페이지.
- **라이브 executeTask 실증 (A/B/H, 실제 LLM)**: 지시("세컨브레인 백업·복구 정책 점검 + 개선 액션 3") → 3 task. **COO executeTask 2:17 → status=done + `agent_tasks.output` 실저장**(recommendation "옵션 B 경량 자동화…", action_items 10) — A를 psql 주입 아닌 진짜 실행 경로로 실증. **RiskQA 3:39 → done + output**. 모든 task terminal → **synthesis 자동 생성**: decision_summary가 구체 산출물 종합("옵션 B=PostgreSQL daily snapshot+audit trigger+S3, Tier-1/2/3 격층화, RiskQA compliance·COO 자동화 일치, 즉시조치 3건 6/20까지") = B 실증. contributions 2건 실데이터 summary, **next_actions=approve,hold만(delegate 없음)** + task_id 보유 = H 실증. instruction=synthesized.
- **CTO는 executeTask가 직접 실행 안 함(`deferred:true`)** — Hermes dispatcher(launchd 60s)→ACR 전담 경로. ACR 미연결(stub)이라 이번 검증에선 CTO를 killed 마감 후 synthesis 트리거. **CTO 라이브 실행은 c(ACR `GET /api/l5/execution` 연결)가 전제.**

**다음 작업 순서 (사용자 지정)**: **c(CTO/ACR 실행 연결) 먼저 → b(M7 채팅 임원 라운드테이블) 나중.** "채팅에 임원 불러와 대화"는 현재 미구현(chat role=founder/ceo/chief_of_staff만, M7 백로그). plugin src+dist 미러 패치 상태, **커밋은 사용자가 직접 진행 예정**.

---

## 🟢 2026-06-03 (최신) — 운영 콘솔 재편: 종합 산출물 + 모니터링 + 지식 자동화 + Control Room + CTO 자가수정

**배경**: 창업자 통증 — "지시는 되는데 각 에이전트 결과가 종합돼 최종 산출물로 안 와서 다음 세션을 못 간다. UI도 안 쓰는 게 많고 메모리 리뷰는 raw JSON, Control Room은 CTO 작업이 안 보인다." 계획서 `reports/l5-console-redesign-plan.html`, 설계 `docs/specs/P1~P3-4.md`(subagent 병렬). 빌드도 subagent 병렬(2 플러그인 레인 + UI 페이지별).

**P0 초기화**: 누적 task/chat/memory 전부 삭제(트랜잭션), businesses(4)·projects(5) 보존.

**P1 종합 산출물 (키스톤) — ✅ 라이브 통과**: `packages/l5-core/src/functions/chief-of-staff/synthesize.ts`(`synthesizeDeliverable`, contributions는 코드 소유·LLM은 summary만, 결정론 fallback, 11테스트). orchestration `maybeSynthesizeInstruction`(executeTask 꼬리에서 instruction의 모든 task done/killed 감지→종합→`founder_deliverables` insert + `chat_messages` role='chief_of_staff' kind=synthesis 카드. 멱등: instruction.status='synthesized' claim + UNIQUE(instruction_id)). UI `SynthesisCard.tsx`(결정요약·임원별 기여·남은 공백·다음액션 approve=closeInstruction/delegate=submitInstruction/hold). **E2E: 지시 시드→executeTask(CMO 98s)→done→founder_deliverables 1건(실종합문+기여1+액션2)+채팅카드 생성, instr→synthesized 확인.**

**P2 실시간 모니터링 — ✅ 엔드포인트 라이브**: `l5-core/functions/monitor/live-status.ts`(`deriveLiveStatus` 순수, DB-derived, 27테스트). executive-monitor `monitor:liveStatus`(agent_tasks+delegations+consultations+blocker 조인→{queued,investigating,talking(→who),awaiting_*,under_review,done,blocked}). monitor 페이지 지시별 그룹+상태점+8s 폴링.

**P3-2 지식 자동 큐레이션 — ✅ 엔드포인트 라이브(curate 동작 확인)**: `l5-core/functions/memory/curation.ts`(`curateInsight`/`scoreInsight`/`summarizeCuration`, pii_high→too_short→dup(유사도 주입)→점수밴드, 22테스트). executive-monitor `monitor:curate`(sweep: auto_save→세컨브레인 append/auto_discard→soft-delete +30d/needs_review)·`curationSummary`·`overrideCuration`. founder_memory에 curation_decision/discard_reason/discarded_at/purge_at 컬럼. hermes 일일 퍼지 cron. 지식 페이지(raw JSON 제거, 주간 저장/폐기 요약+복원).

**P3-3 Control Room — ✅ 엔드포인트 라이브(degraded)**: `l5-core/functions/cto-control-room`(`buildControlRoomTree` 순수, 7테스트). executive-monitor `monitor:controlRoomTree`(businesses+projects+CTO agent_tasks). control-room 페이지 사업▸프로젝트▸개발과제 트리 + ACR 실행 strip. **ACR transport는 stub(`ACR_EXECUTION_ENABLED=1`+ACR repo의 `GET /api/l5/execution` 라우트 추가 시 활성) — 미연결시 "실행 정보 없음"으로 우아하게 축소.**

**P3-4 CTO 자가수정 — ✅ E2E 통과**: `l5-core` `buildSelfModAcceptanceCriteria`(3테스트). executive-monitor `monitor:sendToCTO`(Tool Request→self-mod CTO task 생성, source_ref=selfmod:<origin>, D3, **raw SQL insert로 FK 코어션 우회** [[nocobase-rest-create-id-fk-gotcha]])·`applySelfMod`(deny-list[plugin-orchestration/.env/launchd/SECURITY_/approval] + needs_restart 정직성)·`rollbackSelfMod`(브랜치 폐기). orchestration agent_tasks에 self_mod_origin/self_mod_status/acr_branch/acr_diff/acr_pr_url 컬럼 + taskCallback selfmod 분기(pass→awaiting_apply, diff 영속, 승인 게이트). UI tool-requests [CTO에게 전송] 버튼+칩, approval diff 미리보기+적용/롤백. **E2E: sendToCTO→self-mod task(D3,queued)+origin sent→applySelfMod→applied/needs_restart 확인.** 자가수정=D3+ 코드변이 게이트(위험도=게이트 아님 원칙의 의도적 예외, DECISIONS 기록).

**검증 방식**: headless 브라우저 미설치 → 페이지 HTTP 200 + 각 페이지가 호출하는 API 엔드포인트 200/shape 확인(브라우저 동등). founder-ui next build 전 페이지 prerender 통과. **발견·수정한 에러: sendToCTO의 `fk_agent_task_interpretation` 코어션 → raw SQL insert.** 회귀: l5-core 503/506(3건 pre-existing baseline: decomposer/executive-runtime/approval-routing, 본 작업 무관).

**남은 후속**: ACR `GET /api/l5/execution`(별도 repo) → control-room 실행정보 라이브. self-mod 실제 머지(현재 needs_restart). worker 도구 활성(`L5_EXECUTIVE_TOOLS=1`).

---

## 🟢 2026-06-02 (최신) — M6 완료: 임원 위임 + 검증 반복 루프 (D1–D6 라이브 통과)

**배경**: 창업자 요청 — "CEO를 거친 임원↔임원 위임 오케스트레이션 + CMO↔CTO 검증 반복 루프(매번 CEO 거치지 않게)". spec=`docs/EXECUTIVE_DELEGATION_SPEC.md`(M6, 슬라이스 D1~D6). 6번 요청(채팅 멀티에이전트 라운드테이블)은 `docs/TASKS.md` **M7 백로그**로 분리.

**핵심 설계**: CEO=게이트(진입 승인/이탈 에스컬레이션만), 루프 본체=결정론적 컨트롤러(제작→검증→fail시 피드백 재투입). 매 반복 CEO LLM 미개입 → 비용/지연 차단. 예산(max_rounds 1–5) + 수용 기준 필수로 무한루프 방지.

**완료 (l5-core 순수 두뇌):**
- **D1 — `ask_executive` 도구**: `packages/l5-core/src/functions/delegation/index.ts`(`validateDelegationRequest`) + `tool.ts`(`createAskExecutiveTool({ propose })`, `data.delegation_opened=true`). 11 테스트.
- **D4 — `runDelegationLoop` 컨트롤러**: `delegation/loop.ts` — `runWork`/`verify` 주입형 결정론 루프, pass→resolved / 예산소진→escalated. LLM·I/O 미접촉. 4 테스트.
- **검증 부품**: `delegation/verify.ts`(`buildVerificationPrompt`/`parseVerdict` — 요청 임원이 수용기준 대비 pass/feedback 채점, garbage→fail 보수적). 7 테스트. delegation **24/24 pass**, tsc 0, build clean. index 재수출(tool+loop+verify).

**완료 (plugin 배선 — `apps/nocobase-app/.../plugin-orchestration`, src=진실 + dist/plugin.js 직접 패치):**
- **D2**: `executive_delegations` 테이블(`CREATE TABLE IF NOT EXISTS`, 컬럼: from/to_agent, origin/work_task_id, objective, acceptance_criteria, status, round, max_rounds, last_feedback, result_summary, business_id) + 컬렉션 등록 + executeTask 내 `ask_executive` propose(레코드 open + origin task `awaiting_delegation:<id>`) + defer 감지 + resolved 위임 결과 recalledInsights 주입.
- **D3+D5**: `delegation` 리소스(`list`/`advance`) + ACL. `advance`가 `runDelegationLoop` 동기 구동 — runWork=work task 생성/reissue→`executeAgentTaskLive`(secondbrain/video 도구, `L5_EXECUTIVE_TOOLS=1` 게이트), verify=요청 임원 LLM 채점. resolved→origin queued 재개 / escalated→origin `awaiting_founder`. 중첩 위임 방지(worker엔 ask_* 도구 미부여).
- **라이브 로드 검증(read-only, LLM·브라우저 없음)**: nocobase 재기동 후 `GET /api/delegation:list`→`{ok:true,data:[]}`, `GET /api/executive_delegations:list`→빈 컬렉션 200. 리소스/ACL/테이블/컬렉션 적재 확인.

**완료 (D6 — 라이브 E2E):**
- `scripts/d6-delegation-smoke.sh`: SQL로 CMO→CTO 위임(max_rounds=2) 시드 후 `POST /api/delegation:advance` 1회. **결과: 122s → status=resolved, round=1.** CTO work task=done(실제 세컨브레인 MCP 개선안 산출 — current_situation/goal/bottleneck/action_items), CMO 검증 1라운드 pass(last_feedback 빈값), **origin CMO task needs_review→queued 재개(blocker 해제)**, handoffs(CTO→ceo, CEO→CTO) 적재, result_summary 저장. claude CLI MCP off → 브라우저/팝업 없음. 시드 레코드 전부 정리(잔여 0).
- **주의(시드 우회)**: NocoBase REST `:create`는 client id를 무시·자체 uuid 생성하고 agent_tasks는 instruction/interpretation **FK + 액션 레이어가 빈 문자열 강제** quirk가 있어, 시드는 **psql 직접 INSERT**로 했다(REST 우회). work task는 plugin 내부 repository.create라 영향 없음.
- **남은 후속(선택)**: ① worker 도구 활성(`L5_EXECUTIVE_TOOLS=1` + transport env)으로 실제 secondbrain/video 도구 쥔 위임 ② ask_executive 자동 발화(채팅→CMO가 스스로 위임) ③ `advance`를 dispatcher가 무인 트리거(현재 수동 1회). ①②③은 라이브 전제 환경/비결정 LLM 의존 — 별도 작업.

**성능**: `advance`는 동기 + 라운드당 executeAgentTaskLive(도구 off 시 ~50s, 검증 LLM ~10s). max_rounds=2에서 122s. max_rounds 3이면 최대 ~3–4분(도구 on이면 더 김). 장시간 위임은 비동기 경로 분리 고려.

**참고**: 영상 실제 렌더링 미연결은 **의도된 설계**(창업자가 원고 검토 후 영상 제작) — follow-up "갭" 아님. 도구 자율 루프 토대는 [[l5-claude-cli-tool-loop]].

---

## 🟢 2026-06-02 (최신) — 라이브 임원 자율 도구 루프 블로커 해소 (executeTask 타임아웃 → done, 도구 실호출 검증)

**배경**: 직전 상태의 ⚠️ 블로커("CMO executeTask 도구 루프가 claude CLI 타임아웃 초과로 blocked")를 계측으로 원인 격리 후 해소. 핵심 기획(임원이 세컨브레인을 학습하며 도구를 자율 호출)이 라이브에서 실제로 굴러가는 것을 end-to-end로 확인.

**원인 2가지 (계측으로 격리):**
1. **claude CLI MCP 콜드스타트**: `claude -p`를 매 라운드 spawn할 때 host 프로젝트의 MCP 서버(claude.ai Supabase/Google 등)를 매번 로드 → 라운드당 ~8.8s + OAuth 로그인 팝업(Dia 브라우저 반복 로그인 현상의 정체). 측정: MCP off 시 8.8s → 4.2s.
2. **약한 모델의 도구 회피**: haiku가 도구 5개를 줘도 tool_call을 건너뛰고 첫 턴에 4469자 산출물을 한 번에 생성(65s) → "한 라운드가 비정상적으로 길다"의 실체. 세컨브레인 학습·영상생성기 사용이 실질적으로 안 일어남.

**수정 (3파일):**
- `packages/l5-core/src/llm/claude-cli-client.ts`: spawn args에 `--strict-mcp-config --mcp-config <빈 MCP json>` 추가. 모듈 로드 시 `{"mcpServers":{}}`를 tmpdir에 1회 기록 후 재사용. 임원 도구는 우리 텍스트 프로토콜이라 claude CLI MCP는 dead weight → 기능 손실 없이 라운드당 ~4.5s 절감 + OAuth 팝업 제거.
- `packages/l5-core/src/functions/executive-runtime/tool-loop.ts`: ① 라운드별 계측 로그(`L5_TOOL_LOOP_DEBUG=1` → stderr: 라운드 소요/도구 실행시간/raw head) ② **첫 라운드 도구 강제 유도**(`forceToolFirst`) — iteration 0 & tools>0이면 "산출물 전에 반드시 tool_call로 정보 수집" 지시. 산출물을 버리지 않아 추가 비용 0.
- `claude-cli-client.test.ts`: args 검증을 앞 5개 + `--strict-mcp-config` 포함으로 갱신.

**라이브 검증 (end-to-end, curl only, 브라우저 미사용):**
- submitInstruction(CMO 마케팅 지시) → CEO해석 ~28-37s → CMO task 생성 정상.
- executeTask (도구 루프, `L5_EXECUTIVE_TOOLS=1`): **iter#0 9.4s에 `secondbrain.read` tool_call** → 세컨브레인 venv spawn **2.8s ok=true**(실연결) → iter#1 산출물 → CEO approve → **status=done, required_tools=["secondbrain.read"], executeTask 138s (300s timeout 이내, 블로커 해소).**
- 비교: 수정 전엔 도구 0회 호출 + 산출물 직행(iter#0 65s); 강제 유도 후 도구 라운드가 9.4s로 정상화.
- 회귀: tool-loop+m1-m5 단위 21/21 pass, claude-cli 7/7 pass, l5-core build clean.
- 세컨브레인 HEAD 무변동(read-only 확증). NocoBase 재기동(bootout/bootstrap) 정상.

**남은 follow-up**:
- **도구 루프 상시화 경로 미결정**: executeTask 도구 루프는 138s 소요 → 동기 HTTP action 기본값은 여전히 OFF(`L5_EXECUTIVE_TOOLS` 미설정 시 단발+recall). 상시 켜려면 **비동기 dispatcher/큐 경로**로 빼야 함(동기 HTTP UX엔 부담). 현재 라이브 루프는 env 옵트인.
- **영상생성기 도구 미사용**: 이번 라이브에서 CMO가 `secondbrain.read`만 호출, `video_factory.configure/generate`는 미호출 — 영상 제작까지 가려면 프롬프트 유도 추가 보강 필요.
- iter#1 산출물 생성 92s(긴 출력) — 본질적, 필요시 AgentOutput 스키마 슬림화로 단축 여지.
- 수정 3파일 + 직전 M1~M5 신규 파일들 **uncommitted**(커밋 사용자 지시 대기).

---

## 2026-06-02 — M1~M5: 임원 도구 플랫폼 + 세컨 브레인 양방향 인사이트 (서브에이전트 파이프라인, 라이브 검증)

**배경**: 창업자 지시("CMO에 영상 생성기 도구 연결 + 세컨브레인 학습 + 함께 정해 발전")가 실제로 작동하도록, 임원이 도구를 쥐고·지식을 양방향으로 주고받고·창업자와 협의하는 플랫폼을 구축. 기획서 `reports/secondbrain-tool-platform-plan.html`, 슬라이스 `docs/TASKS.md`의 "2026-06-02" 섹션. 5개 마일스톤을 의존순(M1→M5) 서브에이전트 파이프라인으로 구현.

- **M1 — 임원 공용 도구 런타임**: `executive-runtime/tool-loop.ts`(`runExecutiveWithTools`), `tools/registry.ts`(`ToolRegistry`/`createToolRegistry`), `tools/types.ts`(`ExecutiveTool`). LLMClient에 네이티브 tool-calling이 없어 **텍스트 기반 도구 루프**(프롬프트로 도구목록 제공→AI가 `{"tool_call":{name,args}}`→실행 결과 주입→반복, maxIter 기본 6). `required_tools` 드디어 소비. 도구 0개면 기존 `runExecutive` 폴백. `executive-llm.ts`에서 `buildHandlerResult` 추출. 신규 12 테스트.
- **M2 — 양방향 인사이트 버스**: `memory/insight-bus.ts`(`InsightSource`/`recallInsights`/`formatInsightsForPrompt`). **끊긴 고리 연결** = 임원 실행 직전 `founder_memory`(saved, PII high 제외)를 임원 프롬프트에 주입(기존엔 CEO만). `executeAgentTaskLive(task, llm, {recalledInsights, tools})` 옵셔널 확장(하위호환). plugin에 `makeFounderMemoryInsightSource`. 능동 쓰기는 pending→CEO검토 게이트 유지. 신규 13 테스트.
- **M3 — 세컨 브레인 MCP 게이트웨이(전 임원 공용)**: `memory/secondbrain-source.ts`(`createSecondBrainSource`/`createSecondBrainTools`, transport 주입으로 l5-core 순수 유지), plugin `secondbrain-transport.ts`(`makeSecondBrainTransport`, env→null graceful). read는 7개 임원 공용, write는 founder_memory pending 경유(CEO 게이트). **Pulk 인사이트 적립**: `monitor:saveMemory`로 saved 승격 시 세컨브레인 `append`(PII high 제외). 신규 12 테스트.
- **M4 — 창업자↔임원 협의 채널**: 컬렉션 `executive_consultations`(CREATE IF NOT EXISTS 자동), l5-core `consultation/`(상태머신 open→awaiting_founder→resolved, `formatConsultationForPrompt`), `ask_founder` 도구(전 임원), actions `consultation:list`/`consultation:respond`(→task queued 복귀), UI `ConsultationCard`(chat 우측 패널). resolved 협의는 재실행 시 recalledInsights로 주입돼 임원이 창업자 답 반영. 신규 9 테스트.
- **M5 — 도구 발전 루프 + 영상 생성기 도구**: `memory/video-factory.ts`(`createVideoFactoryTools` — CMO 전용 configure/generate/get_config), plugin `video-factory-transport.ts`(env→null). "발전"은 프롬프트 유도(합의 방식이 recalledInsights에 있으면 configure 후 generate). 전체 흐름 E2E 9 테스트(secondbrain.read→ask_founder→재개→configure+generate, 역할권한 거부, write CEO게이트).

**검증(라이브)**:
- l5-core: 410 passed / 413 (3 실패는 옛 동기 스텁 가정 테스트 `executive-runtime`/`decomposer`/`approval-routing` — baseline 동일·M1~M5 무관). `npm run build` dist 갱신.
- plugin-orchestration·executive-monitor: tsc 0, `node --check dist/plugin.js` 통과(src+dist 미러 패치).
- founder-ui: tsc 0, next build 12 페이지 성공(`/chat` 17.1kB).
- **재기동**: NocoBase kickstart(HEALTH 200, `executive_consultations` 자동 생성, `consultation:list` 인증 시 200 `{ok,data:[]}`). founder-ui kickstart(307).
- **브라우저 E2E (Playwright, :3002 /chat)**: 자동 signIn 후 ConsultationCard "대기 중인 협의 없음" 렌더 + 승인/로드맵 카드 레이아웃 보존, **콘솔 에러 0 / 네트워크 4xx-5xx 0**.
- **브라우저 테스트가 잡은 버그·수정**: `ConsultationCard`가 `consultation:list` 응답을 `res.data`로 unwrap(실제는 `{data:{ok,data:[]}}` 2중 래핑) → `items.map is not a function`으로 chat 페이지 크래시. `res.data?.data ?? []` + 타입 정정으로 해소, 재빌드 후 통과.

**실연결 매핑 완료 (2026-06-02)**: 세컨브레인=`/Users/wonminyang/세컨 브레인`(stdio MCP + `.venv` CLI), 영상생성기=`/Users/wonminyang/ai-slide-video-factory`(Remotion CLI). transport를 HTTP stub → **child_process spawn(로컬)**으로 재작성.
- 세컨브레인 `secondbrain-transport.ts`: read=`.venv/bin/python`으로 `search.tempr.search`(brain=`biz`) spawn, write=`lib.store.add_card`(git 커밋). argv 전달(셸 인젝션 방지). env `SECONDBRAIN_DIR`/`SECONDBRAIN_BRAIN`/`SECONDBRAIN_PY`(기본 실경로, 미존재 시 null=graceful). **라이브 search 스모크 OK**(8카드/4.5KB).
- 영상생성기 `video-factory-transport.ts`: generate=job JSON 작성 + `tsx scripts/validate-job.ts` spawn(**render 제외** — 분 단위라 동기 금지), configure/getConfig=`jobs/_l5-preset.json`. env `VIDEO_FACTORY_DIR`. **validate 스모크 EXIT 0**.
- 임원 claude CLI 타임아웃 60s→**180s**(`ceo-orchestration/anthropic-client.ts`, env `L5_LLM_TIMEOUT_MS`). plugin dist는 `require(.../l5-core/dist/...)`라 l5-core 재빌드로 자동 반영(plugin dist 패치 불필요).

**✅ [해소됨 2026-06-02 — 상단 최신 항목 참조] 라이브 임원 자율 실행 블로커**: chat→CEO해석(✅ ~30s, business_id 추론 + CMO task 생성)까지 정상. 그러나 **CMO `executeTask`(도구 루프) 실행이 claude CLI 타임아웃(60s·180s 모두) 초과**로 blocked. → 원인은 claude CLI MCP 콜드스타트 + haiku 도구 회피였고, MCP off + 첫 라운드 도구 강제로 해소(executeTask 138s done). 진단: ①claude haiku 단발 **9.3s 정상** ②CEO 해석(동일 haiku) 정상 ③세컨브레인 recall 4.5KB로 작음 → 원인은 **M1 tool-loop가 한 claude 라운드를 비정상적으로 길게 만듦**(maxIter 다중 왕복 / 도구 프로토콜 / JSON 재시도 중 하나, 로그 부재로 미격리). **transport 매핑 자체는 스모크로 검증됐고 이 블로커와 무관.** follow-up: tool-loop에 라운드별 계측 로그 추가 → 원인 격리 후 수정(예: maxIterations 축소, 도구 description 슬림화, 또는 임원 실행 비동기/dispatcher 경유). 검증 시드(instruction/interp/task) 삭제, 세컨브레인 HEAD 무변동(read-only 확증), 영상생성기 jobs 잔여 0.

**남은 follow-up**: ① `consultation:respond` 후 자동 재실행 없음(UI 수동 executeTask 또는 dispatcher 픽업) — respond에 자동 트리거 추가 여지. ② 협의 insert 시 task의 business_id 주입하면 ConsultationCard 필터 정밀화. ③ 임원 tool-loop가 secondbrain/video-factory를 적시 호출하도록 임원 프롬프트 보강 여지. ④ 신규 src 파일들·dist 패치 **uncommitted**(커밋 사용자 지시 대기). 참고: [[nocobase-plugin-dist-patching]], [[l5-founder-approval-model]].

---

## 2026-06-02 — M5: 도구 발전 루프 결선 + 영상 생성기 도구 등록 + E2E

**구현 완료.** CMO 전용 영상 생성기 도구 3개 등록 + 도구 발전 루프(합의된 방식 → configure → generate) 결선 + M1–M5 전체 E2E 통합 테스트.

**신규 파일**:
- `packages/l5-core/src/functions/memory/video-factory.ts` — `VideoFactoryTransport` 인터페이스, `createVideoFactoryTools(transport)` (CMO 전용 3도구), `createInMemoryVideoFactoryTransport(seed?)` mock.
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/video-factory-transport.ts` — `makeVideoFactoryTransport()`: env(`VIDEO_FACTORY_URL`, `VIDEO_FACTORY_TOKEN`) 읽어 실 HTTP transport, 없으면 null. 실 매핑 TODO 주석 한 곳.
- `packages/l5-core/src/functions/executive-runtime/__tests__/m1-m5-e2e.test.ts` — 9개 E2E 테스트 전부 통과.

**변경 파일**:
- `packages/l5-core/src/functions/memory/index.ts` — `VideoFactoryTransport`, `createVideoFactoryTools`, `createInMemoryVideoFactoryTransport` 재수출 추가.
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts` + `dist/plugin.js`:
  - `createVideoFactoryTools` require 추가.
  - `makeVideoFactoryTransport()` / `_videoFactoryTransport` 모듈 레벨 초기화.
  - `executeTask` 내 video-factory tools sbTools 배열 주입 (null graceful).

**도구 발전 루프 결선 방식**: 프롬프트 유도(코드 배선 없음). `video_factory.configure` description에 "recalledInsights에 합의된 방식이 있으면 generate 전에 먼저 이 도구를 호출하라" 지시 포함. M4 협의 결과는 이미 recalledInsights로 주입되므로 CMO LLM이 올바른 순서(configure → generate)를 따름. generate description에는 결과 인사이트를 secondbrain.write로 순환 적립하도록 유도 포함.

**검증 결과**:
- `l5-core tsc --noEmit` 0에러, `npm run build` clean
- 신규 E2E 9/9 pass, 전체 410/413 pass (3건 pre-existing 무관)
- `plugin-orchestration tsc --noEmit` 0에러, `node --check dist/plugin.js` clean

**남은 실연결 TODO 지점**: 아래 "실연결 TODO" 섹션 참조.

---

## 2026-06-02 — M4: 창업자 ↔ 임원 협의 채널

**구현 완료.** 임원이 산출물을 내기 전에 창업자에게 질문/선택을 올리고, 창업자가 답하면 태스크가 재개되는 비동기 협의 레코드 + 재개 모델.

**신규 파일**:
- `packages/l5-core/src/functions/consultation/index.ts` — 순수 상태머신. `ConsultationStatus`, `ConsultationRecord`, `ConsultationRequest`, `openConsultation`, `resolveConsultation`, `formatConsultationForPrompt`.
- `packages/l5-core/src/functions/consultation/tool.ts` — `createAskFounderTool(opts)` 팩토리. `propose` 콜백 주입형.
- `packages/l5-core/src/functions/consultation/__tests__/consultation.test.ts` — 9개 테스트 전부 통과.
- `apps/founder-ui/src/components/ConsultationCard.tsx` — 30초 폴링 + 선택지 버튼/자유입력 textarea + 낙관적 제거. Joinery paper-surface + 4px green accent.

**변경 파일**:
- `packages/l5-core/src/index.ts` — consultation + createAskFounderTool 재수출.
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts` + `dist/plugin.js`:
  - `executive_consultations` 컬렉션 등록 + CREATE TABLE IF NOT EXISTS DDL.
  - `executeTask` 내 ask_founder 도구 조립 + proposeConsultation 콜백 (insert consultation + 태스크 needs_review/awaiting_founder: blocker).
  - resolved consultation을 recalledInsights에 주입하는 재개 결선.
  - consultationOpened 조기 종료 분기.
  - `consultation:list` / `consultation:respond` 액션 + ACL loggedIn.
- `apps/founder-ui/src/app/chat/page.tsx` — 우측 상태 패널에 `ConsultationCard` 추가.

**executive_consultations 필드**: `id`, `task_id`, `business_id`(nullable), `from_agent`(AgentRole), `question`(text), `options`(json nullable), `status`('awaiting_founder'|'resolved'), `founder_response`(nullable), `resolved_at`(nullable), `createdAt`/`updatedAt`(NocoBase 기본 camelCase).

**협의 흐름**:
1. 임원이 tool-loop에서 `ask_founder` 도구 호출 → consultation 레코드 insert(awaiting_founder) + 태스크 needs_review.
2. UI `ConsultationCard`가 30초마다 폴링 → 질문 표시 + 선택지/textarea.
3. 창업자 응답 → `consultation:respond` → resolved + 태스크 queued 복귀.
4. 재실행 시 resolved consultation을 `formatConsultationForPrompt`로 변환 → recalledInsights에 주입 → 임원이 창업자 답변 반영해 산출물 완성.

**검증**: l5-core `npx tsc --noEmit` clean, 9개 신규 테스트 pass, 기존 3건 pre-existing 실패 불변. plugin-orchestration `npx tsc --noEmit` clean. `node --check dist/plugin.js` 통과. founder-ui `npx tsc --noEmit` clean + `npx next build` 12 prerender 성공, 무경고.

**M5가 알아야 할 점**:
- `executive_consultations` 테이블은 CREATE TABLE IF NOT EXISTS로 자동 생성 — 별도 마이그레이션 불필요.
- `consultation:respond`가 태스크를 queued로 되돌리지만 재실행은 수동(UI에서 executeTask 재호출 또는 Hermes dispatcher). M5에서 자동 재실행 트리거 추가 가능.
- ask_founder는 tool-loop 도중 DB를 직접 씀 → 태스크 status가 needs_review로 바뀐 후에도 LLM은 계속 응답을 생성함(tool-loop는 중단되지 않음). consultationOpened 조기 종료 분기가 그 결과를 무시하고 반환. 이 동작이 정상.
- `options` 선택지가 있으면 UI가 버튼으로 렌더링 → 원클릭 응답. 없으면 textarea 자유입력.

---

## 🟢 2026-06-02 (M3) — 세컨 브레인 MCP 게이트웨이

---

## 🟢 2026-06-02 (최신) — M3: 세컨 브레인 MCP 게이트웨이

**구현 완료.** 세컨브레인 = 이미 존재하는 외부 MCP 서버. 우리는 클라이언트 측만 구현.

**신규 파일**:
- `packages/l5-core/src/functions/memory/secondbrain-source.ts` — 순수 transport 주입형. `SecondBrainTransport`, `createSecondBrainSource`, `createSecondBrainTools`, `createInMemorySecondBrainTransport`.
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/secondbrain-transport.ts` — env 기반 실 transport. `SECONDBRAIN_MCP_URL` + `SECONDBRAIN_MCP_TOKEN` 미설정 시 `null` 반환(graceful disable).
- `packages/l5-core/src/functions/memory/__tests__/secondbrain-source.test.ts` — 12개 테스트 통과.

**변경 파일**:
- `l5-core/src/functions/memory/index.ts` — secondbrain-source 재수출.
- `l5-core/src/functions/executive-runtime/index.ts` — `ExecuteAgentTaskLiveOptions`에 `tools?: ExecutiveTool[]` 옵셔널 추가(기존 호환 유지). 옵션 감지 조건에 `'tools' in options` 포함.
- `plugin-orchestration src/server/plugin.ts` + `dist/plugin.js` — executeTask에서 founder_memory + secondbrain 병합 recall + secondbrain 도구 tool-loop 제공.
- `plugin-executive-monitor src/server/plugin.ts` + `dist/plugin.js` — saveMemory `saved` 승격 시 `pushToSecondBrainOnSave` 호출(best-effort, PII high 제외).

**env 설정 키**: `SECONDBRAIN_MCP_URL`, `SECONDBRAIN_MCP_TOKEN`. 미설정 시 전체 graceful — secondbrain 소스/도구 비활성, founder_memory만 동작.

**적립 경로**: CEO가 `monitor:saveMemory` → `approval_status='saved'` DB 업데이트 → `pushToSecondBrainOnSave`(best-effort fetch to `/tools/secondbrain.append`). 임원 능동 쓰기(secondbrain.write 도구)는 반드시 `proposeWrite`(founder_memory pending 적재)를 경유 — CEO 게이트 우회 불가.

**MCP 실 서버 스키마 미상**: transport 양쪽(orchestration + monitor)에 TODO 주석으로 "실 서버 툴명/스키마 확정 시 여기만 수정" 명시. M4가 env 설정 + TODO 지점만 수정하면 연결됨.

**검증**: `npx tsc --noEmit` 양 플러그인 clean. `node --check` 양 dist 통과. l5-core 테스트 395/395(신규 12, 기존 3 pre-existing 실패 불변).

**남은 follow-up**: ① 실 MCP 엔드포인트 연결 후 transport TODO 지점 업데이트(M4). ② secondbrain.write 도구의 제안이 founder_memory pending에 적재되는 것 UI에서 확인. ③ 임원 tool-loop에 secondbrain.read 도구가 제공되지만 LLM이 실제로 쓸지는 프롬프트 품질에 달림.

---

## 🟢 2026-06-01 (최신) — CEO 오케스트레이션 엔진 + 실행 정상화 (라이브)

**문제**: 작업이 항상 검토필요/차단됨에 쌓이고 진행중/완료가 없었음. 원인 = executive 핸들러가 결정론적 스텁(항상 needs_review/blocked)이고, risk-handler가 PII/위험도 키워드만 보고 무조건 차단.

- **risk-handler** (커밋 `ace7ec1`): 위험도/PII 키워드 기반 무조건 차단 제거(`blocked=false`, 승인 게이트 부풀림 제거). l5-core dist 반영.
- **Haiku 실행 + CEO 검토 루프** (커밋 `060d1c4`): 신규 `l5-core/executive-runtime/executive-llm.ts`(`runExecutive` — 임원별 Haiku 실제 산출물) + `ceo-orchestration/review.ts`(`reviewExecutiveOutput` — verdict approve/revise/escalate_founder). `executeAgentTaskLive(task, llm)`가 실행→CEO검토→상태(done/needs_review/blocked) 매핑 + 임원·CEO handoff 2건 영속(인박스에서 과정 보임). Founder 에스컬레이션은 아웃바운드/결제만(위험도 무관, 하드 세이프티넷).
- **plugin-orchestration `executeTask`**: status=running 선기록 → `buildLLMClient` → `await executeAgentTaskLive` → handoff 루프 영속. src + dist/plugin.js 미러 패치(node --check 통과, 백업 보관). NocoBase 재시작(HEALTH 200, DIST_LIVE=1).
- 신규 테스트 11개 통과. 기존 실패 3개(decomposer/executive-runtime/approval-routing)는 스텁 가정이라 **무관**(baseline 동일).
- **로드맵 미리보기** (커밋 `92ab34b`): `/api/roadmap:list`가 `assigned_agent`+`rationale` 반환(src+dist), `RoadmapMiniCard`가 에이전트 칩 표시.

**남은 follow-up**: ① 동기 `executeAgentTask` 스텁 잔존(라이브는 `executeAgentTaskLive`만 사용). ② `executeTask`가 Haiku 2콜이라 지연 증가 — 액션 타임아웃 여유 확인 권장. ③ plugin dist는 수동 패치(정식 `nocobase build` 부재). ④ 임원↔CEO 1라운드만 — 다회 왕복/팀 협업 확장 여지. 참고: [[nocobase-plugin-dist-patching]], [[l5-founder-approval-model]].

---

## 🟢 2026-06-01 — Founder 승인 게이트 재정의 + 채팅 카드 네비게이션

**문제**: Founder 승인 큐에 CTO/CPO/RiskQA 내부 작업(D4 등)이 올라옴. 규칙은 "아웃바운드 메시지 + 결제만 Founder 승인, 나머지는 CEO 자율, 에러는 CTO".

**승인 모델 확정**(memory `l5-founder-approval-model`): ①계획 단위 1회 승인(CEO 제안→Founder go/no-go) ②실행 중 아웃바운드/결제만. 위험도 D1-D5는 내부 신호일 뿐 절대 게이트 아님. 검증실패/clarification은 `needs_review`(CEO 검토)로만. 에이전트는 헷갈리면 추론하지 말고 CEO와 상의.

**코드(라이브)**: `l5-core/ceo-orchestration/decomposer.ts`(elevatedRisk 제거), `interpreter.ts`(승인 트리거=결제/아웃바운드 2개로 한정, 위험도 분리), `executive-runtime/index.ts`(D3-D5 강제 Founder승인 제거, needs_review만/D5 blocked). `plugin-orchestration/src/server/decompose.ts`(requiresApproval=interp.approval_required만) + taskCallback의 `approval_required=true` 7건 제거(src + dist/plugin.js sed 패치, node --check 통과). `plugin-executive-monitor` createTask `["D4","D5"]` → false(src+dist). l5-core 재빌드 + NocoBase 재시작 반영(HEALTH 200).

**DB**: 미완료 `approval_required=true` 4건 → false. 승인 큐 0건(사용자 승인하에 정리).

**프론트(배포 `pulk-founder-ui.vercel.app`)**: `RoadmapMiniCard` 행 + `ApprovalQueueCard` 제목 클릭 → `openInboxTask`로 인박스 상세 이동. `RoadmapItem`엔 agent/risk_level 없음 → taskToRef는 id/title/status만(상세는 task_id 재조회). next build exit 0.

**커밋**: `2951d4e` (origin/feat/nocobase-real-mvp 동기화).

**남은 follow-up**: orchestration dist/plugin.js가 src와 divergent한 오래된 번들 — 정식 `nocobase build` 파이프라인 부재로 dist 직접 패치 중. 에이전트 clarification을 needs_review 표시뿐 아니라 실제 CEO 상의 루프로 강화 필요. 참고: [[nocobase-plugin-dist-patching]].

---

## 🟢 2026-05-31 — 모바일 UX + 격리 + 자가치유

1. **LLM 백엔드 Claude CLI 전환 + 한국어 강제**: CEO interpretation + 7 임원 모두 Claude Haiku(로컬 `claude` CLI). `agent-runtime/src/llm/haiku-llm.ts` `callHaikuJson`에 `KO_OUTPUT_RULE`(한국어 강제) + JSON 실패 1회 자동 재시도. `l5-core/.../interpreter.ts` SYSTEM에도 한국어 규칙 + founder 승인 게이트(결제·외부발송·인원·브랜드공개) 추가.
2. **사업↔프로젝트 격리 버그 수정**: `project:listActive`(plugin-business-portfolio)가 GET에서 `ctx.action.params.values`(빈 {})를 먼저 읽어 query를 무시 → 모든 사업에 전체 프로젝트 노출. `ctx.request.query` 우선으로 수정(src+dist/server/plugin.js). monitor `currentTasks/blockedTasks/approvalQueue`에 `business_id` 스코프 필터(`readBusinessScope`/`withBusinessFilter`, src+dist). 프론트 monitor/approval가 `selectedId` 전달 + "범위 · {사업명}" 표시.
3. **모바일 레이아웃**: 사이드바 드로어 스크롤(`MobileShell` 100dvh+overflow), 로드맵 모바일 세로 타임라인(`RoadmapTimeline` `lg:hidden` 분기), 인박스 발견카드 반응형(`.j-discovery-row`: 모바일 세로 / 데스크탑 가로 스크롤) + 텍스트 clamp/wrap, monitor/review 카드 `overflowWrap`.
4. **에이전트 작업 가시화**: monitor `currentTasks/blockedTasks`에 `decision/reasoning/next_action` 추가(src+dist). monitor TaskCard에 "현재 작업"(next_action) + "판단 근거 보기"(reasoning 펼침) + "⟳ CTO/CEO 자가복구" 배지.
5. **자가치유 풀버전** (`agent-runtime/src/self-heal.ts` 신규): 임원 task 실패 시 `classifyFailure`로 분류 → technical은 `runCTOAgent`, planning/permission은 CEO(callHaikuJson)가 복구 지침 생성 → 원 에이전트(AGENT_MAP) 1회 재시도(단발·무재귀). 결제·외부발송·인원·브랜드는 `requires_founder_approval`로 founder 에스컬레이션. `hermes-runtime/src/tasks/task-dispatcher.ts` catch에서 `healFailedTask` 호출 → 성공 done/needs_review(+decision/reasoning/next_action 영속), 에스컬레이션 needs_review(승인필요), 실패 blocked. updater 타입을 agent-output 필드까지 받도록 확장.

빌드: l5-core/agent-runtime/hermes-runtime/founder-ui 모두 tsc·next build exit 0. NocoBase(pid 64585)·Hermes gateway 재시작(LastExitStatus 0). Vercel prod 배포(`https://pulk-founder-ui.vercel.app`). 자가치유 dist 검증 완료(agent-runtime/dist/self-heal.js + index/task-dispatcher import 확인). NocoBase 플러그인은 dist 직접 패치 적용 — 정식 nocobase build로 추후 동기화 필요. 참고: [[nocobase-plugin-dist-patching]].

**남은 과제**: 로드맵 줌·노드 탭 세부 패널, 자가치유 다회 시도 + 복구 트레일 영속 테이블, 레거시 task(business_id NULL) 백필.

---

## 🎯 2026-05-31 — Founder UI: Joinery 디자인 시스템 전면 재적용

사용자 요청("ui작업 완료해줘") 후속. 이전 세션(2026-05-30 15:45 KST, 세션 `3018d2ae`)에서 git 커밋 폴링 + 화면별 1:1 재현으로 셋업했으나 커밋이 발생하지 않아 미실행이었던 작업을 이번 세션에서 전부 완료.

### 입력 자료
- 디자인 zip: `/Users/wonminyang/Downloads/비즈니스 os.zip` (7.4MB, 2026-05-30 15:41 생성)
- 내부 구조: `redesign/` (tokens-v2.css, colors_and_type.css, primitives.jsx, shell.jsx, screens-today/work.jsx, v2-shell/screens/ui.jsx) + `uploads/pulk_claude_design_input_materials/` (03~08 디자인 브리프)
- 추출 위치: `/tmp/joinery/` (UTF-8 unzip, html/uploads/scratch 제외)

### 디자인 전환 (다크 콘솔 → 라이트 운영 콘솔)
- **배경**: `bg-slate-900` → Joinery paper (`#F4F0E6` canvas / `#FAF7F0` surface / `#FDFBF6` elevated)
- **액센트**: indigo → Joinery green (`#1FA64D` / hover `#178A3F` / press `#126E32` / tint `#E4F4E8`)
- **타이포**: 시스템 폰트 → Source Serif 4 (헤딩) + IBM Plex Sans + SUIT/Pretendard (한국어 본문) + IBM Plex Mono (overline/숫자) — 모두 CDN import
- **위험도/상태**: 발광 indigo → `j-risk-d1~d5` (green-tint → blue-tint → amber-tint → orange → red-tint) + pastel pair 7색(mint/peach/lav/sky/butter/rose/sand) + 4px 좌측 액센트 막대
- **아이콘**: 이모지(`📊🏭🧠🎛🔧🌐💬✅🗂️📁` 등) → 인라인 SVG (Lucide 스타일, stroke 1.6)
- **한국어**: `word-break: keep-all` 적용 (음절 중간 줄바꿈 방지)

### 작업 분배
- **Phase 1 (직접)**: `apps/founder-ui/src/app/globals.css` (Joinery + v2 토큰 임베드 + `j-*` 컴포넌트 클래스 + 폰트 CDN import), `tailwind.config.ts` (paper/ink/silver/green/amber/red/blue/pastel 시멘틱 노출), `app/layout.tsx` (라이트 body), `components/Sidebar.tsx` (Joinery sidebar — 비즈니스/프로젝트 다중계층 + 모달 모두 보존)
- **Designer 워커 5명 병렬 (Agent 도구)**:
  - W1 Chat: `chat/page.tsx` + `ApprovalQueueCard` + `RoadmapMiniCard` + `TodayDiscoveryBanner` (founder 메시지=right paper-elevated, CEO=left paper-surface + 4px green bar, executive dispatch cards, amber-tint approval queue)
  - W2 Monitor+Approval: `monitor/page.tsx` (executive command board, PhaseTransitionPanel, 4px left accent bar) + `approval/page.tsx` (D5→D4→D3 정렬, green-tint empty state)
  - W3 Workflow+Memory: `workflow/page.tsx` (3개 출력 카드 — Brief=mint / PMF=sky / Staffing=butter strip) + `memory/page.tsx` (PII 위험 명시, 저장=primary/폐기=danger)
  - W4 Projects: `projects/page.tsx` (포트폴리오 보드 grid) + `projects/[id]/page.tsx` (PhaseStrip + SectionHead) + `projects/layout.tsx` (라이트 sidebar)
  - W5 CTO+신규: `control-room/page.tsx`, `tool-requests/page.tsx`, `TabLayout.tsx`, **`RoadmapTimeline.tsx` (완전 재작성: 다크 emerald/indigo gradient spine → 단일 green progress bar on silver-2 track, agent 색 → pastel pair 7색, j-pulse keyframe)**, **`AuthGate.tsx` (zip 미수록 → 동일 토큰으로 신규)**, `LoginForm.tsx`

### 검증
- `npx tsc --noEmit` (apps/founder-ui): 에러 0
- `npx next build` (apps/founder-ui): 12개 페이지 prerender 성공, 무경고
- 페이지별 크기: `/chat` 14.6kB / `/monitor` 7.69kB / `/tool-requests` 6.14kB / `/workflow` 6.25kB / `/approval` 5.75kB 등
- 보존 확인: 라우팅, API 호출 (`api.*`), useEffect, state, props 시그니처, `useAuth`/`useBusiness` 사용, 한국어 카피 의미 — 전부 유지

### 영향 파일 (13)
```
apps/founder-ui/src/app/globals.css          [재작성]
apps/founder-ui/tailwind.config.ts           [재작성]
apps/founder-ui/src/app/layout.tsx           [라이트화]
apps/founder-ui/src/components/Sidebar.tsx   [Joinery 재작성]
apps/founder-ui/src/app/chat/page.tsx
apps/founder-ui/src/app/monitor/page.tsx
apps/founder-ui/src/app/approval/page.tsx
apps/founder-ui/src/app/workflow/page.tsx
apps/founder-ui/src/app/memory/page.tsx
apps/founder-ui/src/app/projects/page.tsx
apps/founder-ui/src/app/projects/[id]/page.tsx
apps/founder-ui/src/app/projects/layout.tsx
apps/founder-ui/src/app/control-room/page.tsx
apps/founder-ui/src/app/tool-requests/page.tsx
apps/founder-ui/src/components/ApprovalQueueCard.tsx
apps/founder-ui/src/components/RoadmapMiniCard.tsx
apps/founder-ui/src/components/TodayDiscoveryBanner.tsx
apps/founder-ui/src/components/TabLayout.tsx
apps/founder-ui/src/components/RoadmapTimeline.tsx
apps/founder-ui/src/components/AuthGate.tsx
apps/founder-ui/src/components/LoginForm.tsx
```

### 남은 항목
- 시각 QA: `pnpm --filter @l5/founder-ui dev` 로 브라우저에서 화면별 톤 확인 권장 (특히 CEO 메시지 좌측 4px green bar, BPR PhaseStrip, RoadmapTimeline 가로 줄기)
- Vercel 배포 (다음 작업): NocoBase 백엔드 노출 방식 결정 필요

---

## 🎯 2026-05-30 — CTO/ACR 마무리: Phase 11 P0 검증 + 안티그래비티 hermes 정리 + phase verdict + Release Gate 일원화

사용자 요청으로 CTO/ACR 관련 작업 상태를 점검하고 잔여를 마무리했다. **아직 전부 uncommitted — 사용자 지시: "일원화까지 마무리 후 커밋".**

### Phase 11 P0 — 검증 결과 (문서 체크박스만 방치였음)
- **acr_token 자동발급**: `plugin-orchestration/plugin.ts:1040` 실재(D3+ → randomUUID + 콜백 동봉). 설계 변경(원안 workbench/approval 직접호출 → 내부 토큰 발급)으로 구현 완료. TASKS.md 600행 `[ ]→[x]` 갱신.
- **project 자동등록**: `cto.ts:265 bootstrapProjectIfMissing` + `/api/projects` 실재. TASKS.md 608행 `[x]` 갱신.

### 안티그래비티 hermes 미완성 작업 마무리 (토큰 소진으로 중단했던 것)
- **task-archiver**(신규): 코드+배선(gateway/runner/index)+plist+install-launchd 완비했으나 **테스트 없었음** → `__tests__/task-archiver.test.ts` 5케이스 추가(7일 경과 done/killed만, 최근 제외, 비-종료 status 제외, updated_at 없으면 created_at, archive 실패 시 delete 안 함). 5/5 PASS.
- **model-verify 결함**: 안티그래비티가 `/gpt-4o/`를 deprecated 패턴에 추가 → MODEL_ROSTER의 현역 T2(gpt-4o)를 **자기 자신으로 remap**하는 모순. 사용자 확인("gpt-4o가 맞다") 후 패턴 제거. hermes jest 81/81 유지.

### CTO phase 검토 — verdict 반영 (경량)
- `plugin.ts` `phase_complete` 분기: 기존엔 verifier verdict를 계산만 하고 버림(all_done만 반영). 이제 fail/inconclusive → `needs_review`+`verifier:fail retry=...`로 올려 `cto-verification-loop`가 재시도 픽업. pass면 진행 메모만. ACR auto-drain은 유지. plugin-orchestration tsc clean.

### Release Gate L5 일원화 (ACR repo 교차) — 핵심
- **갭의 본질**: dispatcher는 `approval_required=false`(=L5 승인됨)만 ACR로 보내는데, ACR auto-dispatcher가 `manual_founder`(D4-D5)를 **다시** 막아 승인된 D4-D5가 영영 실행 안 됨. dispatch route도 `auto_execute`(D1-D2)만 auto-dispatch 스케줄.
- **해결(단일 승인원)**: `ACRIntent.l5_approved` 신설. L5(`l5-core/types/acr-intent.ts`, `agent-runtime/cto.ts` 2곳) → ACR(`cto-task-metadata-store`, `workbench/dispatch` route: metadata 저장+트리거 조건 확장, `auto-dispatcher`: auto_execute=false 차단 우회 + manual_founder 게이트 통과, `workbench/approval`: Release Gate 스킵). **`auto_24h`(D3)는 미적용**(시간 정책).
- **검증**: ACR `auto-dispatcher.test.ts` 신규 대칭 케이스 통과(전체 722 passed, 1 fail은 무관한 사전존재 `qa-fixes-phase11` missing-doc). L5 `cto.test.ts` `l5_approved` assert(5/5). l5-core 빌드/agent-runtime·ACR tsc 전부 clean.
- **주의**: 로컬에서 agent-runtime은 jest/ts-jest 미설치라 hermes의 jest 바이너리로 실행함(`../hermes-runtime/node_modules/.bin/jest cto`). l5-core 타입 변경 후 **dist 재빌드 필요**(테스트가 `@l5/core`를 dist로 매핑).

### 남은 항목
- **커밋**: 이번 세션분만(검증·수정 + 안티그래비티 hermes + phase verdict + 일원화). `.next`(104)·`storage`(16) 빌드/런타임 산출물은 제외. founder-ui 등 타 세션 대규모 변경은 커밋 안 함.
- **라이브 E2E 미실행**: 단위/통합 테스트로 검증. NocoBase+ACR 기동 후 D4 태스크 승인→자동실행 한 사이클은 후속.
- Release Gate in-memory→file 영속화, ACR panel UI 제거는 범위 외(미사용이라 무해).

---

## 🎯 2026-05-30 — QA 세션 이어받기 (안티그래비티 중단 작업 복구 + E2E 라이브 검증)

이전 세션(안티그래비티)이 QA/E2E 진행 중 토큰 소진으로 중단(10:38 KST). 남긴 QA 로드맵은 `reports/qa-status-visualization.html`(6개 E2E 시나리오 대시보드)이고, `scripts/smoke-autopilot-e2e.ts`(자동 E2E smoke)를 작성하다 멈췄다. 이어받아 회귀·라이브 검증을 완주했다.

### 안티그래비티 변경 검토 (모두 QA 중 발견한 실제 버그 수정 — 유지)
- `plugin-executive-monitor/hermes-scheduler.ts`: cron job 중복 등록 방지 + `stopHermesScheduler()` cleanup(`beforeStop`/`afterDisable` 훅). 플러그인 reload 시 cron 중복 버그 해소.
- `plugin-executive-monitor`·`plugin-orchestration` `client/index.ts`: placeholder export → 실제 NocoBase `Plugin` 클래스.
- `workflow-factory/__tests__/generator-llm.test.ts`: `generated_at` 타임스탬프 flaky 비교 정규화.

### 발견·수정한 안전 문제 (smoke 스크립트)
- **라이브 repo 보호 위반**: `smoke-autopilot-e2e.ts`가 `sandboxPath='/Users/wonminyang/Desktop/pulk'`(보호 경로 `L5_PROTECTED_PATHS`)를 직접 대상으로 삼고 있었다. → 기본값을 `L5_DEFAULT_PROJECT_PATH`(영구 샌드박스)로 바꾸고, pulk를 가리키면 throw하는 가드 추가.
- **폴링 견고성(안티그래비티가 멈춘 지점)**: 폴링 fetch에 retry가 없어 dispatcher 직후 NocoBase 과부하 시 `ECONNRESET`에 바로 throw. → fetch를 try/catch로 감싸 일시 오류 시 재시도. 성공 기준도 `파일 생성 AND done` → `done|needs_review`로 완화(멀티-phase 플랜의 첫 phase가 read-only "오픈소스 조사"일 수 있어 파일 생성 단정 불가).

### 라이브 검증 결과
- **유닛 회귀**: `@l5/core` 347/347 PASS, `@l5/hermes-runtime` 81/81 PASS.
- **E2E smoke 라이브(샌드박스)**: `chat:submitInstruction` → CEO 3-workstream 분해(CTO/COO/CPO) → dispatcher가 ACR로 dispatch → claude CLI spawn(45.9s) → acr 브랜치 생성+커밋 → task **done**. 재실행에서 ECONNRESET retry가 1회 발동 후 정상 조회됨(견고화 입증). 첫 phase blocker=`risk_reassess: D2->D2. phase=오픈소스 조사`로 read-only phase 확인.
- **게이팅 정상**: 검증 중 생성된 D3/D5 task는 `approval_required=true`로 dispatcher가 픽업 안 함(자동 실행 차단 정상).
- **잔여 정리**: 샌드박스 오늘 acr 브랜치 3건 삭제(main clean), NocoBase 검증 task 5건 destroy. 남은 queued 5건은 안티그래비티 세션의 D3/D5 승인 대기 task(dispatcher 무관)로 보존.

### 남은 항목
- 안티그래비티 코드 변경 5파일 + smoke 스크립트는 아직 **uncommitted**(커밋은 사용자 지시 대기).
- queued 5건(00:33~01:38 생성, PMF/CRO/CMO D3-D5)은 실제 도메인 task인지 QA 잔여인지 사용자 판단 필요 — approval-gated라 무해하게 대기 중.

---

## 🎯 2026-05-30 — 로드맵 Phase 5: 배움 루프 (수집→검토→저장→참고 닫힘, 배포·라이브 검증 완료)

PRD 핵심("결과를 학습해 다음 실행을 개선")의 마지막 고리. 밑단 순수 로직(`collectInsights`/`memorySection`/`founder_memory`)은 이미 있었고 **끊긴 배선 3곳을 이었다**. Formbricks·PMF 자동수집·자동화 후보 등록은 CLAUDE.md(상업 플러그인 금지·PMF 신호 전 도구 금지) 따라 범위 제외.

### 끊긴 고리 → 수정
- **쌓기(collection)**: orchestration `agent:executeTask`(`plugin.ts`)에서 `executeAgentTask` 직후 신규 `persistTaskInsight()` 호출 → `collectInsights`로 인사이트 추출 → `founder_memory`에 `approval_status='pending'` 자동 저장. `source_task_id` 기준 **멱등(dedup)**, best-effort(실패해도 응답 비차단).
- **참고(recall)**: 같은 플러그인 interpret 액션에서 신규 `loadFounderMemories()` → `approval_status='saved'` 메모리(고PII 제외, 최대 20) 로드 → 이미 지원되던 `interpretFounderInstruction({memories})` 파라미터로 주입. 과거 교훈이 새 기획 해석에 반영.
- **데이터 품질(근본)**: `services/hermes-runtime/.../self-learning.ts`가 changelog 원문 HTML을 `content_preview`로 저장하던 버그 → 신규 l5-core 순수함수 `extractReadableText()`(script/style/head 블록 제거·태그/엔티티 정제·40자 미만/JS 셸이면 빈값) 적용. 추출 불가 시 항목 스킵(fingerprint는 전진해 재알림 없음). 오염된 discovery 스토어 항목 1건 정리.

### 발견·동반 수정 (camelCase 타임스탬프 버그)
- `founder_memory`는 NocoBase 기본 **`createdAt`(camelCase)**만 가짐. 그런데 기존 `monitor:memoryCandidates` 정렬이 `-created_at`(존재X) → 쿼리 throw → catch로 **항상 빈 배열** = 창업자가 pending 후보를 영영 못 봄(검토 화면 무력). `updateMemoryStatus`도 없는 `updated_at` write. 둘 다 `createdAt`/자동 updatedAt으로 수정(배움 루프 검토→저장 절반 복구).
- 내 recall 쿼리도 같은 버그였어 `-createdAt`로 정정.

### 라이브 검증 (admin 토큰 + psql, 시드 후 청소)
- **쌓기**: CMO 태스크 `executeTask` → `founder_memory`에 `pending|none|"CMO must validate…"|CMO` 생성 ✅. 재호출에도 1행(멱등) ✅.
- **검토**: `monitor:memoryCandidates` count 1, `created_at` 채워짐 ✅. **저장**: `monitor:saveMemory` pending→saved ✅.
- **참고**: `chat:submitInstruction` 200, recall-failed 경고 delta 0(쿼리 정상) ✅.
- self-learning 8/8, content-extract 8/8, l5-core 347/347, hermes/플러그인 빌드 exit 0. NocoBase 재배포 후 health 200·클린 로드.
- 검증 시드(instruction/task/memory)는 전량 삭제(잔여 0).

### 영향 파일
- l5-core: `src/functions/content-extract/index.ts`(신규 + 테스트), `src/index.ts`(export).
- hermes: `src/tasks/self-learning.ts`(extractReadableText 적용).
- orchestration: `src/server/plugin.ts`(`persistTaskInsight`/`loadFounderMemories` + executeTask/interpret 배선).
- executive-monitor: `src/server/plugin.ts`(memoryCandidates/updateMemoryStatus camelCase 정정).
- 데이터: `services/hermes-runtime/.omc/state/todays-discovery.json` 정리.

---

## 🎯 2026-05-30 — 로드맵 Phase 3·4: 사업↔작업장 연결 + Founder 콘솔 (배포·검증 완료)

서브에이전트 팀 병렬(Agent A=Phase3 백엔드, Agent B=Phase4 UI) + 안전 항목(3c)은 직접 처리.

### Phase 3 — 모든 사업 ↔ 실제 작업장(repo) 연결
- **3a/3b (L5, `plugin-business-portfolio`)**: 신규 `src/server/workspace-init.ts` — `getRepoPath(id)`=`<L5_WORKSPACE_ROOT|~/l5-workspace>/business-{id}`, `ensureWorkspaceRepo()`(멱등 git-init + `--allow-empty` 초기 커밋, 절대경로·workspaceRoot 직속 자식·`business-\d+`만 허용, 비어있지 않은 non-git 디렉토리 보존). `plugin.ts`: businesses `afterCreate` 훅(repo_path 자동 지정+git-init, 생성 차단 안 함), `acrRegister`가 클라 대신 **DB의 repo_path 조회**해 ACR에 전달, `afterStart` **백필**(repo_path 빈 활성 business에 워크스페이스 생성, 멱등).
- **3c (ACR, 직접)**: `app/api/projects/route.ts` `isDangerousPath`에 **live repo 보호**(`L5_PROTECTED_PATHS` env, 기본 `/Users/wonminyang/Desktop/pulk` + 하위 경로 차단). `data/projects.json`에서 **pulk를 가리키던 stale 등록 4건 제거**(`l5-phase15-*`×3 + `business-2`), 백업 `projects.json.bak-*` 보존.
- **라이브 검증**: NocoBase 재부팅 시 백필 실행 → **business-2가 `~/l5-workspace/business-2`로 git-init**(HEAD 9b7d9de)되고 DB `repo_path` 설정 확인. `businesses:list`: id=1→business-1, id=2→business-2 (둘 다 repo_path 채워짐). ACR projects.json pulk-pointing 0건.

### Phase 4 — Founder 콘솔 (한 화면 보고·승인)
- **`apps/founder-ui`**: 신규 `src/components/ApprovalQueueCard.tsx`(D3+ 승인대기 top4, agent/risk 배지 + 승인/거절, 30s 폴링 + 낙관적 제거, 빈 경우 "승인 대기 없음"). `src/app/chat/page.tsx` ChatTab을 **2단 레이아웃**(`flex-col lg:flex-row`)으로: 좌=채팅+입력, 우=상태 패널(RoadmapMiniCard + ApprovalQueueCard + TodayDiscoveryBanner, 모두 `useBusiness()`의 businessId 주입). 좁은 화면은 세로 스택, 기존 roadmap/inbox 탭 유지. 백엔드 신규 0(기존 api 재사용).
- **제약**: `TaskItem`에 `business_id` 없어 ApprovalQueueCard는 현재 전사 승인대기 표시(prop은 배선됨, 백엔드가 노출하면 필터 조임).

### 배포·검증
- 빌드 all exit 0: `plugin-business-portfolio`(nocobase build), `founder-ui`(next build), ACR(next build). tsc all clean.
- 재시작: `com.l5.founder-ui`(307), `com.l5.acr-web`(200), `com.l5.nocobase`(200) 전부 health OK.
- **브라우저 QA 완료 (Playwright, 1440 + 390)**: 2단 레이아웃(좌 채팅 / 우 패널) 정상, 로드맵 미리보기(공통 50건→QA Fixed 22건 business 스코핑), ApprovalQueueCard "승인 대기 없음" 빈 상태, 좁은 화면 세로 스택, **콘솔 에러 0 / 네트워크 4xx-5xx 0**.
- **QA 발견·수정**: `TodayDiscoveryBanner`가 discovery `summary`의 **원시 HTML 문서**를 그대로 렌더(self-learning이 changelog fetch 시 Anthropic 릴리스노트 페이지 HTML을 텍스트 추출 없이 저장 — id `2026-05-29:anthropic-release-notes`). 수정: `cleanSummary()` 가드 추가(HTML 문서면 항목 드롭, 인라인 태그/불완전 꼬리태그 제거 `/<[^>]*>?/g`, 엔티티 디코드, 200자 truncate). 재빌드·재배포 후 배너가 쓰레기 항목을 드롭하고 graceful 숨김 확인.
- **남은 데이터 근본원인(Phase 5/6)**: self-learning(`services/hermes-runtime/.../self-learning.ts`)이 changelog HTML에서 변경요약 텍스트를 추출하지 않고 원문 HTML을 `summary`로 저장함 — 배움 루프 단계에서 추출 로직 보강 필요. discovery 스토어의 기존 HTML 항목도 정리 대상.

---

## 🎯 2026-05-30 — 로드맵 Phase 1·2: 산출물 확실성 + 검토·병합 (ACR repo)

CTO 로드맵(`/tmp/l5-roadmap.html`) Phase 1·2 구현. 전부 **ACR repo**(`~/Desktop/양원민 개발자/agent_control_room_docs`).

### Phase 1 — "빈 브랜치" 해결 (타임아웃·재시도·산출물 검증)
- **타임아웃**: `lib/runner/spawn-runner.ts` `spawnAgent`에 wall-clock 타임아웃 추가(`ACR_AGENT_TIMEOUT_MS`, 기본 15분). 만료 시 SIGTERM→5s후 SIGKILL, exit 124. `finish()` once-guard로 close/error/timeout 경쟁 방지.
- **재시도 + 산출물 검증**: 신규 `lib/runner/spawn-with-verification.ts` `runAgentWithVerification()` — exit 0이지만 git 변경 0이고 변경 예상(`promptExpectsFileChanges`) phase면 프롬프트에 `[RETRY]` 보강 지시 붙여 재시도(`ACR_MAX_ATTEMPTS`, 기본 2회). 소진 후에도 비면 `emptyOutput=true`. read-only(조사/설계) phase는 빈 산출물을 정상 처리.
- **runner 통합**: `app/api/runner/route.ts` — 기존 spawn Promise를 `runAgentWithVerification` await로 교체(inner Promise 제거). `emptyOutput`이면 planTask=`needs_review`, exec log=`review_blocked`, L5 콜백 `status=empty_output`(거짓 "completed" 대신). 커밋·병합 스킵.

### Phase 2 — 검토·병합 (acr 브랜치 → main)
- **git 유틸**: `lib/runner/git-utils.ts`에 `getRemoteUrl`/`resolveBaseBranch`(main→master)/`mergeBranchLocally`(--no-ff, 충돌 시 abort+conflict 반환) 추가.
- **병합 코디네이터**: 신규 `lib/runner/merge-coordinator.ts` `coordinateMerge()` — 정책: 기본 ON(`ACR_AUTO_MERGE=0`이면 비활성). 원격+gh → **PR만 생성**(병합은 CTO 결정), 원격 없으면 **로컬 `git merge --no-ff`**. **D3+는 로컬 자동병합 금지**(원격 있으면 PR, 없으면 skip→founder 승인). 충돌→`conflict`.
- **runner 통합**: `route.ts`에서 `allDone && 깨끗한 성공`일 때 `coordinateMerge` 호출(CTO metadata에서 risk_level 조회). diff_summary는 병합 전(acr 브랜치)에서 계산. L5 콜백에 `merge_action/merge_target/pr_url`, 충돌 시 `status=merge_conflict`.
- **L5 콜백**(`plugin-orchestration/.../plugin.ts`): `empty_output`/`merge_conflict` 상태 분기 추가(둘 다 `needs_review`+`approval_required`). `all_done` 성공 시 blocker에 `merge=...` 기록.

### 검증
- ACR `npx tsc --noEmit` 0 errors. `npx jest` **721 passed**(신규 spawn-verification 10 + merge-coordinator 9 포함), 1 fail은 사전 존재 `qa-fixes-phase11` missing-doc(무관), 7 skipped.
- L5 plugin 변경 라인 타입 에러 없음(standalone tsc의 `ctx.get` 위양성만, 프로덕션 빌드 정상).
- **code-reviewer 교차검토 반영**: (1) `diff_summary`를 commit 후 계산(현재 phase 변경 포함), (2) 에이전트 자기-커밋 감지(`getHeadRef` HEAD 전진 → 빈 산출물 오탐 방지), (3) antigravity도 `ACR_AGENT_TIMEOUT_MS` 적용, (4) `gh pr create` 비-URL 출력 시 null(가짜 PR 보고 방지), (5) 충돌 감지 `git ls-files -u`로 강화 + `rev-parse` execFileSync로 안전화.

### ✅ 라이브 배포 + E2E 검증 완료 (2026-05-30)
- **ACR 재배포**: `npm run build`(exit 0) → `launchctl kickstart -k com.l5.acr-web`(PID 32214, http 200). `ACR_AUTO_MERGE` 미설정=기본 ON(병합 활성).
- **NocoBase 재배포**: `nocobase build @l5/plugin-orchestration`. 빌드 declaration 단계가 **기존** `ctx.get`(line 552, Koa 런타임엔 있으나 ActionContext 타입엔 없음)에서 막혀, `(ctx as any).get(...)` 캐스트로 해소(런타임 무변경) → clean exit 0 → `launchctl kickstart -k com.l5.nocobase`(PID 33646, http 200).
- **라이브 E2E (business-1 sandbox)**: main 리셋 후 D1 phase `POST /api/workbench/dispatch`(auto_execute) → claude spawn → `VERIFY_PHASE12.md` 작성 → **Phase 1** 산출물 검증·커밋(`c88c60e ACR phase: ...`) → **Phase 2** `--no-ff` 병합(`cc1725b ACR merge: ...`) → main HEAD `4c59af0→cc1725b`, 파일 main 반영, HEAD main 복귀. exec log status=done/exit 0. **빈 브랜치 아님 + main 병합 모두 실증.**
- 잔여: business-1 main에 검증 파일 `VERIFY_PHASE12.md` 1건 남음(sandbox라 무해, 필요 시 제거). empty_output/merge_conflict 경로는 유닛테스트로 커버(라이브 미발생).

---

## 🎯 2026-05-30 (오후) — launchd Production 전환 + 무인 자율 루프 ON

### 현재 운영 상태 (모두 launchd 관리, 부팅 자동시작 + 크래시 자동재시작)

| 서비스 | Label | 포트 | 모드 |
|---|---|---|---|
| NocoBase | `com.l5.nocobase` | 13000 | `nocobase start --launch-mode node` (pm2 제거) |
| ACR web | `com.l5.acr-web` | 3001 | **production** `next start` |
| Founder UI | `com.l5.founder-ui` | 3002 | **production** `next start` |
| Resilience 데몬 | `com.l5.acr-resilience` | — | KeepAlive, 30s tick |
| Task Dispatcher | `com.l5.hermes.task-dispatcher` | — | 60s, 무인 L5→ACR 트리거 |

- plist 위치: `~/Library/LaunchAgents/com.l5.*.plist`. 모두 `node` 직접 호출(bash 래퍼는 TCC로 Desktop 접근 거부됨). 래퍼 없음.
- **무인 인증**: NocoBase `api-keys` 플러그인 활성화 + `root` 비만료 API Key(exp≈2126) → task-dispatcher plist `NOCOBASE_TOKEN`. (재발급: `auth:signIn` admin@nocobase.com/admin123 → `apiKeys:create {role:{name:'root'},expiresIn:'36500d'}`.)
- **무인 dispatch cwd**: `L5_DEFAULT_PROJECT_PATH=/Users/wonminyang/l5-workspace/default-sandbox`(영구 git repo). live `pulk` repo 보호.
- **자율 루프 게이팅 (E2E 검증됨)**: D1/D2 → 자동 dispatch, D3+ → `approval_required=true`로 dispatcher가 픽업 안 함(승인 시 자동 실행). `chat:submitInstruction` → CEO해석 → CTO분해 → ACR spawn → 샌드박스 파일생성+커밋 → 콜백 → done 전체 동작 확인.
- **완료(2026-05-30 추가 작업)**:
  - **Stale 큐 정리**: 이전 세션 테스트 task 42건 전부 `killed` 처리 → queued 0건(깨끗한 베이스라인).
  - **Cron 2개 설치·검증**: `com.l5.hermes.model-verify`(08:55) + `com.l5.hermes.self-learning`(09:00). 둘 다 수동 1회 실행 정상(model-verify: roster clean·알림 silent; self-learning: claude changelog 1건 변경·카탈로그 `docs/cto-tool-catalog.md` 갱신·Telegram 발송). plist에 Telegram 토큰+API Key 주입. (codex 403/antigravity 404 changelog fetch는 non-fatal.)
  - **business_id→repo 매핑**: `businesses.repo_path`(text) 컬럼 추가(plugin-business-portfolio: collection 필드 + `ensureBusinessColumns` ALTER). dispatcher(`runTaskDispatcherLive`)가 `fetchBusinessRepoPaths`로 business_id→repo_path 조회 후 task.project_path 주입 → runCTOAgent `resolveProjectPath`가 cwd로 사용. repo_path 없으면 `L5_DEFAULT_PROJECT_PATH`(샌드박스) fallback. **E2E 검증**: business 1 repo_path=`~/l5-workspace/business-1` 설정 → "QA Fixed business" 지시 → CEO가 business_id=1 추론 → D2 task 자동 dispatch → **ACR 작업이 business-1 repo에 라우팅됨**(default-sandbox 아님). (단 해당 spawn은 빈 브랜치만 생성·파일 미커밋 — agent 실행 비결정성, 매핑과 별개. 이전 SMOKE 테스트에선 파일 생성 정상.)
- **다음 작업**: business 2 및 향후 사업의 `repo_path`를 실제 repo로 지정(현재 business 1만 설정). project-status-sync cron(템플릿 존재, 미설치). dispatcher PATH에 claude 추가 시 CTO dev-workflow LLM 보강 활성화(현재 deterministic fallback). ACR `data/projects.json`의 pulk 가리키는 stale 등록 정리(샌드박스 기본값으로 무력화돼 있으나 청소 권장).

상세: `docs/DECISIONS.md` 2026-05-30 항목.

---

## 🎯 2026-05-30 — ACR 데몬 설치 + 멀티-phase 무인 검증 + 장기 무인 운영 전환

### 완료 요약

**콜백 인증 영속화 (장기 무인의 전제)**
- 문제: ACR→L5 `agent:taskCallback`이 만료형 JWT(`L5_ADMIN_TOKEN`, ~17h)로 인증 → 장기 무인 시 만료되면 콜백 401로 사이클 미완.
- 해결: `taskCallback` ACL을 `loggedIn`→`public`으로 변경, 핸들러에서 **비만료 shared-secret**(`process.env.L5_SHARED_SECRET`, NocoBase `.env`에 설정) 헤더(`x-l5-shared-secret`) 검증. ACR runner(app/api/runner/route.ts)와 pre-dispatch 콜백(lib/orchestration/pre-dispatch-checks.ts)이 헤더 전송. 검증: secret 일치→200, 없음/틀림→401.

**멀티-phase 무인 실행 버그 2건 수정**
- **버그 A**: runner가 성공한 phase의 변경을 커밋하지 않아 tree가 dirty → 다음 phase의 checkUncommittedChanges 가드가 abort → 후속 phase 영원히 planned. 수정: `commitAll(cwd, msg)` 추가(lib/runner/git-utils.ts), runner onSuccess 시 phase 변경 커밋.
- **버그 B**: dispatch-time fire-and-forget과 resilience 데몬이 같은 plan 동시 drain → git cwd 충돌. 수정: plan별 in-flight 락(globalThis Set) 추가(lib/orchestration/auto-dispatcher.ts), runAutoDispatchForPlan/drainAllPlans 직렬화.
- 검증: 3-phase D1 플랜이 데몬 단일 틱에 전부 done, STEP1/2/3.txt 생성+3커밋 누적, tree clean, 헛-재dispatch 없음.

**데몬 설치 + 라이브 검증**
- `~/Library/LaunchAgents/com.l5.acr-resilience.plist` 설치 + `launchctl load` 완료. KeepAlive+RunAtLoad(재부팅 생존). 30초 간격 폴링. 전체 사이클 라이브 검증: L5 queued task(D1) → ACR dispatch → 데몬 drain → 실제 claude spawn 3회 → phase별 커밋 → ACR→L5 콜백(shared-secret) → task queued→needs_review.

**장기 무인 운영 베이스라인**
- ACR `data/feature-plans.json`/`cto-task-metadata.json` 리셋 → stale 테스트 plan(실제 pulk cwd 가리키는 eligible task) 제거. 깨끗한 베이스에서 무인 루프 시작.
- 현재 운영: NocoBase:13000, founder-ui:3002, ACR:3001(dev), resilience 데몬 가동 중(idle, allDone=true).
- 위험도 게이트 정책: D1 즉시 / D2 24h 자동 release / D3+ 파운더 수동 승인. model_locked(T1) phase는 토큰 소진 시 다운그레이드 없이 대기.
- **후속 권장**: ACR을 dev(`next dev`) 대신 `next build && next start`로 운영 → 장기 안정성↑. ACR data 주기적 정리.

---

## 🎯 2026-05-29 야간 — ACR 세션: runner 403 조사 + Resilience 루프

### 완료 요약

**runner 403 설계상 정상 동작**: `/api/runner`의 403은 버그가 아니라 approval token 누락, cwd 경로 미등록, git uncommitted 3가지 보안 가드. Phase 15 라이브에서 **git 샌드박스 + D1 auto-exec phase**로 전체 사이클 검증: workbench/dispatch → auto-dispatcher 토큰 발급 → /api/runner 실제 `claude -p` spawn → 파일 생성 + exit 0 → 격리 브랜치 생성 → ACR→L5 콜백(localhost:13000, L5_ADMIN_TOKEN JWT) → L5 task queued→needs_review 전이. **403 없이 완주**.

**Resilience 지속 루프**: 사용자 선택(옵션1 게이트 유지 + 토큰 대기). ACR repo에 구축:
- `lib/orchestration/auto-dispatcher.ts`: `DispatchOutcome`에 `waiting` status + `waitUntil`, D2 auto_24h/D3+ manual_founder 게이팅, `drainAllPlans()` 무한 루프 가능
- `POST /api/orchestration/resilience-tick` (x-l5-shared-secret 인증): drainAllPlans 실행
- `scripts/resilience-loop-daemon.mjs` + `launchd/com.l5.acr-resilience.plist`: KeepAlive 폴링 데몬 (미설치, 수동 install 시 활성)
- 테스트 9개 추가, jest 704 PASS, tsc clean

**Model Locking**: T1 모델은 다운그레이드 금지. l5-core `CTOPhase.model_locked=true` → ACR dispatcher가 respect (폴백 없이 대기). spec/rfc/research/review와 일부 BIG_CHANGE에서 LOCK 적용.
- `packages/l5-core/src/types/acr-intent.ts`: model_locked? 필드
- `services/agent-runtime/src/agents/cto.ts`: selectModelTier==T1 체크 후 설정
- l5-core 339 PASS, agent-runtime tsc clean

### 라이브 운영 상태

- NocoBase:13000, founder-ui:3002, ACR:3001 (dev, .env.local L5_BASE_URL/L5_SHARED_SECRET)
- Resilience 데몬 파일 생성 완료(미설치), shared-secret 기반 콜백으로 장기 운영 준비

---

## 🎯 2026-05-29 야간 — Phase 19 Wave 2 완료 (실행 인프라 강화)

### 완료 요약
**"실행 인프라 강화 — Wave 2"** 모든 구현 완료 및 브라우저 E2E 검증 6/6 PASS. Monitor 재구성, Founder UI 완성, 모델 티어링, 자동 연구, 라이브 검증 누적.

### 완료 상세 (Wave 2 5개 슬라이스)

#### 2.1 Monitor 재구성 (business_id 기준) ✅
- `plugin-executive-monitor` `monitor:projectTimeline` — `source_ref LIKE` → `business_id` 컬럼 필터
- `business_id IS NULL` / `= 'common'` 양쪽 = 회사 공통
- idx_agent_tasks_business_id 멱등 인덱스 추가
- SELECT `blocker` 컬럼 누락 버그 수정
- 검증: tsc 0 errors

#### 2.2 Founder UI 완전 재구성 ✅
- `business-context.tsx` — BusinessProvider + useBusinessContext() hook
- `TabLayout.tsx` — 💬채팅 / 📍로드맵 / 📥인박스
- `RoadmapMiniCard.tsx`, `TodayDiscoveryBanner.tsx` (신규)
- Sidebar "활성 사업" + "🌐 회사 공통" 섹션
- 채팅/로드맵/discovery에 business_id 자동 전달
- next build 12 routes PASS, tsc 0 errors

#### 2.3 CTO 모델 T1/T2/T3 티어링 (순수) ✅
- `model-routing.ts` — MODEL_ROSTER 메타데이터 + selectModelTier + resolveModel(fallback)
- 21개 테스트 PASS (tiering, quota fallback)
- 비밀/키 없음, IO 없음

#### 2.4 Hermes cron 2개 ✅
- `model-verify.ts` (08:55) — deprecated 모델 감지 + 재매핑 제안 (D4)
- `self-learning.ts` (09:00) — changelog → cto-tool-catalog.md + todays-discovery.json + Telegram
- launchd plist 2개 추가
- 81개 hermes 테스트 PASS

#### 2.5 OSS 자동 조사 (순수) ✅
- `oss-research.ts` — filterCandidates (MIT/Apache/BSD + stars>1000 + 6m active) + 비교표 + 결정
- 37개 테스트 PASS (filtering, decision matrix)

### E2E 브라우저 검증 (Playwright, 6/6 PASS)

**발견 & 수정:**
1. rejectPlan 액션 부재 → 핸들러+ACL 추가
2. approvePlan no-op → approval_required:false 전환
3. submitInstruction 응답 business_id stale → instructionOut 수정
4. 사이드바 401 레이스 → useAuth().token 준비 후 fetch
5. 빈 사업명 → fallback: `{name || one_liner || '사업 ${id}'}`
6. self-learning tmpdir 오염 → 경로 주입 격리

**결과:** 콘솔 에러 0, 네트워크 4xx/5xx 0

### 빌드 & 현재 상태

```bash
# 모든 서비스 가동 (재시작 필요)
NocoBase:13000 — rebuild + plugin 재로드
founder-ui:3002 — npm run dev
ACR:3001 — npm run dev (L5_BASE_URL=http://localhost:13000 + L5_ADMIN_TOKEN)

# 검증 현황
l5-core: 281→339 tests PASS (model-routing 21 + oss-research 37)
hermes-runtime: 81 tests PASS (12 suites; 신규 model-verify 8 + self-learning 8)
founder-ui: tsc 0 errors, 12 routes PASS
plugin-executive-monitor: tsc 0 errors
```

### 스코프 분리 (다음 세션)

- **2.3/2.5 모듈** — @l5/core 완성, export됨. 라이브 소비자는 ACR 런타임 인프라(모델 티어링 헤더 캡처, research web-search client) → ACR 세션 범위
- **ACR `/api/runner` 403** — 사이클 완전 완료(status=done)는 ACR 세션 과제

### 다음 우선순위

| 항목 | 상태 | 비고 |
|---|---|---|
| ACR runner 403 | ⚠️ | Phase 15 cwd 가드 (ACR 영역) |
| Wave 3 (다음 세션) | 📋 | 모델 헤더 캡처, 웹 검색, 최종 E2E |

---

## 🎯 2026-05-29 저녁 — Phase 19 Wave 1 기반 사이클 완료

### 완료 요약
**"CTO 자율 운영 강화 — Wave 1 (기반 사이클)"** 모두 검증 통과. CEO 지시 → business_id 추론 → CTO task queued → dispatcher 폴링 → ACR dispatch까지 end-to-end 라이브 확인.

### 완료된 작업 상세

#### 1.1 Schema: business_id 추가 ✅
- `founder_instructions`, `ceo_interpretations`, `agent_tasks`에 `business_id` (nullable string) 컬럼
- 파일: `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts` (raw ALTER + defineCollection)
- 파일: `packages/l5-core/src/types/orchestration.ts` + `schemas/orchestration.schema.json`
- 1회성 truncate 스크립트: `scripts/truncate-orchestration-tables.sql` (수동만, 자동 실행 금지)
- 검증: tsc 0 errors

#### 1.2 CEO 사업 추론 + 모호 시 되묻기 ✅
- `packages/l5-core/src/functions/ceo-orchestration/interpreter.ts`: `interpretFounderInstruction()` 옵션에 `activeBusinesses` 추가
- 자동 business_id 추론 또는 모호 시 `needs_business_clarification` 응답
- `chat:submitInstruction`: 활성 business 조회(status ≠ 'deleted') → interpreter에 주입
  - **버그 수정**: `status: 'active'` → `status: {$ne: 'deleted'}` (기본값 'idea' 때문)
- 검증: interpreter 테스트 10/10 PASS

#### 1.3 CTO 작업 분류 6종 ✅
- `dev-workflow-spec.ts` 재구성: SMALL_FIX, FEATURE, BIG_CHANGE, OPS, RESEARCH, REFACTOR
- `classifyTask()` 신설 — 키워드 + 5지표 격상 분류
  - **버그 수정**: parseTaskClass "small fix" → "small_fix" 정규화
- `buildDevWorkflowSystemPrompt` 등에 taskClass 인자 추가
- `services/agent-runtime/src/agents/cto.ts`: LLM 파싱 + classifyTask fallback
- 검증: dev-workflow-spec 41 tests + l5-core 281 전체 PASS

#### 1.4 막힘② 검증 + executeTask 가드 ✅
- **자율 경로 완결**: Hermes task-dispatcher (60s cron) → `fetchQueuedTasks[queued && approval_required=false]` → `runCTOAgent` → ACR dispatch 정적 확인
- **경쟁 경로 차단**: `agent:executeTask` 액션이 CTO task에 `deferred` 반환 (dispatcher 일원화)
- **Founder UI 수정**: 승인 후 `executeTask` 제거, task status를 `needs_review`만 변경
- **라이브 버그 수정**: interpreter SYSTEM_PROMPT `undefined` → `null` + 파싱 방어
- 검증: dispatcher 단위테스트 7개 추가 + 전체 테스트 PASS

#### 1.5 D2 사이클 라이브 E2E ✅
**환경:** NocoBase :13000, ACR :3001

**end-to-end 검증:**
1. Founder chat: "QA Fixed 비즈니스를 위한 기술 개선 배포 절차 자동화" (D2)
2. CEO LLM 해석
3. **business_id 추론**: "QA Fixed" → id=1 ✅
4. **CTO task queued, approval_required=false** ✅
5. **dispatcher 폴링** (60s) → `runCTOAgent`
6. **CTO phase 분해** (LLM 1회) → 6단계 + risk levels
7. **ACR `/api/projects`** → auto-create ✅
8. **ACR `/api/workbench/dispatch`** → FeaturePlan + PlanTask 저장 ✅
9. `auto_dispatch_scheduled: true`

**결론:** 모든 단계 통과. "막힘②" 최종 검증 완료.

### 아키텍처 결정 (DECISIONS.md에 기록)
1. **id=0 폐기** → `business_id NULL = 회사 공통`
2. **막힘② = dispatcher 일원화** → runCTOAgent는 Hermes cron 전담
3. **undefined → null** → LLM 경로 동기화

### 빌드 & 재시작 절차
```bash
# L5 side
cd /Users/wonminyang/Desktop/pulk
corepack pnpm -r build
corepack pnpm -r typecheck

# NocoBase 재시작
cd apps/nocobase-app
yarn dev  # :13000

# ACR (별도 터미널)
cd ~/Desktop/양원민\ 개발자/agent_control_room_docs
npm run dev  # :3001, L5_BASE_URL=http://localhost:13000 + L5_ADMIN_TOKEN 설정

# Hermes 4개 cron 등록 (처음 한 번)
bash /Users/wonminyang/Desktop/pulk/services/hermes-runtime/scripts/install-launchd.sh
```

### 검증 현황
| 항목 | 결과 |
|---|---|
| l5-core tsc + tests | ✅ 281 PASS |
| plugin-orchestration tsc | ✅ 0 errors |
| founder-ui tsc | ✅ 0 errors |
| hermes-runtime tests | ✅ 24 PASS |
| 라이브 D2 E2E | ✅ CEO 해석→business_id→dispatcher→CTO phase→ACR dispatch |
| 라이브 버그 수정 | ✅ business status + parseTaskClass + undefined→null |

### 다음 세션
- **ACR runner 403**: Phase 15 기록된 cwd 가드 (ACR 레포 영역, pulk 범위 외)
- **Wave 2**: 모니터 재구성, Founder UI 개선, 모델 티어링, 전체 E2E (별도 세션)

---

## ✅ 2026-05-29 (오후 세션)

### Phase 8 P2 — Tool Request 추적 UI (Founder UI)
- `plugin-executive-monitor`: `monitor:toolRequests` 액션 추가. `assigned_agent='CTO' AND source_ref LIKE 'repetition-pattern:%'` raw SQL 필터 + 선택적 status 필터
- `apps/founder-ui/src/lib/api.ts`: `ToolRequestItem` 타입 + `api.listToolRequests(status?)`
- `apps/founder-ui/src/app/tool-requests/page.tsx` 신규 — 30초 자동 갱신, 상태 탭 필터, rationale 파싱(반복 패턴명/발생 횟수/관련 에이전트)
- `apps/founder-ui/src/components/Sidebar.tsx`: 🔧 Tool Requests 항목 추가
- 검증: founder-ui `npx tsc --noEmit` 0 errors, plugin tsc 0 errors. 브라우저 라이브에서 사이드바·라우트 응답 확인

### Phase 11 P1 — ACR daemon launchd plist
- 신규: `~/Desktop/양원민 개발자/agent_control_room_docs/launchd/com.l5.acr-daemon.plist` (KeepAlive=true, CONTROL_ROOM_URL=http://localhost:3001)
- 신규: `~/Desktop/양원민 개발자/agent_control_room_docs/scripts/install-launchd.sh`
- 라이브 등록: `launchctl list | grep com.l5.acr-daemon` 확인 (PID 16713 안정). 데몬이 ACR 3001 폴링 + 작업 픽업 정상.
- 첫 설치 시 plist의 CONTROL_ROOM_URL이 3000으로 잘못 설정되어 데몬이 Hook Pattern Lab(3000)에 폴링 → 3001로 패치 후 reload. 소스 plist도 패치 완료

### Phase 14·15·18.1 라이브 wiring 검증
- ACR `.env.local`에 `L5_BASE_URL=http://localhost:13000`, `L5_ADMIN_TOKEN=<NocoBase JWT>` 추가 후 ACR 재시작
- **Phase 18.1**: `POST /api/workbench/dispatch` w/ `clarifying_questions[]` + `auto_execute:true` → `POST /api/orchestration/auto-dispatch` → `status="skipped", reason="needs_clarification"` ✅ pre-dispatch 차단 정상. 별도 curl로 NocoBase `/api/agent:taskCallback`을 JWT로 호출 → UUID validation 시점까지 도달 (JWT 인증 통과) ✅
- **Phase 15**: `/tmp/pulk-e2e-sandbox` 경로로 dispatch → `l5-e2e-ph15-1780032219` ACR project 자동 생성 + README.md/docs/SANDBOX.md docs ingestion → `data/projects.json`, `feature-plans.json` 영속 확인 ✅
- **Founder UI E2E (Playwright headless)**: 로그인 → `/chat` → CTO 지시 → CEO LLM(`execution_system_build`, D2) → "승인" → `/monitor`에서 CTO `needs_review` 1건 반영 ✅. Tool Requests 사이드바·페이지 라이브 노출 ✅
- **풀 E2E 잔여**: ACR `/api/runner` 403 — Phase 15 HANDOFF에 기록된 cwd/git 가드 잔여 이슈로 추정. 실 claude CLI spawn까지는 가드 해제 후 별도 검증 필요. NocoBase plugin-orchestration의 `executeTask`는 `services/agent-runtime/runCTOAgent`를 호출하지 않음 — 그쪽 wiring은 별도 작업

### Open Items 갱신
- ~~P1 Phase 18.1 라이브 wiring~~ ✅ 완료
- ~~P2 Phase 8 P2 Tool Request UI~~ ✅ 완료
- ~~P2 Phase 11 P1 ACR daemon launchd~~ ✅ 완료
- P1 Phase 14-17 풀 E2E (실 claude CLI 1사이클): /api/runner 가드 해제 + services/agent-runtime ↔ plugin-orchestration wiring 필요

---

## 📌 2026-05-29 정책 결정 (DECISIONS.md 참조)

**ACR 소유권**
- ACR 운영·실행은 CTO Agent 전속 책임
- Founder·CEO·ChiefOfStaff 대화에서 합의된 개발 항목 → CTO로 자동 위임 (별도 사람 게이트 없음, D3+만 approval queue)
- Founder UI는 진행 모니터링 + D3+ 승인만. ACR 직접 조작 UI 신규 개발 안 함

**OUT OF SCOPE (영구)**
- OMC / OMX — ACR 내장 agent-model-router(claude/codex/antigravity)로 충분
- Formbricks (PMF Score 실측) — Hermes 반복 감지 + Founder 정성 판단으로 대체

---

## 🧭 다음 세션 우선순위 (Open Items)

| 순위 | 항목 | 비고 |
|---|---|---|
| P1 | Phase 18.1 라이브 wiring 잔여 | ACR `L5_BASE_URL=http://localhost:13000` + `L5_ADMIN_TOKEN` 설정 후 재시작 → NocoBase taskCallback 실제 도달 확인 |
| P1 | Phase 14-17 라이브 E2E 누적 검증 | 실 NocoBase + ACR + claude CLI 한 사이클. 사용자 직접 트리거 권장 |
| P2 | Phase 8 P2 Tool Request 워크플로 | 기반(`generateToolRequestTask`, repetition-analyzer, CTO handler) 존재. Founder-facing 추적 UI만 남음 |
| P2 | Phase 11 P1 ACR daemon 자동 시작 | launchd plist 추가. 사용자 권한 필요 |

---

## ✅ Phase 8 P1 완료 (2026-05-29) — Workflow Factory LLM 연결

- `packages/l5-core/src/functions/workflow-factory/generator.ts`: `generateWorkflowWithLLM(input, llm?)` 추가 — deterministic baseline 위에 LLM partial JSON merge, throw/parse-fail/no-llm 시 fallback
- `apps/nocobase-app/.../plugin-orchestration/src/server/plugin.ts` `generateWorkflow` 액션이 `OPENAI_API_KEY` 있을 때 LLM 경로 사용
- @l5/core 17/17 workflow-factory tests PASS (기존 12 + 신규 5), 전체 207/207 PASS

---

## ✅ Phase 9 P2 완료 (2026-05-29) — Phase Transition Summary UI

**핵심 변경:**
1. `packages/l5-core/src/functions/bpr/transition-summary.ts` (신규) — pure `buildPhaseTransitionSummary({from_phase, to_phase, tasks})` 가 done/blocked/needs_review 집계 + insight_to_record dedup + PHASE_FOCUS 기반 다음 단계 계획 생성. `FOUNDER_BRIEF_SPEC.md §5` 구조 충족.
2. `apps/nocobase-app/.../plugin-executive-monitor/src/server/plugin.ts` — `bpr:transitionSummary` 액션 추가 (`POST {from_phase, to_phase}` → agent_tasks 조회 후 pure 함수 호출). ACL `loggedIn`.
3. `apps/founder-ui/src/lib/api.ts` — `transitionSummary()` 클라이언트 추가.
4. `apps/founder-ui/src/app/monitor/page.tsx` `PhaseTransitionPanel` — "다음 Phase로 전환 →" 클릭 시 fetch + 인라인 미리보기 (성공 기준, 미해결 항목, 핵심 인사이트, 다음 Phase 계획). 요청 제출 전 검토.

**검증:**
- `@l5/core` 202/202 PASS (+8 transition-summary)
- founder-ui `npx tsc --noEmit` 0 errors
- plugin-executive-monitor standalone tsc 0 errors
- 라이브 적용: NocoBase 재시작 + 플러그인 재빌드 필요 (사용자 권한)

---

## ✅ Phase 18.1 완료 (2026-05-29) — ACR pre-dispatch trigger 와이어링

**핵심 변경 (ACR 측):**
1. `lib/types.ts` `PlanTask.clarifyingQuestions?: string[]` 추가 — dispatch 전 L5 CTO 답변 필요 질문 목록
2. `app/api/workbench/dispatch/route.ts` — CTOPhase에 `clarifying_questions?: string[]` 옵션 필드 추가, PlanTask로 plumb
3. `lib/orchestration/pre-dispatch-checks.ts` (신규):
   - `checkPendingClarifications(task)` — questions vs answers 비교
   - `reassessRisk(prompt, currentLevel)` — risk-classifier 사용해 D1-D5로 재분류
   - `sendClarificationRequest()` / `sendRiskReassessment()` — L5 `taskCallback` 직접 호출
4. `lib/orchestration/auto-dispatcher.ts` `dispatchNextTask` pre-flight 추가:
   - clarification pending → `needs_clarification` callback 전송 후 skip
   - risk escalated → `risk_reassess` callback 전송, D3+로 승격되면 skip (approval queue에 위임)

**검증:**
- `__tests__/pre-dispatch-checks.test.ts` 3/3 PASS (clarification 차단, risk escalation 차단, benign D2 proceed)
- 회귀: auto-dispatcher 4/4 + clarify-reply 6/6 PASS
- `npx tsc --noEmit` 0 errors
- **라이브 smoke 통과 (2026-05-29):** `curl POST /api/workbench/dispatch` clarifying_questions=2 payload → PlanTask.clarifyingQuestions 디스크 persist 확인, task.status='planned' 유지 (runner 미호출). Hot-reload된 Next.js dev 서버에서 검증.

**라이브 E2E 잔여 (실 NocoBase 콜백):**
- 현재 smoke는 L5_BASE_URL=13001(기본값)로 fetch — 실 NocoBase는 13000. ACR 환경 변수 `L5_BASE_URL=http://localhost:13000` + `L5_ADMIN_TOKEN` 설정 후 재시작 시 needs_clarification → NocoBase /api/agent:taskCallback 도달 확인 필요.
- Phase 16/17 라이브 (verifier 재호출 + replan) 실 claude CLI 사이클은 별도 시간 예산 필요.

---

## ✅ Phase 18 완료 (2026-05-28) — Clarification 헤드리스 + Risk 재평가

**핵심 변경**
1. `packages/l5-core/src/functions/cto-clarification/clarifier.ts` 신규 — `answerClarifications(input, llm?)`. D1-D3 + LLM 사용 가능 시 JSON `{answers[]}` 합성, D4-D5 또는 LLM 실패/공백 시 즉시 `escalate`. Deterministic fallback (verifier 패턴 모방).
2. L5 plugin `taskCallback`에 신규 status 2개 추가 (`apps/nocobase-app/.../plugin-orchestration/src/server/plugin.ts`):
   - `needs_clarification` — `questions[]` + `acr_callback_url` 수신 → CTO LLM (OPENAI_API_KEY gated) 호출 → answered면 ACR로 회신 fetch, escalate면 task `needs_review` + `approval_required=true`.
   - `risk_reassess` — `new_risk_level` 수신 → `agent_tasks.risk_level` 업데이트, D3+면 `approval_required=true` 승격.
3. ACR `/api/clarify-reply` 신규 라우트 — L5가 답변 회신 시 `findCTOTaskMetadataByL5Id`로 planId/taskId 해석 후 `appendPlanTaskClarification`으로 `PlanTask.clarificationAnswers[]` 누적. `L5_SHARED_SECRET` 헤더 검증.
4. ACR `/api/l5-callback` 확장 — `needs_clarification`/`risk_reassess` status 및 `questions[]`/`acr_callback_url`/`new_risk_level` payload 통과.
5. ACR 타입 확장: `PlanTask.clarificationAnswers?: {question, answer, answeredAt}[]`, `CTOTaskMetadata.findByL5Id` 헬퍼.

**검증**
- `@l5/core`: 194/194 PASS (+10 clarifier).
- ACR clarify-reply: 6/6 PASS. 회귀 (llm-replanner 5 + auto-dispatcher 4) 9/9 PASS.
- ACR `npx tsc --noEmit`: 0 errors.

**미반영 (라이브 E2E 잔여)**
- 샌드박스에서 ACR이 실제로 `needs_clarification` payload를 보내도록 ACR runner 측 trigger는 별도 작업 (현재는 endpoint/headless answer만 라이브화).
- `risk_reassess` 트리거는 ACR packet-generator의 risk 변경 감지 후 자동 호출 wiring 필요 (Phase 18.1로 분리).

---

## ✅ Phase 15 라이브 E2E 완료 (2026-05-28 19:25 KST)

**검증 환경**
- 샌드박스: `/tmp/pulk-e2e-sandbox` (git init + initial commit)
- ACR `npm run dev` port 3001 + `L5_SHARED_SECRET=l5-acr-live-e2e-2026`

**End-to-end pass**
1. `POST /api/workbench/dispatch` (project_path=/tmp/pulk-e2e-sandbox, D2 claude phase) → `auto_dispatch_scheduled: true`
2. ACR auto-create project `l5-e2e-sandbox-1779963933` → `data/projects.json` 등록
3. validateCwdSafety 통과 (외부 project path 허용)
4. checkUncommittedChanges 통과 (clean sandbox)
5. `acr/...` 브랜치 생성
6. `claude -p "Read README.md..."` 실제 spawn → 출력 `DONE` → exit 0
7. ExecutionLog `status: done`

**결론:** Phase 14·15 모두 라이브 검증 통과. 실 `claude` CLI 호출까지 한 사이클 정상 흐름 확인.

---

## ✅ Phase 16.5 완료 (2026-05-28) — LLM Replan + dependsOn

**ACR 측 변경**
- `lib/types.ts`: `PlanTask.dependsOn?: string[]` 추가
- `lib/orchestration/auto-dispatcher.ts`:
  - `dispatchNextTask`에서 `dependsOn` 모두 `done`인 task만 후보로 선택
  - `replanNextPrompt`로 다음 phase prompt 재작성 (priorContext 포함)
- `lib/orchestration/llm-replanner.ts` (신규):
  - `replanNextPrompt(input, llm?)` — OPENAI_API_KEY 시 GPT-4o, 없거나 실패·과소 응답 시 deterministic fallback (`priorContext + basePrompt`)
  - 기본 LLM은 OpenAI SDK 직호출; 테스트는 `ReplanLLM` 시그니처로 주입

**검증**
- `__tests__/llm-replanner.test.ts` 5/5 PASS (deterministic, LLM 사용, throw, 과소 응답)
- `__tests__/auto-dispatcher.test.ts` 4/4 PASS (회귀, OPENAI_API_KEY unset로 fallback 경로 검증)
- `__tests__/projects-register.test.ts` 8/8 PASS (회귀)
- `npx tsc --noEmit` 0 errors

---

## ✅ Phase 17.1 결선 완료 (2026-05-28) — Verifier 라이브화

- Hermes gateway에 `cto-verification-loop` 등록 (`gateway.ts`, `runner.ts`)
- launchd plist `com.l5.hermes.cto-verification-loop.plist` (10분 주기)
- `install-launchd.sh`이 corepack pnpm fallback + 5개 plist 등록
- L5 plugin `taskCallback`에서 `OPENAI_API_KEY` 있으면 `buildLLMClient`를 `verifyCTOPhase`에 주입
- 사용자 환경 등록 완료: `launchctl list | grep l5.hermes` 5건 확인

---

## ✅ Phase 16 코드 완료 (2026-05-28) — Phase-to-Phase 자율 진행 루프

**ACR 측 변경**
- `lib/runner/git-utils.ts`: `getDiffSummary(cwd, base='main')` + `getLogTail(buffer, n=40)` 추가
- `app/api/runner/route.ts`: onComplete 콜백 본문에 `diff_summary`, `log_tail`, `exit_code`, `branch` 첨부
- `app/api/l5-callback/route.ts`: 새 필드 pass-through
- `lib/orchestration/auto-dispatcher.ts`: `buildPriorPhaseContext()` 추가 — 직전 완료 task의 ExecutionLog + diff를 `[PRIOR PHASE CONTEXT]` 블록으로 묶어 다음 phase prompt 앞에 prepend

**L5 측 변경**
- `apps/nocobase-app/.../plugin-orchestration/src/server/plugin.ts` `taskCallback`:
  - 새 필드 (`diff_summary`, `log_tail`, `exit_code`, `branch`) 수신 + phaseCtx 한 줄 요약 blocker에 기록
  - 응답에 `accepted_context` 포함
  - log_tail console.log

**검증**
- ACR `npx tsc --noEmit` 0 errors
- ACR `__tests__/auto-dispatcher.test.ts` 4/4 PASS (회귀)
- ACR `__tests__/projects-register.test.ts` 8/8 PASS (회귀)
- L5 `corepack pnpm --filter @l5/core test` 20 suites / 184 tests PASS
- L5 plugin typecheck PASS

**제한사항 (Phase 16 후속)**
- LLM 기반 `replanFromCallback` 미구현 — 현재는 결정론적 context 주입만. GPT-4o 기반 prompt 재설계는 Phase 16.5로 분리.
- `dependsOn` PlanTask 필드 추가 미적용 — auto-dispatcher가 plan 순서대로 직선 처리하므로 현 모델에서는 불필요.

---

## ✅ Phase 17 코드 완료 (2026-05-28) — CTO 결과 검증 게이트

**@l5/core 신규**
- `packages/l5-core/src/functions/cto-verification/verifier.ts`:
  - `verifyCTOPhaseDeterministic(input)`: exit_code, [ERROR] 토큰, diff 유무 + read-only 힌트 기반
  - `verifyCTOPhase(input, llm?)`: LLM 보강 (GPT-4o 가정), JSON 파싱 + ```json fence 제거 + 결정론 fallback
  - Verdict: `pass | fail | inconclusive`, `retry_recommended`, `confidence`
- 인덱스 export 추가

**L5 plugin-orchestration 변경**
- `taskCallback`: CTO 태스크 + `all_done` 또는 `phase_complete` 시 `verifyCTOPhase()` 호출
  - verdict='fail' → `status=needs_review`, `approval_required=true`, `blocker='verifier:fail ... retry=true'`
  - verdict='inconclusive' → `status=needs_review` (retry 안 함)
  - 응답 body에 `verifier` 포함

**Hermes Verification Loop (신규)**
- `services/hermes-runtime/src/tasks/cto-verification-loop.ts`:
  - `parseRetryCount(blocker)` — blocker text의 `cto_retry=N` 파싱
  - `shouldRetry(task)` — CTO + needs_review + `verifier:fail` + `retry=true` + retry<2
  - `runCTOVerificationLoop(tasks, updater)` — `runCTOAgent` 재호출, blocker에 `cto_retry=N` 인코딩
  - `MAX_RETRIES = 2`

**검증**
- @l5/core 184 tests PASS (verifier 10건 신규)
- @l5/hermes-runtime 24 tests PASS (cto-verification-loop 8건 신규)
- L5 plugin typecheck PASS

**라이브 결선 완료 (2026-05-28 Phase 17.1)**
- ✅ Hermes cron 등록 — `services/hermes-runtime/launchd/com.l5.hermes.cto-verification-loop.plist` (10분 주기), `gateway.ts` `TASK_RUNNERS["cto-verification-loop"]`, `runner.ts` `runCTOVerificationLoopLive`, `scripts/install-launchd.sh` PLISTS 5개로 확장
- ✅ LLM 모드 활성화 — `plugin.ts` `taskCallback`에서 `process.env.OPENAI_API_KEY` 존재 시 `buildLLMClient(task.title)`를 `verifyCTOPhase`에 주입, 미설정 시 deterministic-only
- 검증: `pnpm --filter @l5/hermes-runtime test` 24/24 PASS, gateway 단발 호출 정상 (401은 HERMES_TOKEN 미설정 환경 영향, wiring 자체는 정상)
- 운영 단계: 사용자가 `bash services/hermes-runtime/scripts/install-launchd.sh` 재실행 → 5번째 cron 등록 완료

---

---

## 🔬 Phase 15 라이브 E2E 결과 (2026-05-28)

**환경**
- ACR `npm run dev` on port 3001 (`L5_SHARED_SECRET` 적용)
- NocoBase `yarn start` 재시작 (port 13000, `corepack pnpm -r build` 후 Phase 15 dist 반영)
- L5 env 추가: `L5_SHARED_SECRET=l5-acr-live-e2e-2026`, `L5_DEFAULT_PROJECT_PATH=/Users/wonminyang/Desktop/pulk`, `ACR_BASE_URL=http://localhost:3001`

**검증 통과 ✅**
| 항목 | 결과 |
|---|---|
| `POST /api/businesses:create` → `id=2` | OK |
| `POST /api/l5:acrRegister` → ACR upsert | `acr_project_id: business-2` |
| ACR `data/projects.json` 등재 + path=/Users/wonminyang/Desktop/pulk | OK |
| docs ingestion (fire-and-forget) | AGENTS.md + CLAUDE.md + README.md + `docs/*.md` 19개 = **22개** inline |
| CTO `POST /api/workbench/dispatch` (D2 + auto_execute=true + project_path) | `auto_dispatch_scheduled: true` |
| auto-dispatcher fire → in-process token + `/api/runner` 자동 POST | OK (token 발급 + runner 호출 도달) |

**발견된 갭 ❌**
- `/api/runner` 응답 **403** — `app/api/runner/route.ts:97`이 `projectRoot = process.cwd()` (ACR 디렉토리)로 고정 후 `validateCwdSafety(cwd, projectRoot)` 검사. L5 외부 프로젝트 cwd(`/Users/wonminyang/Desktop/pulk`)는 ACR 디렉토리 prefix가 아니므로 거부됨.
- 즉 Phase 14의 "외부 프로젝트 cwd로 dispatch" 시나리오와 ACR runner의 path-traversal 가드가 충돌. dispatch/ingestion/token/runner 호출까지는 정상이지만 실제 CLI spawn 전에 블록됨.

**다음 단계 (Phase 16 후보 P0)**
1. ~~ACR `validateCwdSafety` 보강~~ — ✅ **2026-05-28 완료**. `app/api/runner/route.ts`에서 `process.cwd()` 단일 root 대신 `getProjects()`로 등록된 `projects[].path` 전체를 허용 목록으로 사용. 외부 프로젝트 cwd dispatch가 통과.
2. 수정 후 동일 dispatch 재실행 → `POST /api/runner` **200** (SSE 시작) 확인 ✅. 추가 SSE body 캡처에서 `[ERROR] Uncommitted changes detected...`까지 도달 → cwd 가드 이후 spawn-runner의 git 청결도 가드가 정상 작동.
3. (선택) pulk 루트 대신 임시 디렉토리에서 sandbox 검증으로 git uncommitted 차단 회피하거나, 변경을 stash 후 재시도하면 실제 `claude` CLI spawn까지 검증 가능.

**Phase 15 라이브 E2E Verdict (2026-05-28 갱신):** ✅ Pass — 비즈니스 생성 → ACR 등록 → 22개 docs ingestion → CTO D2 dispatch → auto-dispatcher fire → cwd safety 통과 → runner SSE 시작까지 end-to-end 확인. 실제 CLI spawn은 의도된 git 가드에 의해 차단되며 별개 issue.

---

## ✅ Phase 15 완료 (2026-05-28) — CTO 프로젝트 부트스트랩

**목표:** CTO가 새 비즈니스용 코드베이스를 ACR에 자율 등록 + AGENTS.md/CLAUDE.md/docs 자동 ingestion.

**ACR 측 (`~/Desktop/양원민 개발자/agent_control_room_docs/`)**
- `app/api/projects/route.ts` (신규): `POST` 핸들러 — `{ project_id, title, one_liner, l5_business_id, project_path? }` 받아 멱등 upsert. 위험 경로(`/etc`, `/Users` 등) 400 차단. 등록 직후 setImmediate로 ingestion fire-and-forget.
- `lib/ingestion/project-docs-ingestor.ts` (신규): `ingestProjectDocs(projectId, projectPath)` — AGENTS.md/CLAUDE.md/README.md + `docs/*.md` 스캔, 누락 파일 silent skip, 256KB 캡.
- `lib/storage/json-store.ts`: `upsertProjectById()` 헬퍼 추가 (멱등 키 기반 upsert).
- `app/api/workbench/dispatch/route.ts`: `body.project_path` 있고 ACR project 없으면 dispatch 안에서 auto-create + ingestion 트리거. `projectId = l5-${l5_task_id}` 변수로 정리.

**L5 측 (`/Users/wonminyang/Desktop/pulk/`)**
- `services/agent-runtime/src/agents/cto.ts`:
  - `ACR_BASE_URL` 환경변수 도입 (기본 `http://localhost:3001`).
  - `registerWithACR()` payload에 `project_path: resolveProjectPath(task)` 추가.
  - `bootstrapProjectIfMissing()` 신규: 4xx/5xx 받으면 `L5_DEFAULT_PROJECT_PATH`로 재시도. fallback path 없으면 워닝.
- `services/hermes-runtime/src/api/acr-client.ts`: `ACRProjectRegistration`에 `project_path?` 필드 추가.
- `apps/nocobase-app/packages/plugins/@l5/plugin-business-portfolio/src/server/plugin.ts`: `acrRegister` 액션 신규 — 비즈니스 생성 시 ACR `POST /api/projects` 호출.
- `apps/nocobase-app/packages/plugins/@l5/plugin-business-portfolio/src/client/pages/BusinessPortfolioPage.tsx`: `handleCreateBusiness`에서 생성 직후 `api.resource('l5').acrRegister(...)` 비차단 호출.

**검증**
- ACR `npx tsc --noEmit` 0 errors
- ACR `__tests__/projects-register.test.ts` (신규) — 8/8 PASS (ingestion 정상/누락/빈 경로, 400 validation, 멱등성, fire-and-forget 검증)
- ACR `auto-dispatcher.test.ts` 회귀 — 4/4 PASS
- ACR 전체 회귀 — 41/42 suites PASS (1건 사전 존재 qa-fixes-phase11 missing-doc 이슈, Phase 15 무관)
- L5 `pnpm -r typecheck` — l5-core/founder-ui/agent-runtime/hermes-runtime 전체 통과
- L5 `@l5/core` — 174/174 tests PASS

**라이브 E2E 대기:**
- L5_DEFAULT_PROJECT_PATH 세팅 후 비즈니스 생성 → ACR `data/projects.json` 등장 확인
- CTO D2 태스크 dispatch → ACR project auto-create + docs ingestion 확인 + daemon이 올바른 cwd에서 CLI spawn

---

## ✅ Phase 14 완료 (2026-05-28) — ACR 무인 실행 루프

**목표:** CTO가 dispatch한 D1-D2 phase가 사람 클릭 없이 자동 spawn → 콜백까지 흐른다.

**L5 측 (`/Users/wonminyang/Desktop/pulk/`)**
- `packages/l5-core/src/types/acr-intent.ts`: `ACRIntent.project_path?` 추가
- `services/agent-runtime/src/agents/cto.ts`: `resolveProjectPath()` 헬퍼 — task → env(`L5_DEFAULT_PROJECT_PATH`) → undefined

**ACR 측 (`~/Desktop/양원민 개발자/agent_control_room_docs/`)**
- `lib/storage/cto-task-metadata-store.ts` (신규): planId+taskId → CTO sidecar metadata
- `lib/orchestration/auto-dispatcher.ts` (신규): `dispatchNextTask` / `runAutoDispatchForPlan` / `scheduleAutoDispatch` — D1-D2 + gate=none 태스크를 in-process token 발급 후 `/api/runner` SSE 끝까지 소비
- `app/api/workbench/dispatch/route.ts`: metadata 저장 + auto_execute=true 있으면 fire-and-forget
- `app/api/orchestration/internal-token/route.ts` (신규): `x-l5-shared-secret` 인증, 외부 호출용 token 발급
- `app/api/orchestration/auto-dispatch/route.ts` (신규): 동일 인증, plan 단위 수동 트리거

**검증**
- @l5/core typecheck/build PASS, 174/174 tests PASS
- @l5/agent-runtime tsc --noEmit PASS
- ACR `npx tsc --noEmit` 0 errors
- ACR `__tests__/auto-dispatcher.test.ts` — 4/4 PASS (dispatch flow, D4 차단, internal-token 401/200/503)
- ACR 전체 회귀: 40/41 suites PASS (1건은 사전 존재 missing doc 이슈, Phase 14 무관)

**라이브 E2E 대기:**
- ACR `npm run dev` (port 3001) + env `L5_SHARED_SECRET`, `L5_DEFAULT_PROJECT_PATH` 세팅
- L5 NocoBase + agent-runtime 기동, D2 CTO 태스크 1건 실행 → ACR 자동 spawn → claude/codex 실제 CLI → callback까지 검증

---

---

## Current State

**Phase 0-13 구현 완료**

### ✅ Phase 13 완료 (2026-05-28)

**LLM 기반 decomposer:**
- `packages/l5-core/src/functions/ceo-orchestration/decomposer.ts`: 키워드 → LLM 기반 역할 배분으로 교체 (키워드 fallback 유지)
- `decomposeIntoWorkstreams`가 async로 변경, `llm?: LLMClient` 옵션 추가
- `instructions.action.ts`: `await decomposeIntoWorkstreams(...)` + `llm` 전달

**에이전트 실제 실행 (OpenAI GPT-4o, CTO 패턴 동일):**
- `services/agent-runtime/src/agents/cmo.ts`: GTM 메시징 전략 — 외부 발송 전 승인 필수
- `services/agent-runtime/src/agents/cpo.ts`: 제품 로드맵 · PMF 가설 설계 (신규)
- `services/agent-runtime/src/agents/cro.ts`: 세일즈 워크플로 · 리드 전략 (신규)
- `services/agent-runtime/src/agents/coo.ts`: 운영 프로세스 · SOP 정의 (신규)
- `services/agent-runtime/src/agents/cfo.ts`: 비용 분석 · 예산 영향 검토 (신규)
- `services/agent-runtime/src/agents/risk-qa.ts`: D1-D5 리스크 평가 (실제 구현)
- `services/agent-runtime/src/agents/chief-of-staff.ts`: 에이전트 간 조율 (실제 구현)
- 모든 에이전트: API 키 없을 때 deterministic fallback 지원

**Task Dispatcher (신규 Hermes cron, 1분 주기):**
- `services/hermes-runtime/src/tasks/task-dispatcher.ts`: `status=queued` + `approval_required=false` 태스크 자동 실행
- `services/hermes-runtime/src/api/nocobase-client.ts`: `fetchQueuedTasks()` 추가
- `services/hermes-runtime/src/runner.ts`: `runTaskDispatcherLive()` 추가
- `services/hermes-runtime/src/gateway.ts`: `task-dispatcher` 태스크 추가
- `services/hermes-runtime/launchd/com.l5.hermes.task-dispatcher.plist`: 1분 간격 launchd plist

**검증:**
- `@l5/core` 174 tests PASS ✅
- `@l5/agent-runtime` tsc --noEmit PASS ✅
- `@l5/hermes-runtime` tsc --noEmit PASS ✅

### ✅ Phase 12 완료 (2026-05-28)

**P1: Hermes gateway launchd 자동 시작**
- `services/hermes-runtime/src/gateway.ts`: CLI 진입점 (`node dist/gateway.js <task-name>`)
- `services/hermes-runtime/launchd/`: 4개 plist (repetition-analyzer/approval-checker/daily-brief/cto-weekly-review)
- `services/hermes-runtime/scripts/install-launchd.sh`: 빌드 → plist 설치 → launchctl load 한 번에 처리
- 설치: `bash services/hermes-runtime/scripts/install-launchd.sh` (repo 루트에서)

**P1: Memory → CEO context 재주입**
- `packages/l5-core/src/functions/ceo-orchestration/interpreter.ts`: `InterpretOptions.memories?` 파라미터 추가
- `apps/nocobase/packages/plugins/@l5/plugin-orchestration/src/server/actions/instructions.action.ts`: `submitChatInstruction` 에서 `founder_memory` 조회 → CEO 해석 컨텍스트 주입

**P2: ACR 프로젝트 자동 등록**
- `services/agent-runtime/src/agents/cto.ts`: `runCTOAgent()` 시작 시 `registerWithACR()` 호출 (graceful fallback)

**Trigger.dev 제거**
- 코드 및 문서에서 Trigger.dev 참조 제거 (의도적 미구현 결정)
- `services/hermes-runtime/src/tasks/trigger-schedules.ts`: 예시 주석 블록 제거

---

**Phase 0-10 구현 완료 (CTO Agent + ACR 양방향 연동 완성)**

- `@l5/core`: 19 suites / 174 tests PASS
- NocoBase 서버: `http://localhost:13000` (`yarn nocobase start`)
- Founder UI: `http://localhost:3000` (`npm run dev`)
- ACR: `http://localhost:3001` (`npm run dev` in `~/Desktop/양원민 개발자/agent_control_room_docs/`)

### ✅ Phase 10 완전 완료 (2026-05-28)

**L5 → ACR 연결 (CTO Agent):**
- `services/agent-runtime/src/agents/cto.ts`: LLM 1회 호출 → CTOPhase[] 설계 → ACR dispatch
- `packages/l5-core/src/types/acr-intent.ts`: ACRIntent, CTOPhase, RuntimeType 타입
- ACR `POST /api/workbench/dispatch`: L5 CTOPhase[] → FeaturePlan + PlanTask[] 저장 (신규)
- D-level ↔ Release Gate 동기화: D1-D2=auto, D3=24h gate, D4-D5=manual_founder

**ACR → L5 연결 (결과 피드백):**
- ACR `POST /api/l5-callback`: ACR 완료/실패 → L5 taskCallback 중계 (신규)
- ACR `/api/runner` onComplete: projectId `l5-` prefix 감지 → L5 자동 callback (신규)
- L5 `POST /api/agent:taskCallback`: all_done/failed/blocked/phase_complete 처리

**Founder UI:**
- `/control-room` 페이지: CTO 태스크 현황 + ACR 열기 버튼
- 사이드바 Control Room 탭 추가

**E2E 검증:**
- submitInstruction → approvePlan → executeTask → taskCallback 전체 플로우 ✅
- ACR typecheck 통과 ✅ / L5 174 tests PASS ✅

### ✅ Phase 11 완료 (2026-05-28)

**11a — founder_memory 컬렉션 공식 등록:**
- `plugin-executive-monitor`: `founder_memory` NocoBase 컬렉션 정식 등록 (`defineCollection`)
- 기존 `memoryCandidates` / `saveMemory` / `discardMemory` 엔드포인트가 이제 실제 DB를 사용

**11a — Hermes NocoBase HTTP 클라이언트:**
- `services/hermes-runtime/src/api/nocobase-client.ts`: NocoBase API HTTP 클라이언트
  - `fetchAgentTasks()`, `fetchPendingApprovalTasks()`, `createAgentTask()`, `updateAgentTask()`, `saveFounderMemory()`
- `services/hermes-runtime/src/runner.ts`: 순수 함수 태스크를 실제 NocoBase 데이터와 연결
  - `runRepetitionAnalyzerLive()`, `runApprovalCheckerLive()`, `runStalledTaskDetectorLive()`, `runCTOPhaseReviewLive()`, `syncD3AutoApprovals()`

**11b — ACR 승인 토큰 자동 발행:**
- `agent_tasks` 컬렉션에 `acr_token` 필드 추가
- `executeTask` 액션: D3-D5 태스크 실행 시 `randomUUID()` 토큰 자동 생성 및 저장
- 응답에 `acr_token` 포함

**11c — ACR 콜백 엔드포인트:**
- `POST /api/acr:approvalCallback` 추가 (plugin-orchestration)
  - `token` + `approved` + `notes` 파라미터
  - 토큰으로 태스크 조회 → 승인(done) / 거절(killed) 처리

**11d — CTO Phase Review:**
- `services/hermes-runtime/src/tasks/cto-phase-review.ts` 신규 생성
  - 완료 태스크 집계 → BPR 단계 전환 조건 평가
  - 조건 충족 시 전환 요청 AgentTask 자동 생성 (D5, needs_review)

**11e — ACR 클라이언트:**
- `services/hermes-runtime/src/api/acr-client.ts`: ACR HTTP 클라이언트
  - `notifyACRApprovalRequired()`: D3+ 태스크 → ACR webhook POST (ACR 없을 시 warn만)
  - `registerACRProject()`: 비즈니스 생성 시 ACR 프로젝트 등록

**Hermes Agent 통합 (2026-05-28):**
- Hermes Agent (NousResearch, `~/.local/bin/hermes`) 를 L5 스케줄러로 통합
- `plugin-executive-monitor`에 Hermes 전용 공개 API 엔드포인트 추가:
  - `GET /api/hermes:taskSummary` — 전체 태스크 현황 (LLM 컨텍스트용)
  - `POST /api/hermes:createTask` — Hermes LLM이 분석 후 태스크 생성
  - `POST /api/hermes:saveInsight` — Hermes가 메모리 인사이트 저장
- Hermes cron 잡 4개 등록 및 정상 동작 확인:
  - `l5-repetition-analyzer` (d2c745e75090) — 2시간마다 ✅ 실행 확인
  - `l5-approval-brief` (c8debd1b40b2) — 매일 09:00
  - `l5-cto-weekly-review` (c9e448bb2840) — 매주 월요일 10:00
  - `l5-daily-brief` (6db01ae1d784) — 매일 18:00

**Hermes OpenAI 연동 설정 (2026-05-28):**
- `~/.hermes/config.yaml` 수정:
  - `providers.openai-direct`: `base_url: https://api.openai.com/v1`, `api_key`, `api_mode: chat_completions`
  - `model.provider: openai-direct` (Hermes 내부 "openai" 슬러그는 openrouter로 라우팅되어 사용 불가)
  - `prompt_caching.cache_ttl: 0s` (gpt-4o-mini는 Responses API `include` 파라미터 미지원)
- `OPENAI_API_KEY` 환경변수 `~/.zshrc`에 추가
- Hermes gateway 실행: `OPENAI_API_KEY=... hermes gateway run --replace` (재부팅 시 수동 재시작 필요)

### ⚠️ Phase 12로 이관

- OMC/OMX 연동 (의존성 불명확, 별도 스펙 필요)
- ACR project 자동 등록 — CTO 개발 태스크 시작 시 `registerACRProject()` 호출
- Hermes → Telegram 알림 연동 (`--deliver telegram` 추가)

→ **상세 내용: `docs/TASKS.md` Phase 12 섹션 참조**

### ✅ Phase 9.5: Agent 실제 실행 연결 완료

**구현됨:**
- `/api/agent:executeTask` 액션 추가 (plugin-orchestration)
  * executeAgentTask() 호출 → AgentOutput + AgentHandoff 저장
  * 태스크 상태 업데이트 (queued → needs_review/done/blocked)
- Founder UI 자동 실행
  * approvePlan 후 각 task 자동 호출 (`api.executeTask()`)
  * 승인 후 모든 queued 태스크 병렬 실행
- Monitor에 실행 결과 반영
  * status: needs_review (D2 태스크는 completed 대신 needs_review로 표시 — 검토 후 완료로 전환)
  * blocker 정보 저장 (AgentOutput.bottleneck)

**한 줄 요약:** 지시 입력 → 승인 → 각 Agent 자동 실행 → 결과 저장 → Monitor 표시까지 완전 자동화됨

---

### ✅ Phase 10 P0: PMF 개념 정정 + Hermes 반복 분석기 추가

**PMF 개념 명확화:**
- **PMF (Product-Market Fit)**는 신규 사업 시작 시에만 적용 (찾기 → 구현 → 판매)
- 모든 작업/태스크의 게이트가 **아님** (이전 구현 오류 제거됨)
- **반복 감지**는 별개 시스템 (3회 이상 반복 작업 → CTO 도구화 요청)

**구현됨:**

1. **PMF 게이트 제거 (CPO, CTO Handler)**
   - `packages/l5-core/src/functions/executive-runtime/handlers/cpo-handler.ts`:
     * pmfEvidence, pmfScore, hasStrongEvidence 변수 제거
     * 모든 productization 요청 → `status: 'needs_review'` (blocked 조건 제거)
     * 단순 Offer Shape 분석으로 단순화
   
   - `packages/l5-core/src/functions/executive-runtime/handlers/cto-handler.ts`:
     * PMF 점수 검증 제거
     * Phase 기반 build 블록킹 로직 제거
     * Tool feasibility 독립 평가 → `status: 'needs_review'`

2. **Hermes 2시간 배치 반복 분석기**
   - Schedule: `"0 */2 * * *"` (2시간마다 :00)
   - `services/hermes-runtime/src/tasks/trigger-schedules.ts`:
     * `REPETITION_ANALYZER` 스케줄 상수 추가
   
   - `services/hermes-runtime/src/tasks/repetition-analyzer.ts`:
     * 7일 내 동일 task_title 3회 이상 감지
     * CTO tool request 자동 생성
     * 패턴 분석 (occurrence, agents involved, time span)
   
   - `@l5/core` 반복 감지 함수 (`packages/l5-core/src/functions/repetition-detection.ts`):
     * `analyzeRepetitionPattern()` — 패턴 메타데이터 분석
     * `generateToolRequestTask()` — CTO task 생성 페이로드
     * `detectRepeatingTasks()` — 제목별 작업 그룹화

3. **반복 감지 → 도구화 흐름**
   - Hermes 2시간마다 실행
   - 동일 제목 3회 이상 감지
   - 자동으로 CTO에게 tool request 할당 (D2, needs_review)
   - CTO가 기술 feasibility 평가
   - CEO가 승인/거절로 도구화 진행 결정
   - **PMF와 무관** — 반복되는 수작업이면 충분

**테스트 통과:**
- `npm run typecheck:all` — 0 errors
- `npm run validate` — 22 PASSED

**한 줄 요약:** PMF ≠ 반복 감지. 신규 사업은 PMF 먼저, 기존 작업은 반복 패턴으로 자동 도구화

---

## What Works

### Backend API (NocoBase @ localhost:13001)
| 엔드포인트 | 역할 |
|---|---|
| `POST /api/auth:signIn` | JWT 인증 |
| `POST /api/chat:submitInstruction` | CEO 채팅 → GPT 해석 → AgentTask[] **proposed** 상태로 생성 |
| `POST /api/chat:approvePlan` | instruction_id 기준 proposed → **queued** 일괄 전환 |
| `POST /api/chat:rejectPlan` | instruction_id 기준 proposed → **killed** 일괄 전환 |
| `POST /api/chat:generateWorkflow` | 아이디어 → Brief + PMF Plan + Staffing |
| `POST /api/agent:executeTask` | task_id 기반 executeAgentTask() → AgentOutput/Handoff 저장 + status 업데이트 **✅ NEW** |
| `GET /api/bpr:currentPhase` | 현재 BPR Phase + 다음 Phase 정보 |
| `POST /api/bpr:requestTransition` | Phase 전환 요청 → D5 승인 태스크 생성 |
| `GET /api/monitor:currentTasks` | 활성 task 목록 (queued/running/blocked/needs_review) |
| `GET /api/monitor:blockedTasks` | blocked task 목록 |
| `GET /api/monitor:approvalQueue` | 승인 대기 목록 (approval_required=true) |
| `POST /api/monitor:approveTask` | task 승인 (status → done) |
| `POST /api/monitor:rejectTask` | task 거절 (status → killed) |
| `GET /api/monitor:memoryCandidates` | 메모리 후보 목록 |
| `POST /api/monitor:saveMemory` | 메모리 저장 |
| `POST /api/monitor:discardMemory` | 메모리 폐기 |

### @l5/core 도메인 로직
- CEO 오케스트레이터 (interpret → decompose → assign → summarize)
- 8개 Executive Handler (ChiefOfStaff, CMO, CRO, CPO, CTO, COO, CFO, RiskQA)
- D3 24h 자동승인 / D4 수동 / D5 더블게이트 (RiskQA → Founder)
- Memory 수집/리뷰/저장 (collector, reviewer, founder_memory 테이블)
- BPR Phase Manager (6단계 state machine, 순수 함수)
- Workflow Factory (아이디어 → Brief/PMF/Staffing, 규칙 기반)
- Hermes 스케줄 태스크 (daily-brief 09:00, memory-review 금 17:00, stalled-task 1h)
- OpenAI GPT-4o 클라이언트 (`createOpenAIClient`, API Key 없으면 stub fallback)

---

## What Does Not Work

- **NocoBase 브라우저 UI** — `http://localhost:13001` 접속 시 "App warning: paths[1] null" 에러. 원인: 플러그인 client entry 빌드 실패. **→ 별도 UI 앱으로 해결 예정**
- **Mastra agent-runtime** — placeholder 상태
- **NocoBase 브라우저 UI** — `http://localhost:13001` paths[1] null 에러 (별도 UI 앱으로 해결 예정)

---

## QA 검증 결과 (2026-05-27)

| 항목 | 결과 |
|---|---|
| `@l5/core` 유닛 테스트 | ✅ 19 suites / 174 tests PASS |
| NocoBase e2e auth setup | ✅ 1 passed (Playwright API 인증) |
| `corepack pnpm -r build` | ✅ 전체 빌드 통과 |
| plugin-orchestration core 경로 | ✅ `packages/l5-core/dist/` 직접 참조 |
| plugin-executive-monitor src/server | ✅ NocoBase build 구조 충족 |

**e2e 재실행 시 주의:** `apps/nocobase-app/storage/db/nocobase-e2e.sqlite` 파일이 이전 실행으로 잠겨 있으면 삭제 후 재실행.

---

## Phase 9 Founder UI 완료 (2026-05-28)

**앱 위치:** `apps/founder-ui/` (Next.js 14 App Router, port 3000)

**실행:**
```bash
cd apps/founder-ui && npm run dev   # → http://localhost:3000
```

**구현된 페이지:**

| 경로 | 기능 | 핵심 동작 |
|---|---|---|
| `/chat` | CEO Agent 채팅 + 태스크 승인 | 지시 → proposed 태스크 생성 → 인라인 승인/거절 → queued/killed |
| `/monitor` | Executive Monitor (30초 자동갱신) | BPR Phase 진행바 + 전환 요청, 태스크 필터(전체/진행중/차단/승인필요) |
| `/approval` | 승인 대기 큐 + approve/reject | D3-D5 approval_required 태스크 처리 |
| `/workflow` | Workflow Factory | 아이디어 → Brief + PMF Plan + Staffing |
| `/memory` | Memory Review + save/discard | founder_memory 후보 검토 |

**채팅 플로우 (2026-05-28 개편):**
1. Founder가 지시 입력 → `submitInstruction` → CEO 해석 + `proposed` 태스크 생성
2. 채팅창에 `ProposedTasksPanel` 인라인 표시 (에이전트별 색상, Risk 배지, 성공 기준)
3. "승인" 클릭 → `approvePlan` → `proposed` → `queued` 일괄 전환
4. "거절" 클릭 → `rejectPlan` → `proposed` → `killed` 일괄 전환
5. D3-D5 태스크는 queued 전환 후에도 `approval_required=true` 유지 → 승인 큐로 진입

**공통 인프라:**
- `src/lib/api.ts` — unwrap() 헬퍼 포함, 모든 NocoBase 이중 래핑 처리
- `src/lib/auth-context.tsx` — JWT 토큰 Context (localStorage 영속)
- `src/components/AuthGate.tsx` — 미인증 시 로그인 폼 자동 표시
- TypeScript 에러 0개 (`npm run typecheck` 통과)

## 다음 세션에서 할 일

**우선순위 순서:**

1. **Agent 실행 연결 (필수)** — `queued` 태스크를 agent-runtime이 픽업 → `executeAgentTask()` 실행 → status 업데이트
2. **Phase 10 P0: CTO → Agent Control Room 브리지** — CTO 태스크를 ACR에 전달, Claude/Codex/Antigravity 자동 라우팅
   - ACR 위치: `~/Desktop/양원민 개발자/agent_control_room_docs/` (별도 Next.js 앱)
   - 구현 위치: `services/agent-runtime/src/agents/cto.ts`
   - 참고 문서: `~/Downloads/agent_control_room_fast_track_prd_auto_runtime_selection.md`
3. **Phase 10 P1: Founder UI Control Room 패널** — CLI 세션 목록, Release Gate 승인, 출력 미리보기
4. **Memory → CEO 컨텍스트 주입** — ✅ 완료 (`interpretFounderInstruction` memories 파라미터)

---

## How to Continue

### 서버 실행
```bash
cd /Users/wonminyang/Desktop/pulk/apps/nocobase-app
yarn dev   # → http://localhost:13001
```

### 인증 토큰 발급
```bash
TOKEN=$(curl -s -X POST http://localhost:13001/api/auth:signIn \
  -H "Content-Type: application/json" \
  -d '{"account":"admin@nocobase.com","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
```

### CEO 채팅 테스트
```bash
curl -X POST http://localhost:13001/api/chat:submitInstruction \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"raw_text":"PMF 메시지 실험 계획해줘","source":"chat"}'
```

### 테스트 실행
```bash
corepack pnpm --filter @l5/core test -- --runInBand
corepack pnpm --filter @l5/hermes-runtime test
```

---

## Next 3 Actions

1. **별도 Founder UI 앱 구축** — Next.js 또는 HTML로 CEO 채팅 + Executive Monitor + Approval Queue + Workflow Factory. `localhost:13001` API 호출
2. **Memory → CEO 컨텍스트 주입** — `founder_memory` 테이블 조회 → `interpretFounderInstruction()` 컨텍스트 주입 (P2)
3. **Trigger.dev 실제 연동** — Hermes daily-brief, stalled-task 실제 cron 실행

---

## Open Questions

- Founder UI: Next.js vs 단순 HTML 선택 미결정
- Trigger.dev 연동 시점 미결정
- NocoBase "paths[1] null" 에러의 정확한 원인 미확인 (별도 UI로 우선순위 낮음)

---

**Session Summary:**
1. Codex hardening pass (protocol.ts, handlers, migration hardened)
2. Documentation synchronization (AGENT_PROTOCOL, FOUNDER_BRIEF_SPEC updated)
3. Antigravity UI regression QA (Executive Monitor UI verified + fixes)
4. Implementation status matrix created (12 implemented, 3 partial, 4 documented-only)
5. Next phase planning (Brief auto-gen, Approval routing, Memory persistence)
6. Phase 6c: Memory Entry Persistence 구현 완료 — collector, reviewer, hermes task, DB migration, 21 new tests

## Current Product Direction

L5 Business OS의 Founder-facing UX는 NocoBase admin UI가 아니다.

Founder는 CEO Agent와 채팅으로 비즈니스 방향성, BPR phase, 승인 결정을 다룬다. CEO Agent는 지시를 해석해 CMO/CRO/CPO/CTO/COO/CFO/RiskQA Agent에게 병렬 task를 배정한다. Founder는 Executive Monitor에서 각 Agent가 무엇을, 왜, 어떤 원본 지시 때문에 수행 중인지 확인하고, Approval Queue에서 필요한 승인만 처리한다.

NocoBase는 다음 역할로 제한한다.

- Agent-readable/writable internal shell
- source-of-truth records over PostgreSQL
- task, handoff, approval, memory, BPR audit log
- internal monitor backend (Executive Monitor + Approval Queue)
- quick admin/debug view

NocoBase page UI를 Founder의 최종 제품 경험으로 고도화하지 않는다.

## Current Technical State — MVP Phase 1-5 완성 + 검증

**구현 검증 (May 27, 2026 - Hardening Pass):**

- ✅ `packages/l5-core` orchestration 완성 — 110 tests across 13 suites, all PASS
- ✅ `@l5/core` typecheck 통과 (0 errors)
- ✅ `@l5/core` unit tests: 13 suites / 110 tests (Phase 0-5 complete)
- ✅ Executive Agent Handlers 구현 완료:
  - CMO: PMF message experiment draft (D3 risk, approval_required)
  - CRO: Sales workflow draft (D4 risk for customer-facing)
  - CPO: Productization readiness check (D2)
  - CTO: Tool request review + PMF gate enforcement (D2-D4)
  - COO: Delivery workflow (D2)
  - CFO: Financial commitment (D5)
  - RiskQA: Risk validation + PII check + blocking authority (D2-D5)
- ✅ AgentOutput protocol 구현: flat interface, 14 required fields
- ✅ Handler validation: missing field detection built in
- ✅ PostgreSQL orchestration schema:
  - 4 tables: founder_instructions, ceo_interpretations, agent_tasks, agent_handoffs
  - 11 indexes + foreign keys
  - RLS policies: l5_agent (full access), l5_founder (read-only)
- ✅ NocoBase plugins: plugin-orchestration (8 endpoints), plugin-executive-monitor (3 endpoints)
- ✅ Orchestration flow verified:
  - Chat submit → FounderInstruction saved → CEOInterpretation → AgentTask[] → Monitor/Approval Queue
  - executeAgentTask() routes to handler, validates output, builds handoff
- ✅ Smoke tests passing: authenticated chat, task creation, monitor query, approval queue
- ✅ Migration idempotent: fresh DB + existing DB both pass

## Latest Regression QA — Antigravity Founder UI Pass

**검증 시점:** 2026-05-27 14:52 KST  
**목적:** Antigravity가 업데이트한 Founder-facing UI가 runtime, schema, approval safety, memory safety를 깨지 않았는지 최종 회귀 확인.

**검증 범위:**

- Executive Monitor Phase View
- Approval Queue readability
- Founder Brief preview
- Memory Candidate Review surface
- `protocol.ts`, `executeAgentTask()`, Executive runtime tests, authenticated NocoBase smoke flow와의 호환성

**발견 및 수정:**

- Monitor/Founder Brief UI가 `/api/monitor/currentTasks`를 호출하고 있었으나, 실제 NocoBase action route는 `/api/monitor:currentTasks`였다. UI fetch 경로를 수정했다.
- `plugin-executive-monitor` server 응답이 UI가 렌더링해야 하는 `risk_level`, `phase`, `source_ref`를 누락하고 있었다. `currentTasks`, `blockedTasks`, `approvalQueue` 응답에 세 필드를 추가했다.
- Approval Queue parsing에서 `any`가 stale field name을 가릴 수 있어 `unknown` 기반 guard로 좁혔다.
- Memory Candidate Review는 승인 대기 항목만 보여야 하므로 `approval_status === 'pending'` 후보만 표시하도록 제한했다.
- Approval Queue와 Memory Review의 action 버튼은 여전히 read-only alert만 수행한다. 실제 승인/저장 실행은 backend gate 구현 전까지 연결하지 않는다.

**검증 명령 결과:**

```bash
corepack pnpm --filter @l5/core typecheck
# PASS

corepack pnpm -r typecheck
# PASS

corepack pnpm --filter @l5/core test -- --runInBand
# PASS: 13 suites / 110 tests

corepack pnpm exec tsc -p apps/nocobase/packages/plugins/@l5/plugin-executive-monitor/tsconfig.json --noEmit
# PASS

corepack pnpm exec tsc -p apps/nocobase/packages/plugins/@l5/plugin-orchestration/tsconfig.json --noEmit
# PASS
```

**조건부/환경 이슈:**

- `corepack pnpm smoke:nocobase-auth`는 `localhost:13000`에 NocoBase 서버가 떠 있지 않아 `fetch failed`로 중단됐다. `curl`로도 port 13000 연결 실패를 확인했다. 제품 로직 실패가 아니라 로컬 런타임 미기동 상태다.
- `corepack pnpm -r --if-present lint`는 `@l5/core`에 ESLint config가 없어 실패했다. 현재 UI 회귀와 무관한 tooling gap이다.
- `docker compose ps`는 현재 환경에 `docker` 명령이 없어 실행 불가했다.

**현재 verdict:** Conditional Pass. Core/runtime/type contracts는 통과했고, UI contract mismatch는 수정 완료. Authenticated NocoBase smoke는 서버 기동 후 재실행 필요.

## Implementation Source Of Truth

**Fully Implemented:**
- `packages/l5-core/src/functions/executive-runtime/` — protocol.ts + 7 handlers (CMO, CRO, CPO, CTO, COO, CFO, RiskQA)
- `packages/l5-core/src/functions/ceo-orchestration/` — CEO agent orchestrator (interpret, decompose, assign, summarize)
- `/api/chat:submitInstruction` — endpoint that executes full flow: FounderInstruction → CEOInterpretation → AgentTask[] (with status tracking)
- `apps/nocobase/migrations/20260526000000_create_orchestration_tables.sql` — hardened migration (idempotent, fresh+existing DB safe)
- Orchestration API endpoints (8 in plugin-orchestration, 3 in plugin-executive-monitor)
- RLS policies: `l5_agent` (full access), `l5_founder` (read-only)

**Partially Implemented / Placeholder:**
- `services/agent-runtime/` — Mastra integration placeholder (not yet connected to CEO orchestrator)
- `services/hermes-runtime/src/loops/*` — Hermes loop scaffold (structure exists, not yet live)
- Brief generation (Founder Brief templates documented, auto-generation in Chief of Staff not yet wired)
- Memory entry workflow (insight_to_record field exists, approval/persist flow not yet implemented)

**Not Yet Implemented:**
- Chief of Staff brief auto-generation (Hermes integration)
- Real Claude/Mastra LLM calls in CEO orchestrator
- PMF scoring integration (policy documented, not enforced)
- Tool request workflow
- BPR phase transition enforcement

## What Was Recently Fixed & Completed

**Phase 1: Orchestration Schema & API (Complete)**
- FounderInstruction, CEOInterpretation, AgentTask, AgentHandoff 4개 타입 정의
- plugin-orchestration: 8개 API endpoints (CRUD + query)
- PostgreSQL 4개 테이블 + 5개 인덱스 + RLS policies

**Phase 2: CEO Agent Orchestrator (Complete)**
- interpretFounderInstruction(): LLM call + AGENT_PROTOCOL format
- decomposeIntoWorkstreams(): domain-based workstream routing
- assignExecutiveTasks(): CMO/CRO/CPO/CTO/COO/CFO/RiskQA 자동 할당
- summarizeAgentStatus(): 회사 상태 합성 + Founder brief 생성

**Phase 3: Executive Agent Runtime (Complete + Implemented)**
- executeAgentTask() framework + 7개 handler 구현 (stubs가 아님)
- AgentOutput protocol 구현 (14 required fields, flat structure)
- Handler validation: validateOutput() detects missing required fields
- All handlers return HandlerResult with:
  - status: completed | needs_review | blocked
  - created_tasks: agent task candidates
  - output: AgentOutput
  - handoff: AgentHandoff (auto-generated via buildHandoff())
  - approval_required, blocked, risk_level
- AgentHandoff 자동 생성 (buildHandoff() utility)

**Phase 4: Executive Monitor (Complete)**
- plugin-executive-monitor: read-only UI + 3개 API endpoints
- Agent별 current task, source instruction, status, blocker 표시
- blocked/approval-required 필터 및 자동갱신

**Phase 5: Approval Queue & Hermes (Complete)**
- Approval Queue: approval_required task 조회/승인/거절
- stalled-task-detector: 1시간마다 blocked/overdue task 감시
- approval-checker: 매일 09:00 daily brief 생성
- launchd 스케줄 설정 (macOS 자동 시작)

## Complete Orchestration Flow (MVP Ready)

```text
Founder Chat Instruction
  ↓ (FounderInstruction saved)
CEO Agent Interpretation
  ├─ interpretFounderInstruction() → CEOInterpretation
  ├─ decomposeIntoWorkstreams() → workstreams
  └─ assignExecutiveTasks() → AgentTask[] (CMO/CRO/CPO/CTO/COO/CFO/RiskQA)
  ↓ (AgentTask saved)
Executive Agent Runtime
  └─ executeAgentTask(task) → AgentOutput + AgentHandoff
  ↓ (AgentHandoff saved)
Executive Monitor
  ├─ currentTasks (활성 task 조회)
  ├─ blockedTasks (차단된 task)
  └─ approvalQueue (승인필요 task)
  ↓
Founder Approval
  ├─ approve → task.status = done
  └─ reject → task.status = killed
  
Hermes Monitoring (24/7)
├─ stalled-task-detector (매 1시간)
├─ approval-checker (매일 09:00)
└─ daily-brief-generator
```

## Documentation Completed — Agent Control Tower Specs (Phase 6 Foundation)

**새로운 문서 3개 생성됨:**

1. **AGENT_PROTOCOL.md (업그레이드)**
   - Phase-based orchestration (6단계 BPR) 명확화
   - 모든 Executive Agent (CEO, ChiefOfStaff, CMO, CRO, CPO, CTO, COO, CFO, RiskQA, Culture)의 표준 output contract JSON 정의
   - Agent별 구체적인 역할, 입력, 출력, 승인 규칙 명시
   - Agent Trigger Rules 업데이트

2. **FOUNDER_BRIEF_SPEC.md (신규)**
   - Founder-facing brief 6종류 정의:
     * Daily Brief (매일 09:00)
     * Decision Brief (승인 필요 항목)
     * Approval Request (D4/D5 승인)
     * Blocked Task Alert (1시간마다 감시)
     * Phase Transition Summary (단계 변경 시)
     * Memory Candidate Review (주 1회)
     * Weekly Summary (매주 금요일)
   - 각 brief의 template, 예시, 타이밍, Founder 소비 시간 포함
   - Golden Rule: Founder가 15분 내에 결정 가능해야 함

3. **SECURITY_DATA_GOVERNANCE.md (업그레이드)**
   - D1-D5 레벨별 상세 규칙 (각 level의 definition, examples, approval, action)
   - Phase-based approval gate matrix
   - Agent별 승인 권한 명시
   - External action safety checklist (10단계)
   - PMF-Gate Rules: tool build, productization은 PMF 신호 없으면 차단
   - Memory Entry 승인 workflow
   - RiskQA override authority (unsafe D3-D5 block 권한)

## Session 1 (May 27) — Codex Hardening + Docs Sync Complete ✅

**Completed:**

1. ✅ **Codex Hardening Pass**
   - protocol.ts: AgentOutput flat interface finalized (14 fields)
   - All 7 handlers: Actual implementation (not stubs)
   - Migration: Idempotent, both fresh and existing DB pass
   - Tests: 110/110 passing (13 suites)
   - Smoke: authenticated chat + monitor + approval queue working

2. ✅ **Documentation Synchronization**
   - AGENT_PROTOCOL.md: Updated with actual AgentOutput structure
   - FOUNDER_BRIEF_SPEC.md: Memory section corrected (insight_to_record)
   - HANDOFF.md: Test count, handler status, current state accurate
   - TASKS.md: Phase 3-6 accurate, Phase 6a-c detailed plan added
   - IMPLEMENTATION_STATUS.md: Created (12 impl + 3 partial + 4 documented-only + 3 planned)

3. ✅ **Antigravity UI Regression QA**
   - Executive Monitor: Phase/Risk/Approval filtering ✅
   - Founder Brief Preview: Task aggregation ✅
   - Approval Queue: Action buttons (read-only for now) ✅
   - Memory Review: Pending items display ✅
   - API route fixes: /api/monitor:currentTasks correction
   - Response payload fixes: risk_level, phase, source_ref added
   - Type safety: `any` → `unknown` guard improvements

4. ✅ **Key Mismatches Corrected**
   - Handler status: "stubs" → "fully implemented"
   - Test count: 98 → 110 tests
   - AgentOutput: nested JSON → flat TypeScript interface
   - Memory: struct approval → insight_to_record string + template
   - Brief gen: "complete" → "templates done, wiring incomplete"

---

## Next Development Goal (Phase 6+)

**3-4 Days to Beta Ready**

### Phase 6a: Chief of Staff Brief Auto-Generation (Priority 1)
**Why:** Founder needs daily visibility into parallel work  
**Work:**
- [ ] Chief of Staff handler: Aggregate currentTasks → Daily Brief format
- [ ] Hermes Trigger.dev: Schedule brief generation at 09:00 daily
- [ ] Brief delivery: Format per FOUNDER_BRIEF_SPEC.md (markdown → NocoBase/Slack)
- [ ] Tests: Verify brief includes moved/blocked/approval-queue items

**Success Criteria:**
- ✅ Daily Brief auto-generates at 09:00
- ✅ Includes: moved tasks (completed), blocked (>1h), approval queue, recommendations
- ✅ Founder can read brief in < 3 min

**Unblocks:** Approval queue auto-population, Founder monitoring loop

### Phase 6b: Approval Queue Auto-Routing (Priority 1)
**Why:** Risk gates currently manual → automate to prevent silent risk  
**Work:**
- [ ] Task submission: Detect risk_level in executeAgentTask()
- [ ] D3 routing: Add to approval queue, flag for 24h auto-approve
- [ ] D4 routing: Add to approval queue, require manual Founder approval
- [ ] D5 routing: RiskQA review first, only show to Founder if safe
- [ ] Hermes: D3 auto-approve after 24h if not rejected
- [ ] Tests: Verify no D3-D5 task executes without approval

**Success Criteria:**
- ✅ All D3-D5 tasks route to Approval Queue
- ✅ D3 auto-approves in 24h (unless Founder rejects)
- ✅ D4 requires manual Founder approval (blocking)
- ✅ D5 blocked by RiskQA until safe + Founder approves

**Unblocks:** Safe external action flow, compliance gates

### Phase 6c: Memory Entry Persistence (Priority 2)
**Why:** Insights captured in insight_to_record, but not saved → learning loop broken  
**Work:**
- [ ] Collection: Gather insight_to_record from all agent outputs
- [ ] Weekly review: Chief of Staff creates Memory Review brief (Fri)
- [ ] Founder approval: Read-only review + SAVE/DISCARD decision
- [ ] Persistence: Founder SAVE → insert to founder_memory table
- [ ] Retrieval: CEO orchestrator can query memory for context in future phases
- [ ] Tests: Verify memory persists across sessions

**Success Criteria:**
- ✅ Weekly memory review brief auto-generated
- ✅ Founder can SAVE/DISCARD insights
- ✅ Saved insights stored in founder_memory
- ✅ CEO can query memory for context

**Unblocks:** Company learning loop, long-term decision context

---

## Phase 7 — Future Work (After Phase 6)

### 7a: Real Claude API Integration
- Replace stub LLMClient with Anthropic SDK
- CEO orchestrator makes real Claude calls for interpretation
- Structured output parsing for CEOInterpretation

### 7b: BPR Phase Manager
- Track current_phase, progress_%, success_criteria
- Gate phase transitions on success criteria
- Phase-specific approval rigor

### 7c: PMF Scoring Integration
- Implement PMF score calculation in l5-core (Phase 8 docs)
- Enforce PMF gate in CTO/CPO handlers
- Block premature tool build/productization

### 7d: Tool Request Workflow
- Detect repeated tasks (repetition signal)
- Auto-generate tool request form
- Gate on PMF score + manual validation

---

## How to Continue (Next Session)

**Immediate:**
```bash
# Verify current state
corepack pnpm validate
corepack pnpm --filter @l5/core test -- --runInBand
corepack pnpm -r typecheck

# Review docs
cat docs/IMPLEMENTATION_STATUS.md  # Status matrix
cat docs/AGENT_PROTOCOL.md         # Actual AgentOutput structure
cat docs/FOUNDER_BRIEF_SPEC.md     # Brief templates
```

**Phase 6a Start:**
1. Implement Chief of Staff handler in `packages/l5-core/src/functions/executive-runtime/handlers/chief-of-staff-handler.ts`
2. Wire Hermes trigger at `/services/hermes-runtime/src/tasks/daily-brief-generator.ts`
3. Test: Brief aggregates currentTasks + blockedTasks + approvalQueue

**Phase 6b Start:**
1. Update executeAgentTask() to route D3-D5 to approval queue
2. Implement Hermes D3 auto-approve in approval-checker
3. Test: All D3-D5 tasks blocked until approval

**Key Files to Watch:**
- `packages/l5-core/src/functions/executive-runtime/` — handler implementations
- `apps/nocobase/migrations/20260526000000_create_orchestration_tables.sql` — schema
- `scripts/smoke-nocobase-authenticated.ts` — end-to-end test
- `docs/IMPLEMENTATION_STATUS.md` — status tracker

## How to Continue

**로컬 테스트:**
```bash
cd /Users/wonminyang/Desktop/pulk
corepack pnpm validate
corepack pnpm demo

cd apps/nocobase-app
yarn start  # NocoBase 서버 실행 (port 13000)

# 플러그인 로드 확인 후 다음 테스트
curl -X POST http://localhost:13000/api/founder_instructions:create \
  -H "Content-Type: application/json" \
  -d '{"raw_text":"Test instruction","source":"chat"}'

curl -X POST http://localhost:13000/api/chat:submitInstruction \
  -H "Content-Type: application/json" \
  -d '{"raw_text":"Create a PMF message experiment and customer outreach proposal","intent":"CEO chat smoke"}'

curl http://localhost:13000/api/monitor:currentTasks
curl http://localhost:13000/api/monitor:blockedTasks
curl http://localhost:13000/api/monitor:approvalQueue
```

**코드 위치:**
- Core orchestration: `/packages/l5-core/src/functions/ceo-orchestration/`
- Executive runtime: `/packages/l5-core/src/functions/executive-runtime/`
- NocoBase plugins: `/apps/nocobase/packages/plugins/@l5/plugin-orchestration/` 및 `/plugin-executive-monitor/`
- Hermes integration: `/services/hermes-runtime/src/`

## Data Contracts To Add

### FounderInstruction

```ts
type FounderInstruction = {
  id: string;
  raw_text: string;
  source: 'chat' | 'manual' | 'import';
  intent?: string;
  constraints?: string[];
  requested_phase?: string;
  status: 'new' | 'interpreted' | 'in_progress' | 'closed';
  created_at: string;
};
```

### CEOInterpretation

```ts
type CEOInterpretation = {
  id: string;
  instruction_id: string;
  goal: string;
  assumptions: string[];
  phase: 'direction_alignment' | 'pmf_diagnosis' | 'execution_build' | 'sales_distribution_test' | 'productization_review' | 'scale_automation';
  success_criteria: string[];
  risk_level: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
  approval_required: boolean;
  created_at: string;
};
```

### AgentTask

```ts
type AgentTask = {
  id: string;
  instruction_id: string;
  interpretation_id?: string;
  assigned_agent: 'CEO' | 'ChiefOfStaff' | 'CMO' | 'CRO' | 'CPO' | 'CTO' | 'COO' | 'CFO' | 'RiskQA' | 'Culture';
  title: string;
  rationale: string;
  expected_output: string;
  status: 'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed';
  approval_required: boolean;
  risk_level?: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
  phase?: 'direction_alignment' | 'pmf_diagnosis' | 'execution_build' | 'sales_distribution_test' | 'productization_review' | 'scale_automation';
  source_ref?: string;
  blocker?: string;
  due_at?: string;
  created_at: string;
  updated_at: string;
};
```

### AgentHandoff

```ts
type AgentHandoff = {
  id: string;
  task_id: string;
  from_agent: string;
  to_agent?: string;
  context: string;
  next_action: string;
  blocker?: string;
  approval_required: boolean;
  created_at: string;
};
```

## Non-Goals For The Next Iteration

- Do not polish NocoBase pages as the main product UI.
- Do not build complex dashboards before task/handoff contracts are stable.
- Do not add external autonomous execution before approval gates are enforced.
- Do not create tools before PMF/repetition signals exist.

## Recommended Implementation Order

1. Data model and API contracts.
2. CEO Agent orchestration over those contracts.
3. Minimal monitor view.
4. Approval queue.
5. Hermes stalled-task/approval checks.
6. BPR and Memory updates from completed tasks.

---

## CTO Harness / ACR Kernel 계약 레이어 (2026-06-06, 브랜치 cto/acr-kernel-harness)

- pulk CTO = source of truth, ACR = 실행 커널 원칙을 코드 계약으로 고정. PRD `FINAL_pulk_cto_acr_kernel_harness_agent_team_prd.md`의 pulk 측 1차 구현 범위(타입·복잡도 라우터·가드·프롬프트 빌더·Agent Team router) 완료.
- 위치: `packages/l5-core/src/functions/cto-harness/` (8 모듈 + 7 테스트 스위트, 216 테스트 GREEN, tsc 0). 루트 `index.ts`에 export 1줄 추가.
- 실제 worktree 실행/HTTP API/ACR UI는 별도 저장소 agent-control-room 책임 — pulk에 중복 구현하지 않음(상세 docs/ACR_KERNEL_REFACTOR_PLAN.md).
- CMO 작업과 완전 분리(공유 파일 충돌 없음). 커밋 시 cto-harness/·index.ts·신규 문서 2개만 선택 add 권장(CMO 미커밋 변경분 제외).
- 다음 단계(선택): hermes acr-client.ts에 buildWorkOrder→ACRIntent 어댑터 배선, founder-ui control-room에 ExecutionRun 상태 표시.

---

## CTO×ACR Kernel×Harness×Agent Team 풀구현 (2026-06-06, dynamic phased workflow 8단계)

PRD `FINAL_pulk_cto_acr_kernel_harness_agent_team_prd.md` MVP **완료(PASS)**. 판정 리포트: `docs/CTO_ACR_PRD_COMPLETION.html`.

- **ACR repo**(agent-control-room, 브랜치 feat/runner-verify-merge-phase123) 신규 실행 커널 — 전부 additive, 111 WIP 불가침:
  - `b8ecacd` ExecutionRun API(§8/§9): lib/execution-run/*, lib/storage/execution-run-store, app/api/execution-runs/{,[run_id],/result}
  - `9cc7474` Worktree+Boundary(§12): lib/worktree/{worktree-manager,boundary-check,run-worktree}
  - `0556c9e` Harness 코어(§13/§14/§15): lib/harness/{types,verification-runner,command-guard,handoff-generator,playwright-artifact,harness-pipeline}
  - `d3dca52` Context Harness(§14.7)+command-guard PreToolUse hook(§19.1): lib/harness/context-harness, scripts/hooks/command-guard-hook.mjs
- **pulk repo**(브랜치 cto/acr-kernel-harness):
  - `fa69570` Agent Team 라이브 배선(§29)+execution-runs 클라이언트+Control Room §18.1 UI(checks/history/retry·review/ComplexityBadge)
  - `7243ec4` Context Tax 인덱스(docs/index)+HARNESS_UTILIZATION 매핑
- **QA/E2E**: ACR our-tests 124/124 + next build PASS, pulk l5-core 1414/1414·agent-runtime 16/16·founder-ui build PASS·control-room E2E(clean dev) PASS, ACR smoke PASS.
- **잔여 통합 단서(4)**: ① runner-adapter thin(실 CLI 실행 트리거 1스텝 남음, 인터페이스 완비) ② cto.ts 라이브는 현재 solo run(다중feature 입력시 팀런 가동) ③ retry 버튼은 /api/monitor:retryRun 서버액션 필요(graceful degrade) ④ .claude/rules·settings.json은 양 repo gitignore(로컬 동작).
- **사용자 WIP 오류 2건(미수정)**: ACR quota-tracker-file.test.ts:27 / runner-prepare-finalize.test.ts:77 TS2352 — 111 WIP라 분리 원칙대로 미수정.
