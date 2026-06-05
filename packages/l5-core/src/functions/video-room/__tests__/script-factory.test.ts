import {
  buildFactoryVideoJob,
  FACTORY_MIN_SCENE_SECONDS,
  FACTORY_MAX_SCENE_SECONDS,
  type ScriptBeat,
  type FactoryInsightScene,
} from '../script-factory';

// ── Fixture helpers ────────────────────────────────────────────────────────────

const beat = (overrides: Partial<ScriptBeat> & Pick<ScriptBeat, 'scene_type'>): ScriptBeat => ({
  scene_id: 'scene_01',
  headline: '기본 헤드라인',
  speaker_text: '기본 나레이션 텍스트입니다.',
  duration: 6,
  ...overrides,
});

const job = (beats: ScriptBeat[]) =>
  buildFactoryVideoJob({ slug: 'test', title: '테스트 영상', beats });

// ── VideoJob meta ──────────────────────────────────────────────────────────────

describe('VideoJob metadata', () => {
  it('sets id/slug to l5-{slug}', () => {
    const result = job([beat({ scene_type: 'hero' })]);
    expect(result.id).toBe('l5-test');
    expect(result.slug).toBe('l5-test');
  });

  it('sets fps=30, 1920x1080, status=draft, generationMode=review_only', () => {
    const result = job([beat({ scene_type: 'insight' })]);
    expect(result.fps).toBe(30);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.status).toBe('draft');
    expect(result.generationMode).toBe('review_only');
  });

  it('respects custom format and theme', () => {
    const result = buildFactoryVideoJob({
      slug: 's',
      title: 't',
      beats: [beat({ scene_type: 'hero' })],
      format: 'shorts_9_16',
      theme: 'dark_pitch_deck',
    });
    expect(result.format).toBe('shorts_9_16');
    expect(result.theme).toBe('dark_pitch_deck');
  });
});

// ── Directly mappable types ────────────────────────────────────────────────────

describe('hero', () => {
  it('maps headline and subtitle from speaker_text when no subtitle provided', () => {
    const result = job([beat({ scene_type: 'hero', headline: 'H', speaker_text: 'S' })]);
    const s = result.scenes[0] as { type: string; headline: string; subtitle: string };
    expect(s.type).toBe('hero');
    expect(s.headline).toBe('H');
    expect(s.subtitle).toBe('S');
  });

  it('prefers explicit subtitle over speaker_text', () => {
    const result = job([beat({ scene_type: 'hero', subtitle: '명시 자막', speaker_text: 'S' })]);
    const s = result.scenes[0] as { subtitle: string };
    expect(s.subtitle).toBe('명시 자막');
  });
});

describe('insight', () => {
  it('maps headline and body from speaker_text', () => {
    const result = job([beat({ scene_type: 'insight', headline: 'H', speaker_text: 'B' })]);
    const s = result.scenes[0] as { type: string; headline: string; body: string };
    expect(s.type).toBe('insight');
    expect(s.headline).toBe('H');
    expect(s.body).toBe('B');
  });
});

describe('cta', () => {
  it('uses speaker_text as action when no action provided', () => {
    const result = job([beat({ scene_type: 'cta', headline: 'H', speaker_text: '지금 시작' })]);
    const s = result.scenes[0] as { type: string; action: string };
    expect(s.type).toBe('cta');
    expect(s.action).toBe('지금 시작');
  });

  it('prefers explicit action field', () => {
    const result = job([beat({ scene_type: 'cta', action: '명시 액션', speaker_text: 'S' })]);
    const s = result.scenes[0] as { action: string };
    expect(s.action).toBe('명시 액션');
  });

  it('passes through optional url', () => {
    const result = job([beat({ scene_type: 'cta', speaker_text: 'S', url: 'https://example.com' })]);
    const s = result.scenes[0] as { url?: string };
    expect(s.url).toBe('https://example.com');
  });
});

describe('quote', () => {
  it('uses headline as quote when no quote field provided', () => {
    const result = job([beat({ scene_type: 'quote', headline: '인용 문장', speaker_text: 'S' })]);
    const s = result.scenes[0] as { type: string; quote: string };
    expect(s.type).toBe('quote');
    expect(s.quote).toBe('인용 문장');
  });

  it('prefers explicit quote field', () => {
    const result = job([beat({ scene_type: 'quote', quote: '명시 인용', headline: 'H', speaker_text: 'S' })]);
    const s = result.scenes[0] as { quote: string };
    expect(s.quote).toBe('명시 인용');
  });
});

