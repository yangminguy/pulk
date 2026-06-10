/**
 * WO-2: 제목 디벨롭 8단계 — LLM 실행기 단위테스트
 *
 * spec: docs/_acr-progress/wo-2-l5-core-8단계-llm-실행기.md §S3/§S5 (AC-L1~L13)
 * PRD:  docs/prd/cmo-title-development.md §8~§17, §21.4~21.6, §24, §25
 *
 * LLM 출력 JSON 계약 (이 테스트가 정본 — implement는 이 계약을 따른다):
 * - awkwardness (trace 'title-dev-awkwardness'):
 *   [{ index, awkwardness_score, awkwardness_reason, selected_for_next_step }]
 *   (index = 입력 combinations 배열의 0-based 순서)
 * - step (trace 'title-dev-step-{2..8}'):
 *   { output_titles, method_explanation, cmo_reasoning,
 *     rejected_titles: [{ title, reason }], selected_titles_for_next_step }
 * - final-eval (trace 'title-dev-final-eval'):
 *   [{ index, target_fit, desire_clarity, problem_sharpness, curiosity_gap,
 *      script_match, thumbnail_fit, reason, risks, required_script_additions? }]
 *   (index = 입력 candidates 배열의 0-based 순서)
 */
import {
  TITLE_DEVELOPMENT_MODEL,
  STEP_NAMES,
  judgeCombinationAwkwardness,
  runTitleDevelopmentSteps,
  evaluateFinalTitles,
  runTitleDevelopmentWorkflow,
} from '../title-development-llm';
import { generateCrossCombinations } from '../title-development';
import type { LLMClient } from '../../ceo-orchestration/types';
import type { TitleDevelopmentReference } from '../title-development-types';

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

interface RecordedCall {
  system: string;
  user: string;
  trace_name?: string;
  trace_metadata?: Record<string, unknown>;
}

/** 호출 기록형 mock LLMClient (spec test phase 인계사항). */
function makeMockLLM(handler: (call: RecordedCall, callIndex: number) => string) {
  const calls: RecordedCall[] = [];
  const llm: LLMClient = {
    async complete(args) {
      const call: RecordedCall = { ...args };
      calls.push(call);
      return handler(call, calls.length - 1);
    },
  };
  return { llm, calls };
}

function makeRef(overrides: Partial<TitleDevelopmentReference> = {}): TitleDevelopmentReference {
  return {
    id: 'ref-1',
    research_session_id: 'session-1',
    source: 'viewtrap',
    title: '릴스 자동화로 한 달 만에 문의 30건 받은 방법',
    thumbnail_text: '하루 10분, 릴스 자동화',
    thumbnail_structure: '좌측 인물 + 우측 큰 텍스트',
    topic: '릴스 자동화',
    view_count: 80000,
    performance_grade: 'Great',
    contribution_grade: 'Good',
    topic_similarity: 'exact',
    similarity_reason: '동일 주제',
    selected_reason: '조회수/성과 조건 통과',
    ...overrides,
  };
}

const CONTEXT = {
  pulling_topic: '릴스 자동화',
  target_audience: '작은 브랜드 대표',
  business_goal: '릴스 자동화 컨설팅 문의',
};

/** §25.1 정상 데이터: 8만 Great/Good + 12만 Good/Great */
function makeValidRefs(): [TitleDevelopmentReference, TitleDevelopmentReference] {
  return [
    makeRef({ id: 'ref-1', view_count: 80000, performance_grade: 'Great', contribution_grade: 'Good' }),
    makeRef({
      id: 'ref-2',
      view_count: 120000,
      performance_grade: 'Good',
      contribution_grade: 'Great',
      title: '쇼츠 자동화 이렇게 하면 망합니다',
      thumbnail_text: '90%가 모르는 실수',
      topic_similarity: 'expanded_same_meaning',
    }),
  ];
}

function makeCombos() {
  const [ref1, ref2] = makeValidRefs();
  return generateCrossCombinations(ref1, ref2);
}

