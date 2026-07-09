# 진행 노트 — Slack 메시지 포맷팅 함수

## phase: research (2026-07-09) — 완료

- 산출물: `docs/research/slack-message-formatting-libs.md`
- 결정: **slackify-markdown 채택** (md→mrkdwn, 접근 A). 자체 래퍼 `formatting.ts` 뒤에 감춰 교체 가능성 확보.
- 배제: @tryfabric/mack(4년 비유지보수+Block Kit 강제), slack-block-builder(변환기 아님), md-to-slack(차선 fallback으로만 유지).
- 실측 근거: npm registry 2026-07-09 — slackify-markdown 356k/주, v5.0.0(2025-11, ESM-only, MIT).

## phase: spec (2026-07-09) — 완료

- 산출물: `docs/specs/slack-message-formatting-spec.md`
- FR 7개 + NFR 4개 + AC 10개(전부 unit test/grep/명령으로 측정 가능) + 영향 파일 7개 식별.
- codex QA 3회전: 1차 FAIL(AC-4/FR-6 모순, FR-2 커버리지 누락 등) → 보강 → 3차 최종 **PASS**.
- 핵심 결정: 적용 지점은 index.ts executive 응답 1곳만. planning 경로(cto-planning-bridge)는 이미 mrkdwn → 미적용 + AC-5 회귀 테스트로 고정. truncation 40k(39,900 + suffix). fail-open(변환 실패 시 원본 반환).
- ESM-only(slackify-markdown v5) × jest CJS 충돌 가능 → 테스트는 모듈 mock, 실 변환은 build 후 스모크(NFR-2).

## 다음 phase(구현)에서 알아야 할 것

- slack-gateway는 `"type": "module"` ESM + runtime dep 0개 정책 → slackify-markdown이 첫 예외.
- 구현 위치: `services/slack-gateway/src/formatting.ts` (순수 함수). 적용: `index.ts` postMessage 직전.
- 함정 1: `cto-planning-bridge.ts`는 이미 손 mrkdwn(`*bold*`) 사용 → 이중 변환 회귀 테스트 필요.
- 함정 2: Slack text 한도 40,000자 → truncation 정책.
