import { draftKeyContentPlan, finalizeKeyContentPlan, runKeyContentWorkflow } from '../key-content-draft';
import { buildViewtrapValidation } from '../key-content-planning';
import type { ProductBrief } from '../types';

const product: ProductBrief = {
  product_name: 'AI 마케팅팀',
  category: '콘텐츠 마케팅 시스템',
  target_audience: '작은 브랜드 대표',
  core_offer: '콘텐츠 기획을 자동으로 구조화',
  business_goal: 'consulting_lead',
};

const validLlmJson = JSON.stringify({
  item: {
    features: [{ item: '콘텐츠 자동 구조화', description: '판매 흐름에 맞춰 기획' }],
    characteristics: [{ item: '키/풀링 분리', description: '유입과 판매 분리' }],
    benefits: [{ item: '감 대신 구조', description: '구매 흐름 기반' }],
  },
  category: {
    features: [{ item: '문제→콘텐츠 변환', description: '고객 문제를 콘텐츠로' }],
    characteristics: [{ item: '유입/판매 분리', description: '콘텐츠 역할 구분' }],
    benefits: [{ item: '콘텐츠 누적', description: '구매 흐름에 쌓임' }],
  },
  problems: {
    item_problems: [{ problem: '콘텐츠 주제가 감으로 정해짐', derived_from: '콘텐츠 자동 구조화' }],
    category_problems: [{ problem: '콘텐츠가 매출로 안 이어짐', derived_from: '문제→콘텐츠 변환' }],
  },
  funnel: {
    phenomenon: ['인스타 열심히 해도 손님이 안 옴'],
    desire: ['매출로 이어지는 콘텐츠를 원함'],
    plan: ['콘텐츠 구조를 배우려 함'],
    action: [],
    reward: [],
  },
  entry_stage: 'phenomenon',
  entry_rationale: '문제 공감부터 시작해야 판매 논리가 자연스럽다',
  sales_logic: {
    problem_statement: '콘텐츠가 매출로 안 이어진다',
    category_feature_benefit: '콘텐츠 마케팅 시스템은 구매 흐름을 만든다',
    category_need: '흩어진 콘텐츠를 구조화할 시스템이 필요',
    item_feature_benefit: 'AI 마케팅팀이 기획을 자동 구조화',
    item_solution_statement: 'AI 마케팅팀이 구매 흐름 콘텐츠를 만든다',
    cta: '무료 상담 신청',
  },
});

describe('draftKeyContentPlan', () => {
  it('injected LLM 성공 → source=llm, 모든 step이 검증된 산출물', async () => {
    const llmComplete = async () => '```json\n' + validLlmJson + '\n```';
    const { draft, source } = await draftKeyContentPlan({ product }, { llmComplete });

    expect(source).toBe('llm');
    expect(draft.step1_generalization.item_name).toBe('AI 마케팅팀');
    expect(draft.step2_item_fb.features.length).toBeGreaterThan(0);
    expect(draft.step4_problems.item_problem_candidates[0].id).toBe('prob-item-0');
    expect(draft.step5_funnel.phenomenon[0].id).toBe('funnel-phenomenon-0');
    expect(draft.step6_entry_decision.selected_entry_stage).toBe('phenomenon');
    expect(draft.step7_search_keywords.problem_keywords.length).toBeGreaterThan(0);
    expect(draft.step10_sales_logic.cta).toBe('무료 상담 신청');
  });

  it('형식오류 응답 → 재시도 후 결정론적 폴백', async () => {
    let calls = 0;
    const llmComplete = async () => {
      calls++;
      return 'not json at all';
    };
    const { source } = await draftKeyContentPlan({ product }, { llmComplete, maxRetries: 2 });
    expect(calls).toBe(3); // 1 + 2 retries
    expect(source).toBe('fallback');
  });

  it('LLM 미주입 → 폴백, 폴백도 유효한 draft', async () => {
    const { draft, source } = await draftKeyContentPlan({ product });
    expect(source).toBe('fallback');
    // 폴백도 기존 buildXxx 검증을 통과한 산출물이어야 한다.
    expect(draft.step1_generalization.item_name).toBe('AI 마케팅팀');
    expect(draft.step5_funnel.phenomenon.length).toBeGreaterThan(0);
    expect(draft.step10_sales_logic.problem_statement.length).toBeGreaterThan(0);
  });

  it('second_brain_insights가 있어도 정상 동작', async () => {
    const { source } = await draftKeyContentPlan(
      { product, second_brain_insights: ['고객 관점에서 출발', '풀링2 문제 심화'] },
    );
    expect(source).toBe('fallback');
  });

  it('customer_problem이 폴백 초안의 문제/판매논리 출발점으로 반영된다', async () => {
    const customer_problem = '인스타 열심히 해도 손님이 안 온다';
    const { draft } = await draftKeyContentPlan({ product, customer_problem });
    expect(draft.step4_problems.item_problem_candidates[0].problem).toBe(customer_problem);
    expect(draft.step10_sales_logic.problem_statement).toBe(customer_problem);
    expect(draft.step5_funnel.phenomenon[0].content).toContain(customer_problem);
  });
});

