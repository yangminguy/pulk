# Harness Utilization Map

pulk CTO가 무엇을 할지 정하고, ACR Harness가 어떻게 안전하게 시킬지 강제한다.
이 문서는 Claude Code 기본기(hook/command/skill/subagent)가 Harness 14단계(PRD §14.3)의 어디에 매핑되는지 정리한다.

## 14단계 ↔ 메커니즘

| # | Harness 단계 | 매핑되는 메커니즘 |
|---|---|---|
| 1 | Validate Work Order | `validateWorkOrder` (harness-pipeline) |
| 2 | Select Context Pack | `selectContextPack` (context-harness, §14.7) — **context팩이 슬래시커맨드 역할 대체** |
| 3 | Check Approval | `RunHarnessOptions.isApproved` (strict rail 게이트) |
| 4 | Select Harness Mode | `MODE_RAILS` (direct/safe_solo/standard/strict/parallel_patch) |
| 5 | Create Workspace | `provisionWorktreeForRun` (worktree 격리) |
| 6 | Apply Command Guard | **PreToolUse hook** `command-guard-hook.mjs` + `checkCommands` (§14.8/§19.1) |
| 7 | Run Agent Adapter | `AgentRunner` (subagent/메인에이전트 실행) |
| 8 | Collect Logs | pipeline log 수집 |
| 9 | Collect Diff | `finalizeRunDiff` |
| 10 | Run Verification | `runVerification` (skill: validation-gate에 대응) |
| 11 | Check Boundary | `finalizeRunDiff` boundary 검사 |
| 12 | Generate Result Packet | `settle` → ExecutionResultPacket |
| 13 | Generate Handoff | `generateHandoff` (skill: handoff-summary에 대응) |
| 14 | Return to pulk CTO | HarnessOutput 반환 |

## 메커니즘별 역할

- **Hook (PreToolUse, enforce)**: `command-guard-hook.mjs`가 stdin JSON에서 Bash command를 추출해 §19.1 금지패턴이면 비제로 exit으로 차단. 정상 dev 명령(pnpm build/test, git status/add/commit)은 통과. 단계 6의 실시간 강제 장치.
- **Command (슬래시커맨드)**: 인터랙티브 세션 전용. 헤드리스 ACR에서는 사용 불가.
- **Context Pack (슬래시커맨드 대체)**: 헤드리스 ACR은 슬래시커맨드를 못 쓴다. 대신 `selectContextPack(workType)`이 작업유형별 rules+docs/index만 골라 프롬프트에 주입한다. 즉 **context팩 + 프롬프트가 헤드리스 환경에서 슬래시커맨드/스킬의 역할을 한다**.
- **Subagent (메인에이전트)**: 단계 7의 `AgentRunner`. CTO가 Claude Code/Codex/Antigravity/Hermes를 배정하고, 각 메인에이전트는 내부에서 sub-agent/team을 선택적으로 사용(2-level orchestration).
- **Skill**: 인터랙티브 보조. validation-gate ↔ 단계 10, handoff-summary ↔ 단계 13에 개념적으로 대응하지만, 헤드리스 실행에서는 pipeline 함수가 직접 수행한다.

## 핵심

```
인터랙티브: 슬래시커맨드 + 스킬로 단계 트리거
헤드리스 ACR: context팩(selectContextPack) + 프롬프트 + PreToolUse hook이 동일 역할을 강제
```

관련 코드(ACR repo): `lib/harness/harness-pipeline.ts`, `lib/harness/context-harness.ts`, `lib/harness/command-guard.ts`, `scripts/hooks/command-guard-hook.mjs`, `.claude/settings.json`.
