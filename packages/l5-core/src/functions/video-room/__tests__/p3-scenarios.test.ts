// p3-scenarios.test.ts — PRD 교차 시나리오 테스트 (P3 빌더)
// 검증 대상: strategy-brief.ts + content-set-validation.ts
// PRD 참조: §1.2, §1.10, §1.11, §1.12, §4, §8

import {
  buildCmoVideoStrategyBrief,
  StrategyBriefInput,
} from '../strategy-brief';
import { validateContentSet } from '../content-set-validation';
import type {
  ScriptMaterialPack,
  AudienceFitReport,
  ContentSetEntry,
  ConsumerStageEn,
} from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePack(overrides: Partial<ScriptMaterialPack> = {}): ScriptMaterialPack {
  return {
    topic: '스타트업 고객 확보 전략',
    target_viewer: '초기 창업자',
    core_message_candidates: ['고객은 기다리는 게 아니라 설계하는 것이다', '첫 10명이 모든 것을 결정한다'],
    viewer_language: ['고객을 어떻게 찾죠?', '초반에 광고해야 하나요?'],
    pain_scenes: ['6개월째 고객이 없다', '제품은 만들었는데 아무도 안 쓴다'],
    desire_scenes: ['스스로 찾아오는 고객 구조', '입소문만으로 월 매출 1천만원'],
    proof_points: ['초기 10명 확보한 팀의 공통 행동 패턴', 'B2B SaaS 초기 고객 확보 사례'],
    examples: ['A팀: 커뮤니티 DM 50개로 첫 고객 8명 확보', 'B팀: 콘텐츠 3개로 리드 200명 수집'],
    counterarguments: ['우리 제품은 아직 완성이 안 됐다', '광고 없이는 불가능하다'],
    metaphors: ['고객 확보는 낚시가 아니라 농사다'],
    story_candidates: ['MVP도 없이 고객부터 확보한 창업자 이야기'],
    must_use_lines: ['지금 당장 DM 한 통을 보내세요'],
    must_avoid_lines: ['무조건 바이럴된다', '쉽게 고객을 모을 수 있다'],
    safe_claims: ['초기 고객 확보는 아웃바운드로 시작하는 게 빠르다'],
    cta_materials: ['댓글에 업종을 적어주시면 맞춤 전략을 알려드릴게요'],
    ...overrides,
  };
}

function makeFit(overrides: Partial<AudienceFitReport> = {}): AudienceFitReport {
  return {
    overall_score: 82,
    pain_fit: 90,
    desire_fit: 85,
    language_fit: 78,
    curiosity_fit: 80,
    trust_fit: 72,
    action_fit: 68,
    what_target_wants_to_hear: ['고객 확보에 검증된 공식이 있다'],
    what_target_does_not_want_to_hear: ['그냥 열심히 해라'],
    must_answer_questions: ['어디서부터 시작해야 하나요?'],
    recommended_angle: '아웃바운드 설계 기반 초기 고객 확보 전략',
    ...overrides,
  };
}

function makeInput(overrides: Partial<StrategyBriefInput> = {}): StrategyBriefInput {
  return {
    content_id: 'p3_content_001',
    content_type: 'key',
    channel_context: {
      current_position: '스타트업 성장 채널',
      content_pillar: '초기 고객 확보',
      role_in_content_set: '키 콘텐츠: 고객 확보 핵심 원리',
      bridge_from_previous_content: '이전 풀링 콘텐츠에서 왜 고객이 안 오는지 다뤘다',
      bridge_to_next_content: '다음 영상에서 실제 DM 스크립트를 공개한다',
    },
    script_material_pack: makePack(),
    audience_fit_report: makeFit(),
    ...overrides,
  };
}

function makePulling(
  id: string,
  covered_stages: ConsumerStageEn[],
  bridge_to_key = '키 콘텐츠에서 완전한 해결책을 확인하세요.',
): ContentSetEntry {
  return {
    content_id: id,
    content_type: 'pulling',
    title: `Pulling ${id}`,
    covered_stages,
    primary_stage: covered_stages[0],
    bridge_to_key,
  };
}

function makeKey(id: string, covered_stages: ConsumerStageEn[]): ContentSetEntry {
  return {
    content_id: id,
    content_type: 'key',
    title: `Key ${id}`,
    covered_stages,
    primary_stage: covered_stages[0],
    bridge_to_key: '',
  };
}

// ── 테스트7: ScriptMaterialPack 없이 buildCmoVideoStrategyBrief 호출 → throw ─

