// CMO v3 Key Content — LLM draft generator (반자동: CMO 초안 + 사장님 편집).
//
// PRD §3 Step 1~7,10을 CMO가 LLM으로 초안 제안한다. Step 8(Viewtrap 검증)은
// 사장님이 직접 검색해 입력(human-in-loop), Step 9(viable)·Step 11(확정)은
// 이후 단계 → draft에서 제외.
//
// 컨벤션: services/slide-deck-generator.ts와 동일하게 llmComplete 주입 +
// retry + 결정론적 폴백. 외부 LLM SDK 직접 호출 없음. id/값은 결정론적으로 부여
// (Date.now()/randomUUID() 미사용 — caller가 안정 id 패턴 주입 불필요하도록 index 기반).

import { z } from 'zod';
import type { ProductBrief, ProblemCandidate, FunnelStageItem } from './types';
import type { KeyContentViewtrapValidation, ApprovedKeyContentTopic } from './types';
import {
  buildItemGeneralization,
  buildItemFeatureBenefitMap,
  buildCategoryFeatureBenefitMap,
  deriveProblemMap,
  buildFunnelPlanningMap,
  decideKeyContentEntryStage,
  generateSearchKeywords,
  buildSalesLogicMap,
  filterSalesViableCandidates,
  buildApprovedKeyContentTopic,
  assembleKeyContentPlan,
  type KeyContentPlan,
} from './key-content-planning';

export interface DraftKeyContentInput {
  product: ProductBrief;
  /**
   * 사장님이 입력하는 "고객이 겪는 핵심 문제" (필수 최소입력의 한 축).
   * 있으면 문제 기반 역설계를 강하게 유도 → 초안 정확도↑.
   */
  customer_problem?: string;
  /** 세컨브레인 PT 인사이트 (있으면 프롬프트에 주입). */
  second_brain_insights?: string[];
}

export interface DraftKeyContentDeps {
  /** 프롬프트 → JSON 문자열. 미주입 시 결정론적 폴백. */
  llmComplete?: (prompt: string) => Promise<string>;
  /** 형식오류/검증실패 재시도 횟수 (기본 2 = 총 3회). */
  maxRetries?: number;
}

/** draft가 채우는 부분 (Step 8/9/11 제외). */
export type KeyContentDraft = Pick<
  KeyContentPlan,
  | 'step1_generalization'
  | 'step2_item_fb'
  | 'step3_category_fb'
  | 'step4_problems'
  | 'step5_funnel'
  | 'step6_entry_decision'
  | 'step7_search_keywords'
  | 'step10_sales_logic'
>;

// ── LLM 출력 스키마 (id 없이 받음 — 코드가 결정론적 id 부여) ──────────────────

const FeatureBenefitSchema = z.object({
  item: z.string().min(1),
  description: z.string().min(1),
});

const LlmDraftSchema = z.object({
  // 기존 buildXxx 스키마가 features/characteristics/benefits 모두 min(1)을 요구.
  item: z.object({
    features: z.array(FeatureBenefitSchema).min(1),
    characteristics: z.array(FeatureBenefitSchema).min(1),
    benefits: z.array(FeatureBenefitSchema).min(1),
  }),
  category: z.object({
    features: z.array(FeatureBenefitSchema).min(1),
    characteristics: z.array(FeatureBenefitSchema).min(1),
    benefits: z.array(FeatureBenefitSchema).min(1),
  }),
  problems: z.object({
    item_problems: z.array(z.object({ problem: z.string().min(1), derived_from: z.string().min(1) })).min(1),
    category_problems: z.array(z.object({ problem: z.string().min(1), derived_from: z.string().min(1) })),
  }),
  funnel: z.object({
    phenomenon: z.array(z.string()),
    desire: z.array(z.string()),
    plan: z.array(z.string()),
    action: z.array(z.string()),
    reward: z.array(z.string()),
  }),
  entry_stage: z.enum(['phenomenon', 'desire', 'plan']),
  entry_rationale: z.string().min(1),
  sales_logic: z.object({
    problem_statement: z.string().min(1),
    category_feature_benefit: z.string().min(1),
    category_need: z.string().min(1),
    item_feature_benefit: z.string().min(1),
    item_solution_statement: z.string().min(1),
    cta: z.string().min(1),
  }),
});

type LlmDraft = z.infer<typeof LlmDraftSchema>;

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

