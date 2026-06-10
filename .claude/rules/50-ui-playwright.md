# 50 · UI / Playwright

- founder-ui: `apps/founder-ui` (Next.js). Playwright 설치됨.
- 실행: `corepack pnpm exec node e2e/*.mjs`로 브라우저 검증.
- UI 작업만 Playwright smoke. 전체 regression 강제 금지.
- 실패 시 artifact 저장(screenshot, dom-snapshot, error). 자동수정 금지 — locator 후보만 제안.
- selector는 role/testId 중심. 불안정한 `.class` selector 지양.
- 도메인 로직을 UI 컴포넌트에 넣지 않는다(Founder Fit/PMF/BPR/Memory/Tool Request 금지).

## CDP 크롬 (발굴: viewtrap/youtube/GCP, 포트 9222)
- **항상 화면 밖에서 운전.** 창/탭 생성 직후 즉시 `Browser.setWindowBounds {left:-4000,top:0,width:1280,height:900,windowState:'normal'}`. 사용자 화면 점유 금지(명시 요청 2026-06-10).
- `Page.bringToFront`·양수좌표 `setWindowBounds`로 창을 보이게 하지 말 것. 스크린샷은 `Page.captureScreenshot`로 화면 밖에서도 캡처됨.
- 예외: 사용자 수동 로그인 등 직접 조작 필요 시만 양해 후 일시적 화면 안 → 끝나면 즉시 -4000px 복귀.
- 크롬 149+ `connectOverCDP`는 `setDownloadBehavior` 거부 → page WebSocket raw CDP(`/json/list`의 webSocketDebuggerUrl + Runtime.evaluate)로 운전. 탭 0개면 `PUT /json/new?<url>`로 생성.
- viewtrap 인증 인메모리 → 로그인 탭 새로고침/재이동 금지(in-app 검색만).
