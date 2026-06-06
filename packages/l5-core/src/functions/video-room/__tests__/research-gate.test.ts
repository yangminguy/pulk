import { evaluateResearchGate } from '../research-gate';
import type {
  MarketResearchPack,
  VoiceOfCustomerPack,
  ClaimEvidenceReport,
  AudienceFitReport,
} from '../types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const market: MarketResearchPack = {
  topic: '유튜브 성장 전략',
  why_this_topic_matters: '콘텐츠 크리에이터 증가',
  market_context: ['국내 유튜버 100만 명 돌파'],
  competitor_content_patterns: ['숏폼 중심'],
  unanswered_questions: ['수익화 타이밍'],
  common_misunderstandings: ['구독자 많다고 수익 높은 것 아님'],
  example_materials: ['사례 A'],
  content_opportunities: ['교육 콘텐츠 틈새'],
};

// VOC with 5 real language entries across the counted fields
const vocPass: VoiceOfCustomerPack = {
  repeated_phrases: ['영상 올려도 조회수가 안 나와요'],
  pain_expressions: ['뭘 해야 할지 모르겠어요', '시간만 낭비하는 느낌'],
  desire_expressions: ['한 달 안에 1000명은 만들고 싶어요'],
  objection_expressions: ['근데 이미 레드오션 아닌가요'],
  realistic_situations: ['퇴근 후 2시간 짬내서 찍는 중'],
  must_use_language: [],
  avoid_language: [],
};

// VOC with only 4 real language entries (fail case)
const vocFail: VoiceOfCustomerPack = {
  repeated_phrases: ['조회수가 안 나와요'],
  pain_expressions: ['뭘 해야 할지 모르겠어요'],
  desire_expressions: ['1000명 만들고 싶어요'],
  objection_expressions: ['레드오션 아닌가요'],
  realistic_situations: [],
  must_use_language: [],
  avoid_language: ['쉽게', '빠르게'], // avoid_language is excluded from count
};

// Claim with 3+ safe claims
const claimPass: ClaimEvidenceReport = {
  safe_claims: ['꾸준히 올리면 알고리즘이 반응한다', '썸네일 CTR이 성장에 직결된다', '첫 댓글 반응이 확산에 영향을 준다'],
  risky_claims: [],
  unverified_claims: [],
  safe_wording: ['~할 수 있습니다'],
  proof_points: ['사례 데이터'],
  claims_to_avoid: [],
};

// Claim with 2 safe claims and no unverified flag (fail case)
const claimFailNoFlag: ClaimEvidenceReport = {
  safe_claims: ['꾸준히 올리면 알고리즘이 반응한다', '썸네일 CTR이 성장에 직결된다'],
  risky_claims: [],
  unverified_claims: [],
  safe_wording: [],
  proof_points: [],
  claims_to_avoid: [],
};

// Claim with 2 safe claims but has "근거 부족" flag (unverified_claims non-empty) → passes condition 6
const claimPassViaFlag: ClaimEvidenceReport = {
  safe_claims: ['꾸준히 올리면 알고리즘이 반응한다', '썸네일 CTR이 성장에 직결된다'],
  risky_claims: [],
  unverified_claims: ['수익 구조는 채널마다 달라 일반화 불가'],
  safe_wording: [],
  proof_points: [],
  claims_to_avoid: [],
};

// Audience Fit that passes all three thresholds (overall ≥ 80, language_fit ≥ 75, trust_fit ≥ 80)
const audienceFitPass: AudienceFitReport = {
  overall_score: 82,
  pain_fit: 85,
  desire_fit: 80,
  language_fit: 78,
  curiosity_fit: 75,
  trust_fit: 85,
  action_fit: 80,
  what_target_wants_to_hear: ['구체적인 방법'],
  what_target_does_not_want_to_hear: ['막연한 동기부여'],
  must_answer_questions: ['어떻게 시작하나요?'],
  recommended_angle: '실전 중심 접근',
};

// Audience Fit that fails (overall_score < 80)
const audienceFitFail: AudienceFitReport = {
  overall_score: 72,
  pain_fit: 70,
  desire_fit: 70,
  language_fit: 70,
  curiosity_fit: 70,
  trust_fit: 70,
  action_fit: 70,
  what_target_wants_to_hear: [],
  what_target_does_not_want_to_hear: [],
  must_answer_questions: [],
  recommended_angle: '',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluateResearchGate', () => {
  // Case 1: All packs present and all thresholds met → passed
  it('passes when all packs are present and all thresholds are met', () => {
    const result = evaluateResearchGate({
      market,
      voc: vocPass,
      claim: claimPass,
      audienceFit: audienceFitPass,
    });
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  // Case 2: Missing market pack → fail with reason
  it('fails when market pack is missing', () => {
    const result = evaluateResearchGate({
      voc: vocPass,
      claim: claimPass,
      audienceFit: audienceFitPass,
    });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('Market Research Pack'))).toBe(true);
  });

  // Case 3: Missing voc pack → fail with reason
  it('fails when voc pack is missing', () => {
    const result = evaluateResearchGate({
      market,
      claim: claimPass,
      audienceFit: audienceFitPass,
    });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('VOC Pack'))).toBe(true);
  });

  // Case 4: VOC present but only 4 real language entries → fail
  it('fails when VOC real language count is below 5', () => {
    const result = evaluateResearchGate({
      market,
      voc: vocFail,
      claim: claimPass,
      audienceFit: audienceFitPass,
    });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('VOC real language'))).toBe(true);
  });

  // Case 5: safe_claims only 2, no unverified flag → fail
  it('fails when safe_claims < 3 and no 근거 부족 flag', () => {
    const result = evaluateResearchGate({
      market,
      voc: vocPass,
      claim: claimFailNoFlag,
      audienceFit: audienceFitPass,
    });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('safe_claims'))).toBe(true);
  });

  // Case 6: safe_claims only 2 but unverified_claims non-empty (근거 부족 flag) → passes condition 6
  it('passes condition 6 when safe_claims < 3 but 근거 부족 flag is set', () => {
    const result = evaluateResearchGate({
      market,
      voc: vocPass,
      claim: claimPassViaFlag,
      audienceFit: audienceFitPass,
    });
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  // Case 7: Audience Fit score below threshold → fail
  it('fails when Audience Fit overall_score is below 80', () => {
    const result = evaluateResearchGate({
      market,
      voc: vocPass,
      claim: claimPass,
      audienceFit: audienceFitFail,
    });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('Audience Fit'))).toBe(true);
  });

  // Case 8: All packs missing → 4 reasons
  it('reports all missing packs when input is empty', () => {
    const result = evaluateResearchGate({});
    expect(result.passed).toBe(false);
    expect(result.reasons).toHaveLength(4);
  });
});
