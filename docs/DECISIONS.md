# DECISIONS — L5 Business OS

## 2026-06-11 — 임원 호출 = `.claude/agents` 서브에이전트, 텔레그램 실행기 = 헤드리스 claude CLI

**컨텍스트**: 사장님 요구 — `@cto`/`@cmo`로 임원을 호출해 "실제 작업 + 파일 회신"을, 이 세션뿐 아니라 **텔레그램에서**도. 기존 자산: `services/agent-runtime/src/agents/*.ts`(임원별 SYSTEM_PROMPT, 단 `runXAgent()`는 판단 JSON만 반환), CMO 영상 풀 파이프라인(`packages/l5-core/.../video-room/`, 실제 `video.mp4`까지 — 단 렌더는 외부 `ai-slide-video-factory`가 `npm run render`로 수행), 텔레그램 **아웃바운드만**(`hermes-runtime/.../notifier/telegram.ts`).

**결정 1 — 임원 호출 = Claude Code 서브에이전트**: `.claude/agents/<id>.md` 9종(ceo/cmo/cto/cpo/cro/coo/cfo/chief-of-staff/risk-qa)으로 정의. 각 페르소나는 agent-runtime SYSTEM_PROMPT + rules 가드레일을 반영. 이유: 서브에이전트는 파일 생성·bash·영상 렌더·ACR 디스패치 등 **실제 작업**이 가능(runXAgent의 JSON-only 한계 회피). 도메인 로직은 l5-core/agent-runtime에 그대로 두고, 서브에이전트는 그 위의 대화·실행 인터페이스 레이어로 한정(UI/플러그인에 도메인 하드코딩 금지 규칙 유지).

**결정 2 — 텔레그램 인바운드 실행기 = 헤드리스 `claude -p`**: 신규 `services/telegram-gateway`가 getUpdates 폴링→`@임원` 파싱→`claude -p`로 해당 서브에이전트 구동→결과/파일 회신. 대안(텔레그램→`runXAgent()` 직접 호출)은 판단 JSON만 나와 "실제 작업+파일" 미충족이라 배제. 봇은 사장님 맥 상시 구동(launchd KeepAlive) — 레포·claude CLI·영상 팩토리가 그 맥에 있어야 실행 가능. 허용 chat id 밖 메시지는 무시(보안). 시크릿은 env 전용(plist 하드코딩 금지).

**결정 3 — `.claude/agents/` git 추적**: 기존 `.gitignore`는 `.claude/*` 전부 무시(+`rules/`만 예외). 임원 정의는 팀 공유 설정이므로 `!.claude/agents/` 예외 추가해 추적. `.telegram-runs/`(런별 산출물 임시)는 무시.

**검증**: telegram-gateway tsc 0 / build OK / jest router 10/10. **라이브 end-to-end(실 봇 토큰)는 사장님 맥에서 install.sh 후 확인 필요**(샌드박스 제약).

## 2026-06-09 — CMO PRD v3 정본: video-room 도메인 유지 + orchestrator 얇은 레이어 (트랙 B)

**컨텍스트**: CMO 콘텐츠 전략 시스템 v3(PRD `docs/prd/cmo-content-strategy-v3.md`, 10 Phase)를 ACR로 구현하다 "built-but-not-wired"로 멈춤. 코드 조사 결과 **두 갈래가 중복 병존**: 기존 `video-room/`(25단계 v3.1, 509테스트, thumbnail/intro/script/voice/brief 등 도메인 함수·타입 대부분 완비)와 신규 `cmo-orchestrator/`(PRD v3 재설계, 인프라 + PoC 스킬 2개만). Key Content 11스텝은 video-room에 구현됐으나 orchestrator에 미등록(고립), types 5/10. **정본을 안 정하면 트랙 B가 또 중복 생산.**

**결정**: **정본 ① — `video-room/`을 CMO 도메인 정본으로 유지하고, `cmo-orchestrator/`는 스킬 선택·순서·승인게이트만 지휘하는 얇은 레이어로 둔다.** 각 AgentSkill = video-room 순수함수를 호출하는 5~15줄 어댑터. 사장님 방향("기존 자산 최대한 활용")에 정합. 대안 ②(orchestrator로 모든 로직 이전)는 509테스트 + NocoBase/UI 배선 전체 마이그레이션이라 위험·시간 과다로 배제. 대안 ③(두 구조 분리 유지)는 중복 영속이라 배제.

**범위/실행**: 전체 10 Phase end-to-end 정렬. 진짜 신규는 P4(Pulling 12스텝)·P5(Viewtrap 풀링: 핫비디오/노출확률/롱테일)·P6(Content Strategy Package 조립)·P10(slide-deck LLM 생성부)뿐 — 타입은 types.ts에 이미 존재. 나머지는 기존 자산 재활용 + 얇은 스킬 래핑. sub-agent agent team + Workflow로 Stage1(도메인 병렬)→Stage2(스킬 병렬)→Stage3(직렬 통합 배선)→Stage4(검증). 공유 파일(배럴·registry·types.ts)은 Stage3 단일 agent 직렬 병합으로 충돌 방지. 트랙 A(CTO `cto-*`/agent-runtime)와 파일 경계 분리 병렬 — 같은 날 트랙 A가 신설한 `integrate` phase를 트랙 B는 Stage3로 수동 실행한 셈으로 정합.

**검증**: l5-core typecheck 0, `jest video-room cmo-orchestrator slide-deck` 53 suites/692 tests GREEN(이전 509 → +183, 회귀 0). 구버전 `video-room/pulling-content.ts`(5세트 퍼널)는 신규 `pulling-content-planning.ts`(12스텝)와 병존 — 후속 정리 시 @deprecated 위임 명시 권장.

**남은 것(라이브)**: NocoBase plugin-orchestration cmo 액션 노출 + founder-ui /video-room 연결 + 실 DB E2E(헤드리스 불가, 별도 세션). 미커밋.

## 2026-06-09 — CTO SOP에 integrate(통합·배선) phase 신설: "built but not wired" 차단

**컨텍스트**: 사장님 — ACR 기반 자동 개발에서 산출물이 "절반에서 멈추고 연결 안 된" 채 흩어진다. 신규 `cmo-orchestrator/`가 phase 단위로 일부만 생기고 orchestrator·기존 자산에 배선되지 않은 채 멈췄는데 빌드는 GREEN(typecheck 0, key-content 59/59). 근본 원인 = CTO dev-workflow SOP(FEATURE: research→spec→test→implement→review→commit)에 "통합/배선" 단계가 1급으로 없다. implement 합격기준이 "테스트 green + 변경 범위 한정"뿐이라, 새 파일이 진입점에 등록되지 않아도 고립 완료로 처리된다. verifier도 `changed_files>0`면 pass라 고립을 못 잡는다. 방향: ACR 레일 유지 + CTO 파이프라인 개선(사장님 확정, 트랙 A). CMO PRD v3 재구축은 사장님이 직접(트랙 B, "기존 video-room 위에 v3 orchestrator 얇게 얹기").

**결정**: FEATURE/BIG_CHANGE SOP에 implement와 review 사이에 `integrate`(통합·배선) phase를 신설한다. read_only=false, tier=T1(claude — 진입점·등록처를 정확히 찾는 코드베이스 정합 판단). 합격기준 = ① 신규 산출물이 기존 진입점(orchestrator/registry/배럴/라우터)에 실제 등록·연결 ② 기존 자산과 중복 없이 정렬(구버전 병존 시 대체/위임 명시) ③ 기존 통합/E2E 경로에서 호출 가능 ④ 새 파일만 추가하고 기존 진입점 수정 0인 고립 금지. implement 합격기준에도 "동일 책임 기존 자산 우선 재활용·중복 구현 금지"를 추가. verifier에 integrate 고립 룰: 무변경=fail, (ACR가 `modified_existing_files` 제공 시) 새 파일만 추가=orphaned fail. SMALL_FIX/TINY는 단일 파일 가정으로 integrate 미적용.

**배제/범위**: integrate의 "진짜 고립"(새 파일만, 기존 수정 0) 정밀 판정은 ACR runner가 phase 콜백에 `modified_existing_files`를 줘야 완성 → **2026-06-09 배선 완료**: ACR `file-boundary.ts countModifiedExistingFiles`(porcelain 신규/기존 구분) + `finalize-phase-execution.ts`가 콜백 body에 `changed_files`/`modified_existing_files` 적재, pulk `plugin.ts`(src+dist)가 verifyCTOPhase에 전달. verifier의 all_done 전용 한계도 같은 날 해소: `isIntegratePhaseName`+`verifyIntegratePhase`(고립 전용 결정적, LLM·task-expected 불요)를 추가하고, plugin 콜백이 `phase_complete && integrate`면 그 phase **단독** diff로 고립을 즉시 판정(각 phase가 commit 후 콜백→worktree clean이라 phase 단독). all_done은 기존 LLM 검증 유지. verifier는 입력 있으면 활용, 없으면 graceful. `model-routing.test.ts` 4건은 2026-06-07 implement T2→T1 전환 시 미갱신된 사전존재 드리프트(본 변경과 무관, 미수정). cto.test.ts의 `no LLM` runtime 단언은 그 드리프트로 사전 실패 상태였고, dist 재빌드로 7-phase가 반영되며 실제 라우팅(전부 claude, commit만 antigravity)으로 정정.

**검증**: l5-core cto-design/cto-verification 관련 전부 GREEN(integrate 신규 테스트 포함), typecheck 0. agent-runtime cto.test 11/11(dist 재빌드로 7-phase 반영; deterministic/LLM-planner/fallback 경로 모두). 전체 회귀 0 — l5-core 5 failed는 baseline과 동일(사전존재: model-routing 4 + cmo-v3 미완 1). 미커밋, 라이브 반영은 nocobase/agent-runtime kickstart 시.

## 2026-06-06 — CMO 세컨브레인 자가개선 루프: 데이터층(자동) / 코드층(승인된 CTO) 분리

**컨텍스트**: 사장님 — 비즈니스 PT 정보가 세컨브레인에 매주 쌓일 텐데, 그에 맞춰 CMO 작업 방식이 진화해야 한다. 제안: "하루 한 번 세컨브레인에 CMO 운영전략 업그레이드 거리가 있나 확인 → 있고 변경범위 크면 CTO에게 task → 종(🔔)알림에서 사장님이 승인/거절". 코드 조사 결과 인프라의 ~80%가 이미 존재(`self-learning.ts` 일일 diff+조용한 알림 패턴, `acr-client.ts` CTO 의뢰, founder 승인 게이트/알림벨). 단, 현 CMO 챗은 세컨브레인을 **특정 단계에서만** 조회(첫 대화 strategy_chat·원고·제작·발행 제외)했고, CMO 결과를 학습하지 않았다.

**결정**: "스스로 업그레이드"를 **두 층으로 분리**한다.
1. **데이터층(자동·무위험·지금)** — 신규 PT 인사이트의 대부분은 코드 변경 없이 다음 작업부터 읽혀야 한다. read-path를 전 단계로 확장. **Phase A 완료**: `l5-core/video-room/second-brain-query.ts`의 `secondBrainQueryForStatus(status)`(23단계 전수 매핑, strategy_chat 포함, completed만 null) + 단위테스트. plugin chatMessage의 하드코딩 맵 제거→이 함수 사용. graceful(조회 실패/무히트 시 무시).
2. **코드층(승인된 CTO·나중·고위험)** — PT 정보가 CMO의 *작업 방식 자체*(새 단계/산출물/쿼리 카테고리/게이트 규칙)를 바꿔야 할 때만 CTO task. **반드시 사장님 승인 게이트 통과 후에만 실행**(거절 시 폐기), 승인 후에도 **기존 테스트(E2E 등) 통과해야 머지**. 이것이 사장님 최우선 요구.

**구현 계획**:
- **Phase B(일일 감시)**: Hermes `self-learning` 패턴 복제 → 세컨브레인 biz의 PT 항목 일일 diff(스냅샷 비교) → 신규 있으면 "오늘의 PT 변화" 요약을 **founder 승인 큐(🔔)** 에 카드 생성, 없으면 조용히 skip. 위험도 D1(읽기+파일쓰기+알림).
- **Phase C(자가개조)**: B 요약 중 "구조 변경 필요" 건 → CTO task 초안 + 영향범위를 승인 항목으로 → 사장님 **승인** 시 `acr-client`로 ACR 디스패치(worktree·테스트·PR), **거절** 시 폐기. 위험도 D4-D5 → 승인 게이트 필수.

**원칙(불변)**: 승인 전엔 코드 한 줄도 안 바뀐다. "변경이 크다"의 자동 LLM 판정은 불안정 → B는 *요약*만 띄우고 사장님이 🔔에서 "CTO에게" 버튼을 누르는 **반자동**이 기본, 완전 자동 분류는 신뢰 축적 후. 도메인 판단 로직은 `l5-core`, plugin/hermes는 배선만(CLAUDE.md).

**배제/보류**: YouTube API 영상 반응 데이터(진짜 학습 신호)는 후속 — 들어오면 Phase C의 가치 ↑. 현재 세컨브레인 PT 인사이트가 적어 Phase A의 즉효는 작지만 "수도꼭지를 먼저 단다".

**구현 완료(2026-06-06)**: Phase B 래퍼(`cmo-strategy-watch.ts`)·Phase C 배선 코드화. **핵심 결정 — 새 🔔 surface를 만들지 않고 기존 tool-requests 카드 surface를 재사용**: Phase B는 변화 감지 시 CTO tool-request 카드를 `source_ref:secondbrain-watch:<date>`로 생성하고, executive-monitor `toolRequests` 필터를 `repetition-pattern:%` 단독 → `(repetition-pattern:% OR secondbrain-watch:%)`로 한 줄 확장. 이렇게 하면 [CTO에게 전송]→`sendToCTO`→`applySelfMod`/`rollbackSelfMod`(2단계 승인) 전 체인이 source_ref에 무관하게 그대로 작동 → 신규 UI/액션 0. 추가 안전장치로 **첫 실행 베이스라인 가드**(빈 스냅샷 시 1059건 노이즈 알림 방지, 둘째 실행부터 실제 변화만 보고)를 래퍼에 둠(코어는 순수 유지). 라이브 활성화(launchd load + nocobase 재기동)는 수동 단계로 분리.

---

## 2026-06-05 — CTO 파이프라인 결정적화 우선 + ACR 브랜치 생명주기 정리

**컨텍스트**: CTO 자율개발 파이프라인이 느린 진짜 원인은 코딩이 아니라 ① 과한 LLM 의존(이미 결정적인 분류/템플릿이 있음에도 phase 생성마다 LLM 2회 시도 + LLM이 분류를 덮어씀), ② verifier가 변경 0인 코드 phase를 통과시키는 false-positive, ③ 죽은 모델 tier로 계속 라우팅, ④ D3마다 LLM 호출이었다. 또한 ACR이 phase마다 `acr/l5-*` 브랜치를 만들고 정리하지 않아 로컬 291·원격 25개가 쌓였다.

