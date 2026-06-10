import type { AgentSkill, SkillResult } from '../types';
import type {
  ProductBrief,
  FeatureBenefit,
  ProblemCandidate,
  FunnelStageItem,
} from '../../video-room/types';
import {
  buildItemGeneralization,
  buildItemFeatureBenefitMap,
  buildCategoryFeatureBenefitMap,
  deriveProblemMap,
  buildFunnelPlanningMap,
  decideKeyContentEntryStage,
  generateSearchKeywords,
  buildViewtrapValidation,
  filterSalesViableCandidates,
  buildSalesLogicMap,
  buildApprovedKeyContentTopic,
  assembleKeyContentPlan,
  type KeyContentPlan,
} from '../../video-room/key-content-planning';

/**
 * Deterministic fallback ProductBrief — used when the caller does not supply a
 * full product brief via args/prior_results. Keeps the skill testable without
 * any LLM call (repo convention: deterministic fallback).
 */
function resolveProductBrief(args: Record<string, unknown> | undefined): ProductBrief {
  const supplied = args?.product as Partial<ProductBrief> | undefined;
  return {
    product_name: supplied?.product_name ?? 'AI 마케팅팀',
    category: supplied?.category ?? '콘텐츠 마케팅 시스템',
    target_audience: supplied?.target_audience ?? '작은 브랜드 대표',
    core_offer: supplied?.core_offer ?? '콘텐츠 기획 자동화',
    business_goal: supplied?.business_goal ?? 'consulting_lead',
  };
}

/**
 * cmo.keycontent.plan — Key Content Planning skill.
 *
 * Thin adapter over video-room/key-content-planning.ts (11-step builders).
 * Runs the full Step 1–11 pipeline from a ProductBrief, validating every step
 * through the domain functions and the cross-step `assembleKeyContentPlan` gate.
 */
export function createKeyContentSkill(
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: 'cmo.keycontent.plan',
    skill_id: 'cmo.keycontent.plan',
    category: 'content',
    depends_on: [],
    default_risk: 'D2',
    description: 'Plan a key content topic via the 11-step CMO key-content workflow.',
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (args, _ctx): Promise<SkillResult> => {
      const product = resolveProductBrief(args as Record<string, unknown> | undefined);

      // Step 1–3: generalization + feature/benefit maps.
      const generalization = buildItemGeneralization({ product });
      const fb = (label: string): FeatureBenefit => ({
        item: `${product.product_name} ${label}`,
        description: `${product.product_name}의 ${label}`,
      });
      const item_fb = buildItemFeatureBenefitMap({
        product,
        features: [fb('기능')],
        characteristics: [fb('특징')],
        benefits: [fb('장점')],
      });
      const category_fb = buildCategoryFeatureBenefitMap({
        generalization,
        features: [{ item: `${product.category} 기능`, description: `${product.category}의 기능` }],
        characteristics: [{ item: `${product.category} 특징`, description: `${product.category}의 특징` }],
        benefits: [{ item: `${product.category} 장점`, description: `${product.category}의 장점` }],
      });

      // Step 4: problem derivation.
      const itemProblem: ProblemCandidate = {
        id: 'p-item-1',
        problem: `${product.target_audience}이(가) ${product.category}를 감으로 운영함`,
        derived_from: item_fb.features[0].item,
      };
      const categoryProblem: ProblemCandidate = {
        id: 'p-cat-1',
        problem: `${product.category}가 구매 흐름으로 이어지지 않음`,
        derived_from: category_fb.features[0].item,
      };
      const problems = deriveProblemMap({
        item_fb,
        category_fb,
        item_problems: [itemProblem],
        category_problems: [categoryProblem],
        selected_problem_ids: [itemProblem.id, categoryProblem.id],
      });

      // Step 5: funnel (needs >= 2 filled stages).
      const stage = (id: string, content: string): FunnelStageItem => ({ id, content });
      const funnel = buildFunnelPlanningMap({
        phenomenon: [stage('f-ph-1', itemProblem.problem)],
        desire: [stage('f-de-1', `${product.core_offer}로 해결하고 싶음`)],
        plan: [stage('f-pl-1', `${product.category} 비교/노하우`)],
        action: [],
        reward: [],
      });

      // Step 6: entry decision.
      const entry_decision = decideKeyContentEntryStage({
        funnel,
        selected_entry_stage: 'plan',
        rationale: '계획 단계 고객이 충분하다고 판단해 계획형 키 콘텐츠로 진입',
      });

      // Step 7: search keywords.
      const search_keywords = generateSearchKeywords({
        generalization,
        item_fb,
        category_fb,
        problems,
      });

      // Step 8: Viewtrap validation (deterministic "good" inputs).
      const viewtrap_validation = buildViewtrapValidation({
        validated_keywords: search_keywords.problem_keywords,
        candidate_titles: [`${product.target_audience}이 먼저 알아야 할 것`],
        performance_score: 'good',
        contribution_score: 'good',
        growth_status: 'growing',
        channel_value_risk: false,
        person_value_risk: false,
      });

      // Step 9: filter sales-viable candidates.
      const viable_candidates = filterSalesViableCandidates([viewtrap_validation]);

      // Step 10: sales logic.
      const sales_logic = buildSalesLogicMap({
        problem_statement: itemProblem.problem,
        category_feature_benefit: category_fb.features[0].description,
        category_need: `${product.category}가 필요하다`,
        item_feature_benefit: item_fb.features[0].description,
        item_solution_statement: `${product.product_name}이(가) 문제를 해결한다`,
        cta: product.core_offer,
      });

      // Step 11: approved topic.
      const approved_topic = buildApprovedKeyContentTopic({
        title: `${product.target_audience}이 ${product.category} 쓰기 전에 알아야 할 것`,
        thumbnail_promise: '감이 아니라 판매 흐름으로 콘텐츠 만들기',
        entry_stage: entry_decision.selected_entry_stage,
        sales_logic,
        viewtrap_validation,
        intro_direction: '문제 공감 → 카테고리 필요성 → 내 상품 연결',
        body_structure: ['문제 제시', '카테고리 기능/특징/장점', '내 상품 제안', 'CTA'],
        cta: product.core_offer,
      });

      // Cross-step consistency gate.
      const plan: KeyContentPlan = {
        step1_generalization: generalization,
        step2_item_fb: item_fb,
        step3_category_fb: category_fb,
        step4_problems: problems,
        step5_funnel: funnel,
        step6_entry_decision: entry_decision,
        step7_search_keywords: search_keywords,
        step8_viewtrap_validation: viewtrap_validation,
        step9_viable_candidates: viable_candidates,
        step10_sales_logic: sales_logic,
        step11_approved_topic: approved_topic,
      };
      assembleKeyContentPlan(plan);

      return {
        ok: true,
        skill_id: 'cmo.keycontent.plan',
        data: { plan },
        insight: `키 콘텐츠 진입 단계: ${entry_decision.selected_entry_stage}, 검증 ${viable_candidates.length}건 통과`,
      };
    },
    ...overrides,
  };
}
