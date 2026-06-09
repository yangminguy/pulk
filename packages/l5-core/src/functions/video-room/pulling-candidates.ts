// CMO v3 Pulling — 풀링 주제 후보 생성 (재기획).
//
// 비전: 풀링 단계 = 사장님이 키 콘텐츠 1개를 선택한 뒤, 그 키 콘텐츠로 시청자를
// 끌어오는 풀링 주제 N개(기본 5)를 CMO가 자동 제안 → 사장님이 세트째 승인/수정.
// 각 후보 = 제목 + 선정이유 4종(소비자 단계 / 키 콘텐츠 브릿지 / 검색 수요 / 다루는 문제).
//
// 키 콘텐츠 후보와 다른 점: "1개 택1"이 아니라 퍼널을 함께 덮는 세트(4~5개)를 만든다.
// 본문구조·도입방향·CTA는 여기서 생성하지 않는다(제작 단계로).
//
// 컨벤션: key-content-candidates.ts와 동일 — llmComplete 주입 + retry + 결정론적 폴백.
// 외부 LLM SDK 직접 호출 없음. id/order/값은 인덱스 기반 결정론(Date.now/random 미사용).
// PRD 핵심 규칙: 브릿지(bridge_to_key) 없는 풀링 주제 금지 — 빈 값이면 검증 거부.

import { z } from 'zod';
import type { KeyContentDraft } from './key-content-draft';
import type { ConsumerStage } from './types';

// ── 타입 + zod 스키마 ────────────────────────────────────────────────────────

const CONSUMER_STAGES: ConsumerStage[] = ['현상', '욕구', '계획', '행동', '보상'];

/**
 * 풀링 주제 후보 한 개. 본문구조·도입방향·CTA 없음(제작 단계로).
 * selection_reasons 4종은 사장님이 "왜 이 풀링 주제인가"를 한눈에 판단하는 근거.
 */
export interface PullingCandidate {
  id: string;
  order: number;
  title: string;
  selection_reasons: {
    /** 소비자 여정 단계(현상/욕구/계획/행동/보상) 중 어디로 진입하는지. */
    consumer_stage: string;
    /** 이 풀링 주제가 선택된 키 콘텐츠로 어떻게 연결되는지 (PRD: 브릿지 필수). */
    bridge_to_key: string;
    /** Viewtrap 검색축 기반: 어떤 검색 수요/노출 가능성에 근거하는지 (실데이터는 이후 주입). */
    search_demand: string;
    /** 다루는 실제 사용자(타깃) 문제. */
    problem_addressed: string;
  };
}

export const PullingCandidateSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().positive(),
  title: z.string().min(1),
  selection_reasons: z.object({
    consumer_stage: z.string().min(1),
    bridge_to_key: z.string().min(1),
    search_demand: z.string().min(1),
    problem_addressed: z.string().min(1),
  }),
});

export interface GeneratePullingDeps {
  /** 프롬프트 → JSON 문자열. 미주입 시 결정론적 폴백. */
  llmComplete?: (prompt: string) => Promise<string>;
  /** 형식오류/검증실패 재시도 횟수 (기본 2 = 총 3회). */
  maxRetries?: number;
}

/** 풀링 후보 생성 입력: 선택된 키 콘텐츠 제목 + 분석 draft. */
export interface PullingCandidateInput {
  /** finalizeKeyContentChoice가 확정한 키 콘텐츠 제목. */
  key_topic_title: string;
  /** 분석 11스텝 산출(runKeyContentWorkflow). 카테고리·문제·검색축 컨텍스트. */
  draft: KeyContentDraft;
}

