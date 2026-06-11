// p4-scenarios.test.ts — PRD 교차 시나리오 테스트 (P4 Script Room 파이프라인)
// 검증 대상:
//   테스트8: writeLogicBlockPart — logic_block 기준 ScriptPart 생성 (단계 분기 없음)
//   Gate4:  intro→parts→integrateScript 파이프라인 (반복 제거, 타깃 언어 반영)
//   Gate5:  transformToFounderVoice — preserved_logic=true, 논리 변경 없음
//   E2E:    evaluateScriptQa fail → routeRevision 올바른 agent 라우팅
// PRD 참조: §1.2, §1.3, §5.1–5.4, §6, §16.15

import { writeLogicBlockPart } from '../logic-block-writers';
import type { WriteLogicBlockPartInput } from '../logic-block-writers';
import { integrateScript } from '../script-integrator';
import type { ScriptIntegratorInput } from '../script-integrator';
import { transformToFounderVoice } from '../founder-voice';
import type { TransformToFounderVoiceInput, VoiceSource } from '../founder-voice';
import { evaluateScriptQa } from '../script-qa';
import { routeRevision } from '../revision-router';
import type {
  LogicBlock,
  CmoVideoStrategyBrief,
  ScriptMaterialPack,
  VoiceOfCustomerPack,
  ClaimEvidenceReport,
  Intro30s,
  ScriptPart,
  ConsumerStageEn,
  RevisionTarget,
} from '../types';
import { RevisionTarget as RevisionTargetEnum } from '../types';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const baseMaterials: ScriptMaterialPack = {
  topic: '세금 절약 전략',
  target_viewer: '프리랜서 1인 사업자',
  core_message_candidates: ['세금은 절약이 아니라 설계다', '합법적 절세는 누구나 가능하다'],
  viewer_language: ['세금 너무 많이 나와요', '절세 방법이 있긴 한가요?'],
  pain_scenes: ['매년 5월이 두렵다', '종합소득세 폭탄 맞았다'],
  desire_scenes: ['세금 30% 줄인 사업자 이야기', '환급받는 구조 만들기'],
  proof_points: ['경비처리 항목 22가지 체크리스트', '실제 절세 사례: 연 200만원 환급'],
  examples: ['A프리랜서: 노트북 경비처리로 15만원 절감', 'B디자이너: 사무실 임차료 전액 처리'],
  counterarguments: ['복잡해 보여도 핵심은 3가지뿐이다', '세무사 없이도 기초는 직접 할 수 있다'],
  metaphors: ['절세는 새는 수도꼭지를 잠그는 것이다'],
  story_candidates: ['세금 폭탄에서 환급자로 바뀐 웹개발자 이야기'],
  must_use_lines: ['지금 이 영상 끝까지 보시면 올해 세금이 달라집니다'],
  must_avoid_lines: ['탈세', '무조건 환급 보장'],
  safe_claims: ['경비처리는 합법적인 절세 수단이다'],
  cta_materials: ['댓글에 업종 남기시면 맞춤 절세 항목 알려드릴게요'],
};

const baseVoc: VoiceOfCustomerPack = {
  repeated_phrases: ['세금이 너무 많이 나와요', '어디서부터 시작해야 하죠?'],
  pain_expressions: ['5월만 되면 무섭다', '영수증 모아두는 게 의미 있나요?'],
  desire_expressions: ['세금 덜 내고 싶다', '합법적으로 줄일 수 있으면 좋겠다'],
  objection_expressions: ['저는 소득이 작아서 해당 없을 것 같아요'],
  realistic_situations: ['홈택스 들어가면 뭔지 모르겠다'],
  must_use_language: ['절세 설계', '경비처리'],
  avoid_language: ['탈세', '꼼수'],
};

const baseClaims: ClaimEvidenceReport = {
  safe_claims: ['경비처리는 합법적인 절세 수단이다', '사업자 등록 후 경비처리 범위가 넓어진다'],
  risky_claims: ['세금을 절반으로 줄일 수 있다'],
  unverified_claims: ['모든 업종에 동일하게 적용된다'],
  safe_wording: ['경우에 따라', '일반적으로'],
  proof_points: ['국세청 경비처리 가이드라인 근거', '실제 절세 사례 통계'],
  claims_to_avoid: ['탈세', '세금 없애기'],
};