**결정**:
1. **결정적 우선(determinism-first)**: phase 생성은 `classifyTask`+템플릿이 기본(`ACR_DETERMINISTIC_PHASES`), LLM은 opt-in 안전망. 분류는 결정적 함수가 권위이며 LLM이 덮어쓰지 못한다. D3 판정도 명백 케이스(외부/매출=escalate, 내부/read-only=pass)는 결정적, 회색지대만 LLM. 모든 scoring 규칙은 단위테스트 동반(규칙3).
2. **verifier 신뢰성**: 코드 산출 기대 phase가 `changed_files=0`이면 exit 0이어도 fail+retry. 코드 신호가 read-only 힌트보다 우선.
3. **쿼터 인지 라우팅**: `resolveModel`이 소진 tier를 우회(quota-tracker.json 주입, 없으면 전 tier 가용).
4. **ACR 브랜치 생명주기**: 근본은 ACR이 머지 후 phase 브랜치를 삭제하는 것(B6/B7과 함께). 그 전까지 `scripts/git-acr-cleanup.sh`가 머지+N일 경과분을 정리하는 안전망.

**배제/보류**: 라이브 ACR repo의 per-phase 모델 배선(B6)·잡큐 오케스트레이션(B7)은 라이브 시스템 + CMO 병렬 디스패치와 겹쳐 별도 세션에서. nested repo(`ai-slide-video-factory`)는 .gitignore 보호만, 구조 전환은 보류.

---

## 2026-06-04 — State Machine 25개 상태 전환 검증: 라이브러리 도입 안 함 (build)

**컨텍스트**: 프로젝트 전체에 15+ 엔티티 타입, 약 25개 이상의 상태 전환이 분산(AgentTask 6상태, Business 10상태, Workflow 6상태, BPR 6단계, ToolRequest 6상태 등). 현재는 순수 함수(`validateTransition`, `openConsultation`→`resolveConsultation`, `runDelegationLoop` 등)로 전환을 관리하며 Jest 단위 테스트로 검증. 외부 라이브러리 도입 여부를 조사했다.

### 비교표

| 항목 | XState v5 | Robot (robot3) | typescript-fsm 류 | 현행 (hand-rolled) |
|------|-----------|---------------|-------------------|-------------------|
| npm 주간 다운로드 | ~1.2–4.3M | ~150–180K | 수백 | — |
| 번들 크기 (min+gz) | ~16.7 kB | ~1.2 kB | ~1–2 kB | 0 (자체 코드만) |
| TypeScript 네이티브 | ✅ TS 5.0+ 필수 | ❌ d.ts 래퍼 | ✅ (일부) | ✅ 완전 제어 |
| 라이센스 | MIT | MIT | MIT | — |
| 런타임 필요 | ✅ actor 인터프리터 | ✅ 인터프리터 | ✅ | ❌ 순수 함수 |
| 선형+분기 FSM | ✅ + 계층/병렬 | ✅ | ✅ | ✅ |
| 테스트 편의 | @xstate/test v5 미완성 | 없음 | 없음 | Jest 직접 |
| 학습 곡선 | 높음 (actor model) | 중간 | 낮음 | 없음 |
| 유지보수 리스크 | 낮음 (Stately AI 상업) | 높음 (7개월 무활동) | 높음 (커뮤니티 미미) | 없음 |

### 결정: `build` — 라이브러리 도입 안 함

**채택 근거**:
1. 현행 순수 함수 패턴(`validateTransition(from, to) → {valid, reason}`)이 l5-core 설계 원칙(No I/O, 프레임워크 미결합)과 완전히 정합.
2. 25개 전환은 라이브러리가 정당화되는 규모(계층 상태, 병렬 상태, actor 부작용 오케스트레이션)에 미달.
3. XState는 번들 오버헤드(~17 kB) + actor 런타임 의존 + v5 테스트 도구 미완성. Robot/typescript-fsm은 커뮤니티·유지보수 리스크.
4. 전환 커버리지 보강이 필요하면 **타입 기반 lookup table**(`Record<From, To[]>` 선언 → TS exhaustiveness 검사)로 런타임 비용 0으로 해결 가능.

**배제 이유**:
- **XState v5**: 이 규모에 과잉. actor model + ~17 kB 번들 + 학습 곡선이 순수 함수 대비 순손실.
- **Robot**: TypeScript 비네이티브, 7개월 무활동, npm 의존 패키지 32개(생태계 미미).
- **typescript-fsm 류**: 주간 다운로드 수백, 단일 관리자 리스크, 문서 부실.

**후속**: 전환 누락이 실제 버그로 이어지면, 엔티티별 `VALID_TRANSITIONS` lookup table을 l5-core에 추가하고 TS 타입 시스템으로 exhaustiveness를 보장한다.

---
## 2026-06-05 — CMO Video Room 병렬 실행 · 내부 코딩 게이트 완화 · phase 분해 적정화

**컨텍스트**: CTO에 "Pulk CMO Video Room" PRD(28기능/158phase) 지시 → 전부 멈춤. ACR 실행엔진의 다층 고장을 고치며 자율 완주시키고, 속도 병목을 근본수정했다.

1. **병렬 실행은 격리 git worktree마다 1 plan**. 같은 worktree 병렬은 `commitAll`(git add -A)이 동시 편집을 교차오염시켜 위험 → 펄크 worktree 4개에 미시작 plan 분배(진행중 plan은 phase 누적 보존 위해 고정), worktree당 직렬·간 병렬. 단 **공유 통합 파일(Sidebar/AgentOutputDetail/페이지/package.json)은 worktree 간 분기**하여 마지막에 병합 충돌 → 다음엔 통합지점 선셋업(직렬) 후 기능 병렬.

2. **내부 D2 코딩에는 ACR 안전게이트를 적용하지 않는다**. dangerous-command-detector(단어매칭)·risk D2→D4 격상·commit/review 빈출력 차단은 "외부 위험 작업"용인데 격리 worktree 내부 코딩까지 오탐·차단하고, 차단 시 task를 'running' 고아로 남겨 데드락시켰다. → 게이트 기본 off(`ACR_DANGER_GATE`), L5승인(auto_execute) 작업은 risk 격상 통과, 비코드 phase는 `expectsChanges=false`. self-mod 보호(gate/.env)는 l5-core deny로 별도 유지. (위험도≠게이트 원칙과 정합.)

3. **phase 분해는 작업 규모에 맞춘다**. 단일 컴포넌트/카드/모델/유틸을 6단계 FEATURE로 분해하면 조사/스펙/리뷰 등 no-op phase가 토큰·시간을 2~3배 낭비. → `classifyTask`가 단일 컴포넌트류를 SMALL_FIX(4단계)로 라우팅. SOP 자체(TINY 2/SMALL_FIX 4/FEATURE 6)는 유지.

4. **오케스트레이션 락은 stale-release로 자가복구**. `planDrainLock`(인메모리)이 hung 드레인에 영구 점유돼 큐 전체가 정체하고 acr-web 재시작으로만 풀렸다 → 20분 경과 락 자동해제. **완전한 해결(inline-HTTP spawn → 파일/DB 잡 큐)은 v2**(리스크 큰 대공사, `docs/cmo/CMO_DEV_SPEED_STRATEGY.md`에 설계).

5. **JSON 스토어는 원자적 쓰기(temp+rename)**. 병렬 드레인 동시 쓰기가 `execution-logs.json`을 손상시켜 ACR 라우트 연쇄 실패 → 핫 스토어 원자적 쓰기로 손상 차단.

## 2026-06-04 — 승인 게이트 = D4/D5만 · self-upgrade는 승인 게이트로 살림 · M9(컨트롤룸 라이브화) 최우선

**컨텍스트**: 창업자가 "Phase 6만 하면 CTO/ACR이 완벽하게 도나?"를 물으며 비전(CEO기획→CTO로드맵→멀티CLI 배정→실시간 컨트롤룸→토큰 표시)을 제시. 코드 조사 결과 비전은 구조적으로 70~80% 있으나 컨트롤룸 ACR 데이터가 stub. 세 가지 결정을 기록한다.

1. **코딩 작업에 per-task Founder 승인은 불필요**. 창업자 정책 "결제+외부 메시지 발송만 승인, 나머지 허용"은 `SECURITY_DATA_GOVERNANCE.md`의 D4(고객 직접 전달 메시지: 메일 발송·가격 제시·결제 정책)·D5(법적/재정 구속: 계약·유료 구독/결제·공개 성명·임금)에 1:1 매핑된다. 코딩은 D2(내부 실행)이고 GitHub 브랜치+검증 후 머지라 브랜치가 안전장치 → 승인 게이트는 **D4/D5에만**. (위험도≠게이트 원칙과 정합: 2026-06-03 결정 유지.)

2. **self-mod 게이트는 엄격 유지하되, OS 자가 업그레이드 경로는 차단이 아니라 Founder 승인 게이트(계획 1회 승인)로 살린다**. 에이전트가 작업 중 필요·문제를 감지(예: CMO가 특정 도구 접근 필요) → CTO가 CEO로부터 task 받아 개발 → 해당 에이전트에 넘김. 이 경로는 창업자가 go/no-go만 판단(승인)하면 자율 진행. 단 self-mod deny-list(게이트로직·`.env`·승인코드 무단 자가수정 차단)는 그대로 — "사업 기능 브랜치 개발(자유)"과 "OS가 자기 안전장치를 몰래 수정(차단)"을 구분한다. 현재 `applySelfMod`가 실제 머지를 안 해 이 경로가 반쪽이므로 M9에서 끝까지 작동하게 만든다.

3. **우선순위 재배열: M9(컨트롤룸 라이브화)가 M8.1·Phase6보다 먼저**. 핵심 병목은 ACR(`agent_control_room_docs`, Next.js)에 L5가 진행상황을 읽어올 `GET /api/l5/execution`이 없어 컨트롤룸 ACR 데이터가 항상 stub인 점. "결과가 실시간으로 보이게(M9)"가 "더 자율적으로(M8)"보다 선행. 창업자 선택 = M9 + Phase6 토큰 함께. ACR repo 2개 구분: 실제 dispatch 대상은 `agent_control_room_docs`(Next.js, `/api/workbench/dispatch`·`/api/l5-callback` 보유), 그 ACR이 spawn하는 CLI 런타임이 `hermes-agent`(Python, 토큰/비용 데이터 완비).

## 2026-06-03 — 사용자 플로우 정합화: 산출물 영속화 · CEO 되묻기 · synthesis delegate 제거 · 인박스 business 스코프

**컨텍스트**: 창업자가 채워진 콘솔을 실사용하며 발견한 어긋남(산출물 미가시·뷰 불일치·원치 않는 새 task·필터 미작동)을 조사해 근원 수정. 네 가지 설계 결정을 기록한다.

1. **임원 산출물(AgentOutput)을 agent_tasks.output(jsonb)에 영속**한다. 이전엔 풍부한 output이 handoff.context 한 조각만 남고 버려져 synthesis·인박스·모니터가 보여줄 알맹이가 없었다. output이 모든 산출물 가시화의 단일 소스. (기존 테이블이라 NocoBase collection sync가 컬럼을 안 만들어 **psql ALTER 병행** 필요 — output_summary 선례.)

2. **synthesis의 'delegate' next_action을 제거**한다. 종합 보고서의 "최종 보고서 작성"이 새 instruction→새 임원 task를 생성해 창업자를 놀라게 했다("기존 결과를 더 보고 싶었지 새 작업을 원한 게 아니다"). 종합 카드는 approve/hold만, 기존 산출물 상세는 기여 행 클릭→인박스. 추가 작업은 창업자가 채팅으로 명시적으로 지시(이제 CEO 되묻기와 결합). open_gaps는 '서술'만, task로 위임하지 않는다.

3. **CEO 되묻기(clarification) 게이트 신설**. 지시가 실행 계획을 세우기에 정보 부족이면 task를 만들지 않고 한국어 질문을 chat에 반환(`needs_clarification`/`resolveClarification`, business 모호성과 통합·business 우선). 이는 창업자의 기획 대화이며 승인 게이트(결제/외부발신)와 무관 — 위험도=게이트 아님 원칙 유지. 과도한 되묻기 금지(합리적 가정 가능하면 진행).

4. **인박스는 project가 아닌 business 단위로 스코프**한다. task가 project=A에 있는데 사이드바가 project=B를 자동선택하면 "로드맵엔 보이는데 인박스엔 없음"이 발생했다. 창업자는 사업 단위로 임원 과제 전체를 한 곳에서 보길 원하므로 getInboxTasks를 business_id 기준으로 변경(project_id 미사용).

---

## 2026-06-03 — 운영 콘솔 재편: 종합 산출물 키스톤 + CTO 자가수정 게이트 예외

**컨텍스트**: 창업자 통증 — 지시 후 각 에이전트 결과가 종합돼 최종 산출물로 돌아오지 않아 다음 세션 진행 불가. + UI 정리(워크플로 팩토리 제거), 메모리 자동 큐레이션, Control Room CTO 현황, Tool Request 자가수정 요구.

**결정**:
1. **종합 산출물(Chief of Staff)이 키스톤** — 모니터링·회의보다 우선. instruction의 모든 task가 terminal(done/killed, ≥1 done)이 되는 즉시 executeTask 꼬리에서 종합→단일 `founder_deliverables` + 채팅 카드. 멱등은 instruction.status='synthesized' claim + UNIQUE(instruction_id). `generateFounderBrief`는 일일 상태 문자열용이라 재사용 안 하고 신규 `synthesizeDeliverable`(contributions 구조는 코드 소유, LLM은 summary만 → 산출 구조가 현실과 어긋날 수 없음 + 결정론 fallback).
2. **모니터링은 DB-derived(v1)** — task_activity 테이블 신설 대신 기존 status+blocker prefix+delegations/consultations 조인으로 라이브 상태 도출. l5-core 순수 `deriveLiveStatus`. 도구 실시간 이름은 도구 off 기본이라 보류.
3. **지식 자동 큐레이션 + soft-delete** — raw JSON 수동 카드 폐기. 규칙(pii_high/too_short/dup/저점수) 우선, 경계만 LLM. 자동 폐기는 즉시 영구삭제 금지 → status='discarded' + purge_at(+30d) 유예 + 복원, 일일 cron 퍼지. 좋은 지식 유실 방지.
4. **Control Room은 degrade-first** — ACR엔 쓸 API가 없어(별도 repo, L5→ACR 풀 코드 dead) L5측(transport stub + 트리 빌더 + 페이지)만 먼저. `ACR_EXECUTION_ENABLED=1` + ACR repo에 read-only `GET /api/l5/execution` 추가 시 실행정보 라이브. 미연결시 agent_tasks만으로 축소.
5. **CTO 자가수정 = 위험도 게이트의 의도적 예외** — 프로젝트 원칙 "위험도는 게이트가 아님(아웃바운드/결제만)"의 단 하나의 예외로 **코드 변이 승인 게이트**를 둔다. 기본 `L5_SELFMOD_AUTO_APPLY_FLOOR=D3`(자동 적용 0, 전부 승인). 브랜치 격리(머지는 명시 승인) + diff 미리보기 + deny-list(plugin-orchestration/.env/launchd/SECURITY_/approval 변경 거부) + 롤백 + 실행중 프로세스는 자기 핫스왑 불가 → `applied:needs_restart` 정직 표면화. M6 `runDelegationLoop`로 post-apply 검증 재사용. [[l5-founder-approval-model]]
6. **subagent 병렬 빌드** — 충돌 없는 단위로 분해(l5-core 순수 모듈 3개 동시, 플러그인 2 레인, UI 페이지별). 공유 파일(src/index.ts, api.ts)은 메인이 병합. 같은 plugin.js를 동시 편집 금지(레인 분리).

**영향**: l5-core 5 신규 모듈(503/506, 3건 pre-existing 무관) + 플러그인 2개 src+dist + founder-ui 6 페이지. E2E 라이브: P1 종합·P3-4 자가수정 통과. 발견·수정: sendToCTO FK 코어션→raw SQL. 상세 `docs/HANDOFF.md` 최신.

