import {
  validateKeyContentWithViewtrap,
  buildViewtrapValidation,
  filterSalesViableCandidates,
  buildHotVideoStructureTemplate,
  assessExposureProbability,
  findLongtailEvergreen,
  LongtailCandidateInput,
} from '../viewtrap-tools';

// ── P3: 키 콘텐츠 Viewtrap 검증 재사용 ──────────────────────────────────────

describe('P3 validateKeyContentWithViewtrap (Step 8 reuse)', () => {
  const base = {
    validated_keywords: ['콘텐츠 마케팅'],
    candidate_titles: ['인스타 열심히 해도 손님 안 오는 이유'],
    performance_score: 'good' as const,
    contribution_score: 'normal' as const,
    growth_status: 'growing' as const,
    channel_value_risk: false,
    person_value_risk: false,
  };

  it('동일 시그니처로 buildViewtrapValidation을 재노출한다', () => {
    expect(validateKeyContentWithViewtrap).toBe(buildViewtrapValidation);
  });

  it('성과도 good이면 verdict=use', () => {
    const v = validateKeyContentWithViewtrap(base);
    expect(v.verdict).toBe('use');
  });

  it('채널 가치 위험이면 verdict=reject', () => {
    const v = validateKeyContentWithViewtrap({ ...base, channel_value_risk: true });
    expect(v.verdict).toBe('reject');
  });

  it('filterSalesViableCandidates는 reject/위험 후보를 제거한다', () => {
    const use = validateKeyContentWithViewtrap(base);
    const reject = validateKeyContentWithViewtrap({ ...base, channel_value_risk: true });
    const viable = filterSalesViableCandidates([use, reject]);
    expect(viable).toEqual([use]);
  });
});

// ── P5 Step 6: buildHotVideoStructureTemplate ───────────────────────────────

describe('P5 buildHotVideoStructureTemplate (Step 6)', () => {
  const ok = {
    original_title: '특약란에 이 문구 쓰면 망합니다',
    structure_pattern: '일반 상황에서 특정 행동을 잘못하면 큰 손실',
    emotional_trigger: 'loss' as const,
    adapted_title: '광고 켜기 전에 이 구조 없으면 돈만 날립니다',
    adapted_thumbnail_promise: '광고비 새는 진짜 이유',
    connected_sales_logic: '콘텐츠 구조 없는 광고는 매출로 안 이어진다',
  };

  it('정상 입력이면 템플릿을 만든다', () => {
    const t = buildHotVideoStructureTemplate(ok);
    expect(t.adapted_title).toBe(ok.adapted_title);
    expect(t.emotional_trigger).toBe('loss');
  });

  it('original_thumbnail_copy 옵션을 보존한다', () => {
    const t = buildHotVideoStructureTemplate({ ...ok, original_thumbnail_copy: '계약 주의' });
    expect(t.original_thumbnail_copy).toBe('계약 주의');
  });

  it('connected_sales_logic이 비면 throw (판매 논리 연결 강제)', () => {
    expect(() =>
      buildHotVideoStructureTemplate({ ...ok, connected_sales_logic: '  ' }),
    ).toThrow(/connected_sales_logic/);
  });

  it('적용 제목이 원본과 같으면 throw (디벨롭 강제)', () => {
    expect(() =>
      buildHotVideoStructureTemplate({ ...ok, adapted_title: ok.original_title }),
    ).toThrow(/develop/);
  });

  it('잘못된 emotional_trigger는 zod throw', () => {
    expect(() =>
      // @ts-expect-error invalid trigger
      buildHotVideoStructureTemplate({ ...ok, emotional_trigger: 'angry' }),
    ).toThrow();
  });
});

// ── P5 Step 7: assessExposureProbability ────────────────────────────────────

describe('P5 assessExposureProbability (Step 7)', () => {
  const base = {
    source_title: '아침에 눈 떴을 때 이 행동',
    exposure_probability: 'good' as const,
    adapted_topic: 'AI 콘텐츠 순서 틀리면 매출 안 난다',
    reason: '지금 홈에서 먹히는 문맥 구조',
  };

  it('good이면 추천 유형 기본값 daily', () => {
    const c = assessExposureProbability(base);
    expect(c.recommended_content_type).toBe('daily');
  });

  it('great이면 기본값 seasonal', () => {
    const c = assessExposureProbability({ ...base, exposure_probability: 'great' });
    expect(c.recommended_content_type).toBe('seasonal');
  });

  it('normal이면 기본값 evergreen', () => {
    const c = assessExposureProbability({ ...base, exposure_probability: 'normal' });
    expect(c.recommended_content_type).toBe('evergreen');
  });

  it('명시한 추천 유형을 우선한다', () => {
    const c = assessExposureProbability({ ...base, recommended_content_type: 'hero' });
    expect(c.recommended_content_type).toBe('hero');
  });

  it('잘못된 exposure_probability는 throw', () => {
    expect(() =>
      // @ts-expect-error invalid
      assessExposureProbability({ ...base, exposure_probability: 'excellent' }),
    ).toThrow();
  });
});

// ── P5 Step 8: findLongtailEvergreen ────────────────────────────────────────

describe('P5 findLongtailEvergreen (Step 8 노다지)', () => {
  const candidates: LongtailCandidateInput[] = [
    {
      source_title: '오래된 좋은 영상',
      published_age: 'old',
      exposure_probability: 'great',
      evergreen_reason: '한 번 더 올라갈 주제',
      adapted_topic: '작은 브랜드 마케팅 기본',
    },
    {
      source_title: '오래됐지만 노출 낮음',
      published_age: 'old',
      exposure_probability: 'normal',
      evergreen_reason: 'n/a',
      adapted_topic: 'n/a',
    },
    {
      source_title: '최근 영상 노출 좋음',
      published_age: 'recent',
      exposure_probability: 'good',
      evergreen_reason: 'n/a',
      adapted_topic: 'n/a',
    },
  ];

  it('오래됐는데 노출 good/great만 골라 must_use:true로 표시', () => {
    const found = findLongtailEvergreen(candidates);
    expect(found).toHaveLength(1);
    expect(found[0].source_title).toBe('오래된 좋은 영상');
    expect(found[0].must_use).toBe(true);
    expect(found[0].published_age).toBe('old');
    expect(found[0].exposure_probability).toBe('great');
  });

  it('조건 만족 후보가 없으면 빈 배열 (이 단계는 넘겨도 됨)', () => {
    const found = findLongtailEvergreen([candidates[1], candidates[2]]);
    expect(found).toEqual([]);
  });

  it('필수 필드가 비면 throw', () => {
    expect(() =>
      findLongtailEvergreen([
        {
          source_title: '오래된 영상',
          published_age: 'old',
          exposure_probability: 'good',
          evergreen_reason: '  ',
          adapted_topic: '주제',
        },
      ]),
    ).toThrow(/evergreen_reason/);
  });
});
