# 50 · UI / Playwright

- founder-ui: `apps/founder-ui` (Next.js). Playwright 설치됨.
- 실행: `corepack pnpm exec node e2e/*.mjs`로 브라우저 검증.
- UI 작업만 Playwright smoke. 전체 regression 강제 금지.
- 실패 시 artifact 저장(screenshot, dom-snapshot, error). 자동수정 금지 — locator 후보만 제안.
- selector는 role/testId 중심. 불안정한 `.class` selector 지양.
- 도메인 로직을 UI 컴포넌트에 넣지 않는다(Founder Fit/PMF/BPR/Memory/Tool Request 금지).

## CDP 크롬 (발굴: viewtrap/youtube/GCP, 포트 9222)
- **항상 창을 숨겨서 운전.** 연결/탭생성 직후 `setWindowBounds {left:-4000,...,windowState:'normal'}` → 이어서 `setWindowBounds {windowState:'minimized'}`. macOS는 -4000을 화면 경계로 클램프(40px 노출)하므로 **minimized가 핵심**(데스크톱 완전 비가시). 사용자 명시 선호(2026-06-10 "창 숨겨서 하면 제일 좋아").
- 크롤링은 `Runtime.evaluate`(DOM)이라 minimized에서도 동작. 스크린샷 필요 시만 일시 normal 후 다시 minimized.
- `Page.bringToFront`·양수좌표 normal 유지 금지. 헬퍼: `~/.l5/cdp/cdp-hide-windows.mjs`(정본 services/youtube/scripts/), 어댑터는 cdp.ts `moveOffscreen()`.
- **자동 인프라**: launchd `com.l5.cdp-chrome`(RunAtLoad+KeepAlive) → 부팅/크롬사망 시 자동 기동·재기동·자동숨김. 스크립트는 `~/.l5/cdp/`(macOS TCC가 launchd의 ~/Desktop 접근 차단 → 레포 밖 복사본 필수). 구글 로그인은 chrome-cdp 프로필 쿠키로 persist, viewtrap은 구글 OAuth라 자동 재로그인.
- 크롬 149+ `connectOverCDP`는 `setDownloadBehavior` 거부 → page WebSocket raw CDP(`/json/list`의 webSocketDebuggerUrl + Runtime.evaluate). 탭 0개면 `PUT /json/new?<url>`.
- viewtrap **검색**은 코드 트리거 불가(form 없음+신용게이트) → 사장님 in-app 검색 후 크롤러가 로드된 테이블만 읽음. 로그인 탭 새로고침/재이동 금지.
