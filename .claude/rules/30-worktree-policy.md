# 30 · Worktree Policy

에이전트는 main repo를 직접 수정하지 않는다. run마다 독립 worktree.

- branch 규칙: `agent/{taskId}-{runId}`.
- 허용: `allowedFiles` 내부 + worktree 내부 + 관련 테스트 파일.
- 금지: `.env`, `node_modules`, `.git` 직접, lockfile 무단, base branch 직접, main repo 직접.
- blocked file 수정 감지 → `status=boundary_violation`, 실행 중단, human review.
- git 커밋/푸시는 오케스트레이터 소유. 에이전트는 금지.
