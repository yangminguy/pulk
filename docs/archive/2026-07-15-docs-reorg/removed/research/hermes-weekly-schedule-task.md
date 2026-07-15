# Research — Hermes 주간 스케줄 태스크 추가 (executive weekly brief trigger)

- 날짜: 2026-07-09
- 프로젝트: 임원 주간 브리핑 자동화 (project_id=4)
- 태스크: `Hermes 주간 스케줄 태스크 추가`
- phase: research (코드 변경 없음, 분석 산출물만)

## 1. 요구사항 요약

임원 주간 브리핑 파이프라인(집계 → 델타 → Slack 포맷팅)을 **주 1회 자동 기동**하는
Hermes 스케줄 태스크를 추가한다. 형제 태스크와의 경계:

| 형제 태스크 | 담당 | 이 태스크와의 관계 |
|---|---|---|
| NocoBase agent_tasks 집계 함수 (spec 완료) | 주간 스냅샷 데이터 수집 | 스케줄이 호출하는 1단계 |
| 주간 변화 지표 계산 함수 (test 작성 완료) | 스냅샷 2개 → 델타 계산 | 2단계 순수 로직 |
| Slack 메시지 포맷팅 함수 (test 작성 완료) | 결과 → mrkdwn 표현 | 3단계 표현 |
| **이 태스크** | **주 1회 트리거 + 파이프라인 배선** | 위 3개를 순서대로 부르는 스케줄 껍데기 |

즉 이 태스크의 본질은 "언제·어떻게 주기 실행을 걸 것인가"이며, 조사 대상은 스케줄링 방식이다.

## 2. 현재 Hermes 스케줄 실행 방식 (실측)

- **정본 런타임은 macOS launchd다.** `services/hermes-runtime/launchd/`에 13개 plist가 있고,
  각 plist는 `node dist/gateway.js <task-name>`을 `StartCalendarInterval`로 기동한다.
- **주간 실행 선례가 이미 있다**: `com.l5.hermes.cto-weekly-review.plist`
  (`Weekday=1, Hour=10` — 매주 월요일 10:00). `memory-review-generator`도
  `HERMES_SCHEDULES.MEMORY_REVIEW_GENERATOR = "0 17 * * 5"`(금 17:00) 상수를 갖는다.
- 태스크 등록 지점: `src/gateway.ts`의 `TASK_RUNNERS` 맵 + `src/runner.ts`의 `run*Live()` +
  `src/tasks/trigger-schedules.ts`의 `HERMES_SCHEDULES` 상수 + plist +
  `scripts/install-launchd.sh`의 `PLISTS` 배열.
- `README.md`는 "Trigger.dev 기반" 방향을 적어두었지만 **scaffold 단계 문구 그대로이고,
  package.json에 `@trigger.dev/sdk` 의존성이 없다** — 실제 채택된 적 없음.

## 3. 후보 비교

### 후보 A — launchd plist + gateway 태스크 등록 (기존 라이브 패턴, dep 0)

`executive-weekly-brief` 태스크를 `TASK_RUNNERS`에 등록하고
`com.l5.hermes.executive-weekly-brief.plist`(Weekday 기반 `StartCalendarInterval`)를 추가.
`install-launchd.sh` PLISTS 배열에 1줄 추가. `HERMES_SCHEDULES`에 cron 상수 병기(문서 목적).

### 후보 B — Trigger.dev schedules (`@trigger.dev/sdk`)

npm 실측(2026-07-09): v4.5.1, MIT, 최근 갱신 2026-07-08. `schedules.task({ cron })`으로
선언적 스케줄 정의. 단, Trigger.dev 서버(클라우드 또는 self-host)가 실행 인프라로 필요하다.

### 후보 C — in-process Node 스케줄러 라이브러리

- `node-cron` v4.6.0 (ISC, 2026-07-05 갱신) — 가장 대중적인 cron 라이브러리.
- `croner` v10.0.1 (MIT, 2026-06-05 갱신) — dep 0, 타임존 지원, 오버런 보호.
(npm registry 2026-07-09 실측)
상주 Node 프로세스 하나를 띄워 그 안에서 주기 실행하는 방식.

### 비교표

