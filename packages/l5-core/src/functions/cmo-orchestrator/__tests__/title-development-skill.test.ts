/**
 * WO-2 integrate: cmo.title.development 스킬 — 레지스트리 등록 + 실행기 위임 검증.
 *
 * 실행기 본체 동작은 cmo-strategy/__tests__/title-development-llm.test.ts가 계약.
 * 여기서는 오케스트레이터 경로(레지스트리 → 스킬 run → proposal data)만 확인한다.
 */
import { createCmoSkillRegistry } from '../cmo-skill-registry';
import { createTitleDevelopmentSkill } from '../skills/title-development';
import type { LLMClient } from '../../ceo-orchestration/types';
import type { TitleDevelopmentReference } from '../../cmo-strategy/title-development-types';

function makeRef(overrides: Partial<TitleDevelopmentReference> = {}): TitleDevelopmentReference {
  return {
    id: 'ref-1',
    research_session_id: 'session-1',
    source: 'viewtrap',
    title: '릴스 자동화로 한 달 만에 문의 30건 받은 방법',
    thumbnail_text: '하루 10분, 릴스 자동화',
    thumbnail_structure: '좌측 인물 + 우측 큰 텍스트',
    topic: '릴스 자동화',
    view_count: 80000,
    performance_grade: 'Great',
    contribution_grade: 'Good',
    topic_similarity: 'exact',
    similarity_reason: '동일 주제',
    selected_reason: '조회수/성과 조건 통과',
    ...overrides,
  };
}

const baseArgs = {
  pulling_topic: '릴스 자동화',
  target_audience: '작은 브랜드 대표',
  references: [makeRef({ id: 'ref-1' }), makeRef({ id: 'ref-2', view_count: 120000 })],
};

describe('cmo.title.development 레지스트리 등록', () => {
  it('기본 레지스트리에 등록되고 의존성 그래프가 topo-sort된다', () => {
    const registry = createCmoSkillRegistry();
    const skill = registry.get('cmo.title.development');
    expect(skill).toBeDefined();
    expect(skill!.depends_on).toEqual(['cmo.pulling.plan']);

    // pulling.plan → title.development 순서로 풀린다.
    const plan = registry.resolveDependencies(['cmo.title.development']);
    expect(plan.indexOf('cmo.pulling.plan')).toBeLessThan(
      plan.indexOf('cmo.title.development'),
    );
  });

  it('registry deps 옵션으로 LLM을 주입할 수 있다', async () => {
    let called = 0;
    const llm: LLMClient = {
      async complete() {
        called += 1;
        throw new Error('형식 오류 — 폴백 유도');
      },
    };
    const registry = createCmoSkillRegistry({ title_development_deps: { llm, maxRetries: 0 } });
    const result = await registry.get('cmo.title.development')!.run(baseArgs);
    expect(result.ok).toBe(true);
    expect(called).toBeGreaterThan(0); // 주입된 LLM이 실제로 호출됨
  });
});

describe('cmo.title.development 실행 (실행기 위임)', () => {
  it('llm 미주입(결정론 폴백)으로도 proposal data를 만든다', async () => {
    const skill = createTitleDevelopmentSkill();
    const result = await skill.run(baseArgs, { task_id: 'task-1' } as never);

    expect(result.ok).toBe(true);
    const data = result.data as {
      proposal: { stage: string; data: { title_development_workflow: { combinations: unknown[]; step_results: unknown[]; approval_status: string } } };
      fallback_count: number;
    };
    expect(data.proposal.stage).toBe('thumbnail_pattern_extraction'); // PRD §20.1 / AC-14
    const run = data.proposal.data.title_development_workflow;
    expect(run.combinations).toHaveLength(4);
    expect(run.step_results).toHaveLength(7);
    expect(run.approval_status).toBe('draft');
    expect(data.fallback_count).toBeGreaterThan(0);
    // run()의 정적 타입은 ToolResult지만 스킬은 SkillResult를 반환한다 (insight 포함).
    expect((result as { insight?: string }).insight).toBeTruthy(); // second_brain_summary
  });

  it('레퍼런스 2개 미만이면 ok:false (AC-01)', async () => {
    const skill = createTitleDevelopmentSkill();
    const result = await skill.run({ ...baseArgs, references: [makeRef()] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('레퍼런스');
  });

  it('조건 미달 레퍼런스(조회수 3만)면 ok:false + failed_references (§25.3)', async () => {
    const skill = createTitleDevelopmentSkill();
    const result = await skill.run({
      ...baseArgs,
      references: [makeRef({ id: 'ref-1', view_count: 30000 }), makeRef({ id: 'ref-2' })],
    });
    expect(result.ok).toBe(false);
    const data = result.data as { next_action: string; failed_references: { reference_id: string }[] };
    expect(data.next_action).toBe('request_more_references');
    expect(data.failed_references[0].reference_id).toBe('ref-1');
  });
});
