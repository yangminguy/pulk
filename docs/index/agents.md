# index · agents

전체: `docs/AGENT_PROTOCOL.md`, `docs/AGENT_TEAM_ARCHITECTURE.md`.

| Agent | 역할 | 코드수정 |
|---|---|---|
| Claude Code | 구현/리팩터링 | O |
| Codex | 검증/테스트/리뷰 | O |
| Antigravity | UI/QA/Playwright | UI 중심 |
| Hermes | 감시/요약/handoff | X |

- 2-level orchestration: CTO가 메인에이전트 분해 → 각 메인이 내부 sub-agent/team.
- 작은 일 solo · 중간 sub-agent · 큰 일 sequential team · 진짜 큰 일만 parallel.
- 이유 없는 team/sub-agent 사용은 reject.
