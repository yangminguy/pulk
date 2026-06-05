# L5 자율 개발 — 속도 전략 (병목 분석 + 다음번 빠르게 하는 법)

작성: 2026-06-04. CMO Video Room 158-phase 자율 실행을 끝까지 돌리며 **실제로 겪은** 병목과 해결책을 시니어 관점에서 정리. 다음 PRD를 처음부터 빠르게 돌리기 위한 실행 전략.

> 결과 요약: 처음엔 정체·오탐·고아·손상으로 **거의 안 움직였고**, 병목을 하나씩 제거하니 **+5/27분 → +21/27분(4배 가속)** 으로 빨라져 완주. 즉 **속도는 작업 난이도가 아니라 오케스트레이션/게이트/모델 배분에서 결정**됐다.

---

## 핵심 병목 (영향 큰 순) + 겪은 증상 + 해결

### 1. 과도한 phase 분해 — **최대 비용/시간 낭비**
- **증상**: 작은 컴포넌트(카드 1개)까지 6단계(조사→스펙→실패테스트→구현→리뷰→커밋). 28기능×6=158 phase. 각 phase = 별도 CLI 콜드스타트 + 컨텍스트 재로딩. 조사/스펙/리뷰/커밋 4개는 **코드를 안 만들고** 토큰만 씀.
- **근본**: CTO가 전부 `FEATURE`(6단계)로 분류. SOP가 큰 변경엔 맞지만 작은 UI엔 과설계.
- **다음번 해결**: `classifyTask`/`selectModelTier`(cto.ts·l5-core)를 강화해 단일 컴포넌트/카드/유틸은 `TINY`(2: 구현,커밋) 또는 `SMALL_FIX`(3). CTO 기획 프롬프트에 "작은 작업은 조사·스펙·리뷰를 구현에 흡수" 지시. → phase 절반↓ = 토큰·시간 절반↓.

### 2. 콜드스타트 + 컨텍스트 재사용 0
- **증상**: phase마다 새 CLI가 코드베이스를 처음부터 다시 읽음. claude 콜드스타트만 수십 초.
- **근본**: warm session(`--resume`)이 꺼져 있었음(`ACR_WARM_SESSIONS` 미설정).
- **해결(적용함)**: `ACR_WARM_SESSIONS=1` → plan 내 claude phase가 컨텍스트 재사용.

### 3. no-op phase가 "빈 산출물"로 막힘
- **증상**: 커밋/리뷰/조사 phase가 파일변경 0 → verifier가 emptyOutput으로 `review_blocked` → plan이 done에 영영 못 감. 게다가 빈 출력을 **2회 재시도**(2배 토큰).
- **해결(적용함)**: 비-코드 phase(commit/review/research/spec)는 `expectsChanges=false`로 처리(`route.ts`) → done 통과. `ACR_MAX_ATTEMPTS=1`로 재시도 제거.
- **다음번**: 애초에 작은 작업엔 이 phase들을 **생성하지 않기**(1과 연결).

### 4. 안전 게이트 3종이 내부 코딩을 오탐·차단
- **증상**: ① `dangerous-command-detector`가 프롬프트에 `token/secret/deploy/migrate` **단어만 있어도** 차단. ② `risk-classifier`가 D2 내부 코딩을 D4로 격상 → skip. ③ 게이트가 차단할 때 **task를 'running'으로 방치 → 고아**.
- **근본**: 게이트가 "외부 위험 작업"용인데 격리 worktree 내부 코딩에도 적용. L5가 이미 승인한 작업에 중복 게이트.
- **해결(적용함)**: dangerous-command 게이트 `ACR_DANGER_GATE` 기본 off. risk 격상은 L5 승인(auto_execute) 작업이면 통과. 단어매칭 패턴을 명령/할당 컨텍스트로 한정.
- **다음번**: 게이트는 **D4/D5 외부/결제 작업에만** 적용. 내부 D2 코딩은 게이트 스킵을 기본값으로. self-mod 보호(gate/.env)는 l5-core deny로 별도 유지.

### 5. 오케스트레이션이 작업을 잃고 정체
- **증상(반복)**: ACR `planDrainLock`(인메모리) + `/api/runner`가 긴 HTTP 1회로 inline spawn → 연결 끊김/행 시 **락이 남아 전체 정체**. acr-web 재시작으로만 해제되고, 재시작 시 진행 중 phase 폐기·재실행(토큰 낭비). 고아 'running'이 동시성 슬롯을 막아 데드락.
- **근본**: 인메모리 락 + inline-HTTP + 행 감지/타임아웃 부재.
- **임시 해결(적용함)**: 드라이버가 CLI 비활성 4틱 정체 시 acr-web 재시작 + 고아 running→planned 힐. 17분 ORPHAN timeout 안전망.
- **다음번(근본)**: 인메모리 락 → **파일/DB 잡 큐 + 워커**(local-runner 골격 활용). dispatch는 enqueue 후 즉시 반환, 워커가 처리. 행은 하트비트+타임아웃으로 큐에서 정리(재시작 불필요).

