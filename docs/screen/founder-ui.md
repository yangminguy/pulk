# SCREEN 하위 — founder-ui (:3000)

> [SCREEN.md](../SCREEN.md)로 돌아가기. 레이아웃: `AuthProvider` → `BusinessProvider` → `MobileShell` + `Sidebar`.

사이드바 구조: 활성 사업 선택(또는 "회사 공통") → **메인**(CEO 채팅 / 승인 대기 / 프로젝트) → **도구**(CMO 마케팅 / 비즈니스PT 매니저(외부 탭) / 영상룸 / 현황 모니터 / 지식 / Tool Requests / 자가개선 / 장애 감시).

| 라우트 | 화면 | 설명 |
|---|---|---|
| `/` | — | `/chat`로 즉시 redirect |
| `/chat` | CEO 채팅 | 지시 제출 → CTO 플랜 승인/거절, 로드맵/컨설테이션 카드 |
| `/approval` | 승인 대기 | 통합 큐, self-mod diff 표시 포함 |
| `/projects`, `/projects/[id]` | 프로젝트 목록/상세 | 로드맵 타임라인, 미결항목, 의사결정 기록, CTO Plan Timeline, Agent Activity |
| `/cmo` | CMO 마케팅 | 채팅 + 과제 탭(구버전 플로우, `/video-room`과 중복 가능성 있음 — 정리 검토 대상) |
| `/video-room`, `/video-room/script-room` | 영상룸 | 전략/제작/검토발행 3보드. CMO 콘텐츠 파이프라인 메인 작업 화면 |
| `/monitor` | 현황 모니터 | 라이브 상태, 실행 이력, 승인 큐 종합 |
| `/memory` | 지식 | 큐레이션 요약/기억 후보 저장·폐기 |
| `/tool-requests` | Tool Requests | CTO 자가수정(self-mod) 요청/승인 추적 |
| `/self-improve` | 자가개선 | Tiger 회고 기반 개선 카드 승인 큐 |
| `/incidents` | 장애 감시 | Tiger 인시던트 상태 추적 |
| `/control-room` | Control Room | ACR 은퇴로 사이드바 메뉴에서 숨김, 코드는 보존(직접 URL만 접근 가능) |
| `/workflow` | — | **고아 라우트** — 어디서도 링크되지 않음. 정리 검토 대상([TASK.md](../TASK.md)) |
| `/api/projects/[id]/status-md` | — | Next.js 서버 라우트, 상태를 markdown으로 반환 |

외부 링크: "비즈니스PT 매니저" 메뉴는 `http://localhost:3003`(`apps/bizpt-manager`)로 새 탭 이동.

## 기술 메모

react-hook-form + zod(`src/schemas/upload-draft.schema.ts`), lexical(원고 편집), recharts(지표 차트), framer-motion. API 클라이언트는 `src/lib/api.ts`(~1,700줄, `NEXT_PUBLIC_API_BASE` 기본 `http://localhost:13000`).

## 관련 문서

- 데이터: [../db-design/video-room-entities.md](../db-design/video-room-entities.md)
- 동선: [../USER_FLOW.md](../USER_FLOW.md)
