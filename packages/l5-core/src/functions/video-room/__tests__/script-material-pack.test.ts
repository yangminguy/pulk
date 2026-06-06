import { buildScriptMaterialPack, BuildScriptMaterialPackInput } from '../script-material-pack';
import type {
  MarketResearchPack,
  VoiceOfCustomerPack,
  ClaimEvidenceReport,
  AudienceFitReport,
} from '../types';

// ── Fixtures ────────────────────────────────────────────────────────────────

const market: MarketResearchPack = {
  topic: 'AI 자동화 마케팅',
  why_this_topic_matters: '소규모 사업자의 시간 절감 수요 폭발',
  market_context: ['광고비 상승', 'SNS 알고리즘 변화'],
  competitor_content_patterns: ['단순 도구 소개 위주', '전문 용어 남발'],
  unanswered_questions: ['초보자도 할 수 있나?', '비용이 얼마나 드나?'],
  common_misunderstandings: ['자동화 = 스팸', 'AI가 다 해준다'],
  example_materials: ['사례A: 월 매출 2배 자동화 사례', '사례B: 카카오 챗봇 연동'],
  content_opportunities: ['초보자용 자동화 첫 걸음', '비용 제로 자동화 툴 조합'],
};

const voc: VoiceOfCustomerPack = {
  repeated_phrases: ['시간이 없어요', '어디서부터 시작해야 할지'],
  pain_expressions: ['매일 같은 답장을 반복해요', '수작업이 너무 많아요'],
  desire_expressions: ['자는 동안에도 돈이 들어오면', '한 번 세팅하면 알아서'],
  objection_expressions: ['어렵지 않나요?', '비용이 부담돼요'],
  realistic_situations: ['퇴근 후 혼자 운영하는 쇼핑몰', '고객 문의 처리에 2시간'],
  must_use_language: ['지금 당장', '딱 한 번만 세팅'],
  avoid_language: ['ROI', '레버리지'],
};

const claim: ClaimEvidenceReport = {
  safe_claims: ['자동화로 응답 시간 80% 단축 가능', '무료 툴만으로 기본 자동화 구현 가능'],
  risky_claims: ['무조건 수익 2배'],
  unverified_claims: ['모든 업종에 적용 가능'],
  safe_wording: ['평균적으로', '케이스에 따라'],
  proof_points: ['실제 사용자 후기 3건', 'Make.com 공식 사례 문서'],
  claims_to_avoid: ['보장', '확실히'],
};

const audience: AudienceFitReport = {
  overall_score: 85,
  pain_fit: 90,
  desire_fit: 82,
  language_fit: 88,
  curiosity_fit: 80,
  trust_fit: 78,
  action_fit: 75,
  what_target_wants_to_hear: ['구체적인 단계', '실제 사례'],
  what_target_does_not_want_to_hear: ['전문 용어', '복잡한 설명'],
  must_answer_questions: ['어디서부터 시작하나?', '비용 없이 가능한가?'],
  recommended_angle: '초보자 관점의 첫 자동화 경험',
};

function makeInput(overrides: Partial<BuildScriptMaterialPackInput> = {}): BuildScriptMaterialPackInput {
  return {
    topic: 'AI 자동화 마케팅',
    target_viewer: '1인 사업자',
    market_research: market,
    voc,
    claim_evidence: claim,
    audience_fit: audience,
    ...overrides,
  };
}

// ── Test cases ───────────────────────────────────────────────────────────────