// ── Sub-structure types — provided fields ──────────────────────────────────────

describe('problem', () => {
  it('uses provided bullets', () => {
    const result = job([beat({ scene_type: 'problem', bullets: ['문제1', '문제2', '문제3'] })]);
    const s = result.scenes[0] as { type: string; bullets: string[] };
    expect(s.type).toBe('problem');
    expect(s.bullets).toEqual(['문제1', '문제2', '문제3']);
  });

  it('falls back to [speaker_text] when no bullets provided', () => {
    const result = job([beat({ scene_type: 'problem', speaker_text: '단일 문제 설명' })]);
    const s = result.scenes[0] as { type: string; bullets: string[] };
    expect(s.type).toBe('problem');
    expect(s.bullets).toEqual(['단일 문제 설명']);
  });

  it('does not throw without bullets', () => {
    expect(() => job([beat({ scene_type: 'problem' })])).not.toThrow();
  });
});

describe('reframe', () => {
  it('uses provided from/to', () => {
    const result = job([beat({ scene_type: 'reframe', from: '기존 방식', to: '새로운 방식' })]);
    const s = result.scenes[0] as { type: string; from: string; to: string };
    expect(s.type).toBe('reframe');
    expect(s.from).toBe('기존 방식');
    expect(s.to).toBe('새로운 방식');
  });

  it('splits speaker_text on arrow separator when no from/to', () => {
    const result = job([beat({ scene_type: 'reframe', speaker_text: '제작한다 -> 컴파일한다' })]);
    const s = result.scenes[0] as { from: string; to: string };
    expect(s.from).toBe('제작한다');
    expect(s.to).toBe('컴파일한다');
  });

  it('falls back to headline/speaker_text when no separator in speaker_text', () => {
    const result = job([beat({ scene_type: 'reframe', headline: 'H', speaker_text: 'S' })]);
    const s = result.scenes[0] as { from: string; to: string };
    expect(s.from).toBe('H');
    expect(s.to).toBe('S');
  });

  it('does not throw without from/to', () => {
    expect(() => job([beat({ scene_type: 'reframe' })])).not.toThrow();
  });
});

