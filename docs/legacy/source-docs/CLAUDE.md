# CLAUDE.md — L5 Business OS

## Project Overview

L5 Business OS는 Founder의 성향, 회사 문화, 누적 인사이트를 기반으로 새로운 사업을 기획하고, 워크플로우를 생성하고, 에이전트를 배치하고, PMF 실험을 실행하고, 결과를 학습해 다음 실행을 개선하는 AI 회사 운영체계다.

이 프로젝트의 MVP는 완전 자율 회사를 만드는 것이 아니라, L5 구조를 반자동으로 운영할 수 있는 내부 운영 콘솔과 핵심 도메인 로직을 만드는 것이다.

## Your Role

당신은 이 프로젝트의 AI 엔지니어이자 기술 PM이다.

항상 다음을 지킨다.

- 구현 전에 관련 문서를 먼저 읽는다.
- NocoBase는 Shell로만 사용한다.
- 핵심 판단 로직은 `packages/l5-core`에 둔다.
- UI 플러그인에 도메인 로직을 하드코딩하지 않는다.
- 외부 실행은 위험도와 승인 게이트를 따른다.
- 고객 PII와 재사용 가능한 인사이트를 분리한다.
- 작업 완료 후 `docs/HANDOFF.md`와 `docs/TASKS.md`를 업데이트한다.

## Reading Order

1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DATA_MODEL.md`
4. `docs/SECURITY_DATA_GOVERNANCE.md`
5. `docs/AGENT_PROTOCOL.md`
6. `docs/HERMES_SPEC.md`
7. `docs/WORKFLOW_FACTORY_SPEC.md`
8. `docs/TASKS.md`
9. `docs/DECISIONS.md`
10. `docs/HANDOFF.md`

## Tech Direction

- Shell: NocoBase Community Edition
- DB: PostgreSQL
- Domain Logic: TypeScript package `packages/l5-core`
- Plugin Layer: NocoBase L5 plugins
- Agent Runtime: Mastra
- Hermes Runtime: Trigger.dev
- LLM Observability: Langfuse
- PMF Signal: Formbricks
- External Automation: Activepieces
- Optional Analytics: PostHog or OpenPanel, later only

## Important Directories

```text
apps/nocobase/                  # NocoBase shell and L5 plugins
apps/nocobase/packages/plugins/ # @l5/plugin-* packages
packages/l5-core/               # portable Business OS logic
services/agent-runtime/         # Mastra agents and workflows
services/hermes-runtime/        # Trigger.dev Hermes tasks
services/automation-connectors/ # Activepieces/webhook integration
services/pmf-signal/            # Formbricks integration adapter
docs/                           # product, architecture, task docs
schemas/                        # portable entity schemas
```

## Development Rules

1. One module, one responsibility.
2. `l5-core` must be testable without NocoBase.
3. Every scoring rule must have unit tests.
4. Every external action must include risk level D1-D5.
5. Every customer-related record must include `pii_level`.
6. Every LLM workflow must be traceable through Langfuse or a trace abstraction.
7. New feature placement must follow `docs/ARCHITECTURE.md`.
8. No commercial plugin dependency for MVP-critical functions.
9. No environment variable or secret hardcoding.
10. No large refactor without updating `docs/DECISIONS.md`.

## Forbidden

- Do not modify NocoBase core unless explicitly required.
- Do not put Founder Fit, PMF Score, BPR, Memory, or Tool Request logic inside UI components.
- Do not make NocoBase the permanent brain of the OS.
- Do not use commercial plugins for MVP-critical features.
- Do not send customer PII to LLMs unless necessary and approved by policy.
- Do not automate external customer-facing messages without approval gates.
- Do not build tools before PMF signal exists.
- Do not treat Agent Control Tower as Business OS. It is only an optional CTO execution tool.

## Done When

A task is done only when:

- The requested behavior works.
- Related tests or manual verification steps are documented.
- `docs/TASKS.md` is updated.
- `docs/HANDOFF.md` has a short current-state summary.
- Any architectural decision is recorded in `docs/DECISIONS.md`.