// LLM 출력 스키마 (id/order 없이 받음 — 코드가 인덱스 기반 부여) ──────────────────
const LlmPullingSchema = PullingCandidateSchema.omit({ id: true, order: true });
const LlmPullingArraySchema = z.array(LlmPullingSchema);

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function extractJsonArray(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

/** draft에서 풀링 후보 생성에 필요한 컨텍스트만 추린다. */
function draftContext(draft: KeyContentDraft) {
  const itemFeatures = draft.step2_item_fb.features.map((f) => f.item);
  const itemBenefits = draft.step2_item_fb.benefits.map((b) => b.item);
  const problems = draft.step4_problems.item_problem_candidates.map((p) => p.problem);
  const searchAxes = [
    ...draft.step7_search_keywords.problem_keywords,
    ...draft.step7_search_keywords.category_name_keywords,
    ...draft.step7_search_keywords.item_feature_benefit_keywords,
  ].filter((v, i, a) => v.trim() !== '' && a.indexOf(v) === i);
  const entryStage = draft.step6_entry_decision.selected_entry_stage;
  const category = draft.step1_generalization.customer_problem_category;
  return { itemFeatures, itemBenefits, problems, searchAxes, entryStage, category };
}

function buildPrompt(input: PullingCandidateInput, count: number): string {
  const ctx = draftContext(input.draft);
  return [
    '당신은 CMO다. 사장님이 아래 키 콘텐츠 1개를 선택했다.',
    `선택된 키 콘텐츠: "${input.key_topic_title}"`,
    '',
    `이 키 콘텐츠로 시청자를 끌어오는 풀링 주제를 정확히 ${count}개 제시하라.`,
    '풀링 주제는 서로 다른 소비자 여정 단계(현상/욕구/계획/행동/보상)를 함께 덮어야 한다.',
    '각 주제의 제목은 서로 달라야 한다(같은 주제 변형 금지).',
    '각 후보는 제목 + 선정이유 4종으로 구성한다.',
    '본문구조·도입방향·CTA는 절대 포함하지 마라(제작 단계에서 만든다).',
    '',
    `카테고리: ${ctx.category}`,
    `키 콘텐츠 진입 단계(퍼널): ${ctx.entryStage}`,
    `아이템 기능/장점: ${[...ctx.itemFeatures, ...ctx.itemBenefits].join(', ')}`,
    `실제 사용자 문제: ${ctx.problems.join(', ')}`,
    `Viewtrap 검색축: ${ctx.searchAxes.join(', ')}`,
    '',
    '선정이유 4종 의미:',
    '- consumer_stage: 현상/욕구/계획/행동/보상 중 어느 단계로 진입하는지.',
    `- bridge_to_key: 이 풀링 주제가 키 콘텐츠 "${input.key_topic_title}"로 어떻게 연결되는지 (필수, 비우지 마라).`,
    '- search_demand: 위 검색축 중 어떤 검색 수요/노출 가능성에 근거하는지.',
    '- problem_addressed: 어떤 실제 사용자 문제를 다루는지.',
    '',
    '아래 JSON 배열만 출력하라(id/order 금지). 각 문자열 필드는 비우지 마라:',
    JSON.stringify(
      Array.from({ length: count }, () => ({
        title: '',
        selection_reasons: { consumer_stage: '', bridge_to_key: '', search_demand: '', problem_addressed: '' },
      })),
      null,
      0,
    ),
  ].join('\n');
}

/** LLM 출력(id/order 없는 배열)을 검증 + 인덱스 id·order 부여. 규칙 위반 시 throw → caller 재시도. */
function assembleCandidates(rawText: string, count: number): PullingCandidate[] {
  const parsed = LlmPullingArraySchema.parse(JSON.parse(extractJsonArray(rawText)));
  if (parsed.length !== count) {
    throw new Error(`expected exactly ${count} pulling candidates, got ${parsed.length}`);
  }
  const titles = parsed.map((c) => c.title.trim());
  if (new Set(titles).size !== titles.length) {
    throw new Error('pulling candidate titles must be distinct');
  }
  return parsed.map((c, i) => PullingCandidateSchema.parse({ id: `pull-${i}`, order: i + 1, ...c }));
}

/** LLM 미사용/실패 시 결정론적 폴백. draft 필드를 서로 다른 후보로 매핑(시각/랜덤 없음). */
function buildFallbackCandidates(input: PullingCandidateInput, count: number): PullingCandidate[] {
  const ctx = draftContext(input.draft);
  const problems = ctx.problems;
  const features = [...ctx.itemFeatures, ...ctx.itemBenefits];
  const axes = ctx.searchAxes;

  return Array.from({ length: count }, (_unused, i) => {
    // 후보마다 서로 다른 문제/검색축/소비자 단계를 출발점으로 삼아 제목을 다르게 만든다.
    const problem = problems[i % Math.max(problems.length, 1)] || `${ctx.category} 핵심 문제 ${i + 1}`;
    const feature = features[i % Math.max(features.length, 1)] || `${ctx.category} 기능 ${i + 1}`;
    const axis = axes[i % Math.max(axes.length, 1)] || ctx.category;
    const stage = CONSUMER_STAGES[i % CONSUMER_STAGES.length];
    return PullingCandidateSchema.parse({
      id: `pull-${i}`,
      order: i + 1,
      // 문제 + 단계 조합으로 서로 다른 제목 (인덱스로 유일성 보장).
      title: `[풀링 ${i + 1}] ${problem} — ${stage} 단계 공략`,
      selection_reasons: {
        consumer_stage: `${stage} 단계로 진입`,
        bridge_to_key: `"${problem}"을(를) 풀어주며 자연스럽게 키 콘텐츠 "${input.key_topic_title}"로 연결`,
        search_demand: `검색축 "${axis}"의 수요로 노출 확보 (Viewtrap 실데이터는 이후 주입)`,
        problem_addressed: `다루는 실제 사용자 문제: ${problem} (관련 기능: ${feature})`,
      },
    });
  });
}

/**
 * 선택된 키 콘텐츠로 시청자를 끌어오는 풀링 주제 후보 N개(기본 5)를 생성한다.
 *
 * - llmComplete 주입 시: 재시도 포함 LLM 생성. 검증(정확히 count개·제목 서로 다름·필드 비면 throw,
 *   브릿지 필수) 통과한 결과만 사용. 모두 실패하면 결정론적 폴백.
 * - 미주입 시: 곧장 결정론적 폴백.
 *
 * 본문구조·도입방향·CTA는 생성하지 않는다(제작 단계로).
 * id는 인덱스 기반(pull-0..N-1), order는 1..N.
 */
export async function generatePullingCandidates(
  input: PullingCandidateInput,
  deps: GeneratePullingDeps = {},
  count = 5,
): Promise<PullingCandidate[]> {
  if (deps.llmComplete) {
    const prompt = buildPrompt(input, count);
    const attempts = Math.max(0, deps.maxRetries ?? 2) + 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const rawText = await deps.llmComplete(prompt);
        return assembleCandidates(rawText, count);
      } catch {
        // 형식오류/검증실패 → 재시도
      }
    }
  }
  return buildFallbackCandidates(input, count);
}

