# index · db

전체: `docs/DATA_MODEL.md`, `schemas/`.

- DB: PostgreSQL. 엔티티 스키마는 `schemas/`(portable).
- 고객 PII와 재사용 인사이트 분리. 모든 고객 record는 `pii_level`.
- NocoBase 타임스탬프: `createdAt`(camelCase). `created_at` 정렬 = 빈배열 버그.
- migration apply는 금지 명령 — 승인 필요. dry-run만 자동.
- FK 빡센 시드는 psql 직접(REST `:create` 우회).
