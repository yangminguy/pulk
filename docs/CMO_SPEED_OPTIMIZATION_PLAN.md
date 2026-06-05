# CMO 자율 실행 — 속도/토큰 최적화 계획

작성: 2026-06-04 (시니어 엔지니어 진단). CMO Video Room 158-phase 자율 실행을 관찰하며 도출.
대상 코드베이스: `~/Desktop/양원민 개발자/agent_control_room_docs`(ACR), `services/agent-runtime`(cto.ts), `~/l5-workspace/cmo-driver.mjs`(드라이버).

## 이미 적용됨 (즉시개선 B·C·D)

- **B. warm session ON** — acr-web `ACR_WARM_SESSIONS=1`. plan 내 claude phase가 `--resume`로 컨텍스트 재사용(콜드스타트/재로딩 감소). 단 claude 한정.
- **C. 비-구현 phase → Gemini(agy)** — pending phase 중 "구현" 외(조사/스펙/리뷰/커밋/테스트)를 `runtime=antigravity`로. agy 모델 = settings.json `~/.gemini/antigravity-cli/settings.json` = "Gemini 3.1 Pro (High)"(풍부한 쿼터). limited claude는 핵심 구현에만.
- **D. verifier 재시도 1회** — acr-web `ACR_MAX_ATTEMPTS=1`. 빈 산출물 phase의 2배 실행 제거.

---

## 다음 개발 (효과 큰 순)

### A. Phase 축소 — **최대 레버리지(3~6배)**
**문제**: CTO가 작은 컴포넌트(예: "Strategy Decision Panel 카드")까지 전부 `FEATURE`(6단계: 조사→스펙→실패테스트→구현→리뷰→커밋)로 분해. 28기능×6 = 158 phase. 각 phase = 별도 CLI 콜드스타트 + 전체 컨텍스트 재로딩. 작은 UI 카드에 6세션은 과설계.
**수정**:
1. `services/agent-runtime/src/agents/cto.ts` + `packages/l5-core` `classifyTask`/`selectModelTier`: 작은 작업(단일 컴포넌트/카드/유틸)을 `TINY`(2: 구현,커밋) 또는 `SMALL_FIX`(3~4)로 분류하도록 키워드/휴리스틱 강화. "카드/Card/UI/한 줄/상수" 등 → 경량 클래스.
2. CTO 기획 프롬프트(`buildDevWorkflowSystemPrompt`)에 "작은 작업은 phase를 합쳐라(조사·스펙·리뷰를 구현에 흡수)" 지침 추가.
3. 기존 plan 재생성은 비용 크므로, **다음 PRD부터 적용**(이번 CMO는 그대로 완주).
**기대**: phase 수 절반↓ → 토큰·시간 절반↓.

### E. 오케스트레이션 견고화 — 버린 토큰 회수
**문제**: ACR `drainAllPlans`/`planDrainLock`(인메모리 락) + `/api/runner`가 긴 HTTP 1회로 CLI를 inline spawn → 연결 끊김/행 시 락이 남아 전체 정체 → **acr-web 재시작으로만 해제**, 재시작 시 진행 중 phase 폐기·재실행(토큰 낭비). 드라이버가 이걸 ~6분마다 자동 재시작으로 땜질 중.
**수정**:
1. 인메모리 `planDrainLock` → **파일/DB 기반 잡 큐 + 워커**(이미 `local-runner-daemon.mjs` 골격 존재). dispatch는 큐에 넣고 즉시 반환, 워커가 처리 → 긴 HTTP·락 제거.
2. `/api/runner`의 inline-SSE-spawn → 잡 enqueue + 별도 워커 spawn. 연결 끊겨도 작업 유실 없음.
3. 행 감지: phase별 하트비트 + 타임아웃으로 dead run을 잡 큐에서 정리(재시작 불필요).
**기대**: 재시작에 의한 재실행 낭비 0, 정체 자가복구.

### 모델 라우팅 정교화
**문제**: agy 모델이 settings.json 전역 1개라 per-phase 선택 불가. 현재 Pro(High) 고정.
**수정**: ACR `lib/agents/antigravity-runner.ts` spawn에 **`--model` 플래그** 추가(이미 agy CLI 지원). 경량 phase(조사/스펙/리뷰)는 **Gemini 3.5 Flash**(더 싸고 빠름), 코딩 phase는 Pro/claude. `withAntigravityModel`로 per-call 전환. → 리빌드 필요.
**기대**: 경량 phase 토큰·지연 추가 절감.

### no-op phase 제거
**문제**: 커밋 phase(러너가 이미 커밋), "이전 세션에 이미 완료" phase = 빈 실행. 커밋은 이미 무력화(done 처리)했으나, **애초에 생성 안 하는 게 최선**.
**수정**: cto.ts 템플릿에서 작은 작업의 커밋/조사 phase 생략(A와 함께). read-only phase는 `expectsChanges=false`로 일관 처리.

### 쿼터 인지 스케줄링
**문제**: tier 라우팅이 쿼터 상태 무시(소진된 codex/claude로 계속 보냄 → 폴백·재시도 낭비). agy 모델도 소진된 Claude로 고정돼 있었음(이번에 Gemini로 수정).
**수정**: dispatch 전 `getAgentRuntime` 쿼터 + agy 모델 쿼터(`agy models`/대시보드)를 보고 **가용 모델로 사전 라우팅**. 드라이버 또는 auto-dispatcher에 쿼터 인지 추가.

---

## 운영 메모(이번 세션에서 고친 것들 — 회귀 방지)
- 안전게이트 3종(dangerous-command-detector 단어매칭, commit-phase 빈출력 오분류, risk D2→D4 격상)을 내부 D2 코딩에 대해 완화.
- ACR JSON 스토어 원자적 쓰기(동시 드레인 손상 방지).
- 펄크 격리 worktree 4개 병렬, 동시성 캡 2(쿼터 친화).
- 드라이버 stall은 **실제 CLI 활성** 기준(고아 running이 자동복구 막던 버그 수정).
- 알림: 실패+기능완료+최종만, 진행률·사업·프로젝트·단계 포함. 상세 = 메모리 `l5-cmo-worktree-execution`.
