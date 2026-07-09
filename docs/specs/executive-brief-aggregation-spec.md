# Spec — NocoBase agent_tasks 집계 함수 (getExecutiveBriefData)

- 날짜: 2026-07-09
- 프로젝트: 임원 주간 브리핑 자동화 (project_id=4)
- 태스크: `NocoBase agent_tasks 집계 함수 구현` (agent_tasks d0c45403-a1ea-402c-b7b0-25f5b7353314, risk D2)
- phase: spec (코드 변경 없음, 명세 산출물만)
- 선행 근거: `docs/research/weekly-delta-metric-calculation.md` §3 ("주간 스냅샷을 뽑는 것 자체는 SQL/수집 태스크의 몫"), 진행 노트 `docs/_acr-progress/주간-변화-지표-계산-함수.md` §다음 phase 결정 3번(입력 타입 계약).

## 1. 목적과 경계

지정 기간의 `agent_tasks`를 **assigned_agent별로 집계**해 임원 주간 브리핑의 데이터 소스를 만든다.

역할 경계(형제 태스크):

| 태스크 | 담당 | 이 spec과의 관계 |
|---|---|---|
| **이 태스크** | 데이터 수집·집계 | 본 문서 |
| 주간 변화 지표 계산 함수 (34246ece) | 집계 결과 2개(이번주/지난주)로 델타 계산 | §5 계약(WeeklySnapshot) 소비자 |
| Slack 메시지 포맷팅 함수 (2058b1fd) | mrkdwn 표현 | 집계 결과의 표현만 담당 |
| Slack Gateway 발송 / Hermes 스케줄 | 배선·실행 | §4 fetcher 어댑터의 실제 주입자 |

## 2. 설계 결정 (구조)

**결정: 순수 집계 함수 + 주입식 fetcher 분리.**

- `packages/l5-core/src/functions/executive-brief.ts` (신규) 에 다음을 둔다:
  1. `aggregateExecutiveBriefData(rows)` — **순수 함수**. agent_tasks row 배열 → 임원별 요약 배열. DB/네트워크 I/O 없음.
  2. `getExecutiveBriefData(startDate, endDate, fetchTasks?)` — expected_output이 요구한 진입점. **2-arg 호출을 그대로 지원**한다: `fetchTasks` 미주입 시 내장 기본 fetcher(3번)를 사용하고, 테스트/타 서비스는 포트(아래 §4)를 주입해 교체한다.
  3. `createNocoBaseTaskFetcher(config?)` — 기본 fetcher 팩토리. §6 쿼리 레시피를 구현한 NocoBase REST 어댑터(raw fetch, zero-dep — `pulk-api.ts` 패턴 준용). config 미지정 시 `process.env.NOCOBASE_URL`(기본 `http://localhost:13000`)과 `process.env.NOCOBASE_TOKEN`을 읽는다(하드코딩 아님 — 런타임 env 참조).
  4. `toWeeklySnapshot(summaries)` — 순수 함수. 임원별 요약을 전사 합산해 델타 태스크의 입력 계약(§5)으로 변환.
- 근거: CLAUDE.md 규칙 2는 "`l5-core` must be **testable** without NocoBase"다 — NocoBase 접근 코드의 존재 금지가 아니라, 단위 테스트가 NocoBase 없이 돌아야 한다는 뜻. 집계 판단 로직은 순수 함수(1번)로 격리하고 어댑터(3번)는 단위 테스트에서 절대 실행되지 않으므로 규칙을 충족한다. 판단 로직 격리 패턴은 기존 `monitor/live-status.ts`, `chief-of-staff/synthesize.ts`와 동일.
- slack-gateway 등 타 서비스는 자체 연결(rationale "재사용: services/slack-gateway 기존 DB 연결" — 실체는 `pulk-api.ts`의 raw-fetch NocoBase REST 패턴)로 포트를 주입해도 되고, 기본 fetcher를 그대로 써도 된다. 발송 배선 자체는 형제 태스크 "Slack Gateway 발송 엔드포인트"의 몫.

