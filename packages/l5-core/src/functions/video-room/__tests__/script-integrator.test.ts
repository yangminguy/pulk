import { integrateScript, ScriptIntegratorInput } from '../script-integrator';
import { Intro30s, ScriptPart, CmoVideoStrategyBrief } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeIntro(overrides: Partial<Intro30s> = {}): Intro30s {
  return {
    first_sentence: '카페 매출, 광고가 아니라 구조가 결정합니다.',
    hook_type: 'problem',
    tension: '광고비는 계속 나가는데 단골은 없다',
    viewer_promise: '단골을 만드는 설계 원리를 알게 됩니다',
    script: '카페 매출, 광고가 아니라 구조가 결정합니다. 이 영상을 보면 단골을 만드는 설계 원리를 알게 됩니다.',
    used_materials: ['pain_scenes', 'viewer_language'],
    used_script_insights: ['원끝_인사이트_001'],
    why_it_works: '시청자가 즉시 공감할 문제를 첫 문장에 배치',
    ...overrides,
  };
}

function makePart(block_id: string, draft: string, transition_out = '', overrides: Partial<ScriptPart> = {}): ScriptPart {
  return {
    block_id,
    draft,
    used_materials: [],
    used_voc_lines: [],
    used_claims: [],
    transition_out,
    risk_notes: [],
    ...overrides,
  };
}

function makeBrief(blockIds: string[]): CmoVideoStrategyBrief {
  return {
    content_id: 'content_001',
    content_type: 'key',
    topic: '카페 단골 구조',
    channel_context: {
      current_position: '소규모 사업 채널',
      content_pillar: '매출 구조',
      role_in_content_set: '키 콘텐츠',
      bridge_from_previous_content: '이전 풀링에서 문제 인식',
      bridge_to_next_content: '다음 영상에서 실행 체크리스트',
    },
    target_viewer: {
      who: '개인 카페 운영자',
      current_belief: '광고가 매출을 결정한다',
      hidden_desire: '광고 없이 단골이 오는 카페',
      main_pain: '광고비는 나가는데 재방문이 없다',
      objection: '우리 동네는 특수하다',
      language_style: ['왜 단골이 안 생기지?'],
    },
    consumer_desire_coverage: {
      covered_stages: ['desire', 'plan', 'action'],
      primary_stage: 'plan',
      stage_explanation: '구조 설계 방법을 알려주는 콘텐츠',
    },
    video_promise: '단골 구조 설계 원리를 이해하게 됩니다',
    core_message: '매출은 광고가 아니라 단골 구조로 결정된다',
    strategic_angle: '구조 설계 관점',
    logic_blocks: blockIds.map((id, i) => ({
      block_id: id,
      role: `블록 ${i + 1}`,
      covered_stages: ['plan'] as const,
      main_claim: `주장 ${i + 1}`,
      supporting_materials: [],
      viewer_emotion: '이해',
      transition_to_next_block: `다음으로 ${id}`,
    })),
    intro_direction: '공감형 훅',
    thumbnail_direction: '숫자 강조',
    script_tone_direction: '대화체',
    cta: '영상 저장',
    risk_notes: [],
  };
}

// ── Case 1: parts are integrated in block_id order from brief ──────────────

test('case 1: parts are ordered by brief logic_blocks sequence', () => {
  const brief = makeBrief(['block_1', 'block_2', 'block_3']);
  // Provide parts out of order.
  const parts = [
    makePart('block_3', '세 번째 블록 내용입니다.', ''),
    makePart('block_1', '첫 번째 블록 내용입니다.', '다음으로 두 번째 블록입니다.'),
    makePart('block_2', '두 번째 블록 내용입니다.', '다음으로 세 번째 블록입니다.'),
  ];
  const result = integrateScript({ intro: makeIntro(), parts, brief });

  const idx1 = result.full_script.indexOf('첫 번째 블록');
  const idx2 = result.full_script.indexOf('두 번째 블록');
  const idx3 = result.full_script.indexOf('세 번째 블록');

  expect(idx1).toBeGreaterThan(-1);
  expect(idx2).toBeGreaterThan(-1);
  expect(idx3).toBeGreaterThan(-1);
  expect(idx1).toBeLessThan(idx2);
  expect(idx2).toBeLessThan(idx3);
});

