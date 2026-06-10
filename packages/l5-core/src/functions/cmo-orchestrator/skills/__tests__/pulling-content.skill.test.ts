import { createPullingContentSkill } from '../pulling-content';
import type { SkillExecutionContext, SkillResult } from '../../types';
import {
  loadKeyContentSalesLogic,
  buildKeyConnectionSentence,
  buildPullingViewtrapValidation,
  scorePullingTopic,
  assessConsumerJourneyCoverage,
  assembleApprovedPullingContentSet,
  type PullingContentPlan,
} from '../../../video-room/pulling-content-planning';
import type {
  ApprovedKeyContentTopic,
  ApprovedPullingTopic,
} from '../../../video-room/types';

// ── Fixtures (mirror video-room pulling-content-planning.test.ts) ────────────

const KEY_TOPIC: ApprovedKeyContentTopic = {
  title: '마케팅 대행사 쓰기 전에 작은 브랜드 대표가 먼저 알아야 할 것',
  thumbnail_promise: '대행사 쓰기 전 체크',
  entry_stage: 'plan',
  sales_logic: {
    problem_statement: '콘텐츠가 매출로 안 이어진다',
    category_feature_benefit: '유입/판매 콘텐츠 분리',
    category_need: '콘텐츠 마케팅 시스템',
    item_feature_benefit: '판매 논리 자동 삽입',
    item_solution_statement: 'AI 마케팅팀이 해결',
    cta: '무료 진단 신청',
  },
  viewtrap_validation: {
    validated_keywords: ['콘텐츠 마케팅'],
    candidate_titles: ['콘텐츠 마케팅 자동화'],
    performance_score: 'good',
    contribution_score: 'great',
    growth_status: 'growing',
    channel_value_risk: false,
    person_value_risk: false,
    verdict: 'use',
  },
  intro_direction: '문제 공감으로 시작',
  body_structure: ['문제', '카테고리', '상품'],
  cta: '무료 진단 신청',
};

const fullScore = scorePullingTopic({
  performance_score: 8,
  contribution_score: 8,
  exposure_probability_score: 8,
  growth_score: 8,
  evergreen_score: 8,
  reproducibility_score: 8,
  key_connection_score: 8,
  sales_logic_connection_score: 8,
  home_selection_score: 8,
});

const approvedTopic = (
  title: string,
  stages: ApprovedPullingTopic['covered_stages'],
): ApprovedPullingTopic => ({
  title,
  thumbnail_promise: `${title} 약속`,
  covered_stages: stages,
  content_type: 'evergreen',
  score: fullScore,
  key_content_connection: '키 콘텐츠로 연결',
});

const TOPICS_ALL_STAGES: ApprovedPullingTopic[] = [
  approvedTopic('현상/욕구', ['phenomenon', 'desire']),
  approvedTopic('계획', ['plan']),
  approvedTopic('보상', ['reward']),
];

