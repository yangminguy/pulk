// script-room-pipeline.test.ts — E2E pipeline tests.
//
// Test cases:
//   1. Happy path → brief.schema_version === 'cmo_to_factory_v2' + qa produced
//   2. Happy path → brief has logic_blocks derived from strategy
//   3. Research gate failure (audience fit below threshold) → throws
//   4. Research gate failure (missing VOC) → throws

import {
  runScriptRoomToBrief,
  type RunScriptRoomToBriefInput,
} from '../script-room-pipeline';

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeBaseInput(overrides: Partial<RunScriptRoomToBriefInput> = {}): RunScriptRoomToBriefInput {
  return {
    content_card_id: 'card-pipeline-001',
    content_type: 'key',
    title: '유튜브 알고리즘 완전 정복',
    topic: '유튜브 알고리즘',
    target_viewer: '1인 창업자',

    market_research: {
      topic: '유튜브 알고리즘',
      why_this_topic_matters: '채널 성장의 핵심',
      market_context: ['유튜브는 전 세계 2위 검색엔진'],
      competitor_content_patterns: ['패턴 A', '패턴 B'],
      unanswered_questions: ['왜 조회수가 안 나오나'],
      common_misunderstandings: ['알고리즘은 운이다'],
      example_materials: ['사례 영상 1', '사례 영상 2'],
      content_opportunities: ['데이터 기반 접근법', '3가지 핵심 신호'],
    },

    voc: {
      repeated_phrases: ['조회수가 안 나와요', '알고리즘이 이해가 안 돼요'],
      pain_expressions: ['열심히 올려도 조회수가 없다', '채널이 안 크는 이유를 모르겠다'],
      desire_expressions: ['채널을 빠르게 성장시키고 싶다', '알고리즘을 내 편으로 만들고 싶다'],
      objection_expressions: ['이미 다 해봤는데 효과가 없었다'],
      realistic_situations: ['밤새 편집했는데 조회수 10개'],
      must_use_language: ['알고리즘 공략법', '실제로 작동하는 방법'],
      avoid_language: ['무조건', '반드시'],
    },

    claim: {
      safe_claims: ['클릭률이 높을수록 추천 확률이 높다', '시청 지속시간이 핵심 지표다', '댓글은 참여 신호다'],
      risky_claims: ['무조건 100만뷰 가능'],
      unverified_claims: [],
      safe_wording: ['데이터에 따르면', '연구 결과'],
      proof_points: ['유튜브 공식 가이드 인용', 'A/B 테스트 결과'],
      claims_to_avoid: ['보장', '무조건'],
    },

    audience_fit: {
      pain_fit: 90,
      desire_fit: 85,
      language_fit: 80,
      curiosity_fit: 75,
      trust_fit: 85,
      action_fit: 80,
      what_target_wants_to_hear: ['알고리즘의 실제 작동 원리'],
      what_target_does_not_want_to_hear: ['추상적인 조언'],
      must_answer_questions: ['어떻게 시작하나요?'],
      recommended_angle: '데이터와 실제 사례 중심',
    },

    strategy_input: {
      channel_context: {
        current_position: '초기 채널',
        content_pillar: '콘텐츠 마케팅',
        role_in_content_set: 'key content',
        bridge_from_previous_content: '이전 영상에서 채널 기획을 다뤘습니다',
        bridge_to_next_content: '다음 영상에서 구체적인 키워드 전략을 알아봅니다',
      },
    },

    voice_sources: [],

    qa_input: {
      strategy_fit_score: 85,
      audience_fit_score: 82,
      voice_fit_score: 78,
      sales_logic_score: 80,
      fact_safety_score: 92,
      desire_stage_coverage: {
        phenomenon: true,
        desire: true,
        plan: true,
        action: false,
        reward: false,
      },
      logic_block_alignment: ['block_1 OK', 'block_2 OK', 'block_3 OK'],
      missing_parts: [],
      revision_requests: [],
    },

    source_pack_ids: {
      market_research_pack_id: 'mrp-001',
      voc_pack_id: 'voc-001',
      claim_evidence_report_id: 'cer-001',
      script_material_pack_id: 'smp-001',
    },

    ...overrides,
  };
}

// ── Test 1: schema_version and qa are produced ───────────────────────────────

describe('runScriptRoomToBrief — happy path', () => {
  it('returns brief with schema_version cmo_to_factory_v2', () => {
    const result = runScriptRoomToBrief(makeBaseInput());
    expect(result.brief.schema_version).toBe('cmo_to_factory_v2');
  });

  // ── Test 2: brief structure and qa both produced ──────────────────────────
  it('returns both brief and qa, brief has logic_blocks', () => {
    const result = runScriptRoomToBrief(makeBaseInput());

    // brief fields
    expect(result.brief.content_card_id).toBe('card-pipeline-001');
    expect(result.brief.content_type).toBe('key');
    expect(result.brief.title).toBe('유튜브 알고리즘 완전 정복');
    expect(result.brief.script.logic_blocks.length).toBeGreaterThanOrEqual(1);

    // qa fields
    expect(typeof result.qa.strategy_fit_score).toBe('number');
    expect(typeof result.qa.overall_pass).toBe('boolean');
    expect(result.qa.overall_pass).toBe(true); // all scores meet thresholds
  });

  it('source_pack_ids are passed through into brief.source_materials', () => {
    const result = runScriptRoomToBrief(makeBaseInput());
    expect(result.brief.source_materials.market_research_pack_id).toBe('mrp-001');
    expect(result.brief.source_materials.voc_pack_id).toBe('voc-001');
  });

  it('brief has non-empty full_script from founder voice pass-through', () => {
    const result = runScriptRoomToBrief(makeBaseInput());
    expect(result.brief.script.full_script.length).toBeGreaterThan(0);
  });
});

// ── Test 3: Research gate failure — audience fit below threshold ──────────────

describe('runScriptRoomToBrief — research gate failure', () => {
  it('throws when audience fit is below gate threshold (overall < 80)', () => {
    const input = makeBaseInput({
      audience_fit: {
        pain_fit: 50,
        desire_fit: 50,
        language_fit: 50,
        curiosity_fit: 50,
        trust_fit: 50,
        action_fit: 50,
        what_target_wants_to_hear: ['something'],
        what_target_does_not_want_to_hear: [],
        must_answer_questions: [],
        recommended_angle: '기본 접근',
      },
    });

    expect(() => runScriptRoomToBrief(input)).toThrow('Research Gate(1) 미통과');
  });

  // ── Test 4: VOC real language count below minimum ─────────────────────────
  it('throws when VOC real language count is below minimum (< 5)', () => {
    const input = makeBaseInput({
      // Only 2 real language entries total — below the 5 minimum
      voc: {
        repeated_phrases: ['하나'],
        pain_expressions: ['둘'],
        desire_expressions: [],
        objection_expressions: [],
        realistic_situations: [],
        must_use_language: [],
        avoid_language: [],
      },
    });

    expect(() => runScriptRoomToBrief(input)).toThrow('Research Gate(1) 미통과');
  });
});
