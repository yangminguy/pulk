# CLI Command Reference — Claude Code / Codex / Gemini / Antigravity(agy)

L5의 CTO/ACR가 코딩 CLI를 오케스트레이션할 때 참조하는 커맨드 지식.
출처: 창업자 리서치(2026-06-04) + 헤드리스 실측 검증.

> **가장 중요한 사실**: 아래 슬래시 커맨드(`/compact`·`/goal`·`/clear`...)는 전부
> **인터랙티브(REPL) 전용**이다. ACR은 CLI를 **헤드리스**(`claude -p` / `codex exec`
> / `agy -p`)로 코드가 자동 실행하므로 슬래시 커맨드를 타이핑할 수 없다. ACR이
> 실제로 쓸 수 있는 건 **플래그**와 **config**뿐이다. 둘을 혼동하지 말 것.

## 1. ACR(헤드리스)에서 실제로 쓸 수 있는 것 — 플래그/Config

| 목적 | claude | codex | agy |
| --- | --- | --- | --- |
| 헤드리스 실행 | `claude -p "<p>"` | `codex exec "<p>"` | `agy -p "<p>"` (`-p` 마지막) |
| 세션 ID 지정(첫 호출) | `--session-id <uuid>` ✅ | (자동 thread_id) | 호출자 지정 미지원(이슈 #7) |
| 세션 재개(워밍) | `--resume <uuid>` ✅ | `codex exec resume <id>` / `--last` | `--continue` / `--conversation <uuid>`(불안정) |
| 모델 선택 | `--model <m>` | `-m/--model <m>` | `-m/--model <m>` |
| 구조화 출력+토큰 | `--output-format stream-json --verbose`(result 이벤트 usage) | `--json`(`turn.completed` usage) | `--output-format json`(버전 의존, 불안정) |
| 자동 압축 | 없음(헤드리스) | config `model_auto_compact_token_limit` | 없음 |
| 무승인 실행 | (위험명령은 ACR 게이트) | `--ask-for-approval never` | `--sandbox` |
| 세션 저장 위치 | `~/.claude/projects/<cwd>/<id>.jsonl` | `~/.codex/sessions/...jsonl` | `~/.gemini/antigravity-cli/brain/<id>/` |

**L5 적용 현황**:
- 토큰 캡처 = claude `--output-format stream-json --verbose` (ACR_CAPTURE_TOKENS=1).
- 워밍 세션 = claude `--session-id`→`--resume` (ACR_WARM_SESSIONS=1, plan 단위).
- 모델 배정 = tier 라우팅(T1=claude/T2=codex/T3=agy)이 `/model`의 헤드리스 등가물.
- codex `--last`는 병렬 충돌 위험, agy 헤드리스 세션은 ID 미방출로 불안정 → claude 우선.

## 2. 인터랙티브 슬래시 커맨드 (사람이 터미널에서; ACR 직접 사용 불가)

### 압축 / 초기화 / 목표
| 기능 | claude | codex | gemini | agy |
| --- | --- | --- | --- | --- |
| 컨텍스트 압축 | `/compact` | `/compact` | `/compress` | (`?`/`/usage`로 확인) |
| 새 대화/초기화 | `/clear` | `/clear`,`/new` | `/clear` | `/clear` |
| 목표 지속 실행 | `/goal` | `/goal [pause/resume/clear]` | (없음) | `/goal` |
| 계획 모드 | `/plan` | `/plan` | (약함) | `/grill-me`/프롬프트 |
| 모델 변경 | `/model` | `/model` | (설정) | `/model` |
| 대화 재개 | `/resume` | `/resume` | `/chat resume <tag>` | `/resume`,`/switch` |
| 되돌리기 | `/rewind`,`/undo` | `/fork` | `/restore` | `/rewind`,`/undo` |
| 상태/토큰 | `/status`,`/usage`,`/context` | `/status` | `/stats` | `/usage`,`/statusline` |
| 에이전트/작업 | `/agents`,`/tasks`,`/fork`,`/batch` | `/agent`,`/fork`,`/ps` | (단일) | `/agents`,`/tasks` |
| MCP | `/mcp` | `/mcp` | `/mcp` | `/mcp` |
| 스킬 | `/skills` | `/skills` | extensions | `/skills` |
| 메모리/지침 | `/memory`,`/init`(CLAUDE.md) | `/memories`,`/init`(AGENTS.md) | `/memory`,`GEMINI.md` | `GEMINI.md`,`AGENTS.md` |
| 디렉토리/파일 | `--add-dir`,`@` | `/mention` | `@<path>`,`/directory add` | `@<path>`,`/add-dir`,`/open` |
| 셸 | `!` | (승인) | `!<cmd>` | `!<cmd>` |

### codex 추가: `/new`,`/fast`,`/approve`,`/side`,`/btw`,`/stop`,`/diff`,`/review`,`/hooks`,`/plugins`,`/apps`,`/raw`
### gemini 추가: `/chat save|list|delete|share`,`/compress`,`/memory add|show|refresh|list`,`/restore`,`/tools`,`/vim`
### agy 추가: `?`,`/config`,`/settings`,`/rename`,`/keybindings`,`/btw`,`/logout`,`/permissions`

## 3. 메모

- **agy ≈ Gemini CLI 후속**(Go 재작성, 2026-06-18 Gemini CLI 종료). Agent Skills/Hooks/Subagents/Extensions 유지하나 1:1 parity 아님. 세션 ID 헤드리스 방출은 미해결(이슈 #7) → ACR 워밍은 claude 우선.
- agy 압축은 `/compact`/`/compress` 확실치 않음 → 인터랙티브면 `?`/`/usage`로 실제 표시 확인, 헤드리스면 수동 요약 프롬프트 후 새 세션.
- 토큰 경제성: resume는 prompt 캐싱(캐시 토큰 저가) 활용하나, 세션이 매우 길어지면 fresh+tight 프롬프트가 더 쌀 수 있음 → 짧은 작업(2~6 phase)은 resume 이득, 100+ turn은 재검토.
