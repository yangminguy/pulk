import { createStrategyPackageSkill } from '../strategy-package';
import type { SkillExecutionContext, SkillResult } from '../../types';
import type {
  ApprovedKeyContentTopic,
  ApprovedPullingContentSet,
  ContentTypePortfolio,
  ConsumerJourneyCoverageReport,
  ProductBrief,
} from '../../../video-room/types';

const productBrief: ProductBrief = {
  product_name: 'Acme Operator',
  category: 'business-os',
  target_audience: 'founder-led operators',
  core_offer: 'execution visibility',
  business_goal: 'product_sale',
};

const keyTopic: ApprovedKeyContentTopic = {
  title: '운영 병목을 없애는 한 가지 시스템',
  thumbnail_promise: '실행이 멈추지 않는 회사',
  entry_stage: 'phenomenon',
  sales_logic: {
    problem_statement: '운영 병목',
    category_feature_benefit: '실행 가시성',
    category_need: '대시보드',
    item_feature_benefit: '자동 라우팅',
    item_solution_statement: '한 시스템에서',
    cta: '지금 시작',
  },
  viewtrap_validation: {
    validated_keywords: ['운영 병목'],
    candidate_titles: ['운영 병목을 없애는 한 가지 시스템'],
    performance_score: 'good',
    contribution_score: 'good',
    growth_status: 'growing',
    channel_value_risk: false,
    person_value_risk: false,
    verdict: 'use',
  },
  intro_direction: '현상 공감',
  body_structure: ['문제', '원인', '해결'],
  cta: '지금 시작',
};

const journey: ConsumerJourneyCoverageReport = {
  phenomenon_covered: true,
  desire_covered: true,
  plan_covered: true,
  action_connected: true,
  reward_promised: true,
  natural_flow_score: 8,
  notes: [],
};

const pullingSet: ApprovedPullingContentSet = {
  pulling_topics: [
    {
      title: '운영 자동화 체크리스트',
      thumbnail_promise: '5분 점검',
      covered_stages: ['phenomenon', 'desire'],
      content_type: 'evergreen',
      score: {
        performance_score: 8,
        contribution_score: 8,
        exposure_probability_score: 8,
        growth_score: 7,
        evergreen_score: 9,
        reproducibility_score: 8,
        key_connection_score: 9,
        sales_logic_connection_score: 8,
        home_selection_score: 8,
        total_score: 73,
        verdict: 'use',
      },
      key_content_connection: '핵심 콘텐츠로 유입',
    },
  ],
  key_content_topic: keyTopic,
  journey_coverage_report: journey,
  set_logic: '핵심 콘텐츠를 중심으로 여정 전체 커버',
  approval_status: 'approved',
};

const portfolio: ContentTypePortfolio = {
  evergreen_candidates: [],
  daily_candidates: [],
  seasonal_candidates: [],
  hero_candidates: [],
};

const ctx: SkillExecutionContext = {
  role: 'CMO',
  task_id: 'task-1',
  prior_results: new Map(),
};

const args = {
  product_brief: productBrief,
  key_content_topic: keyTopic,
  pulling_content_set: pullingSet,
  content_type_portfolio: portfolio,
  title_thumbnail_direction: '현상 강조 썸네일',
  script_direction: '문제→해결 스크립트',
  cta_strategy: '본문 말미 CTA',
};

describe('createStrategyPackageSkill', () => {
  it('produces a skill with the correct metadata', () => {
    const skill = createStrategyPackageSkill();
    expect(skill.skill_id).toBe('cmo.strategy.package');
    expect(skill.name).toBe('cmo.strategy.package');
    expect(skill.category).toBe('analysis');
    expect(skill.depends_on).toEqual([
      'cmo.keycontent.plan',
      'cmo.pulling.plan',
    ]);
    expect(skill.allowed_roles).toContain('CMO');
    expect(skill.permission).toBe('read');
  });

  it('run() assembles an approved content strategy package (ok:true)', async () => {
    const skill = createStrategyPackageSkill();
    const result = (await skill.run(args, ctx)) as SkillResult;

    expect(result.ok).toBe(true);
    expect(result.skill_id).toBe('cmo.strategy.package');
    const pkg = (result.data as { package: { key_content_strategy: { title: string } } })
      .package;
    expect(pkg.key_content_strategy.title).toBe(keyTopic.title);
  });

  it('run() surfaces PRD-forbidden states by throwing from the domain function', async () => {
    const skill = createStrategyPackageSkill();
    const rejected = {
      ...args,
      key_content_topic: {
        ...keyTopic,
        viewtrap_validation: {
          ...keyTopic.viewtrap_validation,
          verdict: 'reject' as const,
        },
      },
    };
    await expect(skill.run(rejected, ctx)).rejects.toThrow(/rejected Viewtrap/);
  });

  it('respects overrides', () => {
    const skill = createStrategyPackageSkill({ default_risk: 'D3' });
    expect(skill.default_risk).toBe('D3');
  });
});