## 3. 기능 요구사항 (FR)

### FR-1 입력 row 타입

```ts
/** NocoBase agent_tasks row 중 집계에 필요한 최소 형태 (REST 응답 그대로 수용) */
export interface ExecutiveBriefTaskRow {
  assigned_agent?: string | null;
  status: 'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed';
  blocker?: string | null;
  approval_required?: boolean | null;
}
```

status enum은 기존 `monitor/live-status.ts`의 `LiveStatusTask.status`와 동일 집합을 사용한다(단일 정본 유지 — 구현 시 재선언 대신 재사용 가능 여부 판단).

### FR-2 출력 타입 (expected_output 그대로)

```ts
export interface ExecutiveBriefAgentSummary {
  agent: string;
  completed: number;
  inProgress: number;
  blockedCount: number;
  blockers: string[];
  approvalWaitingCount: number;
}
```

`getExecutiveBriefData` / `aggregateExecutiveBriefData`의 반환형은 `ExecutiveBriefAgentSummary[]`.

### FR-3 집계 규칙 (측정 가능한 정의)

입력 row들을 `assigned_agent`별로 그룹핑한 뒤, 그룹마다:

| 필드 | 정의 |
|---|---|
| `agent` | `assigned_agent`를 **trim한 값**. null/undefined/trim 후 빈 문자열은 `"UNASSIGNED"` 그룹으로 집계. 따라서 `" CEO "`와 `"CEO"`는 같은 그룹 |
| `completed` | `status === 'done'` 인 row 수 |
| `inProgress` | `status ∈ {'running','queued','needs_review'}` 인 row 수 |
| `blockedCount` | `status === 'blocked'` 인 row 수 |
| `blockers` | 그룹 내 **모든 status**의 row 중 `blocker`가 null/undefined가 아니고 `trim() !== ''` 인 값들을 **trim한 문자열**로 수집. 중복 제거는 trim 후 정확 문자열 일치 기준(`"foo"`와 `" foo "`는 동일 → 1개), 원본 등장 순서 유지 |
| `approvalWaitingCount` | `approval_required === true` 이고 `status ∉ {'done','killed'}` 인 row 수 (아직 열려 있는 승인 대기만) |

추가 규칙:

- `status === 'killed'` row는 `completed`/`inProgress`/`blockedCount` 어디에도 세지 않는다(취소는 성과도 진행도 아님). 단 blockers 수집(문자열)과 approvalWaiting 판정 표에는 위 정의가 그대로 적용된다(killed는 approvalWaiting에서 제외됨).
- `blockers`는 `status='blocked'`가 아닌 row의 blocker 텍스트도 포함한다(예: running인데 blocker 메모가 남은 경우). 따라서 `blockers.length !== blockedCount`일 수 있다 — 이는 버그가 아니라 정의다. 완료조건의 "blocker != null 필터링 정확성"은 이 규칙(§AC-4)으로 검증한다.
- 반환 배열은 `agent` 오름차순(`localeCompare` 아님 — 단순 `<` 비교, 결정적) 정렬.
- row가 0건이면 빈 배열 `[]` 반환(throw 금지).

### FR-4 기간 필터 의미론

- `getExecutiveBriefData(startDate: Date, endDate: Date, fetchTasks)` 의 기간은 **반개구간** `[startDate, endDate)`.
- 기간 판정 컬럼은 **`updatedAt`** (마지막 활동 시각) — 이유: `agent_tasks`에는 상태 전이 이력·완료 시각 컬럼이 없으므로, "이번 주에 완료된 태스크" ≈ "status='done'이고 updatedAt이 이번 주"로 근사한다. 한계(완료 후 주 밖에서 재수정되면 창에서 빠짐)는 §8에 기록.
- 기간 필터는 **fetcher(포트) 책임**이다. `aggregateExecutiveBriefData`는 받은 row를 전부 집계한다(순수성 유지). `getExecutiveBriefData`는 `fetchTasks(startDate, endDate)`를 호출해 위임할 뿐 자체 필터링하지 않는다.
- `startDate >= endDate`이면 `RangeError` throw (호출자 버그를 조기 노출).

