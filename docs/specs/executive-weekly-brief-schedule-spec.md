# Spec — Hermes 주간 스케줄 태스크 (executive-weekly-brief)

- 날짜: 2026-07-09
- 프로젝트: 임원 주간 브리핑 자동화 (project_id=4)
- 태스크: `Hermes 주간 스케줄 태스크 추가` (agent_tasks e347591b, risk D1~D2)
- phase: spec (코드 변경 없음, 명세 산출물만)
- 선행 근거: `docs/research/hermes-weekly-schedule-task.md`(후보 A=launchd 채택),
  진행 노트 `docs/_acr-progress/hermes-주간-스케줄-태스크-추가.md` §다음 phase 결정 1~5번.

## 1. 목적과 경계

임원 주간 브리핑 파이프라인(집계 → 델타 → 포맷 → 발송)을 **매주 월요일 09:00 KST에
자동 기동**하는 Hermes 태스크를 추가한다. 이 태스크의 본질은 "주 1회 트리거 + 파이프라인
배선"이며, 각 단계의 로직은 형제 태스크 소유다.

| 형제 태스크 | 담당 | 이 spec과의 관계 |
|---|---|---|
| NocoBase agent_tasks 집계 (d0c45403, spec+test-red 완료) | `getExecutiveBriefData(start, end)` / `toWeeklySnapshot()` | 1단계 — 이 태스크가 주간 창 2개(이번주/지난주)로 2회 호출 |
| 주간 변화 지표 계산 (34246ece) | `calculateWeeklyDelta(currentSnapshot, previousSnapshot)` — 인자는 `WeeklySnapshot` (DB expected_output의 `currentWeek/previousWeek` 파라미터명과 동일 의미) | 2단계 — `WeeklySnapshot` 2개 → 델타 |
| Slack 메시지 포맷팅 (2058b1fd) | `formatExecutiveBrief(briefData, deltaData)` → Block Kit | 3단계 — 표현 |
| Slack Gateway 발송 엔드포인트 (f6a9f7c7, queued) | `POST /brief` `{ message, channel_id? }` | 4단계 — 실제 전송. **이 태스크는 HTTP 클라이언트만 소유** |
| 통합 테스트 및 라이브 전환 (ff35e829, queued) | e2e + READY_FOR_PRODUCTION | launchd `load` 실행·라이브 판정은 그쪽 소관 |
| **이 태스크** | **주간 창 계산 + 파이프라인 오케스트레이션 + 스케줄 등록** | 본 문서 |

## 2. 설계 결정

### 2-1. 스케줄 런타임: launchd (research 판정 준수, expected_output의 Trigger.dev 문구 대체)

DB expected_output은 "Trigger.dev cron 태스크"라고 적었으나, research phase가
실측으로 배제했다(코드베이스 채택 이력 0, 태스크 1개를 위한 서버 인프라 신설 과잉).
**launchd plist + gateway 등록**(라이브 plist 13개와 동일, 주간 선례
`com.l5.hermes.cto-weekly-review.plist` Weekday=1)으로 구현한다.
expected_output의 **측정 가능한 완료조건은 전부 유지**한다:

| expected_output 완료조건 | 이 spec에서의 충족 방식 |
|---|---|
| cron 표현식 `'0 9 * * 1'` 검증 | `HERMES_SCHEDULES.EXECUTIVE_WEEKLY_BRIEF = "0 9 * * 1"` 상수(기존 `MEMORY_REVIEW_GENERATOR` 패턴) + plist `Weekday=1/Hour=9/Minute=0` 일치 검증(AC-5) |
| 타임존 KST 확인 | launchd `StartCalendarInterval`은 **머신 로컬 시간**(이 머신=KST) — cron 상수 주석과 plist 주석에 명문화(AC-5). Trigger.dev UTC 함정(델타 태스크가 인계한 must_fix)은 launchd 채택으로 소멸 |
| `pnpm test -- weekly-executive-brief` 통과 | AC-7 |
| Dry-run 실행 후 '발송 준비 완료' 로그 | FR-6 dry-run 모드 + AC-8 |

### 2-2. 이름 (진행 노트 미결정 2번 확정)

