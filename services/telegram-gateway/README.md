# @l5/telegram-gateway

텔레그램에서 `@cto`, `@cmo` 처럼 임원을 호출해 **실제 작업을 시키고 결과·파일을 받는** 인바운드 게이트웨이.

## 흐름

```
텔레그램 메시지 ("@cmo 키 콘텐츠 기획서 html로 뽑아줘")
  → getUpdates 롱폴링
  → 허용된 채팅(사장님)인지 확인
  → @임원 파싱 (router.ts)
  → 헤드리스 claude 서브에이전트 실행 (executor.ts) — 로컬에서 실제 작업
  → 결과 텍스트 + 산출물 파일을 텔레그램으로 회신
```

호출 가능한 임원 9명: `@ceo @cmo @cto @cpo @cro @coo @cfo @chief-of-staff @risk-qa`
(한국어 별칭도 일부 지원: `@기술`=cto, `@마케팅`=cmo, `@재무`=cfo, `@비서실장`, `@리스크` 등)

각 임원의 페르소나/가드레일은 `pulk/.claude/agents/<id>.md` 를 그대로 따른다.

## 왜 claude CLI로 실행하나

`@l5/agent-runtime` 의 `runXAgent()` 는 *판단 JSON* 만 돌려준다. 실제 파일 생성·영상 렌더·ACR 디스패치 같은 "진짜 작업"은 `.claude/agents` 페르소나를 헤드리스 `claude -p` 로 구동해야 가능하다. 그래서 게이트웨이는 claude CLI를 실행기로 쓴다.

## 사전 요구

- 사장님 맥에서 **상시 구동** (launchd). 레포·claude CLI·영상 팩토리가 그 맥에 있어야 함.
- `claude` CLI 설치 + 로그인.
- 텔레그램 봇 토큰(@BotFather)과 사장님 chat id.

## 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | @BotFather 봇 토큰 |
| `TELEGRAM_CHAT_ID` | ✅ | 명령 허용 채팅 id (콤마로 여러 개 = `TELEGRAM_ALLOWED_CHAT_IDS`) |
| `PULK_DIR` | | pulk 레포 경로 (기본: 빌드 위치 기준 자동 추정) |
| `TELEGRAM_AGENT_MODEL` | | sonnet(기본)/opus/haiku |
| `TELEGRAM_CLAUDE_ARGS` | | claude 추가 인자 (기본 `--permission-mode acceptEdits`). 완전 자율(bash/렌더)은 `--dangerously-skip-permissions` |
| `TELEGRAM_RUN_TIMEOUT_MS` | | 작업당 최대 시간 (기본 15분) |
| `CLAUDE_BIN` | | claude 바이너리 경로 override |

## 설치 (macOS launchd)

기존 Hermes 알림 봇 토큰을 그대로 재사용한다. install.sh가 이미 설치된
`com.l5.hermes.*` LaunchAgent에서 `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`를
자동으로 꺼내므로, 보통은 토큰을 칠 필요 없이 이 두 줄이면 끝:

```bash
pnpm --filter @l5/telegram-gateway build
bash services/telegram-gateway/scripts/install.sh
```

자동 탐색이 안 되면(예: Hermes 미설치) 직접 지정:

```bash
TELEGRAM_BOT_TOKEN=xxxx TELEGRAM_CHAT_ID=12345 \
  bash services/telegram-gateway/scripts/install.sh
```

로그: `~/.l5/logs/telegram-gateway.log`
중지: `launchctl unload ~/Library/LaunchAgents/com.l5.telegram-gateway.plist`

## 로컬 테스트 (launchd 없이)

```bash
pnpm --filter @l5/telegram-gateway build
TELEGRAM_BOT_TOKEN=xxxx TELEGRAM_CHAT_ID=12345 \
  node services/telegram-gateway/dist/index.js
```
그 다음 텔레그램에서 봇에게 `@cto 지금 진행 중인 개발 정리해줘` 를 보내면 된다.

## 보안

- `TELEGRAM_CHAT_ID` 허용목록에 없는 채팅의 메시지는 전부 무시(타인이 회사에 명령 불가).
- 외부 발행/전송/결제 등 위험 액션은 각 서브에이전트의 승인 게이트를 따른다.
- 산출물은 `<repo>/.telegram-runs/<runId>/` 에 모았다가 전송 (gitignore 처리됨).

## 테스트

```bash
pnpm --filter @l5/telegram-gateway test     # router 파싱 단위테스트
pnpm --filter @l5/telegram-gateway typecheck
```
