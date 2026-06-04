# Spec: CMO Video Room 메뉴 & 라우터 추가

> 작성: 2026-06-04 | 상태: draft

## 목적

Video Factory 백엔드(l5-core M5)는 구현·테스트 완료되었으나, Founder가 영상 생성 상태를 확인하고 브리프를 작성할 전용 UI가 없다. `/video-room` 라우트와 사이드바 메뉴를 추가하여 CMO Video Factory의 상태 가시성을 확보한다.

## 범위

Founder-UI에 **읽기 전용 + 브리프 작성** 페이지 1개를 추가한다. 기존 패턴(Control Room, Memory 등)을 그대로 따른다.

### In-scope

1. **사이드바 메뉴 항목** — "도구" 섹션에 "Video Room" 추가
2. **`/video-room` 라우트** — Next.js App Router 페이지
3. **Video Room 페이지 구성**:
   - 현재 적용된 콘텐츠 전략 표시 (get_config)
   - 영상 생성 이력 목록 (생성 상태, 주제, 형식)
   - 영상 브리프 작성 폼 (topic, angle, format → generate)
   - 전략 설정 폼 (strategy, content_style, notes → configure)
   - 생성된 영상 미리보기 (`<video>` 네이티브)
4. **API 클라이언트 함수** — api.ts에 Video Factory 엔드포인트 호출 추가
5. **백엔드 액션** — plugin-orchestration에 Video Room용 읽기/쓰기 액션 (필요 시)

### Out-of-scope

- 외부 영상 생성기 API 실제 연동 (현재 mock transport)
- 영상 편집/트리밍 기능
- 새 npm 의존성 추가 (조사 결과: 네이티브 `<video>` + 인라인 스타일로 충분)
- CMO 에이전트 로직 변경

## 기술 결정

| 결정 | 근거 |
|------|------|
| 외부 라이브러리 추가 없음 | 프로젝트 전체가 UI 라이브러리 0개 원칙 (인라인 스타일 + Joinery CSS 변수). Video Factory 출력은 file URL → `<video controls>` 충분. |
| 페이지 구조 = Control Room 패턴 복제 | AuthGate 래핑, useBusiness 컨텍스트, 인라인 스타일, 10s 폴링 — 기존 패턴 일관성 유지. |
| 폼은 useState 직접 관리 | 필드 3개 수준. react-hook-form 불필요. 기존 페이지(Sidebar 모달, CTO 기획 패널) 전부 이 패턴. |

## 영향 파일

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `apps/founder-ui/src/components/Sidebar.tsx` | 수정 | NAV_TOOLS 배열에 Video Room 항목 추가, ICONS에 video 아이콘 SVG path 추가 |
| `apps/founder-ui/src/app/video-room/page.tsx` | **신규** | Video Room 페이지 컴포넌트 |
| `apps/founder-ui/src/lib/api.ts` | 수정 | videoFactoryGetConfig, videoFactoryGenerate, videoFactoryConfigure, videoFactoryHistory 함수 + 타입 추가 |
| `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/actions/` | 수정 또는 신규 | Video Factory 상태 조회/실행 액션 (get_config, generate, configure를 REST로 노출) |

## Acceptance Criteria

각 항목은 수동 또는 자동으로 측정 가능하다.

| # | 기준 | 검증 방법 |
|---|------|----------|
| AC-1 | 사이드바 "도구" 섹션에 "Video Room" 메뉴가 표시된다 | founder-ui 로드 후 사이드바 목시 확인 |
| AC-2 | 메뉴 클릭 시 `/video-room` 으로 이동하고 페이지가 렌더된다 (404/빈 화면 아님) | 브라우저에서 `/video-room` 접속 시 페이지 타이틀 + 레이아웃 렌더 확인 |
| AC-3 | `/video-room` 경로일 때 사이드바의 Video Room 항목이 active 스타일(초록 하이라이트)로 표시된다 | pathname === '/video-room' 시 navItemStyle(active=true) 적용 확인 |
| AC-4 | 현재 콘텐츠 전략이 페이지 상단에 표시된다 (설정 없으면 "설정 없음" 안내) | get_config API 호출 → 응답을 UI에 렌더 확인 |
| AC-5 | 브리프 작성 폼(topic 필수, angle/format 선택)이 존재하고, 전송 시 generate API를 호출한다 | 폼 submit → 네트워크 탭에서 generate 요청 확인 |
| AC-6 | 전략 설정 폼(strategy, content_style, notes)이 존재하고, 전송 시 configure API를 호출한다 | 폼 submit → 네트워크 탭에서 configure 요청 확인 |
| AC-7 | 영상 생성 이력이 목록으로 표시된다 (없으면 빈 상태 안내) | history API 호출 → 카드/리스트 렌더 확인 |
| AC-8 | 생성된 영상에 URL이 있으면 `<video>` 태그로 미리보기가 가능하다 | video URL이 있는 항목에서 재생 컨트롤 존재 확인 |
| AC-9 | AuthGate로 감싸져 있어 미인증 시 로그인으로 리다이렉트된다 | 토큰 없이 `/video-room` 접속 시 로그인 화면 확인 |
| AC-10 | 기존 페이지(chat, control-room 등)가 깨지지 않는다 | founder-ui `next build` 성공 + 기존 라우트 정상 렌더 확인 |
| AC-11 | TypeScript 빌드 에러 없음 | `pnpm --filter @l5/founder-ui typecheck` 통과 |

## UI 와이어프레임 (텍스트)

```
┌─────────────────────────────────────────────────┐
│ CMO                                             │
│ Video Room                     [사업 선택 ▾]    │
│─────────────────────────────────────────────────│
│                                                 │
│ ┌─ 현재 전략 ──────────────────────────────────┐│
│ │ 전략: (텍스트 또는 "설정 없음")              ││
│ │ 스타일: ...          비고: ...               ││
│ └──────────────────────────────────────────────┘│
│                                                 │
│ ┌─ 전략 설정 ──────────────────────────────────┐│
│ │ [strategy    ] [content_style] [notes]       ││
│ │                                [적용]        ││
│ └──────────────────────────────────────────────┘│
│                                                 │
│ ┌─ 새 영상 브리프 ─────────────────────────────┐│
│ │ 주제*: [____________]                        ││
│ │ 각도:  [____________]  형식: [▾ short/long]  ││
│ │                                [생성 요청]   ││
│ └──────────────────────────────────────────────┘│
│                                                 │
│ ── 생성 이력 ───────────────────────────────────│
│ ┌─────────────────────────────────────────────┐ │
│ │ [카드] 주제 | 형식 | 상태 | 날짜            │ │
│ │        ▶ 미리보기 (URL 있을 때)             │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ [카드] ...                                  │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## 구현 순서 (제안)

1. Sidebar.tsx에 메뉴 항목 + 아이콘 추가
2. `video-room/page.tsx` 빈 페이지 생성 (AuthGate + 타이틀만)
3. api.ts에 타입 + API 함수 추가
4. 필요 시 plugin-orchestration에 백엔드 액션 추가
5. 페이지에 전략 표시 → 설정 폼 → 브리프 폼 → 이력 목록 → 미리보기 순서로 구현
6. `next build` + typecheck 검증
