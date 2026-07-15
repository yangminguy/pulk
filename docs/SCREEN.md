# SCREEN — 필요한 화면

> 사용자 동선은 [USER_FLOW.md](./USER_FLOW.md), 데이터는 [DB_DESIGN.md](./DB_DESIGN.md).

두 개의 독립된 Next.js 콘솔이 화면을 나눠 맡는다. NocoBase 어드민 UI는 원칙적으로 화면이 아니라 Agent 작업장(승인/데이터 보정용)이며, 실제로 붙은 화면도 3개뿐이다(business-portfolio 플러그인).

| 콘솔 | 포트 | 성격 | 상세 |
|---|---|---|---|
| `apps/founder-ui` | :3000 | 창업자 메인 콘솔(채팅/승인/영상룸/모니터) | [screen/founder-ui.md](./screen/founder-ui.md) |
| `apps/bizpt-manager` | :3003 | 콘텐츠 파이프라인 운영 콘솔(승인/칸반/산출물 보드) | [screen/bizpt-manager.md](./screen/bizpt-manager.md) |

## NocoBase 어드민 화면 (apps/nocobase-app, plugin-business-portfolio)

- `BusinessPortfolioPage` — 사업 포트폴리오 목록/상태
- `PMFExperimentsPage` — PMF 실험 보드
- `ControlRoomPage` — 컨트롤룸 트리(사업▸프로젝트▸개발과제)

`plugin-orchestration`, `plugin-executive-monitor`는 UI가 없다(빈 `load()` 스텁) — CEO Chat/CMO Video Room/CTO 기획/Tiger 회고는 전부 REST 액션으로만 노출되고, 실제 화면은 `founder-ui`가 소비한다.

## 화면 스펙 원문 (참고용, archive됨)

과거 `docs/specs/`에 33개, `docs/cmo/features/`에 3개, `docs/cmo/prd/bizpt-kb/`에 12개(비즈니스PT 지식베이스 정본, UI/프롬프트/검증 기준의 근거 자료)의 화면·기능 단위 스펙이 있었다. 전부 `docs/archive/2026-07-15-docs-reorg/removed/`로 이동했으며, 이 SCREEN.md와 하위 문서가 현재 상태 기준 요약이다. 특정 화면의 세부 기획 배경이 필요하면 archive 원본을 찾아본다.

## 관련 문서

- 사용자 동선: [USER_FLOW.md](./USER_FLOW.md)
- 데이터 모델: [DB_DESIGN.md](./DB_DESIGN.md)
- 진행중 화면 작업: [TASK.md](./TASK.md)