### FR-5 fetcher 포트 + 기본 어댑터

```ts
export type ExecutiveBriefTaskFetcher = (
  startDate: Date,
  endDate: Date,
) => Promise<ExecutiveBriefTaskRow[]>;

/** §6 쿼리 레시피를 구현한 NocoBase REST 어댑터 팩토리 (raw fetch, zero-dep) */
export function createNocoBaseTaskFetcher(config?: {
  baseUrl?: string; // default: process.env.NOCOBASE_URL ?? 'http://localhost:13000'
  token?: string;   // default: process.env.NOCOBASE_TOKEN ?? ''
}): ExecutiveBriefTaskFetcher;

export async function getExecutiveBriefData(
  startDate: Date,
  endDate: Date,
  fetchTasks?: ExecutiveBriefTaskFetcher, // 미주입 시 createNocoBaseTaskFetcher() 사용
): Promise<ExecutiveBriefAgentSummary[]>;
```

- expected_output의 2-arg 계약(`getExecutiveBriefData(startDate, endDate)`)을 그대로 만족한다 — 3번째 인자는 optional이며 테스트/타 서비스용 오버라이드.
- `createNocoBaseTaskFetcher`는 §6 레시피(camelCase 필터, 페이지네이션 순회) 전부를 구현할 의무가 있다. token은 env 참조만 — 하드코딩 금지(CLAUDE.md 규칙 9).
- **단위 테스트는 기본 fetcher를 절대 실행하지 않는다**(항상 fake 주입 또는 순수 함수 직접 호출) — NocoBase 없이 테스트 가능 규칙 유지.
- fetcher가 reject하면 그대로 전파(fail-closed — 브리핑에 가짜 0을 싣지 않는다).

### FR-6 WeeklySnapshot 변환 (델타 태스크와의 계약)

```ts
export interface WeeklySnapshot {
  completed: number;
  inProgress: number;
  blocked: number;
  blockers: string[];
}

export function toWeeklySnapshot(
  summaries: ExecutiveBriefAgentSummary[],
): WeeklySnapshot;
```

- `completed`/`inProgress` = 전 임원 합산. `blocked` = `blockedCount` 합산. `blockers` = 전 임원 blockers 이어붙인 뒤 중복 제거(등장 순서 유지).
- 이 타입이 형제 태스크 "주간 변화 지표 계산 함수"의 입력 계약 정본이다(진행 노트 미결정 3번 해소). 델타 태스크의 `newBlockersCount`는 `blockers.length` 차이로 계산한다.

### FR-7 export

`packages/l5-core/src/index.ts`에 `export * from './functions/executive-brief';` 1줄 추가(기존 패턴과 동일).

## 4. 비기능 요구사항 (NFR)

- **NFR-1** zero runtime dependency 추가 금지(순수 TS). 리서치 문서 §3 후보 C 배제 근거 준용.
- **NFR-2** `aggregateExecutiveBriefData`·`toWeeklySnapshot`은 결정적(같은 입력 → 같은 출력, Date.now/난수/I-O 금지).
- **NFR-3** l5-core 단위 테스트는 NocoBase 없이 실행 가능해야 한다(fetcher는 테스트에서 fake 주입).
- **NFR-4** 입력 row 배열을 변형(mutate)하지 않는다.

## 5. 영향 받는 파일·모듈

