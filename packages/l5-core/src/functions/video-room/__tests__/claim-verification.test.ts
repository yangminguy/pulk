import { buildClaimEvidenceReport, countSafeClaims } from '../claim-verification';
import type { ClaimEvidenceReport } from '../types';

// Case 1: normal report — all fields propagated correctly
test('buildClaimEvidenceReport returns a report with all input fields', () => {
  const input = {
    safe_claims: ['효과가 검증된 방법입니다', '연구 기반 접근입니다', '사용자 사례가 있습니다'],
    risky_claims: ['100% 성공 보장'],
    unverified_claims: ['업계 최고 성과'],
    safe_wording: ['~에 도움이 될 수 있습니다', '많은 사용자가 경험한'],
    proof_points: ['사례 연구 3건', '사용자 인터뷰 결과'],
    claims_to_avoid: ['무조건 됩니다', '반드시 효과 있음'],
  };

  const report = buildClaimEvidenceReport(input);

  expect(report.safe_claims).toEqual(input.safe_claims);
  expect(report.risky_claims).toEqual(input.risky_claims);
  expect(report.unverified_claims).toEqual(input.unverified_claims);
  expect(report.safe_wording).toEqual(input.safe_wording);
  expect(report.proof_points).toEqual(input.proof_points);
  expect(report.claims_to_avoid).toEqual(input.claims_to_avoid);
});

// Case 2: countSafeClaims returns correct count
test('countSafeClaims returns the number of safe_claims', () => {
  const report: ClaimEvidenceReport = {
    safe_claims: ['주장1', '주장2', '주장3', '주장4'],
    risky_claims: [],
    unverified_claims: [],
    safe_wording: [],
    proof_points: [],
    claims_to_avoid: [],
  };

  expect(countSafeClaims(report)).toBe(4);
});

// Case 3: Gate 1 — safe_claims >= 3 passes, < 3 fails
test('Gate 1: countSafeClaims >= 3 passes, < 3 fails', () => {
  const passing: ClaimEvidenceReport = {
    safe_claims: ['a', 'b', 'c'],
    risky_claims: [],
    unverified_claims: [],
    safe_wording: [],
    proof_points: [],
    claims_to_avoid: [],
  };
  const failing: ClaimEvidenceReport = {
    safe_claims: ['a', 'b'],
    risky_claims: [],
    unverified_claims: [],
    safe_wording: [],
    proof_points: [],
    claims_to_avoid: [],
  };

  expect(countSafeClaims(passing) >= 3).toBe(true);
  expect(countSafeClaims(failing) >= 3).toBe(false);
});

// Case 4: risky/unverified classification — separate buckets, not cross-contaminated
test('risky and unverified claims are stored in separate buckets', () => {
  const input = {
    safe_claims: ['검증된 주장'],
    risky_claims: ['위험한 주장 A', '위험한 주장 B'],
    unverified_claims: ['미검증 주장 X'],
    safe_wording: [],
    proof_points: [],
    claims_to_avoid: [],
  };

  const report = buildClaimEvidenceReport(input);

  expect(report.risky_claims).toContain('위험한 주장 A');
  expect(report.risky_claims).toContain('위험한 주장 B');
  expect(report.unverified_claims).toContain('미검증 주장 X');

  // risky and unverified must not bleed into each other
  expect(report.safe_claims).not.toContain('위험한 주장 A');
  expect(report.unverified_claims).not.toContain('위험한 주장 A');
  expect(report.risky_claims).not.toContain('미검증 주장 X');
});

// Case 5: empty input — all arrays empty, countSafeClaims returns 0
test('empty input produces empty report and countSafeClaims returns 0', () => {
  const input = {
    safe_claims: [],
    risky_claims: [],
    unverified_claims: [],
    safe_wording: [],
    proof_points: [],
    claims_to_avoid: [],
  };

  const report = buildClaimEvidenceReport(input);

  expect(report.safe_claims).toHaveLength(0);
  expect(countSafeClaims(report)).toBe(0);
  expect(countSafeClaims(report) >= 3).toBe(false);
});
