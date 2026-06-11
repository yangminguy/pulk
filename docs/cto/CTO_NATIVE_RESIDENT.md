# CTO Native Orchestrator — 상주 데몬 운영 가이드

## 개요

`native-orchestrator-daemon.mjs`는 `~/.l5/native/queue.json`을 폴링하며
`dispatchToNativeOrchestrator`를 호출하는 상주 프로세스다.
launchd KeepAlive로 등록하면 부팅 시 자동 기동·재기동된다.

---

## 큐 파일 형식

`~/.l5/native/queue.json` — JSON 배열. 각 항목은 ACRIntent + 상태 필드.

```json
[
  {
    "l5_task_id": "task-123",
    "project_path": "/Users/wonminyang/Desktop/pulk",
    "phases": [
      {
        "name": "implement-feature",
        "runtime": "claude",
        "prompt": "...",
        "expected_output": "...",
        "l5_approval_required": false
      }
    ],
    "l5_approved": true,
    "allowed_files": [],
    "status": "pending"
  }
]
```

**status 값:**

| 값 | 의미 |
|---|---|
| `pending` | 미실행 — 데몬이 다음 폴링 시 실행 |
| `running` | 현재 실행 중 |
| `done` | 정상 완료 |
| `failed` | 오류로 실패 |

새 작업을 큐에 추가하려면 `status: "pending"` 항목을 배열에 append한다.

---

## 회복 루프 동작

1. 데몬은 `pending` 항목을 순서대로 실행한다.
2. `dispatchToNativeOrchestrator` 내부에서 phase 실패 시 `decideRecovery`가 호출된다.
   - `action='handoff'` → 다른 에이전트로 즉시 인계 후 재실행.
   - `action='wait'` → `planNextPoll`이 가장 이른 `estimatedReadyAt`까지의 대기시간(최대 1시간)을 계산하고 데몬이 sleep 후 재시도.
3. 큐가 비어 있으면 30초(POLL_INTERVAL_MS)마다 파일을 다시 확인한다.

`planNextPoll` 규칙 요약:

- run/handoff 결정이 1개 이상 → `sleepMs=0`(즉시)
- 전부 wait → 가장 이른 `estimatedReadyAt` - nowIso(음수→0, 상한 1시간)
- `estimatedReadyAt` 없음 → `sleepMs=3600000`(1시간)

---

## 데몬 켜는 법

plist를 LaunchAgents에 복사한 뒤 bootstrap한다.

```bash
cp /Users/wonminyang/Desktop/pulk/launchd/com.l5.native-orchestrator.plist \
   ~/Library/LaunchAgents/

launchctl bootstrap gui/501 \
  ~/Library/LaunchAgents/com.l5.native-orchestrator.plist
```

부팅 후 자동 기동·재기동은 `RunAtLoad + KeepAlive`로 보장된다.

---

## 데몬 끄는 법

```bash
launchctl bootout gui/501 \
  ~/Library/LaunchAgents/com.l5.native-orchestrator.plist
```

완전 제거(재부팅 후 자동 기동 방지)하려면 plist 파일도 삭제한다.

```bash
rm ~/Library/LaunchAgents/com.l5.native-orchestrator.plist
```

---

## 로그 확인

```bash
tail -f ~/.l5/native/daemon.err.log   # stderr(운영 로그)
tail -f ~/.l5/native/daemon.out.log   # stdout
```

---

## 주의사항

- 큐 파일은 데몬과 외부 모두 읽고 쓸 수 있다. 동시 쓰기 경합이 우려되면 항목 append 전 `status` 확인 후 기록한다.
- `status='running'`인 항목이 재부팅 후 남아 있으면 데몬이 건너뛰므로, 수동으로 `"pending"`으로 되돌린 뒤 데몬을 기동한다.
- 실제 launchctl 등록은 이 파일의 지시대로 수동 실행해야 한다(자동 등록되지 않음).
