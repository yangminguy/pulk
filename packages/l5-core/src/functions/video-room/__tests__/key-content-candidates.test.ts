import {
  generateKeyContentCandidates,
  finalizeKeyContentChoice,
  KeyContentCandidateSchema,
} from '../key-content-candidates';
import { runKeyContentWorkflow } from '../key-content-draft';
import type { KeyContentDraft } from '../key-content-draft';
import type { ProductBrief } from '../types';

const product: ProductBrief = {
  product_name: 'AI 마케팅팀',
  category: '콘텐츠 마케팅 시스템',
  target_audience: '작은 브랜드 대표',
  core_offer: '콘텐츠 기획을 자동으로 구조화',
  business_goal: 'consulting_lead',
};

// 분석 11스텝(runKeyContentWorkflow)을 재사용해 결정론적 draft를 만든다.
async function makeDraft(): Promise<KeyContentDraft> {
  const { draft } = await runKeyContentWorkflow({
    product,
    customer_problem: '콘텐츠가 매출로 안 이어진다',
  });
  return draft;
}

function makeLlmCandidates(count: number): string {
  const arr = Array.from({ length: count }, (_u, i) => ({
    title: `서로 다른 주제 ${i}`,
    thumbnail_promise: `썸네일 약속 ${i}`,
    selection_reasons: {
      viewtrap: `검색축 근거 ${i}`,
      feature_benefit: `기능 장점 근거 ${i}`,
      customer_problem: `사용자 문제 근거 ${i}`,
      funnel_application: `퍼널 적용 근거 ${i}`,
    },
  }));
  return '```json\n' + JSON.stringify(arr) + '\n```';
}

describe('generateKeyContentCandidates', () => {
  it('주입 LLM → 서로 다른 주제 3개 + 선정이유 4종', async () => {
    const draft = await makeDraft();
    const llmComplete = async () => makeLlmCandidates(3);
    const candidates = await generateKeyContentCandidates(draft, { llmComplete });

    expect(candidates).toHaveLength(3);
    candidates.forEach((c, i) => {
      expect(c.id).toBe(`cand-${i}`);
      expect(KeyContentCandidateSchema.parse(c)).toBeTruthy();
      expect(c.selection_reasons.viewtrap.length).toBeGreaterThan(0);
      expect(c.selection_reasons.feature_benefit.length).toBeGreaterThan(0);
      expect(c.selection_reasons.customer_problem.length).toBeGreaterThan(0);
      expect(c.selection_reasons.funnel_application.length).toBeGreaterThan(0);
    });
    const titles = candidates.map((c) => c.title);
    expect(new Set(titles).size).toBe(3);
    // 본문구조·도입방향·CTA 필드가 없어야 한다.
    expect(candidates[0]).not.toHaveProperty('body_structure');
    expect(candidates[0]).not.toHaveProperty('intro_direction');
    expect(candidates[0]).not.toHaveProperty('cta');
  });

  it('count 변경 → 정확히 그 개수', async () => {
    const draft = await makeDraft();
    const llmComplete = async () => makeLlmCandidates(5);
    const candidates = await generateKeyContentCandidates(draft, { llmComplete }, 5);
    expect(candidates).toHaveLength(5);
    expect(candidates[4].id).toBe('cand-4');
  });

  it('LLM 미주입 → 결정론적 폴백 3개(서로 다른 제목)', async () => {
    const draft = await makeDraft();
    const candidates = await generateKeyContentCandidates(draft);
    expect(candidates).toHaveLength(3);
    const titles = candidates.map((c) => c.title);
    expect(new Set(titles).size).toBe(3);
    candidates.forEach((c, i) => {
      expect(c.id).toBe(`cand-${i}`);
      expect(c.selection_reasons.viewtrap.length).toBeGreaterThan(0);
      expect(c.selection_reasons.funnel_application.length).toBeGreaterThan(0);
    });
  });

  it('폴백은 결정론적 — 같은 draft면 같은 결과', async () => {
    const draft = await makeDraft();
    const a = await generateKeyContentCandidates(draft);
    const b = await generateKeyContentCandidates(draft);
    expect(a).toEqual(b);
  });

  it('제목 중복 → 폴백으로 (검증 거부 후 재시도 소진)', async () => {
    const draft = await makeDraft();
    const dupJson =
      '```json\n' +
      JSON.stringify(
        Array.from({ length: 3 }, () => ({
          title: '똑같은 제목',
          thumbnail_promise: 'x',
          selection_reasons: { viewtrap: 'x', feature_benefit: 'x', customer_problem: 'x', funnel_application: 'x' },
        })),
      ) +
      '\n```';
    const llmComplete = async () => dupJson;
    const candidates = await generateKeyContentCandidates(draft, { llmComplete, maxRetries: 1 });
    // 중복 제목은 거부되고 결정론적 폴백(서로 다른 제목 3개)으로 떨어진다.
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((c) => c.title)).size).toBe(3);
  });

  it('필드 비면 거부 → 폴백', async () => {
    const draft = await makeDraft();
    const emptyJson =
      '```json\n' +
      JSON.stringify([
        { title: '', thumbnail_promise: 'x', selection_reasons: { viewtrap: 'x', feature_benefit: 'x', customer_problem: 'x', funnel_application: 'x' } },
      ]) +
      '\n```';
    const llmComplete = async () => emptyJson;
    const candidates = await generateKeyContentCandidates(draft, { llmComplete, maxRetries: 0 });
    expect(candidates).toHaveLength(3);
    expect(candidates[0].title.length).toBeGreaterThan(0);
  });
});

describe('finalizeKeyContentChoice', () => {
  it('선택 후보 → 풀링 입력으로 확정(가벼운 산출)', async () => {
    const draft = await makeDraft();
    const candidates = await generateKeyContentCandidates(draft);
    const chosen = candidates[1];

    const result = finalizeKeyContentChoice({ candidate: chosen, draft });
    expect(result.selected).toEqual(chosen);
    expect(result.key_topic_title).toBe(chosen.title);
    expect(result.entry_stage).toBe(draft.step6_entry_decision.selected_entry_stage);
    // 무거운 제작 필드 없음.
    expect(result).not.toHaveProperty('body_structure');
    expect(result).not.toHaveProperty('cta');
  });
});
