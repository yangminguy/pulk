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

## 다음 phase(spec)에서 결정할 것

1. 실행 시각(월 09:30 제안 — 10:00 cto-weekly-review와 회피) + 집계 주간 창 정의와 정합.
2. 태스크명 `executive-weekly-brief` / plist Label `com.l5.hermes.executive-weekly-brief` 확정.
3. runner `runExecutiveWeeklyBriefLive()`의 파이프라인 순서(집계→델타→포맷→발송)와 실패 처리.
4. 발송은 내부 Slack(founder 대상) — D1~D2, 승인 게이트 불요 명문화.
5. 머신 꺼짐으로 유실된 주 처리: MVP는 스킵(catch-up 없음) 제안.