function makeValidPlan(): PullingContentPlan {
  const journey = assessConsumerJourneyCoverage({
    pulling_topics: TOPICS_ALL_STAGES,
    key_content: KEY_TOPIC,
  });
  const approvedSet = assembleApprovedPullingContentSet({
    pulling_topics: TOPICS_ALL_STAGES,
    key_content_topic: KEY_TOPIC,
    journey_coverage_report: journey,
    set_logic: '전체 흐름',
  });
  return {
    step0_key_sales_logic: loadKeyContentSalesLogic({ key_content: KEY_TOPIC }),
    step1_key_ready_audience: {
      required_problem_awareness: '콘텐츠가 매출로 안 이어진다는 인식',
      required_desire: '손님이 오게 만들고 싶다',
      required_plan_awareness: '대행사를 알아보는 중',
      not_ready_reasons: ['문제 자체를 모름'],
    },
    step2_logical_expansion: {
      product: 'AI 마케팅팀',
      category: '콘텐츠 마케팅 시스템',
      feature_benefit: ['고객 구매 흐름 설계'],
      problems: ['콘텐츠가 매출로 안 이어짐'],
      audience_situations: ['작은 브랜드 대표'],
      possible_content_topics: ['인스타 열심히 해도 손님이 안 오는 이유'],
    },
    step3_problem_axis: {
      symptom_topics: ['인스타 열심히 해도 손님이 안 옴'],
      cause_topics: ['구매 흐름이 없음'],
      desire_topics: ['손님이 오게 만들기'],
      plan_topics: ['콘텐츠 시스템 도입'],
      misconception_topics: ['콘텐츠 양이 답이다'],
      reward_case_topics: ['매출 2배 사례'],
    },
    step4_content_type_portfolio: {
      evergreen_candidates: [
        {
          title: '에버그린1',
          covered_stages: ['phenomenon'],
          topic_axis: 'symptom',
          key_content_connection: '키 콘텐츠로 연결',
        },
      ],
      daily_candidates: [
        {
          title: '데일리1',
          covered_stages: ['desire'],
          topic_axis: 'symptom',
          key_content_connection: '키 콘텐츠로 연결',
        },
      ],
      seasonal_candidates: [],
      hero_candidates: [],
    },
    step5_viewtrap_validations: [
      buildPullingViewtrapValidation({
        search_keyword: 'k',
        candidate_titles: ['t'],
        performance_score: 'good',
        contribution_score: 'good',
        growth_status: 'growing',
        reproducible_low_subscriber: true,
        channel_value_risk: false,
        person_value_risk: false,
      }),
    ],
    step6_hot_video_templates: [],
    step7_exposure_candidates: [],
    step8_longtail_candidates: [],
    step9_topic_scores: [fullScore],
    step10_key_connection_sentences: [
      buildKeyConnectionSentence({
        audience: '작은 브랜드 대표',
        trigger: '손님이 안 오는 현상',
        key_core_problem: '구매 흐름 문제',
        key_title: KEY_TOPIC.title,
      }),
    ],
    step11_journey_coverage: journey,
    step12_approved_set: approvedSet,
  };
}

const ctx = (
  prior: Map<string, SkillResult> = new Map(),
): SkillExecutionContext => ({
  role: 'CMO',
  task_id: 'task-pulling-1',
  prior_results: prior,
});

// ── Metadata ─────────────────────────────────────────────────────────────────

describe('createPullingContentSkill metadata', () => {
  it('exposes the correct skill_id, category, and dependency', () => {
    const skill = createPullingContentSkill();
    expect(skill.skill_id).toBe('cmo.pulling.plan');
    expect(skill.name).toBe('cmo.pulling.plan');
    expect(skill.category).toBe('content');
    expect(skill.depends_on).toEqual(['cmo.keycontent.plan']);
    expect(skill.allowed_roles).toEqual(['CMO']);
    expect(skill.permission).toBe('read');
  });

  it('applies overrides', () => {
    const skill = createPullingContentSkill({ default_risk: 'D1' });
    expect(skill.default_risk).toBe('D1');
  });
});

// ── run() ────────────────────────────────────────────────────────────────────

describe('createPullingContentSkill run', () => {
  it('finalizes the pulling set from args.plan', async () => {
    const skill = createPullingContentSkill();
    const res = (await skill.run({ plan: makeValidPlan() }, ctx())) as SkillResult;
    expect(res.ok).toBe(true);
    expect(res.skill_id).toBe('cmo.pulling.plan');
    const data = res.data as {
      approved_set: { approval_status: string; pulling_topics: unknown[] };
      pulling_topic_count: number;
      key_title: string;
    };
    expect(data.approved_set.approval_status).toBe('approved');
    expect(data.pulling_topic_count).toBe(3);
    expect(data.key_title).toBe(KEY_TOPIC.title);
  });

  it('reads the plan from the prior cmo.keycontent.plan result', async () => {
    const prior = new Map<string, SkillResult>([
      [
        'cmo.keycontent.plan',
        {
          ok: true,
          skill_id: 'cmo.keycontent.plan',
          data: { pulling_plan: makeValidPlan() },
        },
      ],
    ]);
    const skill = createPullingContentSkill();
    const res = await skill.run({}, ctx(prior));
    expect(res.ok).toBe(true);
    expect((res.data as { pulling_topic_count: number }).pulling_topic_count).toBe(3);
  });

  it('returns ok:false when no plan is available', async () => {
    const skill = createPullingContentSkill();
    const res = await skill.run({}, ctx());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/plan/i);
  });

  it('propagates domain throw on an inconsistent plan (key title mismatch)', async () => {
    const plan = makeValidPlan();
    plan.step0_key_sales_logic = {
      ...plan.step0_key_sales_logic,
      key_title: '다른 키 콘텐츠',
    };
    const skill = createPullingContentSkill();
    await expect(skill.run({ plan }, ctx())).rejects.toThrow(/mismatch/);
  });
});
