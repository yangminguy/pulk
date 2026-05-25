// @l5/plugin-pmf-experiment — server (hooks)
// Collections: pmf_experiment, pmf_experiment_metric.
// PMF 점수 계산은 @l5/core 에 위임한다 (하드코딩 금지).

// TODO: import from @l5/core — calculatePmfScore, isToolCandidate
// TODO: NocoBase Plugin 클래스 상속 및 collection 등록 구현

export default {
  name: 'pmf-experiment',
  // async load() { /* TODO: collection 등록, 지표 입력 시 pmf_score 재계산 */ },
};