// ── 확정 (사장님 승인 → 제작 단계 입력) ───────────────────────────────────────

export interface FinalizePullingPlanResult {
  key_topic_title: string;
  pulling_topics: PullingCandidate[];
}

/**
 * 사장님이 승인한 풀링 주제 세트를 다음 단계(제작)의 입력으로 확정한다.
 * 가벼운 산출만 — 무거운 제작 필드(본문구조·도입·CTA)는 포함하지 않는다.
 * 브릿지 누락 후보가 있으면 거부(PRD: 브릿지 없는 풀링 콘텐츠 승인 금지).
 */
export function finalizePullingPlan(input: {
  key_topic_title: string;
  candidates: PullingCandidate[];
}): FinalizePullingPlanResult {
  const title = input.key_topic_title.trim();
  if (!title) throw new Error('key_topic_title must not be empty');
  if (input.candidates.length === 0) throw new Error('pulling_topics must not be empty');
  const pulling_topics = input.candidates.map((c) => {
    const parsed = PullingCandidateSchema.parse(c);
    if (parsed.selection_reasons.bridge_to_key.trim() === '') {
      throw new Error(`pulling topic ${parsed.id} has empty bridge_to_key (PRD: 브릿지 없는 풀링 콘텐츠 승인 금지)`);
    }
    return parsed;
  });
  return { key_topic_title: title, pulling_topics };
}