function buildPrompt(input: DraftKeyContentInput): string {
  const { product, customer_problem, second_brain_insights } = input;
  const lines: string[] = [
    '당신은 CMO다. 아래 상품으로 PRD v3 "키 콘텐츠 기획" Step 1~7,10의 초안을 만든다.',
    '상품의 기능/특징/장점이 해결하는 문제를 역으로 도출하고, 소비자 행동 5단계(현상/욕구/계획/행동/보상)',
    '퍼널에 배치해 판매 논리를 만든다. 반드시 아래 JSON 형식만 출력하라(id는 넣지 마라).',
    '',
    `상품명: ${product.product_name}`,
    `카테고리: ${product.category}`,
    `타깃 고객: ${product.target_audience}`,
    `핵심 제안: ${product.core_offer}`,
    `비즈니스 목표: ${product.business_goal}`,
  ];
  if (customer_problem?.trim()) {
    lines.push(
      `고객이 겪는 핵심 문제(반드시 중심에 둘 것): ${customer_problem.trim()}`,
      '→ 이 문제를 problems.item_problems와 funnel.phenomenon, sales_logic.problem_statement의 출발점으로 삼아라.',
    );
  }
  if (second_brain_insights?.length) {
    lines.push('', '참고할 Second Brain 인사이트:');
    for (const s of second_brain_insights) lines.push(`- ${s}`);
  }
  lines.push(
    '',
    'JSON 스키마:',
    JSON.stringify(
      {
        item: { features: [{ item: '', description: '' }], characteristics: [], benefits: [{ item: '', description: '' }] },
        category: { features: [{ item: '', description: '' }], characteristics: [], benefits: [] },
        problems: { item_problems: [{ problem: '', derived_from: '' }], category_problems: [] },
        funnel: { phenomenon: [''], desire: [''], plan: [''], action: [], reward: [] },
        entry_stage: 'phenomenon | desire | plan',
        entry_rationale: '',
        sales_logic: {
          problem_statement: '', category_feature_benefit: '', category_need: '',
          item_feature_benefit: '', item_solution_statement: '', cta: '',
        },
      },
      null,
      0,
    ),
  );
  return lines.join('\n');
}

/** LLM draft(JSON)를 기존 buildXxx로 검증된 KeyContentDraft로 조립. throw 시 caller가 재시도. */
function assembleDraft(raw: LlmDraft, product: ProductBrief): KeyContentDraft {
  const step1 = buildItemGeneralization({ product });

  const step2 = buildItemFeatureBenefitMap({
    product,
    features: raw.item.features,
    characteristics: raw.item.characteristics,
    benefits: raw.item.benefits,
  });

  const step3 = buildCategoryFeatureBenefitMap({
    generalization: step1,
    features: raw.category.features,
    characteristics: raw.category.characteristics,
    benefits: raw.category.benefits,
  });

  const item_problems: ProblemCandidate[] = raw.problems.item_problems.map((p, i) => ({
    id: `prob-item-${i}`,
    problem: p.problem,
    derived_from: p.derived_from,
  }));
  const category_problems: ProblemCandidate[] = raw.problems.category_problems.map((p, i) => ({
    id: `prob-cat-${i}`,
    problem: p.problem,
    derived_from: p.derived_from,
  }));
  const step4 = deriveProblemMap({
    item_fb: step2,
    category_fb: step3,
    item_problems,
    category_problems,
    selected_problem_ids: item_problems.map((p) => p.id),
  });

  const toStage = (arr: string[], key: string): FunnelStageItem[] =>
    arr.filter((c) => c.trim() !== '').map((content, i) => ({ id: `funnel-${key}-${i}`, content }));
  const step5 = buildFunnelPlanningMap({
    phenomenon: toStage(raw.funnel.phenomenon, 'phenomenon'),
    desire: toStage(raw.funnel.desire, 'desire'),
    plan: toStage(raw.funnel.plan, 'plan'),
    action: toStage(raw.funnel.action, 'action'),
    reward: toStage(raw.funnel.reward, 'reward'),
  });

  const step6 = decideKeyContentEntryStage({
    funnel: step5,
    selected_entry_stage: raw.entry_stage,
    rationale: raw.entry_rationale,
  });

  const step7 = generateSearchKeywords({
    generalization: step1,
    item_fb: step2,
    category_fb: step3,
    problems: step4,
  });

  const step10 = buildSalesLogicMap(raw.sales_logic);

  return {
    step1_generalization: step1,
    step2_item_fb: step2,
    step3_category_fb: step3,
    step4_problems: step4,
    step5_funnel: step5,
    step6_entry_decision: step6,
    step7_search_keywords: step7,
    step10_sales_logic: step10,
  };
}