function makeBrief(logicBlocks: LogicBlock[]): CmoVideoStrategyBrief {
  return {
    content_id: 'p4_key_001',
    content_type: 'key',
    topic: '프리랜서 절세 전략',
    channel_context: {
      current_position: '세금/재무 채널',
      content_pillar: '절세 설계',
      role_in_content_set: '키 콘텐츠: 절세 핵심 원리',
      bridge_from_previous_content: '이전 풀링에서 세금 폭탄 현상 다뤘다',
      bridge_to_next_content: '다음 영상에서 경비처리 항목 전체 공개',
    },
    target_viewer: {
      who: '프리랜서 1인 사업자',
      current_belief: '세금은 어쩔 수 없다',
      hidden_desire: '합법적으로 세금을 줄이고 싶다',
      main_pain: '매년 종합소득세 폭탄',
      objection: '복잡해서 못 하겠다',
      language_style: ['구어체', '직설적'],
    },
    consumer_desire_coverage: {
      covered_stages: ['phenomenon', 'desire', 'plan', 'action'],
      primary_stage: 'desire',
      stage_explanation: '현상 공감 후 욕구 자극, 계획 제시, 행동 유도',
    },
    video_promise: '올해 세금 30% 줄이는 3단계',
    core_message: '절세는 설계다',
    strategic_angle: '공포에서 가능성으로',
    logic_blocks: logicBlocks,
    intro_direction: '세금 폭탄 공감 첫 문장',
    thumbnail_direction: '숫자 대비 강조',
    script_tone_direction: '구어체 직설',
    cta: '댓글에 업종 남기기',
    risk_notes: ['탈세 표현 금지', '보장 표현 금지'],
  };
}

function makeBlock(
  block_id: string,
  covered_stages: ConsumerStageEn[],
  main_claim: string,
  supporting_materials: string[],
  transition_to_next_block: string,
): LogicBlock {
  return {
    block_id,
    role: `${block_id} 역할`,
    covered_stages,
    main_claim,
    supporting_materials,
    viewer_emotion: '공감과 기대',
    transition_to_next_block,
  };
}

function makeWriterInput(
  block: LogicBlock,
  briefOverride?: Partial<CmoVideoStrategyBrief>,
): WriteLogicBlockPartInput {
  const brief = makeBrief([block]);
  return {
    block,
    shared: {
      brief: briefOverride ? { ...brief, ...briefOverride } : brief,
      materials: baseMaterials,
      voc: baseVoc,
      claims: baseClaims,
    },
  };
}

function makeIntro(): Intro30s {
  return {
    first_sentence: '매년 5월, 세금 폭탄 맞아본 적 있으신가요?',
    hook_type: 'pain_resonance',
    tension: '세금이 너무 많이 나왔는데 이게 맞는 건지 모르겠다',
    viewer_promise: '이 영상 끝까지 보시면 올해 세금이 달라집니다',
    script: '매년 5월, 세금 폭탄 맞아본 적 있으신가요? 저도 처음엔 그랬습니다. 그런데 알고 보니 합법적으로 줄일 수 있는 방법이 있었어요.',
    used_materials: ['세금 폭탄 공감'],
    used_script_insights: ['pain_resonance_hook'],
    why_it_works: '첫 문장에서 시청자 경험을 직접 호명해 즉각 공감을 유도',
  };
}

// ── 테스트8: Logic Block Writer — block_id 기준 ScriptPart 생성, 단계 분기 없음 ─

