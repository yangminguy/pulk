# index · api

- ACR Kernel API (3개): `POST /api/execution-runs`, `GET /api/execution-runs/:run_id`, `POST /api/execution-runs/:run_id/result`.
- founder-ui API 클라이언트: `apps/founder-ui/src/lib/api.ts`.
- NocoBase REST: `:create`는 client id 무시. GET 핸들러는 `ctx.request.query` 우선.
- 외부 자동화: Activepieces/webhook (`services/automation-connectors`).
- 상세 계약: PRD §9, `docs/ACR_KERNEL_REFACTOR_PLAN.md`.
