import { writeLogicBlockPart, WriteLogicBlockPartInput } from '../logic-block-writers';
import type {
  LogicBlock,
  CmoVideoStrategyBrief,
  ScriptMaterialPack,
  VoiceOfCustomerPack,
  ClaimEvidenceReport,
} from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseBrief: CmoVideoStrategyBrief = {
  content_id: 'key_01',
  content_type: 'key',
  topic: '퍼스널 브랜딩',
  channel_context: {
    current_position: '초반',
    content_pillar: '브랜딩',
    role_in_content_set: '키 콘텐츠',
    bridge_from_previous_content: '',
    bridge_to_next_content: '',
  },
  target_viewer: {
    who: '1인 컨설턴트',
    current_belief: '좋은 서비스면 팔린다',
    hidden_desire: '쉽게 리드가 들어왔으면',
    main_pain: '영업이 힘들다',
    objection: '나는 유명하지 않다',
    language_style: ['솔직한'],
  },
  consumer_desire_coverage: {
    covered_stages: ['desire', 'plan'],
    primary_stage: 'desire',
    stage_explanation: '욕구 자극 후 계획 제시',
  },
  video_promise: '리드 3배 공식',
  core_message: '브랜딩이 영업을 대체한다',
  strategic_angle: '공포 → 가능성',
  logic_blocks: [],
  intro_direction: '첫 문장으로 공감',
  thumbnail_direction: '대비',
  script_tone_direction: '구어체',
  cta: '상담 신청',
  risk_notes: ['수익 보장 금지', '과장 표현 금지'],
};

const baseMaterials: ScriptMaterialPack = {
  topic: '퍼스널 브랜딩',
  target_viewer: '1인 컨설턴트',
  core_message_candidates: ['브랜딩이 영업을 대체한다'],
  viewer_language: ['영업이 너무 힘들어요'],
  pain_scenes: ['매달 신규 고객 찾기'],
  desire_scenes: ['고객이 먼저 연락 오는 구조'],
  proof_points: ['6개월 리드 3배 사례'],
  examples: ['A컨설턴트 사례'],
  counterarguments: ['유명하지 않아도 된다'],
  metaphors: ['브랜딩은 자동 영업사원'],
  story_candidates: ['콜드콜에서 인바운드로 전환'],
  must_use_lines: ['지금 영업이 힘드신가요?'],
  must_avoid_lines: ['보장'],
  safe_claims: ['인바운드 리드 증가 사례 있음'],
  cta_materials: ['무료 상담 신청'],
};

const baseVoc: VoiceOfCustomerPack = {
  repeated_phrases: ['영업이 제일 힘들어요'],
  pain_expressions: ['새벽에도 걱정'],
  desire_expressions: ['고객이 먼저 오면 좋겠어요'],
  objection_expressions: ['저는 유명인이 아닌데요'],
  realistic_situations: ['월말 압박'],
  must_use_language: ['고객이 먼저 찾아오는 구조'],
  avoid_language: ['보장'],
};

const baseClaims: ClaimEvidenceReport = {
  safe_claims: ['인바운드 리드 증가 사례 있음'],
  risky_claims: ['수익 100% 보장'],
  unverified_claims: [],
  safe_wording: ['가능성이 높다'],
  proof_points: ['6개월 리드 3배 사례'],
  claims_to_avoid: ['반드시', '보장'],
};

function makeBlock(overrides?: Partial<LogicBlock>): LogicBlock {
  return {
    block_id: 'block_1',
    role: '문제 공감',
    covered_stages: ['phenomenon', 'desire'],
    main_claim: '영업 없이도 리드가 온다',
    supporting_materials: ['6개월 리드 3배 사례'],
    viewer_emotion: '공감과 희망',
    transition_to_next_block: '그러면 어떻게 하면 될까요?',
    ...overrides,
  };
}