---

## 2026-06-02 — M6 임원↔임원 위임 + 검증 반복 루프 (CEO 게이트, 결정론 컨트롤러)

**컨텍스트**: 임원(CMO)이 산출 도중 다른 임원(CTO)의 작업이 필요할 때, 매 검증 라운드마다 CEO를 거치면 비용·지연이 폭증한다. "CEO 경유 위임 + 의도대로 나올 때까지 반복"을 원하되, 루프 본체가 CEO를 매번 태우면 안 된다.

**결정**:
1. **CEO=게이트, 루프=결정론 컨트롤러** — 위임 진입(open→in_progress)과 이탈(예산소진 escalate)만 게이트. 반복 본체(`runDelegationLoop`, l5-core 순수)는 LLM·I/O 미접촉, 제어·종료가 모두 코드. LLM은 "제작"(`runWork`)과 "채점"(`verify`)에만 → 매 라운드 CEO 비용 0. spec §3.3.
2. **검증은 풀 산출이 아니라 체크리스트** — 요청 임원(CMO)이 `acceptance_criteria` 대비 `{pass, feedback}`만 LLM으로 산출(`buildVerificationPrompt`/`parseVerdict`). 파싱 실패/모호는 보수적으로 fail → garbage 응답에 루프가 잘못 resolved되지 않음.
3. **decomposer 대신 단일 work task reissue** — 위임 1건당 CTO task를 새로 분해/배정하지 않고, 단일 work task를 라운드마다 rationale에 피드백을 주입해 재실행. 위임은 이미 목표가 명확(objective+criteria)하므로 분해 불필요 — 더 단순하고 라운드 간 맥락 유지가 쉽다.
4. **`advance`는 동기 드라이버** — `delegation:advance`가 전체 루프를 한 HTTP 요청에서 동기 구동(라운드당 executeAgentTaskLive ~1–2분). consultation의 동기 패턴과 일관. 무인 자동 트리거(dispatcher)는 추후. 워커에는 `ask_*` 도구를 주지 않아 중첩 위임 차단.
5. **창업자 승인 모델 계승** — 위임이 외부발신/결제/고위험을 유발하면 기존 게이트 적용. 위임 자체는 게이트 아님(내부 협업). [[l5-founder-approval-model]]

**영향**: l5-core `functions/delegation/`(index/tool/loop/verify) 24테스트 + plugin-orchestration src/dist 배선(테이블·컬렉션·`ask_executive`·`delegation` 리소스). **D6 라이브 통과(2026-06-02)**: `scripts/d6-delegation-smoke.sh` → advance 122s → resolved/round1, CTO done, origin CMO task 재개. 상세 `docs/HANDOFF.md` 최신 + spec `docs/EXECUTIVE_DELEGATION_SPEC.md`.

---

## 2026-06-02 — 임원 도구 루프 라이브화: claude CLI MCP off + 첫 라운드 도구 강제

**컨텍스트**: M1~M5 도구 플랫폼은 단위/E2E로 통과했으나, 라이브 `executeTask`(도구 루프)가 claude CLI 타임아웃으로 blocked였다. 계측으로 원인 2개를 격리: (1) `claude -p` 매 spawn이 host 프로젝트 MCP 서버를 콜드 로드(라운드당 ~8.8s + OAuth 팝업), (2) haiku가 도구를 건너뛰고 첫 턴에 전체 산출물을 한 번에 생성(65s).

**결정**:
1. **claude CLI를 MCP off로 spawn** — `--strict-mcp-config --mcp-config <빈 json>`. 임원 도구는 우리 텍스트 프로토콜이라 claude CLI 네이티브 MCP는 불필요(dead weight). 라운드당 8.8s→4.2s + Dia 브라우저 OAuth 로그인 팝업 제거. 빈 MCP json은 모듈 로드 시 tmpdir에 1회 기록. 대안(cwd 격리)은 측정상 효과 미미해 기각.
2. **첫 라운드 도구 강제 유도** — 약한 모델(haiku)이 도구를 회피하므로 iteration 0 & tools>0이면 "산출물 전에 반드시 tool_call로 정보 수집" 지시. 산출물을 버리지 않으므로 추가 비용 0. 코드 하드강제(거부·재시도) 대신 프롬프트 제약을 택해 무한루프 리스크 회피.
3. **계측 로그 opt-in** — `L5_TOOL_LOOP_DEBUG=1` → stderr로 라운드별 소요/도구 실행시간/raw head. 기본 off(상시 노이즈 방지), 원인 격리 시에만 사용. HANDOFF follow-up #1 충족.
4. **도구 루프는 동기 HTTP 기본 OFF 유지** — executeTask 도구 루프는 138s 소요 → 동기 action 기본값은 `L5_EXECUTIVE_TOOLS` 미설정 시 단발+recall. 상시화는 비동기 dispatcher 경로로 분리해야 한다는 결정 보류(별도 작업).

**영향**: 수정 3파일(`claude-cli-client.ts`/`.test.ts`, `tool-loop.ts`). 라이브 end-to-end로 CMO가 `secondbrain.read` 실호출(venv spawn 2.8s ok) → 학습 → done(executeTask 138s, 타임아웃 해소) 확인. 회귀 21/21+7/7 pass. 상세 `docs/HANDOFF.md` 최신 항목.

---

## 2026-06-02 — 임원 도구 플랫폼 + 세컨 브레인 양방향 인사이트 (M1~M5)

**컨텍스트**: 임원 AI는 "텍스트 산출물만 내는 직원"이었다(도구 호출 0, 메모리는 CEO에만 주입). 창업자 지시로 도구를 쥐고·지식을 양방향으로 다루고·창업자와 협의하는 플랫폼이 필요해졌다.

**결정**:
1. **텍스트 기반 도구 루프** — `LLMClient`(Claude CLI)에 네이티브 tool-calling이 없으므로, 시스템 프롬프트로 도구 목록을 주고 `{"tool_call":{name,args}}`/최종 산출물을 구분 파싱하는 루프(`runExecutiveWithTools`)로 구현. SDK 도입/런타임 교체 없이 현 인프라에서 도구 사용 가능. 도구 0개면 기존 단발 `runExecutive` 폴백(하위호환).
2. **l5-core 순수성 유지 + transport 주입** — 외부 IO(세컨브레인 MCP, 영상생성기)는 `InsightSource`/`SecondBrainTransport`/`VideoFactoryTransport` 인터페이스로 추상화하고 실 IO는 plugin 측 transport에 둠. l5-core는 mock으로 테스트. env 미설정 시 transport=null → graceful disable.
3. **인사이트 양방향, 단 쓰기는 CEO 게이트** — 읽기는 founder_memory + 세컨브레인을 전 임원에 주입. 쓰기(임원 능동·세컨브레인 적립)는 반드시 `founder_memory.pending` → `monitor:saveMemory`(CEO 검토) → `saved` 경유. saved 승격 시점에만 세컨브레인 `append`(PII high 제외). 인사이트 오염 방지 + 기존 배움루프 정책 계승.
4. **도구는 임원별 소속** — ACR=CTO 도구, 영상생성기=CMO 도구(`allowed_roles:['CMO']`). 도구 레지스트리가 역할 권한을 강제(tool-loop가 비허용 역할 거부).
5. **협의는 비동기 레코드 + 재개** — LLM이 사람을 동기 대기할 수 없으므로 `ask_founder`→`executive_consultations`(awaiting_founder)→task needs_review로 끊고, `consultation:respond`로 resolved+task queued 복귀, 재실행 시 `formatConsultationForPrompt`를 recalledInsights로 주입해 이어감.
6. **L5 자기확장은 사람이** — pulk가 `L5_PROTECTED_PATHS`라 ACR이 L5 본체를 못 건드림 + 단일 spawn 한계로, 플랫폼 코어(M1~M5)는 사람(서브에이전트 파이프라인)이 구현. 깔린 뒤 사업 작업(영상 제작 등)만 임원이 자율 수행.

**영향**: 신규 l5-core 모듈 5개 + plugin transport 2개 + 컬렉션 1개 + UI 1개. l5-core 410/413(3 pre-existing 무관), 브라우저 E2E 콘솔/네트워크 0. dist 수동 패치(정식 nocobase build 부재 — 기존 관행). 상세 `docs/HANDOFF.md` 2026-06-02 최신 항목.

---

## 2026-05-30 — D3+ 승인 L5 단일화 + CTO phase 검토 verdict 반영

**컨텍스트**:
D3+ 승인 경로가 이원화돼 있었다. L5는 `executeTask`가 D3+ 태스크에 `acr_token`을 발급하고 Founder가 L5에서 승인하는데, ACR은 별도로 in-memory Release Gate(`workbench/approval` panel)에서 다시 승인을 요구했다. 더 큰 문제는, Hermes dispatcher가 픽업한(= Founder가 `approvePlan`으로 승인해 `approval_required=false`가 된) D4-D5 태스크를 ACR auto-dispatcher가 `manual_founder` 게이트로 **다시 막아** 영영 실행되지 않았다는 점이다. 또 중간 phase(`phase_complete`)의 verifier 결과가 계산만 되고 버려져, 실패한 중간 단계가 L5에 잡히지 않았다.

**결정 1 — 승인은 L5를 단일 진실원(single source of truth)으로**
- Hermes dispatcher는 `approval_required=false` 태스크만 ACR로 보낸다 → ACR에 도달한 intent는 이미 L5 게이트(자동 또는 Founder 승인)를 통과한 것. 따라서 `ACRIntent.l5_approved=true`(`packages/l5-core/src/types/acr-intent.ts`, `services/agent-runtime/src/agents/cto.ts`)로 표시하고, ACR은 이를 신뢰해 `manual_founder` 게이트를 통과시킨다(`auto-dispatcher.ts`, `workbench/dispatch` auto-dispatch 스케줄, `workbench/approval` Release Gate 스킵).
- **양방향 동기화/Release Gate 영속화 대신 단일 승인원**을 택했다(더 단순, CLAUDE.md UI 단순화 부합). ACR Release Gate panel은 미사용으로 남겨 무해.
- **예외: `auto_24h`(D3)는 시간 정책**이라 `l5_approved`로 우회하지 않는다 — D3는 Founder 명시 승인이 아니라 24h 자동 통과 대상이기 때문.

**결정 2 — CTO phase 검토는 verdict 반영(경량), 본격 게이트 루프는 보류**
- `phase_complete` 콜백(`plugin-orchestration/plugin.ts`)에서도 verifier verdict를 반영한다. fail/inconclusive면 `needs_review`로 올려 `cto-verification-loop`(`verifier:fail`+`retry=true`)가 재시도하거나 Founder가 검토한다. pass면 진행 메모만 남긴다.
- ACR auto-dispatcher가 phase를 자동 드레인하는 흐름은 **그대로 둔다**(phase별 멈춤 게이트는 드레인과 충돌 → 본격 루프는 범위 외).

---

## 2026-05-30 — 사업/프로젝트 다중 레이어, 대화형 기획 및 시각적 로드맵

**컨텍스트**: 
사용자가 L5 Business OS를 사용하면서 단발성 지시 해석에서 벗어나 기획을 대화로 고도화(Multi-turn)하고, 사업(Business) 하위에 여러 프로젝트(Project) 레이어를 두며, 완료 태스크는 1주일 후 삭제하되 시각적인 프로젝트별 분기형 가로 로드맵(Roadmap Timeline)에 흔적이 보존되길 원한다.

**결정 1 — 사업 ↔ 프로젝트 다중 레이어 도입 및 스코핑**
- NocoBase에 `projects` 컬렉션을 신설하고 `businesses` 하위 1:N 관계로 둔다.
- 창업자 지시(`founder_instructions`), CEO 해석(`ceo_interpretations`), 태스크(`agent_tasks`) 테이블에 `project_id`를 추가하여 대화와 계획을 프로젝트 수준으로 격리한다.

**결정 2 — 대화 기록 영속화 및 대화형 기획 (Multi-turn) 구현**
- NocoBase에 `chat_messages` 컬렉션을 신설하여 창업자-CEO 간의 전체 대화 히스토리를 데이터베이스에 영속화한다.
- 다른 페이지로 갔다가 복귀하더라도 `chat:history` API를 호출하여 과거 대화와 제안된 임원 태스크 플랜 카드를 그대로 복구한다.
- CEO Agent는 단발성 해석을 넘어, 과거 대화를 기반으로 추가 질문을 던지거나 의견을 제시하며, 최종적으로 기획이 정리된 시점에만 실행 계획(태스크 목록)을 JSON으로 제안한다.

**결정 3 — 완료 태스크 7일 후 아카이브 및 삭제 데몬**
- 완료/실패된 태스크(`done` | `killed`)는 7일이 지나면 `agent_tasks` 테이블에서 정리(delete)하여 성능과 가독성을 높인다.
- 삭제 전, 로드맵 표시용 백업 테이블인 `project_roadmap_events`로 태스크 요약 정보(누가 수행했고, 기대 출력이 무엇이었으며, 최종 출력 요약이 무엇인지)를 복사하여 아카이브한다.
- 이를 수행하는 `task-archiver` 데몬을 Hermes Runtime에 등록하고 매일 새벽 Cron으로 구동한다.

**결정 4 — HSL 테마 기반 가로 줄기형 분기 로드맵 시각화**
- Founder UI에 가로 스크롤 가능한 `RoadmapTimeline.tsx` 컴포넌트를 구축한다.
- 중앙 핵심선(Core Spine)은 BPR 6단계를 표현하고, 상부 갈래(Branch Up)로는 과거 아카이빙된 태스크를, 하부 갈래(Branch Down)로는 현재 활성 및 예정된 태스크를 HSL harmonized 배지와 micro-animation을 적용하여 시각화한다.

---

## 2026-05-30 — 로드맵 Phase 5: 배움 루프 (수집→검토→저장→참고)

**컨텍스트**: 학습 루프의 밑단 순수 로직(`collectInsights`/`memorySection`/`founder_memory` 컬렉션)은 있었으나 어디서도 호출/주입되지 않아 "결과를 학습해 다음 실행을 개선"이 작동하지 않았다. self-learning은 changelog 원문 HTML을 그대로 저장했다.

**결정 1 — 배선만 잇고 새 도메인 로직은 최소화**
- 수집은 orchestration `executeTask`에서 `executeAgentTask` 직후 `persistTaskInsight()`로 `founder_memory`에 pending 저장(멱등, best-effort 비차단). 참고는 interpret에서 `loadFounderMemories()`로 saved 메모리를 `interpretFounderInstruction({memories})`에 주입. 핵심 판단 로직은 l5-core에 유지, 플러그인은 호출·DB 매핑만.

**결정 2 — 데이터 품질은 근본(추출)에서 해결, UI 가드는 보조로 유지**
- l5-core 순수함수 `extractReadableText()`를 self-learning 저장 직전에 적용(테스트 가능, NocoBase 비의존). 추출 불가(JS 셸 등)면 항목 스킵하되 fingerprint는 전진시켜 재알림 방지. founder-ui `cleanSummary()`는 이중 방어로 유지.

**결정 3 — PII 거버넌스: LLM에는 고PII 인사이트 미주입**
- recall은 `pii_level !== 'high'`만 LLM 컨텍스트로 보냄(CLAUDE.md "고객 PII와 재사용 인사이트 분리"). 연산자 호환성 위해 JS에서 필터.

