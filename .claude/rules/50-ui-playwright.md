# 50 · UI / Playwright

- founder-ui: `apps/founder-ui` (Next.js). Playwright 설치됨.
- 실행: `corepack pnpm exec node e2e/*.mjs`로 브라우저 검증.
- UI 작업만 Playwright smoke. 전체 regression 강제 금지.
- 실패 시 artifact 저장(screenshot, dom-snapshot, error). 자동수정 금지 — locator 후보만 제안.
- selector는 role/testId 중심. 불안정한 `.class` selector 지양.
- 도메인 로직을 UI 컴포넌트에 넣지 않는다(Founder Fit/PMF/BPR/Memory/Tool Request 금지).