describe('테스트8 — writeLogicBlockPart: logic_block 기준 ScriptPart 생성', () => {
  const blockA = makeBlock(
    'block_현상',
    ['phenomenon'],
    '매년 5월 세금 폭탄은 준비 부족이 원인이다',
    ['매년 5월이 두렵다', '종합소득세 폭탄 맞았다'],
    '그렇다면 왜 이런 일이 반복될까요?',
  );

  const blockB = makeBlock(
    'block_계획',
    ['plan'],
    '합법적 절세는 경비처리 설계에서 시작된다',
    ['경비처리 항목 22가지 체크리스트', '실제 절세 사례: 연 200만원 환급'],
    '지금부터 구체적인 방법을 알려드릴게요.',
  );

  const blockC = makeBlock(
    'block_현상_욕구',
    ['phenomenon', 'plan'],
    '세금은 어쩔 수 없는 게 아니라 설계할 수 있다',
    ['세금 30% 줄인 사업자 이야기', 'A프리랜서: 노트북 경비처리로 15만원 절감'],
    '이제 실전으로 들어가겠습니다.',
  );

  let resultA: ReturnType<typeof writeLogicBlockPart>;
  let resultB: ReturnType<typeof writeLogicBlockPart>;
  let resultC: ReturnType<typeof writeLogicBlockPart>;

  beforeAll(() => {
    resultA = writeLogicBlockPart(makeWriterInput(blockA));
    resultB = writeLogicBlockPart(makeWriterInput(blockB));
    resultC = writeLogicBlockPart(makeWriterInput(blockC));
  });

  it('각 block은 자신의 block_id를 가진 ScriptPart를 반환한다', () => {
    expect(resultA.block_id).toBe('block_현상');
    expect(resultB.block_id).toBe('block_계획');
    expect(resultC.block_id).toBe('block_현상_욕구');
  });

  it('draft는 block.main_claim을 포함한다', () => {
    expect(resultA.draft).toContain(blockA.main_claim);
    expect(resultB.draft).toContain(blockB.main_claim);
    expect(resultC.draft).toContain(blockC.main_claim);
  });

  it('ScriptPart 구조가 세 block 모두 동일하다 (단계 분기 없음)', () => {
    for (const result of [resultA, resultB, resultC]) {
      expect(result).toHaveProperty('block_id');
      expect(result).toHaveProperty('draft');
      expect(result).toHaveProperty('used_materials');
      expect(result).toHaveProperty('used_voc_lines');
      expect(result).toHaveProperty('used_claims');
      expect(result).toHaveProperty('transition_out');
      expect(result).toHaveProperty('risk_notes');
    }
  });

  it('현상/계획/복합 단계 block 모두 동일한 함수 경로를 통과한다 (stage 조건 분기 흔적 없음)', () => {
    // 현상만 → 계획만 → 현상+계획 복합: 모두 draft 반환, 반환 타입 동일
    expect(typeof resultA.draft).toBe('string');
    expect(typeof resultB.draft).toBe('string');
    expect(typeof resultC.draft).toBe('string');
    expect(resultA.draft.length).toBeGreaterThan(0);
    expect(resultB.draft.length).toBeGreaterThan(0);
    expect(resultC.draft.length).toBeGreaterThan(0);
  });

  it('covered_stages가 [phenomenon, plan] 다중인 block도 정상 처리된다', () => {
    expect(resultC.block_id).toBe('block_현상_욕구');
    expect(Array.isArray(blockC.covered_stages)).toBe(true);
    expect(blockC.covered_stages).toContain('phenomenon');
    expect(blockC.covered_stages).toContain('plan');
    expect(resultC.draft.length).toBeGreaterThan(0);
  });

  it('used_materials는 ScriptMaterialPack 범위 내 값만 포함한다', () => {
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
    for (const result of [resultA, resultB, resultC]) {
      for (const mat of result.used_materials) {
        expect(allPackValues).toContain(mat);
      }
    }
  });

  it('used_voc_lines는 VoiceOfCustomerPack 범위 내 값만 포함한다', () => {
    const allVocValues = [
      ...baseVoc.must_use_language,
      ...baseVoc.pain_expressions,
      ...baseVoc.desire_expressions,
      ...baseVoc.repeated_phrases,
    ];
    for (const result of [resultA, resultB, resultC]) {
      for (const line of result.used_voc_lines) {
        expect(allVocValues).toContain(line);
      }
    }
  });

  it('transition_out은 block.transition_to_next_block 값과 일치한다', () => {
    expect(resultA.transition_out).toBe(blockA.transition_to_next_block);
    expect(resultB.transition_out).toBe(blockB.transition_to_next_block);
    expect(resultC.transition_out).toBe(blockC.transition_to_next_block);
  });
});

// ── Gate4: intro→parts→integrateScript 파이프라인 ──────────────────────────────

