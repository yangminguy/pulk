import { extractThumbnailPattern, analyzeIntro30s, composeIntro30s } from '../reference-analysis';

describe('extractThumbnailPattern', () => {
  const base = {
    id: 'tp-1',
    reference_video_id: 'video-abc',
    raw_thumbnail_text: '마케팅 대행사 쓰기 전에 꼭 봐야 할 것',
    hook_type: 'warning' as const,
    structure: '[대상] + [경고] + [숫자]',
    reusable_formula: '[타깃] + [손실 경고] + [행동 제안]',
    adapted_thumbnail_candidates: ['AI팀 쓰기 전에 꼭 봐야 할 3가지', 'AI 마케팅 시작 전 반드시 확인'],
  };

  it('creates a ThumbnailPattern with all fields', () => {
    const pattern = extractThumbnailPattern(base);
    expect(pattern.id).toBe('tp-1');
    expect(pattern.reference_video_id).toBe('video-abc');
    expect(pattern.hook_type).toBe('warning');
    expect(pattern.adapted_thumbnail_candidates).toHaveLength(2);
  });

  it('throws when reference_video_id is empty (PRD 금지규칙)', () => {
    expect(() => extractThumbnailPattern({ ...base, reference_video_id: '' })).toThrow(
      '레퍼런스 영상 없이 썸네일 구조 분석 금지',
    );
  });

  it('throws when reference_video_id is whitespace only', () => {
    expect(() => extractThumbnailPattern({ ...base, reference_video_id: '   ' })).toThrow(
      '레퍼런스 영상 없이 썸네일 구조 분석 금지',
    );
  });

  it('trims reference_video_id', () => {
    const pattern = extractThumbnailPattern({ ...base, reference_video_id: '  video-abc  ' });
    expect(pattern.reference_video_id).toBe('video-abc');
  });

  it('supports all hook_type values', () => {
    const hookTypes = ['loss', 'gain', 'curiosity', 'warning', 'authority', 'result', 'contrast'] as const;
    for (const hook_type of hookTypes) {
      const pattern = extractThumbnailPattern({ ...base, hook_type });
      expect(pattern.hook_type).toBe(hook_type);
    }
  });
});

describe('analyzeIntro30s', () => {
  const base = {
    id: 'intro-1',
    reference_video_id: 'video-abc',
    transcript_30s: '작은 브랜드 대표님, 마케팅 대행사 쓰기 전에 꼭 봐야 할 게 있습니다...',
    first_sentence: '작은 브랜드 대표님, 마케팅 대행사 쓰기 전에 꼭 봐야 할 게 있습니다.',
    hook_structure: '문제 제기 → 손실 경고 → 해결 예고',
    tension_device: '대행사에 돈 쓰기 전에 이것부터 확인하지 않으면 낭비입니다',
    viewer_identity_called: '작은 브랜드 대표',
    promise_made: '마케팅에서 돈을 낭비하지 않는 방법을 알려드립니다',
    curiosity_gap: '대행사 쓰기 전에 확인해야 할 게 뭔지 궁금하게 만듦',
    reusable_intro_formula: '[타깃 지칭] + [경고] + [약속]',
    adapted_intro_candidates: ['AI 마케팅팀 쓰기 전에 먼저 확인해야 할 것'],
  };

  it('creates an Intro30sAnalysis with all fields', () => {
    const analysis = analyzeIntro30s(base);
    expect(analysis.id).toBe('intro-1');
    expect(analysis.reference_video_id).toBe('video-abc');
    expect(analysis.transcript_30s).toBe(base.transcript_30s);
    expect(analysis.first_sentence).toBe(base.first_sentence);
    expect(analysis.adapted_intro_candidates).toHaveLength(1);
  });

  it('throws when transcript_30s is empty (PRD 금지규칙)', () => {
    expect(() => analyzeIntro30s({ ...base, transcript_30s: '' })).toThrow(
      '초반30초 분석 없이 도입부 작성 금지',
    );
  });

  it('throws when transcript_30s is whitespace only', () => {
    expect(() => analyzeIntro30s({ ...base, transcript_30s: '   ' })).toThrow(
      '초반30초 분석 없이 도입부 작성 금지',
    );
  });

  it('trims transcript_30s', () => {
    const analysis = analyzeIntro30s({ ...base, transcript_30s: '  내용  ' });
    expect(analysis.transcript_30s).toBe('내용');
  });

  it('preserves all structured fields', () => {
    const analysis = analyzeIntro30s(base);
    expect(analysis.hook_structure).toBe(base.hook_structure);
    expect(analysis.tension_device).toBe(base.tension_device);
    expect(analysis.viewer_identity_called).toBe(base.viewer_identity_called);
    expect(analysis.promise_made).toBe(base.promise_made);
    expect(analysis.curiosity_gap).toBe(base.curiosity_gap);
    expect(analysis.reusable_intro_formula).toBe(base.reusable_intro_formula);
  });
});

