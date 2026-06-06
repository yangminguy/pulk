import { buildCmoVideoStrategyBrief, evaluateStrategyGate, StrategyBriefInput } from '../strategy-brief';
import { ScriptMaterialPack, AudienceFitReport } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makePack(overrides: Partial<ScriptMaterialPack> = {}): ScriptMaterialPack {
  return {
    topic: '카페 매출 구조',
    target_viewer: '개인 카페 운영자',
    core_message_candidates: ['매출은 광고가 아니라 고객 구조로 결정된다', '단골 구조가 핵심이다'],
    viewer_language: ['왜 단골이 안 생기지?', '광고비만 나가고...'],
    pain_scenes: ['월 광고비 100만원인데 재방문율 5%', '손님은 오는데 단골이 안 된다'],
    desire_scenes: ['단골이 알아서 오는 카페', '광고 없이도 매출이 나오는 구조'],
    proof_points: ['단골 비율 30% 이상인 카페의 공통점', '재방문 유도 설계 사례'],
    examples: ['A 카페: 3개월 만에 단골 비율 40% 달성', 'B 카페: 이벤트 없이 재방문율 2배'],
    counterarguments: ['우리 동네는 유동인구가 적어서 안 된다', '카페는 원래 단골이 없다'],
    metaphors: ['단골은 씨앗처럼 심는 것이다'],
    story_candidates: ['처음에 포기하려 했던 사장님이 3개월 후 매출 2배'],
    must_use_lines: ['지금 당장 할 수 있는 단 하나의 변화'],
    must_avoid_lines: ['무조건 성공한다', '쉽게 돈 번다'],
    safe_claims: ['평균 재방문율은 설계로 높일 수 있다'],
    cta_materials: ['영상 저장하고 내일 바로 적용해보세요'],
    ...overrides,
  };
}

function makeFit(overrides: Partial<AudienceFitReport> = {}): AudienceFitReport {
  return {
    overall_score: 85,
    pain_fit: 88,
    desire_fit: 82,
    language_fit: 79,
    curiosity_fit: 80,
    trust_fit: 75,
    action_fit: 70,
    what_target_wants_to_hear: ['광고 없이도 매출을 만들 수 있다'],
    what_target_does_not_want_to_hear: ['그냥 더 열심히 해라'],
    must_answer_questions: ['어떻게 단골을 만드나요?'],
    recommended_angle: '구조 설계를 통한 단골 확보 전략',
    ...overrides,
  };
}

function makeInput(overrides: Partial<StrategyBriefInput> = {}): StrategyBriefInput {
  return {
    content_id: 'content_001',
    content_type: 'key',
    channel_context: {
      current_position: '스타트업 마케팅 채널',
      content_pillar: '소규모 사업 매출 구조',
      role_in_content_set: '키 콘텐츠: 구조 파악',
      bridge_from_previous_content: '이전 풀링 콘텐츠에서 문제를 인식했다',
      bridge_to_next_content: '다음 영상에서 실행 체크리스트를 다룬다',
    },
    script_material_pack: makePack(),
    audience_fit_report: makeFit(),
    ...overrides,
  };
}

// ── Case 1: 정상 brief 생성 — logic_blocks 3개 이상 ─────────────────────────

test('case1: 정상 입력으로 logic_blocks 3개 이상인 brief 반환', () => {
  const brief = buildCmoVideoStrategyBrief(makeInput());
  expect(brief.logic_blocks.length).toBeGreaterThanOrEqual(3);
  expect(brief.content_id).toBe('content_001');
  expect(brief.content_type).toBe('key');
  expect(brief.topic).toBe('카페 매출 구조');
  expect(brief.core_message).toBeTruthy();
  expect(brief.cta).toBeTruthy();
  expect(brief.intro_direction).toBeTruthy();
  expect(brief.thumbnail_direction).toBeTruthy();
  expect(brief.risk_notes.length).toBeGreaterThan(0);
});

// ── Case 2: ScriptMaterialPack null → throw ──────────────────────────────

