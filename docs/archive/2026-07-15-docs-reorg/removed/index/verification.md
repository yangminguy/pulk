# index · verification

전체: PRD §13, rule `40-verification-policy.md`.

- Checks passed = Done. 에이전트 선언은 완료 조건 아님.
- 명령: `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` · `pnpm test:e2e`.
- 작업유형별 프로파일은 `40-verification-policy.md` 표 참조.
- 실패 시 log tail + artifact 저장. UI 실패는 locator suggestion만(자동수정 X).
- 모든 scoring rule은 단위테스트 필수(`packages/l5-core`).
