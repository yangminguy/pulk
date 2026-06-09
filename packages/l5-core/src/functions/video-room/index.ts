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
