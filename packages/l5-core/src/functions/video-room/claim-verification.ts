import type { ClaimEvidenceReport } from './types';

export interface BuildClaimEvidenceReportInput {
  safe_claims: string[];
  risky_claims: string[];
  unverified_claims: string[];
  safe_wording: string[];
  proof_points: string[];
  claims_to_avoid: string[];
}

/**
 * buildClaimEvidenceReport — PRD §3.3 / Gate 1
 *
 * Assembles a ClaimEvidenceReport from validated claim lists.
 * Pure function: no I/O, no Date/randomUUID — caller injects all values.
 */
export function buildClaimEvidenceReport(
  input: BuildClaimEvidenceReportInput,
): ClaimEvidenceReport {
  return {
    safe_claims: input.safe_claims,
    risky_claims: input.risky_claims,
    unverified_claims: input.unverified_claims,
    safe_wording: input.safe_wording,
    proof_points: input.proof_points,
    claims_to_avoid: input.claims_to_avoid,
  };
}

/**
 * countSafeClaims — Gate 1 helper
 *
 * Returns the number of safe_claims in a ClaimEvidenceReport.
 * Gate 1 passes when countSafeClaims(report) >= 3.
 */
export function countSafeClaims(report: ClaimEvidenceReport): number {
  return report.safe_claims.length;
}
