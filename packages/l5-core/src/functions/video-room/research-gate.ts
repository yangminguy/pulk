// research-gate.ts — PRD §9 Gate 1 Research Completeness
//
// Evaluates whether all required research packs are present and meet
// the quality thresholds defined in PRD §9 Gate 1 (§16.14 in task spec).
//
// Helpers are imported from their respective modules — no duplicate logic.

import type {
  MarketResearchPack,
  VoiceOfCustomerPack,
  ClaimEvidenceReport,
  AudienceFitReport,
} from './types';
import { isAudienceFitPass } from './audience-fit';
import { countRealLanguage } from './voc-research';
import { countSafeClaims } from './claim-verification';

export interface ResearchGateInput {
  market?: MarketResearchPack;
  voc?: VoiceOfCustomerPack;
  claim?: ClaimEvidenceReport;
  audienceFit?: AudienceFitReport;
}

export interface ResearchGateResult {
  passed: boolean;
  reasons: string[];
}

// Thresholds from PRD §9 Gate 1
const VOC_REAL_LANGUAGE_MIN = 5;
const SAFE_CLAIMS_MIN = 3;

/**
 * Evaluates Gate 1 Research Completeness.
 *
 * Pass conditions (all must hold):
 *  1. Market Research Pack exists
 *  2. VOC Pack exists
 *  3. Claim Evidence Report exists
 *  4. Audience Fit Report exists AND isAudienceFitPass (overall_score ≥ 80,
 *     language_fit ≥ 75, trust_fit ≥ 80)
 *  5. VOC real language count ≥ 5
 *  6. safe_claims ≥ 3  OR  unverified_claims non-empty ("근거 부족" flag)
 *
 * Returns { passed: true, reasons: [] } when all conditions are met.
 * Returns { passed: false, reasons: [...failing reasons] } otherwise.
 */
export function evaluateResearchGate(input: ResearchGateInput): ResearchGateResult {
  const reasons: string[] = [];

  // 1. Pack presence checks
  if (!input.market) {
    reasons.push('Market Research Pack이 없습니다.');
  }
  if (!input.voc) {
    reasons.push('VOC Pack이 없습니다.');
  }
  if (!input.claim) {
    reasons.push('Claim Evidence Report가 없습니다.');
  }
  if (!input.audienceFit) {
    reasons.push('Audience Fit Report가 없습니다.');
  }

  // 4. Audience Fit score check (only when pack is present)
  if (input.audienceFit && !isAudienceFitPass(input.audienceFit)) {
    reasons.push(
      `Audience Fit 점수가 기준 미달입니다 (overall=${input.audienceFit.overall_score}, language_fit=${input.audienceFit.language_fit}, trust_fit=${input.audienceFit.trust_fit}).`,
    );
  }

  // 5. VOC real language count check (only when pack is present)
  if (input.voc) {
    const vocCount = countRealLanguage(input.voc);
    if (vocCount < VOC_REAL_LANGUAGE_MIN) {
      reasons.push(
        `VOC real language 항목이 부족합니다 (현재 ${vocCount}개, 최소 ${VOC_REAL_LANGUAGE_MIN}개 필요).`,
      );
    }
  }

  // 6. Safe claims check (only when report is present)
  // Passes when safe_claims ≥ 3 OR unverified_claims is non-empty ("근거 부족" 플래그)
  if (input.claim) {
    const safeCount = countSafeClaims(input.claim);
    const hasInsufficientEvidenceFlag = input.claim.unverified_claims.length > 0;
    if (safeCount < SAFE_CLAIMS_MIN && !hasInsufficientEvidenceFlag) {
      reasons.push(
        `safe_claims가 부족하고 근거 부족 플래그도 없습니다 (현재 ${safeCount}개, 최소 ${SAFE_CLAIMS_MIN}개 필요).`,
      );
    }
  }

  return { passed: reasons.length === 0, reasons };
}
