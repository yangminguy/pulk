# CTO/ACR 실행 속도 개선 계획서

작성일: 2026-06-09
근거: Instagram Reels PRD를 business 7(`ai-slide-video-factory`)로 실제 dispatch한 실측 실험.
목적: "CTO→ACR 파이프라인이 Claude Code 직접 실행보다 너무 느리다"는 문제를 구조적으로 해결. **나중에 이 문서만 보고 그대로 구현할 수 있도록** 파일/함수/수용기준까지 명시한다.

> 한 줄 결론: **속도의 지배 병목은 ACR 실행모델(단일 직렬 runner + per-phase cold `claude-code` spawn)이며, pulk 오케스트레이션 수정만으로는 월클락이 줄지 않는다.** pulk 과분해 차단(완료)은 작업량/토큰을 줄였지만 체감 속도는 ACR 병렬화가 본체다.

---

## 1. 실측 증거 (이 실험에서 측정)

| 지표 | 측정값 |
|---|---|
| 단순 마크다운 1개 작성 task (구코드) | repro→fix→regress→review **4 cold phase ≈ 6분 48초** (Claude Code 직접이면 ~40초) |
| phase당 소요 | codex ~110초 / claude-code ~160~423초 (cold spawn + 문서 read 포함) |
| 11개 task 직렬 처리 시 21분간 완주 | **1/11** (FIFO로 모든 task의 1번째 phase부터 도느라 완주가 안 남) |
| pulk 과분해 차단 후 phase 총량 | ~77 → 32 (**58%↓**) — 작업량은 줄지만 직렬이라 월클락 미개선 |
| progress note(문서 연속성) 생성 | **0개** — 프롬프트로 "기록하라" 지시해도 에이전트가 안 따름 |

### 근본 원인 (효과 큰 순)
1. **단일 직렬 phase-runner** — 한 번에 1 phase만. 11 task면 한 줄. *압도적 1위 병목.*
2. **per-phase cold CLI spawn + `[PRIOR PHASE CONTEXT]` raw 재주입** — phase마다 프로세스 새로 띄우고 직전 컨텍스트를 통째로 다시 넣음.
3. **TINY 템플릿이 `claude` runtime** — 콘텐츠를 TINY로 보내면 codex(빠름)→claude-code(콜드스타트 느림)로 바뀌는 부작용.
4. **grounding 과다 read** — 매 phase "README+CLAUDE+AGENTS+docs 다 읽어라" → 단순 작성에도 read 오버헤드. 게다가 연속성 효과(노트)는 0.
5. **scope-creep** — 일부 task가 PRD 금지(에셋/이미지 생성)까지 수행(7분간 바이너리 PNG 7개 커밋).
6. **ACR가 main 체크아웃을 직접 사용** — 중단 시 acr 브랜치+미커밋 잔존 → 다음 prepare에서 만성 409 `uncommitted changes in cwd`.

---

## 2. 이미 적용된 것 (pulk, 2026-06-09 — M9.8 / M9.8.1)

> 상태: src+테스트+dist 반영 완료, 검증됨. **git 미커밋(working tree)** — 커밋 여부는 별도 결정.

- **과분해 차단**: `packages/l5-core/src/functions/cto-design/dev-workflow-spec.ts`
  - `classifyTask(title, rationale, hints, expectedOutput)` — 4번째 인자로 **expected_output(산출 파일명)** 까지 보고 분류. `.md`/프롬프트/캡션/문서 산출물 → **TINY(2-phase)**. 'engine/generator/schema' 같은 제목어는 hard 코드신호에서 제외(`.tsx?`/함수/컴포넌트/src/zod만 코드로). escalation 신호 있으면 무력화.
  - 결과: Reels 11 task 중 **9개가 2-phase**(이전 5/11, 구코드 전부 4~7).
