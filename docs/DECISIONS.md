# DECISIONS — L5 Business OS

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
- 검증: model-verify→roster clean·알림 silent(변경 없을 때 무알림); self-learning→claude changelog 변경 감지·`docs/cto-tool-catalog.md` 누적·Telegram 발송. 외부 changelog 일부(codex 403/antigravity 404) fetch 실패는 non-fatal 처리.

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