| 파일 | 변경 | 소유 phase |
|---|---|---|
| `packages/l5-core/src/functions/executive-brief.ts` | **신규** — 타입 3종 + 함수 4종(`aggregateExecutiveBriefData`, `getExecutiveBriefData`, `createNocoBaseTaskFetcher`, `toWeeklySnapshot`) | 구현 |
| `packages/l5-core/src/functions/__tests__/executive-brief.test.ts` | **신규** — AC 단위 테스트 (기본 fetcher 미실행) | test/red |
| `packages/l5-core/src/index.ts` | export 1줄 추가 | 구현 |
| `packages/l5-core/scripts/verify-executive-brief-live.mjs` | **신규** — AC-9 실쿼리 검증 스크립트(빌드된 dist에서 `getExecutiveBriefData`를 기본 fetcher로 호출) | 구현/verify |
| `docs/_acr-progress/nocobase-agent-tasks-집계-함수-구현.md` | 진행 노트 갱신(AC-9 실행 캡처 포함) | 각 phase |
| (참고) `services/slack-gateway/src/*` | 이 태스크에서 **수정 없음** — 발송 배선은 "Slack Gateway 발송" 태스크 | 형제 태스크 |
| (참고) `packages/l5-core/src/functions/monitor/live-status.ts` | status enum 정본 — 수정 없음, 재사용 검토만 | 구현 |

같은 파일(`executive-brief.ts`)에 형제 태스크의 `calculateWeeklyDelta`도 들어올 예정 — 먼저 머지되는 쪽이 파일을 만들고, 나중 쪽은 append. 충돌 시 타입 정의(§FR-6)는 이 spec이 정본.

## 6. NocoBase 쿼리 레시피 (`createNocoBaseTaskFetcher` 구현 계약)

기본 어댑터(이 태스크가 구현)는 다음을 따라야 한다:

- REST: `GET {NOCOBASE_URL}/api/agent_tasks:list` + `Authorization: Bearer {NOCOBASE_TOKEN}`.
- 필터(JSON을 encodeURIComponent):

```json
{ "updatedAt": { "$gte": "<startDate ISO>", "$lt": "<endDate ISO>" } }
```

- **함정 1 (camelCase)**: 필터·정렬 필드는 반드시 `updatedAt`/`createdAt` camelCase. `updated_at`/`created_at`을 쓰면 에러 없이 **조용히 빈 배열**이 온다(NocoBase defineCollection 함정, `docs/index/db.md`).
- **함정 2 (페이지네이션)**: `pageSize` 기본 20. `pageSize=200&page=n`으로 `meta.totalPage`까지 순회하거나 충분히 큰 pageSize + totalCount 검증. 누락 row는 조용한 과소집계가 된다.
- 필요한 필드만: `fields=assigned_agent,status,blocker,approval_required` (선택 최적화 — 필수는 아님).

## 7. Acceptance Criteria (전부 객관 측정 가능)

단위 테스트는 `packages/l5-core/src/functions/__tests__/executive-brief.test.ts`, 실행 명령은 `pnpm --filter @l5/core test -- executive-brief` (루트에서 `pnpm test -- executive-brief`가 l5-core jest로 라우팅되면 그대로 사용).