**결정 4 — 범위 제외(이후): Formbricks·PMF 자동수집·자동화 후보 등록**
- 상업 플러그인 금지 + "PMF 신호 전 도구 금지"에 따라 Phase 5에서 제외. 반복 작업 자동화 후보 등록은 반복 데이터가 쌓인 뒤로 보류.

**발견 — founder_memory camelCase 타임스탬프 버그(동반 수정)**
- 컬렉션이 `createdAt`만 갖는데 기존 `memoryCandidates` 정렬이 `-created_at`(부재) → throw→catch→항상 빈 배열로 검토 화면이 무력했다. `updateMemoryStatus`의 `updated_at` write도 부재 컬럼. 둘 다 정정(검토→저장 복구). recall 쿼리도 동일 정정.

**Impact / Related Files**
- l5-core: `functions/content-extract/index.ts`(+테스트), `index.ts`(export).
- hermes: `tasks/self-learning.ts`. orchestration: `server/plugin.ts`(persistTaskInsight/loadFounderMemories). executive-monitor: `server/plugin.ts`(camelCase 정정).
- env: `L5_*` 신규 없음. 검증: l5-core 347/347, 빌드 exit 0, NocoBase 재배포 후 쌓기/검토/저장/참고 라이브 확인, 시드 청소.

---

## 2026-05-30 — 로드맵 Phase 3·4: 사업↔작업장 연결 + Founder 콘솔

**컨텍스트**: business 대부분이 repo_path 없어 sandbox로 fallback했고, ACR에 live `pulk` repo를 가리키는 stale 등록 4건이 사고 위험이었다. 자가학습이 모으는 정보·승인 대기가 한 화면에 안 보였다.

**결정 1 — workspace repo는 규칙 기반 자동 생성**
- 경로 규칙 고정: `<L5_WORKSPACE_ROOT|~/l5-workspace>/business-{id}`. business 생성 시 `afterCreate` 훅이 멱등 git-init(+`--allow-empty` 초기 커밋) 후 repo_path 설정. 기존 business는 `afterStart` 백필이 보강(멱등, 매 부팅 안전).
- **안전 우선**: `ensureWorkspaceRepo`는 절대경로 + workspaceRoot 직속 자식 + `business-\d+`만 허용, 비어있지 않은 non-git 디렉토리는 보존(데이터 손실 방지). git-init 실패는 business 생성을 막지 않음(비차단).
- 매핑은 dispatch 시점 동적 해석을 유지(이전 결정) — repo_path가 채워지면 자동 반영.

**결정 2 — live repo는 등록 자체를 차단 + stale 청소**
- ACR `isDangerousPath`가 `L5_PROTECTED_PATHS`(기본 `/Users/wonminyang/Desktop/pulk`)와 그 하위 경로를 거부 → 향후 live repo가 작업장으로 등록되는 사고를 원천 차단.
- 기존 stale 등록(projects.json의 pulk-pointing 4건)은 백업 후 제거. 데이터 정리는 즉시, 가드는 ACR 재배포로 반영.

**결정 3 — Founder 콘솔은 기존 컴포넌트·엔드포인트 조립(백엔드 신규 0)**
- 채팅 탭을 2단 레이아웃으로(좌 채팅 / 우 상태패널: 로드맵·승인·발견). `ApprovalQueueCard` 신규(D3+ 승인대기, 30s 폴링, 낙관적 제거). 모든 패널은 `useBusiness()` businessId 주입.
- `TaskItem`에 `business_id`가 없어 승인 카드는 현재 전사 표시 — prop은 배선해두고 백엔드 노출 시 필터 조이는 것으로 분리(과설계 회피).

**Impact / Related Files**
- L5: `plugin-business-portfolio/src/server/workspace-init.ts`(신규), `.../server/plugin.ts`(afterCreate/acrRegister/afterStart 백필).
- ACR: `app/api/projects/route.ts`(PROTECTED_PATHS), `data/projects.json`(청소, 백업 보존).
- UI: `founder-ui/src/components/ApprovalQueueCard.tsx`(신규), `src/app/chat/page.tsx`(2단 레이아웃).
- env: `L5_WORKSPACE_ROOT`(기본 ~/l5-workspace), `L5_PROTECTED_PATHS`(기본 pulk).
- 검증: 3개 빌드 exit 0, 3개 서비스 재시작 health OK, business-2 자동 git-init+repo_path 라이브 확인.

## 2026-05-30 — 로드맵 Phase 1·2: 산출물 확실성 + 검토·병합

**컨텍스트**: ACR spawn이 exit 0이어도 파일을 안 만드는 "빈 브랜치"가 발생했고(타임아웃·재시도·산출물 검증 부재), 완료 산출물을 main에 반영하는 병합 단계가 없었다.

**결정 1 — 산출물 검증을 "거짓 성공" 차단 게이트로**
- exit 0 + git 변경 0 + 변경 예상 phase → 재시도(기본 2회) 후에도 비면 **success가 아니라 `needs_review`로 승격**하고 L5 콜백 `status=empty_output`로 founder에게 알림. 거짓 "completed" 보고를 구조적으로 제거.
- read-only phase(조사/설계)는 빈 산출물이 정상 → `promptExpectsFileChanges` 휴리스틱으로 구분(기본 true, 명시적 read-only 신호만 false). 불필요한 재시도 방지.
- 타임아웃은 spawn 레벨(`spawnAgent`)에 두어 모든 호출 경로가 자동 적용받게 함.

**결정 2 — 병합은 위험도·원격 유무로 분기 (CTO 판단 존중)**
- 기본 자동 병합 ON. **원격(origin) 있으면 gh로 PR만 생성**(병합 결정은 CTO/Founder), **원격 없으면(로컬 sandbox) `git merge --no-ff`로 직접 병합**.
- **D3+는 로컬 자동병합 금지** — 원격 있으면 PR, 없으면 skip 후 founder 승인 대기. D1/D2만 무인 병합. (D3+는 이미 dispatcher 상류에서 승인 게이트로 차단되므로 runner 도달분은 D1/D2지만, 방어적으로 코디네이터에서도 재확인.)
- 충돌은 `git merge --abort`로 안전 복구 후 `merge_conflict` 콜백 → founder 검토 카드. 자동 병합이 트리를 깨지 않음.
- 병합은 plan 전체 완료(`all_done`)에서만 — phase별 acr 브랜치가 체인으로 누적되므로 최종 브랜치 병합이 모든 phase 커밋을 포함.

**Impact / Related Files**
- ACR: `lib/runner/spawn-runner.ts`(타임아웃), `lib/runner/spawn-with-verification.ts`(신규, 재시도·검증), `lib/runner/git-utils.ts`(병합 헬퍼), `lib/runner/merge-coordinator.ts`(신규), `app/api/runner/route.ts`(통합).
- L5: `apps/nocobase-app/.../plugin-orchestration/src/server/plugin.ts` `taskCallback`(`empty_output`/`merge_conflict` 분기 + merge 필드).
- env: `ACR_AGENT_TIMEOUT_MS`(기본 15m), `ACR_MAX_ATTEMPTS`(기본 2), `ACR_AUTO_MERGE`(기본 on, "0"=off).
- 검증: ACR tsc 0 errors, jest 720 passed(신규 18건 포함). 라이브 반영은 ACR/NocoBase rebuild+restart 필요(HANDOFF 참조).

## 2026-05-30 — 4개 서비스 launchd Production 전환 + 무인 자율 루프 활성화

**컨텍스트**: 장기 무인 운영을 위해 수동 `yarn dev`/`next dev` 프로세스를 OS 관리 서비스로 전환.

**결정 1 — launchd 등록 (RunAtLoad + KeepAlive)**
- 5개 서비스를 `~/Library/LaunchAgents`에 등록: `com.l5.nocobase`(:13000), `com.l5.acr-web`(:3001), `com.l5.founder-ui`(:3002), `com.l5.acr-resilience`(데몬), `com.l5.hermes.task-dispatcher`(60s).
- 부팅 자동시작 + 크래시 자동재시작. ACR·founder-ui는 `next dev`→`next build && next start`(production)로 전환(메모리 누수 위험 제거).

**결정 2 — launchd는 `node` 직접 호출 (bash 래퍼 금지)**
- macOS TCC가 launchd 컨텍스트에서 `/bin/bash`의 `~/Desktop` 접근을 거부(`Operation not permitted`). `/usr/local/bin/node`는 접근 허용됨.
- 모든 plist는 `ProgramArguments=[node, <절대경로 bin>, ...]` 형태. founder-ui/ACR은 `node_modules/next/dist/bin/next`(쉘 쉼 `.bin/next` 금지). 공백·한글 포함 ACR 경로도 node 직접 호출로 처리.

**결정 3 — NocoBase는 `start --launch-mode node` (pm2 제거)**
- `nocobase start` 기본값은 `pm2-runtime`(미설치 → `command not found`). raw 엔트리(`storage/.app-dev/lib/index.js`) 직접 실행은 CLI가 주입하는 env(`NODE_MODULES_PATH` 등) 누락으로 크래시.
- 해결: CLI를 거치되 `--launch-mode node`(+`APP_LAUNCH_MODE=node`)로 pm2 없이 foreground `node` 실행. CLI의 `initEnv`가 모든 파생 env 주입.

**결정 4 — 무인 인증 = 비만료 API Key (api-keys 플러그인)**
- task-dispatcher가 `/api/agent_tasks:list`로 큐 조회 → 인증 필수(무토큰 `EMPTY_TOKEN` 401). 로그인 JWT는 ~17h 만료 → 장기 무인 부적합.
- 해결: `@nocobase/plugin-api-keys` 활성화 → `root` 역할 비만료 키 발급(`expiresIn:"36500d"`, exp≈2126년) → task-dispatcher plist의 `NOCOBASE_TOKEN`에 주입. [[l5-launchd-services]]

**결정 5 — 무인 dispatch 기본 cwd = 전용 샌드박스 (live repo 금지)**
- 현재 L5 task에 `project_path`가 없어 `resolveProjectPath`는 `L5_DEFAULT_PROJECT_PATH`로 fallback → 이 값이 모든 무인 task의 cwd가 됨.
- ACR 레지스트리에 `business-2`·`l5-phase15-*` 등 **live `pulk` repo를 가리키는 stale 등록 다수** 존재(과거 사고 원인). 안전을 위해 `L5_DEFAULT_PROJECT_PATH=/Users/wonminyang/l5-workspace/default-sandbox`(영구 git repo)로 고정 → 무인 task가 live repo를 절대 건드리지 않음.
- `business_id → 실제 repo` 매핑은 미구현(별도 기능). 그때까지 무인 실행은 샌드박스에 한정.

**검증 (라이브 E2E, 전환 후)**
- `chat:submitInstruction` 실제 진입점으로 지시 투입 → CEO 해석(LLM) → CTO 분해 → task 생성.
- **D2 task(`e37a0261`, approval_required=false) → 승인 없이 자동 dispatch** → ACR spawn → SMOKE.md 생성 → 커밋/브랜치 → 콜백 → done.
- **D3 task(`a80cfb4c`) → 승인(approval_required=false 전환) 후 dispatch** → 동일 사이클 done.
- 두 게이팅 경로(D2 자동 / D3 승인 후) 모두 실증. 승인 안 된 41건은 `approval_required=true`라 dispatcher가 자동 픽업 안 함(idle·안전).

**알려진 한계**
- hermes dispatcher 프로세스의 agent-runtime이 CTO dev-workflow LLM 보강 시 `spawn claude ENOENT`(PATH에 claude 없음) → **deterministic 6-phase fallback으로 정상 동작**(계획상 허용). 실제 실행은 ACR runner가 spawn하므로 영향 없음.
- project-status-sync cron plist는 템플릿만 있고 미설치(다음 작업).

## 2026-05-30 (추가) — Stale 큐 정리 + Cron 2개 설치 + business→repo 매핑

**Stale 큐 정리**
- 이전 세션 테스트 task 42건(전부 approval_required=true, 2026-05-29 QA 잔재) → `status=killed` 일괄 처리. queued 0건 베이스라인 확보.

**Cron 2개 설치 (08:55 model-verify / 09:00 self-learning)**
- 결정: hermes-runtime `dist`가 stale이라(`model-verify`/`self-learning` 미등록) **재빌드(`tsc`) 필수**였음. 재빌드 후 plist 설치.
- plist는 `node` 직접 호출 + env에 `NOCOBASE_URL`/`NOCOBASE_TOKEN`(API Key)/`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`(ACR `.env.local`에서 가져옴) 주입. `RunAtLoad=false`(예약 시각에만).
- 검증: model-verify→roster clean·알림 silent(변경 없을 때 무알림); self-learning→claude changelog 변경 감지·`docs/cto/cto-tool-catalog.md` 누적·Telegram 발송. 외부 changelog 일부(codex 403/antigravity 404) fetch 실패는 non-fatal 처리.

**business_id → repo 매핑**
- 결정: 매핑을 **dispatch 시점에 동적 해석**(task에 저장 X). repo_path 변경이 다음 dispatch에 즉시 반영되고, agent_tasks 스키마 변경 불필요.
- 구현:
  - `businesses.repo_path`(text) 컬럼 추가 — plugin-business-portfolio collection 필드 + `ensureBusinessColumns` idempotent ALTER(orchestration 패턴 모방). 플러그인 재빌드(`nocobase build @l5/plugin-business-portfolio`, PATH에 node_modules/.bin 필요) + NocoBase 재시작(`launchctl kickstart -k`)으로 적용.
  - hermes `nocobase-client.fetchBusinessRepoPaths()` 추가 → `runTaskDispatcherLive`가 business_id→repo_path 맵으로 각 task에 `project_path` 주입 → `task-dispatcher` runner input에 전달 → agent-runtime `resolveProjectPath(task)`가 cwd로 사용. repo_path 미설정 시 `L5_DEFAULT_PROJECT_PATH`(샌드박스) fallback(안전).
- 검증(E2E): business 1 repo_path=`~/l5-workspace/business-1` → "QA Fixed business" 지시 → CEO business_id=1 추론 → D2 task 자동 dispatch → ACR 브랜치가 **business-1 repo에 생성**(default-sandbox 미접촉) = 라우팅 정상. (해당 spawn은 파일 미커밋·빈 브랜치 — agent 실행 비결정성, 매핑 인프라와 무관. SMOKE 테스트에선 파일 생성 정상.) [[l5-launchd-services]]

## 2026-05-26 — Use NocoBase as MVP Shell

### Decision

Use NocoBase Community Edition as the MVP internal operating shell.

### Reason

NocoBase can quickly provide collections, CRUD, permissions, admin pages, dashboard blocks, and plugin extension points.

### Impact

The MVP can move faster, but NocoBase must not contain core Business OS logic.

## 2026-05-26 — Keep L5 Core Independent

### Decision

Put Founder DNA scoring, PMF scoring, Workflow Factory rules, BPR rules, Tool Request rules, Memory rules, and Decision Authority inside `packages/l5-core`.

### Reason

If NocoBase becomes limiting or expensive later, the shell can be replaced without rewriting the OS brain.

### Impact

Every L5 plugin should call `l5-core` instead of duplicating logic.

## 2026-05-26 — Use Mastra for Agent Runtime

### Decision

Use Mastra as a separate TypeScript agent runtime.

### Reason

CEO Agent and Chief of Staff Agent require multi-step reasoning, tool calls, and structured output. This should not live inside NocoBase UI.

### Impact

NocoBase plugins call agent runtime APIs.

## 2026-05-26 — Use Trigger.dev for Hermes Runtime

### Decision

