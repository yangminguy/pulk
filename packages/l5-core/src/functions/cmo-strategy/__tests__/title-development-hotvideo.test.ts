import {
  HOT_VIDEO_MISSING_NOTE,
  runTitleDevelopmentSteps,
  type HotVideoReference,
  type TitleDevelopmentTopicContext,
} from '../title-development-llm';
import type { LLMClient } from '../../ceo-orchestration/types';

const STEP_OUTPUT = JSON.stringify({
  output_titles: ['디벨롭된 제목'],
  method_explanation: '설명',
  cmo_reasoning: '근거',
  rejected_titles: [],
  selected_titles_for_next_step: ['디벨롭된 제목'],
});

function makeCapturingLlm(captured: { trace: string; system: string }[]): LLMClient {
  return {
    complete: jest.fn(async (args: { system: string; user: string; trace_name?: string }) => {
      captured.push({ trace: args.trace_name ?? '', system: args.system });
      return STEP_OUTPUT;
    }),
  } as unknown as LLMClient;
}

const HOT_VIDEOS: HotVideoReference[] = [
  { title: '월 1억 버는 사장의 비밀 루틴', view_count: 320000, channel_subscribers: 1200, performance_grade: 'great' },
  { title: '이거 모르면 광고비 다 샙니다', view_count: 150000, performance_grade: 'good' },
];

describe('핫비디오 실데이터 주입 (5·7단계)', () => {
  const baseContext: TitleDevelopmentTopicContext = {
    pulling_topic: '인스타 마케팅 자동화',
    target_audience: '마케팅 팀 없는 대표',
  };

  it('hot_videos 주입 시 5·7단계 프롬프트에 핫비디오 제목이 들어간다', async () => {
    const captured: { trace: string; system: string }[] = [];
    await runTitleDevelopmentSteps(
      ['시작 제목'],
      { ...baseContext, hot_videos: HOT_VIDEOS },
      { llm: makeCapturingLlm(captured) },
    );

    const step5 = captured.find((c) => c.trace === 'title-dev-step-5');
    const step7 = captured.find((c) => c.trace === 'title-dev-step-7');
    expect(step5?.system).toContain('핫비디오 실데이터');
    expect(step5?.system).toContain('월 1억 버는 사장의 비밀 루틴');
    expect(step7?.system).toContain('이거 모르면 광고비 다 샙니다');
    expect(step7?.system).toContain('320,000');
  });

  it('hot_videos 미주입 시 5·7단계 프롬프트에 폴백 주의 문구가 들어간다', async () => {
    const captured: { trace: string; system: string }[] = [];
    await runTitleDevelopmentSteps(['시작 제목'], baseContext, { llm: makeCapturingLlm(captured) });

    const step7 = captured.find((c) => c.trace === 'title-dev-step-7');
    expect(step7?.system).toContain(HOT_VIDEO_MISSING_NOTE);
  });

  it('핫비디오와 무관한 단계(2단계)에는 핫비디오 블록이 들어가지 않는다', async () => {
    const captured: { trace: string; system: string }[] = [];
    await runTitleDevelopmentSteps(
      ['시작 제목'],
      { ...baseContext, hot_videos: HOT_VIDEOS },
      { llm: makeCapturingLlm(captured) },
    );

    const step2 = captured.find((c) => c.trace === 'title-dev-step-2');
    expect(step2?.system).not.toContain('핫비디오 실데이터');
    expect(step2?.system).toContain('일상어');
  });

  it('핫비디오 목록은 상위 10개까지만 직렬화된다', async () => {
    const many: HotVideoReference[] = Array.from({ length: 15 }, (_, i) => ({
      title: `핫비디오-${i + 1}`,
    }));
    const captured: { trace: string; system: string }[] = [];
    await runTitleDevelopmentSteps(
      ['시작 제목'],
      { ...baseContext, hot_videos: many },
      { llm: makeCapturingLlm(captured) },
    );
    const step7 = captured.find((c) => c.trace === 'title-dev-step-7');
    expect(step7?.system).toContain('핫비디오-10');
    expect(step7?.system).not.toContain('핫비디오-11');
  });
});
