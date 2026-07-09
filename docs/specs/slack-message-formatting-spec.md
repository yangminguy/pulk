# Spec — Slack 메시지 포맷팅 함수 (Markdown → mrkdwn)

- **작성일**: 2026-07-09
- **phase**: spec (research 완료 후속 — `docs/research/slack-message-formatting-libs.md`)
- **status**: proposed

## 1. 배경 / 문제

`services/slack-gateway`는 executive(headless claude) 응답을 **plain text 그대로**
`chat.postMessage`의 `text` 필드로 전송한다. LLM 응답은 표준 Markdown
(`**bold**`, `# heading`, `[link](url)`, ` ```code``` `)인데 Slack은 자체
**mrkdwn**(`*bold*`, `<url|link>`, heading 미지원)을 쓰므로 Slack에서 렌더링이 깨진다
(예: `**볼드**`가 별표 그대로 노출).

research phase 결정(2026-07-09): **slackify-markdown v5 채택**(md→mrkdwn 문자열 변환,
접근 A), 자체 래퍼 뒤에 감춰 라이브러리 교체 가능성 확보.

## 2. 요구사항

### 기능 요구사항 (FR)

| ID | 요구사항 |
|---|---|
| FR-1 | `formatSlackText(markdown: string): string` 순수 함수를 `services/slack-gateway/src/formatting.ts`에 신설한다. 표준 Markdown을 Slack mrkdwn으로 변환한다. |
| FR-2 | 변환 커버리지: `**bold**`→`*bold*`, `[t](url)`→`<url\|t>`, `# heading`→볼드 라인, 리스트(`-`/`1.`)→mrkdwn 리스트(`•`/번호), 인라인 코드·코드블록 보존. |
| FR-3 | 적용 지점은 `index.ts`의 **executive 응답 postMessage 1곳** (`` `*${bot.label}*\n\n${result.reply}` `` — index.ts:119-123). `result.reply`만 변환하고 `*${bot.label}*` 헤더는 변환하지 않는다. |
| FR-4 | CTO planning 경로(`cto-planning-bridge.ts`)는 이미 손 mrkdwn을 생성하므로 **변환을 적용하지 않는다** (이중 변환 방지). 단, 회귀 테스트로 고정한다(AC-5). |
| FR-5 | Truncation: 변환 **후** 결과가 40,000자(Slack `text` 하드리밋)를 넘으면 39,900자에서 자르고 `\n… (truncated)` 접미사를 붙인다. 한도는 `formatting.ts` 내 상수. |
| FR-6 | Fail-open: 변환 중 예외 발생 시 변환을 생략하고 **원본 문자열에 FR-5 truncation만 적용해** 반환한다(메시지 유실 금지, 예외 전파 금지). |
| FR-7 | 라이브러리(`slackify-markdown`)는 `formatting.ts` 안에서만 import한다. 다른 모듈이 직접 import하는 것을 금지(교체 가능성 확보). |

### 비기능 요구사항 (NFR)

| ID | 요구사항 |
|---|---|
| NFR-1 | `slackify-markdown ^5.0.0`이 slack-gateway의 **첫 runtime dependency**가 된다 (기존 "raw fetch, dep 0" 정책의 명시적 예외 — `docs/DECISIONS.md`에 기록). |
| NFR-2 | ESM 호환: v5는 ESM-only ↔ 패키지 `"type": "module"` 일치. jest(ts-jest, `jest.config.cjs`)에서 ESM-only dep을 로드 못 하면 테스트에서는 라이브러리를 모듈 mock으로 대체하되, 래퍼 자체 로직(truncation/fail-open/우회 규칙)은 실제 코드로 검증한다. |
| NFR-3 | `formatting.ts`는 순수 함수만 포함(네트워크/IO 금지) — NocoBase 없이 단독 unit-testable. |
| NFR-4 | `slack-api.ts` 시그니처 무변경 (Block Kit 전환 없음). |

### 스코프 밖

- Block Kit(`blocks`) 전환, interactive 승인 버튼.
- 시작/오류/파일 알림 메시지(index.ts:111-115, 136-141, 146)의 변환 — 손으로 쓴 고정 문자열이라 불필요.
- telegram 등 다른 게이트웨이.

## 3. Acceptance Criteria (측정 가능)