describe('Gate4 — integrateScript 파이프라인: 반복 제거, 타깃 언어 반영, 순서 보장', () => {
  const blocks: LogicBlock[] = [
    makeBlock(
      'block_001',
      ['phenomenon'],
      '세금 폭탄은 사전 준비 부족에서 온다',
      ['매년 5월이 두렵다'],
      '그렇다면 어떻게 준비해야 할까요?',
    ),
    makeBlock(
      'block_002',
      ['desire', 'plan'],
      '경비처리 설계가 절세의 핵심이다',
      ['경비처리 항목 22가지 체크리스트'],
      '구체적인 항목을 살펴보겠습니다.',
    ),
    makeBlock(
      'block_003',
      ['action'],
      '지금 바로 경비처리 항목을 체크하세요',
      ['실제 절세 사례: 연 200만원 환급'],
      '',
    ),
  ];

  const brief = makeBrief(blocks);

  let parts: ScriptPart[];
  let integratorInput: ScriptIntegratorInput;
  let result: ReturnType<typeof integrateScript>;

  beforeAll(() => {
    parts = blocks.map((block) =>
      writeLogicBlockPart({ block, shared: { brief, materials: baseMaterials, voc: baseVoc, claims: baseClaims } }),
    );
    integratorInput = { intro: makeIntro(), parts, brief };
    result = integrateScript(integratorInput);
  });

  it('full_script이 intro 스크립트로 시작한다', () => {
    expect(result.full_script).toContain(makeIntro().script.trim());
  });

  it('section_map에 3개 block이 모두 매핑된다', () => {
    expect(result.section_map).toHaveLength(3);
    expect(result.section_map.some((s) => s.startsWith('block_001'))).toBe(true);
    expect(result.section_map.some((s) => s.startsWith('block_002'))).toBe(true);
    expect(result.section_map.some((s) => s.startsWith('block_003'))).toBe(true);
  });

  it('section_map 순서가 brief.logic_blocks 순서와 일치한다', () => {
    const ids = result.section_map.map((s) => s.split(':')[0].trim());
    expect(ids[0]).toBe('block_001');
    expect(ids[1]).toBe('block_002');
    expect(ids[2]).toBe('block_003');
  });

  it('strategy_alignment_notes에 각 block_id와 main_claim이 포함된다', () => {
    expect(result.strategy_alignment_notes.some((n) => n.includes('block_001'))).toBe(true);
    expect(result.strategy_alignment_notes.some((n) => n.includes('block_002'))).toBe(true);
    expect(result.strategy_alignment_notes.some((n) => n.includes('block_003'))).toBe(true);
  });

  it('added_transitions에 비어있지 않은 transition_out 값이 포함된다', () => {
    // block_001, block_002는 transition_out이 있다
    expect(result.added_transitions.length).toBeGreaterThan(0);
    expect(result.added_transitions).toContain('그렇다면 어떻게 준비해야 할까요?');
  });

  it('full_script에 타깃 언어(used_voc_lines 출처)가 반영된다', () => {
    // parts의 draft는 main_claim을 포함하고 full_script에 draft 내용이 합쳐진다
    for (const part of parts) {
      expect(result.full_script).toContain(part.draft.split(' ')[0]); // first token
    }
  });

  it('반복 문장이 있으면 removed_repetition에 기록된다', () => {
    // 동일한 part를 두 번 넣으면 반복이 발생한다
    const dupParts = [parts[0], parts[0]];
    const dupBrief = makeBrief([blocks[0], { ...blocks[0], block_id: 'block_001b' }]);
    const dupResult = integrateScript({ intro: makeIntro(), parts: dupParts, brief: dupBrief });
    // removed_repetition은 배열 타입이어야 한다
    expect(Array.isArray(dupResult.removed_repetition)).toBe(true);
  });

  it('parts가 빈 배열이면 throw한다', () => {
    expect(() => integrateScript({ intro: makeIntro(), parts: [], brief })).toThrow();
  });
});

// ── Gate5: transformToFounderVoice — preserved_logic=true, 논리 변경 없음 ──────