- **AC-1 (그룹핑·정렬)**: agent 'CTO','CEO','CMO' 혼합 row 입력 → 반환 배열이 agent 오름차순이며 그룹 수가 정확히 3. `assigned_agent: null` row 포함 시 `"UNASSIGNED"` 그룹이 추가로 생성됨을 단위 테스트로 검증.
- **AC-2 (상태 버킷)**: 한 agent에 status 6종 각 1건씩 입력 → `completed===1`, `inProgress===3`(running+queued+needs_review), `blockedCount===1`, killed는 어느 카운트에도 미포함(총합 5=6−killed 검증)을 단위 테스트로 검증.
- **AC-3 (approvalWaiting)**: `approval_required: true` × status {running, done, killed} 각 1건 → `approvalWaitingCount===1`(running만). `approval_required: false`/`null`/필드 부재 row는 미포함. 단위 테스트.
- **AC-4 (blocker 필터링 — 완료조건 3)**: blocker 값이 `null`/`undefined`/`''`/`'   '`(공백만)/`'실제 블로커'`/`'실제 블로커'`(중복)/status='running'인 `'비-blocked 블로커'` 인 row 7건 → `blockers === ['실제 블로커','비-blocked 블로커']` (공백·빈값 제외, 중복 제거, 순서 유지, 비-blocked status 포함). 단위 테스트.
- **AC-5 (빈 입력·불변성)**: row 0건 → `[]`. 입력 배열과 row 객체가 호출 후 deep-equal로 변형 없음. 단위 테스트.
- **AC-6 (getExecutiveBriefData 위임)**: fake fetcher 주입 → (a) fetcher가 정확히 `(startDate, endDate)` 인자로 1회 호출됨, (b) fetcher 반환 row의 집계 결과가 `aggregateExecutiveBriefData` 직접 호출과 deep-equal, (c) fetcher reject 시 동일 에러로 reject, (d) `startDate >= endDate` 시 `RangeError` throw + fetcher 미호출. 단위 테스트.
- **AC-6b (정규화)**: `assigned_agent: " CEO "`와 `"CEO"` row가 같은 그룹으로 합쳐지고 `agent === "CEO"`; blocker `"foo"`와 `" foo "`가 `blockers === ["foo"]` 1개로 수렴. 단위 테스트.
- **AC-7 (toWeeklySnapshot)**: 임원 2명 summaries 입력 → 합산 수치 정확 + blockers 중복 제거 유지 + 필드명이 정확히 `{completed, inProgress, blocked, blockers}`. 단위 테스트.
- **AC-8 (테스트 통과)**: `pnpm --filter @l5/core test -- executive-brief` exit 0, `pnpm --filter @l5/core typecheck` exit 0.
- **AC-9 (실제 쿼리 검증 — 완료조건 2, 통합)**: 검증 스크립트 `packages/l5-core/scripts/verify-executive-brief-live.mjs`를 라이브 NocoBase에 대해 실행:
  1. psql로 `assigned_agent='CEO'` 시드 row 1건 삽입(REST `:create`는 FK/id 함정이 있으므로 psql 직접 — `docs/index/db.md`),
  2. 스크립트가 **실제 함수 경로**(`dist`의 `getExecutiveBriefData(start, end)` — 기본 `createNocoBaseTaskFetcher` 사용, fake 없음)를 호출해 결과에 `agent === 'CEO'` 그룹이 존재하고 counts가 시드와 일치하면 exit 0, 아니면 exit 1,
  3. 동일 스크립트(또는 curl)로 필터를 `updated_at`(snake_case)으로 바꾸면 빈 배열이 옴(함정 재현)을 확인.
  실행 명령·출력 캡처는 진행 노트에 기록. 정기 자동화 배선은 "통합 테스트 및 라이브 전환" 태스크(ff35e829) 소관이지만, **이 태스크의 완료조건 판정은 스크립트 exit 0**으로 측정한다.
- **AC-10 (zero-dep)**: `packages/l5-core/package.json`의 `dependencies`에 이 태스크로 인한 추가 항목 없음(`git diff`로 확인).

## 8. 한계·리스크 (알고 수용)

1. **updatedAt 근사**: 상태 전이 이력이 없어 "이번 주 완료"를 `status='done' ∧ updatedAt∈주간`으로 근사한다. done 이후 주 밖에서 row가 재수정되면 그 주 창에서 빠진다. 정확한 이력이 필요해지면 이벤트 테이블 도입은 별도 태스크(스코프 밖).
2. **주차 경계 타임존**: startDate/endDate 산출(월요일 00:00 등)은 이 함수의 소관이 아니다 — Hermes 스케줄 태스크(e347591b)가 결정. Trigger.dev cron은 UTC(critic must_fix 인계 사항)임을 그 태스크에 재인계.
3. 현재 DB에는 `done` status·`approval_required=true` row가 0건(2026-07-09 실측: running 5/killed 4/queued 3/blocked 2, agent는 CTO뿐) → AC-9에서 CEO 시드가 반드시 필요한 이유.
