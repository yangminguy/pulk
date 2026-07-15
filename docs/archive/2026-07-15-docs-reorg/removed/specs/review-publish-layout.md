# Spec: Review & Publish Page 레이아웃 (좌/중/우)

> 작성: 2026-06-04 | 상태: draft

## 목적

Video Room 페이지를 포함한 CMO 콘텐츠 관리 페이지에 **좌(목록)/중(미리보기)/우(설정·발행)** 3-column 레이아웃을 적용한다. 현재 Video Room은 빈 셸(타이틀만)이며, 이 레이아웃이 콘텐츠 리뷰·발행 페이지의 기반 구조가 된다.

## 오픈소스 조사 결과 요약

> 전체 조사: `docs/research/review-publish-layout.md`

**채택: Native CSS Grid** — UI 라이브러리 0개 원칙 일관성, 드래그 리사이즈 불필요, 번들 0kB. react-resizable-panels/allotment 배제.

## 범위

### In-scope

1. **`ThreeColumnLayout` 레이아웃 컴포넌트** — CSS Grid 기반 좌/중/우 3-column
2. **Video Room 페이지 리팩터** — 현재 빈 셸을 ThreeColumnLayout 위에 재구성
3. **반응형 처리** — 768px 이하에서 단일 컬럼 + 탭 전환

### Out-of-scope

- Video Room의 API 연동 및 폼 구현 (별도 태스크 `cmo-video-room.md`)
- VideoProject CRUD (별도 태스크 `video-project-model-api.md`)
- 새 npm 의존성 추가
- 다른 기존 페이지(Control Room, Chat 등) 변경

## 레이아웃 구조

### 데스크톱 (>768px)

```
┌──────────────────────────────────────────────────────────────┐
│ CMO · Video Room                              [사업 선택 ▾] │
├──────────┬──────────────────────────────┬────────────────────┤
│ 좌 패널  │         중 패널              │     우 패널        │
│ 240px    │         1fr                  │     320px          │
│ 고정폭   │         유동                 │     고정폭         │
│          │                              │                    │
│ ┌──────┐ │  ┌────────────────────────┐  │ ┌────────────────┐ │
│ │ 항목 │ │  │                        │  │ │ 메타데이터     │ │
│ │ 목록 │ │  │  콘텐츠 미리보기       │  │ │ 설정 폼       │ │
│ │      │ │  │  (영상/이미지/텍스트)  │  │ │ 전략 표시     │ │
│ │      │ │  │                        │  │ │                │ │
│ │      │ │  │                        │  │ │ [발행 버튼]   │ │
│ └──────┘ │  └────────────────────────┘  │ └────────────────┘ │
├──────────┴──────────────────────────────┴────────────────────┤
```

### 모바일 (≤768px)

```
┌──────────────────────────┐
│ [목록] [미리보기] [설정] │  ← 탭 전환
├──────────────────────────┤
│                          │
│   선택된 탭의 콘텐츠     │
│                          │
└──────────────────────────┘
```

## 기술 명세

### ThreeColumnLayout 컴포넌트

```ts
// apps/founder-ui/src/components/ThreeColumnLayout.tsx

type ThreeColumnLayoutProps = {
  left: React.ReactNode      // 좌패널 콘텐츠
  center: React.ReactNode    // 중패널 콘텐츠
  right: React.ReactNode     // 우패널 콘텐츠
  leftWidth?: number         // 좌패널 폭 (기본 240)
  rightWidth?: number        // 우패널 폭 (기본 320)
}
```

**핵심 CSS (인라인 스타일)**:

```css
display: grid;
grid-template-columns: ${leftWidth}px 1fr ${rightWidth}px;
height: calc(100vh - 80px);  /* 헤더 높이 제외 */
gap: 0;
```

**각 패널**:
- `overflow-y: auto` — 개별 스크롤
- `border-right: 1px solid var(--silver-2)` — 좌/중 구분선 (Joinery 토큰)
- `padding: 16px` — 내부 여백

**반응형**:
- `@media (max-width: 768px)` → 인라인 스타일에서 `window.innerWidth` 감지 후 단일 컬럼 + 탭 UI
- 탭 상태: `useState<'list' | 'preview' | 'settings'>('list')`

### Video Room 적용

`video-room/page.tsx`에서 ThreeColumnLayout을 사용:

