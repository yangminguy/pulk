# TRD — 기술 구조

> 저장소 폴더 구조는 [ARCHITECTURE.md](./ARCHITECTURE.md), 제품 요구사항은 [PRD.md](./PRD.md).

## 시스템 레이어

```
Founder Chat (founder-ui, 1차 UX)
  → CEO Agent (오케스트레이터, services/agent-runtime)
    → Executive Agents (CMO/CTO/COO/CFO/CRO/CPO/RiskQA — Operators)
      → NocoBase (apps/nocobase-app — 내부 운영 DB/승인큐/감사로그 shell)
        → packages/l5-core (판단 로직, NocoBase 비종속, 단독 테스트 가능해야 함)
      → services/hermes-runtime (스케줄 감시/알림)
  → PostgreSQL (Source of Truth)
```

에이전트 프로토콜/권한 상세는 [trd/agent-protocol.md](./trd/agent-protocol.md), 오케스트레이션 실행 방식은 [trd/orchestration.md](./trd/orchestration.md), 스케줄/워크플로우는 [trd/workflow-hermes.md](./trd/workflow-hermes.md), 보안/PII는 [trd/data-governance.md](./trd/data-governance.md).

## 모노레포 구조 요약

전체 트리는 [ARCHITECTURE.md](./ARCHITECTURE.md) 참고. 요지:

| 영역 | 위치 | 역할 |
|---|---|---|
| 콘텐츠 파이프라인 콘솔 | `apps/bizpt-manager` | Next.js, :3003. 승인/파이프라인/산출물 보드 |
| 창업자 메인 콘솔 | `apps/founder-ui` | Next.js, :3000. 채팅/승인/영상룸/모니터 |
| 운영 shell | `apps/nocobase-app` | NocoBase + `@l5/*` 플러그인 3종(live) |
| 렌더 잡 큐(초기) | `apps/api-server` | bullmq/ioredis 스텁, 2파일 |
| 도메인 로직 | `packages/l5-core` | 판단/상태머신/스코어링. UI가 하드코딩 금지 |
| 공용 UI | `packages/l5-ui` | 현재 앱에서 미배선 |
| 에이전트 실행기 | `services/agent-runtime` | 가상 임원 spawn/오케스트레이션 |
| 스케줄러 | `services/hermes-runtime` | 승인체크/브리핑/감시, launchd 상시 |
| 리서치 엔진 | `services/research-engine` | YouTube 리서치, 신규 진행중 |
| Notion 동기화 | `services/notion-gateway` | agent_tasks ↔ Notion |
| 텔레그램 게이트웨이 | `services/telegram-gateway` | `@executive` 명령 라우팅 |
| YouTube 어댑터 | `services/youtube` | Data/Analytics API + 뷰트랩 CDP 크롤링 |
| Slack 게이트웨이 | `services/slack-gateway` | 임원 멘션 라우팅, 가장 활발히 개발중 |
| 인사이트 루프 | `services/cmo-insight-loop` | 일일 유튜브 인사이트, 현재 휴면([TASK.md](./TASK.md)) |

## 기술 스택

| 목적 | 선택 | 비고 |
|---|---|---|
| Shell | NocoBase Community Edition | UI가 아니라 DB/API/승인큐로만 사용 |
| DB | PostgreSQL | Source of Truth |
| 도메인 로직 | TypeScript (`packages/l5-core`) | NocoBase 비종속 |
| 프론트엔드 | Next.js 14 (App Router) + React 18 | `founder-ui`, `bizpt-manager` |
| LLM 실행 | Claude CLI (headless) | 구독 내 무료. Anthropic API 직접호출은 비용상 미채택 |
| 분류용 LLM | Claude Sonnet 고정 | 의도분류/판매논리 판단 |
| Agent Runtime | 자체 구현 (Mastra 미사용) | `services/agent-runtime`. CLAUDE.md 표기는 갱신 필요 |
| Hermes Runtime | 자체 launchd cron (Trigger.dev 미사용) | `services/hermes-runtime` |
| 외부 연동 | raw fetch, SDK 미설치 | Slack/Notion/Telegram 전부 무의존 구현 |
| 배포 | Vercel(`founder-ui`), 로컬(NocoBase/services) | |

> LLM 관측(Langfuse)/PMF 신호(Formbricks)/외부자동화(Activepieces)는 최초 설계 문서(archive됨)에 있었으나 현재 코드에서 실제 연동 확인 안 됨 — 필요 시 재검토.

## 공통 응답 계약

```ts
type L5Result<T> = {
  ok: boolean
  data?: T
  error?: { code: string; message: string; retryable: boolean; source: string }
  trace_id?: string
}
```

모든 `packages/l5-core` 함수와 NocoBase 커스텀 액션은 이 형태로 응답한다.

## 개발/QA 명령 (루트 `package.json`)

- `pnpm qa:static` — typecheck + lint + build (전체 워크스페이스)
- `pnpm qa:test` — 전체 유닛테스트
- `pnpm qa:e2e:nocobase` / `pnpm qa:e2e:founder` — 앱별 e2e
- `pnpm qa:arch` — dependency-cruiser로 의존성 규칙 검사 (`.dependency-cruiser.cjs`)
- `pnpm qa:all` — 정적검사 + 테스트 + 인증 스모크 + e2e 전체

## 관련 문서

- 에이전트 프로토콜/권한: [trd/agent-protocol.md](./trd/agent-protocol.md)
- 오케스트레이션(CTO 실행/Agent Team/임원위임): [trd/orchestration.md](./trd/orchestration.md)
- 스케줄/워크플로우 팩토리: [trd/workflow-hermes.md](./trd/workflow-hermes.md)
- 보안/데이터 거버넌스: [trd/data-governance.md](./trd/data-governance.md)
- 데이터 모델: [DB_DESIGN.md](./DB_DESIGN.md)
