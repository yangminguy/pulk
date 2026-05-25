# HANDOFF — L5 Business OS

최종 업데이트: 2026-05-26 (full-build 세션)
검증 담당: worker-6. 상세 검증 결과는 `docs/QA_REPORT.md` 참조.

## Current State (true state)

MVP의 핵심 판단 로직(`packages/l5-core`)이 구현·테스트·실행까지 검증 완료되었다.
NocoBase Shell, Agent Runtime, Hermes Runtime은 scaffold 단계로, 실제 런타임 연동은
다음 iteration 대상이다.

검증된 사실 (worker-6 직접 실행):

- `pnpm install` 성공 (pnpm@9.15.0, 281 packages)
- `pnpm --filter @l5/core typecheck` → 에러 0
- `pnpm --filter @l5/core build` → `dist/` 정상 생성
- `pnpm --filter @l5/core test` → 5 suites / 42 tests PASS
- `pnpm demo` → 전체 루프 정상, exit 0

## What Was Built

### 1. l5-core (구현 완료, 검증됨)

`packages/l5-core/src/functions/`:

- `scoreFounderFit` — 아이디어 vs Founder DNA 적합도 (interest/skill/risk fit)
- `calculatePmfScore` — PMF 메트릭 → 점수/신호 강도
- `decideToolCandidate` — PMF/반복/시간 hard gate 기반 툴 후보 판정
- `requiresFounderApproval` — 의사결정 타입 + risk level → 승인 게이트
- `generateBusinessBrief` — 아이디어/적합도/메모리 → Markdown 브리프

전 함수 unit test 존재 (42 tests).

### 2. MVP Demo (실행 검증됨)

`scripts/demo-mvp-loop.ts` — `Idea → FounderFit → Brief → PMF → Approval Gate → Tool Candidate`
샘플 데이터 end-to-end 시뮬레이션. 외부 호출/부수효과 없음. PII high 레코드는 REDACTED.

실측 결과: Founder Fit 69, PMF 61(medium), Approval REQUIRED(founder_only), Tool Candidate YES(high).

### 3. NocoBase 플러그인 9종 (scaffold)

`apps/nocobase/packages/plugins/@l5/`: founder-dna, business-portfolio, pmf-experiment,
workflow-factory, agent-staffing, hermes-control-room, bpr-engine, tool-request, memory-room.
각각 README + `src/server/index.ts` + `src/client/index.ts`, `@l5/core` workspace 의존.

### 4. Agent / Hermes Runtime (scaffold)

- `services/agent-runtime`: CEO, Chief-of-Staff, CMO, CTO, Risk-QA 에이전트 스텁
- `services/hermes-runtime`: morning-operating-loop, night-bpr-loop, stalled-workflow-detector,
  pmf-deadline-checker, approval-required-checker

## PRD Completion Status

| 영역 | 상태 |
|------|------|
| 핵심 scoring/judgment 로직 | 100% (5개 함수 구현+테스트) |
| MVP 운영 루프 demo | 100% (실행 검증) |
| PII / Business Insight 분리 | 100% (필드 + demo 분리) |
| 승인 게이트 / risk level | 100% (로직 + demo) |
| NocoBase 플러그인 | ~30% (scaffold만, 런타임 미검증) |
| Agent/Hermes runtime | ~20% (scaffold만, 연동 미구현) |
| Observability(Langfuse)/PMF Signal(Formbricks) | 0% (Phase 6-7, 미착수) |

PRD Success Metrics 10개 중 6개(1,2,6,8,9,10)는 로직 완료, 4개(3,4,5,7)는 scaffold/부분.

## How to Run Locally

```bash
# pnpm 9.15.0 필요 (corepack)
export PATH="$HOME/.corepack-bin:$PATH"   # corepack shim 경로 (worker-1 설치 환경)
corepack enable --install-directory $HOME/.corepack-bin pnpm   # 미설치 시

# 설치
pnpm install

# l5-core 검증
pnpm --filter @l5/core typecheck
pnpm --filter @l5/core build
pnpm --filter @l5/core test

# MVP 데모 실행 (핵심 루프 시뮬레이션)
pnpm demo
```

## Remaining Blockers / Risks

- **NocoBase CE 미설치** (H1): 플러그인 동작 검증 불가. 플러그인 개발 경로는 Docker가 아닌
  source install이 필요할 수 있음. PostgreSQL 동반 필요.
- **Agent/Hermes 외부 의존** (H2): Mastra, Trigger.dev 실제 연동 및 LLM API 키 필요.
  어댑터 뒤로 격리할 것.
- **catalog 프로토콜** (M2): pnpm 9.5+ 필수. `packageManager`를 9.15.0 미만으로 내리지 말 것.
- **PII 정책**: customer PII를 LLM trace/외부 도구로 광범위 전달 금지. demo의 REDACTED 패턴 유지.

## Next Steps

1. NocoBase CE + PostgreSQL 로컬 설치, 플러그인 개발 경로 확정 (Phase 1).
2. core collections + Founder DNA Room / Business Portfolio / PMF Board 구현.
3. 플러그인이 `@l5/core`를 호출하도록 server/client 로직 채우기 (로직 중복 금지).
4. `generateWorkflow`, `generate7DayExperiment`, `assignAgents` l5-core 함수 구현 (PRD 메트릭 3).
5. Mastra/Trigger.dev 어댑터 격리 후 runtime 연동.

## Recommended Branch / Commit

- 브랜치: `feat/mvp-core-and-scaffolds`
- 커밋 메시지 후보:
  `feat: l5-core scoring logic verified + NocoBase/agent/hermes scaffolds + MVP demo loop`
