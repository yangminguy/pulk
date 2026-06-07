import {
  buildVideoExecutionBrief,
  mapStagesToEn,
  type BuildVideoExecutionBriefInput,
} from '../video-execution-brief';
import type { CmoVideoStrategyBrief, VoiceMatchedScript } from '../types';

// ── Fixture helpers ────────────────────────────────────────────────────────────

const makeStrategyBrief = (
  overrides: Partial<CmoVideoStrategyBrief> = {},
): CmoVideoStrategyBrief => ({
  content_id: 'card-001',
  content_type: 'key',
  topic: '유튜브 알고리즘 완전 정복',
  channel_context: {
    current_position: '초기 채널',
    content_pillar: '콘텐츠 마케팅',
    role_in_content_set: 'key content',
    bridge_from_previous_content: '이전 영상 브릿지',
    bridge_to_next_content: '다음 영상 브릿지',
  },
  target_viewer: {
    who: '1인 창업자',
    current_belief: '알고리즘은 운이다',
    hidden_desire: '채널 성장을 확신하고 싶다',
    main_pain: '조회수가 나오지 않는다',
    objection: '이미 다 해봤다',
    language_style: ['솔직한', '현실적인'],
  },
  consumer_desire_coverage: {
    covered_stages: ['phenomenon', 'desire', 'plan'],
    primary_stage: 'desire',
    stage_explanation: '욕구 단계 중심',
  },
  video_promise: '알고리즘 작동 원리를 5분 안에 설명한다',
  core_message: '알고리즘은 콘텐츠 품질을 본다',
  strategic_angle: '데이터 기반 접근',
  logic_blocks: [
    {
      block_id: 'block_01',
      role: '문제 제기',
      covered_stages: ['phenomenon'],
      main_claim: '조회수 없음의 진짜 이유',
      supporting_materials: ['통계 자료 A', '사례 B'],
      viewer_emotion: '공감',
      transition_to_next_block: '그렇다면 해결책은?',
      visual_intent_hint: '그래프 차트',
    },
    {
      block_id: 'block_02',
      role: '해결책 제시',
      covered_stages: ['desire', 'plan'],
      main_claim: '알고리즘이 보는 3가지 신호',
      supporting_materials: ['유튜브 공식 문서'],
      viewer_emotion: '희망',
      transition_to_next_block: '지금 바로 적용하자',
    },
  ],
  intro_direction: '강렬한 첫 문장으로 시작',
  thumbnail_direction: '숫자 강조',
  script_tone_direction: '친근하고 명확하게',
  cta: '구독과 좋아요',
  risk_notes: [],
  ...overrides,
});

const makeVoiceScript = (full_script = '기본 나레이션 전체 원고입니다.'): VoiceMatchedScript => ({
  full_script,
  voice_profile_used: { style: 'casual' },
  changed_phrases: [],
  preserved_logic: true,
});

const makeInput = (
  overrides: Partial<BuildVideoExecutionBriefInput> = {},
): BuildVideoExecutionBriefInput => ({
  content_card_id: 'card-001',
  content_type: 'key',
  title: '유튜브 알고리즘 완전 정복',
  strategy_brief: makeStrategyBrief(),
  voice_matched_script: makeVoiceScript(),
  intro_30s: '오늘은 알고리즘을 정복할 것입니다.',
  ...overrides,
});

// ── 1. schema_version is always 'cmo_to_factory_v2' ──────────────────────────

describe('schema_version', () => {
  it("sets schema_version to 'cmo_to_factory_v2'", () => {
    const result = buildVideoExecutionBrief(makeInput());
    expect(result.schema_version).toBe('cmo_to_factory_v2');
  });
});

// ── 2. logic_blocks contain communication_goal ────────────────────────────────

describe('logic_blocks', () => {
  it('maps communication_goal from main_claim of each logic block', () => {
    const result = buildVideoExecutionBrief(makeInput());
    expect(result.script.logic_blocks).toHaveLength(2);
    expect(result.script.logic_blocks[0].communication_goal).toBe('조회수 없음의 진짜 이유');
    expect(result.script.logic_blocks[1].communication_goal).toBe('알고리즘이 보는 3가지 신호');
  });

  it('maps required_evidence from supporting_materials', () => {
    const result = buildVideoExecutionBrief(makeInput());
    expect(result.script.logic_blocks[0].required_evidence).toEqual(['통계 자료 A', '사례 B']);
    expect(result.script.logic_blocks[1].required_evidence).toEqual(['유튜브 공식 문서']);
  });

  it('maps visual_intent_hint when present on strategy block', () => {
    const result = buildVideoExecutionBrief(makeInput());
    expect(result.script.logic_blocks[0].visual_intent_hint).toBe('그래프 차트');
    // block_02 has no visual_intent_hint — key must be absent
    expect(Object.prototype.hasOwnProperty.call(result.script.logic_blocks[1], 'visual_intent_hint')).toBe(false);
  });

  it('extracts speaker_text from bracketed block markers in full_script', () => {
    const full_script =
      '[block_01]첫 번째 블록 원고입니다.[block_02]두 번째 블록 원고입니다.';
    const result = buildVideoExecutionBrief(
      makeInput({ voice_matched_script: makeVoiceScript(full_script) }),
    );
    expect(result.script.logic_blocks[0].speaker_text).toBe('첫 번째 블록 원고입니다.');
    expect(result.script.logic_blocks[1].speaker_text).toBe('두 번째 블록 원고입니다.');
  });

  it('falls back to full_script as speaker_text when no block markers exist', () => {
    const full_script = '마커 없는 전체 원고입니다.';
    const result = buildVideoExecutionBrief(
      makeInput({ voice_matched_script: makeVoiceScript(full_script) }),
    );
    expect(result.script.logic_blocks[0].speaker_text).toBe(full_script);
  });
});

