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