describe('buildScriptMaterialPack', () => {
  // Case 1: full 4-pack synthesis → ScriptMaterialPack structure
  it('4개 pack을 합성하여 ScriptMaterialPack 전체 필드를 반환한다', () => {
    const result = buildScriptMaterialPack(makeInput());

    expect(result.topic).toBe('AI 자동화 마케팅');
    expect(result.target_viewer).toBe('1인 사업자');

    // All required array fields must exist
    const arrayFields: (keyof typeof result)[] = [
      'core_message_candidates',
      'viewer_language',
      'pain_scenes',
      'desire_scenes',
      'proof_points',
      'examples',
      'counterarguments',
      'metaphors',
      'story_candidates',
      'must_use_lines',
      'must_avoid_lines',
      'safe_claims',
      'cta_materials',
    ];
    for (const field of arrayFields) {
      expect(Array.isArray(result[field])).toBe(true);
    }
  });

  // Case 2: VOC → viewer_language mapping
  it('viewer_language는 voc.must_use_language + voc.repeated_phrases로 구성된다 (중복 제거)', () => {
    const result = buildScriptMaterialPack(makeInput());

    // must_use_language items must appear first
    expect(result.viewer_language).toContain('지금 당장');
    expect(result.viewer_language).toContain('딱 한 번만 세팅');
    // repeated_phrases items also included
    expect(result.viewer_language).toContain('시간이 없어요');
    expect(result.viewer_language).toContain('어디서부터 시작해야 할지');

    // must_use_lines is strictly voc.must_use_language
    expect(result.must_use_lines).toEqual(voc.must_use_language);
  });

  // Case 3: safe_claims propagation from ClaimEvidenceReport
  it('safe_claims는 claim_evidence.safe_claims에서 전파된다', () => {
    const result = buildScriptMaterialPack(makeInput());

    expect(result.safe_claims).toEqual(claim.safe_claims);
    expect(result.safe_claims).toContain('자동화로 응답 시간 80% 단축 가능');
    expect(result.safe_claims).toContain('무료 툴만으로 기본 자동화 구현 가능');

    // risky and unverified claims must NOT leak into safe_claims
    expect(result.safe_claims).not.toContain('무조건 수익 2배');
    expect(result.safe_claims).not.toContain('모든 업종에 적용 가능');
  });

  // Case 4: empty array inputs produce empty arrays (no crash)
  it('빈 배열 입력 시 충돌 없이 빈 배열 필드를 반환한다', () => {
    const emptyMarket: MarketResearchPack = {
      topic: '빈 주제',
      why_this_topic_matters: '',
      market_context: [],
      competitor_content_patterns: [],
      unanswered_questions: [],
      common_misunderstandings: [],
      example_materials: [],
      content_opportunities: [],
    };
    const emptyVoc: VoiceOfCustomerPack = {
      repeated_phrases: [],
      pain_expressions: [],
      desire_expressions: [],
      objection_expressions: [],
      realistic_situations: [],
      must_use_language: [],
      avoid_language: [],
    };
    const emptyClaim: ClaimEvidenceReport = {
      safe_claims: [],
      risky_claims: [],
      unverified_claims: [],
      safe_wording: [],
      proof_points: [],
      claims_to_avoid: [],
    };
    const emptyAudience: AudienceFitReport = {
      overall_score: 0,
      pain_fit: 0,
      desire_fit: 0,
      language_fit: 0,
      curiosity_fit: 0,
      trust_fit: 0,
      action_fit: 0,
      what_target_wants_to_hear: [],
      what_target_does_not_want_to_hear: [],
      must_answer_questions: [],
      recommended_angle: '',
    };

    const result = buildScriptMaterialPack({
      topic: '테스트 주제',
      target_viewer: '테스트 타깃',
      market_research: emptyMarket,
      voc: emptyVoc,
      claim_evidence: emptyClaim,
      audience_fit: emptyAudience,
    });

    expect(result.topic).toBe('테스트 주제');
    expect(result.viewer_language).toEqual([]);
    expect(result.safe_claims).toEqual([]);
    expect(result.pain_scenes).toEqual([]);
    expect(result.must_use_lines).toEqual([]);
    expect(result.must_avoid_lines).toEqual([]);
    expect(result.cta_materials).toEqual([]);
  });

  // Case 5: deduplication — overlapping items appear only once
  it('중복 항목은 한 번만 포함된다', () => {
    const dupVoc: VoiceOfCustomerPack = {
      ...voc,
      must_use_language: ['중복 표현', '고유 표현'],
      repeated_phrases: ['중복 표현', '다른 표현'],
    };

    const result = buildScriptMaterialPack(makeInput({ voc: dupVoc }));

    const count = result.viewer_language.filter((v) => v === '중복 표현').length;
    expect(count).toBe(1);
  });

  // Case 6: invalid topic/target_viewer throws
  it('topic이 빈 문자열이면 에러를 던진다', () => {
    expect(() =>
      buildScriptMaterialPack(makeInput({ topic: '' })),
    ).toThrow('topic must not be empty');
  });

  it('target_viewer가 빈 문자열이면 에러를 던진다', () => {
    expect(() =>
      buildScriptMaterialPack(makeInput({ target_viewer: '   ' })),
    ).toThrow('target_viewer must not be empty');
  });
});