| ID | 기준 | 측정 방법 |
|---|---|---|
| AC-1 | `formatSlackText('**bold** and [link](https://x.com)')`의 반환값에 `*bold*`와 `<https://x.com\|link>`가 포함되고, `**`가 포함되지 않는다. | unit test |
| AC-2 | `# 제목` 입력 시 반환값에 `#` 리터럴이 남지 않고 볼드(`*제목*`) 형태로 나온다. | unit test |
| AC-2b | 리스트/코드 커버리지(FR-2): ①`- item` 입력의 반환값에 정확히 `• item` 문자열 포함 ②`` `inline` `` 입력의 반환값에 `` `inline` `` 그대로 포함 ③```` ```code``` ```` 펜스 블록의 반환값에 ```` ``` ```` 펜스와 내부 코드가 보존된다. | unit test (3케이스) |
| AC-3 | 41,000자 Markdown 입력 시 반환값 길이 ≤ 40,000 이고, 정확히 `\n… (truncated)` 문자열로 끝나며, truncation 이전 본문은 **변환된** 텍스트다(입력 `**b**` 반복 → 출력에 `**` 부재로 검증). 39,999자 입력(한도 미만)은 truncation 미발생. | unit test (경계 2케이스) |
| AC-4 | 변환기가 throw하도록 mock했을 때: ①짧은 입력 → 원본이 그대로 반환 ②41,000자 입력 → 원본 기준 FR-5 truncation이 적용되어 길이 ≤ 40,000 + `\n… (truncated)` 접미사. 두 경우 모두 예외 전파 없음. | unit test (2케이스) |
| AC-5 | 회귀(이중 변환 방지): ①이미 mrkdwn인 입력 `*CTO 계획 제안*`을 `formatSlackText`에 통과시켜도 반환값에 `**`가 생기지 않는다(unit test) ②planning 경로 미적용: `index.ts`에서 `formatSlackText` 호출 횟수가 정확히 1회이고, 그 인자가 `result.reply`다(`grep -c "formatSlackText(" src/index.ts` == 1 + `grep "formatSlackText(result.reply)" src/index.ts` 매치) ③`grep -c "formatSlackText\|slackify-markdown" src/cto-planning-bridge.ts` == 0. | unit test + grep |
| AC-6 | `index.ts` executive 응답 postMessage의 `text`가 `` `*${bot.label}*\n\n${formatSlackText(result.reply)}` `` 형태다 — 헤더 `*${bot.label}*`는 변환 함수 밖(FR-3). | grep(AC-5②와 동일 명령) + `pnpm typecheck` |
| AC-7 | `slackify-markdown` import가 `src/formatting.ts` 1개 파일에만 존재한다. | `grep -rl "slackify-markdown" src/` 출력 == `src/formatting.ts` 1줄 |
| AC-8 | `pnpm typecheck` · `pnpm test` · `pnpm build`가 slack-gateway 워크스페이스에서 모두 exit 0. | 명령 실행 |
| AC-9 | NFR 준수: ①`docs/DECISIONS.md`에 slackify-markdown 예외 결정 존재(`grep -i "slackify-markdown" docs/DECISIONS.md` 매치) ②`formatting.ts`의 import 문이 정확히 1줄이고 그 대상이 `slackify-markdown`이다(`grep -c "^import" src/formatting.ts` == 1 + 해당 줄에 `slackify-markdown` 포함) — bare/`node:*`/동적 import 전부 배제 ③`git diff`에 `src/slack-api.ts` 변경 없음 ④`package.json`의 `dependencies`에 `slackify-markdown` 존재(grep). | grep + git diff |

## 4. 영향 파일 / 모듈

| 파일 | 변경 |
|---|---|
| `services/slack-gateway/src/formatting.ts` | **신규** — `formatSlackText` 래퍼 + truncation 상수 + fail-open |
| `services/slack-gateway/src/__tests__/formatting.test.ts` | **신규** — AC-1~AC-5 unit tests |
| `services/slack-gateway/src/index.ts` | 수정 — executive 응답 경로(현 119-123행)에 `formatSlackText(result.reply)` 적용 |
| `services/slack-gateway/package.json` | 수정 — `dependencies`에 `slackify-markdown ^5.0.0` 추가 |
| `pnpm-lock.yaml` | pnpm install 산출 (오케스트레이터 승인 하에) |
| `docs/DECISIONS.md` | 기록 — "slack-gateway dep 0 정책의 첫 예외" 결정 |
| `docs/TASKS.md`, `docs/HANDOFF.md` | 관례상 갱신 |

**무변경 확인 대상**: `slack-api.ts`(시그니처 유지), `cto-planning-bridge.ts`(변환 미적용), `executor.ts`, `router.ts`, `socket-mode.ts`.

## 5. 검증 명령 (구현 phase verifier용)

```bash
cd services/slack-gateway
pnpm typecheck && pnpm test && pnpm build                      # AC-8
grep -rl "slackify-markdown" src/                              # AC-7: src/formatting.ts 1줄만
grep -c "formatSlackText(" src/index.ts                        # AC-5②/AC-6: 1 (import 줄 제외 호출 1회)
grep "formatSlackText(result.reply)" src/index.ts              # AC-6: 매치 존재
grep -c "formatSlackText\|slackify-markdown" src/cto-planning-bridge.ts  # AC-5③: 0
grep -c "^import" src/formatting.ts                            # AC-9②: 1 (그 줄에 slackify-markdown 포함)
grep -i "slackify-markdown" ../../docs/DECISIONS.md            # AC-9①: 매치 존재
grep '"slackify-markdown"' package.json                        # AC-9④: dependencies에 존재
git diff --name-only | grep -c "slack-api.ts"                  # AC-9③: 0
```

## 6. 리스크 / 함정

1. **이중 변환**: cto-planning-bridge가 이미 mrkdwn 생성 → 해당 경로 미적용(FR-4) + AC-5 회귀 테스트.
2. **ESM-only × jest**: ts-jest CJS 변환에서 slackify-markdown 로드 실패 가능 → NFR-2의 mock 전략. 실 변환 결과는 `pnpm build` 후 `node -e` 스모크로 보강 가능.
3. **launchd 재기동**: 라이브 반영은 build 후 slack-gateway launchd 서비스 재시작 필요(구현 phase에서 문서화).