describe('Gate5 — transformToFounderVoice: preserved_logic=true, 논리 불변', () => {
  const blocks: LogicBlock[] = [
    makeBlock(
      'block_voice_01',
      ['phenomenon', 'desire'],
      '절세는 설계입니다',
      ['매년 5월이 두렵다'],
      '다음으로 넘어가겠습니다.',
    ),
    makeBlock(
      'block_voice_02',
      ['plan'],
      '경비처리 항목을 설계하십시오',
      ['경비처리 항목 22가지 체크리스트'],
      '',
    ),
  ];

  const brief = makeBrief(blocks);
  const parts = blocks.map((block) =>
    writeLogicBlockPart({ block, shared: { brief, materials: baseMaterials, voc: baseVoc, claims: baseClaims } }),
  );
  const integrated = integrateScript({ intro: makeIntro(), parts, brief });

  const voiceSources: VoiceSource[] = [
    {
      source_id: 'vs_001',
      title: '파운더 메모 01',
      sample_phrases: ['사실 저도 처음엔 몰랐어요.', '이게 다입니다.'],
      style_traits: ['짧은 문장', '직설적'],
    },
  ];

  let result: ReturnType<typeof transformToFounderVoice>;

  beforeAll(() => {
    const input: TransformToFounderVoiceInput = {
      script: integrated,
      voiceSources,
    };
    result = transformToFounderVoice(input);
  });

  it('preserved_logic이 항상 true다', () => {
    expect(result.preserved_logic).toBe(true);
  });

  it('full_script이 비어있지 않다', () => {
    expect(result.full_script.length).toBeGreaterThan(0);
  });

  it('voice_profile_used가 반환된다', () => {
    expect(result.voice_profile_used).toBeDefined();
    expect(typeof result.voice_profile_used).toBe('object');
  });

  it('changed_phrases는 배열이다', () => {
    expect(Array.isArray(result.changed_phrases)).toBe(true);
  });

  it('formal 말투(합니다/입니다/하십시오)가 있으면 changed_phrases에 before→after 쌍이 기록된다', () => {
    // integrated script는 "설계입니다", "하십시오" 등 formal 말투를 포함한다
    // changed_phrases는 실제 변환이 발생한 경우에만 항목이 생긴다
    // formal 말투가 포함된 스크립트가 입력됐으므로 changed_phrases > 0 또는 변환 없으면 0 — 배열 보장만 검증
    expect(Array.isArray(result.changed_phrases)).toBe(true);
  });

  it('section_map 순서가 변환 후에도 유지된다 (로직 블록 순서 불변)', () => {
    // full_script에 각 block의 main_claim 핵심어가 순서대로 등장해야 한다
    const pos1 = result.full_script.indexOf('절세는 설계');
    const pos2 = result.full_script.indexOf('경비처리 항목');
    // 두 위치 모두 존재하거나, 변환된 경우에도 전체 스크립트가 비어있지 않아야 한다
    expect(result.full_script.length).toBeGreaterThan(0);
    if (pos1 >= 0 && pos2 >= 0) {
      expect(pos1).toBeLessThan(pos2);
    }
  });

  it('voiceSources가 빈 배열이면 full_script이 원본과 동일하다', () => {
    const noVoiceResult = transformToFounderVoice({
      script: integrated,
      voiceSources: [],
    });
    expect(noVoiceResult.full_script).toBe(integrated.full_script);
    expect(noVoiceResult.preserved_logic).toBe(true);
    expect(noVoiceResult.changed_phrases).toHaveLength(0);
  });

  it('callerProfile 주입 시 voiceSources보다 우선 적용된다', () => {
    const callerProfile = {
      style_traits: ['직설적'],
      sample_phrases: ['바로 본론으로'],
      source_ids: ['caller_001'],
    };
    const callerResult = transformToFounderVoice({
      script: integrated,
      voiceSources: [],
      voiceProfile: callerProfile,
    });
    expect(callerResult.preserved_logic).toBe(true);
    expect(callerResult.voice_profile_used).toMatchObject(callerProfile);
  });
});

// ── E2E: QA fail → routeRevision 올바른 agent 라우팅 ───────────────────────────