| 기준 | A. launchd + gateway | B. Trigger.dev | C. node-cron / croner |
|---|---|---|---|
| 기존 패턴 정합 | ✅ 라이브 plist 13개와 동일, **주간 선례(cto-weekly-review) 존재** | ❌ README 문구뿐, 코드베이스에 채택 이력 0 | ❌ Hermes에 상주 스케줄러 프로세스 선례 없음 |
| 신규 의존성/인프라 | ✅ 0 (launchd는 OS 내장) | ❌ SDK dep + Trigger.dev 서버(클라우드=외부 서비스, self-host=운영 부담) | ⚠️ dep 1개 + **상주 프로세스 신설**(launchd KeepAlive로 또 감싸야 함 — 이중 구조) |
| 재부팅/크래시 내구성 | ✅ launchd가 OS 레벨 보장 (l5 5개 서비스 운영 전례) | ✅ 서버가 살아있다면 보장 | ⚠️ 프로세스 죽으면 스케줄 소실 — 결국 launchd 의존 |
| 실행 단위 | 주 1회 단발 프로세스 — 실패해도 다음 주 재기동, 메모리 누수 무관 | 장기 실행 워커 | 장기 실행 프로세스 (누수/좀비 리스크) |
| 관측성 | ✅ 기존 `~/Library/Logs/l5-hermes/*.log` 패턴 그대로 | ✅ 대시보드 우수 (그러나 이 1개 태스크를 위해 도입은 과잉) | ⚠️ 자체 로깅 배선 필요 |
| 구현 비용 | plist 1개 + TASK_RUNNERS 1줄 + runner 함수 + install 스크립트 1줄 | 프로젝트 초기화 + 서버 프로비저닝 + 배포 파이프라인 | 데몬 엔트리포인트 신설 + plist(KeepAlive) 여전히 필요 |
| 함정 | 잠자기 중 시각 경과 시 wake 직후 1회 실행(coalesce), **꺼져 있으면 그 주 실행 유실** — 주간 브리핑 특성상 수용 가능(다음 주 복구) or spec에서 catch-up 정의 | MVP-critical 기능의 외부 서비스 의존(CLAUDE.md 정신 위배 소지) | launchd 위에 스케줄러를 또 얹는 구조 중복 — 이득 없음 |

## 4. 판정

### 채택: 후보 A — launchd plist + gateway 태스크 등록

근거:
1. **주간 실행 선례가 그대로 있다**: `cto-weekly-review`가 동일한 요구(주 1회, 월 10:00)를
   이미 launchd `Weekday` 키로 라이브 운영 중 — 복제 수준의 구현으로 끝난다.
2. 신규 의존성·인프라 0. 이 태스크의 실질은 파이프라인 배선이지 스케줄러 교체가 아니다.
3. 재부팅 내구성·로그·설치 스크립트까지 기존 운영 체계(launchd 5+13 구성)에 그대로 편승한다.
4. 주 1회 단발 실행은 launchd의 최적 사용처다(상주 프로세스 불필요).

### 배제: 후보 B — Trigger.dev

- 실행 서버라는 새 인프라가 필요한데, 이 프로젝트에서 Trigger.dev는 README 선언 이후
  한 번도 실도입된 적이 없다. 주간 태스크 1개를 위해 서버를 세우는 것은 명백한 과잉.
- 클라우드 사용 시 MVP-critical 기능이 외부 서비스에 묶인다.
- 단, 장기적으로 Hermes 전체를 Trigger.dev로 이관하는 결정이 내려지면 그때 일괄 이전
  대상에 포함하면 된다 — 이 태스크에서 선행할 이유가 없다.

### 배제: 후보 C — node-cron / croner

- launchd가 이미 스케줄러다. 그 위에 in-process 스케줄러를 얹으면 상주 프로세스
  관리(KeepAlive, 크래시, 누수)만 추가되고 얻는 것이 없다(구조 중복).
- croner 자체는 우수한 라이브러리지만(dep 0, 타임존), "주 1회 실행"에 초 단위
  정밀도·타임존 연산이 필요하지 않다.

## 5. spec phase로 넘길 미결정 사항 (구현 아님, 정의 필요)

1. **실행 시각**: 월요일 오전(예: 09:30 — daily-brief 18:00·cto-weekly-review 10:00과
   겹치지 않게) vs 금요일 오후. 브리핑의 "주간" 창 정의(집계 spec의 기간 파라미터)와 맞물림.
2. **태스크 이름**: gateway 태스크명(`executive-weekly-brief` 제안)과 plist Label
   (`com.l5.hermes.executive-weekly-brief`).
3. **파이프라인 배선 형태**: runner의 `runExecutiveWeeklyBriefLive()`가
   집계 → `calculateWeeklyDelta` → Slack 포맷팅 → 발송을 호출하는 순서와 실패 시 처리
   (부분 실패 시 Slack에 에러 요약을 보낼지, 로그만 남길지).
4. **발송 채널·게이트**: Slack 발송은 내부 채널(founder 대상)이므로 D1~D2 수준으로 보고
   승인 게이트 불요로 판단되나 spec에서 명시. 고객 대상 아님을 명문화.
5. **유실 주 처리**: 실행 시각에 머신이 꺼져 있던 주의 catch-up 여부(launchd 함정 §3).
   MVP는 "스킵, 다음 주 정상 실행"을 기본값으로 제안.
6. **HERMES_SCHEDULES 상수**: cron 문자열 병기(`"30 9 * * 1"` 형태) — 문서/이식성 목적.
