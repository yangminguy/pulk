// CMO v3 Key Content — 주제 후보 생성 (재기획).
//
// 비전: 키 콘텐츠 단계 = CMO 자동분석(runKeyContentWorkflow) → 서로 다른 각도의
// 주제 후보 N개(기본 3) 제시 → 사장님이 1개 선택. 각 후보 = 제목 + 썸네일 약속 +
// 선정이유 4종(Viewtrap 검색축 / 기능·특징·장점 / 실제 사용자 문제 / 퍼널 적용).
//
// 본문구조·도입방향·CTA는 여기서 생성하지 않는다(제작 단계로). 분석 11스텝은
// runKeyContentWorkflow가 이미 수행한 KeyContentDraft를 입력으로 받는다(재구현 금지).
//
// 컨벤션: key-content-draft.ts와 동일 — llmComplete 주입 + retry + 결정론적 폴백.
// 외부 LLM SDK 직접 호출 없음. id/값은 인덱스 기반 결정론(Date.now/random 미사용).

import { z } from 'zod';
import type { KeyContentDraft } from './key-content-draft';

// ── 타입 + zod 스키마 ────────────────────────────────────────────────────────

/**
 * 키 콘텐츠 주제 후보 한 개. 본문구조·도입방향·CTA 없음(제작 단계로).
 * selection_reasons 4종은 사장님이 "왜 이 주제인가"를 한눈에 판단하는 근거.
 */
export interface KeyContentCandidate {
  id: string;
  title: string;
  thumbnail_promise: string;
  selection_reasons: {
    /** Viewtrap 검색축 기반: 이 검색축에서 검증될 주제 (실데이터는 이후 주입). */
    viewtrap: string;
    /** 아이템/카테고리 기능·특징·장점 기반. */
    feature_benefit: string;
    /** 실제 사용자(타깃) 문제 기반. */
    customer_problem: string;
    /** 현상/욕구/계획/행동/보상 퍼널 적용: 어느 단계 진입·어떻게 적용. */
    funnel_application: string;
  };
}

export const KeyContentCandidateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  thumbnail_promise: z.string().min(1),
  selection_reasons: z.object({
    viewtrap: z.string().min(1),
    feature_benefit: z.string().min(1),
    customer_problem: z.string().min(1),
    funnel_application: z.string().min(1),
  }),
});

export interface GenerateCandidatesDeps {
  /** 프롬프트 → JSON 문자열. 미주입 시 결정론적 폴백. */
  llmComplete?: (prompt: string) => Promise<string>;
  /** 형식오류/검증실패 재시도 횟수 (기본 2 = 총 3회). */
  maxRetries?: number;
}

