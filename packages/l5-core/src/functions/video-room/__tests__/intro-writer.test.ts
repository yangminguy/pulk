import { buildIntro30s, BuildIntro30sInput } from '../intro-writer';
import type {
  CmoVideoStrategyBrief,
  ScriptMaterialPack,
  VoiceOfCustomerPack,
} from '../types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseBrief: CmoVideoStrategyBrief = {
  content_id: 'key_01',
  content_type: 'key',
  topic: '퍼스널 브랜딩으로 컨설팅 리드 만들기',
  channel_context: {
    current_position: '초반',
    content_pillar: '브랜딩',
    role_in_content_set: '키 콘텐츠',
    bridge_from_previous_content: '풀링 콘텐츠에서 문제 인식',
    bridge_to_next_content: '',
  },
  target_viewer: {
    who: '1인 컨설턴트',
    current_belief: '좋은 서비스면 알아서 팔린다',
    hidden_desire: '쉽게 리드가 들어왔으면',
    main_pain: '영업이 너무 힘들다',
    objection: '나는 유명하지 않아서 안 된다',
    language_style: ['솔직한', '실용적인'],
  },
  consumer_desire_coverage: {
    covered_stages: ['desire', 'plan', 'action'],
    primary_stage: 'desire',
    stage_explanation: '욕구를 자극한 후 계획과 행동까지 이어지는 구조',
  },
  video_promise: '이 영상 하나로 컨설팅 리드 3배 늘리는 법을 알 수 있다',
  core_message: '퍼스널 브랜딩은 영업을 대체한다',
  strategic_angle: '공포 → 가능성 전환',
  logic_blocks: [],
  intro_direction: '궁금증을 유발하는 첫 문장으로 시작해 시청자의 현재 고통을 공명시킨다',
  thumbnail_direction: '대비 구조',
  script_tone_direction: '구어체, 친근함',
  cta: '무료 상담 신청',
  risk_notes: ['수익 보장 표현 금지'],
};

const baseMaterials: ScriptMaterialPack = {
  topic: '퍼스널 브랜딩',
  target_viewer: '1인 컨설턴트',
  core_message_candidates: ['퍼스널 브랜딩이 영업을 대체한다'],
  viewer_language: ['요즘 영업이 너무 힘들어요'],
  pain_scenes: ['매달 신규 고객을 찾아 헤매는 상황'],
  desire_scenes: ['고객이 먼저 연락 오는 상황'],
  proof_points: ['브랜딩 컨설턴트 사례: 6개월 내 리드 3배'],
  examples: ['A컨설턴트 사례'],
  counterarguments: ['유명하지 않아도 된다'],
  metaphors: ['브랜딩은 자동화된 영업사원이다'],
  story_candidates: ['3년 전까지 콜드콜만 하던 컨설턴트 이야기'],
  must_use_lines: ['지금 영업이 힘드신가요?'],
  must_avoid_lines: ['보장', '반드시'],
  safe_claims: ['브랜딩으로 인바운드 리드 증가 사례 있음'],
  cta_materials: ['무료 상담 신청하기'],
};

const baseVoc: VoiceOfCustomerPack = {
  repeated_phrases: ['영업이 제일 힘들어요', '어떻게 고객을 찾아야 할지 모르겠어요'],
  pain_expressions: ['새벽에도 영업 걱정이에요'],
  desire_expressions: ['고객이 먼저 찾아왔으면 좋겠어요'],
  objection_expressions: ['저는 유명인이 아닌데요'],
  realistic_situations: ['월말마다 실적 압박'],
  must_use_language: ['고객이 먼저 찾아오는 구조'],
  avoid_language: ['보장', '무조건'],
};

function makeInput(overrides?: Partial<BuildIntro30sInput>): BuildIntro30sInput {
  return {
    brief: baseBrief,
    materials: baseMaterials,
    voc: baseVoc,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildIntro30s', () => {
  test('viewer_promise equals brief.video_promise', () => {
    const result = buildIntro30s(makeInput());
    expect(result.viewer_promise).toBe(baseBrief.video_promise);
  });

  test('VOC real language is reflected in script (at least one phrase)', () => {
    const result = buildIntro30s(makeInput());
    const allVocPhrases = [
      ...baseVoc.must_use_language,
      ...baseVoc.pain_expressions,
      ...baseVoc.desire_expressions,
      ...baseVoc.repeated_phrases,
    ];
    const anyVocInScript = allVocPhrases.some((phrase) => result.script.includes(phrase));
    expect(anyVocInScript).toBe(true);
  });

  test('used_materials contains only values from ScriptMaterialPack fields', () => {
    const result = buildIntro30s(makeInput());
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
    for (const mat of result.used_materials) {
      expect(allPackValues).toContain(mat);
    }
  });

  test('used_script_insights is non-empty and derived from intro_direction', () => {
    const result = buildIntro30s(makeInput());
    expect(result.used_script_insights.length).toBeGreaterThan(0);
    expect(result.used_script_insights[0]).toBe(baseBrief.intro_direction);
  });

  test('throws when VOC pack has no real-language phrases', () => {
    const emptyVoc: VoiceOfCustomerPack = {
      repeated_phrases: [],
      pain_expressions: [],
      desire_expressions: [],
      objection_expressions: [],
      realistic_situations: [],
      must_use_language: [],
      avoid_language: [],
    };
    expect(() => buildIntro30s(makeInput({ voc: emptyVoc }))).toThrow(
      'VOC pack must contain at least one real-language phrase',
    );
  });

  test('returns all required Intro30s fields', () => {
    const result = buildIntro30s(makeInput());
    expect(result).toHaveProperty('first_sentence');
    expect(result).toHaveProperty('hook_type');
    expect(result).toHaveProperty('tension');
    expect(result).toHaveProperty('viewer_promise');
    expect(result).toHaveProperty('script');
    expect(result).toHaveProperty('used_materials');
    expect(result).toHaveProperty('used_script_insights');
    expect(result).toHaveProperty('why_it_works');
  });

  test('hook_type is inferred from intro_direction keywords', () => {
    const briefWithLoss: CmoVideoStrategyBrief = {
      ...baseBrief,
      intro_direction: 'loss를 강조하며 시작',
    };
    const result = buildIntro30s(makeInput({ brief: briefWithLoss }));
    expect(result.hook_type).toBe('loss');
  });
});