describe('runKeyContentWorkflow', () => {
  // 각 LLM 스텝(2,3,4,5,6,10)에 대해 그 스텝만 응답하는 라우터.
  const stepResponses = {
    step2: { item: { features: [{ item: 'F2', description: 'd' }], characteristics: [{ item: 'C2', description: 'd' }], benefits: [{ item: 'B2', description: 'd' }] } },
    step3: { category: { features: [{ item: 'CF3', description: 'd' }], characteristics: [{ item: 'CC3', description: 'd' }], benefits: [{ item: 'CB3', description: 'd' }] } },
    step4: { item_problems: [{ problem: '문제4', derived_from: 'F2' }], category_problems: [{ problem: '카테고리문제4', derived_from: 'CF3' }] },
    step5: { phenomenon: ['현상5'], desire: ['욕구5'], plan: [], action: [], reward: [] },
    step6: { entry_stage: 'desire', entry_rationale: '욕구 단계 진입' },
    step10: { problem_statement: 'PS10', category_feature_benefit: 'CFB10', category_need: 'CN10', item_feature_benefit: 'IFB10', item_solution_statement: 'ISS10', cta: 'CTA10' },
  };

  // 프롬프트에 들어간 라벨로 어느 스텝인지 식별해 해당 JSON 반환.
  function routedLlm(captured: string[]) {
    return async (prompt: string) => {
      captured.push(prompt);
      if (prompt.includes('Step 2:')) return JSON.stringify(stepResponses.step2);
      if (prompt.includes('Step 3:')) return JSON.stringify(stepResponses.step3);
      if (prompt.includes('Step 4:')) return JSON.stringify(stepResponses.step4);
      if (prompt.includes('Step 5:')) return JSON.stringify(stepResponses.step5);
      if (prompt.includes('Step 6:')) return JSON.stringify(stepResponses.step6);
      if (prompt.includes('Step 10:')) return JSON.stringify(stepResponses.step10);
      throw new Error('unknown step prompt');
    };
  }

  it('순차 진행: 모든 LLM 스텝 성공 → progress=8, 누적 산출물', async () => {
    const captured: string[] = [];
    const { steps, progress, draft } = await runKeyContentWorkflow({ product }, { llmComplete: routedLlm(captured) });

    expect(progress).toBe(8);
    expect(steps).toBe(draft);
    expect(draft.step1_generalization.item_name).toBe('AI 마케팅팀');
    expect(draft.step2_item_fb.features[0].item).toBe('F2');
    expect(draft.step3_category_fb.features[0].item).toBe('CF3');
    expect(draft.step4_problems.item_problem_candidates[0].id).toBe('prob-item-0');
    expect(draft.step4_problems.category_problem_candidates[0].id).toBe('prob-cat-0');
    expect(draft.step5_funnel.phenomenon[0].id).toBe('funnel-phenomenon-0');
    expect(draft.step6_entry_decision.selected_entry_stage).toBe('desire');
    expect(draft.step7_search_keywords.problem_keywords).toContain('문제4');
    expect(draft.step10_sales_logic.cta).toBe('CTA10');
  });

  it('각 LLM 스텝 프롬프트가 이전 스텝의 산출물을 포함한다', async () => {
    const captured: string[] = [];
    await runKeyContentWorkflow({ product }, { llmComplete: routedLlm(captured) });

    // R3: step3(카테고리 FB)는 step1만 의존 → step2와 병렬 실행. step2 산출물(F2)을
    // 컨텍스트로 받지 않는다(디커플링으로 cold-spawn 1회 절감). DECISIONS.md "R3".
    const step3Prompt = captured.find((p) => p.includes('Step 3:'))!;
    expect(step3Prompt).not.toContain('F2');

    const step4Prompt = captured.find((p) => p.includes('Step 4:'))!;
    expect(step4Prompt).toContain('CF3'); // step3 산출물 포함

    const step5Prompt = captured.find((p) => p.includes('Step 5:'))!;
    expect(step5Prompt).toContain('문제4'); // step4 산출물 포함

    const step6Prompt = captured.find((p) => p.includes('Step 6:'))!;
    expect(step6Prompt).toContain('현상5'); // step5 산출물 포함

    const step10Prompt = captured.find((p) => p.includes('Step 10:'))!;
    expect(step10Prompt).toContain('욕구 단계 진입'); // step6 rationale 포함
    expect(step10Prompt).toContain('현상5'); // step5 포함
  });

  it('한 스텝만 실패 → 그 스텝만 폴백, 나머지는 LLM 유지, progress=8', async () => {
    const captured: string[] = [];
    const llm = routedLlm(captured);
    const llmComplete = async (prompt: string) => {
      if (prompt.includes('Step 5:')) return 'broken not json';
      return llm(prompt);
    };
    const { draft, progress } = await runKeyContentWorkflow({ product }, { llmComplete, maxRetries: 1 });

    expect(progress).toBe(8);
    // step5만 폴백(결정론) — phenomenon에 폴백 문구.
    expect(draft.step5_funnel.phenomenon[0].content).toContain('마주치는 상황');
    // 그 외 스텝은 LLM 값 유지.
    expect(draft.step2_item_fb.features[0].item).toBe('F2');
    expect(draft.step6_entry_decision.selected_entry_stage).toBe('desire');
    expect(draft.step10_sales_logic.cta).toBe('CTA10');
  });

  it('실패 스텝은 maxRetries만큼만 재시도(다른 스텝은 1회)', async () => {
    let step5Calls = 0;
    const captured: string[] = [];
    const llm = routedLlm(captured);
    const llmComplete = async (prompt: string) => {
      if (prompt.includes('Step 5:')) {
        step5Calls++;
        return 'broken';
      }
      return llm(prompt);
    };
    await runKeyContentWorkflow({ product }, { llmComplete, maxRetries: 2 });
    expect(step5Calls).toBe(3); // 1 + 2 retries
  });

  it('LLM 미주입 → 모든 LLM 스텝 폴백, draft 유효, progress=8', async () => {
    const customer_problem = '인스타 열심히 해도 손님이 안 온다';
    const { draft, progress } = await runKeyContentWorkflow({ product, customer_problem });
    expect(progress).toBe(8);
    expect(draft.step4_problems.item_problem_candidates[0].problem).toBe(customer_problem);
    expect(draft.step5_funnel.phenomenon[0].content).toContain(customer_problem);
    expect(draft.step10_sales_logic.problem_statement).toBe(customer_problem);
  });
});

