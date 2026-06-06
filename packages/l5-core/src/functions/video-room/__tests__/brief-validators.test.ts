import { validateVideoExecutionBrief } from '../brief-validators';

// Minimal valid brief factory — all required fields present, no forbidden fields.
function validBrief(): Record<string, unknown> {
  return {
    schema_version: 'cmo_to_factory_v2',
    content_card_id: 'card_001',
    content_type: 'key',
    title: '카페 매출 구조의 비밀',
    target_viewer: {
      who: '개인 카페 운영자',
      knowledge_level: 'beginner',
      pain: '광고비는 많이 쓰는데 단골이 안 늘어남',
      desired_reaction: '구조적으로 정리해야겠다는 느낌',
    },
    strategy: {
      core_message: '카페 매출은 광고가 아니라 고객 구조로 결정된다',
      covered_stages: ['phenomenon', 'desire'],
      role_in_content_set: '키 콘텐츠: 구조 파악',
    },
    script: {
      full_script: '안녕하세요. 오늘은 카페 매출 구조에 대해 이야기합니다.',
      intro_30s: '카페 사장님들이 놓치는 것은 무엇일까요?',
      logic_blocks: [
        {
          block_id: 'block_1',
          role: '문제 제기',
          speaker_text: '광고비는 많이 쓰는데...',
          communication_goal: '현재 상황의 모순을 명확히 한다',
          viewer_reaction_target: '내 상황이 맞다고 느낀다',
        },
      ],
    },
    source_materials: {
      used_insights: {},
    },
    constraints: {
      tone: '차분하지만 확신 있는 설명',
      format: 'youtube_16_9',
    },
  };
}

// Case 1: valid brief → valid: true, no errors
test('valid brief returns valid=true with no errors', () => {
  const result = validateVideoExecutionBrief(validBrief());
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
});

// Case 2: missing strategy.core_message → invalid
test('missing core_message returns invalid with descriptive error', () => {
  const brief = validBrief();
  const strategy = brief['strategy'] as Record<string, unknown>;
  delete strategy['core_message'];

  const result = validateVideoExecutionBrief(brief);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes('core_message'))).toBe(true);
});

// Case 3: missing target_viewer.who → invalid
test('missing target_viewer.who returns invalid', () => {
  const brief = validBrief();
  const tv = brief['target_viewer'] as Record<string, unknown>;
  delete tv['who'];

  const result = validateVideoExecutionBrief(brief);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes('target_viewer.who'))).toBe(true);
});

// Case 4: logic_block contains scene_type → invalid (Factory PRD 테스트2)
test('logic_block with scene_type returns invalid with forbidden field error', () => {
  const brief = validBrief();
  const script = brief['script'] as Record<string, unknown>;
  const blocks = script['logic_blocks'] as Record<string, unknown>[];
  blocks[0]['scene_type'] = 'face_video';

  const result = validateVideoExecutionBrief(brief);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes('scene_type'))).toBe(true);
});

// Case 5: brief top-level contains timeline → invalid (Factory PRD §12.1)
test('brief with timeline field returns invalid with forbidden field error', () => {
  const brief = validBrief();
  (brief as Record<string, unknown>)['timeline'] = [];

  const result = validateVideoExecutionBrief(brief);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes('timeline'))).toBe(true);
});

// Case 6: brief contains duration at top level → invalid (Factory PRD 테스트6)
test('brief with duration field returns invalid with forbidden field error', () => {
  const brief = validBrief();
  (brief as Record<string, unknown>)['duration'] = 180;

  const result = validateVideoExecutionBrief(brief);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes('duration'))).toBe(true);
});

// Case 7: logic_block missing communication_goal → invalid
test('logic_block missing communication_goal returns invalid', () => {
  const brief = validBrief();
  const script = brief['script'] as Record<string, unknown>;
  const blocks = script['logic_blocks'] as Record<string, unknown>[];
  delete blocks[0]['communication_goal'];

  const result = validateVideoExecutionBrief(brief);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes('communication_goal'))).toBe(true);
});

// Case 8: logic_block missing viewer_reaction_target → invalid
test('logic_block missing viewer_reaction_target returns invalid', () => {
  const brief = validBrief();
  const script = brief['script'] as Record<string, unknown>;
  const blocks = script['logic_blocks'] as Record<string, unknown>[];
  delete blocks[0]['viewer_reaction_target'];

  const result = validateVideoExecutionBrief(brief);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes('viewer_reaction_target'))).toBe(true);
});

// Case 9: bestMedium (camelCase variant) in logic_block → invalid
test('logic_block with bestMedium (camelCase) returns invalid', () => {
  const brief = validBrief();
  const script = brief['script'] as Record<string, unknown>;
  const blocks = script['logic_blocks'] as Record<string, unknown>[];
  blocks[0]['bestMedium'] = 'screen_work';

  const result = validateVideoExecutionBrief(brief);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes('bestMedium'))).toBe(true);
});

// Case 10: non-object input → invalid
test('non-object input returns invalid', () => {
  const result = validateVideoExecutionBrief('not an object');
  expect(result.valid).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
});
