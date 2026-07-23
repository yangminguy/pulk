import {
  buildVisualStoryboard,
  renderStoryboardMarkdown,
  type BuildVisualStoryboardInput,
  type StoryboardSource,
} from '../visual-storyboard';

const SOURCES: StoryboardSource[] = [
  { id: 'AAA', channel: 'Bandit Running', url: 'https://youtu.be/AAA', duration_sec: 100 },
  { id: 'BBB', channel: 'Bandit Running', url: 'https://youtu.be/BBB', duration_sec: 60 },
];

function baseInput(overrides?: Partial<BuildVisualStoryboardInput>): BuildVisualStoryboardInput {
  return {
    title: '테스트',
    sources: SOURCES,
    sectionSources: { 도입부: ['AAA', 'BBB'], '1단계': ['BBB'] },
    scenes: [
      { section: '도입부', script: '문장1', start_sec: 0, duration_sec: 4 },
      { section: '도입부', script: '문장2', start_sec: 4, duration_sec: 3 },
      { section: '1단계', script: '문장3', start_sec: 7, duration_sec: 5 },
      {
        section: '1단계',
        script: '사람을 모으기 전에, 사람들이 이미 모이는 곳으로 들어간다.',
        start_sec: 12,
        duration_sec: 3,
        is_step_label: true,
        step_index: 1,
        motion_note: '1단계 등장. 문구를 그대로 화면에 쓰지 않음.',
      },
    ],
    ...overrides,
  };
}

describe('buildVisualStoryboard', () => {
  it('단계 라벨은 hyperframes_clip으로, 연출 노트를 보존한다', () => {
    const sb = buildVisualStoryboard(baseInput());
    const step = sb.scenes[3];
    expect(step.visual_kind).toBe('hyperframes_clip');
    expect(step.hyperframes_template).toBe('roadmap');
    expect(step.step_index).toBe(1);
    expect(step.motion_note).toContain('그대로 화면에 쓰지 않음');
  });

  it('일반 씬은 섹션 소스 풀에서 결정론적 라운드로빈으로 배정된다', () => {
    const sb = buildVisualStoryboard(baseInput());
    // 도입부 풀 [AAA, BBB] → 첫 씬 AAA, 둘째 씬 BBB
    expect(sb.scenes[0].visual_kind).toBe('source_footage');
    expect(sb.scenes[0].source_id).toBe('AAA');
    expect(sb.scenes[1].source_id).toBe('BBB');
    // 1단계 풀 [BBB] → 셋째 씬 BBB
    expect(sb.scenes[2].source_id).toBe('BBB');
  });

  it('결정론적: 같은 입력은 같은 출력', () => {
    expect(buildVisualStoryboard(baseInput())).toEqual(buildVisualStoryboard(baseInput()));
  });

  it('소스 풀이 없는 섹션은 stock_ai_image로 폴백하고 flag를 남긴다', () => {
    const input = baseInput({ sectionSources: { 도입부: ['AAA', 'BBB'] } }); // 1단계 풀 없음
    const sb = buildVisualStoryboard(input);
    expect(sb.scenes[2].visual_kind).toBe('stock_ai_image');
    expect(sb.flags.some((f) => f.includes('1단계'))).toBe(true);
  });

  it('미상 소스 id는 폴백하고 flag를 남긴다', () => {
    const input = baseInput({ sectionSources: { 도입부: ['ZZZ', 'BBB'], '1단계': ['BBB'] } });
    const sb = buildVisualStoryboard(input);
    expect(sb.scenes[0].visual_kind).toBe('stock_ai_image');
    expect(sb.flags.some((f) => f.includes('ZZZ'))).toBe(true);
  });

  it('타임라인 역행/겹침을 flag한다', () => {
    const input = baseInput();
    input.scenes[1].start_sec = 1; // 앞 씬(0~4)과 겹침
    const sb = buildVisualStoryboard(input);
    expect(sb.flags.some((f) => f.includes('겹침'))).toBe(true);
  });

  it('total_sec는 마지막 씬 끝, sources는 실제 사용분만', () => {
    const sb = buildVisualStoryboard(baseInput());
    expect(sb.total_sec).toBe(15); // 12 + 3
    expect(sb.sources.map((s) => s.id).sort()).toEqual(['AAA', 'BBB']);
  });

  it('prefer_stock_image 씬은 stock_ai_image', () => {
    const input = baseInput();
    input.scenes[0].prefer_stock_image = true;
    const sb = buildVisualStoryboard(input);
    expect(sb.scenes[0].visual_kind).toBe('stock_ai_image');
  });

  it('sourceStarts가 주어지면 그 후보를 순환한다', () => {
    const input = baseInput({ sourceStarts: { AAA: [10, 20] } });
    const sb = buildVisualStoryboard(input);
    expect(sb.scenes[0].source_start_sec).toBe(10);
  });
});

describe('renderStoryboardMarkdown', () => {
  it('원고·소스·모션을 사람이 읽는 표로 렌더한다', () => {
    const md = renderStoryboardMarkdown(buildVisualStoryboard(baseInput()));
    expect(md).toContain('# 테스트 — 비주얼 스토리보드');
    expect(md).toContain('## 도입부');
    expect(md).toContain('hyperframes_clip');
    expect(md).toContain('원고: 문장1');
  });
});