// ── Case 2: section_map contains block_id to role mapping ─────────────────

test('case 2: section_map entries map each block_id to its role', () => {
  const brief = makeBrief(['block_a', 'block_b']);
  const parts = [
    makePart('block_a', '블록 A 내용.'),
    makePart('block_b', '블록 B 내용.'),
  ];
  const result = integrateScript({ intro: makeIntro(), parts, brief });

  expect(result.section_map).toHaveLength(2);
  expect(result.section_map[0]).toContain('block_a');
  expect(result.section_map[1]).toContain('block_b');
  // Each entry includes the block role from the brief.
  expect(result.section_map[0]).toContain('블록 1');
  expect(result.section_map[1]).toContain('블록 2');
});

// ── Case 3: empty parts throws ─────────────────────────────────────────────

test('case 3: throws when parts array is empty', () => {
  const brief = makeBrief(['block_1']);
  expect(() =>
    integrateScript({ intro: makeIntro(), parts: [], brief }),
  ).toThrow('parts must not be empty');
});

// ── Case 4: intro script is included in full_script ───────────────────────

test('case 4: full_script starts with intro script text', () => {
  const brief = makeBrief(['block_1']);
  const intro = makeIntro({ script: '도입부 텍스트입니다.' });
  const parts = [makePart('block_1', '본문 블록 내용입니다.')];
  const result = integrateScript({ intro, parts, brief });

  expect(result.full_script).toContain('도입부 텍스트입니다.');
  // Intro comes before body.
  const introIdx = result.full_script.indexOf('도입부 텍스트');
  const bodyIdx = result.full_script.indexOf('본문 블록');
  expect(introIdx).toBeLessThan(bodyIdx);
});

// ── Case 5: repeated sentences across parts are recorded ──────────────────

test('case 5: repeated sentences are removed and recorded in removed_repetition', () => {
  const brief = makeBrief(['block_1', 'block_2']);
  const repeated = '단골이 매출을 결정합니다.';
  const parts = [
    makePart('block_1', `첫 번째 고유 내용. ${repeated}`),
    makePart('block_2', `두 번째 고유 내용. ${repeated}`),
  ];
  const result = integrateScript({ intro: makeIntro(), parts, brief });

  // The repeated sentence should appear exactly once in full_script.
  const occurrences = result.full_script.split(repeated).length - 1;
  expect(occurrences).toBe(1);
  expect(result.removed_repetition.length).toBeGreaterThan(0);
  expect(result.removed_repetition.some((r) => r.includes('단골이 매출을'))).toBe(true);
});

// ── Case 6: transitions between blocks are added ──────────────────────────

test('case 6: transition_out values are added between blocks and recorded', () => {
  const brief = makeBrief(['block_1', 'block_2']);
  const transition = '그렇다면 다음으로 넘어가겠습니다.';
  const parts = [
    makePart('block_1', '첫 블록 내용.', transition),
    makePart('block_2', '두 번째 블록 내용.'),
  ];
  const result = integrateScript({ intro: makeIntro(), parts, brief });

  expect(result.full_script).toContain(transition);
  expect(result.added_transitions).toContain(transition);
});

// ── Case 7: strategy_alignment_notes reference brief main_claims ──────────

test('case 7: strategy_alignment_notes include main_claim from brief logic_blocks', () => {
  const brief = makeBrief(['block_x']);
  const parts = [makePart('block_x', '내용입니다.')];
  const result = integrateScript({ intro: makeIntro(), parts, brief });

  expect(result.strategy_alignment_notes).toHaveLength(1);
  expect(result.strategy_alignment_notes[0]).toContain('block_x');
  expect(result.strategy_alignment_notes[0]).toContain('주장 1');
});