Use Trigger.dev for long-running, scheduled, retryable, and approval-pause Hermes tasks.

### Reason

Hermes is a state watcher and trigger engine, not a simple notification bot.

### Impact

No scattered cron jobs inside plugin request handlers.

## 2026-05-26 — Separate Business Insights from Customer PII

### Decision

Customer-identifiable records and reusable anonymized insights must be separate entities.

### Reason

Business OS needs reusable learning, but customer data must remain purpose-bound and access-controlled.

### Impact

MemoryEntry, BusinessInsight, CustomerProfile, and CustomerConsent must include PII and usage fields.

## 2026-05-26 — PMF Before Tool

### Decision

Every business idea must pass through PMF experiment planning before tool production.

### Reason

The product philosophy is No Demand, No Tool.

### Impact

ToolRequest should be blocked or marked premature unless PMF/repetition criteria are met.

## 2026-05-29 — ACR is the CTO's End-to-End Responsibility

### Decision

Agent Control Room(ACR) 운영·실행은 전적으로 CTO Agent의 책임이다. Founder와 기획 단계(CEO·ChiefOfStaff·Founder 대화)에서 합의된 개발 항목은 모두 CTO에게 자동 위임되어 ACR을 통해 실행된다.

### Reason

- CTO Agent가 phase 설계(LLM 1회) + 런타임 지정 + 결과 검증 + 재시도까지 완결적으로 수행하도록 Phase 10-18에 걸쳐 와이어링됨
- Founder는 방향성·승인만 담당. ACR 내부 동작(런타임 선택, prompt 패킷, 의존성, 검증)을 직접 만지지 않음
- 기획 단에서 합의된 작업은 별도 사람 게이트 없이 CTO → ACR로 직행 (단, D3+는 approval queue 게이트 유지)

### Impact

- 새로운 개발 요구사항이 채팅에서 합의되면 CEO/ChiefOfStaff가 자동으로 CTO 태스크로 변환
- CTO Agent가 ACR `/api/workbench/dispatch`로 phase[] 전달 → auto-dispatcher가 무인 실행
- ACR 측 게이트(clarification, risk reassess, verifier)는 모두 L5 CTO 헤드리스 응답으로 처리
- Founder UI는 진행 모니터링과 D3+ 승인만 노출. ACR 직접 조작 UI는 만들지 않음

## 2026-05-29 — Out-of-Scope External Integrations

### Decision

다음 외부 서비스 통합은 MVP 범위에서 영구 제외한다.

- **OMC / OMX** — 사용자 명시 제외 (2026-05-29)
- **Formbricks (PMF Score 실제 계산)** — 사용자 명시 제외 (2026-05-29)

### Reason

- 외부 서비스 계정·API 키·운영 부담이 OS 핵심 가치(L5 운영체계)에 비례하지 않음
- PMF 신호는 Hermes 반복 감지 + Founder 정성 판단으로 대체 가능
- 멀티 에이전트 라우팅은 ACR 내장 `agent-model-router` (claude/codex/antigravity)로 충분

### Impact

- 관련 TASKS 항목은 "out-of-scope"로 마킹, 신규 작업은 만들지 않음
- 향후 도입 필요 시 새 ADR로 재논의

## 2026-05-29 — Multi-Business Operating Context (business_id)

### Decision

모든 orchestration 엔티티(founder_instructions, ceo_interpretations, agent_tasks)에 `business_id` (nullable string) 필드를 추가한다. `business_id NULL`은 "회사 공통 작업"을 의미한다.

### Reason

- L5는 단일 founder가 여러 비즈니스를 운영하는 구조. 각 지시가 어느 비즈니스를 위한 것인지 명확해야 함
- CEO Agent가 지시 → 활성 비즈니스 자동 추론 (확실 시) 또는 Founder에게 되묻기 (모호 시)
- id=0 가상 row는 auto-increment PK와 충돌하므로 NULL을 "회사 공통" 의미로 사용

### Impact

- `chat:submitInstruction` 시 활성 business 조회 → interpreter에 주입
- task 생성 시 business_id 포함 (모호 시 task 생성 스킵, 응답은 "어느 비즈니스?" 되묻기)
- monitor/approval queue는 선택적으로 business 필터링 가능 (future UI enhancement)

### Related Files
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts` — ALTER TABLE + defineCollection
- `packages/l5-core/src/types/orchestration.ts` — business_id? 필드 추가
- `packages/l5-core/src/functions/ceo-orchestration/interpreter.ts` — InterpretOptions.activeBusinesses

## 2026-05-29 — Blocker 2 Resolution: Task Dispatcher is Exclusive Path for CTO Execution

### Decision

NocoBase `/api/agent:executeTask`는 CTO task에 대해 `deferred` 상태만 반환한다. 실제 `runCTOAgent` 실행은 **오직** Hermes `task-dispatcher` cron(60초 주기)에서만 수행된다.

### Reason

- `runCTOAgent`는 LLM 호출 + ACR 네트워크 왕복이 길어서 NocoBase HTTP 요청 핸들러를 블록할 수 없음
- 역할 분리: `cto-handler`(순수 평가) ≠ `runCTOAgent`(실행)
- Founder UI는 "승인" 후 다른 agent task는 즉시 `executeTask`로 실행하지만, CTO task는 status만 변경(dispatcher가 모니터링하도록)

### Impact

- Founder UI `chat/page.tsx`: approvePlan 후 all tasks에 executeTask 호출 제거. CTO task는 status `needs_review`만 변경 (dispatcher가 poll하도록)
- `task-dispatcher` launchd plist가 1분 간격으로 `queued && approval_required=false && assigned_agent=CTO` 태스크를 자동 픽업
- 응답 시간 개선: Founder UI가 CTO 승인 후 즉시 반환 (실행은 background)

### Related Files
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts` — executeTask CTO task deferred check
- `apps/founder-ui/src/app/chat/page.tsx` — approvePlan 로직 (CTO task 제외)
- `services/hermes-runtime/src/tasks/task-dispatcher.ts` — auto-execution loop
- `services/hermes-runtime/launchd/com.l5.hermes.task-dispatcher.plist`

## 2026-05-29 — LLM Response Serialization: undefined → null

### Decision

모든 LLM 응답 파싱 전에 `:\s*undefined` → `: null` 방어 치환을 적용한다. 또한 interpreter SYSTEM_PROMPT 스키마를 `string | null` (never `undefined`)로 정의한다.

### Reason

- OpenAI API가 JSON 스키마에 `undefined` 타입을 받으면 응답값으로 리터럴 문자열 "undefined"를 output
- JSON.parse() 실패 또는 field 누락 → 전체 orchestration flow 중단
- TypeScript에서는 `undefined` 유효하지만 JSON serialization의 관례는 `null`

### Impact

- `packages/l5-core/src/functions/ceo-orchestration/interpreter.ts`: 응답 파싱 전 sanitize
- 모든 LLM 호출 경로 (CEO, CTO, verifier, clarifier, replanner 등)에 동일 방어 적용
- 테스트: LLM throw/parse-fail 경로에 deterministic fallback 검증

### Related Files
- `packages/l5-core/src/functions/ceo-orchestration/interpreter.ts` — SYSTEM_PROMPT 스키마 + parse sanitize
- `packages/l5-core/src/types/agent-protocol.ts` — null-only fields
- `services/agent-runtime/src/agents/` — 모든 LLM 경로에 동일 방어

## 2026-05-29 — Model Routing Architecture (Wave 2 P0)

### Decision

CTO Agent의 모델 선택 로직을 `packages/l5-core/src/functions/cto-design/model-routing.ts`의 순수 함수로 구현한다. MODEL_ROSTER (정적 메타데이터) → selectModelTier(taskClass × phaseKind) → resolveModel(quotaState) 3단계.

### Reason

- 모델 선택은 l5-core 도메인 로직 (ACR 런타임과 무관)
- taskClass (SMALL_FIX/FEATURE/BIG_CHANGE/OPS/RESEARCH/REFACTOR) × phaseKind (claude/codex/antigravity) 매트릭스
- T1 (최고) / T2 (중간) / T3 (경량) 티어로 쿼터 관리 가능하게 설계
- 실제 쿼터 추적 (quota-tracker.json) 및 헤더 캡처는 ACR 영역 (분리)

### Impact

- l5-core에 MODEL_ROSTER export (stub 제거)
- Hermes `model-verify.ts`가 이 모듈 import → deprecated 감지
- ACR `/api/runner`가 model-routing의 타입만 참조 (구현은 ACR 측)
- 테스트: 21개 (tiering rules, quota fallback, unknown class)

### Related Files
- `packages/l5-core/src/functions/cto-design/model-routing.ts`
- `services/hermes-runtime/src/tasks/model-verify.ts`
- `packages/l5-core/src/types/cto-design.ts` (MODEL_ROSTER, ModelTier)

## 2026-05-29 — Self-Learning Loop Architecture (Wave 2 P0)

### Decision

자동 학습 시스템을 `packages/l5-core/src/functions/cto-design/oss-research.ts` (OSS 조사) + Hermes `self-learning.ts` cron (09:00 daily)으로 구현한다. Founder는 오늘의 발견(.omc/state/todays-discovery.json)을 Founder UI에서 검토.

### Reason

- OSS 조사는 순수 로직: filterCandidates (라이선스+stars+활성도) → 비교표 → 결정
- Hermes cron이 changelog 수집 → cto-tool-catalog.md 누적 → todays-discovery 기록
- Founder 정성 판단 보조 (Formbricks 없이 대체)
- 경로 주입으로 테스트 격리 가능 (tmpdir 안 오염)

### Impact

- l5-core: `oss-research.ts` 37개 테스트 + OssSearchClient 인터페이스
- Hermes: `self-learning.ts` 12개 테스트 + launchd plist
- Founder UI: TodayDiscoveryBanner + discovery:today 액션
- 경로 환경: L5_DISCOVERY_PATH (없으면 cwd 기반, 파일 없으면 [])

### Related Files
- `packages/l5-core/src/functions/cto-design/oss-research.ts`
- `services/hermes-runtime/src/tasks/self-learning.ts`
- `apps/nocobase-app/.../plugin-executive-monitor/plugin.ts` (discovery:today 액션)
- `apps/founder-ui/src/components/TodayDiscoveryBanner.tsx`

## 2026-05-29 — Monitor Refactor: business_id Filtering (Wave 2 P0.1)

### Decision

`plugin-executive-monitor`의 `monitor:projectTimeline` 액션을 `source_ref LIKE` 필터에서 `business_id` 컬럼 필터로 전환한다. `business_id IS NULL` / `= 'common'` 양쪽을 "회사 공통"으로 처리.

### Reason

- Wave 1에서 `business_id` nullable 스키마 추가했으나, monitor query가 여전히 old source_ref 필터 사용
- Wave 2 Founder UI가 business select → business_id context 전파하므로, monitor가 이를 필터로 사용해야 함
- NULL 또는 'common' 값 양쪽 지원 (마이그레이션 유연성)

### Impact

- SQL: `WHERE business_id IS NULL OR business_id = $1` (company common) / `WHERE business_id = $1` (specific business)
- idx_agent_tasks_business_id 멱등 인덱스 추가
- SELECT에 `blocker` 컬럼 누락 버그 수정 (부수)
- Founder UI RoadmapMiniCard가 자동으로 business별 task 필터링

### Related Files
- `apps/nocobase-app/.../plugin-executive-monitor/src/server/plugin.ts` (monitor:projectTimeline)
- `apps/founder-ui/src/components/RoadmapMiniCard.tsx`
- `apps/nocobase-app/migrations/` (index 추가)

## 2026-05-29 — E2E Browser Validation & Bug Fixes (Wave 2 P1)

### Decision

Playwright headless chromium으로 Founder UI 6가지 시나리오 검증. 발견된 결함을 라이브 수정: rejectPlan 액션 부재, approvePlan no-op, submitInstruction 응답 stale, sidebar 401 race, 빈 사업명, self-learning tmpdir 오염.

### Reason

- Wave 1이 "라이브 E2E 통과"라고 했으나, UI 엣지 케이스 미검증
- Playwright browser 시뮬레이션이 실제 race/timing 이슈 발견 (401 auth race)
- 버그 6개 발견 후 즉시 수정 → 라이브 재검증

### Impact

- 모든 버그 수정 후 콘솔 에러 0, 네트워크 4xx/5xx 0
- `plugin-orchestration` `rejectPlan` 액션 추가 + ACL
- `plugin-orchestration` `approvePlan` — approval_required:false 설정 추가
- `chat:submitInstruction` — instructionOut으로 응답 (update 전 data 반영)
- `AuthGate` + `BusinessProvider` — useAuth().token 준비 후 fetch
- Sidebar — fallback: `{name || one_liner || '사업 ${id}'}`
- `self-learning.ts` — SelfLearningOptions.discoveryPath 주입 가능

### Related Files
- `apps/founder-ui/src/app/chat/page.tsx` (E2E scenario)
- `apps/nocobase-app/.../plugin-orchestration/src/server/plugin.ts` (rejectPlan, approvePlan fixes)
- `apps/founder-ui/src/components/AuthGate.tsx`
- `apps/founder-ui/src/components/Sidebar.tsx`
- `services/hermes-runtime/src/tasks/self-learning.ts`

## 2026-05-29 — ACR Runner 403은 설계상 보안 가드 (Phase 15 Wave 1 사실)

### Decision

ACR `/api/runner`의 403 응답은 버그가 아니라 **설계상 3종 보안 가드**다. 각 가드는 의도된 동작이며, 정상 운영 흐름에서는 모두 통과한다.

### 가드 상세

1. **Approval Token 누락/무효** — `/api/runner` 요청 시 `authorization: Bearer <token>` 미제출 또는 expired token → 403
   - 정상 경로: workbench/dispatch → auto-dispatcher가 `issueApprovalToken()` → in-process token 발급 → /api/runner POST (token 포함)
   - 사실: Wave 1 "POST /api/runner 403"은 토큰 없는 수동 프로브였음

2. **Working Directory Path Traversal Guard** — cwd가 `getProjects()` 등록 프로젝트 경로 밖 → 403
   - 정상 경로: L5 CTO가 `project_path` → ACR 프로젝트 auto-create + 경로 등록 → dispatcher가 등록 경로 범위만 spawn
   - 사실: Phase 15 라이브에서 외부 프로젝트(`/Users/.../pulk`) dispatch → cwd 가드 통과, 이후 git 청결도 가드만 작동

3. **Git Uncommitted Changes Guard** — cwd에 uncommitted 변경 → runner 거부 (intent 명확성)
   - 정상 경로: sandbox 또는 clean branch에서만 dispatch, 또는 변경 사항 사전 commit
   - 사실: git init + initial commit인 깔끔한 cwd에서는 통과

### Reason

- 의도: L5 외부 프로젝트 dispatch 시 path traversal 및 작업 무결성 보호
- Phase 15 라이브에서 3단계 가드를 모두 추적했으며, 최종 approval token + git 청결도 만족 시 실제 `claude` CLI spawn까지 진행됨 (exit 0 수집)

### Impact

- ACR 측: runner 403은 정상 동작. 추가 수정 불필요
- L5 측: dispatch 시 approval token 자동 발급 + project 등록 경로 명확히 → runner 통과 보장
- 운영: 403 발생 시 세 가지 가드 중 어느 단계 거부인지 로그 + 헤더 확인

