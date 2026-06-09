import {
  generatePullingCandidates,
  finalizePullingPlan,
  PullingCandidateSchema,
} from '../pulling-candidates';
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

const KEY_TOPIC = '콘텐츠를 매출로 잇는 3단계 구조';

async function makeDraft(): Promise<KeyContentDraft> {
  const { draft } = await runKeyContentWorkflow({
    product,
    customer_problem: '콘텐츠가 매출로 안 이어진다',
  });
  return draft;
}

function makeLlmPulling(count: number): string {
  const arr = Array.from({ length: count }, (_u, i) => ({
    title: `서로 다른 풀링 주제 ${i}`,
    selection_reasons: {
      consumer_stage: `소비자 단계 ${i}`,
      bridge_to_key: `키 콘텐츠로의 브릿지 ${i}`,
      search_demand: `검색 수요 근거 ${i}`,
      problem_addressed: `사용자 문제 근거 ${i}`,
    },
  }));
  return '```json\n' + JSON.stringify(arr) + '\n```';
}

describe('generatePullingCandidates', () => {
  it('주입 LLM → 서로 다른 풀링 주제 5개 + 선정이유 4종 + order 1..5', async () => {
    const draft = await makeDraft();
    const llmComplete = async () => makeLlmPulling(5);
    const candidates = await generatePullingCandidates({ key_topic_title: KEY_TOPIC, draft }, { llmComplete });

    expect(candidates).toHaveLength(5);
    candidates.forEach((c, i) => {
      expect(c.id).toBe(`pull-${i}`);
      expect(c.order).toBe(i + 1);
      expect(PullingCandidateSchema.parse(c)).toBeTruthy();
      expect(c.selection_reasons.consumer_stage.length).toBeGreaterThan(0);
      expect(c.selection_reasons.bridge_to_key.length).toBeGreaterThan(0);
      expect(c.selection_reasons.search_demand.length).toBeGreaterThan(0);
      expect(c.selection_reasons.problem_addressed.length).toBeGreaterThan(0);
    });
    const titles = candidates.map((c) => c.title);
    expect(new Set(titles).size).toBe(5);
    // 본문구조·도입방향·CTA 필드가 없어야 한다.
    expect(candidates[0]).not.toHaveProperty('body_structure');
    expect(candidates[0]).not.toHaveProperty('intro_direction');
    expect(candidates[0]).not.toHaveProperty('cta');
  });

  it('count 변경(4) → 정확히 그 개수', async () => {
    const draft = await makeDraft();
    const llmComplete = async () => makeLlmPulling(4);
    const candidates = await generatePullingCandidates({ key_topic_title: KEY_TOPIC, draft }, { llmComplete }, 4);
    expect(candidates).toHaveLength(4);
    expect(candidates[3].order).toBe(4);
  });

  it('LLM 미주입 → 결정론적 폴백 5개(서로 다른 제목·브릿지 포함)', async () => {
    const draft = await makeDraft();
    const candidates = await generatePullingCandidates({ key_topic_title: KEY_TOPIC, draft });
    expect(candidates).toHaveLength(5);
    const titles = candidates.map((c) => c.title);
    expect(new Set(titles).size).toBe(5);
    candidates.forEach((c, i) => {
      expect(c.id).toBe(`pull-${i}`);
      expect(c.selection_reasons.bridge_to_key).toContain(KEY_TOPIC);
      expect(c.selection_reasons.consumer_stage.length).toBeGreaterThan(0);
    });
  });

  it('폴백은 결정론적 — 같은 입력이면 같은 결과', async () => {
    const draft = await makeDraft();
    const a = await generatePullingCandidates({ key_topic_title: KEY_TOPIC, draft });
    const b = await generatePullingCandidates({ key_topic_title: KEY_TOPIC, draft });
    expect(a).toEqual(b);
  });

  it('제목 중복 → 폴백으로 (검증 거부 후 재시도 소진)', async () => {
    const draft = await makeDraft();
    const dupJson =
      '```json\n' +
      JSON.stringify(
        Array.from({ length: 5 }, () => ({
          title: '똑같은 제목',
          selection_reasons: { consumer_stage: 'x', bridge_to_key: 'x', search_demand: 'x', problem_addressed: 'x' },
        })),
      ) +
      '\n```';
    const llmComplete = async () => dupJson;
    const candidates = await generatePullingCandidates({ key_topic_title: KEY_TOPIC, draft }, { llmComplete, maxRetries: 1 });
    expect(candidates).toHaveLength(5);
    expect(new Set(candidates.map((c) => c.title)).size).toBe(5);
  });

  it('브릿지 비면 거부 → 폴백', async () => {
    const draft = await makeDraft();
    const emptyBridge =
      '```json\n' +
      JSON.stringify([
        { title: 'a', selection_reasons: { consumer_stage: 'x', bridge_to_key: '', search_demand: 'x', problem_addressed: 'x' } },
      ]) +
      '\n```';
    const llmComplete = async () => emptyBridge;
    const candidates = await generatePullingCandidates({ key_topic_title: KEY_TOPIC, draft }, { llmComplete, maxRetries: 0 });
    expect(candidates).toHaveLength(5);
    candidates.forEach((c) => expect(c.selection_reasons.bridge_to_key.length).toBeGreaterThan(0));
  });
});

describe('finalizePullingPlan', () => {
  it('승인 세트 → 제작 입력으로 확정(가벼운 산출)', async () => {
    const draft = await makeDraft();
    const candidates = await generatePullingCandidates({ key_topic_title: KEY_TOPIC, draft });

    const result = finalizePullingPlan({ key_topic_title: KEY_TOPIC, candidates });
    expect(result.key_topic_title).toBe(KEY_TOPIC);
    expect(result.pulling_topics).toEqual(candidates);
    expect(result).not.toHaveProperty('body_structure');
    expect(result).not.toHaveProperty('cta');
  });

  it('브릿지 누락 후보 포함 시 거부', () => {
    const bad = [
      PullingCandidateSchema.parse({
        id: 'pull-0', order: 1, title: 't',
        selection_reasons: { consumer_stage: 'x', bridge_to_key: '   ', search_demand: 'x', problem_addressed: 'x' },
      }),
    ];
    expect(() => finalizePullingPlan({ key_topic_title: KEY_TOPIC, candidates: bad })).toThrow(/bridge_to_key/);
  });

  it('빈 세트 거부', () => {
    expect(() => finalizePullingPlan({ key_topic_title: KEY_TOPIC, candidates: [] })).toThrow();
  });
});
