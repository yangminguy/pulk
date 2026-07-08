# @l5/notion-gateway

pulk `agent_tasks` ↔ Notion 데이터베이스 **양방향 동기화**. 승인된 CtoPlan에서 생성된
task들을 Notion DB에 task별 row로 내보내고, Notion에서 편집한 상태(Status)를 pulk로 회수한다.

**무료로 동작한다.** Notion API·CLI는 모든 플랜 무료(3 req/초). Notion **Workers는 쓰지 않는다**
(Business/Enterprise 유료). pulk가 자체적으로 Notion API를 폴링하므로 워커·웹훅 없이 전 과정 무료.

의존성 없음: `@notionhq/client` 대신 raw `fetch`로 Notion REST 직접 호출(telegram/slack 게이트웨이와 동일 패턴).

## 셋업 상태 (2026-07-08 완료)

- 통합 토큰: `.env.local`의 `notionintegrationtoken` (사장님이 입력).
- 대상 DB: **"코딩 워크플로우 로그"** (`39737e66cadf80cfb508fdd49c650088`), integration 연결 확인.
- 스키마: 사장님 기존 컬럼 재사용 + pulk 관리 컬럼 2개 추가(API로 자동 생성 완료).
- 라이브 E2E: create/query/update/pull 전부 통과.

### 컬럼 매핑

| Notion 컬럼 (DB1) | 타입 | pulk 필드 | 방향 |
|---|---|---|---|
| `이름` | title | task.title | pulk→Notion |
| `상태` | select | task.status | **양방향** (최신수정 우선) |
| `무엇을 했나` | rich_text | task.rationale | pulk→Notion |
| `날짜` | date | task.created_at | pulk→Notion |
| `Pulk Task ID` | rich_text | task.id | 매핑키 (pulk→Notion) |

> 사장님 소유 컬럼(`단계`·`영역`·`워크플로우 태그`·`PR/이슈 링크`·`메모`)은 **절대 쓰지 않는다**.
> `상태` select 옵션: `Queued`, `In Progress`, `Blocked`, `Needs Review`, `Done`, `Killed`.

## 환경변수 (repo-root `.env.local`)

다른 시크릿(OPENAI/POSTGRES)과 같은 파일:

```
notionintegrationtoken=...        # 통합 토큰 (사장님 입력 완료). NOTION_TOKEN 도 인식됨.
# 선택 (기본값 있음):
NOTION_DATABASE_ID=...            # 기본 = 코딩 워크플로우 로그 DB (config.ts 기본값)
NOTION_POLL_INTERVAL_MS=60000     # 폴링 주기 (기본 60s)
NOCOBASE_URL=http://localhost:13000
NOCOBASE_TOKEN=...                # pulk agent_tasks 접근 토큰
```

## 실행

```bash
pnpm --filter @l5/notion-gateway build
NOTION_TOKEN=... NOTION_DATABASE_ID=... node dist/index.js --once   # 1회 동기화 (E2E/cron)
node dist/index.js                                                  # 상시 폴링 데몬 (launchd)
```

## 충돌 규칙 (양방향)

- **pulk 소유** 필드(이름/무엇을 했나/날짜)는 항상 pulk→Notion.
- **상태**는 양쪽이 바꿀 수 있어 **최신 수정 우선**(pulk `updatedAt` vs Notion `last_edited_time`).
  Notion이 더 최신이면 pulk로 회수, pulk가 더 최신이면 Notion에 반영.
- 인식 불가한 상태 라벨은 **건너뜀**(임의 추론 금지).

순수 매핑/충돌 로직은 `@l5/core`의 `notion-sync`에 있다(외부 의존성 없이 테스트 가능).

## 선택 메타데이터 컬럼 (있으면 쓰고, 없으면 건너뜀)

매 라운드 시작 시 DB 스키마(`GET /databases/:id`)를 조회해, 아래 **pulk 관리 컬럼**이
정확한 타입으로 존재할 때만 쓴다(`filterManagedProps`). 사장님이 원하는 컬럼만 Notion에
추가하면 자동으로 채워진다. 이름/타입이 다르면 건너뛴다 — 절대 추측하지 않는다.

| Notion 컬럼 | 타입 | pulk 필드 |
|---|---|---|
| `Pulk Agent` | select | task.assigned_agent |
| `Pulk Phase` | select | task.phase |
| `Pulk Risk` | select | task.risk_level |
| `Pulk Expected Output` | rich_text | task.expected_output |
| `Pulk Blocker` | rich_text | task.blocker (해소되면 빈 값으로 클리어) |
| `Pulk Branch` | rich_text | task.acr_branch |
| `Pulk PR` | url | task.acr_pr_url |
| `Pulk Updated` | date | task.updated_at |
| `Pulk PRD` | rich_text | 이 태스크를 만든 PRD의 Notion page id |

## PRD저장소 동기화 (코딩 워크플로우 로그와 별개 DB)

CTO 기획 레일(`cto:planMessage`/`cto:approvePlan`)이 만든 **PRD(CtoPlan)** 를 Notion
"PRD저장소" DB에 문서 페이지로 투영한다. **단방향 push** — NocoBase가 source of truth이고,
Notion 페이지 본문은 생성 시 1회만 쓰므로(업데이트는 프로퍼티만) 사장님이 본문을 편집해도
덮어쓰지 않는다. 태스크 DB(양방향)와 매핑·모듈이 분리되어 있다(`@l5/core notion-prd-sync`,
`src/prd-sync.ts`).

- 활성화: `.env.local`에 `NOTION_PRD_DATABASE_ID=<PRD저장소 DB id>` (없으면 라운드 skip).
- 대상: `cto_planning_messages` 중 plan이 있는 행(proposed/approved). 생성된 페이지 id는
  `cto_planning_messages.notion_prd_page_id`로 회수(중복 생성 방지).
- 페이지 본문: PRD 전문 + 로드맵 + 태스크 목록 + 출처(Slack thread id).
- 프로퍼티(schema adapter — title 타입 프로퍼티 자동 발견 + 있을 때만): `Pulk Status`(select:
  draft/approved/executing/done — 연결된 agent_tasks 상태에서 파생), `Pulk Thread`,
  `Pulk Message ID`, `Pulk Updated`.
- 태스크 연결: 승인 시 저장되는 `cto_planning_messages.instruction_id` ↔ `agent_tasks.instruction_id`
  로 매칭 → 태스크 row의 `Pulk PRD` 컬럼에 PRD page id 기록(컬럼이 있을 때).

## 라이브 스모크

```bash
corepack pnpm --filter @l5/notion-gateway build
# PRD + 태스크 라운드 1회 (env 체크 포함)
node services/notion-gateway/scripts/prd-smoke.mjs
# 상태 양방향 확인 (읽기 전용) / pulk측 변경 시뮬레이션
node services/notion-gateway/scripts/task-status-smoke.mjs
node services/notion-gateway/scripts/task-status-smoke.mjs --flip <taskId> running
```
