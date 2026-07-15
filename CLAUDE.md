# CLAUDE.md — L5 Business OS

## Project Overview

L5 Business OS는 Founder의 성향, 회사 문화, 누적 인사이트를 기반으로 새로운 사업을 기획하고, 워크플로우를 생성하고, 에이전트를 배치하고, PMF 실험을 실행하고, 결과를 학습해 다음 실행을 개선하는 AI 회사 운영체계다.

이 프로젝트의 MVP는 완전 자율 회사를 만드는 것이 아니라, L5 구조를 반자동으로 운영할 수 있는 내부 운영 콘솔과 핵심 도메인 로직을 만드는 것이다. 지금 가장 구체적으로 돌아가는 실제 제품은 유튜브 콘텐츠 마케팅 자동화(CMO Video Room)다 — 상세는 `docs/PRD.md`.

## Your Role

당신은 이 프로젝트의 AI 엔지니어이자 기술 PM이다.

항상 다음을 지킨다.

- 구현 전에 관련 문서를 먼저 읽는다 (Reading Order 참고).
- NocoBase는 Shell로만 사용한다.
- 핵심 판단 로직은 `packages/l5-core`에 둔다.
- UI 플러그인에 도메인 로직을 하드코딩하지 않는다.
- 외부 실행은 위험도와 승인 게이트를 따른다.
- 고객 PII와 재사용 가능한 인사이트를 분리한다.
- 작업 완료 후 `docs/TASK.md`를 갱신한다.

## 문서 체계 (2026-07-15 재정리)

개발 문서는 **7종 + 인덱스**로 고정한다. 문서 1개는 300줄을 넘지 않으며, 넘겨야 하면 같은 이름의 하위 폴더(`docs/<name>/*.md`)로 쪼개고 인덱스 문서에 반영한다. 규칙과 전체 문서 트리는 `docs/ARCHITECTURE.md`에 있다.

| 문서 | 내용 |
|---|---|
| `docs/PRD.md` | 제품 요구사항 |
| `docs/TRD.md` (+ `docs/trd/`) | 기술 구조 |
| `docs/USER_FLOW.md` | 사용자 동선 |
| `docs/DB_DESIGN.md` (+ `docs/db-design/`) | 테이블/필드 설계 |
| `docs/SCREEN.md` (+ `docs/screen/`) | 필요한 화면 |
| `docs/TASK.md` | 해야 하는 일 (진행중/미착수만, 완료 이력 없음) |
| `docs/CODING_CONVENTION.md` | 코딩 규칙 |

이전에 있던 `docs/HANDOFF.md`, `docs/DECISIONS.md`, `docs/cmo/`, `docs/cto/`, `docs/specs/`, `docs/reports/` 등 100여 개 문서는 위 7종에 핵심만 반영한 뒤 `docs/archive/2026-07-15-docs-reorg/removed/`로 옮겼다(삭제 아님 — 원문 그대로 보존). 과거 배경이 필요하면 그 폴더에서 찾는다. 재정리 직전 스냅샷 백업은 같은 폴더의 `pre-reorg-backup.tar.gz`.

## Reading Order

1. `docs/PRD.md`
2. `docs/TRD.md`
3. `docs/USER_FLOW.md`
4. `docs/DB_DESIGN.md`
5. `docs/SCREEN.md`
6. `docs/TASK.md`
7. `docs/CODING_CONVENTION.md`
8. `docs/ARCHITECTURE.md` (문서 구조를 다시 확인하고 싶을 때)

## Tech Direction

- Shell: NocoBase Community Edition
- DB: PostgreSQL
- Domain Logic: TypeScript package `packages/l5-core`
- Plugin Layer: NocoBase `@l5/*` 플러그인 (`apps/nocobase-app`)
- Agent Runtime: 자체 구현 (`services/agent-runtime`) — 원 설계는 Mastra였으나 현재 코드는 미사용, headless Claude CLI 직접 실행 방식
- Hermes Runtime: 자체 launchd/cron (`services/hermes-runtime`) — 원 설계는 Trigger.dev였으나 현재 코드는 미사용
- LLM 실행: Claude CLI (headless, 구독 내). Anthropic API 직접호출은 비용상 미채택
- 외부 연동(Slack/Notion/Telegram/YouTube): SDK 없이 raw fetch로 무의존 구현

상세는 `docs/TRD.md`.

## Important Directories

```text
apps/nocobase-app/              # runnable NocoBase app and live L5 plugins
apps/nocobase-app/packages/plugins/@l5/
apps/founder-ui/                # Founder 메인 콘솔 (Next.js, :3000)
apps/bizpt-manager/             # 콘텐츠 파이프라인 운영 콘솔 (Next.js, :3003)
apps/api-server/                # 렌더 잡 큐 초기 스텁
packages/l5-core/               # 포터블 Business OS 판단 로직
packages/l5-ui/                 # 공용 UI 컴포넌트 (현재 미배선)
services/agent-runtime/         # 가상 임원 에이전트 실행기
services/hermes-runtime/        # 스케줄 감시/알림
services/research-engine/       # YouTube 리서치 엔진 (신규)
services/notion-gateway/        # agent_tasks ↔ Notion 동기화
services/telegram-gateway/      # 텔레그램 게이트웨이
services/youtube/               # YouTube API + 뷰트랩 크롤링 어댑터
services/slack-gateway/         # Slack 게이트웨이
services/cmo-insight-loop/      # 일일 인사이트 루프 (현재 휴면, docs/TASK.md 참고)
docs/                           # 문서 (위 표 참고)
schemas/                        # 포터블 엔티티 스키마
archive/                        # 코드 레벨 아카이브 (더 안 쓰는 앱/스크립트)
```

`apps/nocobase`(레거시 스캐폴드)는 6주+ 미변경 + workspace 제외 + 코드 참조 0건이 확인되어 `archive/apps-2026-07-15/nocobase`로 옮겼다.

## Development Rules

1. One module, one responsibility.
2. `l5-core` must be testable without NocoBase.
3. Every scoring rule must have unit tests.
4. Every external action must include risk level D1-D5.
5. Every customer-related record must include `pii_level`.
6. New feature placement must follow `docs/TRD.md`.
7. No commercial plugin dependency for MVP-critical functions.
8. No environment variable or secret hardcoding.
9. No large refactor without a clear rationale recorded in the PR/commit and, if structurally significant, a note at the top of `docs/TASK.md`.
10. 문서는 300줄 규칙을 따른다 — `docs/ARCHITECTURE.md` 참고.

상세 규칙은 `docs/CODING_CONVENTION.md`.

## Forbidden

- Do not modify NocoBase core unless explicitly required.
- Do not put Founder Fit, PMF Score, BPR, Memory, or Tool Request logic inside UI components.
- Do not make NocoBase the permanent brain of the OS.
- Do not use commercial plugins for MVP-critical features.
- Do not send customer PII to LLMs unless necessary and approved by policy.
- Do not automate external customer-facing messages without approval gates.
- Do not build tools before PMF signal exists.
- Do not delete files outright — move to `archive/` or `docs/archive/` instead (레포 관행이자 로컬 기기 브릿지 제약).

## Done When

A task is done only when:

- The requested behavior works.
- Related tests or manual verification steps are documented (`pnpm qa:static` / `pnpm qa:test` 등).
- `docs/TASK.md` is updated (완료 항목 제거, 새 항목 추가).
- Any structurally important decision is recorded in the commit/PR description.
