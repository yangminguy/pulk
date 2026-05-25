# @l5/agent-runtime

L5 Business OS의 Agent 런타임. [Mastra](https://mastra.ai) 기반으로 회사 운영 에이전트를 실행한다.

## 상태

현재는 **scaffold 단계**다. 모든 agent는 placeholder를 반환하며, 실제 로직은 각 파일의 `TODO` 위치에 Mastra 통합으로 채운다.

## 구조

```text
src/
  index.ts              # public exports
  agents/
    types.ts            # 공통 AgentInput / AgentOutput / RiskLevel
    ceo.ts              # 실행 주도, 고수준 의사결정
    chief-of-staff.ts   # 에이전트 간 조율, 워크플로우 시퀀싱
    cmo.ts              # GTM 가설, PMF 실험, 고객 메시징 제안
    cto.ts              # 기술 실행 제안, 툴링 결정
    risk-qa.ts          # 위험도 평가(D1-D5), 승인 게이트 강제
```

## 규칙

- 핵심 판단 로직은 `@l5/core`에 두고, 여기서는 에이전트 오케스트레이션만 한다.
- 모든 외부/고객 대상 액션은 위험도(D1-D5)와 승인 게이트를 거친다.
- Agent Control Tower는 선택적 CTO 도구이며 Business OS가 아니다.

## 다음 단계

1. Mastra 의존성 추가 및 agent 정의 구현.
2. `@l5/core` scoring/decision 로직 연결.
3. Hermes 런타임(`@l5/hermes-runtime`)에서 호출되는 진입점 정리.
