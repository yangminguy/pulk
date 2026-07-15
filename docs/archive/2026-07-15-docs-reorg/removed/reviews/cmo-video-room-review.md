# Review: CMO Video Room 메뉴 & 라우터 추가

> 리뷰일: 2026-06-04 | 브랜치: acr/l5-c006c077-...-task-4-20260604-1539 | 판정: **LGTM**

## 변경 요약

| 파일 | 변경 | 줄 수 |
|------|------|-------|
| `apps/founder-ui/src/components/Sidebar.tsx` | ICONS에 video path 추가, NAV_TOOLS에 항목 추가 | +2 |
| `apps/founder-ui/src/app/video-room/page.tsx` | AuthGate 래핑 Video Room 페이지 (신규) | +25 |
| `apps/founder-ui/e2e/verify-video-room-route.mjs` | 라우트 검증 E2E 스크립트 (신규) | +49 |
| `docs/TASKS.md` | CMO Video Room 태스크 섹션 추가 | +11 |
| `docs/specs/cmo-video-room.md` | 스펙 문서 (신규) | +110 |
| **합계** | 5 files | **+197** |

## 파일별 리뷰

### `Sidebar.tsx:23` — ICONS.video 추가

```ts
video: 'M23 7l-7 5 7 5V7z M14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z',
```

- OK. Feather Icons `video` SVG path. 기존 아이콘들과 동일한 형식.

### `Sidebar.tsx:49` — NAV_TOOLS 항목 추가

```ts
{ href: '/video-room', label: 'Video Room', icon: 'video' },
```

- OK. Control Room과 Tool Requests 사이에 배치. 기존 `pathname === t.href` 로직이 active 스타일을 자동 처리하므로 AC-3 충족.

### `video-room/page.tsx` — 전체 (25줄)

| 라인 | 판정 | 코멘트 |
|------|------|--------|
| L1 `'use client'` | OK | 기존 페이지(control-room, monitor 등)와 동일 패턴. |
| L2 `import AuthGate` | OK | AC-9(미인증 리다이렉트) 충족. |
| L7-11 인라인 스타일 | OK | `var(--bg)`, `clamp()` — 기존 레이아웃 패턴 일치. |
| L14 `className="j-overline"` | OK | `globals.css:173`에 정의됨. 프로젝트 전반 40+곳에서 사용 중. |
| L15 `className="j-h1"` | OK | `globals.css:165`에 정의됨. `projects/[id]/page.tsx:278` 등에서 사용 중. |
| L23-24 AuthGate 래핑 | OK | control-room 등 기존 페이지와 동일 export 패턴. |

### `verify-video-room-route.mjs` — 전체 (49줄)

| 라인 | 판정 | 코멘트 |
|------|------|--------|
| L1-7 imports/paths | OK | `node:assert/strict` + `node:fs` 기반. 기존 `verify-changes.mjs` 패턴. |
| L11-19 `check()` 헬퍼 | OK | try/catch + failures 수집. 기존 E2E 패턴과 동일. |
| L21-27 Sidebar 검증 | OK | href, label, icon 3개 regex 검증. |
| L29-33 아이콘 검증 | OK | ICONS.video path 존재 확인. |
| L35-41 페이지 검증 | OK | 파일 존재 + AuthGate + "Video Room" 텍스트 확인. |
| L43-49 결과 출력 | OK | 실패 시 exit(1), 성공 시 로그. |

### `docs/TASKS.md` — +11줄

- OK. M10 하위에 Video Room 섹션 추가. 스펙 링크 포함.
- 참고: 처음 2개 항목(Sidebar, page.tsx)은 이미 구현 완료이나 `[ ]`로 표시됨. 후속 phase에서 일괄 체크 가능하므로 blocking 아님.

### `docs/specs/cmo-video-room.md` — +110줄

- OK. 목적/범위/기술 결정/영향 파일/AC 11개/와이어프레임/구현 순서 포함. 이전 리서치 결론(라이브러리 0개)과 일관.

## 검증 결과 (prior phase 로그 확인)

| 검증 항목 | 결과 |
|----------|------|
| `verify-video-room-route.mjs` | PASS |
| `pnpm e2e` (기존 E2E) | PASS |
| `pnpm typecheck` | PASS |
| `pnpm build` (`/video-room` 포함) | PASS |
| `git diff --check` | PASS |

## 수정 필요 사항

**없음.**

## 판정

**LGTM** — 변경 범위가 최소(+2줄 Sidebar, +25줄 페이지)이고, 기존 패턴(AuthGate, Joinery CSS 클래스, NAV_TOOLS 배열)을 정확히 따르며, 빌드/타입체크/E2E 모두 통과. 기존 페이지에 대한 영향 없음.
