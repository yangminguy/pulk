# Viewtrap 자동화 (R5)

Viewtrap 검색 결과를 자동으로 긁어 l5-core의 `ReferenceCandidate[]`로 내보내는 도구.

## 왜 세션 재사용인가

Viewtrap 로그인은 **카카오/구글 OAuth만** 지원한다(이메일·비밀번호 입력칸 없음).
그래서 코드가 비밀번호를 다루거나 OAuth를 자동화하지 **않는다.** 대신:

1. 사장님이 헤드드 브라우저에서 **1회 수동 로그인**
2. 그 로그인 세션(`storageState`)을 홈 디렉토리에 저장
3. 이후 스크래퍼가 그 세션을 로드해 **로그인 상태로** 검색·스크래핑

세션 파일에는 인증 쿠키(민감정보)가 들어가므로 **레포 밖(홈)에 저장**한다.

- 기본 세션 경로: `~/.l5/viewtrap-session.json`
- 환경변수 `VIEWTRAP_SESSION`으로 경로 변경 가능

## 2단계 사용법

모든 명령은 `apps/founder-ui`에서 실행한다(여기서 Playwright가 해석됨).

### 1단계 — 1회 로그인 (세션 저장)

```bash
corepack pnpm exec node e2e/viewtrap/login.mjs
```

헤드드 브라우저가 열리면 카카오 또는 구글로 직접 로그인한다.
로그인이 감지되면(`/auth/login`을 벗어나면) 세션이 저장된다.
세션이 만료되면 이 명령을 다시 실행한다.

### 2단계 — 반복 검색/스크래핑

```bash
# 기본: ReferenceCandidate[] JSON을 stdout으로
corepack pnpm exec node e2e/viewtrap/scrape.mjs "마케팅 대행사"

# 파일로 저장
corepack pnpm exec node e2e/viewtrap/scrape.mjs "마케팅 대행사" --out /tmp/refs.json

# 브라우저를 띄워서(디버깅)
corepack pnpm exec node e2e/viewtrap/scrape.mjs "마케팅 대행사" --headed
```

세션이 없으면 `exit 3` + "먼저 login.mjs 실행" 안내가 나온다.
세션이 만료돼 `/auth/login`으로 리다이렉트되면 `exit 3` + "login.mjs 재실행" 안내가 나온다.

## 선택자 튜닝 (--discover)

`scrape.mjs` 상단의 `SELECTORS` 상수는 **추정 placeholder**다(로그인 없이 DOM 확인 불가).
실 선택자는 로그인 후 `--discover`로 확정한다:

```bash
corepack pnpm exec node e2e/viewtrap/scrape.mjs "마케팅 대행사" --discover
```

이 모드는:

- `/tmp/viewtrap-discover.png` 전체 스크린샷 저장
- 반복되는 카드 구조(같은 class를 가진 형제가 3개 이상)를 count 내림차순으로 출력
- 최상위 후보 카드의 `outerHTML` 앞부분을 덤프

출력을 보고 `SELECTORS`의 `results / title / views / url / thumbnail`을 실 선택자로 교체한다.

## l5-core 연동

`scrape.mjs`가 내보낸 JSON을 l5-core의 `viewtrapScrapeAdapter`에 먹이면
`ReferenceSourceAdapter`가 된다:

```ts
import { createReferenceAdapter, viewtrapScrapeAdapter } from '@l5/core/.../video-room';
const scraped = JSON.parse(fs.readFileSync('/tmp/refs.json', 'utf8'));
const adapter = createReferenceAdapter({ scraper: viewtrapScrapeAdapter(scraped) });
const refs = await adapter.fetch('마케팅 대행사'); // ReferenceCandidate[]
```

## 현재 상태

스크래퍼 골격은 완성됐고 세션 흐름은 동작한다. **일반 모드의 `SELECTORS`는
`--discover`로 실 선택자를 확정하기 전까지 추정값**이다(로그인 후 1회 튜닝 필요).

---

## 실측 제약 (2026-06-09, 라이브 검증)

- **로그인 = 구글/카카오 OAuth** (이메일/비번 입력칸 없음). 구글은 Playwright 자동화 브라우저의
  비번 자동입력을 정책적으로 차단("브라우저 또는 앱이 안전하지 않을 수 있습니다"). → 비번 코드 자동화 불가.
- **viewtrap 인증은 인메모리(React SPA 상태)**. 쿠키엔 `_ga/g_state/NID`(구글)뿐, localStorage엔
  `i18nextLng`뿐, sessionStorage엔 스크롤/sentry뿐 — **인증 토큰이 어디에도 영속되지 않음**.
  → storageState/persistent 프로필 재사용 불가. **페이지를 재로드(goto)하면 인증이 소실**되어 /auth/login으로 튕김.
- 따라서 "한 번 로그인 → 영구 자동"은 불가능. **현실적 동작 모델 = `run.mjs` 한 세션 안에서
  (사장님이 구글 로그인 1클릭) → 재로드 없이 검색·스크래핑**. 세션마다 로그인 1클릭 필요.
- 구글 버튼은 커스텀 요소라 Playwright 자동 클릭이 안 잡힘 → 열린 창에서 사용자가 직접 클릭.

**권장 사용**: `corepack pnpm exec node e2e/viewtrap/run.mjs "검색어" --discover`
(창에서 구글 로그인 클릭 → 자동 검색 → 결과 DOM/선택자 확정). 선택자 확정 후 일반 모드로 스크래핑.