### Related Files
- `~/Desktop/양원민 개발자/agent_control_room_docs/app/api/runner/route.ts` (validateCwdSafety, checkUncommittedChanges)
- `~/Desktop/양원민 개발자/agent_control_room_docs/lib/orchestration/auto-dispatcher.ts` (token 발급 + 경로 해석)
- `packages/l5-core/src/types/acr-intent.ts` (project_path 필드)

## 2026-05-29 — ACR 지속 루프 정책: 위험도 기반 게이팅 + 토큰 대기

### Decision

ACR auto-dispatcher가 위험도 레벨(D1-D5)에 따라 서로 다른 실행 정책을 적용한다. D1은 즉시 실행, D2는 24h 자동 release 후 실행, D3+는 수동 founder 승인까지 대기. 토큰 소진 시 전체 dispatcher를 멈추지 않고 그 plan의 진행을 `waiting` 상태로 일시정지.

### Reason

- **위험도별 게이팅**: D1(즉시)/D2(24h auto)/D3+(수동)는 L5 정책 기본이며, ACR도 동일 규칙 수용
- **토큰 대기**: 일부 plan이 토큰 부족으로 차단되더라도 다른 계획들은 계속 진행되어야 함 → 개별 plan별 waiting + 시간 기반 retry
- **사용자 선택**: "기획된 내용이 모두 끝날 때까지 CTO가 계속 작업, 토큰 떨어지면 대기 후 재개"

### Impact

**ACR 코드 변경 (`lib/orchestration/auto-dispatcher.ts`)**
- `DispatchOutcome`에 `status: "waiting"` 추가 + `waitUntil?: Date` 필드
- `checkEligibility()`: D2는 발행 이후 24h 경과 시만 release, manual_founder는 계속 skip
- `dispatchNextTask()`: quota exhausted → task.status='waiting' + waitUntil 계산, 반환값에 포함
- 신규 `drainAllPlans(outcome: DispatchOutcome)`: 전체 plan 지속 drain, waiting은 break 않음, 최종 aggregated { dispatched, waiting, skipped, remainingEligible, waitUntil, allDone }

**신규 엔드포인트 (`POST /api/orchestration/resilience-tick`)**
- `x-l5-shared-secret` 인증
- `drainAllPlans()` 실행 → outcome 반환
- 매 호출마다 모든 활성 plan의 상태를 평가 및 드레인

**신규 데몬 (`scripts/resilience-loop-daemon.mjs` + `launchd/com.l5.acr-resilience.plist`)**
- KeepAlive daemon
- 폴링: POST /api/orchestration/resilience-tick (L5_SHARED_SECRET 헤더)
- 로직: waitUntil 도달까지 sleep, 그 다음 재폴링
- 파일만 생성됨(미설치); 운영자가 `launchctl load` 시에만 활성화

**테스트**
- `__tests__/auto-dispatcher.test.ts` 9개 추가 (waiting status, 24h eligibility, resilience-tick, quota-aware drain 등)
- 총 jest 704 PASS, ACR tsc clean

### Related Files
- `~/Desktop/양원민 개발자/agent_control_room_docs/lib/orchestration/auto-dispatcher.ts` (drainAllPlans, DispatchOutcome.waiting)
- `~/Desktop/양원민 개발자/agent_control_room_docs/app/api/orchestration/resilience-tick/route.ts` (신규)
- `~/Desktop/양원민 개발자/agent_control_room_docs/scripts/resilience-loop-daemon.mjs` (신규)
- `~/Desktop/양원민 개발자/agent_control_room_docs/launchd/com.l5.acr-resilience.plist` (신규)

## 2026-05-29 — Model Locking: 다운그레이드 금지 정책

### Decision

고위험 또는 아키텍처급 작업(spec/rfc/research/review, 일부 BIG_CHANGE)이 T1(Opus/최고급) 모델로 지정되었다면, 토큰 부족으로 인해 작은 모델로 자동 폴백하지 않는다. 대신 그 작업이 완료될 때까지 대기.

### Reason

- **품질 보장**: 아키텍처 의사결정은 최고급 모델(Claude Opus)이 필요. T2/T3으로 저하되면 설계 품질 악화
- **정책 강화**: l5-core model-routing에서 T1 로킹 여부를 이미 계산했으나, ACR consumer가 이를 존중하지 않음
- **토큰 관리**: 토큰 고갈 시 일부 agent를 재설정할 때까지 기다리는 것이 맞음

### Impact

**L5 코드 변경 (`packages/l5-core/src/types/acr-intent.ts`, `services/agent-runtime/src/agents/cto.ts`)**
- `CTOPhase`에 optional `model_locked?: boolean` 필드 추가
- `toCTOPhase()` 또는 CTO agent에서 `selectModelTier(taskClass, phaseKind)==="T1"` 여부 확인 → `model_locked=true` 설정

**매핑 (l5-core model-routing 기준)**
- `T1(LOCK)`: spec, rfc, research, review, BIG_CHANGE의 일부 초반 phase
- `T2`: implement, test, commit (일반 코딩)
- `T3`: minor fixes, regress test (경량)

**ACR consumer (`lib/orchestration/auto-dispatcher.ts` 또는 runner)**
- `PlanTask.model_locked=true` + rate_limited → 폴백 없이 그 agent reset까지 waiting
- `model_locked=false` → 같은 역할 가용 agent로 폴백, 없으면 waiting

**검증**
- `packages/l5-core/src/types/acr-intent.ts` tsc clean
- `services/agent-runtime/src/agents/cto.ts` tsc clean + build clean
- `@l5/core` 339 tests PASS (모델 라우팅 관련 추가 유닛 테스트 포함)
- workbench/dispatch 라이브 확인: model_locked=true (spec/research), false (implement/commit) 정확히 저장

### Related Files
- `packages/l5-core/src/types/acr-intent.ts` (model_locked 필드)
- `packages/l5-core/src/functions/cto-design/model-routing.ts` (selectModelTier 로직)
- `services/agent-runtime/src/agents/cto.ts` (toCTOPhase에 model_locked 설정)
- `~/Desktop/양원민 개발자/agent_control_room_docs/lib/orchestration/auto-dispatcher.ts` (model_locked 존중)

## 2026-05-30 — Callback 인증 영속화: Shared-Secret 기반 공개 엔드포인트

### Decision

ACR → L5 `agent:taskCallback` 인증을 만료형 JWT(`L5_ADMIN_TOKEN`, ~17h)에서 **비만료 shared-secret**으로 전환한다. taskCallback ACL을 `loggedIn` → `public`으로 변경하고, 핸들러에서 요청 헤더(`x-l5-shared-secret`)의 shared-secret을 검증한다.

### Reason

- **장기 무인 운영 전제**: 데몬이 24시간 이상 반복 폴링할 때 JWT 만료(17h)로 인해 콜백이 401 → 사이클 미완 → 무인 루프 실패
- **대안 비교**: JWT 갱신 메커니즘보다 비만료 shared-secret (env 기반)이 단순하고 안전
- **격리된 호출**: callback은 ACR 내부 시스템 → L5 간 호출이므로 HTTP Bearer (하위호환) 또는 header 검증으로 충분

### Impact

**L5 측 (`apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts`)**
- `taskCallback` ACL: `loggedIn` → `public`
- 핸들러 최상단에서 `x-l5-shared-secret` 헤더 검증 (일치 실패 → 401)
- `.env`에서 `process.env.L5_SHARED_SECRET` 런타임 로드

**ACR 측 (`~/Desktop/양원민 개발자/agent_control_room_docs/`)**
- `app/api/runner/route.ts` onComplete 콜백: `x-l5-shared-secret` 헤더 추가 (Bearer는 하위호환 유지)
- `lib/orchestration/pre-dispatch-checks.ts`: `sendClarificationRequest()`, `sendRiskReassessment()` 콜백에도 동일 헤더 추가

**검증**
- shared-secret 일치 → 콜백 수신 (200)
- 헤더 누락 또는 불일치 → 401 reject
- ACR `npm run dev` 환경에서 bearer + shared-secret 중 하나 이상으로 인증 통과

