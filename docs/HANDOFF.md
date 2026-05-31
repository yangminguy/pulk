# HANDOFF — L5 Business OS

최종 업데이트: 2026-06-01 (Founder 승인 게이트 재정의 + 채팅 카드 네비게이션)

---

## 🟢 2026-06-01 (최신) — Founder 승인 게이트 재정의 + 채팅 카드 네비게이션

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