describe('테스트7 — 원고 순서: 조사/재료표 선행 없이 brief 생성 금지', () => {
  it('script_material_pack=null이면 throw 조사/재료표 선행 필요', () => {
    expect(() =>
      buildCmoVideoStrategyBrief(makeInput({ script_material_pack: null })),
    ).toThrow('조사/재료표 선행 필요');
  });

  it('script_material_pack=undefined이면 throw 조사/재료표 선행 필요', () => {
    expect(() =>
      buildCmoVideoStrategyBrief(makeInput({ script_material_pack: undefined })),
    ).toThrow('조사/재료표 선행 필요');
  });

  it('모든 배열이 빈 ScriptMaterialPack이면 throw 조사/재료표 선행 필요', () => {
    const emptyPack: ScriptMaterialPack = {
      topic: '스타트업',
      target_viewer: '창업자',
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

  it('정상 pack이 있으면 throw 없이 brief 반환', () => {
    expect(() => buildCmoVideoStrategyBrief(makeInput())).not.toThrow();
  });
});

// ── 테스트8 준비: logic_blocks는 소비자단계가 아닌 전략 논리 단위 ─────────────
// PRD §1.2, §1.18: covered_stages는 자유 배열 — 한 block이 여러 stage 가능,
// block 위치와 stage 간 1:1 강제 매핑 없음.

describe('테스트8 — logic_blocks 전략 논리 단위 구성: covered_stages 자유 배열', () => {
  let brief: ReturnType<typeof buildCmoVideoStrategyBrief>;

  beforeAll(() => {
    brief = buildCmoVideoStrategyBrief(makeInput());
  });

  it('logic_blocks가 3개 이상 존재한다', () => {
    expect(brief.logic_blocks.length).toBeGreaterThanOrEqual(3);
  });

  it('각 block은 covered_stages 배열을 가진다', () => {
    for (const block of brief.logic_blocks) {
      expect(Array.isArray(block.covered_stages)).toBe(true);
      expect(block.covered_stages.length).toBeGreaterThan(0);
    }
  });

  it('한 block이 여러 stage를 커버할 수 있다 (2개 이상 covered_stages 허용)', () => {
    const multiStageBlock = brief.logic_blocks.find((b) => b.covered_stages.length >= 2);
    // 구현상 block1=[phenomenon,desire], block2=[desire,plan] — 최소 하나는 multi-stage
    expect(multiStageBlock).toBeDefined();
  });

  it('block 인덱스와 stage 간 1:1 고정 매핑이 없다: 여러 block이 동일 stage 공유 가능', () => {
    const allStages = brief.logic_blocks.flatMap((b) => b.covered_stages);
    const stageCounts: Partial<Record<ConsumerStageEn, number>> = {};
    for (const s of allStages) {
      stageCounts[s] = (stageCounts[s] ?? 0) + 1;
    }
    // 적어도 하나의 stage가 2개 이상의 block에 등장해야 한다 (공유 허용 확인)
    const sharedStageExists = Object.values(stageCounts).some((count) => (count ?? 0) >= 2);
    expect(sharedStageExists).toBe(true);
  });

  it('전체 block covered_stages의 합집합이 consumer_desire_coverage.covered_stages와 일치한다', () => {
    const blockUnion = new Set(brief.logic_blocks.flatMap((b) => b.covered_stages));
    const coverageSet = new Set(brief.consumer_desire_coverage.covered_stages);
    for (const stage of blockUnion) {
      expect(coverageSet.has(stage)).toBe(true);
    }
    for (const stage of coverageSet) {
      expect(blockUnion.has(stage)).toBe(true);
    }
  });

  it('각 block에 role, main_claim, supporting_materials, viewer_emotion이 존재한다', () => {
    for (const block of brief.logic_blocks) {
      expect(typeof block.role).toBe('string');
      expect(block.role.length).toBeGreaterThan(0);
      expect(typeof block.main_claim).toBe('string');
      expect(block.main_claim.length).toBeGreaterThan(0);
      expect(Array.isArray(block.supporting_materials)).toBe(true);
      expect(block.supporting_materials.length).toBeGreaterThan(0);
      expect(typeof block.viewer_emotion).toBe('string');
      expect(block.viewer_emotion.length).toBeGreaterThan(0);
    }
  });
});

// ── 테스트2(키 유연): 키 콘텐츠 covered_stages=['desire','reward'] → 단계 강제 없이 처리 ─
// PRD §1.11: 키 콘텐츠가 plan/action을 반드시 담을 필요 없음.

describe('테스트2 — 키 콘텐츠 covered_stages=[desire, reward]: content-set validation에서 단계 강제 없음', () => {
  const contents: ContentSetEntry[] = [
    makePulling('p1', ['phenomenon']),
    makePulling('p2', ['desire']),
    makePulling('p3', ['plan']),
    makePulling('p4', ['action']),
    makePulling('p5', ['plan', 'action']),
    makeKey('k1', ['desire', 'reward']),  // plan/action 없어도 유효
  ];

  let result: ReturnType<typeof validateContentSet>;

  beforeAll(() => {
    result = validateContentSet({ contents });
  });

  it('키 콘텐츠가 desire+reward만 커버해도 5단계 전체 커버됨', () => {
    expect(result.missing_stages).toHaveLength(0);
  });

  it('revision_needed가 false다', () => {
    expect(result.revision_needed).toBe(false);
  });

  it('stage_coverage.desire에 키 콘텐츠 k1이 포함된다', () => {
    expect(result.stage_coverage.desire).toContain('k1');
  });

  it('stage_coverage.reward에 키 콘텐츠 k1이 포함된다', () => {
    expect(result.stage_coverage.reward).toContain('k1');
  });

  it('stage_coverage.plan에 k1이 없다 (키가 plan 커버 안 함)', () => {
    expect(result.stage_coverage.plan).not.toContain('k1');
  });

  it('stage_coverage.action에 k1이 없다 (키가 action 커버 안 함)', () => {
    expect(result.stage_coverage.action).not.toContain('k1');
  });
});

// ── 테스트3(세트 커버리지): 5단계 누락 시 revision_needed/missing_stages 정확 ─

describe('테스트3 — 세트 커버리지: 누락 단계 → revision_needed=true, missing_stages 정확', () => {
  describe('phenomenon + reward 동시 누락', () => {
    const contents: ContentSetEntry[] = [
      makePulling('p1', ['desire']),
      makePulling('p2', ['desire', 'plan']),
      makePulling('p3', ['plan']),
      makePulling('p4', ['action']),
      makePulling('p5', ['action']),
      makeKey('k1', ['desire', 'plan', 'action']),  // phenomenon, reward 없음
    ];

    let result: ReturnType<typeof validateContentSet>;

    beforeAll(() => {
      result = validateContentSet({ contents });
    });

    it('missing_stages에 phenomenon이 포함된다', () => {
      expect(result.missing_stages).toContain('phenomenon');
    });

    it('missing_stages에 reward가 포함된다', () => {
      expect(result.missing_stages).toContain('reward');
    });

    it('missing_stages에 desire/plan/action은 포함되지 않는다', () => {
      expect(result.missing_stages).not.toContain('desire');
      expect(result.missing_stages).not.toContain('plan');
      expect(result.missing_stages).not.toContain('action');
    });

    it('revision_needed가 true다', () => {
      expect(result.revision_needed).toBe(true);
    });

    it('missing_stages 길이가 정확히 2다', () => {
      expect(result.missing_stages).toHaveLength(2);
    });
  });

  describe('단일 누락: plan만 없는 경우', () => {
    const contents: ContentSetEntry[] = [
      makePulling('p1', ['phenomenon']),
      makePulling('p2', ['desire']),
      makePulling('p3', ['phenomenon', 'desire']),
      makePulling('p4', ['action']),
      makePulling('p5', ['reward']),
      makeKey('k1', ['desire', 'action', 'reward']),  // plan 없음
    ];

    let result: ReturnType<typeof validateContentSet>;

    beforeAll(() => {
      result = validateContentSet({ contents });
    });

    it('missing_stages에 plan만 포함된다', () => {
      expect(result.missing_stages).toContain('plan');
      expect(result.missing_stages).toHaveLength(1);
    });

    it('revision_needed가 true다', () => {
      expect(result.revision_needed).toBe(true);
    });
  });

  describe('누락 없는 경우 revision_needed=false 보장', () => {
    const contents: ContentSetEntry[] = [
      makePulling('p1', ['phenomenon', 'desire']),
      makePulling('p2', ['desire', 'plan']),
      makePulling('p3', ['plan', 'action']),
      makePulling('p4', ['action']),
      makePulling('p5', ['reward']),
      makeKey('k1', ['desire', 'reward']),
    ];

    let result: ReturnType<typeof validateContentSet>;

    beforeAll(() => {
      result = validateContentSet({ contents });
    });

    it('5단계 모두 커버됐을 때 missing_stages가 비어 있다', () => {
      expect(result.missing_stages).toHaveLength(0);
    });

    it('5단계 모두 커버됐을 때 revision_needed가 false다', () => {
      expect(result.revision_needed).toBe(false);
    });
  });
});