// ── 3. Forbidden fields absent (scene_type / duration) ───────────────────────

describe('forbidden fields', () => {
  it('result has no scene_type key anywhere in logic_blocks', () => {
    const result = buildVideoExecutionBrief(makeInput());
    for (const block of result.script.logic_blocks) {
      expect(Object.prototype.hasOwnProperty.call(block, 'scene_type')).toBe(false);
    }
  });

  it('result has no duration key anywhere in logic_blocks', () => {
    const result = buildVideoExecutionBrief(makeInput());
    for (const block of result.script.logic_blocks) {
      expect(Object.prototype.hasOwnProperty.call(block, 'duration')).toBe(false);
    }
  });

  it('result has no best_medium key anywhere in logic_blocks', () => {
    const result = buildVideoExecutionBrief(makeInput());
    for (const block of result.script.logic_blocks) {
      expect(Object.prototype.hasOwnProperty.call(block, 'best_medium')).toBe(false);
    }
  });
});

// ── 4. Empty core_message → throw ────────────────────────────────────────────

describe('validation — throws on empty required fields', () => {
  it('throws when core_message is empty string', () => {
    expect(() =>
      buildVideoExecutionBrief(
        makeInput({ strategy_brief: makeStrategyBrief({ core_message: '' }) }),
      ),
    ).toThrow('core_message');
  });

  it('throws when core_message is whitespace only', () => {
    expect(() =>
      buildVideoExecutionBrief(
        makeInput({ strategy_brief: makeStrategyBrief({ core_message: '   ' }) }),
      ),
    ).toThrow('core_message');
  });

  it('throws when title is empty', () => {
    expect(() => buildVideoExecutionBrief(makeInput({ title: '' }))).toThrow('title');
  });

  it('throws when voice_matched_script.full_script is empty', () => {
    expect(() =>
      buildVideoExecutionBrief(
        makeInput({ voice_matched_script: makeVoiceScript('') }),
      ),
    ).toThrow('full_script');
  });

  it('throws when logic_blocks is empty array', () => {
    expect(() =>
      buildVideoExecutionBrief(
        makeInput({ strategy_brief: makeStrategyBrief({ logic_blocks: [] }) }),
      ),
    ).toThrow('logic_blocks');
  });
});

// ── 5. covered_stages are English values ─────────────────────────────────────

describe('covered_stages', () => {
  it('passes through English covered_stages from consumer_desire_coverage', () => {
    const result = buildVideoExecutionBrief(makeInput());
    expect(result.strategy.covered_stages).toEqual(['phenomenon', 'desire', 'plan']);
  });
});

// ── 6. mapStagesToEn helper ───────────────────────────────────────────────────

describe('mapStagesToEn', () => {
  it('maps all Korean stages to English', () => {
    expect(mapStagesToEn(['현상', '욕구', '계획', '행동', '보상'])).toEqual([
      'phenomenon',
      'desire',
      'plan',
      'action',
      'reward',
    ]);
  });

  it('handles subset of stages', () => {
    expect(mapStagesToEn(['욕구', '계획'])).toEqual(['desire', 'plan']);
  });
});

// ── 7. Source pack ids and asset_requests pass-through ────────────────────────

describe('source_materials and asset_requests', () => {
  it('includes pack ids when provided', () => {
    const result = buildVideoExecutionBrief(
      makeInput({
        source_pack_ids: {
          market_research_pack_id: 'mrp-1',
          voc_pack_id: 'voc-1',
        },
        used_insights: { script: ['insight-a'] },
      }),
    );
    expect(result.source_materials.market_research_pack_id).toBe('mrp-1');
    expect(result.source_materials.voc_pack_id).toBe('voc-1');
    expect(result.source_materials.used_insights.script).toEqual(['insight-a']);
  });

  it('passes asset_requests through', () => {
    const result = buildVideoExecutionBrief(
      makeInput({
        asset_requests: [
          { need: '얼굴 영상', preferred_asset_type: 'face_video', reason: '신뢰감' },
        ],
      }),
    );
    expect(result.asset_requests).toHaveLength(1);
    expect(result.asset_requests![0].preferred_asset_type).toBe('face_video');
  });

  it('omits asset_requests key when none provided', () => {
    const result = buildVideoExecutionBrief(makeInput());
    expect(Object.prototype.hasOwnProperty.call(result, 'asset_requests')).toBe(false);
  });
});

// ── 8. constraints defaults ───────────────────────────────────────────────────

describe('constraints', () => {
  it('defaults format to youtube_16_9', () => {
    const result = buildVideoExecutionBrief(makeInput());
    expect(result.constraints.format).toBe('youtube_16_9');
  });

  it('respects caller-supplied format and tone', () => {
    const result = buildVideoExecutionBrief(
      makeInput({
        constraints: { format: 'shorts_9_16', tone: '짧고 강렬하게' },
      }),
    );
    expect(result.constraints.format).toBe('shorts_9_16');
    expect(result.constraints.tone).toBe('짧고 강렬하게');
  });

  it('falls back to strategy_brief.script_tone_direction when no tone override', () => {
    const result = buildVideoExecutionBrief(makeInput());
    expect(result.constraints.tone).toBe('친근하고 명확하게');
  });
});