describe('finalizeKeyContentPlan', () => {
  const viewtrapUse = buildViewtrapValidation({
    validated_keywords: ['콘텐츠 매출'],
    candidate_titles: ['인스타 열심히 해도 손님 안 오는 이유'],
    performance_score: 'good',
    contribution_score: 'good',
    growth_status: 'growing',
    channel_value_risk: false,
    person_value_risk: false,
  });

  const approved = {
    title: '마케팅 대행사 쓰기 전에 알아야 할 것',
    thumbnail_promise: '콘텐츠 양이 아니라 구매 흐름이 문제',
    intro_direction: '문제 공감으로 시작',
    body_structure: ['문제 제시', '카테고리 필요성', '상품 연결', 'CTA'],
    cta: '무료 상담 신청',
  };

  it('편집된 draft + Viewtrap(use) + 확정입력 → 검증된 KeyContentPlan', async () => {
    const { draft } = await draftKeyContentPlan({ product });
    const plan = finalizeKeyContentPlan({ draft, viewtrap_validation: viewtrapUse, approved });

    expect(plan.step11_approved_topic.title).toBe(approved.title);
    expect(plan.step11_approved_topic.entry_stage).toBe(draft.step6_entry_decision.selected_entry_stage);
    expect(plan.step9_viable_candidates.length).toBe(1);
    expect(plan.step8_viewtrap_validation.verdict).toBe('use');
  });

  it('Viewtrap이 reject면 확정 불가 (throw)', async () => {
    const { draft } = await draftKeyContentPlan({ product });
    const reject = buildViewtrapValidation({
      validated_keywords: ['x'],
      candidate_titles: ['y'],
      performance_score: 'normal',
      contribution_score: 'normal',
      growth_status: 'stalled',
      channel_value_risk: false,
      person_value_risk: false,
    });
    expect(reject.verdict).toBe('reject');
    expect(() => finalizeKeyContentPlan({ draft, viewtrap_validation: reject, approved })).toThrow();
  });
});
