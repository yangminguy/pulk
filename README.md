# L5 Business OS Development Docs

이 패키지는 `L5_Business_OS_PRD_v2_OpenSource_DataGovernance.md`를 기반으로 생성한 개발 문서 세트입니다.

## 문서 구성

```text
/project-root
  CLAUDE.md
  AGENTS.md
  docs/
    PRD.md
    ARCHITECTURE.md
    DATA_MODEL.md
    API.md
    TASKS.md
    HANDOFF.md
    DECISIONS.md
    AGENT_PROTOCOL.md
    HERMES_SPEC.md
    WORKFLOW_FACTORY_SPEC.md
    OPEN_SOURCE_INTEGRATION.md
    SECURITY_DATA_GOVERNANCE.md
    QA_CHECKLIST.md
  schemas/
    l5_entities.json
  prompts/
    implementation_prompt.md
```

## 권장 사용법

1. Claude Code 또는 Cursor 프로젝트 루트에 이 패키지를 복사한다.
2. `CLAUDE.md`를 먼저 읽게 한다.
3. 구현 전 `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/TASKS.md` 순서로 읽게 한다.
4. Phase 1부터 작은 단위로 구현한다.

## 핵심 구현 원칙

- NocoBase는 MVP Shell이다.
- L5 Core는 NocoBase와 독립되어야 한다.
- Mastra는 Agent Runtime이다.
- Trigger.dev는 Hermes Runtime이다.
- Langfuse는 LLM 관측 도구다.
- Formbricks는 PMF 신호 수집용이다.
- Activepieces는 외부 자동화 연결용이다.
- 고객 PII와 재사용 가능한 Business Insight는 반드시 분리한다.