- **문서 grounding/연속성 주입(부분 성공)**: 같은 파일 `buildPhasePromptPacket`/`progressNotePath` — 모든 phase에 "개발문서 먼저 읽기" + mutating phase에 "`docs/_acr-progress/<slug>.md` 기록". **⚠️ 노트 기록은 에이전트가 실제로 안 따름 → §3 P3에서 재설계 필요. grounding read는 속도 비용 발생 → 경량화 대상.**
- `services/agent-runtime/src/agents/cto.ts:577` — `classifyTask`에 `expected_output` 전달.
- 검증: l5-core jest `dev-workflow-spec` 61/61, l5-core·agent-runtime tsc 0, dist 재빌드.
- 부수: 대상 repo `.gitignore`에 생성물 패턴 추가(만성 409 완화), 커밋 `e8e76ee`.

---

## 3. 개선 계획 (효과순, 그대로 구현 가능)

### P1 — ACR 병렬 phase-runner ★최대 효과 (ACR repo)
- **문제**: 단일 직렬 처리. 독립 task가 N개여도 한 줄.
- **변경 위치(ACR repo `agent_control_room_docs`)**:
  - 큐: `data/phase-runner-queue.json` (잡 리스트, 각 잡 = {planId, taskId, agent, cwd, prompt}).
  - 클레임/실행 루프: `com.l5.acr-phase-runner` launchd가 도는 러너 엔트리(phase-runner). 현재 1개 잡씩 claim→prepare→spawn→finalize.
- **설계**:
  - 동시 실행 슬롯 W개(예: 2~4, CPU/쿼터 기준). 서로 다른 **task**(또는 다른 cwd)면 병렬, 같은 task의 phase는 순차(의존성).
  - **cwd 충돌 방지가 핵심**: 현재 ACR이 main 체크아웃을 직접 써서 병렬 시 git 충돌 → P5(진짜 worktree 격리)와 함께 가야 안전.
  - launchd 1개 데몬 안에서 worker pool, 또는 러너 인스턴스 W개 + 잡 클레임 원자성(파일락/상태 필드).
- **수용기준**: 독립 task W개가 동시 진행(로그상 동시 spawn), 같은 task의 phase 순서 보존, cwd 충돌 0.
- **리스크/트레이드오프**: 결정성(`ACR_DETERMINISTIC_PHASES`)은 phase 내용엔 영향 없음(병렬은 스케줄링만). cwd 격리(P5) 선행 필수.

### P2 — TINY 런타임 codex로 (pulk, ~10분) ★즉시 가능
- **문제**: TINY 템플릿 phase가 `runtime: 'claude'` → 콘텐츠 task가 느린 claude-code 콜드스타트로.
- **변경 위치**: `packages/l5-core/src/functions/cto-design/dev-workflow-spec.ts` — `DEV_WORKFLOW_TEMPLATES.TINY[*].runtime`을 `'codex'`로. 또는 `model-routing.ts:85`의 Record에서 TINY/implement·commit tier를 codex(T2)로. 둘 중 단일 권위 경로 확인 후 한 곳만.
- **수용기준**: TINY phase 로그가 `spawning codex`로, phase당 시간 단축 측정.
- **리스크**: 낮음. 단 codex가 마크다운 작성에 적합한지 1 task 실측.

### P3 — grounding 경량화 + 연속성은 ACR가 강제 (pulk + ACR)
- **문제**: (a) 매 phase 무거운 doc read = 속도 비용. (b) "노트 기록" 프롬프트 지시를 에이전트가 무시 → 연속성 효과 0.
- **변경**:
  - pulk `buildPhasePromptPacket`: 읽기 목록을 **task 관련 문서로 한정**(전체 나열 X). read-only/review phase에만 "전체 파악" 허용, 산출 phase는 최소.
  - **연속성은 프롬프트 지시가 아니라 ACR가 강제**: `finalize-phase-execution.ts:174` 부근에서 phase 종료 시 ACR가 직접 `docs/_acr-progress/<task>.md`에 (phase, 변경파일, diff 요약)을 **자동 append**. 그리고 다음 phase prepare 시 그 노트를 prompt에 주입(또는 cwd에 존재해 에이전트가 읽음). → `[PRIOR PHASE CONTEXT]` raw 재주입(`auto-dispatcher.ts:85-112`)을 이 경량 노트 참조로 대체.