### Related Files
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts` (taskCallback ACL + 검증)
- `~/Desktop/양원민 개발자/agent_control_room_docs/app/api/runner/route.ts` (콜백 헤더)
- `~/Desktop/양원민 개발자/agent_control_room_docs/lib/orchestration/pre-dispatch-checks.ts` (pre-flight 콜백)

## 2026-05-30 — 멀티-phase 무인 실행: Phase간 커밋 + In-flight 락

### Decision

멀티-phase 계획이 무인 폴링(데몬 또는 resilience-tick)으로 진행될 때, (1) 각 phase 완료 후 git 변경을 커밋하고, (2) 동시 drain 충돌을 방지하기 위해 plan별 in-flight 락을 적용한다.

### Reason

**버그 A: Phase 간 커밋 부재**
- runner가 성공한 phase의 파일 변경을 git에 커밋하지 않음 → tree가 dirty 잔류
- 다음 phase 시작 시 `checkUncommittedChanges` 가드가 즉시 abort
- 후속 phase는 `planned` 상태로 영원히 멈춤

**버그 B: 동시 drain 충돌**
- dispatch-time fire-and-forget (`scheduleAutoDispatch`)과 resilience 데몬이 같은 plan을 동시에 drain
- 같은 git cwd에서 동시 runner 프로세스 간 브랜치/체크아웃 충돌

### Impact

**ACR 코드 변경 (`lib/runner/git-utils.ts`)**
- `commitAll(cwd, message)`: git add . → commit 헬퍼 함수 신규

**ACR 코드 변경 (`app/api/runner/route.ts`)**
- runner onSuccess(exit 0 && !boundaryViolation): phase 변경을 `commitAll(cwd, "phase ${phase_index} complete")` 커밋

**ACR 코드 변경 (`lib/orchestration/auto-dispatcher.ts`)**
- `runAutoDispatchForPlan`/`drainAllPlans`에 plan별 in-flight 락 추가 (globalThis Set 기반)
- 동시 호출 → 두 번째는 대기 또는 immediate return

**검증**
- 3-phase D1 계획이 데몬 단일 틱에 all done 도달
- STEP1/2/3.txt 모두 생성 + 3개 커밋 누적 (commit log 확인)
- git tree clean (no dirty state)
- 헛 중복 dispatch 없음 (다음 틱에서 allDone=true로 즉시 pass)

### Related Files
- `~/Desktop/양원민 개발자/agent_control_room_docs/lib/runner/git-utils.ts` (commitAll)
- `~/Desktop/양원민 개발자/agent_control_room_docs/app/api/runner/route.ts` (onSuccess 커밋)
- `~/Desktop/양원민 개발자/agent_control_room_docs/lib/orchestration/auto-dispatcher.ts` (in-flight 락)

---

## 2026-06-06 — ACR 오케스트레이션 정체 근본화: 하트비트 lease + /api/runner abort 타임아웃

### Decision

ACR 자동실행의 정체/재시작 낭비를 근본 제거하되, **잡큐+데몬 전면 재작성은 보류**한다. 대신 두 가지 수술적 변경으로 같은 효과를 얻는다.

1. 인메모리 `planDrainLocks`(고정 20분 stale)를 **하트비트 lease**로 교체 — 살아있는 drain은 30초마다 갱신돼 유지되고, 홀더가 죽으면 3분 내 stale → 자동 재청구.
2. `dispatchNextTask`의 `/api/runner` fetch+SSE 드레인에 **AbortController 타임아웃**(`ACR_RUNNER_TIMEOUT_MS`, 기본 `ACR_AGENT_TIMEOUT_MS`+90s) 추가 — 단일 phase가 영구 행 불가.

### Reason

**근본 원인(문서·코드로 확정)**: `dispatchNextTask`가 `/api/runner` SSE를 abort 타임아웃 없이 동기 드레인 → 행이 발생하면 무한 await → 인메모리 plan 락 점유 + 활성 CLI 0 → 드라이버가 `GLOBAL_STALL`로 **acr-web 재시작** → 진행 중 phase 폐기·재실행(토큰 낭비). 20분 stale 해제는 너무 느려 실질적으로 재시작에 의존.

**원안(데몬이 CLI 직접 spawn으로 in-flight 생존) 보류 이유**: `/api/runner`는 단순 spawn이 아니라 **브랜치 격리·빈출력 검증·파일 경계 검사·phase 커밋·머지 조정·L5 `taskCallback`·텔레그램·토큰 캡처**까지 수행한다. 기존 `local-runner` 데몬/브리지는 이 후처리가 전부 빠져 있어, 데몬 직접 spawn으로 전환하면 **L5 콜백(펄크가 phase 완료를 인지하는 유일 경로)·머지·경계 검사가 회귀**한다. 회귀 위험 대비 이득이 낮아, in-flight CLI의 acr-web 재시작 생존은 후속 단계로 연기한다(이 경우에도 재시작 자체가 희귀해지므로 영향 미미).

### Impact

**ACR 코드 (`lib/orchestration/auto-dispatcher.ts`)**
- `planDrainLocks` 값 = 마지막 하트비트 ms. `acquirePlanDrain`(30s 갱신 타이머, `unref`)·`releasePlanDrain`·`isPlanDrainLocked`(stale 시 재청구). `DRAIN_LOCK_STALE_MS` 20분→3분.
- `/api/runner` fetch에 `signal` + 타임아웃. abort 시 `failed:runner_timeout`(waiting 아님 → drain 정리·lease 해제 → 다음 패스 재큐).
- `__leaseTestHooks` export(테스트 전용).
- **`/api/runner`는 무수정 → L5 콜백·머지·경계·커밋 무회귀.**

**드라이버 (`~/l5-workspace/cmo-driver.mjs`)**
- `GLOBAL_STALL → restartAcrWeb()` 제거(고아 `restartAcrWeb`/`sleep` 정리). 지속 정체 시 고아 running→planned 힐만 수행(재시작·재실행 낭비 0).

**검증**
- `__tests__/auto-dispatcher-resilience.test.ts` 신규 2종: ① SSE 미종료 러너가 타임아웃에 묶여 `failed:runner_timeout` 반환(무한행 아님), ② lease 산 홀더 유지 + 만료 홀더 재청구.
- 기존 `auto-dispatcher.test.ts`(5)·`resilience-loop.test.ts`(9) 회귀 없음 → 전부 GREEN.

### Related Files
- `~/Desktop/양원민 개발자/agent_control_room_docs/lib/orchestration/auto-dispatcher.ts` (하트비트 lease + abort 타임아웃)
- `~/Desktop/양원민 개발자/agent_control_room_docs/__tests__/auto-dispatcher-resilience.test.ts` (신규 테스트)
- `~/l5-workspace/cmo-driver.mjs` (acr-web 재시작 제거)

### 후속(연기)
- 데몬 별도 프로세스 실행으로 in-flight CLI의 acr-web 재시작 생존 — `/api/runner` 후처리를 공유 finalizer로 추출 후 진행.
- per-phase agy 모델 선택(Flash/Pro), 쿼터 추적 갱신부, 병렬 worktree 통합지점 선셋업.

---

## 2026-06-06 — CTO 개선 후속 3종(agy 모델·쿼터 writer·브랜치 정리) + 데몬 in-flight 보류 재확인

### Decision

위 후속 중 **저위험·고가치 3종을 적용**하고, **데몬 in-flight 생존(finalizer 추출)은 보류 유지**한다.

1. **per-phase agy 모델** — agy CLI `--model`(per-session, 병렬 안전) 활용. 경량 phase=Flash, 코딩=Pro.
2. **쿼터 추적 갱신부** — ACR runtime-registry 상태를 `ACR_QUOTA_TRACKER_PATH`의 `QuotaState`로 영속화(B5 read-path 완성).
3. **브랜치 정리 자동화** — `git-acr-cleanup.sh`를 일일 launchd 스케줄.

### Reason

**agy 모델**: 기존 모델 전환 = `withAntigravityModel`(전역 settings.json 재작성) → **병렬 worktree에서 경쟁 조건**이라 per-phase 불가였음. agy CLI `--help` 확인 결과 `--model`(="Model for the current CLI session")이 per-invocation이라 병렬 안전 → settings.json 재작성 없이 안전하게 per-phase 가능.

**쿼터 writer**: B5에서 `cto.ts loadQuotaState`(read)는 넣었으나 **writer가 없어** 항상 전 tier 가용으로 읽혀 소진 tier로 phase 배정. ACR가 이미 in-memory로 쿼터를 알므로(`updateAgentRuntime`) 그 choke point에서 파일로 미러링.

**데몬 in-flight 보류 재확인(중요)**: `execution-safety-regression`/`qa-fixes` 등 runner 테스트는 **pre-spawn(토큰/cwd 검증·거부)만** 커버하고 **post-spawn finalize(상태도출·커밋·머지·L5콜백·빈출력)는 테스트 0**임을 확인. 즉 finalize를 추출하면 보안·정확성·L5콜백이 걸린 ~250줄을 **안전망 없이** 리팩터하는 것 → 라이브 자율 루프를 조용히 깨뜨릴 위험. lease+timeout 적용으로 acr-web 재시작이 이미 희귀해져 in-flight 생존의 이득도 한계. **올바른 순서 = ① finalize 특성화 테스트 선작성 → ② finalizer 추출(무회귀 검증) → ③ 플래그 게이트(default off) 데몬 spawn 경로 → ④ 라이브 통합 테스트.** 헤드리스로 ③④ 검증 불가하므로 별도 세션으로 연기.

### Impact

**ACR (`~/Desktop/양원민 개발자/agent_control_room_docs`)**
- `lib/agents/antigravity-runner.ts`: `buildAgyArgs`에 `--model <targetModel>`(set 시).
- `lib/runner/spawn-runner.ts`: agy를 `withAntigravityModel`(전역 재작성) 대신 `--model` 플래그로(병렬 안전, recovery 경로 포함).
- `lib/runner/spawn-with-verification.ts`: `targetModel` opts 추가·forward.
- `app/api/runner/route.ts`: agy일 때 phase kind(`expectsChanges`)로 모델 선택(env `ACR_AGY_MODEL_LIGHT`/`_CODE`/`_PER_PHASE_MODEL`).
- `lib/agents/quota-tracker-file.ts`(신규): `buildQuotaState`+`persistQuotaTracker`(원자적, no-op when env unset).
- `lib/agents/runtime-registry.ts`: `updateAgentRuntime`에서 dynamic-import fire-and-forget로 persist.

**pulk**
- `services/hermes-runtime/launchd/com.l5.git-acr-cleanup.plist`(신규, 03:30 일일) + `scripts/install-launchd.sh`(`__REPO_ROOT__` 치환 + PLISTS 등록).
- pulk TS 무변경(쿼터는 cto.ts가 이미 read; ACR가 write).

**운영 전제**: 쿼터 파일이 효과를 내려면 pulk hermes 디스패처와 acr-web이 같은 `ACR_QUOTA_TRACKER_PATH` env 공유 필요.

### 검증
- 신규 테스트: antigravity-runner `--model` 3종(+37), quota-tracker-file 6 GREEN.
- 회귀: auto-dispatcher/resilience-loop/pre-dispatch/execution-safety-regression/phase19 GREEN. ACR `tsc --noEmit` 0. cleanup dry-run 동작·plist `plutil` OK·installer `bash -n` OK.
- qa-fixes-phase11 1건 실패는 **사전 존재**(`HERMES_INTEGRATION_ROADMAP.md` 누락 ENOENT, 본 변경 무관).

### Related Files
- ACR: `antigravity-runner.ts`·`spawn-runner.ts`·`spawn-with-verification.ts`·`app/api/runner/route.ts`·`lib/agents/quota-tracker-file.ts`·`runtime-registry.ts` + 테스트 2파일.
- pulk: `services/hermes-runtime/launchd/com.l5.git-acr-cleanup.plist`·`scripts/install-launchd.sh`.

### 후속(연기)
- 데몬 in-flight 생존: finalize 특성화 테스트 → finalizer 추출 → 플래그 게이트 데몬 → 라이브 통합 테스트(별도 세션).
- agy **모델별** 쿼터 추적(현재 tier 단위), worktree 통합 자동 머지/union 리졸버.

---

## 2026-06-06 — 데몬 in-flight 생존 ①②단계: finalize 특성화 테스트 + finalizer 추출(무회귀)

### Decision

위 "데몬 in-flight 생존"의 안전 순서 중 **①특성화 테스트 + ②finalizer 추출**을 완료(헤드리스로 안전 검증 가능한 부분). ③플래그 게이트 데몬 + ④라이브 통합 테스트는 실 acr-web·worktree·CLI가 필요해 라이브 세션으로 유지.

### Reason

`/api/runner`의 post-spawn finalize(상태도출·커밋·머지·**L5 taskCallback**·빈출력·경계)가 테스트 0이라 추출이 위험하다고 봤음 → **먼저 그 동작을 고정하는 특성화 테스트를 깔고**, 그 안전망 위에서 추출하면 무회귀를 증명할 수 있다. 추출하면 (1) 그 로직이 테스트로 보호되고 (2) 별도 프로세스 러너가 같은 finalizer를 호출할 수 있어 in-flight 생존의 토대가 된다 (3) 608줄 라우트가 ~360줄로 슬림해진다.

### Impact

**ACR**
- `__tests__/runner-finalize.test.ts`(신규): finalize의 **관찰 가능 행동**(최종 PlanTask 상태 + L5 콜백 status)을 4 시나리오(성공/실패/빈출력/경계위반)로 고정. 추출 전 현재 라우트에 대해 통과 → 추출 후에도 동일 통과 = **무회귀 증명**.
- `lib/runner/finalize-phase-execution.ts`(신규): post-spawn 블록을 **verbatim** 추출(`controller.enqueue(encode(..))` → `emit(..)` 콜백만 변경). 인라인 러너와 미래 별도-프로세스 러너가 공유.
- `app/api/runner/route.ts`: 인라인 finalize(~244줄)를 `await finalizePhaseExecution({...})` 호출로 대체(609→365줄). 추출로 고아가 된 import 정리.
- `__tests__/qa-fixes-phase11.test.ts`: boundary 로직이 finalizer로 이동했으므로 소스 검사 위치를 새 모듈로 갱신(의도 동일).

### 검증
- 추출 전 runner-finalize 4 GREEN → 추출 후 4 GREEN(행동 보존). execution-safety-regression 34·전체 ACR 742 GREEN, tsc 0. (qa-fixes-phase11 잔여 1건은 사전존재 ENOENT.)
- 배포: behavior-identical → ACR rebuild + acr-web restart로 live==repo 유지.

### 후속(라이브 세션 필요)
- ③ `/api/runner/prepare`(pre-spawn) + `/api/runner/finalize`(finalizer 호출) 엔드포인트 + **별도 프로세스 데몬**이 CLI를 spawn(기본 OFF 플래그). ④ 플래그 켜고 실제 phase 1개로 "L5 콜백 정상 도착" 라이브 확인.

---

## 2026-06-06 — 데몬 in-flight 생존 ③④ 라이브 시연 완료

### Decision
별도 프로세스 phase-runner 데몬 + prepare/finalize 엔드포인트를 구현하고 **라이브로 in-flight 생존을 시연·검증**했다. 인라인 `/api/runner`는 무수정(데몬은 추가 경로, 명시적/opt-in).

### Impact (ACR)
- `app/api/runner/prepare/route.ts`(신규): pre-spawn(브랜치·exec-log·warm session·agy 모델·status→running), `x-l5-shared-secret` 인증, 컨텍스트 반환.
- `app/api/runner/finalize/route.ts`(신규): 데몬의 spawn 결과를 받아 **공유 `finalizePhaseExecution` 호출**(상태·커밋·머지·L5콜백 = 인라인과 동일).
- `scripts/phase-runner-daemon.mjs`(신규): prepare → **자기 프로세스에서 CLI spawn**(claude/codex/agy, FAKE 데모 지원) → git 변화 측정 → finalize. finalize POST는 acr-web 재시작을 견디도록 24×5s 재시도.
- `__tests__/runner-prepare-finalize.test.ts`(신규 4): 인증 가드(401/503) + finalize 배선.

### 라이브 시연 결과 (격리 샌드박스 `~/l5-workspace/daemon-demo`)
- 인라인 경로 격리: phase를 `auto_execute=false`로 디스패치(auto-dispatch/resilience가 안 건드림) → 데몬이 명시적 처리.
- **in-flight 생존 증명**: 40초 spawn 도중 06:38:15 `acr-web kickstart -k`로 강제 종료 → 그 직후 데몬(PID 15034)·spawn 자식(15083)·acr-web=000(DOWN) 동시 확인 → spawn 40초 완주(06:38:44) → acr-web 복귀 후 finalize 안착(06:38:46).
- 결과: ACR 태스크 **done**, 격리 브랜치 커밋+main 머지(`619c7ad`→`25bc361`, D2 자동머지), exec-log done/exit0, L5 콜백(nocobase:13000) 도달, 브라우저(acr-web /projects/[id])에 데몬-생성 프로젝트 렌더 확인.
- D4 phase는 자동머지 게이트가 올바르게 차단(리뷰 대기)됨을 함께 확인.

### 검증
- 신규 4 + 기존(runner-finalize 4, execution-safety 34 등) GREEN, tsc 0, ACR rebuild(BUILD_ID 6vRuYYGfRK1FmGingK29S)+restart 배포.

### 후속(남은 1단계)
- 데몬을 **기본 실행 경로로 승격**: auto-dispatcher가 인라인 POST 대신 데몬 잡 큐로 enqueue하도록 배선(현재는 데몬이 명시적/opt-in 경로). 이때 잡 큐 + 워커 N개로 동시성 운영.

---

## 2026-06-06 — 데몬을 기본 실행 경로로 승격 (라이브 적용)

### Decision
phase-runner 데몬을 ACR의 **기본 실행 경로**로 승격. `ACR_EXTERNAL_RUNNER=1`이면 auto-dispatcher가 인라인 `/api/runner` 대신 잡큐로 enqueue하고, 상시 데몬(launchd)이 별도 프로세스에서 spawn→finalize. **플래그 하나로 인라인 복귀 가능(reversible).**

### Impact (ACR)
- `lib/orchestration/phase-runner-queue.ts`(신규): 디스크 원자적 잡큐(enqueue 멱등 + claimNext FIFO/agent필터). PlanTask 상태가 source-of-truth, 큐는 ephemeral 핸드오프.
- `app/api/runner/queue/claim/route.ts`(신규, shared-secret): 워커가 잡 claim.
- `lib/orchestration/auto-dispatcher.ts`: `EXTERNAL_RUNNER` 분기 — 모든 pre-flight(replan·prior-context·quota·risk) 유지하되 실행만 enqueue로 교체. **plan당 1 in-flight 가드**(running 있으면 skip)로 같은 cwd 동시실행 충돌 차단.
- `app/api/runner/prepare/route.ts`: 큐의 enriched prompt override 수용.
- `scripts/phase-runner-daemon.mjs`: poll 모드(claim 루프) 추가. `launchd/com.l5.acr-phase-runner.plist`(신규, KeepAlive, PATH에 claude/codex/agy).

### 라이브 적용 + 검증
- acr-web `.env.local`에 `ACR_EXTERNAL_RUNNER=1` + 재빌드(BUILD_ID M0A5WLQiEMcXhDw2aW2m1)+재시작. `com.l5.acr-phase-runner` 설치·기동(PID poll 모드).
- **FAKE 워커 검증**: auto_execute D2 디스패치 → enqueue → claim → prepare → spawn → finalize → done(커밋+머지).
- **실 claude 검증**: 깨끗한 샌드박스에 사소한 작업 디스패치 → 실 데몬이 claim → **진짜 claude 실행** → `hello.txt` 정확 생성 → finalize → 태스크 done, 커밋+main 머지. (프로덕션 경로 실 에이전트로 end-to-end 입증.)
- 테스트: phase-runner-queue 3 + 인라인 회귀(auto-dispatcher/resilience) GREEN, tsc 0.

### 운영 주의 (stale 백로그)
- 플래그 ON 시 resilience-tick이 기존 FeaturePlan의 'planned' phase도 큐에 쓸어담음. 현재 28개 stale plan(2일+, m9e2e 테스트/버려진 것, dirty cwd)이 존재 → **one-in-flight 가드 + dirty cwd 409로 전부 inert**(큐가 70초+ 0 유지 확인). 유저 실 데이터라 일괄 변경하지 않음. **권장: stale plan 별도 아카이브.**
- 롤백: `.env.local`에서 `ACR_EXTERNAL_RUNNER=0`(또는 제거)+재빌드/재시작 → 인라인 복귀. 데몬 중지: `launchctl unload ~/Library/LaunchAgents/com.l5.acr-phase-runner.plist`.

### 결과
"데몬 in-flight 생존"의 마지막 단계(기본 경로 승격) 완료. CTO/ACR 자율 코딩의 모든 phase가 이제 acr-web 밖 별도 프로세스에서 실행 → acr-web 재시작이 진행 중 작업을 죽이지 않음.

---

## 2026-06-06 — CMO/Script Room v3.1 경계 확정 + 전체 구현(P0~P6)

### Decision
CMO/Script Room의 책임 경계를 **VideoExecutionBrief(schema_version `cmo_to_factory_v2`)까지**로 확정. CMO는 "무엇을 말할지"(조사→전략→원고→QA→brief)만 결정하고, scene_type/best_medium/duration/timeline 등 "어떻게 보여줄지"는 **AI Slide Video Factory의 Scene Decision Engine**에 위임한다.

### Why
PRD 3종 교차 분석 결과: v3.1(정본)과 v2는 90% 동일하나 핸드오프 경계가 충돌 — v2는 CMO가 ScriptBeat로 scene_type을 확정(Factory VideoJob 직접 변환), v3.1은 brief까지만. 수신측 `ai_slide_video_factory_v2_1` PRD 테스트2/6이 "Pulk가 scene_type 확정 시 fail"을 명시 → Factory의 Scene Decision Engine을 무력화하지 않도록 **v3.1 경계 채택**. v2식 결합은 폐기.

### Impact
- 기존 `video-room/script-factory.ts`(ScriptBeat→scene_type 확정 VideoJob) `@deprecated`, `video-execution-brief.ts`로 교체.
- §13 제외 범위(voice/slide/render/upload) = production.ts/review-publish.ts는 레거시 유지, 신규 플로우 미호출.
- 신규 도메인은 별도 `cmo-script-room/` 폴더 대신 **기존 video-room 모듈에 평면 통합**(business-pt-context/second-brain/viewtrap/key·pulling-content 재사용, 중복 제거).
- ConsumerStage 한글 enum 유지 + brief 계약은 영문 매핑(ConsumerStageEn).
- BriefLogicBlock은 허용 5필드만 노출 → 금지필드를 타입레벨에서 표현 불가하게(invalid brief unrepresentable) + brief-validators 런타임 검증 이중 안전.

### How (workflow 연속 실행, 6 phase)
P0 계약문서 2종 / P1 타입+빌더+validator / P2 Research 5종+Gate1 / P3 Strategy+ContentSet / P4 Script Room+Router / P5 e2e+handoff / P6 풀스택(NocoBase cmo:generateVideoExecutionBrief 액션 src+dist 패치 + founder-ui script-room 라우트). 각 phase = workflow 1회(agent team 병렬+QA), phase 사이 typecheck/jest 검증·통합.

### Verify
l5-core typecheck 0, video-room 509 tests/34 suites GREEN. founder-ui typecheck 0. dist/plugin.js node --check OK. 단일 카드 e2e(Research→Brief→Handoff) + 테스트6(scene_type 부재) 통과. 라이브 NocoBase DB E2E는 후속(헤드리스 불가).

---

## ACR을 pulk CTO의 실행 커널로 풀구현 (2026-06-06)

### Decision
PRD대로 ACR을 planning brain에서 **execution kernel**로 축소하고, ExecutionRun/Worktree/Harness/Verification/Handoff를 ACR repo에, Agent Team 분해·복잡도·경계 판단을 pulk에 두는 2-level 구조를 양 repo에 걸쳐 구현. dynamic phased workflow(agent team 기반 8 phase)로 진행.

### Why
이전 점검(CTO_ACR_HARNESS_ASSESSMENT.html)에서 "판단 계층은 라이브, 실행 계층은 계약만"이 최대 갭. 실행 커널을 실제로 세워야 팀/하네스가 설계도→라이브가 됨. ACR repo가 별도(yangminguy/agent-control-room)라 cross-repo 진행, 단 양쪽 미커밋(ACR 111 WIP / pulk CMO)은 불가침·선택 add.

### Impact
- ACR: lib/execution-run·lib/worktree·lib/harness 신규(기존 /api/runner·lib/runner 무손상 thin adapter). PreToolUse hook으로 §19.1 destructive 실제 차단.
- pulk: cto-harness/{team-orchestrator,acr-intent-adapter}, agent-runtime/acr-execution-client, Control Room §18.1 UI. 기존 workbench dispatch 비파괴(ACR_EXECUTION_RUNS 플래그).
- Dagu(§9)는 PRD Non-Goal로 보류.

### Verify
ACR 124/124 + next build PASS, pulk l5-core 1414·agent-runtime 16/16·founder-ui build·control-room E2E PASS. 통합 단서 4건은 라이브 ACR 백엔드 기동 시 검증(정적 컨텍스트 한계). 상세 docs/cto/CTO_ACR_PRD_COMPLETION.html.

## M9.8 — 과분해 차단 + 개발문서 기반 phase 연속성 (2026-06-09)

### Decision
실측 실험(Instagram Reels PRD를 business 7=ai-slide-video-factory로 dispatch)에서 두 비효율 확인 → pulk(오케스트레이션) 측만 수정:
1. **과분해 차단**: `classifyTask`에 콘텐츠 저작(.md/프롬프트/캡션/문서/라우팅 작성) 감지 분기 추가 → 기존 **TINY(implement→commit, 2-phase)** 로 라우팅. 단 `engine/generator/validator/schema/.ts/component` 등 **코드 신호가 있으면 제외**(과소분해 방지). escalation 신호 있으면 무력화.
2. **문서 기반 연속성**: `buildDeterministicDevPhases`의 모든 phase prompt_packet에 (a) "작업 전 repo 개발문서(README/CLAUDE/AGENTS/docs/ARCHITECTURE/관련 docs·SKILL) 먼저 읽기" grounding, (b) mutating phase 한정 "진행을 `docs/_acr-progress/<slug>.md` 에 기록" 주입. read-only(D1) phase는 기록 제외(verifier 충돌 방지).

### Why
SKILL.md 마크다운 1개 작성이 repro→fix→regress→review 4 cold phase(~7분, Claude Code 직접이면 ~40초)로 돎. phase마다 codex cold spawn + `[PRIOR PHASE CONTEXT]` raw 재주입이 본질 낭비. 컨텍스트를 raw 재주입 대신 repo 문서로 이어가면 per-phase 격리(결정성)는 유지하면서 낭비만 제거. pulk=기획/오케스트레이션, ACR=실행 원칙 준수 — 실행모델(warm 세션/compact)은 ACR repo의 후속(②) 과제로 분리.

### Impact
- `packages/l5-core/src/functions/cto-design/dev-workflow-spec.ts`: classifyTask 콘텐츠 분기 + `progressNotePath`/`buildPhasePromptPacket` 신규 + TINY 문구 일반화. 시그니처 무변경(순수 additive export).
- 라이브 반영: l5-core·agent-runtime dist 재빌드(@l5/core=dist 해석). dispatcher는 StartInterval로 fresh 로드.
- ② 후속(ACR repo, 미착수): `lib/orchestration/auto-dispatcher.ts:85-112`의 raw [PRIOR PHASE CONTEXT] 블록을 progress-doc 참조로 경량화 + `finalize-phase-execution.ts`에 progress write.

### Verify
l5-core tsc 0 + jest dev-workflow-spec 60/60(신규 M9.8 5군 포함) GREEN, agent-runtime tsc 0. 라이브 단일 task 재실행으로 4→2 phase 축소·문서 연속성 실측은 ACR phase-runner 재기동 후 진행 예정.

## R3 — 키 콘텐츠 워크플로우 속도: claude-cli 유지 + step2‖step3 병렬 (2026-06-09)

**맥락**: `runKeyContentWorkflow` 1회가 ~218초. 실측 원인은 step 의존성이나 모델 속도가 아니라 **claude CLI를 호출마다 콜드 스타트로 spawn**(`llm/claude-cli-client.ts`)하는 것 — 6회 순차 spawn.

**결정**:
- LLM 백엔드는 **claude-cli 유지**(사장님 결정 — 구독 내 무료, Anthropic HTTP API 직접 호출은 비용/키 이유로 채택 안 함). 따라서 콜드 스타트 제거(API 전환)는 보류.
- 워크플로우 스텝(step2→3→4→5→6→10)은 대부분 직전 산출물을 프롬프트 컨텍스트로 소비하는 **의도된 순차 체인**(원칙: 한방 LLM 금지). 유일한 예외가 step3.
- **step3(카테고리 FB)는 build가 step1만 사용** → step2(아이템 FB) 컨텍스트 제거(디커플링). 카테고리 수준 FB는 아이템 FB에 의존할 필요 없음. 이로써 **step2‖step3 병렬 실행**(Promise.all) → cold-spawn 1회 절감(~14%, 218→~185초).
- 테스트 `key-content-draft.test.ts`의 "step3 프롬프트가 step2 산출물 포함" 단언을 새 설계(미포함)로 갱신.

**보류(향후)**: 더 큰 단축은 (a) Anthropic API 백엔드(콜드 스타트 제거, ~10x) 또는 (b) 스텝 병합(spawn 수 감소)이 필요하나 (a)는 비용, (b)는 stepwise 원칙·품질 트레이드오프로 현 시점 미채택.

## M4 — 렌더 상태는 파일 기반 프로토콜로 폴링 (2026-06-10)

**결정**: factory(ai-slide-video-factory)에 잡 큐/상태 API가 없으므로, 렌더 상태는 별도 큐 없이 **파일 존재로 도출**한다 — jobs/<file>.json(=queued) → outputs/<job.slug>/ 생성(=rendering) → video.mp4(>0B)+render_report.json(=completed), render_error.txt(=failed, 옵션 마커). 관찰(파일 사실 수집)은 plugin transport(`getRenderJobStatus`), 판단은 l5-core(`deriveRenderJobStatus`/`reconcileRenderJob`/`evaluateRenderArtifacts`)로 분리(도메인=l5-core 원칙). 업로드는 `buildYoutubeUploadDraftFromBrief` 초안(private/pending)까지만 — 실제 업로드는 승인 게이트 뒤 수동.

## 제목 디벨롭 8단계 — cmo-strategy 배치 + thumbnail_pattern_extraction 단계 내부 수행 (2026-06-10)

**결정**: 제목 디벨롭(PRD cmo-title-development)은 (a) 신규 타입/로직을 `video-room/`이 아닌 `cmo-strategy/`에 둔다(video-room/types.ts가 이미 큼, PRD §27 권고. Viewtrap·ThumbnailPattern 타입은 배럴 import 재사용). (b) `VideoRoomStatus`에 새 상태를 추가하지 않고 기존 `thumbnail_pattern_extraction` 단계 내부에서 수행하고 산출 카드 stage=`title_development`(PRD §20.1 MVP — 상태머신 변경·회귀 부담 최소). 최종 제목/썸네일은 `hook_draft_approval`(승인3) 게이트에서 승인, `script_approval`(승인4)에서 확정 제목을 읽기 전용 노출해 원고 약속 회수를 검토. 8단계 LLM은 `key-content-draft.ts`의 "LLM 주입+retry+단계별 결정론 폴백" 패턴을 복제(전체 폴백 아님). 향후 별도 상태(`pulling_title_development`)는 PRD §20.2 v2로 보류.

## CTO Native Orchestration — ACR 은퇴, Claude Code 직접 실행 (2026-06-10)

**결정**: ACR(별도 Next.js 실행 앱)을 점진 은퇴시키고, CTO가 나눈 phase를 Claude Code(CLI/Workflow)가 직접 실행하는 Native Orchestration으로 전환한다. 근거: ACR의 지배 병목이 **단일 직렬 phase-runner + per-phase cold spawn**(`docs/cto/CTO_ACR_SPEED_IMPROVEMENT_PLAN.md`)인데, 이는 "ACR을 고쳐서"가 아니라 "ACR이 쓰던 자산(CLI 호출 규약·모델맵·fallback·recovery)을 Claude Code의 병렬 실행엔진으로 흡수"해 해결하는 게 구조적으로 옳다. ACR에 이미 순수 로직이 존재(직렬 runner에 묶이거나 dry-run이라 못 쓰던 것)하므로 **재작성이 아닌 이식**.

**원칙 보존**: (1) CTO Brain(판단/분해)은 무변경 — `agents/cto.ts`의 `acrIntent`(이미 phase별 runtime/model/prompt_packet/allowed_files 포함)가 그대로 입력. (2) 역할분리 유지 — Native Orchestrator는 실행만, "planning brain으로 만들지 않는다". (3) 안전장치(verify/boundary/command-guard/승인)는 ACR에서 빼되 **버리지 않고** pulk 순수함수로 실행 단계에 이식(비병목: ms 순수판정). (4) 격리는 task→**phase 단위 worktree**로 격상.

**구조**: 순수 로직 `packages/l5-core/.../cto-native/`(NocoBase 없이 테스트), 실행 레이어 `services/agent-runtime/src/orchestrator/`(child_process/git). dispatch 경계는 `NATIVE_ORCHESTRATION` env flag로 비파괴 A/B — off면 기존 `dispatchToACR` 불변.

**Impact**: 직렬+cold spawn 병목 제거(병렬+warm). 3개 토큰 풀(claude/codex/agy 구독세션) 동시 활용 + 토큰 소진 시 fallback 인계 + 회복 대기 재개. 별도 launchd 데몬·큐·409 정리 부담 소멸.

**Verify**: cto-native jest 62/62, orchestrator jest 5/5, tsc 0. S0 PoC 월클락 2분30초(ACR 동급 ~6분48초 대비 단축). 라이브 스모크/ACR 동등성 확인 후 단계적 은퇴. 상세: `docs/cto/CTO_NATIVE_ORCHESTRATION_IMPL.md`.

## Native Orchestration — 병렬 머지 직렬화 · budget 근사 · 사업별 모니터 (2026-06-11)

**병렬 실행 + 머지 직렬화**: `CTOPhase.depends_on`(CTO 명시)로 `planPhaseLevels`가 위상 레벨을 만들고, 레벨 내 phase는 `Promise.all` 병렬, **merge는 레벨 종료 후 순차**다. 근거: 각 phase는 독립 worktree에서 작업 후 같은 base repo로 `git merge`하는데, 동시 머지는 index/내용 충돌을 낸다. 그래서 `runPhaseToVerdict`(worktree 작업·검증·커밋까지, 병렬 안전)와 `finalizePhase`(merge+영속화+정리, 순차)로 분리. 충돌은 throw 아닌 graceful 보류(`held`). `depends_on` 미지정 phase는 직전 phase에 암묵 의존 → 기존 완전 순차 동작을 비파괴로 보존.

**budget 근사**: CLI는 토큰 수를 반환하지 않으므로 토큰 카운트를 지어내지 않는다. 대신 실행 결과 신호(`looksLikeTokenExhaustion`/비정상 종료)로 pool을 `exhausted`+백오프 처리(`applyPoolOutcome`, 순수). 데몬은 `pools.json`을 추적하고 `dispatchToNativeOrchestrator`의 `NativeRunSummary`(waited/exhaustedAgents)로 `planNextPoll` 실루프를 돌려 회복 추정 시각까지 대기 후 재시도.

**사업별 모니터 = 신규 테이블**: 기존 `agent_tasks`(ACR 경로) 재사용 대신 `native_phase_runs` 전용 테이블 + `monitor:nativeRuns` 조회 액션 + founder-ui 전용 뷰. 근거: phase 단위 세밀도(풀·상태·전체 output·타이밍)는 task 단위 모델로 표현 불가. 오케스트레이터는 `PhaseRunSink` 콜백(NocoBase 비의존, 테스트 가능)으로만 영속화하고, 데몬이 표준 REST(:create/:update)로 기록 — 커스텀 쓰기 액션 불필요. 결과 본문 회수: phase 프롬프트에 "마지막 출력에 전체 보고서 본문" 지시 + spawn stdout 전체를 `output`에 보존.

**ESM 디렉토리 임포트 수정**: dist `native-orchestrator.js`가 `@l5/core/dist/functions/cto-native`(디렉토리)를 value 임포트해 ESM 런타임에서 `ERR_UNSUPPORTED_DIR_IMPORT`로 데몬 기동 실패(jest는 CJS라 통과). `/index.js` 명시로 수정. 데몬 드라이런(빈 큐 기동→모듈 로드→폴링)이 잡은 잠복 버그 — 데몬이 실제 기동된 적이 없어 미발견이었다.

## 브랜드 다큐 편집 = 신규 독립 `pipeline` CLI, factory는 모션 공급기로 강등 (2026-07-25)

**결정**: 브랜드보이 수준 롱폼 다큐 편집(외부 원본 자막 검색 → 검수 → CapCut 조립)은 `~/ai-slide-video-factory`(슬라이드 렌더 엔진) 확장이 아니라 **신규 독립 `pipeline` CLI(`~/brandboy-pipeline`)로 신규 구축**한다(최소 단위 씬 3~20초 vs 의미 비트 1.5~5초, `VideoJob` vs `Beat`/`Shot` 1:1 대응 불가). factory는 **모션그래픽 공급 서브시스템으로 강등**(hyperframes 러너만 이식·사용). **`packages/l5-core/src/functions/video-room/render-pipeline.ts` 소비자(슬라이드덱 렌더 경로)는 무영향** — 그대로 살아 있고, 다큐 파이프라인은 별도 CLI다. rev5 계약(필드 구역 Z1/Z2/Z3 + writeScoped + V14 봉인 + sentence_key 재고정 + 화질 2단 + 스토리보드 게이트) 확정. 2026-07-25 기준 T0a~T8 + T1~T7·plan --apply 코드 완료(5,800줄+), verify 게이트 14종 그린. 상세: `docs/cmo/video-pipeline/HANDOFF.md`.
