import { createVoiceBriefSkill } from '../voice-brief';
import type { SkillResult, SkillExecutionContext } from '../../types';
import type { VideoExecutionBrief, VoiceMatchedScript } from '../../../video-room/types';

const ctx = (
  task_id: string,
  prior: Map<string, SkillResult> = new Map(),
): SkillExecutionContext => ({
  role: 'CMO',
  task_id,
  prior_results: prior,
});

describe('createVoiceBriefSkill', () => {
  it('exposes correct skill metadata', () => {
    const skill = createVoiceBriefSkill();
    expect(skill.skill_id).toBe('cmo.voice.brief');
    expect(skill.name).toBe('cmo.voice.brief');
    expect(skill.category).toBe('content');
    expect(skill.depends_on).toEqual(['cmo.script.write']);
    expect(skill.default_risk).toBe('D2');
    expect(skill.allowed_roles).toContain('CMO');
    expect(skill.permission).toBe('read');
  });

  it('applies overrides', () => {
    const skill = createVoiceBriefSkill({ default_risk: 'D3' });
    expect(skill.default_risk).toBe('D3');
    expect(skill.skill_id).toBe('cmo.voice.brief');
  });

  it('runs with deterministic fallbacks and returns ok:true', async () => {
    const skill = createVoiceBriefSkill();
    const result = (await skill.run({}, ctx('task-voice-001'))) as SkillResult;

    expect(result.ok).toBe(true);
    expect(result.skill_id).toBe('cmo.voice.brief');

    const data = result.data as {
      task_id?: string;
      voice_matched_script: VoiceMatchedScript;
      execution_brief: VideoExecutionBrief;
    };

    expect(data.task_id).toBe('task-voice-001');
    expect(data.voice_matched_script.preserved_logic).toBe(true);
    expect(data.execution_brief.schema_version).toBe('cmo_to_factory_v2');
    expect(data.execution_brief.script.full_script.length).toBeGreaterThan(0);
    expect(data.execution_brief.script.logic_blocks.length).toBeGreaterThan(0);
  });

  it('consumes the integrated script from prior cmo.script.write results', async () => {
    const skill = createVoiceBriefSkill();
    const prior = new Map<string, SkillResult>([
      [
        'cmo.script.write',
        {
          ok: true,
          skill_id: 'cmo.script.write',
          data: {
            intro: { script: '이 영상에서 핵심만 말합니다.' },
            integrated_script: {
              full_script: '콘텐츠를 많이 올려도 손님이 안 옵니다. 구매 흐름이 문제입니다.',
              section_map: ['b1', 'b2'],
              removed_repetition: [],
              added_transitions: [],
              strategy_alignment_notes: [],
            },
          },
        },
      ],
    ]);

    const result = (await skill.run(
      {
        voice_sources: [
          {
            source_id: 'vs1',
            title: '대표 인터뷰',
            sample_phrases: ['솔직히 말하면'],
            style_traits: ['직설적'],
          },
        ],
      },
      ctx('task-voice-002', prior),
    )) as SkillResult;

    const data = result.data as {
      voice_matched_script: VoiceMatchedScript;
      execution_brief: VideoExecutionBrief;
    };

    expect(result.ok).toBe(true);
    // founder-voice transforms "~습니다/~입니다" formal endings
    expect(data.voice_matched_script.changed_phrases.length).toBeGreaterThan(0);
    expect(data.execution_brief.script.intro_30s).toBe('이 영상에서 핵심만 말합니다.');
  });
});