/** LLM 미사용/실패 시 결정론적 최소 초안 (product만으로). 사장님이 편집할 출발점. */
function buildFallbackDraft(input: DraftKeyContentInput): KeyContentDraft {
  const { product } = input;
  // 사장님이 적은 고객 문제가 있으면 그것을 problems/funnel/sales_logic의 출발점으로.
  const coreProblem = input.customer_problem?.trim() || `${product.target_audience}이(가) 겪는 핵심 문제`;
  const fb: LlmDraft = {
    item: {
      features: [{ item: product.core_offer, description: `${product.product_name}의 핵심 기능` }],
      characteristics: [{ item: `${product.product_name} 방식`, description: '동작 방식 (사장님 편집 필요)' }],
      benefits: [{ item: `${product.target_audience}에게 도움`, description: product.core_offer }],
    },
    category: {
      features: [{ item: product.category, description: `${product.category} 일반 기능` }],
      characteristics: [{ item: `${product.category} 방식`, description: '카테고리 동작 방식 (사장님 편집 필요)' }],
      benefits: [{ item: `${product.category} 가치`, description: '카테고리가 주는 가치 (사장님 편집 필요)' }],
    },
    problems: {
      item_problems: [{ problem: coreProblem, derived_from: product.core_offer }],
      category_problems: [],
    },
    funnel: {
      phenomenon: [`${product.target_audience}이(가) "${coreProblem}"을(를) 마주치는 상황`],
      desire: [`문제를 해결하고 싶은 마음`],
      plan: [],
      action: [],
      reward: [],
    },
    entry_stage: 'phenomenon',
    entry_rationale: '초안: 문제 공감부터 시작 (사장님 편집 필요)',
    sales_logic: {
      problem_statement: coreProblem,
      category_feature_benefit: `${product.category}가 주는 가치`,
      category_need: `${product.category}가 필요한 이유`,
      item_feature_benefit: product.core_offer,
      item_solution_statement: `${product.product_name}이(가) 문제를 해결`,
      cta: '지금 시작하기',
    },
  };
  return assembleDraft(fb, product);
}

/**
 * @deprecated 1회-LLM 통째 초안 생성. PRD §3 워크플로우를 "각 스텝이 이전 스텝을
 * 입력으로 순차 추론·검증·누적"하도록 재설계한 {@link runKeyContentWorkflow}를 사용하라.
 * 하위호환을 위해 유지한다(시그니처/동작 동일).
 *
 * CMO 키 콘텐츠 초안 생성 (PRD §3 Step 1~7,10).
 * - llmComplete 주입 시: 재시도 포함 LLM 생성, 모두 실패하면 결정론적 폴백.
 * - 미주입 시: 곧장 폴백.
 * 항상 기존 buildXxx로 검증된 산출물만 반환 → 사장님이 편집할 출발점.
 */
export async function draftKeyContentPlan(
  input: DraftKeyContentInput,
  deps: DraftKeyContentDeps = {},
): Promise<{ draft: KeyContentDraft; source: 'llm' | 'fallback' }> {
  if (deps.llmComplete) {
    const prompt = buildPrompt(input);
    const attempts = Math.max(0, deps.maxRetries ?? 2) + 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const rawText = await deps.llmComplete(prompt);
        const parsed = LlmDraftSchema.parse(JSON.parse(extractJson(rawText)));
        return { draft: assembleDraft(parsed, input.product), source: 'llm' };
      } catch {
        // 형식오류/검증실패 → 재시도
      }
    }
  }
  return { draft: buildFallbackDraft(input), source: 'fallback' };
}

// ════════════════════════════════════════════════════════════════════════════
// 순차 워크플로우 (PRD §3 Step 1~7,10) — 각 스텝이 이전 스텝 산출물을 입력으로
// 그 스텝만 LLM 추론 → buildXxx 검증(throw 시 재시도) → 누적. 스텝 단위 폴백.
// 시각/랜덤 함수 미사용 — id는 모두 인덱스 기반 결정론.
// ════════════════════════════════════════════════════════════════════════════

export interface RunKeyContentWorkflowResult {
  steps: KeyContentDraft;
  /** 완료(채워진) 스텝 수. Step1~7,10 = 최대 8. */
  progress: number;
  draft: KeyContentDraft;
}