/** trace_name 기반 라우팅 기본 핸들러 (정상 응답). */
function defaultHandler(call: RecordedCall): string {
  const t = call.trace_name ?? '';
  if (t === 'title-dev-awkwardness') {
    return JSON.stringify(
      [0, 1, 2, 3].map((i) => ({
        index: i,
        awkwardness_score: 0,
        awkwardness_reason: '',
        selected_for_next_step: i < 2,
      })),
    );
  }
  const stepMatch = /^title-dev-step-([2-8])$/.exec(t);
  if (stepMatch) {
    const n = stepMatch[1];
    return JSON.stringify({
      output_titles: [`${n}단계 제목 후보`],
      method_explanation: `${n}단계 변경 방식`,
      cmo_reasoning: `${n}단계 CMO 판단`,
      rejected_titles: [{ title: `${n}단계 버린 후보`, reason: '약함' }],
      selected_titles_for_next_step: [`${n}단계 제목 후보`],
    });
  }
  if (t === 'title-dev-final-eval') {
    return JSON.stringify([
      {
        index: 0,
        target_fit: 18,
        desire_clarity: 18,
        problem_sharpness: 18,
        curiosity_gap: 13,
        script_match: 13,
        thumbnail_fit: 8,
        reason: '욕망 선명 + 호기심 갭',
        risks: [],
      },
    ]);
  }
  throw new Error(`unexpected trace_name: ${t}`);
}

// ---------------------------------------------------------------------------
// AC-L1 — export 표면
// ---------------------------------------------------------------------------

