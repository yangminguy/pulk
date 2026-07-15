# index · architecture

전체: `docs/ARCHITECTURE.md`.

- Shell: NocoBase (`apps/nocobase-app`). DB: PostgreSQL.
- 도메인 로직: `packages/l5-core` (NocoBase 없이 테스트 가능해야 함).
- Agent Runtime: Mastra (`services/agent-runtime`).
- Hermes Runtime: Trigger.dev (`services/hermes-runtime`) — 감시/요약, 코드 수정 금지.
- 흐름: Founder UI → CTO Brain → ACR Kernel → Verifier → Result Packet → pulk 상태.
- 신규 기능 배치는 `docs/ARCHITECTURE.md` 규칙 따름.