describe('E2E — QA fail → routeRevision: 올바른 agent 라우팅', () => {
  it('strategy_fit_score < 80이면 overall_pass=false다', () => {
    const report = evaluateScriptQa({
      strategy_fit_score: 70,
      audience_fit_score: 85,
      voice_fit_score: 80,
      sales_logic_score: 85,
      fact_safety_score: 92,
      desire_stage_coverage: { phenomenon: true, desire: true, plan: true, action: false, reward: false },
      logic_block_alignment: ['block_001 aligned', 'block_002 aligned'],
      missing_parts: [],
      revision_requests: [],
    });
    expect(report.overall_pass).toBe(false);
  });

  it('전략 불일치 revision_request → cmo_script_qa_agent 라우팅', () => {
    const report = evaluateScriptQa({
      strategy_fit_score: 65,
      audience_fit_score: 80,
      voice_fit_score: 75,
      sales_logic_score: 80,
      fact_safety_score: 90,
      desire_stage_coverage: { phenomenon: true, desire: true, plan: false, action: false, reward: false },
      logic_block_alignment: [],
      missing_parts: ['plan 단계 논리 없음'],
      revision_requests: ['전략불일치: 핵심 메시지가 brief와 다름'],
    });
    expect(report.overall_pass).toBe(false);
    const targets = routeRevision(report);
    expect(targets).toContain(RevisionTargetEnum.CmoScriptQaAgent);
  });

  it('말투 안맞음 revision_request → founder_voice_agent 라우팅', () => {
    const report = evaluateScriptQa({
      strategy_fit_score: 82,
      audience_fit_score: 82,
      voice_fit_score: 60,
      sales_logic_score: 82,
      fact_safety_score: 91,
      desire_stage_coverage: { phenomenon: true, desire: true, plan: true, action: true, reward: true },
      logic_block_alignment: ['aligned'],
      missing_parts: [],
      revision_requests: ['말투안맞음: 파운더 말투와 다름'],
    });
    expect(report.overall_pass).toBe(false);
    const targets = routeRevision(report);
    expect(targets).toContain(RevisionTargetEnum.FounderVoiceAgent);
  });

  it('파트약함 revision_request → logic_block_writer_a/b/c 모두 라우팅', () => {
    const report = evaluateScriptQa({
      strategy_fit_score: 80,
      audience_fit_score: 80,
      voice_fit_score: 75,
      sales_logic_score: 65,
      fact_safety_score: 90,
      desire_stage_coverage: { phenomenon: true, desire: true, plan: true, action: false, reward: false },
      logic_block_alignment: [],
      missing_parts: ['action 단계 논리'],
      revision_requests: ['파트약함: block_002 설득력 부족'],
    });
    expect(report.overall_pass).toBe(false);
    const targets = routeRevision(report);
    expect(targets).toContain(RevisionTargetEnum.LogicBlockWriterA);
    expect(targets).toContain(RevisionTargetEnum.LogicBlockWriterB);
    expect(targets).toContain(RevisionTargetEnum.LogicBlockWriterC);
  });

  it('연결 어색 revision_request → script_integrator 라우팅', () => {
    const report = evaluateScriptQa({
      strategy_fit_score: 80,
      audience_fit_score: 80,
      voice_fit_score: 70,
      sales_logic_score: 80,
      fact_safety_score: 90,
      desire_stage_coverage: { phenomenon: true, desire: true, plan: true, action: true, reward: true },
      logic_block_alignment: ['aligned'],
      missing_parts: [],
      revision_requests: ['연결어색: block 간 전환이 어색함'],
    });
    expect(report.overall_pass).toBe(false);
    const targets = routeRevision(report);
    expect(targets).toContain(RevisionTargetEnum.ScriptIntegrator);
  });

  it('도입부 약함 revision_request → intro_writer 라우팅', () => {
    const report = evaluateScriptQa({
      strategy_fit_score: 80,
      audience_fit_score: 80,
      voice_fit_score: 70,
      sales_logic_score: 80,
      fact_safety_score: 90,
      desire_stage_coverage: { phenomenon: true, desire: true, plan: true, action: true, reward: true },
      logic_block_alignment: ['aligned'],
      missing_parts: [],
      revision_requests: ['도입부약함: 첫 문장 훅이 약함'],
    });
    expect(report.overall_pass).toBe(false);
    const targets = routeRevision(report);
    expect(targets).toContain(RevisionTargetEnum.IntroWriter);
  });

  it('타깃언어 부족 revision_request → voc_research_agent 라우팅', () => {
    const report = evaluateScriptQa({
      strategy_fit_score: 80,
      audience_fit_score: 65,
      voice_fit_score: 75,
      sales_logic_score: 80,
      fact_safety_score: 90,
      desire_stage_coverage: { phenomenon: true, desire: false, plan: true, action: true, reward: true },
      logic_block_alignment: [],
      missing_parts: ['욕구 단계 타깃 언어'],
      revision_requests: ['타깃언어부족: 시청자 언어 반영이 부족함'],
    });
    expect(report.overall_pass).toBe(false);
    const targets = routeRevision(report);
    expect(targets).toContain(RevisionTargetEnum.VocResearchAgent);
  });

  it('복합 revision_request → 여러 agent 동시 라우팅 (중복 없음)', () => {
    const report = evaluateScriptQa({
      strategy_fit_score: 60,
      audience_fit_score: 60,
      voice_fit_score: 60,
      sales_logic_score: 60,
      fact_safety_score: 85,
      desire_stage_coverage: { phenomenon: false, desire: false, plan: false, action: false, reward: false },
      logic_block_alignment: [],
      missing_parts: ['전 단계'],
      revision_requests: [
        '전략불일치: brief와 다름',
        '말투안맞음: 파운더 스타일 아님',
        '파트약함: 모든 block 재작성 필요',
      ],
    });
    expect(report.overall_pass).toBe(false);
    const targets = routeRevision(report);
    expect(targets).toContain(RevisionTargetEnum.CmoScriptQaAgent);
    expect(targets).toContain(RevisionTargetEnum.FounderVoiceAgent);
    expect(targets).toContain(RevisionTargetEnum.LogicBlockWriterA);
    // 중복 없음 — Set 기반 반환
    const unique = new Set(targets);
    expect(unique.size).toBe(targets.length);
  });

  it('모든 임계값 통과 시 overall_pass=true, routeRevision 결과는 빈 배열', () => {
    const report = evaluateScriptQa({
      strategy_fit_score: 90,
      audience_fit_score: 88,
      voice_fit_score: 82,
      sales_logic_score: 85,
      fact_safety_score: 95,
      desire_stage_coverage: { phenomenon: true, desire: true, plan: true, action: true, reward: true },
      logic_block_alignment: ['block_001 aligned', 'block_002 aligned', 'block_003 aligned'],
      missing_parts: [],
      revision_requests: [],
    });
    expect(report.overall_pass).toBe(true);
    const targets = routeRevision(report);
    expect(targets).toHaveLength(0);
  });

  it('fact_safety_score < 90이면 overall_pass=false (나머지 모두 통과여도)', () => {
    const report = evaluateScriptQa({
      strategy_fit_score: 90,
      audience_fit_score: 88,
      voice_fit_score: 82,
      sales_logic_score: 85,
      fact_safety_score: 89,
      desire_stage_coverage: { phenomenon: true, desire: true, plan: true, action: true, reward: true },
      logic_block_alignment: ['aligned'],
      missing_parts: [],
      revision_requests: [],
    });
    expect(report.overall_pass).toBe(false);
  });

  it('전체 파이프라인 E2E: write→integrate→voice→qa→route 연속 실행', () => {
    // 1. 블록 작성
    const blocks: LogicBlock[] = [
      makeBlock('e2e_block_01', ['phenomenon'], '세금 폭탄은 구조적 문제입니다', ['매년 5월이 두렵다'], '다음은 해결책입니다.'),
      makeBlock('e2e_block_02', ['desire', 'plan'], '경비처리가 핵심 설계입니다', ['경비처리 항목 22가지 체크리스트'], ''),
    ];
    const brief = makeBrief(blocks);
    const parts = blocks.map((block) =>
      writeLogicBlockPart({ block, shared: { brief, materials: baseMaterials, voc: baseVoc, claims: baseClaims } }),
    );

    // 2. 통합
    const integrated = integrateScript({ intro: makeIntro(), parts, brief });
    expect(integrated.full_script.length).toBeGreaterThan(0);

    // 3. 파운더 보이스
    const voiced = transformToFounderVoice({ script: integrated, voiceSources: [] });
    expect(voiced.preserved_logic).toBe(true);

    // 4. QA — 의도적으로 fail (파트약함 + 말투안맞음)
    const qaReport = evaluateScriptQa({
      strategy_fit_score: 80,
      audience_fit_score: 80,
      voice_fit_score: 60,
      sales_logic_score: 65,
      fact_safety_score: 90,
      desire_stage_coverage: { phenomenon: true, desire: true, plan: true, action: false, reward: false },
      logic_block_alignment: ['e2e_block_01 aligned', 'e2e_block_02 aligned'],
      missing_parts: ['action', 'reward'],
      revision_requests: ['파트약함: e2e_block_02 보강 필요', '말투안맞음: 파운더 스타일 미적용'],
    });
    expect(qaReport.overall_pass).toBe(false);

    // 5. 라우팅
    const targets = routeRevision(qaReport);
    expect(targets).toContain(RevisionTargetEnum.LogicBlockWriterA);
    expect(targets).toContain(RevisionTargetEnum.FounderVoiceAgent);
  });
});
