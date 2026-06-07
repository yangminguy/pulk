import { buildMarketResearchPack, BuildMarketResearchPackInput } from '../market-research';
import { ViewtrapReference } from '../types';

const baseInput: BuildMarketResearchPackInput = {
  topic: 'AI 마케팅 자동화',
  why_this_topic_matters: '중소기업이 마케팅 비용을 절감하면서 성과를 낼 수 있는 핵심 주제다',
  market_context: ['AI 도구 채택률이 연 40% 증가', '마케팅 대행사 비용이 월 500만원 이상'],
  competitor_content_patterns: ['대행사 vs 인하우스 비교', 'AI 툴 리뷰'],
  unanswered_questions: ['실제 ROI 측정 방법은?', '어떤 툴부터 시작해야 하나?'],
  common_misunderstandings: ['AI가 모든 걸 자동화해준다는 오해', 'AI 마케팅은 대기업만 가능하다는 오해'],
  example_materials: ['케이스스터디: 직원 2명 스타트업의 월매출 1억 달성'],
  content_opportunities: ['중소기업 대표를 위한 AI 마케팅 입문 가이드'],
};

describe('buildMarketResearchPack — 정상 케이스', () => {
  it('모든 필드가 채워진 MarketResearchPack을 반환한다', () => {
    const result = buildMarketResearchPack(baseInput);

    expect(result.topic).toBe('AI 마케팅 자동화');
    expect(result.why_this_topic_matters).toBe(baseInput.why_this_topic_matters);
    expect(result.market_context).toEqual(baseInput.market_context);
    expect(result.competitor_content_patterns).toEqual(baseInput.competitor_content_patterns);
    expect(result.unanswered_questions).toEqual(baseInput.unanswered_questions);
    expect(result.common_misunderstandings).toEqual(baseInput.common_misunderstandings);
    expect(result.content_opportunities).toEqual(baseInput.content_opportunities);
    expect(result.example_materials).toContain(baseInput.example_materials![0]);
  });

  it('topic 앞뒤 공백을 trim해서 반환한다', () => {
    const result = buildMarketResearchPack({ ...baseInput, topic: '  AI 마케팅 자동화  ' });
    expect(result.topic).toBe('AI 마케팅 자동화');
  });
});

describe('buildMarketResearchPack — 빈 topic throw', () => {
  it('topic이 빈 문자열이면 throw한다', () => {
    expect(() => buildMarketResearchPack({ ...baseInput, topic: '' })).toThrow(
      'topic must not be empty',
    );
  });

  it('topic이 공백만이면 throw한다', () => {
    expect(() => buildMarketResearchPack({ ...baseInput, topic: '   ' })).toThrow(
      'topic must not be empty',
    );
  });
});

describe('buildMarketResearchPack — example_materials 매핑', () => {
  const ref: ViewtrapReference = {
    id: 'ref-1',
    content_plan_id: 'plan-1',
    source: 'viewtrap',
    title: 'AI로 마케팅 자동화한 스타트업 사례',
    url: 'https://app.viewtrap.com/video/abc',
    channel_name: '마케팅 인사이트',
    subscriber_count: 50000,
    view_count: 120000,
    uploaded_at: '2026-01-15',
    recent_view_growth: 'high',
    contribution_score: 8,
    selected_reason: '실제 중소기업 AI 도입 사례를 담고 있어 신뢰도 높음',
    consumer_stage: '계획',
    thumbnail_image_ref: undefined,
  };

  it('viewtrap_references가 example_materials에 포맷되어 추가된다', () => {
    const result = buildMarketResearchPack({
      ...baseInput,
      viewtrap_references: [ref],
    });

    expect(result.example_materials).toHaveLength(2); // 기존 1개 + viewtrap 1개
    const mapped = result.example_materials[1];
    expect(mapped).toContain('[viewtrap]');
    expect(mapped).toContain('AI로 마케팅 자동화한 스타트업 사례');
    expect(mapped).toContain('마케팅 인사이트');
    expect(mapped).toContain('stage: 계획');
    expect(mapped).toContain('reason: 실제 중소기업 AI 도입 사례를 담고 있어 신뢰도 높음');
  });

  it('viewtrap_references 없이 example_materials만 있으면 그대로 반환한다', () => {
    const result = buildMarketResearchPack({ ...baseInput });
    expect(result.example_materials).toEqual(baseInput.example_materials);
  });

  it('example_materials와 viewtrap_references 모두 없으면 빈 배열을 반환한다', () => {
    const result = buildMarketResearchPack({
      ...baseInput,
      example_materials: undefined,
      viewtrap_references: undefined,
    });
    expect(result.example_materials).toEqual([]);
  });

  it('viewtrap_references 여러 개가 모두 매핑된다', () => {
    const ref2: ViewtrapReference = {
      ...ref,
      id: 'ref-2',
      title: '두 번째 레퍼런스',
      source: 'youtube',
      consumer_stage: '욕구',
    };
    const result = buildMarketResearchPack({
      ...baseInput,
      example_materials: [],
      viewtrap_references: [ref, ref2],
    });
    expect(result.example_materials).toHaveLength(2);
    expect(result.example_materials[0]).toContain('[viewtrap]');
    expect(result.example_materials[1]).toContain('[youtube]');
    expect(result.example_materials[1]).toContain('두 번째 레퍼런스');
    expect(result.example_materials[1]).toContain('stage: 욕구');
  });
});
