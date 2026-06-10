# CTO Native Orchestration — 구현 현황

> ACR(별도 Next.js 앱)을 은퇴시키고, CTO가 나눈 phase를 Claude Code(CLI/Workflow)가 직접 실행하는 경로.
> 설계 근거: `CTO_NATIVE_ORCHESTRATION_ASSESSMENT.html`. 실행 계획: `~/.claude/plans/parsed-orbiting-cookie.md`.
> 상태(2026-06-10): S2·S3·S4 코드 + 정적검증 완료. 라이브 스모크 진행 중. **기본 비활성(비파괴)**.

## 무엇을 하나 (한 줄)

CTO Brain은 그대로 PRD→phase 분해→`ACRIntent` 생성. **dispatch 경계만** ACR HTTP 대신 로컬 Native Orchestrator로 교체.
phase별 worktree 격리 + phase.runtime(claude/codex/antigravity) CLI를 직접 spawn + 토큰 소진 시 fallback/회복 + verify·merge.

## 활성화 (비파괴 A/B)

- `services/agent-runtime/src/agents/cto.ts:637` — `NATIVE_ORCHESTRATION==='on'` 이면 `dispatchToNativeOrchestrator(acrIntent)`, 아니면 기존 `dispatchToACR`. flag off면 **기존 동작 100% 불변**.
- 즉 `NATIVE_ORCHESTRATION=on` 환경에서만 새 경로. ACR과 동시 비교 가능.

## 파일 맵

### 순수 로직 — `packages/l5-core/src/functions/cto-native/` (NocoBase 없이 테스트 가능)
| 파일 | 내용 | 이식 출처(ACR repo) |
|---|---|---|
| `types.ts` | MainAgent/ModelId/TaskKind/CliCommand/AgentPoolState/WaitingTask/RecoveryDecision 등 계약 | — |
| `cli-command.ts` | `buildAgentCommand(input)→CliCommand` — claude `-p`(+session/model), codex `exec --cd`(stdinNull=true), agy `--sandbox --add-dir -p` | `lib/runner/spawn-runner.ts` buildCommand |
| `model-map.ts` | `agentForTaskKind`, `modelForTask` — TaskKind→에이전트+모델(**opus-4-8**, codex gpt-5.5, gemini) | `lib/agents/agent-model-router.ts` |
| `fallback.ts` | `recommendFallbackAgent`, `getFallbackChain`(3단계) — 죽은 풀→살아있는 풀 인계 | `lib/agents/agent-fallback-selector.ts` |
| `recovery.ts` | `decideRecovery({task,pools,nowIso})→{action:run/handoff/wait}` — 결정론적 회복/인계 | `lib/agents/recovery-scheduler.ts`(dry-run→실행결정) |

테스트: `cto-native/__tests__/` — **62 passed** (cli-command 12, model-map 28, fallback 9, recovery 13).

### 실행 레이어 — `services/agent-runtime/src/orchestrator/` (child_process/git 부작용)
| 파일 | 내용 |
|---|---|
| `spawn-agent.ts` | `runAgentCommand(cmd,opts)` — spawn(shell:false), `stdinNull`이면 stdin 'ignore'(codex 블록 방지), 타임아웃 SIGTERM→SIGKILL→124 |
| `worktree.ts` | `createPhaseWorktree`/`mergePhaseWorktree`/`removePhaseWorktree` — git worktree |
| `phase-prompt.ts` | `buildPhaseExecutionPrompt(phase,opts)` — prompt_packet에 codex/agy 호출 가이드(`< /dev/null` 포함)+cwd+allowedFiles 주입. 순수, 테스트 5/5 |
| `native-orchestrator.ts` | `dispatchToNativeOrchestrator(intent,deps?)` — phase 순회: 승인게이트→worktree→buildAgentCommand→runAgentCommand→decideRecovery(handoff)→verify→merge. 전부 graceful |
| `index.ts` | 배럴 |

## 검증 현황

- ✅ `cto-native` jest **62/62**, `orchestrator` jest **16/16**(phase-prompt 5 + recovery-loop 11), agent-runtime `tsc --noEmit` **0 errors**.
- ✅ seam 비파괴 확인 (flag off = 기존 dispatchToACR).
- ✅ **라이브 3풀 모두 PASS** (2026-06-10): 더미 repo에서 1 phase end-to-end(worktree→CLI spawn→파일작성→결정론 verify→base 머지→worktree 정리).
  - claude 풀: `greet.ts` (commit f301dc3) · codex 풀: `~/l5-pool-codex` `add.ts` (6d55ca5) · agy 풀: `~/l5-pool-agy` `sub.ts` (4d6aa33).
- ✅ **handoff 인계 배선**: `native-orchestrator.ts`가 `decideRecovery`+`deps.pools` 연결 — (c-2) spawn 전 풀 소진이면 fallback 에이전트로 갈아탐, (e) 런타임 실패 후 1회 handoff 재시도. 살아있는 풀이 끌어감.
- ✅ **상주 운전 코드**: `orchestrator/recovery-loop.ts`(`planNextPoll` 순수, 11 tests), `scripts/native-orchestrator-daemon.mjs`(큐 폴링+회복 대기), `launchd/com.l5.native-orchestrator.plist`(RunAtLoad+KeepAlive), `docs/cto/CTO_NATIVE_RESIDENT.md`(켜는 법). **launchctl 등록은 사장님 손에**(코드만 준비).
- 🐞 라이브에서 실버그 1건 발견·수정(collectDiff): 신규 untracked 파일이 `git diff --stat`에 안 잡혀 모든 new-file phase가 조용히 머지 실패할 뻔 → `git add -N`(intent-to-add)로 수정. 정적검증으론 못 잡았을 버그.
- ⚠️ 미검증/남음: 다중 phase **의존순·병렬**(`canParallelize`) 실제 적용, 데몬 **무인 장시간 가동**(launchctl 등록 후), 토큰 budget 루프, ACR 동등성 확인 후 `dispatchToACR` 은퇴.

## 검증된 사실 (PoC + 환경)

- claude/codex/agy **3개 풀 모두 설치·구독 세션 동작**(API 키 미주입). codex는 `< /dev/null` 필수(stdin 블록).
- S0 PoC: phase 분할+병렬+모델라우팅+codex 호출+통합게이트 동작, 월클락 2분30초(ACR 직렬 동급 ~6분48초 대비 단축).

## 남은 일 (다음 세션)

1. **라이브 스모크 결과 반영** → orchestrator 실작동 확정.
2. **S5 상주화**: Phase Orchestrator를 launchd(`com.l5.*`)로 무인 운전 + ScheduleWakeup 회복 루프 실배선.
3. 다중 phase 병렬(`canParallelize`)·토큰 budget 루프·codex/agy 라이브 풀 통합.
4. ACR 동등성 확인 후 `dispatchToACR` 경로 단계적 은퇴.