describe('composeIntro30s', () => {
  const baseInsights = [
    { insight: '신뢰는 전문성이 아니라 솔직함에서 온다', how_applied: '도입부 첫 문장에 약점 고백으로 배치' },
  ];
  const base = {
    id: 'comp-1',
    key_content_title: 'AI 마케팅팀 없이 월매출 1억 만드는 법',
    intro_script_30s: '대표님, 마케팅에 돈 쓰기 전에 이것 하나만 확인하세요. 저도 처음엔 몰랐습니다...',
    first_sentence: '대표님, 마케팅에 돈 쓰기 전에 이것 하나만 확인하세요.',
    hook_structure: '약점 고백 → 손실 경고 → 해결 예고',
    promise: '돈 낭비 없이 마케팅 성과를 내는 방법을 알려드립니다',
    curiosity_gap: '확인해야 할 것이 무엇인지 궁금하게 만듦',
    applied_insights: baseInsights,
  };

  it('정상 입력으로 Intro30sComposition 반환', () => {
    const result = composeIntro30s(base);
    expect(result.id).toBe('comp-1');
    expect(result.key_content_title).toBe(base.key_content_title);
    expect(result.intro_script_30s).toBe(base.intro_script_30s);
    expect(result.applied_insights).toHaveLength(1);
    expect(result.applied_insights[0].insight).toBe(baseInsights[0].insight);
    expect(result.applied_insights[0].how_applied).toBe(baseInsights[0].how_applied);
  });

  it('optional 필드 생략 시 빈 문자열로 정규화', () => {
    const result = composeIntro30s({
      id: 'comp-2',
      key_content_title: '타이틀',
      intro_script_30s: '원고',
      applied_insights: baseInsights,
    });
    expect(result.first_sentence).toBe('');
    expect(result.hook_structure).toBe('');
    expect(result.promise).toBe('');
    expect(result.curiosity_gap).toBe('');
  });

  it('key_content_title 비면 throw', () => {
    expect(() => composeIntro30s({ ...base, key_content_title: '' })).toThrow(
      '키 콘텐츠 없이 도입부 작성 금지',
    );
  });

  it('key_content_title 공백만이면 throw', () => {
    expect(() => composeIntro30s({ ...base, key_content_title: '   ' })).toThrow(
      '키 콘텐츠 없이 도입부 작성 금지',
    );
  });

  it('intro_script_30s 비면 throw', () => {
    expect(() => composeIntro30s({ ...base, intro_script_30s: '' })).toThrow(
      '도입부 원고가 비어 있음',
    );
  });

  it('applied_insights 빈 배열이면 throw', () => {
    expect(() => composeIntro30s({ ...base, applied_insights: [] })).toThrow(
      '세컨브레인 인사이트 적용 없이 도입부 작성 금지',
    );
  });

  it('applied_insights 항목의 insight가 비면 throw', () => {
    expect(() =>
      composeIntro30s({ ...base, applied_insights: [{ insight: '', how_applied: '적용방법' }] }),
    ).toThrow('세컨브레인 인사이트 적용 없이 도입부 작성 금지');
  });

  it('applied_insights 항목의 how_applied가 비면 throw', () => {
    expect(() =>
      composeIntro30s({ ...base, applied_insights: [{ insight: '인사이트', how_applied: '' }] }),
    ).toThrow('세컨브레인 인사이트 적용 없이 도입부 작성 금지');
  });

  it('applied_insights 내용 trim 정규화', () => {
    const result = composeIntro30s({
      ...base,
      applied_insights: [{ insight: '  인사이트  ', how_applied: '  적용방법  ' }],
    });
    expect(result.applied_insights[0].insight).toBe('인사이트');
    expect(result.applied_insights[0].how_applied).toBe('적용방법');
  });
});