// LLM 출력 스키마 (id 없이 받음 — 코드가 인덱스 기반 id 부여) ────────────────────
const LlmCandidateSchema = KeyContentCandidateSchema.omit({ id: true });
const LlmCandidatesSchema = z.array(LlmCandidateSchema);

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function extractJsonArray(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

/** draft에서 후보 생성에 필요한 컨텍스트만 추린다. */
function draftContext(draft: KeyContentDraft) {
  const itemFeatures = draft.step2_item_fb.features.map((f) => f.item);
  const itemBenefits = draft.step2_item_fb.benefits.map((b) => b.item);
  const categoryFeatures = draft.step3_category_fb.features.map((f) => f.item);
  const problems = draft.step4_problems.item_problem_candidates.map((p) => p.problem);
  const searchAxes = [
    ...draft.step7_search_keywords.problem_keywords,
    ...draft.step7_search_keywords.category_name_keywords,
    ...draft.step7_search_keywords.item_feature_benefit_keywords,
  ].filter((v, i, a) => v.trim() !== '' && a.indexOf(v) === i);
  const entryStage = draft.step6_entry_decision.selected_entry_stage;
  const category = draft.step1_generalization.customer_problem_category;
  return { itemFeatures, itemBenefits, categoryFeatures, problems, searchAxes, entryStage, category };
}

function buildPrompt(draft: KeyContentDraft, count: number): string {
  const ctx = draftContext(draft);
  return [
    '당신은 CMO다. 아래 분석 결과를 바탕으로 서로 다른 각도의 키 콘텐츠 주제 후보를',
    `정확히 ${count}개 제시하라. 각 후보의 제목은 서로 달라야 한다(같은 주제 변형 금지).`,
    '각 후보는 제목 + 썸네일 약속 + 선정이유 4종으로 구성한다.',
    '본문구조·도입방향·CTA는 절대 포함하지 마라(제작 단계에서 만든다).',
    '',
    `카테고리: ${ctx.category}`,
    `진입 단계(퍼널): ${ctx.entryStage}`,
    `아이템 기능/장점: ${[...ctx.itemFeatures, ...ctx.itemBenefits].join(', ')}`,
    `카테고리 기능: ${ctx.categoryFeatures.join(', ')}`,
    `실제 사용자 문제: ${ctx.problems.join(', ')}`,
    `Viewtrap 검색축: ${ctx.searchAxes.join(', ')}`,
    '',
    '선정이유 4종 의미:',
    '- viewtrap: 위 검색축에서 검증될 주제임을 설명 (실데이터는 이후 주입).',
    '- feature_benefit: 어떤 기능/특징/장점에 근거하는지.',
    '- customer_problem: 어떤 실제 사용자 문제를 다루는지.',
    '- funnel_application: 어느 퍼널 단계로 진입하고 어떻게 적용하는지.',
    '',
    '아래 JSON 배열만 출력하라(id 금지). 각 문자열 필드는 비우지 마라:',
    JSON.stringify(
      Array.from({ length: count }, () => ({
        title: '',
        thumbnail_promise: '',
        selection_reasons: { viewtrap: '', feature_benefit: '', customer_problem: '', funnel_application: '' },
      })),
      null,
      0,
    ),
  ].join('\n');
}

/** LLM 출력(id 없는 배열)을 검증 + 인덱스 id 부여. 규칙 위반 시 throw → caller 재시도. */
function assembleCandidates(rawText: string, count: number): KeyContentCandidate[] {
  const parsed = LlmCandidatesSchema.parse(JSON.parse(extractJsonArray(rawText)));
  if (parsed.length !== count) {
    throw new Error(`expected exactly ${count} candidates, got ${parsed.length}`);
  }
  const titles = parsed.map((c) => c.title.trim());
  if (new Set(titles).size !== titles.length) {
    throw new Error('candidate titles must be distinct');
  }
  return parsed.map((c, i) => KeyContentCandidateSchema.parse({ id: `cand-${i}`, ...c }));
}

/** LLM 미사용/실패 시 결정론적 폴백. draft 필드를 서로 다른 후보로 매핑(시각/랜덤 없음). */
function buildFallbackCandidates(draft: KeyContentDraft, count: number): KeyContentCandidate[] {
  const ctx = draftContext(draft);
  const problems = ctx.problems;
  const features = [...ctx.itemFeatures, ...ctx.itemBenefits, ...ctx.categoryFeatures];
  const axes = ctx.searchAxes;

  return Array.from({ length: count }, (_unused, i) => {
    // 후보마다 서로 다른 문제/기능을 출발점으로 삼아 제목을 다르게 만든다.
    const problem = problems[i % Math.max(problems.length, 1)] || `${ctx.category} 핵심 문제 ${i + 1}`;
    const feature = features[i % Math.max(features.length, 1)] || `${ctx.category} 기능 ${i + 1}`;
    const axis = axes[i % Math.max(axes.length, 1)] || ctx.category;
    return KeyContentCandidateSchema.parse({
      id: `cand-${i}`,
      // 문제 + 카테고리 조합으로 서로 다른 제목 (인덱스로 유일성 보장).
      title: `[${i + 1}] ${problem} — ${ctx.category} 관점`,
      thumbnail_promise: `${feature}로 "${problem}"을(를) 해결`,
      selection_reasons: {
        viewtrap: `검색축 "${axis}"에서 검증될 주제 (Viewtrap 실데이터는 이후 주입)`,
        feature_benefit: `근거 기능/장점: ${feature}`,
        customer_problem: `다루는 실제 사용자 문제: ${problem}`,
        funnel_application: `${ctx.entryStage} 단계로 진입해 "${problem}"을(를) 풀어낸다`,
      },
    });
  });
}

/**
 * 분석 결과(KeyContentDraft)로 서로 다른 각도의 키 콘텐츠 주제 후보 N개(기본 3)를 생성한다.
 *
 * - llmComplete 주입 시: 재시도 포함 LLM 생성. 검증(정확히 count개·제목 서로 다름·필드 비면 throw)
 *   통과한 결과만 사용. 모두 실패하면 결정론적 폴백.
 * - 미주입 시: 곧장 결정론적 폴백.
 *
 * 본문구조·도입방향·CTA는 생성하지 않는다(제작 단계로). id는 인덱스 기반(cand-0..N-1).
 */
export async function generateKeyContentCandidates(
  draft: KeyContentDraft,
  deps: GenerateCandidatesDeps = {},
  count = 3,
): Promise<KeyContentCandidate[]> {
  if (deps.llmComplete) {
    const prompt = buildPrompt(draft, count);
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
  return buildFallbackCandidates(draft, count);
}

// ── 확정 (사장님 선택 → 풀링 단계 입력) ───────────────────────────────────────

export interface FinalizeKeyContentChoiceResult {
  selected: KeyContentCandidate;
  key_topic_title: string;
  entry_stage: string;
}

/**
 * 사장님이 고른 후보를 다음 단계(풀링)의 입력으로 확정한다.
 * 가벼운 산출만 — 무거운 제작 필드(본문구조·도입·CTA)는 포함하지 않는다.
 * entry_stage는 분석 단계에서 결정된 draft.step6 값을 그대로 잇는다.
 */
export function finalizeKeyContentChoice(input: {
  candidate: KeyContentCandidate;
  draft: KeyContentDraft;
}): FinalizeKeyContentChoiceResult {
  const selected = KeyContentCandidateSchema.parse(input.candidate);
  return {
    selected,
    key_topic_title: selected.title,
    entry_stage: input.draft.step6_entry_decision.selected_entry_stage,
  };
}
