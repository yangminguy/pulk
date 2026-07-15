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

## phase: test/red (2026-07-09) — 완료

- 산출물: `services/slack-gateway/src/__tests__/formatting.test.ts` (신규, 10케이스 — AC-1/AC-2/AC-2b①②③/AC-3×2/AC-4①②/AC-5①). 커밋 안 함(red phase 규칙).
- red 확인: `pnpm test` → formatting.test.ts만 FAIL, 실패 원인이 정확히 구현 부재 2건(TS2307 `slackify-markdown` 미설치 + `../formatting.js` 미존재). 기존 router/cto-planning 22케이스는 PASS 유지. `pnpm typecheck` exit 0(tsconfig가 `__tests__` 제외).
- codex QA 1회전: 41,000자 문언 불일치(42,000자 사용) 지적 → `OVERSIZED_INPUT`(정확히 41,000자)으로 수정 반영.
- 테스트 구조: top-level await는 ts-jest가 TS1378로 거부 → `beforeAll`에서 실 라이브러리 import 후 `jest.unstable_mockModule`로 감싸고 `formatting.js` 동적 import. mock 기본 구현=실 라이브러리 위임(변환 커버리지 실검증), AC-4에서만 throw 스왑.

## 다음 phase(구현)에서 알아야 할 것 (test/red에서 추가)

- **worktree 환경 함정**: 이 worktree는 `NODE_ENV=production`이라 pnpm이 devDeps를 안 깐다(`node_modules/.modules.yaml`의 `devDependencies: false` 고착). 복구: `NODE_ENV=development corepack pnpm install --filter @l5/slack-gateway --prod=false --config.confirm-modules-purge=false`. 테스트 실행도 `NODE_ENV=development corepack pnpm test`.
- **NFR-2 리스크 잔존**(codex 지적): 테스트가 beforeAll에서 실 `slackify-markdown`을 선-import한다. ts-jest의 effective module 설정이 CJS로 떨어져 ESM-only v5 로드가 실패하면 spec NFR-2대로 테스트의 실-import를 mock으로 교체해야 한다(구현 phase에서 판단). 로드 실패 증상: TS2307이 아니라 런타임 ERR_REQUIRE_ESM.
- 구현이 만들 것: `src/formatting.ts`(`formatSlackText` export, import 1줄만), `package.json` deps에 `slackify-markdown ^5.0.0`. 이 2개만 생기면 테스트 수정 없이 green이어야 한다.

## 다음 phase(구현)에서 알아야 할 것

- slack-gateway는 `"type": "module"` ESM + runtime dep 0개 정책 → slackify-markdown이 첫 예외.
- 구현 위치: `services/slack-gateway/src/formatting.ts` (순수 함수). 적용: `index.ts` postMessage 직전.
- 함정 1: `cto-planning-bridge.ts`는 이미 손 mrkdwn(`*bold*`) 사용 → 이중 변환 회귀 테스트 필요.
- 함정 2: Slack text 한도 40,000자 → truncation 정책.
