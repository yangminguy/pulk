# 진행 노트 — Hermes 주간 스케줄 태스크 추가

- 프로젝트: 임원 주간 브리핑 자동화 (project_id=4)

## research phase (2026-07-09) — 완료

- 산출물: `docs/research/hermes-weekly-schedule-task.md`
- 후보 3개 비교: A. launchd plist + gateway 등록(기존 라이브 패턴) / B. Trigger.dev / C. node-cron·croner
- **판정: 후보 A 채택.** 주간 선례 `com.l5.hermes.cto-weekly-review.plist`(Weekday=1, Hour=10)를
  복제하는 수준으로 구현 가능. dep 0, 기존 launchd 운영 체계(로그·install 스크립트)에 편승.
- Trigger.dev 배제(서버 인프라 신설 과잉, 코드베이스 채택 이력 0),
  node-cron/croner 배제(launchd 위 스케줄러 중복, 상주 프로세스 리스크만 추가).

### 코드베이스 실측 (spec/구현 phase가 쓸 좌표)

- 등록 지점 5곳: `services/hermes-runtime/src/gateway.ts` `TASK_RUNNERS` 맵 /
  `src/runner.ts` `run*Live()` / `src/tasks/trigger-schedules.ts` `HERMES_SCHEDULES` 상수 /
  `launchd/com.l5.hermes.*.plist` / `scripts/install-launchd.sh` `PLISTS` 배열.
- plist는 `__NODE_PATH__`, `__HERMES_DIR__`, `__LOG_DIR__` 플레이스홀더를 install 스크립트가 치환.
- 형제 태스크 상태: 집계 함수(spec 완료, `docs/specs/executive-brief-aggregation-spec.md` —
  `WeeklySnapshot` 계약 정본), 델타 계산(`packages/l5-core/src/functions/executive-brief.ts` +
  실패 테스트 작성됨), Slack 포맷팅(`services/slack-gateway/src/__tests__/formatting.test.ts` 작성됨).

## spec phase (2026-07-09) — 완료

- 산출물: `docs/specs/executive-weekly-brief-schedule-spec.md`
- research 미결정 5건 전부 확정:
  1. **실행 시각 월 09:00 KST 확정** (09:30 제안 기각 — expected_output의 측정 조건
     `'0 9 * * 1'` 우선, launchd 태스크는 독립 프로세스라 09:00 공존 무해).
  2. 이름 확정: 파일 `tasks/weekly-executive-brief.ts`(expected_output 경로) /
     gateway 태스크명 `executive-weekly-brief` / plist Label `com.l5.hermes.executive-weekly-brief`.
  3. 파이프라인: 순수 `runWeeklyExecutiveBrief(deps)`(포트 주입) + `runExecutiveWeeklyBriefLive()` 배선.
     실패 처리 fail-closed(어느 단계든 reject → exit 1, 부분 브리핑 합성 금지).
  4. 발송 D1(내부 Slack, founder) — 승인 게이트 불요 명문화. 전송은 `POST /brief`(f6a9f7c7) 위임,
     `SLACK_GATEWAY_BRIEF_URL` env 미설정 시 dry-run('발송 준비 완료' 로그).
  5. 유실 주 스킵(catch-up 없음) 확정.
- 주간 창 정의: 직전 월요일 00:00 로컬(KST) boundary, currentWeek=[b−7d,b) / previousWeek=[b−14d,b−7d)
  — 집계 spec 반개구간 의미론과 정합, 실행 당일 꼬리 배제.
- expected_output의 "Trigger.dev" 문구는 research 판정(launchd)으로 대체하되 측정 가능한
  완료조건 4건(테스트/cron 표현식/KST/dry-run 로그)은 전부 유지 — spec §2-1 매핑 표.
- DB 실측: project_id=4 형제 6개 task의 expected_output 원문 확인(REST). 델타 계약
  `calculateWeeklyDelta(current, previous)` 인자 순서, 포맷터 `formatExecutiveBrief(briefData, deltaData)`,
  /brief body `{message, channel_id?}` 를 spec에 고정.
- QA 1회전 (codex 사용량 한도로 agy 대체, 2026-07-09): 코드 좌표 전부 통과, 주간 창 로직
  "경계 버그 없음" 판정. MUST-FIX 1건(§1 표의 델타 함수 인자 표기 → snapshot으로 교정),
  NICE 1건(AC-2 인자 서술을 `toHaveBeenCalledWith(start, end)` 기준으로 명확화) — 둘 다 반영 완료.

## test phase (2026-07-09) — 완료 (red)