// 스텝별 LLM 출력 스키마 (id 없이 — 코드가 결정론적 id 부여) ────────────────────

const FbTripleSchema = z.object({
  features: z.array(FeatureBenefitSchema).min(1),
  characteristics: z.array(FeatureBenefitSchema).min(1),
  benefits: z.array(FeatureBenefitSchema).min(1),
});

const Step2Schema = z.object({ item: FbTripleSchema });
const Step3Schema = z.object({ category: FbTripleSchema });
const Step4Schema = z.object({
  item_problems: z.array(z.object({ problem: z.string().min(1), derived_from: z.string().min(1) })).min(1),
  category_problems: z.array(z.object({ problem: z.string().min(1), derived_from: z.string().min(1) })),
});
const Step5Schema = z.object({
  phenomenon: z.array(z.string()),
  desire: z.array(z.string()),
  plan: z.array(z.string()),
  action: z.array(z.string()),
  reward: z.array(z.string()),
});
const Step6Schema = z.object({
  entry_stage: z.enum(['phenomenon', 'desire', 'plan']),
  entry_rationale: z.string().min(1),
});
const Step10Schema = z.object({
  problem_statement: z.string().min(1),
  category_feature_benefit: z.string().min(1),
  category_need: z.string().min(1),
  item_feature_benefit: z.string().min(1),
  item_solution_statement: z.string().min(1),
  cta: z.string().min(1),
});

/** 한 LLM 스텝: 프롬프트 생성 → 재시도 루프(parse+검증) → 실패 시 그 스텝만 폴백. */
async function runLlmStep<T>(args: {
  llmComplete?: (prompt: string) => Promise<string>;
  attempts: number;
  prompt: string;
  /** raw JSON → 검증된 스텝 산출물. throw 시 재시도. */
  build: (rawText: string) => T;
  /** 결정론적 스텝 폴백. */
  fallback: () => T;
}): Promise<{ value: T; ok: boolean }> {
  if (args.llmComplete) {
    for (let i = 0; i < args.attempts; i++) {
      try {
        const rawText = await args.llmComplete(args.prompt);
        return { value: args.build(rawText), ok: true };
      } catch {
        // 형식오류/검증실패 → 재시도
      }
    }
  }
  return { value: args.fallback(), ok: false };
}

// id 부여 헬퍼 (인덱스 기반 결정론) ──────────────────────────────────────────

function toProblemCandidates(
  arr: { problem: string; derived_from: string }[],
  prefix: string,
): ProblemCandidate[] {
  return arr.map((p, i) => ({ id: `${prefix}-${i}`, problem: p.problem, derived_from: p.derived_from }));
}

function toFunnelStage(arr: string[], key: string): FunnelStageItem[] {
  return arr.filter((c) => c.trim() !== '').map((content, i) => ({ id: `funnel-${key}-${i}`, content }));
}

// 스텝별 프롬프트 (이전 스텝 산출물을 컨텍스트로 주입) ──────────────────────────

