# TRD 하위 — 오케스트레이션 실행 방식

> [TRD.md](../TRD.md)로 돌아가기.

## CTO Native Orchestration (2026-06-10 전환)

이전에는 별도 실행 앱(ACR, Agent Control Tower)이 phase를 순차 실행했으나, "단일 직렬 phase-runner + phase마다 cold spawn" 구조가 병목이었다. Claude Code(headless CLI)가 phase를 직접 실행하는 방식으로 전환했고, 실측 6분 48초 → 40초(약 10배 개선)를 확인했다. `NATIVE_ORCHESTRATION` env flag로 비파괴 A/B 전환.

핵심: worktree 격리는 **task 단위가 아니라 phase 단위**로 하고, 병렬 실행 후 merge는 직렬화한다(동시 git merge 충돌 방지).

`services/agent-runtime/orchestrator/native-orchestrator.ts`가 `child_process.spawn`으로 headless claude CLI를 worktree 안에서 실행하는 실질적 오케스트레이터다. 상시 daemon은 `scripts/native-orchestrator-daemon.mjs` (`launchd/com.l5.native-orchestrator.plist`).

> 주의: `services/agent-runtime/src/agents/ceo.ts`는 "Mastra로 구현 예정" TODO가 남은 미완성 placeholder다. 실제 CEO 판단은 native-orchestrator 경로로 대체 수행되는 것으로 보이며, 코드 정리 후보([TASK.md](../TASK.md) 참고).

## Agent Team Orchestration (2-Level)

1. **1차 분해**: CTO가 PRD를 Work Package로 분해 (`decomposeLargePRDToPackages`)
2. **Main Agent 배정**: `selectMainAgent`가 claude-code / codex / antigravity 중 선택
3. **2차 오케스트레이션**: 각 Main Agent 내부에서 규모에 따라 solo → sub-agent → sequential team → parallel team 중 선택

원칙: "작은 일은 solo, 중간은 sub-agent, 큰 일은 sequential team, 진짜 큰 일만 parallel team."

## 임원 간 위임 (Executive Delegation, M6)

`ask_executive` 도구로 임원이 다른 임원에게 작업을 위임한다. CEO는 정책 승인 게이트만 담당하고, 루프 본체는 결정론적 컨트롤러(`runDelegationLoop`)가 담당한다: CTO가 제작 → CMO가 검증 → 실패 시 피드백 재투입, 최대 라운드 기본 3(상한 5). CEO의 LLM 판단이 루프 중간에 개입하지 않는다.

## 실행 안전 원칙

- 새 기능은 항상 env flag로 A/B 게이트한다 (`NATIVE_ORCHESTRATION`, `ACR_EXTERNAL_RUNNER`, `WORKFLOW_ORCHESTRATION` 등). 기존 경로를 유지한 채 신규 경로를 additive로 추가한다.
- 검증 문화: 모든 변경은 tsc 0 에러 + jest 통과 + (플러그인이면) `node --check`를 확인한 뒤 완료로 본다. "Agent says done ≠ Done. Checks passed = Done."
- 컬럼/스키마 변경보다 기존 경로 재사용을 우선한다. 예: acceptance criteria는 스키마 변경 없이 `expected_output`에 `[완료조건]` 블록으로 기록하고 verifier가 파싱한다. 컬럼 승격은 실제 데이터로 필요성이 입증된 뒤에만.

## 관련 문서

- 에이전트 역할/권한: [agent-protocol.md](./agent-protocol.md)
- 스케줄/워크플로우 팩토리: [workflow-hermes.md](./workflow-hermes.md)
