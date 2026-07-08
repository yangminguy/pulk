# @l5/slack-gateway

Slack에서 `@CEO` `@CMO` `@CTO` 임원을 호출해 **실제 작업을 시키고 결과·파일을 스레드로 받는** 인바운드 게이트웨이. 각 임원은 독립 Slack 앱(Socket Mode)이다.

## 흐름

```
Slack 멘션 ("@CMO 키 콘텐츠 기획서 html로 뽑아줘")  또는 봇 DM
  → 각 임원 앱의 Socket Mode WebSocket 수신
  → 허용된 사용자(사장님)인지 확인
  → 봇 멘션 제거 → 지시문 (router.ts)
  → 헤드리스 claude 서브에이전트 실행 (executor.ts) — 로컬에서 실제 작업
  → 같은 스레드에 결과 텍스트 + 산출물 파일 회신
```

임원은 3명: `@CEO` `@CMO` `@CTO`. 페르소나/가드레일은 `pulk/.claude/agents/<id>.md`를 그대로 따른다. (텔레그램 게이트웨이와 동일 엔진.)

## 왜 새 패키지가 없나

Node 22의 global `WebSocket`/`fetch`만 사용한다. Socket Mode(`apps.connections.open` → wss → ack)와 Web API(`chat.postMessage` 등)를 raw로 호출 — `telegram-gateway`와 같은 무의존 방식(규칙: 알 수 없는 패키지 install 금지).

## 사전 요구

- 사장님 맥에서 **상시 구동** (launchd). 레포·claude CLI·영상 팩토리가 그 맥에 있어야 함.
- `claude` CLI 설치 + 로그인.
- Slack 앱 3개(CEO/CMO/CTO). 이미 생성·설치됨 (App ID: CEO `A0BGRL48QHE`, CMO `A0BFZ8YNU1X`, CTO `A0BFG16CGKZ`).

## 토큰 매핑 (env)

각 앱에서 토큰 2개를 복사해 아래 env에 넣는다. **레포/코드에 하드코딩 금지** — `install.sh`가 홈 디렉토리의 private LaunchAgents plist에만 주입한다.

| env 변수 | 값 | 어디서 |
|---|---|---|
| `SLACK_CEO_BOT_TOKEN` | `xoxb-...` | CEO 앱 → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_CEO_APP_TOKEN` | `xapp-...` | CEO 앱 → Basic Information → App-Level Tokens → `socket-mode` |
| `SLACK_CMO_BOT_TOKEN` | `xoxb-...` | CMO 앱 → OAuth & Permissions |
| `SLACK_CMO_APP_TOKEN` | `xapp-...` | CMO 앱 → App-Level Tokens |
| `SLACK_CTO_BOT_TOKEN` | `xoxb-...` | CTO 앱 → OAuth & Permissions |
| `SLACK_CTO_APP_TOKEN` | `xapp-...` | CTO 앱 → App-Level Tokens |
| `SLACK_ALLOWED_USER_IDS` | `U0AQT2N24K0` | 명령 허용 사용자(사장님). 콤마로 여러 명 |

선택: `PULK_DIR`, `SLACK_AGENT_MODEL`(sonnet 기본), `SLACK_CLAUDE_ARGS`(기본 `--permission-mode acceptEdits`; 완전 자율은 `--dangerously-skip-permissions`), `SLACK_RUN_TIMEOUT_MS`(기본 15분), `SLACK_POST_FILES`(기본 true), `CLAUDE_BIN`.

## 채널 & 봇 초대

이미 생성된 채널: `#boardroom` `#exec-ceo` `#exec-cmo` `#exec-cto` `#approvals` `#acr-runs`.

봇이 채널에서 멘션에 응답하려면 그 채널의 멤버여야 한다. 각 채널에서 한 번만:

```
/invite @CEO @CMO @CTO
```

(DM으로 임원을 부르는 것도 지원 — 봇과의 1:1 DM에 바로 지시.)

## 설치 (macOS launchd)

```bash
pnpm --filter @l5/slack-gateway build

SLACK_CEO_BOT_TOKEN=xoxb-... SLACK_CEO_APP_TOKEN=xapp-... \
SLACK_CMO_BOT_TOKEN=xoxb-... SLACK_CMO_APP_TOKEN=xapp-... \
SLACK_CTO_BOT_TOKEN=xoxb-... SLACK_CTO_APP_TOKEN=xapp-... \
SLACK_ALLOWED_USER_IDS=U0AQT2N24K0 \
  bash services/slack-gateway/scripts/install.sh
```

로그: `~/.l5/logs/slack-gateway.log`. 임원을 한 명씩 켜려면 해당 페어만 넣으면 된다(나머지는 skip).

## 검증

```bash
pnpm --filter @l5/slack-gateway typecheck
pnpm --filter @l5/slack-gateway test
```

라이브 확인: 게이트웨이 기동 후 로그에 `authenticated as bot user …`가 3줄(임원별) 뜨는지 확인, 그리고 `#exec-ceo`에서 `@CEO 상태 보고해줘`.