describe('exports (AC-L1)', () => {
  it('모델 상수는 sonnet 계열로 고정된다', () => {
    expect(TITLE_DEVELOPMENT_MODEL).toBe('claude-sonnet-4-6');
  });

  it('STEP_NAMES는 §8 순서의 2~8단계 이름을 갖는다', () => {
    expect(STEP_NAMES).toEqual({
      2: '쉬운 단어로 전환',
      3: '상위어로 전환',
      4: '부정어/반대 구조로 전환',
      5: '수식어 추가',
      6: '답이 보이는 제목을 질문이 생기게 전환',
      7: '핫비디오 구조로 갈아끼우기',
      8: '강한 단어로 변경',
    });
  });

  it('패키지 루트 배럴(src/index)에서 실행기 함수가 import 가능하다', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const core = require('../../../index');
    expect(typeof core.judgeCombinationAwkwardness).toBe('function');
    expect(typeof core.runTitleDevelopmentSteps).toBe('function');
    expect(typeof core.evaluateFinalTitles).toBe('function');
    expect(typeof core.runTitleDevelopmentWorkflow).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// §21.4 judgeCombinationAwkwardness (AC-L2, AC-L3)
// ---------------------------------------------------------------------------

describe('judgeCombinationAwkwardness (AC-L2, AC-L3)', () => {
  it('LLM 응답으로 score/reason/passed/selected를 채우고 fallback_count=0', async () => {
    const { llm } = makeMockLLM((call) => {
      expect(call.trace_name).toBe('title-dev-awkwardness');
      return JSON.stringify([
        { index: 0, awkwardness_score: 0, awkwardness_reason: '', selected_for_next_step: true },
        { index: 1, awkwardness_score: 2, awkwardness_reason: '제목-썸네일 중복', selected_for_next_step: false },
        { index: 2, awkwardness_score: 0, awkwardness_reason: '', selected_for_next_step: true },
        { index: 3, awkwardness_score: 5, awkwardness_reason: '주제 불일치', selected_for_next_step: false },
      ]);
    });

    const result = await judgeCombinationAwkwardness(makeCombos(), CONTEXT, { llm });

    expect(result.fallback_count).toBe(0);
    expect(result.combinations).toHaveLength(4);

    // score>0 → passed=false (WO-1 isAwkward 임계와 일치)
    expect(result.combinations[0].awkwardness_score).toBe(0);
    expect(result.combinations[0].passed).toBe(true);
    expect(result.combinations[0].selected_for_next_step).toBe(true);

    expect(result.combinations[1].awkwardness_score).toBe(2);
    expect(result.combinations[1].passed).toBe(false);
    expect(result.combinations[1].awkwardness_reason).toBe('제목-썸네일 중복');
    expect(result.combinations[1].selected_for_next_step).toBe(false);

    expect(result.combinations[3].passed).toBe(false);
    expect(result.combinations[3].awkwardness_reason).toBe('주제 불일치');
  });

  it('입력 배열·원소를 변경하지 않는다 (AC-L3, deep-freeze)', async () => {
    const combos = makeCombos();
    Object.freeze(combos);
    combos.forEach((c) => Object.freeze(c));

    const { llm } = makeMockLLM(defaultHandler);
    // frozen 입력에서 throw 없이 채워진 복사본을 반환해야 한다.
    const result = await judgeCombinationAwkwardness(combos, CONTEXT, { llm });
    expect(result.combinations).not.toBe(combos);
    expect(result.combinations[0]).not.toBe(combos[0]);
    // 원본은 초기값 그대로
    expect(combos[0].passed).toBe(false);
    expect(combos[0].selected_for_next_step).toBe(false);
  });

  it('llm 미주입이면 결정론 폴백: score=0/passed=true + 기본 2종 조합만 선택 (AC-L7)', async () => {
    const result = await judgeCombinationAwkwardness(makeCombos(), CONTEXT);
    expect(result.fallback_count).toBeGreaterThan(0);
    const byType = Object.fromEntries(result.combinations.map((c) => [c.combination_type, c]));
    expect(byType['ref1_thumbnail_ref2_title'].selected_for_next_step).toBe(true);
    expect(byType['ref1_title_ref2_thumbnail'].selected_for_next_step).toBe(true);
    expect(byType['ref1_thumbnail_text_as_title_ref2_thumbnail'].selected_for_next_step).toBe(false);
    expect(byType['ref2_thumbnail_text_as_title_ref1_thumbnail'].selected_for_next_step).toBe(false);
    for (const c of result.combinations) {
      expect(c.awkwardness_score).toBe(0);
      expect(c.passed).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §21.5 runTitleDevelopmentSteps (AC-L4, AC-L5, AC-L6, AC-L7, AC-L8)
// ---------------------------------------------------------------------------

describe('runTitleDevelopmentSteps (AC-L4, AC-L5)', () => {
  const initialTitles = ['하루 10분, 릴스 자동화', '쇼츠 자동화 이렇게 하면 망합니다'];

  it('항상 7개 결과를 step_number 2~8 순서로 반환하고 step_name이 상수와 일치한다 (AC-09)', async () => {
    const { llm } = makeMockLLM(defaultHandler);
    const { step_results, fallback_count } = await runTitleDevelopmentSteps(initialTitles, CONTEXT, { llm });

    expect(fallback_count).toBe(0);
    expect(step_results).toHaveLength(7);
    expect(step_results.map((s) => s.step_number)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    for (const s of step_results) {
      expect(s.step_name).toBe(STEP_NAMES[s.step_number as 2 | 3 | 4 | 5 | 6 | 7 | 8]);
    }
  });

  it('각 단계의 입력/출력/이유/탈락이 채워지고 N단계 입력 = N-1단계 selected (AC-10)', async () => {
    const { llm, calls } = makeMockLLM(defaultHandler);
    const { step_results } = await runTitleDevelopmentSteps(initialTitles, CONTEXT, { llm });

    // 2단계 입력은 초기 제목
    expect(step_results[0].input_titles).toEqual(initialTitles);
    // 체이닝: N단계 입력 = N-1단계 selected
    for (let i = 1; i < step_results.length; i += 1) {
      expect(step_results[i].input_titles).toEqual(step_results[i - 1].selected_titles_for_next_step);
    }
    // 필드 충족 (PRD §8 "각 단계는 반드시 다음을 남겨야 한다")
    for (const s of step_results) {
      expect(s.output_titles.length).toBeGreaterThan(0);
      expect(s.method_explanation.length).toBeGreaterThan(0);
      expect(s.cmo_reasoning.length).toBeGreaterThan(0);
      expect(Array.isArray(s.rejected_titles)).toBe(true);
      expect(s.selected_titles_for_next_step.length).toBeGreaterThan(0);
    }
    // 단계당 1콜 = 총 7콜
    expect(calls).toHaveLength(7);
  });
});

describe('runTitleDevelopmentSteps — 재시도/폴백 (AC-L6)', () => {
  it('한 단계가 2회(maxRetries=1) 모두 실패해도 throw 없이 해당 단계만 pass-through, 이후 단계 정상', async () => {
    const { llm, calls } = makeMockLLM((call) => {
      if (call.trace_name === 'title-dev-step-4') return '이건 JSON이 아님';
      return defaultHandler(call);
    });

    const initial = ['하루 10분, 릴스 자동화'];
    const { step_results, fallback_count } = await runTitleDevelopmentSteps(initial, CONTEXT, {
      llm,
      maxRetries: 1,
    });

    expect(fallback_count).toBe(1);
    expect(step_results).toHaveLength(7);

    const step4 = step_results.find((s) => s.step_number === 4)!;
    const step3 = step_results.find((s) => s.step_number === 3)!;
    // pass-through: 출력 = 입력(= 3단계 selected), 탈락 없음
    expect(step4.input_titles).toEqual(step3.selected_titles_for_next_step);
    expect(step4.output_titles).toEqual(step4.input_titles);
    expect(step4.selected_titles_for_next_step).toEqual(step4.input_titles);
    expect(step4.rejected_titles).toEqual([]);
    expect(step4.method_explanation).toContain('실패');

    // 4단계는 2회 시도, 나머지 6단계는 1회씩 = 총 8콜
    const step4Calls = calls.filter((c) => c.trace_name === 'title-dev-step-4');
    expect(step4Calls).toHaveLength(2);
    expect(calls).toHaveLength(8);

    // 이후 단계(5~8)는 LLM 정상 결과
    const step5 = step_results.find((s) => s.step_number === 5)!;
    expect(step5.cmo_reasoning).toBe('5단계 CMO 판단');
  });
});

describe('runTitleDevelopmentSteps — llm 미주입 결정론 폴백 (AC-L7)', () => {
  it('LLM 0콜로 7단계 전부 pass-through, 같은 입력→같은 출력', async () => {
    const initial = ['하루 10분, 릴스 자동화'];
    const a = await runTitleDevelopmentSteps(initial, CONTEXT);
    const b = await runTitleDevelopmentSteps(initial, CONTEXT);

    expect(a.fallback_count).toBe(7);
    expect(a.step_results).toHaveLength(7);
    for (const s of a.step_results) {
      expect(s.output_titles).toEqual(initial);
      expect(s.selected_titles_for_next_step).toEqual(initial);
      expect(s.rejected_titles).toEqual([]);
    }
    expect(a).toEqual(b);
  });
});

describe('runTitleDevelopmentSteps — 5단계 35자 후처리 (AC-L8)', () => {
  it('5단계 출력 중 36자 제목은 rejected("35자 초과")로 이동, 35자는 통과', async () => {
    const title35 = '가'.repeat(35);
    const title36 = '가'.repeat(36);
    const { llm } = makeMockLLM((call) => {
      if (call.trace_name === 'title-dev-step-5') {
        return JSON.stringify({
          output_titles: [title35, title36],
          method_explanation: '수식어 추가',
          cmo_reasoning: '클릭 이유 강화',
          rejected_titles: [],
          selected_titles_for_next_step: [title35, title36],
        });
      }
      return defaultHandler(call);
    });

    const { step_results } = await runTitleDevelopmentSteps(['하루 10분, 릴스 자동화'], CONTEXT, { llm });
    const step5 = step_results.find((s) => s.step_number === 5)!;

    expect(step5.output_titles).toContain(title35);
    expect(step5.output_titles).not.toContain(title36);
    expect(step5.selected_titles_for_next_step).not.toContain(title36);
    expect(step5.rejected_titles).toContainEqual({ title: title36, reason: '35자 초과' });
  });
});

// ---------------------------------------------------------------------------
// §21.6 evaluateFinalTitles (AC-L9, AC-L10)
// ---------------------------------------------------------------------------

describe('evaluateFinalTitles (AC-L9)', () => {
  const candidates = [
    { title: '후보 A', thumbnail_direction: '좌측 인물 + 우측 텍스트' },
    { title: '후보 B', thumbnail_direction: '큰 텍스트 중앙' },
    { title: '후보 C', thumbnail_direction: '대비 구도' },
  ];

  it('항목점수 클램프 후 합산(WO-1 scoreFinalTitle), recommendation 임계 85/70/69 (AC-11)', async () => {
    const { llm } = makeMockLLM((call) => {
      expect(call.trace_name).toBe('title-dev-final-eval');
      return JSON.stringify([
        // 배점 초과(999) → 클램프 → 100점
        { index: 0, target_fit: 999, desire_clarity: 20, problem_sharpness: 20, curiosity_gap: 15, script_match: 15, thumbnail_fit: 10, reason: '만점', risks: [] },
        // 84점 → revise
        { index: 1, target_fit: 20, desire_clarity: 20, problem_sharpness: 20, curiosity_gap: 15, script_match: 9, thumbnail_fit: 0, reason: '원고 보강 필요', risks: ['원고 불일치'] },
        // 69점 → rerun_reference_search
        { index: 2, target_fit: 20, desire_clarity: 20, problem_sharpness: 20, curiosity_gap: 9, script_match: 0, thumbnail_fit: 0, reason: '호기심 부족', risks: [] },
      ]);
    });

    const { evaluations, fallback_count } = await evaluateFinalTitles(candidates, CONTEXT, { llm });

    expect(fallback_count).toBe(0);
    expect(evaluations).toHaveLength(3);

    expect(evaluations[0].title).toBe('후보 A');
    expect(evaluations[0].thumbnail_direction).toBe('좌측 인물 + 우측 텍스트');
    expect(evaluations[0].target_fit).toBe(20); // 999 → 20 클램프
    expect(evaluations[0].total_score).toBe(100);
    expect(evaluations[0].recommendation).toBe('upload_candidate');

    expect(evaluations[1].total_score).toBe(84);
    expect(evaluations[1].recommendation).toBe('revise');
    expect(evaluations[1].risks).toEqual(['원고 불일치']);

    expect(evaluations[2].total_score).toBe(69);
    expect(evaluations[2].recommendation).toBe('rerun_reference_search');
  });

  it('폴백 시 total이 70~84(revise) — 자동 upload_candidate 금지 (AC-L10)', async () => {
    const { evaluations, fallback_count } = await evaluateFinalTitles(candidates, CONTEXT);
    expect(fallback_count).toBeGreaterThan(0);
    expect(evaluations).toHaveLength(3);
    for (const e of evaluations) {
      expect(e.total_score).toBeGreaterThanOrEqual(70);
      expect(e.total_score).toBeLessThanOrEqual(84);
      expect(e.recommendation).toBe('revise');
    }
  });
});

// ---------------------------------------------------------------------------
// 합성 파이프라인 runTitleDevelopmentWorkflow (AC-L11, AC-L12, AC-L13)
// ---------------------------------------------------------------------------

describe('runTitleDevelopmentWorkflow (AC-L11, AC-L13)', () => {
  const input = {
    video_project_id: 'vp-1',
    pulling_content_id: 'pc-1',
    ...CONTEXT,
    references: makeValidRefs(),
  };

  it('§25.1 정상 케이스: 조합 4·단계 7·후보 ≥1·베스트 선택·draft·요약 (AC-13~15)', async () => {
    const { llm, calls } = makeMockLLM(defaultHandler);
    const result = await runTitleDevelopmentWorkflow(input, { llm });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { run } = result;

    expect(run.video_project_id).toBe('vp-1');
    expect(run.pulling_content_id).toBe('pc-1');
    expect(run.pulling_topic).toBe('릴스 자동화');
    expect(run.references).toHaveLength(2);
    expect(run.exact_search_terms.length).toBeGreaterThan(0);
    expect(run.combinations).toHaveLength(4);
    expect(run.step_results).toHaveLength(7);
    expect(run.final_candidates.length).toBeGreaterThanOrEqual(1);

    // 베스트 = 최고 total_score 후보 (defaultHandler: 8단계 selected 1개 → 88점)
    const best = [...run.final_candidates].sort((a, b) => b.total_score - a.total_score)[0];
    expect(run.selected_title).toBe(best.title);
    expect(run.selected_title).toBe('8단계 제목 후보');
    expect(run.selected_thumbnail_direction).toBe(best.thumbnail_direction);

    expect(run.approval_status).toBe('draft'); // AC-13: Founder 승인 전
    expect(run.second_brain_summary).toBeTruthy(); // AC-15
    expect(run.second_brain_summary).toContain('8단계 제목 후보');
    expect(run.id).toBeTruthy();
    expect(run.created_at).toBeTruthy();
    expect(run.updated_at).toBeTruthy();

    // 총 9콜: 어색함 1 + 단계 7 + 평가 1
    expect(calls).toHaveLength(9);
    expect(result.fallback_count).toBe(0);
  });

  it('모든 LLM 호출에 trace_name·pulling_topic 메타데이터가 전달된다 (AC-L13, Rule 6)', async () => {
    const { llm, calls } = makeMockLLM(defaultHandler);
    await runTitleDevelopmentWorkflow(input, { llm });

    const traces = calls.map((c) => c.trace_name);
    expect(traces).toEqual([
      'title-dev-awkwardness',
      'title-dev-step-2',
      'title-dev-step-3',
      'title-dev-step-4',
      'title-dev-step-5',
      'title-dev-step-6',
      'title-dev-step-7',
      'title-dev-step-8',
      'title-dev-final-eval',
    ]);
    for (const c of calls) {
      expect(c.trace_metadata).toMatchObject({ pulling_topic: '릴스 자동화' });
    }
  });
});

describe('runTitleDevelopmentWorkflow — 검증 실패 조기 반환 (AC-L12)', () => {
  it('§25.3 조회수 3만 레퍼런스 → ok:false + request_more_references + LLM 0콜 (AC-01~04)', async () => {
    const { llm, calls } = makeMockLLM(defaultHandler);
    const result = await runTitleDevelopmentWorkflow(
      {
        video_project_id: 'vp-1',
        pulling_content_id: 'pc-1',
        ...CONTEXT,
        references: [makeRef({ id: 'ref-1', view_count: 30000 }), makeRef({ id: 'ref-2' })],
      },
      { llm },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.next_action).toBe('request_more_references');
    expect(result.failed_references).toEqual([
      { reference_id: 'ref-1', reasons: ['조회수 5만 미만'] },
    ]);
    expect(calls).toHaveLength(0);
  });
});
