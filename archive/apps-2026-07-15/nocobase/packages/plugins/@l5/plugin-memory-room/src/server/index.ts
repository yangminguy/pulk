// @l5/plugin-memory-room — server (hooks)
// Collections: memory_entry.
// 인사이트 분류/검색 로직은 @l5/core 에 위임한다 (하드코딩 금지).
// 원칙: 고객 PII와 재사용 가능한 인사이트를 분리한다 (pii_level 필수).

// TODO: import from @l5/core — 인사이트 분류 / 검색 함수
// TODO: NocoBase Plugin 클래스 상속 및 collection 등록 구현

export default {
  name: 'memory-room',
  // async load() { /* TODO: collection 등록 (pii_level 강제), 인사이트 저장/검색 액션 */ },
};
