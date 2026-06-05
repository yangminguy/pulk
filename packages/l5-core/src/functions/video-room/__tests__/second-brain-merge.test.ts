import { createSecondBrainInsightMerge } from '../second-brain-merge';
import type { SecondBrainInsightMerge } from '../types';

const sampleInsight: SecondBrainInsightMerge['retrieved_insights'][number] = {
  source_id: 'src-1',
  title: '비즈니스 PT 썸끝 원칙',
  insight: '첫 문장이 훅을 결정한다',
  usage: 'hook',
};

const baseInput = {
  id: 'merge-1',
  content_plan_id: 'plan-1',
  retrieved_insights: [sampleInsight],
  applied_to_thumbnail: ['썸네일 후보 1'],
  applied_to_intro: ['도입부 문구 1'],
  applied_to_script_structure: ['섹션 1 구조'],
};

describe('createSecondBrainInsightMerge', () => {
  it('creates a valid merge record', () => {
    const merge = createSecondBrainInsightMerge(baseInput);
    expect(merge.id).toBe('merge-1');
    expect(merge.content_plan_id).toBe('plan-1');
    expect(merge.retrieved_insights).toHaveLength(1);
    expect(merge.retrieved_insights[0].usage).toBe('hook');
    expect(merge.applied_to_thumbnail).toEqual(['썸네일 후보 1']);
    expect(merge.applied_to_intro).toEqual(['도입부 문구 1']);
    expect(merge.applied_to_script_structure).toEqual(['섹션 1 구조']);
  });

  it('accepts empty applied_to arrays (only retrieved_insights is mandatory)', () => {
    const merge = createSecondBrainInsightMerge({
      ...baseInput,
      applied_to_thumbnail: [],
      applied_to_intro: [],
      applied_to_script_structure: [],
    });
    expect(merge.applied_to_thumbnail).toEqual([]);
  });

  it('accepts multiple insights', () => {
    const secondInsight: SecondBrainInsightMerge['retrieved_insights'][number] = {
      source_id: 'src-2',
      title: '마케팅 자동화 사례',
      insight: '고객 증언이 논리보다 강하다',
      usage: 'sales_argument',
    };
    const merge = createSecondBrainInsightMerge({
      ...baseInput,
      retrieved_insights: [sampleInsight, secondInsight],
    });
    expect(merge.retrieved_insights).toHaveLength(2);
  });

  it('throws when retrieved_insights is empty', () => {
    expect(() =>
      createSecondBrainInsightMerge({ ...baseInput, retrieved_insights: [] }),
    ).toThrow('retrieved_insights');
  });

  it('throws when id is empty', () => {
    expect(() =>
      createSecondBrainInsightMerge({ ...baseInput, id: '' }),
    ).toThrow('id');
  });

  it('throws when content_plan_id is empty', () => {
    expect(() =>
      createSecondBrainInsightMerge({ ...baseInput, content_plan_id: '  ' }),
    ).toThrow('content_plan_id');
  });
});
