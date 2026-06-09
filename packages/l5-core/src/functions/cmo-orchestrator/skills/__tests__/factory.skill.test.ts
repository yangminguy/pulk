import { createFactoryHandoffSkill } from '../factory';
import type { SkillExecutionContext, SkillResult } from '../../types';
import type { VideoExecutionBrief } from '../../../video-room/types';

function validBrief(): VideoExecutionBrief {
  return {
    schema_version: 'cmo_to_factory_v2',
    content_card_id: 'card-1',
    content_type: 'key',
    title: '운영 병목을 없애는 한 가지 시스템',
    target_viewer: {
      who: '작은 브랜드 대표',
      knowledge_level: '초급',
      pain: '인스타를 열심히 해도 손님이 안 온다',
      desired_reaction: '구매 흐름을 점검하고 싶다',
    },
    strategy: {
      core_message: '양이 아니라 구매 흐름이 문제다',
      covered_stages: ['phenomenon', 'plan'],
      role_in_content_set: 'key',
    },
    script: {
      full_script: '본문 전체 원고.',
      intro_30s: '도입부 30초.',
      logic_blocks: [
        {
          block_id: 'b1',
          role: 'problem',
          speaker_text: '콘텐츠를 많이 올려도 손님이 안 옵니다.',
          communication_goal: '문제 공감',
          viewer_reaction_target: '나도 저 문제 있다',
        },
      ],
    },
    source_materials: { used_insights: {} },
    constraints: { tone: '솔직하고 단정적', format: 'youtube_16_9' },
  };
}

const ids = { id: 'rec-1', created_at: '2026-06-09T00:00:00.000Z' };

const ctx: SkillExecutionContext = {
  role: 'CMO',
  task_id: 'task-1',
  prior_results: new Map(),
};

describe('createFactoryHandoffSkill', () => {
  it('produces a skill with the correct metadata', () => {
    const skill = createFactoryHandoffSkill();
    expect(skill.skill_id).toBe('cmo.factory.handoff');
    expect(skill.name).toBe('cmo.factory.handoff');
    expect(skill.category).toBe('experiment');
    expect(skill.depends_on).toEqual(['cmo.voice.brief']);
    expect(skill.allowed_roles).toContain('CMO');
    expect(skill.permission).toBe('read');
  });

  it('run() prepares a valid, not-yet-sent factory handoff record (ok:true)', async () => {
    const skill = createFactoryHandoffSkill();
    const result = (await skill.run({ brief: validBrief(), ids }, ctx)) as SkillResult;

    expect(result.ok).toBe(true);
    expect(result.skill_id).toBe('cmo.factory.handoff');
    const record = (result.data as { record: { validation_status: string; handoff_status: string; id: string } }).record;
    expect(record.id).toBe('rec-1');
    expect(record.validation_status).toBe('valid');
    expect(record.handoff_status).toBe('not_sent');
  });

  it('run() reads the brief from the cmo.voice.brief prior result', async () => {
    const prior = new Map<string, SkillResult>();
    prior.set('cmo.voice.brief', {
      ok: true,
      skill_id: 'cmo.voice.brief',
      data: { brief: validBrief() },
    });
    const skill = createFactoryHandoffSkill();
    const result = (await skill.run(
      { ids },
      { ...ctx, prior_results: prior } as unknown as SkillExecutionContext,
    )) as SkillResult;

    expect(result.ok).toBe(true);
    const record = (result.data as { record: { validation_status: string } }).record;
    expect(record.validation_status).toBe('valid');
  });

  it('run() marks an invalid brief as invalid (and never sends it)', async () => {
    const bad = { ...validBrief(), title: '' };
    const skill = createFactoryHandoffSkill();
    const result = (await skill.run({ brief: bad, ids }, ctx)) as SkillResult;

    const record = (result.data as { record: { validation_status: string; handoff_status: string } }).record;
    expect(record.validation_status).toBe('invalid');
    expect(record.handoff_status).toBe('not_sent');
  });

  it('run() optionally builds a fallback slide deck', async () => {
    const skill = createFactoryHandoffSkill();
    const result = (await skill.run(
      { brief: validBrief(), ids, generate_slide_deck: true },
      ctx,
    )) as SkillResult;

    const deck = (result.data as { slide_deck?: { source: string; slide_count: number } }).slide_deck;
    expect(deck).toBeDefined();
    expect(deck?.source).toBe('fallback');
    expect(deck?.slide_count).toBeGreaterThan(0);
  });

  it('run() throws when no brief is available', async () => {
    const skill = createFactoryHandoffSkill();
    await expect(skill.run({ ids }, ctx)).rejects.toThrow(/no VideoExecutionBrief/);
  });

  it('run() throws when caller-injected ids are missing', async () => {
    const skill = createFactoryHandoffSkill();
    await expect(skill.run({ brief: validBrief() }, ctx)).rejects.toThrow(/ids\.id/);
  });

  it('respects overrides', () => {
    const skill = createFactoryHandoffSkill({ default_risk: 'D3' });
    expect(skill.default_risk).toBe('D3');
  });
});
