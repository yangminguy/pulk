# HANDOFF — L5 Business OS

최종 업데이트: 2026-05-29 (Phase 8 P1 완료 — Workflow Factory LLM 연결 + Phase 9 P2 Phase Transition Summary UI + Phase 18.1 ACR pre-dispatch trigger 와이어링)

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
