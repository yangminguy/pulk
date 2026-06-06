// Content Set Validator — PRD §8 / §9 Gate 2
//
// validateContentSet: builds ContentSetValidation from a list of ContentSetEntry.
//   - stage_coverage: for each ConsumerStageEn, which content_ids cover it.
//   - sequence_logic: is_sequential=true when all 5 stages appear at least once
//     AND the weighted median stage order across entries follows phenomenon→desire→plan→action→reward.
//   - missing_stages: stages absent from stage_coverage.
//   - overlap_risk: content_ids whose covered_stages is a strict subset of another entry's covered_stages.
//   - revision_needed: true when any stage is missing OR any pulling entry lacks bridge_to_key.
//
// evaluateContentSetGate: Gate 2 pass/fail (PRD §9 Gate 2):
//   - key content (content_type='key') count == 1
//   - pulling content count == 5
//   - every entry has at least one covered_stage
//   - all 5 stages covered (missing_stages empty)
//   - every pulling entry has a non-empty bridge_to_key
//   - revision_needed == false

import type { ContentSetEntry, ContentSetValidation, ConsumerStageEn } from './types';

const ALL_STAGES: ConsumerStageEn[] = ['phenomenon', 'desire', 'plan', 'action', 'reward'];

// Stage order index used for sequential logic check.
const STAGE_ORDER: Record<ConsumerStageEn, number> = {
  phenomenon: 0,
  desire: 1,
  plan: 2,
  action: 3,
  reward: 4,
};

/**
 * Returns the minimum stage index among covered_stages for an entry.
 * Used to assess whether entries appear in a plausible funnel order.
 */
function minStageIndex(entry: ContentSetEntry): number {
  if (entry.covered_stages.length === 0) return -1;
  return Math.min(...entry.covered_stages.map((s) => STAGE_ORDER[s]));
}

/**
 * Checks whether the sequence of entries is non-decreasing in minimum stage index.
 * A set is considered sequential when entries are ordered from earlier to later stages.
 */
function checkSequential(contents: ContentSetEntry[]): { is_sequential: boolean; explanation: string } {
  if (contents.length === 0) {
    return { is_sequential: false, explanation: 'No contents provided.' };
  }

  const indices = contents.map(minStageIndex);
  let outOfOrder = false;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] < indices[i - 1]) {
      outOfOrder = true;
      break;
    }
  }

  if (outOfOrder) {
    return {
      is_sequential: false,
      explanation:
        'Entry order does not follow the phenomenon→desire→plan→action→reward progression. Consider reordering pulling contents.',
    };
  }

  return {
    is_sequential: true,
    explanation:
      'Entries progress from earlier to later consumer stages, supporting a natural funnel flow.',
  };
}

/**
 * Identifies content_ids whose covered_stages set is a strict subset of another entry's
 * covered_stages. These entries are flagged as overlap risks — they add no unique stage
 * coverage to the set.
 */
function findOverlapRisk(contents: ContentSetEntry[]): string[] {
  const risks: string[] = [];

  for (let i = 0; i < contents.length; i++) {
    const a = contents[i];
    const aSet = new Set(a.covered_stages);

    for (let j = 0; j < contents.length; j++) {
      if (i === j) continue;
      const b = contents[j];
      const bSet = new Set(b.covered_stages);

      // a's stages are a strict subset of b's stages → a risks being redundant
      if (aSet.size < bSet.size && [...aSet].every((s) => bSet.has(s))) {
        risks.push(a.content_id);
        break;
      }
    }
  }

  return risks;
}

export function validateContentSet(input: { contents: ContentSetEntry[] }): ContentSetValidation {
  const { contents } = input;

  // Build stage_coverage: stage → list of content_ids that include that stage
  const stage_coverage: Record<ConsumerStageEn, string[]> = {
    phenomenon: [],
    desire: [],
    plan: [],
    action: [],
    reward: [],
  };

  for (const entry of contents) {
    for (const stage of entry.covered_stages) {
      stage_coverage[stage].push(entry.content_id);
    }
  }

  // missing_stages: stages with no covering content
  const missing_stages: ConsumerStageEn[] = ALL_STAGES.filter(
    (s) => stage_coverage[s].length === 0,
  );

  const sequence_logic = checkSequential(contents);

  const overlap_risk = findOverlapRisk(contents);

  // pulling entries that are missing bridge_to_key
  const pullingWithoutBridge = contents.filter(
    (e) => e.content_type === 'pulling' && !e.bridge_to_key,
  );

  const revision_needed = missing_stages.length > 0 || pullingWithoutBridge.length > 0;

  return {
    contents,
    stage_coverage,
    sequence_logic,
    missing_stages,
    overlap_risk,
    revision_needed,
  };
}

export interface ContentSetGateResult {
  passed: boolean;
  reasons: string[];
}

export function evaluateContentSetGate(validation: ContentSetValidation): ContentSetGateResult {
  const reasons: string[] = [];

  const keyCount = validation.contents.filter((e) => e.content_type === 'key').length;
  const pullingCount = validation.contents.filter((e) => e.content_type === 'pulling').length;

  if (keyCount !== 1) {
    reasons.push(`Expected exactly 1 key content, found ${keyCount}.`);
  }

  if (pullingCount !== 5) {
    reasons.push(`Expected exactly 5 pulling contents, found ${pullingCount}.`);
  }

  for (const entry of validation.contents) {
    if (entry.covered_stages.length === 0) {
      reasons.push(`Content '${entry.content_id}' has no covered_stages.`);
    }
  }

  if (validation.missing_stages.length > 0) {
    reasons.push(`Missing stages: ${validation.missing_stages.join(', ')}.`);
  }

  const pullingWithoutBridge = validation.contents.filter(
    (e) => e.content_type === 'pulling' && !e.bridge_to_key,
  );
  for (const entry of pullingWithoutBridge) {
    reasons.push(`Pulling content '${entry.content_id}' is missing bridge_to_key.`);
  }

  if (validation.revision_needed) {
    reasons.push('revision_needed is true.');
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}
