# CODING CONVENTION — 코딩 규칙

> 이 문서와 루트 [CLAUDE.md](../CLAUDE.md)는 함께 유지한다. 원칙이 바뀌면 둘 다 갱신한다.

## 판단/실행 분리

- 도메인 로직(판단)은 `packages/l5-core`에 둔다. UI/플러그인은 배선(I/O)만 한다.
- `l5-core`는 **NocoBase 없이 단독 테스트 가능**해야 한다. 하드 룰.
- UI 컴포넌트에 Founder Fit, PMF Score, BPR, Memory, Tool Request 판단 로직을 하드코딩하지 않는다.

## 문서 규칙

- 문서 1개는 300줄을 넘지 않는다. 넘으면 인덱스+하위 문서로 쪼갠다 — [ARCHITECTURE.md](./ARCHITECTURE.md) 참고.
- 큰 리팩터/구조 변경 전에는 별도 결정 기록을 남긴다(과거엔 `docs/DECISIONS.md`를 썼다. 재정리 이후에는 이 저장소의 커밋 메시지 또는 PR 설명에 결정 배경을 남기고, 구조적으로 중요한 결정만 `TASK.md` 상단에 짧게 남긴다).
- 작업 완료 후 `TASK.md`를 갱신한다(완료 항목 제거, 새로 발견한 항목 추가).

## 의존성/패키지

- "알 수 없는 패키지 install 금지" — 외부 서비스 연동(Slack/Notion/Telegram)도 SDK 없이 Node 22 global fetch/WebSocket으로 무의존 구현한다.
- root에서 `yarn install`을 실행하지 않는다 — pnpm 워크스페이스 오염 위험(과거 실수 사례 있음). 항상 `pnpm install`.

## 검증(Verify) 문화

- "Agent가 됐다고 말한 것"과 "됐다"는 다르다 — 체크가 통과해야 됐다.
- 모든 변경은 다음을 확인한 뒤에만 완료로 본다: `tsc` 0 에러, jest 통과, (플러그인이면) `node --check`.
- 루트 QA 명령: `pnpm qa:static`(typecheck+lint+build), `pnpm qa:test`, `pnpm qa:e2e:nocobase`, `pnpm qa:e2e:founder`, `pnpm qa:arch`(dependency-cruiser), `pnpm qa:all`.

## 스키마 변경

- 컬럼 추가보다 기존 경로 재사용을 우선한다. 예: acceptance criteria는 스키마 변경 없이 `expected_output`에 `[완료조건]` 블록으로 기록하고 verifier가 파싱한다.
- 컬럼 승격(정식 필드화)은 실제 운영 데이터로 필요성이 입증된 뒤에만 한다.
- 스키마 컬럼을 추가하면 src와 dist(빌드 산출물)를 동시에 패치한다.

## 비파괴(non-breaking) 원칙

- 새 기능은 env flag로 A/B 게이트한다(예: `NATIVE_ORCHESTRATION`, `ACR_EXTERNAL_RUNNER`, `WORKFLOW_ORCHESTRATION`). 기존 경로는 유지한 채 신규 경로를 additive로 추가한다.
- 실행 격리는 task 단위가 아니라 phase 단위 worktree로 하고, 병렬 실행 후 merge는 직렬화한다(동시 merge 충돌 방지).

## 데이터 규칙

- 모든 외부 액션에는 `risk_level`(D1-D5)을 지정한다. D3 이상은 승인 게이트를 거친다 — [trd/agent-protocol.md](./trd/agent-protocol.md).
- 고객 관련 레코드는 `pii_level`/`consent_status`/`allowed_usage`/`source_ref`를 반드시 포함한다.
- LLM에 데이터를 보내기 전 PII를 마스킹한다. 트레이스/로그에 raw PII를 남기지 않는다.

## LLM 사용 정책

- 실행은 Claude CLI(headless, 구독 내 무료)를 쓴다. Anthropic API 직접 호출은 비용상 미채택.
- 분류/의도판단용 LLM은 Claude Sonnet으로 고정한다.
- LLM 스텝이 실패하면 **그 스텝만** 결정론적 폴백으로 처리한다. 전체 파이프라인을 폴백시키지 않는다.

## 정리(archive) 정책

- 안 쓰는 게 확실한 코드/문서는 삭제 대신 저장소 내 `archive/<영역>-<날짜>/` 또는 `docs/archive/<날짜>-<주제>/`로 이동한다. 실제 삭제는 사용자가 검토 후 직접 한다.
- 애매한 것(사용처가 불명확하거나 최근 활발히 수정 중인 코드)은 옮기지 않고 `TASK.md`의 "코드 정리 후보" 섹션에 후보로만 남긴다.

## 관련 문서

- 아키텍처/문서 구조: [ARCHITECTURE.md](./ARCHITECTURE.md)
- 기술 구조: [TRD.md](./TRD.md)
