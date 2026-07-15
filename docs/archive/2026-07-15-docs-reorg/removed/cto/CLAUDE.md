# CTO — 영역 라우터

> CTO(기술 기획/실행 지휘) 영역의 개발 문서 인덱스. 새 세션은 이 파일부터 읽고 분기한다.
> 문서 1개는 250~300줄 이내. 넘으면 쪼개고 여기서 링크. (규칙 = `docs/cmo/CLAUDE.md`와 동일 패턴)

## CTO가 하는 일 (한 줄)

pulk CTO는 **source of truth**: requirement → task/spec/design/risk → complexity(C0~C5) → agent 배정 → **Work Order 생성**. 코드는 직접 안 쓰고 Work Order를 만들어 **ACR(executor)**에 넘긴다. 모든 외부 액션은 위험도(D0~D4) + 승인 게이트.

관련 코드: `services/agent-runtime/src/agents/cto.ts`, `packages/l5-core/src/functions/cto-*`.

## CTO ↔ ACR 역할 (혼동 금지)

- **CTO = 판단/기획자** (pulk). Work Order 생성.
- **ACR = 실행자** (Kernel). `받는다 → 격리(worktree) → 실행 → 검사 → result packet 반환`.
- ACR repo: `/Users/wonminyang/Desktop/양원민 개발자/agent_control_room_docs`(Next.js) + hermes-agent(Python).
- ACR 실행 결과는 pulk task 상태로 회수. ACR을 메인 대시보드로 쓰지 않는다.

## 문서 맵 (이 디렉토리)

| 문서 | 무엇 |
|---|---|
| `cto-tool-catalog.md` | CTO 도구 카탈로그 |
| `ACR_KERNEL_REFACTOR_PLAN.md` | ACR 커널 리팩터 계획 |
| `CTO_ACR_SPEED_IMPROVEMENT_PLAN.md` | 속도 개선 계획(P1~P5: ACR 병렬 runner 등) |
| `CTO_ACR_PRD_COMPLETION.html` | ACR PRD 완료 현황 |
| `CTO_ACR_HARNESS_ASSESSMENT.html` | ACR 하네스 평가 |

## 관련 규칙 (`.claude/rules/`)

- `10-pulk-cto.md` — CTO brain 동작·복잡도·위험도.
- `20-acr-runner.md` — ACR executor 계약.
- `30-worktree-policy.md` — run마다 격리 worktree, blocked file 차단.
- `40-verification-policy.md` — "Agent says done ≠ Done. Checks passed = Done."

## 핵심 메모리

- 속도 병목 진짜 원인 = ACR 직렬 단일 runner + cold spawn (pulk 아님). 계획 = `CTO_ACR_SPEED_IMPROVEMENT_PLAN.md`.
- ACR는 `next build`가 `tsc`보다 엄격 → 배포 전 풀 빌드 필수.
- `ACR_DETERMINISTIC_PHASES` 기본 on. integrate phase로 "built but not wired" 차단.

## 상태/계획 (현재 전역에 있음)

CTO 영역 HANDOFF/TASKS는 아직 전역 `docs/HANDOFF.md`·`docs/TASKS.md`에 섞여 있다. CTO 작업이 커지면 이 디렉토리에 `HANDOFF.md`·`TASKS.md`로 분리(CMO와 동일 패턴). 그 전까지는 전역 참조.