- **수용기준**: phase마다 progress note가 실제 갱신됨(에이전트 의존 X), raw 컨텍스트 블록 크기↓.
- **리스크**: 중. auto-dispatcher/llm-replanner(`llm-replanner.ts:66-86`) 입력 형태 변경.

### P4 — scope-creep 가드레일 (pulk 프롬프트 + ACR boundary)
- **문제**: 기획 산출물만 만들어야 할 task가 실제 reels 에셋/이미지(바이너리 PNG)를 생성(PRD 금지).
- **변경**: pulk가 ACR에 넘기는 work-order/prompt에 "**산출물은 명시된 파일만. 에셋/이미지/렌더 생성 금지. allowedFiles 밖 금지**" 명시 + ACR boundary-check(`lib/worktree/boundary-check`)로 allowedFiles 위반 차단.
- **수용기준**: task가 expected_output에 없는 바이너리/디렉토리 생성 시 boundary_violation.

### P5 — ACR 진짜 worktree 격리 (ACR repo) ★P1 선행조건
- **문제**: ACR이 **main 체크아웃을 직접 checkout/commit**. 중단 시 acr 브랜치+미커밋 생성물 잔존 → 만성 409, 병렬 불가.
- **변경 위치**: `app/api/runner/prepare/route.ts:75-77`(clean-cwd 409 체크) 및 prepare 로직 — `git worktree add <임시디렉토리>`로 **별도 디렉토리**에 격리하고 거기서 실행, finalize에서 base로 merge 후 worktree 제거.
- **수용기준**: main 체크아웃은 항상 base 브랜치+clean 유지, 동시 N worktree 가능, 중단해도 main 무오염.
- **리스크**: 중~상. 기존 in-place 동작과 호환 어댑터 필요. `docs/`의 git-acr-cleanup.sh와 정합.

### 우선순위 요약
```
즉시(pulk, 저위험):     P2(TINY→codex), P3 전반부(grounding 경량화)
본체(ACR, 고효과):      P5(worktree 격리) → P1(병렬 runner)
품질:                   P3 후반부(연속성 ACR 강제), P4(scope-creep)
```

---

## 4. 실험 재개/정리 정보 (현재 상태)

- **business 7** = `AI Slide Video Factory`, repo_path `/Users/wonminyang/ai-slide-video-factory` (business 3은 더미라 분리 생성).
- Reels PRD agent_tasks 15개: **done 1, needs_review 1, 나머지 13 동결**(`approval_required=true`). 대상 repo는 base `feat/v2-cmo-pipeline`에 SKILL.md 등 부분 산출 커밋됨.
- **ACR phase-runner는 중단(bootout) 상태.** 재개: `launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.l5.acr-phase-runner.plist`
- ACR 잡 큐: `agent_control_room_docs/data/phase-runner-queue.json` (현재 비움 `[]`, 백업 `*.bak-*` 존재).
- 재개 시 주의: 대상 repo cwd가 clean + base 브랜치인지 먼저 확인(아니면 FF+clean). ACR 중단은 거의 항상 cwd를 더럽힘 → P5 전엔 수동 정리 필요.
- 라이브 dispatch 경로: `cto:planMessage`→`cto:approvePlan`→hermes `task-dispatcher`(60s)→`runCTOAgent`(agent-runtime dist)→ACR. 토큰: launchd plist의 `NOCOBASE_TOKEN`.

---

## 5. 핵심 교훈
1. **phase 수를 줄여도 직렬이면 월클락은 안 준다** — 병렬화가 본체.
2. **에이전트 행동(노트 작성 등)은 프롬프트 지시로 보장 안 됨** — 시스템(ACR)이 강제해야 함.
3. **분류 개선이 런타임(codex→claude)을 바꿔 역효과** 날 수 있음 — 템플릿 runtime을 같이 봐야 함.
4. **ACR가 main 체크아웃을 직접 쓰는 구조**가 만성 409·병렬 불가·중단 오염의 공통 뿌리 → worktree 격리가 다수 문제를 동시 해결.
