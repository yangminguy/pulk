// CMO Content Strategy v3 — Phase 6: Content Strategy Package assembler.
// Per docs/prd/cmo-content-strategy-v3.md §5.
//
// assembleContentStrategyPackage merges a finalized key content topic
// (ApprovedKeyContentTopic) and a finalized pulling content set
// (ApprovedPullingContentSet) into a single ApprovedContentStrategyPackage.
//
// Pure function. No Date.now()/randomUUID(); all inputs injected by caller.
// Follows repo convention: throw on PRD-forbidden states.
//
// Validation throws:
//   - key content not finalized (viewtrap verdict === 'reject').
//   - pulling set not approved (approval_status !== 'approved' or no topics).
//   - cross-consistency: the key topic embedded in the pulling set must match
//     the supplied key content topic (a package must describe one strategy).
//   - consumer journey 5-stage coverage report is not "natural"
//     (any stage flag false, or natural_flow_score below threshold).

import type {
  ApprovedKeyContentTopic,
  ApprovedPullingContentSet,
  ContentTypePortfolio,
  ConsumerJourneyCoverageReport,
  ApprovedContentStrategyPackage,
  ProductBrief,
} from './types';

// Minimum natural_flow_score (0–10 scale, per PullingTopicScore convention)
// for the consumer journey to be considered "natural" enough to package.
const MIN_NATURAL_FLOW_SCORE = 6;

export interface AssembleContentStrategyPackageInput {
  product_brief: ProductBrief;
  key_content_topic: ApprovedKeyContentTopic;
  pulling_content_set: ApprovedPullingContentSet;
  content_type_portfolio: ContentTypePortfolio;
  title_thumbnail_direction: string;
  script_direction: string;
  cta_strategy: string;
}

/**
 * Validates that the consumer journey coverage report describes a natural
 * 5-stage flow (현상→욕구→계획→행동→보상). Returns the reasons it fails, empty
 * array when it passes.
 */
function checkJourneyCoverage(report: ConsumerJourneyCoverageReport): string[] {
  const reasons: string[] = [];
  if (!report.phenomenon_covered) reasons.push('phenomenon stage not covered');
  if (!report.desire_covered) reasons.push('desire stage not covered');
  if (!report.plan_covered) reasons.push('plan stage not covered');
  if (!report.action_connected) reasons.push('action stage not connected');
  if (!report.reward_promised) reasons.push('reward stage not promised');
  if (report.natural_flow_score < MIN_NATURAL_FLOW_SCORE) {
    reasons.push(
      `natural_flow_score ${report.natural_flow_score} is below minimum ${MIN_NATURAL_FLOW_SCORE}`,
    );
  }
  return reasons;
}

function isEmpty(s: string): boolean {
  return s.trim().length === 0;
}

export function assembleContentStrategyPackage(
  input: AssembleContentStrategyPackageInput,
): ApprovedContentStrategyPackage {
  const {
    product_brief,
    key_content_topic,
    pulling_content_set,
    content_type_portfolio,
    title_thumbnail_direction,
    script_direction,
    cta_strategy,
  } = input;

  // 1. Key content must be finalized (Viewtrap verdict must not be reject).
  if (key_content_topic.viewtrap_validation.verdict === 'reject') {
    throw new Error(
      'Cannot package: key content topic has a rejected Viewtrap validation',
    );
  }
  if (isEmpty(key_content_topic.title)) {
    throw new Error('Cannot package: key content topic has no title');
  }

  // 2. Pulling set must be approved and non-empty.
  if (pulling_content_set.approval_status !== 'approved') {
    throw new Error(
      `Cannot package: pulling content set is not approved (status=${pulling_content_set.approval_status})`,
    );
  }
  if (pulling_content_set.pulling_topics.length === 0) {
    throw new Error('Cannot package: pulling content set has no pulling topics');
  }

  // 3. Cross-step consistency: the key topic embedded in the pulling set must
  //    be the same key topic supplied to the package. A package describes one
  //    coherent strategy, so the two key references must agree.
  if (pulling_content_set.key_content_topic.title !== key_content_topic.title) {
    throw new Error(
      'Cannot package: pulling set key_content_topic.title does not match the supplied key content topic',
    );
  }

  // 4. Consumer 5-stage journey must be naturally covered by the set.
  const journeyReasons = checkJourneyCoverage(
    pulling_content_set.journey_coverage_report,
  );
  if (journeyReasons.length > 0) {
    throw new Error(
      `Cannot package: consumer journey 5-stage coverage is not natural — ${journeyReasons.join('; ')}`,
    );
  }

  // 5. Required direction fields must be present.
  if (isEmpty(title_thumbnail_direction)) {
    throw new Error('Cannot package: title_thumbnail_direction is empty');
  }
  if (isEmpty(script_direction)) {
    throw new Error('Cannot package: script_direction is empty');
  }
  if (isEmpty(cta_strategy)) {
    throw new Error('Cannot package: cta_strategy is empty');
  }

  return {
    product_brief,
    key_content_strategy: key_content_topic,
    pulling_content_set,
    content_type_portfolio,
    title_thumbnail_direction,
    script_direction,
    cta_strategy,
  };
}