- 산출물: `services/hermes-runtime/src/tasks/__tests__/weekly-executive-brief.test.ts` (신규, 유일한 변경).
- spec §6 AC-1~AC-4 커버: AC-1 창 계산 5케이스(①월09:00/②수요일/③월00:00정각/④7일 길이/결정성),
  AC-2 파이프라인 4케이스(fetch 2회 인자순서·delta(cur,prev)·format(curSummaries,delta)·send 1회),
  AC-3 dry-run(`발송 준비 완료` 로그+sent:false/dryRun:true), AC-4 fail-closed 2케이스.
- **red 확인**: `pnpm test -- weekly-executive-brief` →
  `TS2307: Cannot find module '../weekly-executive-brief.js'` — 구현 phase가 모듈 생성 시 해소.
- QA 1회전 (codex 사용량 한도 지속 → agy 대체): MUST-FIX 0, NICE 1(③ 케이스 단언 확장) — 반영 완료.
  날짜 픽스처(2026-07-13 월 등) 실제 달력 일치 판정.
- 설계 결정: `@l5/core` 타입(`ExecutiveBriefAgentSummary` 등)이 아직 미구현이라 테스트는
  로컬 구조적 픽스처 + `as unknown as WeeklyExecutiveBriefDeps` 캐스트로 형제 미구현과 디커플링.
  red 실패 원인이 오직 "태스크 모듈 부재" 하나로 귀속되도록 함.
- 환경 함정: 이 worktree는 `NODE_ENV=production`이 셸에 설정돼 있어 pnpm install이
  devDependencies(jest)를 스킵함 → **`NODE_ENV=development corepack pnpm install`/`test` 필요**.
- 커밋 안 함(acceptance 준수) — untracked 1파일 상태로 다음 phase에 인계.
  → 이후 오케스트레이터가 30f37f8("l5 phase: 실패 테스트 작성")로 커밋 완료 (review phase 실측).

## review phase (2026-07-09) — 완료

- 검토 범위: task 커밋 3개(451b290 research / 951d3fd spec / 30f37f8 test-red)의 diff 전체
  = `docs/research/hermes-weekly-schedule-task.md` + `docs/specs/executive-weekly-brief-schedule-spec.md`
  + `services/hermes-runtime/src/tasks/__tests__/weekly-executive-brief.test.ts` + 진행 노트.
- 방법: Claude 직접 검토(달력 검산·좌표 실측·AC 매핑·red 재현) + agy 교차 QA
  (codex는 사용량 한도 지속 → agy 대체, 이전 phase와 동일 경로).
- **판정: 수정 1건 반영 후 LGTM.**
  - MUST-FIX 1 (반영 완료): spec §3 FR-1 인터페이스 주석
    `docs/specs/executive-weekly-brief-schedule-spec.md:108` —
    `previousWeek // [boundary-14d, boundary)` → `[boundary-14d, boundary-7d)`.
    §2-4 정의(63행) 및 테스트 AC-1 단언과 정합하도록 교정. 로직·테스트 수정 불필요(주석 오기).
  - NICE 1 (반영 완료): 진행 노트 test phase의 "커밋 안 함/untracked" 서술이 stale
    (30f37f8로 커밋됨) → 실측 병기.
- 통과 확인 항목:
  - 날짜 픽스처 전부 2026 실제 달력 일치(07-13 월/07-15 수/07-06 월/06-29 월).
  - `localMidnight`(1-based) vs `new Date`(0-based) 혼용 라인별 검산 — 오프바이원 없음.
  - 테스트가 spec §6 AC-1(5케이스)·AC-2(4)·AC-3(1)·AC-4(2)를 정확 커버,
    AC-2①은 상대 단언+절대값 고정(134-135행)으로 자기참조 통과 불가.
  - spec 참조 코드 좌표 실측 일치: launchd plist 13개, `cto-weekly-review.plist`
    Weekday=1/Hour=10, `gateway.ts` TASK_RUNNERS(30행), `trigger-schedules.ts`
    HERMES_SCHEDULES(14행), `install-launchd.sh` PLISTS(51행).
  - `delete deps.send` 방식 — `send?` optional이므로 타입/의미상 문제 없음.
  - red 재현: `NODE_ENV=development corepack pnpm test -- weekly-executive-brief` →
    `TS2307 ../weekly-executive-brief.js` 단일 원인 실패 확인(구현 phase에서 해소 예정).
  - `.js` 확장자 import는 jest.config.cjs moduleNameMapper가 strip — 컨벤션 문제 없음.

## 다음 phase(구현)에서 할 것

1. 구현 순서 의존: `@l5/core` export 3종(집계 d0c45403 / 델타 34246ece / 포맷터 2058b1fd)
   구현 이후 runner 배선 가능. 순수 부분(창 계산+파이프라인)은 먼저 test/red 가능.
2. 신규/수정 파일 7개는 spec §5 표. AC-1~AC-9는 spec §6, 검증 명령은 §7.
3. launchctl load(라이브 등록)는 이 태스크 스코프 밖 — 통합 태스크(ff35e829) 소관.
