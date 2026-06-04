// @l5/plugin-tool-request — server (hooks)
// Collections: tool_request.
// 도구화 판단 로직은 @l5/core 에 위임한다 (하드코딩 금지).
// 원칙: 도구는 PMF 신호가 존재하기 전에 만들지 않는다.

// TODO: import from @l5/core — decideToolCandidate, estimateToolBuildingEffort
// TODO: NocoBase Plugin 클래스 상속 및 collection 등록 구현

export default {
  name: 'tool-request',
  // async load() { /* TODO: collection 등록, 도구 요청 평가 액션 */ },
};