function ctxHeader(input: DraftKeyContentInput): string {
  const { product, second_brain_insights } = input;
  const lines = [
    `상품명: ${product.product_name}`,
    `카테고리: ${product.category}`,
    `타깃 고객: ${product.target_audience}`,
    `핵심 제안: ${product.core_offer}`,
    `비즈니스 목표: ${product.business_goal}`,
  ];
  if (second_brain_insights?.length) {
    lines.push('참고 Second Brain 인사이트:');
    for (const s of second_brain_insights) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

function jsonBlock(label: string, value: unknown): string {
  return `${label}:\n${JSON.stringify(value, null, 0)}`;
}

function step2Prompt(input: DraftKeyContentInput, step1: KeyContentDraft['step1_generalization']): string {
  return [
    '당신은 CMO다. PRD v3 Step 2: 내 아이템의 기능/특징/장점을 정리하라.',
    '기능=무엇을 하는가, 특징=어떤 방식으로, 장점=고객에게 왜 좋은가.',
    ctxHeader(input),
    jsonBlock('이전 Step 1 (아이템 일반화)', step1),
    '아래 JSON만 출력(id 금지). 각 배열 최소 1개:',
    JSON.stringify({ item: { features: [{ item: '', description: '' }], characteristics: [{ item: '', description: '' }], benefits: [{ item: '', description: '' }] } }, null, 0),
  ].join('\n');
}

function step3Prompt(
  input: DraftKeyContentInput,
  step1: KeyContentDraft['step1_generalization'],
): string {
  // R3: 카테고리 수준 FB는 step1(일반화)만으로 도출 — 아이템 FB(step2)에 의존하지 않는다.
  // 덕분에 step2와 step3를 병렬 실행할 수 있다(build도 step1만 사용). DECISIONS.md "R3" 참조.
  return [
    '당신은 CMO다. PRD v3 Step 3: 내 아이템이 속한 카테고리의 기능/특징/장점을 정리하라.',
    '상품 자체가 아니라 고객이 이해하는 카테고리 수준에서 작성.',
    ctxHeader(input),
    jsonBlock('이전 Step 1 (아이템 일반화)', step1),
    '아래 JSON만 출력(id 금지). 각 배열 최소 1개:',
    JSON.stringify({ category: { features: [{ item: '', description: '' }], characteristics: [{ item: '', description: '' }], benefits: [{ item: '', description: '' }] } }, null, 0),
  ].join('\n');
}

function step4Prompt(
  input: DraftKeyContentInput,
  step2: KeyContentDraft['step2_item_fb'],
  step3: KeyContentDraft['step3_category_fb'],
): string {
  const lines = [
    '당신은 CMO다. PRD v3 Step 4: 아이템/카테고리의 기능·특징·장점이 해결하는 문제를 역으로 도출하라.',
    ctxHeader(input),
  ];
  if (input.customer_problem?.trim()) {
    lines.push(`고객이 겪는 핵심 문제(반드시 item_problems의 출발점): ${input.customer_problem.trim()}`);
  }
  lines.push(
    jsonBlock('이전 Step 2 (아이템 기능/특징/장점)', step2),
    jsonBlock('이전 Step 3 (카테고리 기능/특징/장점)', step3),
    '아래 JSON만 출력(id 금지). item_problems 최소 1개:',
    JSON.stringify({ item_problems: [{ problem: '', derived_from: '' }], category_problems: [] }, null, 0),
  );
  return lines.join('\n');
}

function step5Prompt(input: DraftKeyContentInput, step4: KeyContentDraft['step4_problems']): string {
  return [
    '당신은 CMO다. PRD v3 Step 5: 문제 후보를 소비자 행동 5단계(현상/욕구/계획/행동/보상) 퍼널에 배치하라.',
    '최소 2개 단계는 반드시 채운다.',
    ctxHeader(input),
    jsonBlock('이전 Step 4 (도출된 문제)', step4),
    '아래 JSON만 출력(id 금지). 각 값은 문자열 배열:',
    JSON.stringify({ phenomenon: [''], desire: [''], plan: [], action: [], reward: [] }, null, 0),
  ].join('\n');
}

function step6Prompt(input: DraftKeyContentInput, step5: KeyContentDraft['step5_funnel']): string {
  return [
    '당신은 CMO다. PRD v3 Step 6: 키 콘텐츠가 어느 진입 단계에서 시작해야 판매 논리가 자연스러운지 결정하라.',
    "entry_stage는 'phenomenon'|'desire'|'plan' 중 하나. rationale 필수.",
    ctxHeader(input),
    jsonBlock('이전 Step 5 (퍼널)', step5),
    '아래 JSON만 출력:',
    JSON.stringify({ entry_stage: 'phenomenon', entry_rationale: '' }, null, 0),
  ].join('\n');
}

// R-M7: step10(설득 구조)은 step1~5만으로 충분 — buildSalesLogicMap은 cross-step 검증이
// 없고(6개 문자열 자기검증만), 판매 논리 필드(문제→카테고리FB→필요성→아이템FB→제안→CTA)는
// step1~5에서 도출된다. step6(진입 단계 라벨)은 퍼널 시퀀싱일 뿐 설득 콘텐츠와 직교 →
// step10 프롬프트에서 제외해 step6과 병렬 실행한다. DECISIONS.md "R-M7" 참조.
function step10Prompt(
  input: DraftKeyContentInput,
  ctx: Pick<
    KeyContentDraft,
    'step1_generalization' | 'step2_item_fb' | 'step3_category_fb' | 'step4_problems' | 'step5_funnel'
  >,
): string {
  return [
    '당신은 CMO다. PRD v3 Step 10: 설득 구조를 만들어라.',
    '순서: 문제 제시 → 카테고리 기능/특징/장점 → 카테고리 필요성 → 아이템 기능/특징/장점 → 아이템 제안 → CTA.',
    ctxHeader(input),
    jsonBlock('누적 Step 1 (일반화)', ctx.step1_generalization),
    jsonBlock('누적 Step 2 (아이템 FB)', ctx.step2_item_fb),
    jsonBlock('누적 Step 3 (카테고리 FB)', ctx.step3_category_fb),
    jsonBlock('누적 Step 4 (문제)', ctx.step4_problems),
    jsonBlock('누적 Step 5 (퍼널)', ctx.step5_funnel),
    '아래 JSON만 출력:',
    JSON.stringify({ problem_statement: '', category_feature_benefit: '', category_need: '', item_feature_benefit: '', item_solution_statement: '', cta: '' }, null, 0),
  ].join('\n');
}

// 스텝별 결정론적 폴백 (이전 스텝 + product 기반, 그 스텝만) ──────────────────

function fallbackStep2(product: ProductBrief): KeyContentDraft['step2_item_fb'] {
  return buildItemFeatureBenefitMap({
    product,
    features: [{ item: product.core_offer, description: `${product.product_name}의 핵심 기능` }],
    characteristics: [{ item: `${product.product_name} 방식`, description: '동작 방식 (사장님 편집 필요)' }],
    benefits: [{ item: `${product.target_audience}에게 도움`, description: product.core_offer }],
  });
}

function fallbackStep3(
  step1: KeyContentDraft['step1_generalization'],
  product: ProductBrief,
): KeyContentDraft['step3_category_fb'] {
  return buildCategoryFeatureBenefitMap({
    generalization: step1,
    features: [{ item: product.category, description: `${product.category} 일반 기능` }],
    characteristics: [{ item: `${product.category} 방식`, description: '카테고리 동작 방식 (사장님 편집 필요)' }],
    benefits: [{ item: `${product.category} 가치`, description: '카테고리가 주는 가치 (사장님 편집 필요)' }],
  });
}

function fallbackStep4(
  input: DraftKeyContentInput,
  step2: KeyContentDraft['step2_item_fb'],
  step3: KeyContentDraft['step3_category_fb'],
): KeyContentDraft['step4_problems'] {
  const coreProblem =
    input.customer_problem?.trim() || `${input.product.target_audience}이(가) 겪는 핵심 문제`;
  const item_problems = toProblemCandidates(
    [{ problem: coreProblem, derived_from: input.product.core_offer }],
    'prob-item',
  );
  return deriveProblemMap({
    item_fb: step2,
    category_fb: step3,
    item_problems,
    category_problems: [],
    selected_problem_ids: item_problems.map((p) => p.id),
  });
}

function fallbackStep5(
  input: DraftKeyContentInput,
  step4: KeyContentDraft['step4_problems'],
): KeyContentDraft['step5_funnel'] {
  const coreProblem =
    step4.item_problem_candidates[0]?.problem ||
    input.customer_problem?.trim() ||
    `${input.product.target_audience}이(가) 겪는 핵심 문제`;
  return buildFunnelPlanningMap({
    phenomenon: toFunnelStage([`${input.product.target_audience}이(가) "${coreProblem}"을(를) 마주치는 상황`], 'phenomenon'),
    desire: toFunnelStage(['문제를 해결하고 싶은 마음'], 'desire'),
    plan: [],
    action: [],
    reward: [],
  });
}

function fallbackStep6(step5: KeyContentDraft['step5_funnel']): KeyContentDraft['step6_entry_decision'] {
  return decideKeyContentEntryStage({
    funnel: step5,
    selected_entry_stage: 'phenomenon',
    rationale: '초안: 문제 공감부터 시작 (사장님 편집 필요)',
  });
}

function fallbackStep10(
  input: DraftKeyContentInput,
  step4: KeyContentDraft['step4_problems'],
): KeyContentDraft['step10_sales_logic'] {
  const { product } = input;
  const coreProblem =
    step4.item_problem_candidates[0]?.problem ||
    input.customer_problem?.trim() ||
    `${product.target_audience}이(가) 겪는 핵심 문제`;
  return buildSalesLogicMap({
    problem_statement: coreProblem,
    category_feature_benefit: `${product.category}가 주는 가치`,
    category_need: `${product.category}가 필요한 이유`,
    item_feature_benefit: product.core_offer,
    item_solution_statement: `${product.product_name}이(가) 문제를 해결`,
    cta: '지금 시작하기',
  });
}

/**
 * PRD §3 키 콘텐츠 11스텝(Step 1~7,10) 순차 워크플로우.
 *
 * 각 LLM 스텝은 이전 스텝의 검증된 산출물을 프롬프트 컨텍스트로 받아 그 스텝만 추론(JSON)하고,
 * 해당 buildXxx로 검증한다(throw 시 maxRetries만큼 재시도). 실패하면 전체가 아니라 그 스텝만
 * 결정론적으로 폴백하고 다음 스텝으로 진행한다. 누적된 산출물이 다음 스텝의 입력이 된다.
 *
 * - Step 1 (일반화), Step 7 (검색축)은 결정론 — LLM 호출 없음.
 * - Step 2~6, 10이 LLM 스텝. id는 모두 인덱스 기반(prob-item-i, funnel-<stage>-i).
 * - Step 8(Viewtrap)·9(viable)·11(확정)은 이 함수 범위 밖 → finalizeKeyContentPlan.
 */
export async function runKeyContentWorkflow(
  input: DraftKeyContentInput,
  deps: DraftKeyContentDeps = {},
): Promise<RunKeyContentWorkflowResult> {
  const { product } = input;
  const attempts = Math.max(0, deps.maxRetries ?? 2) + 1;
  let progress = 0;

  // Step 1 — 결정론 (항상 성공).
  const step1 = buildItemGeneralization({ product });
  progress++;

  // Step 2 ‖ Step 3 — 둘 다 step1만 의존(서로 독립) → 병렬 실행으로 cold-spawn 1회 절감.
  // R3 속도 최적화: 선형 체인 중 유일하게 독립인 쌍. DECISIONS.md "R3" 참조.
  const [r2, r3] = await Promise.all([
    runLlmStep({
      llmComplete: deps.llmComplete,
      attempts,
      prompt: step2Prompt(input, step1),
      build: (rawText) => {
        const p = Step2Schema.parse(JSON.parse(extractJson(rawText)));
        return buildItemFeatureBenefitMap({ product, ...p.item });
      },
      fallback: () => fallbackStep2(product),
    }),
    runLlmStep({
      llmComplete: deps.llmComplete,
      attempts,
      prompt: step3Prompt(input, step1),
      build: (rawText) => {
        const p = Step3Schema.parse(JSON.parse(extractJson(rawText)));
        return buildCategoryFeatureBenefitMap({ generalization: step1, ...p.category });
      },
      fallback: () => fallbackStep3(step1, product),
    }),
  ]);
  const step2 = r2.value;
  const step3 = r3.value;
  progress += 2;

  // Step 4 — LLM(step2, step3, customer_problem). id 인덱스 결정론.
  const r4 = await runLlmStep({
    llmComplete: deps.llmComplete,
    attempts,
    prompt: step4Prompt(input, step2, step3),
    build: (rawText) => {
      const p = Step4Schema.parse(JSON.parse(extractJson(rawText)));
      const item_problems = toProblemCandidates(p.item_problems, 'prob-item');
      const category_problems = toProblemCandidates(p.category_problems, 'prob-cat');
      return deriveProblemMap({
        item_fb: step2,
        category_fb: step3,
        item_problems,
        category_problems,
        selected_problem_ids: item_problems.map((x) => x.id),
      });
    },
    fallback: () => fallbackStep4(input, step2, step3),
  });
  const step4 = r4.value;
  progress++;

  // Step 5 — LLM(step4). id 인덱스 결정론.
  const r5 = await runLlmStep({
    llmComplete: deps.llmComplete,
    attempts,
    prompt: step5Prompt(input, step4),
    build: (rawText) => {
      const p = Step5Schema.parse(JSON.parse(extractJson(rawText)));
      return buildFunnelPlanningMap({
        phenomenon: toFunnelStage(p.phenomenon, 'phenomenon'),
        desire: toFunnelStage(p.desire, 'desire'),
        plan: toFunnelStage(p.plan, 'plan'),
        action: toFunnelStage(p.action, 'action'),
        reward: toFunnelStage(p.reward, 'reward'),
      });
    },
    fallback: () => fallbackStep5(input, step4),
  });
  const step5 = r5.value;
  progress++;

  // Step 7 — 결정론 (step1~4 기반, 항상 성공). step6/step10에 의존하지 않으므로 먼저 계산.
  const step7 = generateSearchKeywords({
    generalization: step1,
    item_fb: step2,
    category_fb: step3,
    problems: step4,
  });

  // Step 6 ‖ Step 10 — 둘 다 step5까지만 의존(서로 독립). step6은 step5 퍼널에서 진입 단계를
  // 정하고, step10은 step1~5에서 설득 구조를 만든다. step10이 step6 산출물을 쓰지 않으므로
  // (buildSalesLogicMap은 cross-step 검증 없음) 병렬 실행해 LLM 라운드 1회 절감. R-M7.
  const step10Ctx = {
    step1_generalization: step1,
    step2_item_fb: step2,
    step3_category_fb: step3,
    step4_problems: step4,
    step5_funnel: step5,
  };
  const [r6, r10] = await Promise.all([
    runLlmStep({
      llmComplete: deps.llmComplete,
      attempts,
      prompt: step6Prompt(input, step5),
      build: (rawText) => {
        const p = Step6Schema.parse(JSON.parse(extractJson(rawText)));
        return decideKeyContentEntryStage({
          funnel: step5,
          selected_entry_stage: p.entry_stage,
          rationale: p.entry_rationale,
        });
      },
      fallback: () => fallbackStep6(step5),
    }),
    runLlmStep({
      llmComplete: deps.llmComplete,
      attempts,
      prompt: step10Prompt(input, step10Ctx),
      build: (rawText) => {
        const p = Step10Schema.parse(JSON.parse(extractJson(rawText)));
        return buildSalesLogicMap(p);
      },
      fallback: () => fallbackStep10(input, step4),
    }),
  ]);
  const step6 = r6.value;
  const step10 = r10.value;
  progress += 3; // step6 + step7 + step10

  const draft: KeyContentDraft = {
    step1_generalization: step1,
    step2_item_fb: step2,
    step3_category_fb: step3,
    step4_problems: step4,
    step5_funnel: step5,
    step6_entry_decision: step6,
    step7_search_keywords: step7,
    step10_sales_logic: step10,
  };
  return { steps: draft, progress, draft };
}

// ── 확정 조립 (Step 8 Viewtrap + Step 11 사장님 입력 → 전체 KeyContentPlan) ─────

/** 사장님이 Step 11에서 입력/확정하는 부분 (entry_stage·sales_logic·viewtrap은 앞 단계서 채워짐). */
export interface ApprovedTopicInput {
  title: string;
  thumbnail_promise: string;
  intro_direction: string;
  body_structure: string[];
  cta: string;
}

/**
 * 편집 완료된 draft(Step 1~7,10) + 사장님이 입력한 Step 8 Viewtrap 검증 +
 * Step 11 확정 입력을 합쳐 검증된 전체 KeyContentPlan으로 조립.
 * Step 9(viable)는 Step 8 검증 결과로 결정론적 산정. 기존 buildApprovedKeyContentTopic /
 * assembleKeyContentPlan의 모든 cross-step throw 규칙을 그대로 통과해야 한다.
 */
export function finalizeKeyContentPlan(input: {
  draft: KeyContentDraft;
  viewtrap_validation: KeyContentViewtrapValidation;
  approved: ApprovedTopicInput;
}): KeyContentPlan {
  const { draft, viewtrap_validation, approved } = input;

  const step9_viable_candidates = filterSalesViableCandidates([viewtrap_validation]);

  const step11_approved_topic: ApprovedKeyContentTopic = buildApprovedKeyContentTopic({
    title: approved.title,
    thumbnail_promise: approved.thumbnail_promise,
    entry_stage: draft.step6_entry_decision.selected_entry_stage,
    sales_logic: draft.step10_sales_logic,
    viewtrap_validation,
    intro_direction: approved.intro_direction,
    body_structure: approved.body_structure,
    cta: approved.cta,
  });

  return assembleKeyContentPlan({
    step1_generalization: draft.step1_generalization,
    step2_item_fb: draft.step2_item_fb,
    step3_category_fb: draft.step3_category_fb,
    step4_problems: draft.step4_problems,
    step5_funnel: draft.step5_funnel,
    step6_entry_decision: draft.step6_entry_decision,
    step7_search_keywords: draft.step7_search_keywords,
    step8_viewtrap_validation: viewtrap_validation,
    step9_viable_candidates,
    step10_sales_logic: draft.step10_sales_logic,
    step11_approved_topic,
  });
}