| 패널 | 콘텐츠 | 비고 |
|------|--------|------|
| 좌 (목록) | VideoProject 목록 카드 | 선택 시 중패널에 상세 표시. API 미연동 시 빈 상태 메시지 |
| 중 (미리보기) | 선택된 영상 미리보기 (`<video>`) + 브리프 요약 | 미선택 시 빈 상태 안내 |
| 우 (설정) | 현재 전략 표시 + 브리프 작성 폼 + 발행 버튼 | cmo-video-room.md의 폼 스펙 따름 |

### 스타일 규칙

- **인라인 스타일만 사용** — Joinery CSS 변수 (`var(--bg)`, `var(--silver-2)`, `var(--ink-1)` 등)
- Tailwind 유틸리티 클래스 미사용 (기존 Control Room/Chat 패턴과 동일)
- 새 CSS 파일 생성 없음

## 영향 파일

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `apps/founder-ui/src/components/ThreeColumnLayout.tsx` | **신규** | CSS Grid 기반 3-column 레이아웃 컴포넌트 |
| `apps/founder-ui/src/app/video-room/page.tsx` | 수정 | 빈 셸 → ThreeColumnLayout 적용 + 패널 플레이스홀더 |

## Acceptance Criteria

| # | 기준 | 검증 방법 |
|---|------|----------|
| AC-1 | `/video-room` 접속 시 3-column 레이아웃이 렌더된다 (좌 240px / 중 유동 / 우 320px) | 브라우저 DevTools에서 grid-template-columns 확인: `240px 1fr 320px` |
| AC-2 | 각 패널이 독립적으로 세로 스크롤된다 | 좌패널에 긴 콘텐츠 삽입 시 중/우패널 스크롤 영향 없음 확인 |
| AC-3 | 패널 간 구분선이 Joinery 토큰(`var(--silver-2)`)으로 표시된다 | 렌더된 border-right 색상 확인 |
| AC-4 | 뷰포트 768px 이하에서 단일 컬럼 + 탭 UI로 전환된다 | 브라우저 반응형 모드 768px 이하에서 탭 3개(목록/미리보기/설정) 표시, 클릭 시 패널 전환 확인 |
| AC-5 | ThreeColumnLayout에 전달된 left/center/right ReactNode가 각 패널에 정확히 렌더된다 | 플레이스홀더 텍스트가 올바른 패널 위치에 표시되는지 확인 |
| AC-6 | 기존 페이지(chat, control-room 등)가 깨지지 않는다 | `next build` 성공 + 기존 라우트 정상 렌더 |
| AC-7 | TypeScript 빌드 에러 없음 | `pnpm --filter @l5/founder-ui typecheck` 통과 |
| AC-8 | 신규 npm 의존성 추가 없음 | `package.json` diff에 dependencies 변경 없음 |
| AC-9 | AuthGate 래핑 유지 — 미인증 시 로그인으로 리다이렉트 | 토큰 없이 `/video-room` 접속 시 로그인 화면 확인 |

## 기술 결정

| 결정 | 근거 |
|------|------|
| Native CSS Grid (라이브러리 없음) | 오픈소스 조사 결과 채택. 고정폭 3-column에 드래그 리사이즈 불필요. 프로젝트 UI 라이브러리 0개 원칙 (`docs/research/review-publish-layout.md`) |
| 인라인 스타일 (Tailwind 미사용) | 기존 Control Room, Chat 등 모든 페이지가 인라인 스타일 + Joinery CSS 변수 패턴. 일관성 유지 |
| 반응형 = JS 기반 탭 전환 | CSS media query + `display: none`으로도 가능하나, 인라인 스타일 패턴에서는 `window.innerWidth` + useState가 기존 코드(MobileShell 등)와 일관적 |
| 공유 컴포넌트로 분리 | Video Room 외에도 향후 콘텐츠 관리 페이지(블로그, SNS 등)에서 동일 레이아웃 재사용 가능성. 단, 현재 사용처는 Video Room 1곳 |

## 구현 순서 (제안)

1. `ThreeColumnLayout.tsx` 신규 생성 — CSS Grid + 반응형 탭
2. `video-room/page.tsx` 수정 — ThreeColumnLayout 적용 + 패널별 플레이스홀더
3. `next build` + `typecheck` 검증
4. 브라우저에서 데스크톱/모바일 반응형 확인