function makeInput(blockOverrides?: Partial<LogicBlock>): WriteLogicBlockPartInput {
  return {
    block: makeBlock(blockOverrides),
    shared: {
      brief: baseBrief,
      materials: baseMaterials,
      voc: baseVoc,
      claims: baseClaims,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('writeLogicBlockPart', () => {
  test('returns the exact block_id passed in (arbitrary block_id supported)', () => {
    const result = writeLogicBlockPart(makeInput({ block_id: 'block_x99' }));
    expect(result.block_id).toBe('block_x99');
  });

  test('handles multiple covered_stages on a single block without error', () => {
    const input = makeInput({ covered_stages: ['phenomenon', 'desire', 'plan', 'action'] });
    const result = writeLogicBlockPart(input);
    expect(result.block_id).toBe('block_1');
    expect(result.draft).toBeTruthy();
  });

  test('used_materials contains only values present in ScriptMaterialPack fields', () => {
    const allPackValues = [
      ...baseMaterials.core_message_candidates,
      ...baseMaterials.viewer_language,
      ...baseMaterials.pain_scenes,
      ...baseMaterials.desire_scenes,
      ...baseMaterials.proof_points,
      ...baseMaterials.examples,
      ...baseMaterials.counterarguments,
      ...baseMaterials.metaphors,
      ...baseMaterials.story_candidates,
      ...baseMaterials.must_use_lines,
      ...baseMaterials.safe_claims,
      ...baseMaterials.cta_materials,
    ];
    const result = writeLogicBlockPart(makeInput());
    for (const mat of result.used_materials) {
      expect(allPackValues).toContain(mat);
    }
  });

  test('draft is derived from block.main_claim (no invented facts)', () => {
    const result = writeLogicBlockPart(makeInput());
    // draft must include the main_claim
    expect(result.draft).toContain('영업 없이도 리드가 온다');
  });

  test('supporting_materials not in pack produce empty used_materials (no hallucination)', () => {
    const input = makeInput({ supporting_materials: ['완전히 없는 재료 ABC'] });
    const result = writeLogicBlockPart(input);
    expect(result.used_materials).toHaveLength(0);
  });

  test('transition_out equals block.transition_to_next_block', () => {
    const result = writeLogicBlockPart(makeInput());
    expect(result.transition_out).toBe('그러면 어떻게 하면 될까요?');
  });

  test('used_voc_lines are drawn from voc pack fields only', () => {
    const allVocValues = [
      ...baseVoc.must_use_language,
      ...baseVoc.pain_expressions,
      ...baseVoc.desire_expressions,
      ...baseVoc.repeated_phrases,
    ];
    const result = writeLogicBlockPart(makeInput());
    for (const line of result.used_voc_lines) {
      expect(allVocValues).toContain(line);
    }
  });

  test('function does not branch on consumer stage — same shape for any block_id', () => {
    // Test 8: parameterised by block_id, no stage-based branching
    const resultA = writeLogicBlockPart(makeInput({ block_id: 'block_a', covered_stages: ['phenomenon'] }));
    const resultB = writeLogicBlockPart(makeInput({ block_id: 'block_b', covered_stages: ['reward'] }));
    const resultC = writeLogicBlockPart(makeInput({ block_id: 'block_c', covered_stages: ['desire', 'plan', 'action'] }));

    // All must return the same ScriptPart shape
    for (const result of [resultA, resultB, resultC]) {
      expect(result).toHaveProperty('block_id');
      expect(result).toHaveProperty('draft');
      expect(result).toHaveProperty('used_materials');
      expect(result).toHaveProperty('used_voc_lines');
      expect(result).toHaveProperty('used_claims');
      expect(result).toHaveProperty('transition_out');
      expect(result).toHaveProperty('risk_notes');
    }

    expect(resultA.block_id).toBe('block_a');
    expect(resultB.block_id).toBe('block_b');
    expect(resultC.block_id).toBe('block_c');
  });
});
