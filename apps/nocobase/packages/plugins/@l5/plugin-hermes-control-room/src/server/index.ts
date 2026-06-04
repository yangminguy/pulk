// @l5/plugin-hermes-control-room — server (hooks)
// Collections: hermes_alert, decision_queue.
// 승인 게이트/위험도 판단은 @l5/core 에 위임한다 (하드코딩 금지).

// TODO: import from @l5/core — requiresFounderApproval, getApprovalDeadline, isApprovalExpired
// TODO: NocoBase Plugin 클래스 상속 및 collection 등록 구현 (Trigger.dev Hermes 연동)

export default {
  name: 'hermes-control-room',
  // async load() { /* TODO: collection 등록, 승인/거부 액션, 만료 처리 */ },
};