- 태스크 파일: `services/hermes-runtime/src/tasks/weekly-executive-brief.ts` (expected_output 경로 그대로).
- gateway 태스크명: `executive-weekly-brief` (research 제안 유지 — `node dist/gateway.js executive-weekly-brief`).
- plist Label: `com.l5.hermes.executive-weekly-brief`.
- runner 함수: `runExecutiveWeeklyBriefLive()`.

### 2-3. 실행 시각 (미결정 1번 확정): **월요일 09:00 KST**

expected_output이 지정한 `0 9 * * 1`을 그대로 채택한다. 진행 노트의 09:30 제안은
기각 — launchd 태스크는 각각 독립 프로세스라 09:00의 approval-checker/self-learning과
자원 충돌이 없고(기존에도 09:00에 2개 공존), 10:00 cto-weekly-review와도 겹치지 않는다.
expected_output의 측정 조건(`'0 9 * * 1'`)을 지키는 값이 우선한다.

### 2-4. 주간 창 정의 (미결정 1번 후반 확정)

집계 spec FR-4의 **반개구간 `[start, end)`** 의미론과 정합:

- 기준 시각 `now`(월요일 09:00 실행)에서 **직전 월요일 00:00:00 로컬(KST)** 을 `boundary`로 잡는다.
  (`now`가 월요일이면 그날 00:00 — 즉 실행 시점 기준 "방금 끝난 주"의 끝.)
- **currentWeek** = `[boundary − 7d, boundary)` — 방금 끝난 완결 주(월 00:00 ~ 차주 월 00:00).
- **previousWeek** = `[boundary − 14d, boundary − 7d)`.
- 근거: 월요일 아침 브리핑은 "지난주 완결분 vs 그 전주"를 보고해야 한다. 실행 당일
  분(월 00:00~09:00)을 currentWeek에 넣으면 창이 매 실행마다 9시간짜리 꼬리를 갖게 되어
  주 대 주 비교가 오염된다.
- 날짜 연산은 **로컬 타임존**(launchd 실행 환경=KST) `Date` 산술만 사용. DST 없는 KST에서
  `setDate(-7)` 산술은 안전. 라이브러리 추가 금지(NFR-1).

### 2-5. 발송 채널·게이트 (미결정 4번 확정)

- 발송 대상은 **내부 Slack, founder 대상** — 고객 대상 발신이 아니다.
- 위험도 **D1(내부 보고)**: `docs/AGENT_PROTOCOL.md` 게이트 표 기준 승인 게이트 **불요**.
  주 1회 자동 발송에 사람 승인 루프를 넣지 않는다(명문화 — 진행 노트 결정 4).
- 전송은 slack-gateway `POST /brief`(형제 f6a9f7c7)에 위임. Block Kit 유효성·Slack 에러
  핸들링은 그쪽 소관.

### 2-6. 유실 주 처리 (미결정 5번 확정): **스킵, catch-up 없음**

실행 시각에 머신이 꺼져 있던 주는 브리핑을 건너뛴다(다음 주 정상 실행).
launchd coalesce(잠자기 중 시각 경과 시 wake 직후 1회 실행)는 그대로 수용 —
그 경우도 §2-4 창 계산이 `now` 기준으로 올바른 "직전 완결 주"를 산출하므로 안전.
마지막 실행 시각 영속화·백필 로직은 MVP 스코프 밖(§8-2).

### 2-7. 실패 처리 (미결정 3번 확정): **fail-closed, 단계별 즉시 중단**