describe('flow', () => {
  it('uses provided steps (>=2)', () => {
    const steps = [
      { label: '1단계', description: '설명1' },
      { label: '2단계', description: '설명2' },
    ];
    const result = job([beat({ scene_type: 'flow', steps })]);
    const s = result.scenes[0] as { type: string; steps: typeof steps };
    expect(s.type).toBe('flow');
    expect(s.steps).toEqual(steps);
  });

  it('derives steps from speaker_text when no steps provided', () => {
    const result = job([beat({ scene_type: 'flow', speaker_text: '전략 입력. 스크립트 생성. Scene JSON 변환.' })]);
    const s = result.scenes[0] as { type: string; steps: Array<{ label: string }> };
    expect(s.type).toBe('flow');
    expect(s.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('does not throw without steps', () => {
    expect(() => job([beat({ scene_type: 'flow' })])).not.toThrow();
  });
});

describe('metric_cards', () => {
  it('uses provided cards', () => {
    const cards = [
      { value: '5편', label: '주당 생산', delta: '+4편' },
      { value: '-68%', label: '편당 작업 시간' },
    ];
    const result = job([beat({ scene_type: 'metric_cards', cards })]);
    const s = result.scenes[0] as { type: string; cards: typeof cards };
    expect(s.type).toBe('metric_cards');
    expect(s.cards).toEqual(cards);
  });

  it('falls back to single card with speaker_text label when no cards provided', () => {
    const result = job([beat({ scene_type: 'metric_cards', speaker_text: '성과 요약' })]);
    const s = result.scenes[0] as { type: string; cards: Array<{ value: string; label: string }> };
    expect(s.type).toBe('metric_cards');
    expect(s.cards.length).toBeGreaterThanOrEqual(1);
    expect(s.cards[0].value).toBeTruthy();
    expect(s.cards[0].label).toBe('성과 요약');
  });

  it('does not throw without cards', () => {
    expect(() => job([beat({ scene_type: 'metric_cards' })])).not.toThrow();
  });
});

describe('comparison', () => {
  it('uses provided left/right', () => {
    const left = { title: '수동', points: ['느림'] };
    const right = { title: '파이프라인', points: ['빠름'] };
    const result = job([beat({ scene_type: 'comparison', left, right })]);
    const s = result.scenes[0] as { type: string; left: typeof left; right: typeof right };
    expect(s.type).toBe('comparison');
    expect(s.left).toEqual(left);
    expect(s.right).toEqual(right);
  });

  it('synthesises minimal left/right from headline/speaker_text when not provided', () => {
    const result = job([beat({ scene_type: 'comparison', headline: 'H', speaker_text: 'S' })]);
    const s = result.scenes[0] as { type: string; left: { points: string[] }; right: { points: string[] } };
    expect(s.type).toBe('comparison');
    expect(s.left.points.length).toBeGreaterThanOrEqual(1);
    expect(s.right.points.length).toBeGreaterThanOrEqual(1);
  });

  it('does not throw without left/right', () => {
    expect(() => job([beat({ scene_type: 'comparison' })])).not.toThrow();
  });
});

// ── Fallback-to-insight cases ──────────────────────────────────────────────────

describe('insight fallback', () => {
  it('screenshot without imagePath falls back to insight', () => {
    const result = job([beat({ scene_type: 'screenshot' })]);
    const s = result.scenes[0] as FactoryInsightScene;
    expect(s.type).toBe('insight');
    expect(s.headline).toBeTruthy();
  });

  it('screenshot with imagePath stays screenshot', () => {
    const result = job([beat({ scene_type: 'screenshot', imagePath: 'images/screen.png' })]);
    const s = result.scenes[0] as { type: string; imagePath: string };
    expect(s.type).toBe('screenshot');
    expect(s.imagePath).toBe('images/screen.png');
  });

  it('agenda without items falls back to insight', () => {
    const result = job([beat({ scene_type: 'agenda' })]);
    expect(result.scenes[0].type).toBe('insight');
  });

  it('agenda with items stays agenda', () => {
    const result = job([
      beat({ scene_type: 'agenda', items: [{ label: '아이템1' }, { label: '아이템2' }] }),
    ]);
    expect(result.scenes[0].type).toBe('agenda');
  });

  it('orbital without center/items falls back to insight', () => {
    const result = job([beat({ scene_type: 'orbital' })]);
    expect(result.scenes[0].type).toBe('insight');
  });

  it('orbital with fewer than 3 items falls back to insight', () => {
    const result = job([
      beat({
        scene_type: 'orbital',
        center: { label: '중심' },
        items: [{ label: 'a' }, { label: 'b' }],
      }),
    ]);
    expect(result.scenes[0].type).toBe('insight');
  });

  it('orbital with center and >=3 items stays orbital', () => {
    const result = job([
      beat({
        scene_type: 'orbital',
        headline: 'H',
        center: { label: '중심' },
        items: [
          { label: 'a', icon: 'camera' },
          { label: 'b', icon: 'film' },
          { label: 'c', icon: 'spark' },
        ],
      }),
    ]);
    expect(result.scenes[0].type).toBe('orbital');
  });

  it('unknown scene_type falls back to insight without throwing', () => {
    const result = job([beat({ scene_type: 'totally_unknown_type' })]);
    expect(result.scenes[0].type).toBe('insight');
  });
});

// ── Remaining types ────────────────────────────────────────────────────────────

describe('section', () => {
  it('uses provided number and title', () => {
    const result = job([beat({ scene_type: 'section', number: '02', title: '섹션 제목' })]);
    const s = result.scenes[0] as { type: string; number: string; title: string };
    expect(s.type).toBe('section');
    expect(s.number).toBe('02');
    expect(s.title).toBe('섹션 제목');
  });

  it('defaults number to 01 and title to headline when not provided', () => {
    const result = job([beat({ scene_type: 'section', headline: '섹션 헤드' })]);
    const s = result.scenes[0] as { number: string; title: string };
    expect(s.number).toBe('01');
    expect(s.title).toBe('섹션 헤드');
  });

  it('does not throw', () => {
    expect(() => job([beat({ scene_type: 'section' })])).not.toThrow();
  });
});

describe('split', () => {
  it('uses provided splitCards', () => {
    const splitCards = [{ label: 'A' }, { label: 'B' }];
    const result = job([beat({ scene_type: 'split', splitCards })]);
    const s = result.scenes[0] as { type: string; cards: typeof splitCards };
    expect(s.type).toBe('split');
    expect(s.cards).toEqual(splitCards);
  });

  it('synthesises two cards from headline/speaker_text when no splitCards', () => {
    const result = job([beat({ scene_type: 'split' })]);
    const s = result.scenes[0] as { type: string; cards: Array<{ label: string }> };
    expect(s.type).toBe('split');
    expect(s.cards.length).toBeGreaterThanOrEqual(2);
  });

  it('does not throw', () => {
    expect(() => job([beat({ scene_type: 'split' })])).not.toThrow();
  });
});

describe('steps', () => {
  it('uses provided steps', () => {
    const steps = [{ label: '1단계' }, { label: '2단계' }, { label: '3단계' }];
    const result = job([beat({ scene_type: 'steps', steps })]);
    const s = result.scenes[0] as { type: string; steps: typeof steps };
    expect(s.type).toBe('steps');
    expect(s.steps).toEqual(steps);
  });

  it('does not throw without steps', () => {
    expect(() => job([beat({ scene_type: 'steps' })])).not.toThrow();
  });
});

describe('spotlight', () => {
  it('uses provided icon and body', () => {
    const result = job([beat({ scene_type: 'spotlight', icon: 'camera', body: '스팟라이트 본문' })]);
    const s = result.scenes[0] as { type: string; icon: string; body: string };
    expect(s.type).toBe('spotlight');
    expect(s.icon).toBe('camera');
    expect(s.body).toBe('스팟라이트 본문');
  });

  it('defaults to spark icon when no icon provided', () => {
    const result = job([beat({ scene_type: 'spotlight' })]);
    const s = result.scenes[0] as { icon: string };
    expect(s.icon).toBe('spark');
  });

  it('does not throw', () => {
    expect(() => job([beat({ scene_type: 'spotlight' })])).not.toThrow();
  });
});

// ── caption propagation ────────────────────────────────────────────────────────

describe('caption propagation', () => {
  it('every mappable scene carries caption equal to speaker_text', () => {
    const types = ['hero', 'problem', 'reframe', 'flow', 'metric_cards', 'comparison', 'insight', 'cta', 'quote'];
    for (const t of types) {
      const result = job([beat({ scene_type: t, speaker_text: '나레이션' })]);
      const s = result.scenes[0] as { caption?: string };
      expect(s.caption).toBe('나레이션');
    }
  });
});

// ── Throw conditions ───────────────────────────────────────────────────────────

describe('throw conditions', () => {
  it('throws for empty beats array', () => {
    expect(() => buildFactoryVideoJob({ slug: 's', title: 't', beats: [] })).toThrow(
      /beats must be a non-empty array/,
    );
  });

  it('throws for beat with empty headline', () => {
    expect(() => job([beat({ scene_type: 'hero', headline: '' })])).toThrow(/headline/);
  });

  it('throws for beat with whitespace-only headline', () => {
    expect(() => job([beat({ scene_type: 'hero', headline: '   ' })])).toThrow(/headline/);
  });

  it('throws for beat with empty speaker_text', () => {
    expect(() => job([beat({ scene_type: 'hero', speaker_text: '' })])).toThrow(/speaker_text/);
  });

  it('throws for duration below minimum', () => {
    expect(() => job([beat({ scene_type: 'hero', duration: FACTORY_MIN_SCENE_SECONDS - 1 })])).toThrow(
      /outside the factory range/,
    );
  });

  it('throws for duration above maximum', () => {
    expect(() => job([beat({ scene_type: 'hero', duration: FACTORY_MAX_SCENE_SECONDS + 1 })])).toThrow(
      /outside the factory range/,
    );
  });

  it('accepts boundary durations 3s and 20s without throwing', () => {
    expect(() =>
      job([
        beat({ scene_id: 'a', scene_type: 'hero', duration: FACTORY_MIN_SCENE_SECONDS }),
        beat({ scene_id: 'b', scene_type: 'insight', duration: FACTORY_MAX_SCENE_SECONDS }),
      ]),
    ).not.toThrow();
  });
});

// ── Full ai-content-flow.json equivalent ──────────────────────────────────────

describe('ai-content-flow equivalent (9 scenes)', () => {
  it('builds a job with all 9 scene types from the factory sample', () => {
    const beats: ScriptBeat[] = [
      { scene_id: 'hero_01', scene_type: 'hero', duration: 6, rhythm_role: 'hook', headline: '콘텐츠 5개를 하루에 만드는 법', speaker_text: 'AI 콘텐츠 파이프라인 한 번 깔면, 일주일치 영상이 나옵니다.' },
      { scene_id: 'problem_01', scene_type: 'problem', duration: 8, rhythm_role: 'tension', headline: '콘텐츠 1개에 하루를 쓰는 진짜 이유', speaker_text: '문제는 속도가 아니라 표준화의 부재입니다.', bullets: ['주제마다 매번 처음부터 기획', '스크립트와 슬라이드를 따로 작업', '도구 5개를 오가며 컨텍스트 손실', 'QA 기준이 매번 달라짐'] },
      { scene_id: 'reframe_01', scene_type: 'reframe', duration: 7, rhythm_role: 'explain', headline: '콘텐츠 제작 -> 콘텐츠 컴파일로 바꿔라', speaker_text: '원고가 데이터가 되면 영상은 빌드 산출물이 됩니다.', from: '한 편을 만든다', to: '한 편을 컴파일한다' },
      { scene_id: 'flow_01', scene_type: 'flow', duration: 10, rhythm_role: 'explain', headline: '콘텐츠 컴파일 파이프라인 5단계', speaker_text: '각 단계는 표준화된 입력과 출력만 갖습니다.', steps: [{ label: '전략 입력', description: '타깃·메시지·CTA를 한 곳에' }, { label: '스크립트 생성', description: 'AI가 톤·구조에 맞춰 작성' }, { label: 'Scene JSON', description: '구조화된 단일 소스' }, { label: 'Remotion 렌더', description: '코드로 영상 빌드' }, { label: 'QA 리포트', description: '기준 자동 검증' }] },
      { scene_id: 'metric_01', scene_type: 'metric_cards', duration: 7, rhythm_role: 'proof', headline: '내부 운영 30일 결과', speaker_text: '표준화된 파이프라인은 처리량과 품질을 동시에 끌어올립니다.', cards: [{ value: '5편', label: '주당 생산', delta: '+4편' }, { value: '-68%', label: '편당 작업 시간' }, { value: '100%', label: 'QA 통과율' }] },
      { scene_id: 'comparison_01', scene_type: 'comparison', duration: 8, rhythm_role: 'explain', headline: '수동 제작 vs 파이프라인', speaker_text: '병목은 시간이 아니라 단계 간 마찰입니다.', left: { title: '수동 제작', points: ['편당 6~8시간', '도구 5개 오감', 'QA 기준 매번 다름', '재사용 불가'] }, right: { title: '콘텐츠 파이프라인', points: ['편당 90분', 'JSON 한 벌', '자동 QA 리포트', '템플릿 재사용'] } },
      { scene_id: 'quote_01', scene_type: 'quote', duration: 6, rhythm_role: 'reset', headline: '콘텐츠는 만드는 게 아니라 컴파일하는 것이다.', speaker_text: 'AI Slide Video Factory 운영 원칙', attribution: 'AI Slide Video Factory 운영 원칙' },
      { scene_id: 'insight_01', scene_type: 'insight', duration: 6, rhythm_role: 'insight', headline: '스크립트가 데이터가 되는 순간, 영상은 빌드 산출물이 된다.', speaker_text: '파이프라인을 가진 팀과 안 가진 팀은 시간이 갈수록 격차가 벌어집니다.' },
      { scene_id: 'cta_01', scene_type: 'cta', duration: 6, rhythm_role: 'cta', headline: '당신의 콘텐츠를 컴파일하세요.', speaker_text: 'AI Slide Video Factory 시작하기', url: 'aicmo.kr/factory' },
    ];

    const result = buildFactoryVideoJob({ slug: 'ai-content-flow', title: 'AI 콘텐츠 제작 파이프라인', beats, theme: 'dark_pitch_deck' });

    expect(result.scenes).toHaveLength(9);
    expect(result.scenes.map((s) => s.type)).toEqual([
      'hero', 'problem', 'reframe', 'flow', 'metric_cards',
      'comparison', 'quote', 'insight', 'cta',
    ]);
  });
});
