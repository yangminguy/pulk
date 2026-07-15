// @l5/plugin-agent-staffing — server (hooks)
// Collections: agent, agent_assignment.
// 배치 판단 로직은 @l5/core 에 위임한다 (하드코딩 금지).

// TODO: import from @l5/core — 에이전트 배치 함수
// TODO: NocoBase Plugin 클래스 상속 및 collection 등록 구현

export default {
  name: 'agent-staffing',
  // async load() { /* TODO: collection 등록, 배치 액션 (Mastra 런타임 연동) */ },
};
