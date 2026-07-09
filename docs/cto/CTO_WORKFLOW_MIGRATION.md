# CTO Workflow 마이그레이션 (R6)

ACR(별도 Next.js 앱) → Native Orchestrator → **Workflow Orchestrator**로 이어지는 3세대 실행
경로의 동등성 검증·롤백·은퇴 절차. 세 경로 모두 같은 `ACRIntent`(CTO phase DAG)를 입력으로 받는다.

| 경로 | flag | 오케스트레이션 주체 | 진입점 |
|---|---|---|---|
| ACR | (기본) | 외부 ACR 앱 | `dispatchToACR` |
| Native | `NATIVE_ORCHESTRATION=on` | pulk 로컬(레벨별 병렬 spawn) | `dispatchToNativeOrchestrator` |
| Workflow | `WORKFLOW_ORCHESTRATION=on` | Claude Code Workflow 런타임 | `dispatchToWorkflowOrchestrator` |

flag 우선순위(cto.ts): `WORKFLOW_ORCHESTRATION` > `NATIVE_ORCHESTRATION` > ACR(기본). 셋 다 off면
기존 ACR 동작 100% 불변.

## A/B(/C) 동등성 절차

같은 소형 태스크(C0~C1, 코드 phase 1~2개)를 세 경로로 각각 실행해 산출 diff와 verify 결과를
비교한다. 동일 입력 intent를 쓰기 위해 CTO 계획 단계를 한 번만 돌리고 intent를 고정한다.

```bash
# 0) 공통: 대조용 태스크를 하나 정하고 repo를 clean 상태로 스냅샷.
cd <TARGET_REPO> && git stash -u && git rev-parse HEAD   # BASE 커밋 기록

# 1) ACR 경로 (기본)
cd /Users/wonminyang/Desktop/pulk/services/agent-runtime
env -u WORKFLOW_ORCHESTRATION -u NATIVE_ORCHESTRATION <CTO 트리거 커맨드>
cd <TARGET_REPO> && git diff BASE --stat > /tmp/eq-acr.diff && git reset --hard BASE

# 2) Native 경로
NATIVE_ORCHESTRATION=on <CTO 트리거 커맨드>
cd <TARGET_REPO> && git diff BASE --stat > /tmp/eq-native.diff && git reset --hard BASE

# 3) Workflow 경로
WORKFLOW_ORCHESTRATION=on <CTO 트리거 커맨드>
cd <TARGET_REPO> && git diff BASE --stat > /tmp/eq-workflow.diff && git reset --hard BASE

# 4) 비교: 변경 파일 집합과 verify 결과가 동등한지.
diff /tmp/eq-acr.diff /tmp/eq-native.diff
diff /tmp/eq-acr.diff /tmp/eq-workflow.diff
```

동등성 PASS 판정 기준:

- 변경 **파일 집합**이 동일(줄 수 미세 차이는 허용 — 세 경로 verify가 모두 PASS면 인정).
- 각 code-producing phase의 `verify_command`(tsc/jest)가 세 경로 모두 exit 0.
- Workflow 경로: 기록된 스크립트가 `node --check` 통과(생성기 단위테스트가 왕복 보장).

생성 스크립트 확인:

```bash
ls -t ~/.l5/workflows/*.workflow.mjs | head -1        # 최근 생성물
node --check "$(ls -t ~/.l5/workflows/*.workflow.mjs | head -1)"
```

## 롤백 절차

Workflow 경로에 문제가 생기면 **flag 제거만으로 즉시 구 경로 복귀**(코드 변경·재배포 불필요):

```bash
# 즉시 Native로
unset WORKFLOW_ORCHESTRATION            # → NATIVE_ORCHESTRATION 값에 따라 Native/ACR
# 완전 구 경로(ACR)로
unset WORKFLOW_ORCHESTRATION NATIVE_ORCHESTRATION
```

launchd로 상시 구동 중이면 해당 plist의 `EnvironmentVariables`에서 flag를 지우고
`launchctl bootout` → `bootstrap`으로 재기동한다. `dispatchToWorkflowOrchestrator`는 never-throw라
실패해도 CTO 출력은 막지 않으므로, flag를 못 내린 상태에서도 계획 산출 자체는 보존된다.

## ACR 은퇴 조건 체크리스트

아래를 **모두** 만족할 때만 ACR 경로/인프라를 은퇴한다.

- [ ] 동등성 검증 3건 이상 PASS(서로 다른 태스크 유형: 구현 / 문서 / 다중 phase 병렬).
- [ ] Workflow 경로 verify_command가 3건 모두 exit 0(실제 tsc/jest 통과).
- [ ] 병렬 레벨(depends_on 공유) 태스크에서 파일 집합 동등 확인.
- [ ] 롤백(flag 제거 → 구 경로 복귀)을 실제로 1회 리허설.
- [ ] 사장님(Founder) 명시 승인 — 은퇴는 되돌리기 큰 결정이므로 D3 이상으로 취급.

## 은퇴 시 bootout할 launchd 목록

은퇴 승인 후 아래 서비스를 `launchctl bootout gui/$(id -u)/<label>` 후 plist 제거한다.
(ACR 실행/디스패치 관련만. CDP·hermes 등 공용 인프라는 유지.)

- `com.l5.acr-runner` — ACR 실행 커널(headless runner).
- `com.l5.acr-dispatcher` — hermes task-dispatcher → ACR 디스패치 브릿지(있을 경우).

주의: `com.l5.cdp-chrome`(발굴 크롤러)와 hermes 코어는 ACR과 무관하므로 **은퇴 대상이 아니다**.
은퇴 전 `launchctl list | grep com.l5` 로 실제 라벨을 확인하고 목록을 갱신할 것.
