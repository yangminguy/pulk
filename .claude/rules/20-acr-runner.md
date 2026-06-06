# 20 · ACR Runner (Executor)

ACR은 planning brain이 아니다. CTO Work Order를 받아 다음만 수행한다.

`받는다 → 격리(worktree) → 실행 → 검사 → result packet 반환`

- ACR repo: `/Users/wonminyang/Desktop/양원민 개발자/agent_control_room_docs`.
- 헤드리스 ACR은 슬래시커맨드를 못 쓴다. context pack + 프롬프트가 그 역할.
- pulk에서 ACR 호출부: dispatch 경로(`@l5/plugin-orchestration`, hermes task-dispatcher).
- ACR 실행 결과는 pulk task 상태로 회수. ACR을 메인 대시보드로 쓰지 않는다.
