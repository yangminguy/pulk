# Research — Slack 메시지 포맷팅 함수: 오픈소스 라이브러리 비교

- **작성일**: 2026-07-09
- **task**: Slack 메시지 포맷팅 함수 (오픈소스 조사 phase)
- **배경**: `services/slack-gateway`는 SDK 없이 raw fetch로 `chat.postMessage`를 호출하며,
  executive(headless claude) 응답을 **plain text**로 그대로 전송한다.
  LLM 응답은 표준 Markdown(`**bold**`, `# heading`, `[link](url)`)인데 Slack은
  자체 **mrkdwn**(`*bold*`, `<url|link>`, heading 미지원)을 쓰므로 렌더링이 깨진다.
  → 포맷팅 함수(Markdown → Slack 표현) 도입 전, 라이브러리 후보를 조사한다.

## 전제 조건 (프로젝트 제약)

- `services/slack-gateway`는 `"type": "module"`(ESM), 현재 **runtime dependency 0개**
  (raw fetch 정책 — `slack-api.ts` 주석에 명시된 의도적 설계).
- 라이선스: MIT 이상 허용 필요 (레포는 AGPL-3.0-or-later).
- 두 가지 접근이 존재:
  - **(A) mrkdwn 텍스트 변환**: `text` 필드 유지, 문자열만 변환. 현재 코드 무수정에 가까움.
  - **(B) Block Kit 전환**: `blocks` 페이로드로 전환. 표현력↑, `slack-api.ts` 시그니처 변경 필요.

## 후보 비교표

수치는 2026-07-09 npm registry API 실측.

| 항목 | **slackify-markdown** | **md-to-slack** | **@tryfabric/mack** | (참고) slack-block-builder |
|---|---|---|---|---|
| 접근 | (A) md → mrkdwn 문자열 | (A) md → mrkdwn 문자열 | (B) md → Block Kit blocks | (B) Block Kit 빌더 (변환기 아님) |
| 최신 버전 / 발행일 | 5.0.0 / 2025-11 | 1.1.7 / 2025-12 | 1.2.1 / **2022-06 (4년 방치)** | 2.8.0 / 2023-12 |
| 주간 다운로드 | **356k** | 8.3k | 17k | 223k |
| 의존성 | unified/remark 계열 7개 | marked 1개 | marked, fast-xml-parser, @slack/types | **0개** |
| ESM 호환 | v5는 ESM-only → 우리 게이트웨이(ESM)와 일치 | ESM/CJS | CJS 시절 패키지 | ESM/CJS |
| 라이선스 | MIT | MIT | MIT | MIT |
| 강점 | 사실상 표준, GFM 지원, remark AST 기반이라 엣지케이스(중첩 리스트·이스케이프) 견고 | 초경량(marked 1개), 활발히 갱신 | md→blocks 직행, 표/체크박스까지 매핑 | TS 경험 우수, 선언적 빌더 |
| 약점 | 의존성 트리가 상대적으로 큼(remark 생태계) | 커뮤니티 작음, 엣지케이스 검증 사례 적음 | **비유지보수**, async API, blocks 전환 강제 | 변환기가 아님 — 단독으로는 과제 해결 불가 |

## 판정

### 채택: `slackify-markdown` (접근 A)

근거:
1. **최소 변경**: `postMessage`의 `text` 필드를 그대로 쓰므로 `slack-api.ts`·스레딩·파일업로드 경로 무수정. 발신 직전 1개 함수 삽입으로 끝난다 (`formatSlackText(reply)`).
2. **성숙도**: 주간 356k 다운로드로 이 용도의 사실상 표준. remark AST 기반이라 정규식 변환기 대비 중첩/이스케이프 엣지케이스에 강함 — LLM 출력처럼 형태가 불규칙한 입력에 중요.
3. **호환**: v5 ESM-only ↔ 게이트웨이 `"type": "module"` 일치. MIT.
4. 유지보수 활발(2025-11 v5 릴리스).

조건: "runtime dep 0" 정책의 첫 예외가 된다. remark 트리가 부담스러우면 차선인 `md-to-slack`(marked 1개)으로 교체 가능하도록, **호출부는 자체 래퍼 함수(`formatting.ts`) 뒤에 감춘다**(라이브러리 직접 노출 금지).

### 배제 이유

- **md-to-slack**: 경량이지만 커뮤니티가 작고(8.3k/주) 엣지케이스 실전 검증이 부족. slackify-markdown이 막히지 않는 한 채택할 이유 없음. **차선(fallback) 후보**로 유지.
- **@tryfabric/mack**: 4년간 릴리스 없음(1.2.1, 2022-06). Block Kit 전환을 강제해 `slack-api.ts` 시그니처 변경 + `blocks` 3,000자/50블록 제한 처리 등 변경 반경이 큼. 비유지보수 + 고비용 → 배제.
- **slack-block-builder**: Markdown 변환기가 아니라 Block Kit 빌더라 이 task 단독 해결 불가. 추후 승인 버튼(interactive block) 등 Block Kit이 필요해지는 시점에 재검토.

## 다음 phase 단서

- 구현 위치: `services/slack-gateway/src/formatting.ts` (순수 함수, unit-testable).
- 적용 지점: `index.ts`의 `postMessage` 호출 직전 (executor 응답 + cto-planning-bridge 응답 공통).
- 주의: `cto-planning-bridge.ts`는 이미 손으로 mrkdwn(`*bold*`)을 쓰고 있음 — 이중 변환(`*` → `**` 오인) 여부를 테스트로 고정할 것.
- Slack `text` 한도 40,000자 — 변환 후 truncation 정책 필요.
