# 40 · Verification Policy

"Agent says done" ≠ Done. Checks passed = Done.

작업유형별 필수 검증:
| 유형 | 검증 |
|---|---|
| 문서 | markdown/boundary |
| API | typecheck, unit test, build |
| UI | typecheck, build, Playwright smoke |
| DB/schema | migration dry-run, typecheck, integration |
| runner/ACR | unit test, local run sim, boundary |
| 보안/권한 | strict checks, human approval |

명령: `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` · `pnpm test:e2e`.
모든 scoring rule은 단위테스트 필수. 검증 통과 전 완료 선언 금지.