test('case2: script_material_pack null이면 throw 조사/재료표 선행 필요', () => {
  expect(() =>
    buildCmoVideoStrategyBrief(makeInput({ script_material_pack: null })),
  ).toThrow('조사/재료표 선행 필요');
});

// ── Case 3: ScriptMaterialPack undefined → throw ─────────────────────────

test('case3: script_material_pack undefined이면 throw 조사/재료표 선행 필요', () => {
  expect(() =>
    buildCmoVideoStrategyBrief(makeInput({ script_material_pack: undefined })),
  ).toThrow('조사/재료표 선행 필요');
});

// ── Case 4: ScriptMaterialPack 빈 배열들 → throw ─────────────────────────

test('case4: script_material_pack 모든 배열이 비면 throw 조사/재료표 선행 필요', () => {
  const emptyPack: ScriptMaterialPack = {
    topic: '카페',
    target_viewer: '운영자',
    core_message_candidates: [],
    viewer_language: [],
    pain_scenes: [],
    desire_scenes: [],
    proof_points: [],
    examples: [],
    counterarguments: [],
    metaphors: [],
    story_candidates: [],
    must_use_lines: [],
    must_avoid_lines: [],
    safe_claims: [],
    cta_materials: [],
  };
  expect(() =>
    buildCmoVideoStrategyBrief(makeInput({ script_material_pack: emptyPack })),
  ).toThrow('조사/재료표 선행 필요');
});

// ── Case 5: Gate3 통과 — 정상 brief ─────────────────────────────────────

test('case5: 정상 brief는 Gate3 통과', () => {
  const brief = buildCmoVideoStrategyBrief(makeInput());
  const gate = evaluateStrategyGate(brief);
  expect(gate.passed).toBe(true);
  expect(gate.reasons).toHaveLength(0);
});

// ── Case 6: Gate3 실패 — logic_blocks 2개 ───────────────────────────────

test('case6: logic_blocks 2개면 Gate3 실패', () => {
  const brief = buildCmoVideoStrategyBrief(makeInput());
  // Force only 2 blocks
  const truncated = { ...brief, logic_blocks: brief.logic_blocks.slice(0, 2) };
  const gate = evaluateStrategyGate(truncated);
  expect(gate.passed).toBe(false);
  expect(gate.reasons.some((r) => r.includes('logic_blocks'))).toBe(true);
});

// ── Case 7: covered_stages 자유 배정 확인 ────────────────────────────────

test('case7: covered_stages가 고정 배정 없이 각 block에 자유롭게 설정됨', () => {
  const brief = buildCmoVideoStrategyBrief(makeInput());

  // Each block should have at least one covered_stage
  for (const block of brief.logic_blocks) {
    expect(Array.isArray(block.covered_stages)).toBe(true);
    expect(block.covered_stages.length).toBeGreaterThan(0);
  }

  // Blocks may share stages — no forced 1:1 mapping
  const allStages = brief.logic_blocks.flatMap((b) => b.covered_stages);
  const uniqueStages = new Set(allStages);
  // At least 2 distinct stages across blocks (not all the same single stage)
  expect(uniqueStages.size).toBeGreaterThanOrEqual(2);

  // consumer_desire_coverage.covered_stages matches union of block stages
  const coverageStages = new Set(brief.consumer_desire_coverage.covered_stages);
  for (const stage of uniqueStages) {
    expect(coverageStages.has(stage)).toBe(true);
  }
});

// ── Case 8: Gate3 실패 — main_claim 없는 block ───────────────────────────

test('case8: block에 main_claim 없으면 Gate3 실패', () => {
  const brief = buildCmoVideoStrategyBrief(makeInput());
  const badBlock = { ...brief.logic_blocks[0], main_claim: '' };
  const modified = { ...brief, logic_blocks: [badBlock, ...brief.logic_blocks.slice(1)] };
  const gate = evaluateStrategyGate(modified);
  expect(gate.passed).toBe(false);
  expect(gate.reasons.some((r) => r.includes('main_claim'))).toBe(true);
});
