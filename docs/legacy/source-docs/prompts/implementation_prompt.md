# Implementation Prompt — L5 Business OS

아래 문서들을 순서대로 읽고, Phase 1부터 구현을 시작해줘.

## Reading Order

1. CLAUDE.md
2. docs/PRD.md
3. docs/ARCHITECTURE.md
4. docs/DATA_MODEL.md
5. docs/TASKS.md
6. docs/SECURITY_DATA_GOVERNANCE.md
7. docs/AGENT_PROTOCOL.md
8. docs/HERMES_SPEC.md
9. docs/WORKFLOW_FACTORY_SPEC.md

## Implementation Rules

- NocoBase는 MVP Shell이다.
- L5 Core는 독립 패키지로 만든다.
- 핵심 판단 로직은 plugin UI가 아니라 `packages/l5-core`에 둔다.
- Mastra, Trigger.dev, Langfuse, Formbricks, Activepieces는 바로 전부 붙이지 말고 Phase 순서대로 붙인다.
- 고객 PII와 재사용 가능한 Business Insight는 분리한다.
- PMF Experiment 없이 Tool Request를 먼저 만들지 않는다.
- 변경 후 TASKS/HANDOFF/DECISIONS 문서를 업데이트한다.

## First Task

Phase 1을 시작한다.

1. 프로젝트 구조를 확인한다.
2. NocoBase + PostgreSQL 로컬 실행 방식을 정한다.
3. `packages/l5-core` 빈 패키지를 만든다.
4. FounderDNA, BusinessIdea, PMFExperiment, MemoryEntry 타입을 먼저 만든다.
5. `scoreFounderFit`의 최소 버전을 테스트와 함께 구현한다.