### 6. 비원자적 JSON 쓰기 → 손상
- **증상**: 병렬 드레인이 `execution-logs.json` 동시 쓰기 → "Extra data after JSON" 손상 → ACR 라우트 연쇄 실패.
- **해결(적용함)**: 핫 스토어(execution-log/feature-plan/cto-task-metadata) **원자적 쓰기(temp+rename)**.
- **다음번**: 모든 스토어 공용 원자적 write + 인프로세스 mutex(잃은 업데이트 방지).

### 7. 모델/쿼터 미스매치 (속도 직접 타격)
- **증상**: codex(T2) 쿼터 소진(usage limit), agy가 **소진된 "Claude Sonnet 4.6 (Thinking)" 모델로 고정**돼 빈 출력. tier 라우팅이 쿼터 무시하고 죽은 에이전트로 계속 보냄 → 폴백·재시도 낭비.
- **해결(적용함)**: agy settings.json 모델 = **"Gemini 3.1 Pro (High)"**(풍부). 비-코드 phase는 agy(Gemini)로, 핵심 구현은 claude. codex 다운 동안 pending codex→claude 라우팅.
- **다음번(근본)**: dispatch 전 **쿼터 인지 라우팅** — `getAgentRuntime` + agy 모델 쿼터(`agy models`/대시보드)를 보고 **가용 모델 선택**. 풍부한 모델(Gemini)에 bulk, 희소한 모델(claude/codex)에 핵심만. 모델별 쿼터를 드라이버가 추적.

### 8. 병렬 worktree의 통합 부채
- **증상**: 4 worktree 병렬이 빨랐지만, 공유 통합 파일(Sidebar, AgentOutputDetail, 페이지, package.json)을 각자 독립 수정 → 마지막에 병합 충돌. (다행히 대부분 가산적이라 union으로 해결, 락파일만 수동.)
- **근본**: 병렬 작업이 같은 통합 지점을 건드림.
- **다음번**: ① 통합 지점(공유 컴포넌트/라우터/스키마)을 **먼저 1회 셋업**(직렬)하고, 그 위에서 기능별 병렬. ② 또는 기능별 파일 경계를 강하게(각 기능은 자기 폴더만) 잡아 충돌 면적 축소. ③ 통합 자동화(주기적 머지 + union 리졸버).

---

## 다음번 "처음부터 빠르게" 체크리스트

부팅 시 한 번에 세팅(이번엔 하나씩 발견하느라 느렸음):
1. **게이트**: 내부 D2 코딩은 dangerous-command/risk 게이트 스킵(`ACR_DANGER_GATE=0`, L5승인 통과). self-mod deny만 유지.
2. **모델**: 가용 쿼터 먼저 확인(claude CLI / codex / agy `agy models`+대시보드). agy 모델을 가용 Gemini로. tier 라우팅을 **가용성 기준**으로(희소 모델엔 핵심만).
3. **phase**: 작은 작업은 2~3단계로 분류. 비-코드 phase는 `expectsChanges=false`.
4. **세션**: `ACR_WARM_SESSIONS=1`, `ACR_MAX_ATTEMPTS=1`.
5. **저장**: 원자적 쓰기 확인.
6. **동시성**: API 쿼터에 맞춰 캡(쿼터 빡세면 2, 여유면 ↑). worktree 격리 + 통합지점 선셋업.
7. **드라이버**: CLI-활성 기준 stall 감지 + 고아 힐 + 단일 plan 직렬/worktree 병렬.
8. **알림**: 실패+기능완료+최종만, 진행률·사업·프로젝트·단계 포함(phase별 스팸 off).

> 한 줄 결론: **느렸던 진짜 이유는 코딩이 아니라 (a) 과한 phase 분해, (b) 죽은 모델로 라우팅, (c) 게이트 오탐+고아, (d) 인메모리 락 정체** 였다. 이 넷을 처음부터 막으면 다음번은 몇 배 빠르다.

관련: `docs/CMO_SPEED_OPTIMIZATION_PLAN.md`, 메모리 `l5-cmo-worktree-execution`.