파이프라인 어느 단계든 reject하면 그대로 전파 → gateway가 `exit 1` + `.err` 로그
(기존 gateway.ts 공통 처리 재사용). 부분 데이터로 브리핑을 합성하거나 에러 요약을
Slack에 대신 보내는 동작은 하지 않는다 — 집계 spec FR-5의 fail-closed("브리핑에 가짜
0을 싣지 않는다")와 동일 원칙. 실패 관측은 launchd `.err` 로그 + 무소식(브리핑 미도착)
자체가 신호. 알림 고도화는 스코프 밖.

## 3. 기능 요구사항 (FR)

### FR-1 주간 창 계산 — 순수 함수

`services/hermes-runtime/src/tasks/weekly-executive-brief.ts`:

```ts
export interface WeekWindow {
  start: Date; // inclusive
  end: Date;   // exclusive
}

/** now 기준 직전 월요일 00:00(로컬)을 경계로 완결 주 2개를 반환. */
export function getWeeklyBriefWindows(now: Date): {
  currentWeek: WeekWindow;   // [boundary-7d, boundary)
  previousWeek: WeekWindow;  // [boundary-14d, boundary-7d)
};
```

- `boundary` = `now`가 속한 날부터 거슬러 올라간 가장 가까운 월요일 00:00:00.000 (로컬).
  `now`가 월요일이면 그날 00:00.
- 결정적(같은 `now` → 같은 출력), I/O·`Date.now()` 내부 호출 금지(NFR-2).

### FR-2 파이프라인 — 순수 오케스트레이션 함수 + 주입식 포트

같은 파일에:

```ts
export interface WeeklyExecutiveBriefDeps {
  /** 집계 태스크의 getExecutiveBriefData 시그니처와 동일 (2-arg 사용) */
  fetchSummaries: (start: Date, end: Date) => Promise<ExecutiveBriefAgentSummary[]>;
  toSnapshot: (s: ExecutiveBriefAgentSummary[]) => WeeklySnapshot;
  calculateDelta: (cur: WeeklySnapshot, prev: WeeklySnapshot) => WeeklyDelta;
  format: (briefData: ExecutiveBriefAgentSummary[], deltaData: WeeklyDelta) => unknown; // Block Kit
  /** 미지정 시 dry-run (FR-6) */
  send?: (message: unknown) => Promise<void>;
  now?: () => Date; // default: () => new Date()
  log?: (line: string) => void; // default: console.log
}

export interface WeeklyExecutiveBriefResult {
  currentWeek: WeekWindow;
  previousWeek: WeekWindow;
  agentCount: number;   // currentWeek summaries 그룹 수
  delta: WeeklyDelta;
  sent: boolean;        // 실발송 여부
  dryRun: boolean;      // send 미주입으로 스킵했는지
}

export async function runWeeklyExecutiveBrief(
  deps: WeeklyExecutiveBriefDeps,
): Promise<WeeklyExecutiveBriefResult>;
```

실행 순서(고정, expected_output의 (1)~(4)):

1. `getWeeklyBriefWindows(now())` → 창 2개.
2. `fetchSummaries(previousWeek.start, previousWeek.end)` → `toSnapshot` → `prevSnapshot`.
3. `fetchSummaries(currentWeek.start, currentWeek.end)` → `curSummaries` → `toSnapshot` → `curSnapshot`.
4. `calculateDelta(curSnapshot, prevSnapshot)` — **인자 순서 (current, previous)**, 델타 태스크 계약.
5. `format(curSummaries, delta)` — 임원별 상세는 currentWeek 것만 표시(브리핑 = 지난주 보고).
6. `send` 주입 시 `send(message)` 후 `sent: true`. 미주입 시 FR-6.

집계 결과 0건(빈 배열)이어도 파이프라인은 계속 진행한다(빈 주간도 보고 대상 —
"이번 주 활동 없음"의 표현은 포맷터 소관).

타입(`ExecutiveBriefAgentSummary`, `WeeklySnapshot`, `WeeklyDelta`)은 `@l5/core`에서
import한다(정본: 집계 spec FR-2/FR-6 + 델타 태스크 expected_output). hermes에 재선언 금지.

### FR-3 라이브 러너 — `runner.ts`

```ts
export async function runExecutiveWeeklyBriefLive(): Promise<WeeklyExecutiveBriefResult>;
```

- `fetchSummaries` = `@l5/core`의 `getExecutiveBriefData` (2-arg — 내장 NocoBase fetcher,
  `NOCOBASE_URL`/`NOCOBASE_TOKEN` env는 plist가 주입).
- `toSnapshot` = `toWeeklySnapshot`, `calculateDelta` = `calculateWeeklyDelta`,
  `format` = `formatExecutiveBrief` (모두 `@l5/core`).
- `send` = `SLACK_GATEWAY_BRIEF_URL` env가 설정된 경우에만 raw-fetch 어댑터
  (기존 hermes zero-dep 패턴):

```
POST {SLACK_GATEWAY_BRIEF_URL}
Content-Type: application/json
body: { "message": <Block Kit>, "channel_id": process.env.SLACK_BRIEF_CHANNEL_ID (설정 시) }
```

  비 2xx 응답은 throw(fail-closed §2-7). env 미설정 시 `send` 미주입 → dry-run.
  URL·채널을 env로만 받는 이유: 하드코딩 금지(CLAUDE.md 규칙 9) + /brief 포트는
  형제 f6a9f7c7이 확정하므로 이 태스크는 기본값을 가정하지 않는다.

### FR-4 gateway 등록

`src/gateway.ts` `TASK_RUNNERS`에 `"executive-weekly-brief": runExecutiveWeeklyBriefLive`
1줄 + 상단 주석 목록에 1줄 (`executive-weekly-brief — 임원 주간 브리핑 (Monday 09:00)`).

### FR-5 스케줄 정의

- `src/tasks/trigger-schedules.ts`:
  `EXECUTIVE_WEEKLY_BRIEF: "0 9 * * 1"` 추가 + 주석
  `// Executive weekly brief: every Monday at 09:00 (KST = machine local time)`.
- `launchd/com.l5.hermes.executive-weekly-brief.plist` 신규 —
  `cto-weekly-review.plist` 복제 후: Label 변경, 인자 `executive-weekly-brief`,
  `StartCalendarInterval` `Weekday=1/Hour=9/Minute=0`, 로그 경로
  `__LOG_DIR__/executive-weekly-brief.{log,err}`, `RunAtLoad=false`.
  `EnvironmentVariables`에 `NOCOBASE_URL` 포함(기존 패턴). `NOCOBASE_TOKEN`·
  `SLACK_GATEWAY_BRIEF_URL`은 **레포 plist에 넣지 않는다** — install 시
  설치본(`~/Library/LaunchAgents`)에 주입하는 기존 라이브 관행(메모리: NOCOBASE_TOKEN
  정본은 hermes plist 설치본) 유지. 시크릿 커밋 금지.
- `scripts/install-launchd.sh` `PLISTS` 배열에
  `"com.l5.hermes.executive-weekly-brief.plist"` 1줄 추가.
- **launchctl load(라이브 등록) 실행은 이 태스크 스코프 밖** — "통합 테스트 및 라이브
  전환"(ff35e829) 소관. 이 태스크는 파일·스크립트 준비까지.

### FR-6 dry-run 모드

`send` 미주입(= `SLACK_GATEWAY_BRIEF_URL` 미설정) 시:

- 발송을 스킵하고 `log()`로 정확히 다음 형식의 라인을 남긴다:
  `[Hermes] executive-weekly-brief 발송 준비 완료 (dry-run): agents=<n>, completedDelta=<d>`
  (expected_output 완료조건 "'발송 준비 완료' 로그" 충족 — 부분 문자열
  `발송 준비 완료`가 측정 기준).
- 반환값 `{ sent: false, dryRun: true }`, exit 0 (실패 아님 — 발송 형제 태스크가
  라이브되기 전에도 스케줄 태스크 단독 검증 가능해야 함).

### FR-7 단위 테스트

`src/tasks/__tests__/weekly-executive-brief.test.ts` 신규 — §7 AC-1~AC-4를 fake 포트로
검증. NocoBase·Slack·네트워크 접근 없음(기존 hermes 테스트 패턴).

## 4. 비기능 요구사항 (NFR)

- **NFR-1** 신규 runtime dependency 0 (`@trigger.dev/sdk`·`node-cron`·`croner` 도입 금지 —
  research 판정. `@l5/core` workspace 의존은 기존 존재).
- **NFR-2** `getWeeklyBriefWindows`·`runWeeklyExecutiveBrief`는 주입된 `now`/포트 외의
  전역 상태·I/O에 접근하지 않는다(결정적·단독 테스트 가능).
- **NFR-3** 시크릿(`NOCOBASE_TOKEN`, Slack 관련) 하드코딩·레포 plist 커밋 금지.
- **NFR-4** 기존 gateway.ts 실행 프레임(로그·exit code) 재사용 — 자체 process.exit 금지.

## 5. 영향 받는 파일·모듈

| 파일 | 변경 | 소유 phase |
|---|---|---|
| `services/hermes-runtime/src/tasks/weekly-executive-brief.ts` | **신규** — `getWeeklyBriefWindows` + `runWeeklyExecutiveBrief` (순수) | 구현 |
| `services/hermes-runtime/src/tasks/__tests__/weekly-executive-brief.test.ts` | **신규** — AC-1~AC-4 | test/red |
| `services/hermes-runtime/src/runner.ts` | `runExecutiveWeeklyBriefLive` + send 어댑터 추가 | 구현 |
| `services/hermes-runtime/src/gateway.ts` | `TASK_RUNNERS` 1줄 + 주석 1줄 | 구현 |
| `services/hermes-runtime/src/tasks/trigger-schedules.ts` | `EXECUTIVE_WEEKLY_BRIEF: "0 9 * * 1"` | 구현 |
| `services/hermes-runtime/launchd/com.l5.hermes.executive-weekly-brief.plist` | **신규** | 구현 |
| `services/hermes-runtime/scripts/install-launchd.sh` | `PLISTS` 1줄 | 구현 |
| `docs/_acr-progress/hermes-주간-스케줄-태스크-추가.md` | 진행 노트 갱신 | 각 phase |
| (참고) `packages/l5-core/src/functions/executive-brief.ts` | **수정 없음** — 집계·델타 형제 소유 | 형제 |
| (참고) `services/slack-gateway/src/*` | **수정 없음** — `/brief`는 f6a9f7c7 소유 | 형제 |

구현 순서 의존: `@l5/core`의 `getExecutiveBriefData`/`toWeeklySnapshot`(d0c45403),
`calculateWeeklyDelta`(34246ece), `formatExecutiveBrief`(2058b1fd)가 **먼저 구현**되어야
`runExecutiveWeeklyBriefLive`의 import가 성립한다. 순수 부분(FR-1/FR-2)은 포트 주입이라
형제 미구현 상태에서도 타입 선언만으로 테스트 가능 — 단, `@l5/core` export가 없으면
runner 배선은 컴파일 불가이므로 구현 phase는 형제 완료 이후 착수가 정답.

## 6. Acceptance Criteria (전부 객관 측정 가능)

실행 명령: `pnpm --filter @l5/hermes-runtime test -- weekly-executive-brief` (AC-1~4),
grep/파일 검사 (AC-5~6), 워크스페이스 명령 (AC-7), dry-run 실행 (AC-8).

- **AC-1 (주간 창)**: 단위 테스트로 ① `now`=2026-07-13(월) 09:00 로컬 →
  `currentWeek=[2026-07-06 00:00, 2026-07-13 00:00)`, `previousWeek=[2026-06-29, 2026-07-06)`
  (로컬 자정, ms=0) ② `now`=수요일 → 같은 주 월요일 00:00이 boundary
  ③ `now`=월요일 00:00 정각 → boundary는 그날 00:00 (창이 미래로 새지 않음)
  ④ `currentWeek.end.getTime() === previousWeek... + 7d` 등 창 길이 정확히 7일.
- **AC-2 (파이프라인 순서·인자)**: fake 포트 주입 후 ① `fetchSummaries`가 정확히 2회,
  1회차 호출 인자가 `(previousWeek.start, previousWeek.end)`, 2회차가
  `(currentWeek.start, currentWeek.end)` (jest `toHaveBeenCalledWith` 기준) ② `calculateDelta` 인자 순서가
  (currentSnapshot, previousSnapshot) ③ `format` 인자가 (currentWeek summaries, delta)
  ④ `send`가 format 반환값으로 정확히 1회 호출, `sent===true, dryRun===false`.
- **AC-3 (dry-run)**: `send` 미주입 시 ① 반환 `{sent:false, dryRun:true}` ② `log`로 수집한
  라인 중 `발송 준비 완료` 포함 라인 존재 ③ 어떤 네트워크 호출도 없음(포트 전부 fake).
- **AC-4 (fail-closed)**: ① `fetchSummaries` reject → 동일 에러로 reject하고
  `calculateDelta`/`format`/`send` 호출 0회 ② `send` reject → 동일 에러로 reject.
- **AC-5 (스케줄 정의 일치)**: ① `grep 'EXECUTIVE_WEEKLY_BRIEF: "0 9 \* \* 1"'
  src/tasks/trigger-schedules.ts` 매치 ② plist에서 `Weekday`=1, `Hour`=9, `Minute`=0,
  Label=`com.l5.hermes.executive-weekly-brief`, 인자=`executive-weekly-brief`
  (grep/plutil) ③ plist 파일 내 `xoxb`·`NOCOBASE_TOKEN`·`SLACK_GATEWAY_BRIEF_URL`
  문자열 부재(시크릿 미커밋, NFR-3).
- **AC-6 (등록 완결성)**: ① `grep '"executive-weekly-brief"' src/gateway.ts` 매치
  ② `grep 'com.l5.hermes.executive-weekly-brief.plist' scripts/install-launchd.sh` 매치
  ③ `grep 'runExecutiveWeeklyBriefLive' src/runner.ts src/gateway.ts` 양쪽 매치.
- **AC-7 (검증 명령)**: `pnpm --filter @l5/hermes-runtime typecheck` ·
  `pnpm --filter @l5/hermes-runtime test -- weekly-executive-brief` ·
  `pnpm --filter @l5/hermes-runtime build` 모두 exit 0.
- **AC-8 (dry-run 실전 실행 — 완료조건 4)**: build 후
  `SLACK_GATEWAY_BRIEF_URL= node dist/gateway.js executive-weekly-brief` 실행 →
  stdout에 `발송 준비 완료` 포함 + exit 0. (NocoBase 라이브 필요 — 형제 d0c45403의
  기본 fetcher 경유. 실행 캡처는 진행 노트에 기록.)
- **AC-9 (zero-dep)**: `services/hermes-runtime/package.json` `dependencies`에 이 태스크로
  인한 추가 항목 없음(`git diff`).

## 7. 검증 명령 요약 (구현 phase verifier용)

```bash
pnpm --filter @l5/hermes-runtime typecheck
pnpm --filter @l5/hermes-runtime test -- weekly-executive-brief
pnpm --filter @l5/hermes-runtime build
grep 'EXECUTIVE_WEEKLY_BRIEF: "0 9 \* \* 1"' services/hermes-runtime/src/tasks/trigger-schedules.ts
grep -c 'executive-weekly-brief' services/hermes-runtime/src/gateway.ts          # ≥2 (주석+맵)
grep 'com.l5.hermes.executive-weekly-brief.plist' services/hermes-runtime/scripts/install-launchd.sh
plutil -p services/hermes-runtime/launchd/com.l5.hermes.executive-weekly-brief.plist | grep -E 'Weekday|Hour|Minute'
grep -cE 'xoxb|NOCOBASE_TOKEN|SLACK_GATEWAY_BRIEF_URL' services/hermes-runtime/launchd/com.l5.hermes.executive-weekly-brief.plist  # 0
SLACK_GATEWAY_BRIEF_URL= node services/hermes-runtime/dist/gateway.js executive-weekly-brief  # '발송 준비 완료' + exit 0
```

## 8. 한계·리스크 (알고 수용)

1. **형제 의존**: `@l5/core` export 3종(`getExecutiveBriefData`/`calculateWeeklyDelta`/
   `formatExecutiveBrief`)과 slack-gateway `/brief`가 미구현이면 runner 배선·라이브 발송이
   막힌다. 순수 파이프라인(FR-1/2)은 독립 검증 가능하나, 구현 phase 착수는 형제 이후.
2. **유실 주**: 머신이 꺼져 있던 주는 스킵(§2-6). 브리핑 미도착이 곧 실패 신호 —
   백필·헬스체크는 별도 태스크.
3. **updatedAt 근사 상속**: 집계 spec §8-1의 한계(완료 후 창 밖 재수정 시 누락)를
   그대로 상속한다. 창 정의가 정확해도 소스 근사는 동일.
4. **KST=로컬 가정**: 머신 타임존이 KST가 아니게 바뀌면 "월 09:00 KST" 보장이 깨진다.
   launchd는 타임존 지정을 지원하지 않음 — 운영 전제(이 머신=KST)로 수용, plist 주석에 기록.
5. **/brief 계약 동결 전**: body 스키마 `{message, channel_id?}`는 f6a9f7c7의
   expected_output 기준. 그쪽 spec이 바뀌면 send 어댑터(FR-3)만 수정하면 됨(1함수 격리).
