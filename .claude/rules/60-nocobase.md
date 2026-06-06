# 60 · NocoBase

NocoBase는 Shell로만 사용. 영구 brain이 아니다. core 수정 금지(명시적 필요시만).

- 라이브 플러그인: `apps/nocobase-app/packages/plugins/@l5/`.
- `apps/nocobase/`는 legacy 참조용. workspace QA 제외.
- 함정: `defineCollection`은 `createdAt`(camelCase). `created_at` 정렬 시 조용한 빈배열 버그.
- dist 패칭: src 수정 후 `dist/plugin.js` 직접 패치. GET은 `ctx.request.query` 우선.
- REST `:create`는 client id 무시. FK 빡센 시드는 psql 직접.
- MVP-critical 기능에 상용 플러그인 금지.
