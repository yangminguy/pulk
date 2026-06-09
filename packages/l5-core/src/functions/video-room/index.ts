// CMO Video Room — public surface for the strategy→production→publish workflow.
export * from './types';
export * from './state-machine';
export * from './business-pt-context';
export * from './key-content';
export * from './viewtrap-research';
export * from './reference-analysis';
export * from './pulling-content';
export * from './second-brain-merge';
export * from './approval-gates';
export * from './production';
export * from './review-publish';
export * from './script-factory';
export * from './second-brain-query';
// v3.1 CMO/Script Room — Research Room (Phase 2)
export * from './market-research';
export * from './voc-research';
export * from './claim-verification';
export * from './audience-fit';
export * from './script-material-pack';
export * from './research-gate';
// v3.1 CMO/Script Room — Strategy + Content Set (Phase 3)
export * from './strategy-brief';
export * from './content-set-validation';
export * from './thumbnail-plan';
// v3.1 CMO/Script Room — Script Room (Phase 4)
export * from './intro-writer';
export * from './logic-block-writers';
export * from './script-integrator';
export * from './founder-voice';
export * from './script-qa';
export * from './revision-router';
// v3.1 CMO/Script Room — VideoExecutionBrief contract + handoff (Phase 5)
export * from './brief-validators';
export * from './video-execution-brief';
export * from './script-room-pipeline';
export * from './factory-handoff';
// v3 CMO Key Content Planning (Phase 1)
export * from './key-content-planning.schemas';
export * from './key-content-planning';
export * from './key-content-draft';
// key-content-candidates: 재기획된 "서로 다른 주제 후보 N개" 생성기.
// types.ts에 PRD §7.2 KeyContentCandidate(다른 shape)가 이미 barrel-public이라
// 충돌을 피하려 신규 후보 타입은 KeyContentCandidateV3로 별칭 재export한다(값/함수는 그대로).
export {
  generateKeyContentCandidates,
  finalizeKeyContentChoice,
  KeyContentCandidateSchema,
} from './key-content-candidates';
export type {
  KeyContentCandidate as KeyContentCandidateV3,
  GenerateCandidatesDeps,
  FinalizeKeyContentChoiceResult,
} from './key-content-candidates';
// pulling-candidates: 선택된 키 콘텐츠로 끌어오는 풀링 주제 후보 N개 생성(키 콘텐츠와 동일 패턴).
export {
  generatePullingCandidates,
  finalizePullingPlan,
  PullingCandidateSchema,
} from './pulling-candidates';
export type {
  PullingCandidate,
  GeneratePullingDeps,
  PullingCandidateInput,
  FinalizePullingPlanResult,
} from './pulling-candidates';
// v3 CMO Content Strategy (Stage 1 domain) — pulling content set + viewtrap tools + strategy package.
// Selective re-exports avoid name collisions with the established public surface:
//   - PullingContentPlan: the per-item type in ./types stays the barrel-public one;
//     the Stage1 12-step plan type is consumed via direct relative import only.
//   - buildHotVideoStructureTemplate / buildViewtrapValidation / filterSalesViableCandidates:
//     re-exported from their original home (pulling-content-planning / key-content-planning),
//     so viewtrap-tools only contributes its net-new exports.
export {
  KeyReadyAudience,
  PullingLogicalExpansionMap,
  PullingProblemAxisMap,
  KeyContentSalesLogicContext,
  loadKeyContentSalesLogic,
  buildKeyReadyAudience,
  buildLogicalExpansionMap,
  buildProblemAxisMap,
  buildContentTypePortfolio,
  PullingViewtrapValidation,
  buildPullingViewtrapValidation,
  buildHotVideoStructureTemplate,
  buildExposureProbabilityCandidate,
  sortByExposureProbability,
  buildLongtailEvergreenCandidate,
  enforceLongtailMustUse,
  scorePullingTopic,
  KeyConnectionSentenceInput,
  buildKeyConnectionSentence,
  assessConsumerJourneyCoverage,
  buildApprovedPullingTopic,
  assembleApprovedPullingContentSet,
  assemblePullingContentPlan,
} from './pulling-content-planning';
export type { PullingContentPlan as PullingContentPlanV3 } from './pulling-content-planning';
export {
  validateKeyContentWithViewtrap,
  assessExposureProbability,
  LongtailCandidateInput,
  findLongtailEvergreen,
} from './viewtrap-tools';
export * from './content-strategy-package';
