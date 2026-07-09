# Research — 주간 변화 지표 계산 함수 (calculateWeeklyDelta)

- 날짜: 2026-07-09
- 프로젝트: 임원 주간 브리핑 자동화 (project_id=4)
- 태스크: `주간 변화 지표 계산 함수` (agent_tasks 34246ece)
- phase: research (코드 변경 없음, 분석 산출물만)

## 1. 요구사항 요약 (태스크 expected_output 기준)

`packages/l5-core/src/functions/executive-brief.ts`에 `calculateWeeklyDelta(currentWeek, previousWeek)` 구현.
반환: `{ completedTasksDelta, newBlockersCount, completionRateDelta, completionRatePercent }`.

완료조건:
- `pnpm test -- executive-brief` 통과 (delta 계산 테스트)
- 양수/음수 변화 방향 올바르게 반영
- 완료율 계산식: `(completed / (completed + inProgress + blocked)) * 100`
- 신규 블로커: 이번주 count − 지난주 count

역할 분담(같은 프로젝트의 형제 태스크와의 경계):
- **이 태스크**: 집계된 주간 스냅샷 2개를 받아 델타를 계산하는 **순수 계산 로직**.
- 형제 태스크 "NocoBase agent_tasks 집계 함수 구현": DB에서 주간 스냅샷을 뽑는 **데이터 수집** 담당.
- 형제 태스크 "Slack 메시지 포맷팅 함수"(research/spec 완료): 결과를 mrkdwn으로 **표현** 담당.

즉 이 함수의 입력은 이미 집계된 카운트 객체이고, 출력은 4개 수치다.

## 2. 후보 비교

### 후보 A — 순수 TypeScript 함수 (l5-core, zero-dependency)

`executive-brief.ts`에 입력 타입(`WeeklySnapshot` 등)과 순수 함수 하나를 두고 산술만 수행.
기존 l5-core 패턴(`founder-fit.ts`, `pmf-scoring.ts`, `brief-generation.ts`, `project-status/builder.ts`)과 동일한 형태.

### 후보 B — SQL 레벨 계산 (PostgreSQL window function / CTE)

집계 함수 태스크에 델타 계산까지 흡수. `agent_tasks`를 주차별로 GROUP BY 후
`LAG() OVER (ORDER BY week)` 또는 두 주차 CTE JOIN으로 델타를 DB에서 한 번에 산출.

### 후보 C — 통계/데이터 라이브러리 도입

- `simple-statistics` v7.9.3 (ISC, 최근 갱신 2026-07-03) — 기술통계 유틸.
- `arquero` v8.0.3 (BSD-3, 최근 갱신 2025-05-29) — 데이터프레임 변환.
(npm registry 2026-07-09 실측)

### 비교표

| 기준 | A. 순수 TS 함수 | B. SQL 계산 | C. 라이브러리 |
|---|---|---|---|
| expected_output 시그니처 일치 | ✅ 함수·반환형 그대로 구현 | ❌ 함수가 아니라 쿼리 — l5-core에 요구된 산출물 형태와 불일치 | ⚠️ 함수는 되지만 내부에 dep |
| 프로젝트 규칙 정합 | ✅ "핵심 판단 로직은 l5-core" + "NocoBase 없이 테스트 가능" 충족 | ❌ 계산 로직이 DB/Shell 쪽으로 새어나감(CLAUDE.md 위반) | ⚠️ l5-core에 두긴 하나 불필요한 runtime dep 추가 |
| 단위 테스트 (`pnpm test -- executive-brief`) | ✅ 입출력만으로 즉시 가능 | ❌ DB 통합 테스트 필요 — 완료조건의 unit test와 불일치 | ✅ 가능 |
| 구현 복잡도 | 산술 4줄 수준 + edge case | window function/CTE + 주차 경계 처리 | dep 설치 + API 학습 |
| 함정/리스크 | 0으로 나누기(분모 0) 정의 필요 | NocoBase `createdAt` camelCase 함정(조용한 빈배열), 주차 경계 타임존(UTC cron 함정은 critic이 이미 지적) | 뺄셈·나눗셈에 통계 라이브러리는 명백한 과잉(YAGNI); l5-core 신규 dep 심사 비용 |
| 형제 태스크와 경계 | ✅ 집계(수집)와 계산(판단) 분리 유지 | ❌ 집계 태스크에 계산이 흡수돼 태스크 경계 붕괴 | ✅ 경계는 유지 |

## 3. 판정

### 채택: 후보 A — 순수 TS 함수

근거:
1. 태스크 expected_output이 요구하는 산출물 형태(함수 시그니처·파일 위치·반환형)와 1:1로 일치한다.
2. CLAUDE.md 규칙("`l5-core` must be testable without NocoBase", "Every scoring rule must have unit tests")을 유일하게 무리 없이 충족한다.
3. 계산이 정수 뺄셈 3개 + 나눗셈 1개 — 외부 도구가 개입할 이유가 없다.
4. 기존 l5-core 함수들(founder-fit, pmf-scoring, project-status/builder)과 같은 패턴이라 리뷰·유지보수 비용이 최소다.

### 배제: 후보 B — SQL 계산

- 도메인 판단 로직이 DB 계층으로 새어나가 "NocoBase는 Shell" 원칙 위반.
- 완료조건(단위 테스트)과 충돌 — DB 없이는 검증 불가.
- 단, **주간 스냅샷을 뽑는 것 자체는 SQL이 맞다** — 그건 형제 태스크(집계 함수)의 몫이고, 그 태스크는 `createdAt` camelCase 함정을 반드시 피해야 한다(이 문서에서 인계).

### 배제: 후보 C — 라이브러리 도입

- 필요 연산이 산술 4개뿐이라 어떤 라이브러리도 과잉.
- slack-gateway가 slackify-markdown을 "runtime dep 0 정책의 첫 예외"로 어렵게 승인한 전례처럼, dep 추가는 실질 이득이 있을 때만 — 여기는 이득이 0이다.

## 4. spec phase로 넘길 미결정 사항 (구현 아님, 정의 필요)

1. **분모 0**: `completed + inProgress + blocked === 0`일 때 `completionRatePercent`를 `0`으로 볼지 `null`로 볼지. (브리핑 표현상 "데이터 없음"과 "0%"는 다름 — spec에서 결정). `completionRateDelta`도 current/previous **어느 한쪽** 분모가 0인 경우를 각각 명시할 것(codex QA 지적).
2. **첫 주(previousWeek 없음)**: `previousWeek`가 undefined/전부 0일 때 델타 의미 정의(델타 0? null? "비교 불가" 플래그?).
3. **입력 타입**: `WeeklySnapshot = { completed, inProgress, blocked, blockers }` 형태 확정 — 집계 함수 태스크와 필드명 계약을 맞춰야 함(스냅샷의 소스는 `agent_tasks.status` + `blocker` 컬럼).
4. **completionRateDelta의 기준**: 이번주 완료율 − 지난주 완료율(%p 차이)로 정의하는 것이 자연스러우나 spec에서 명문화.
5. **반올림 정책**: `completionRatePercent` 소수점 자리수(브리핑 표시용이므로 1자리 제안).
