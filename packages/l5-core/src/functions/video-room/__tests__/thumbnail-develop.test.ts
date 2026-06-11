// 6주차 썸네일 강의·컨설팅 방법론 보강(B1~B7) 검증.
// 결정론 경로 + LLM mock 경로 + 경계 케이스.
import {
  IMAGE_DEVELOP_TECHNIQUES,
  IMAGE_DEVELOP_TECHNIQUE_IDS,
  DIRECT_DEVELOP_TECHNIQUE_IDS,
  developThumbnailImage,
  learnThumbnailPatternsFromReferences,
  estimateHookType,
  judgeThumbnailAudienceFit,
  THUMBNAIL_TEXT_TITLE_TECHNIQUES,
  THUMBNAIL_TEXT_TECHNIQUE_GUIDANCE,
  developThumbnailTextWithTitleTechniques,
  scoreIntroHookStrength,
  evaluateHookIntensityAlignment,
  evaluateDevelopImprovement,
  AUDIENCE_CHANNEL_CRITERIA,
  buildChannelFirstDiscoveryPlan,
  selectAudienceChannels,
  type ThumbnailReferenceInput,
} from '../thumbnail-develop';
import {
  AUDIENCE_FIT_CHECKLIST_ITEM,
  THUMBNAIL_REVIEW_CHECKLIST,
  THUMBNAIL_TEXT_RECOMMENDED_MAX,
  buildThumbnailMatrix9,
  reviewThumbnailCandidate,
  type ThumbnailMatrixInput,
} from '../thumbnail-matrix';

const BASE_INPUT = {
  title: '인스타 마케팅 자동화로 매출 3배',
  main_click_reason: '마케팅 인력 없이 매출을 늘릴 수 있다',
  target_audience: '마케팅 팀 없는 대표',
  target_problem: '마케팅에 쓸 시간이 없다',
  target_desire: '자동으로 고객이 들어온다',
};

const CANDIDATE = {
  candidate_id: 'tm-vid-1-A',
  thumbnail_text: '광고비 새는 이유',
  image_composition: '대표 얼굴 클로즈업',
};

// ═════════════════════════════════════════════════════════════════════════════
// B1 — 이미지 디벨롭 6기술
// ═════════════════════════════════════════════════════════════════════════════

describe('IMAGE_DEVELOP_TECHNIQUES (B1)', () => {
  it('6기술이 정확히 정의되어 있다', () => {
    expect(IMAGE_DEVELOP_TECHNIQUE_IDS).toEqual([
      'zoom',
      'evidence',
      'curiosity',
      'empathy',
      'audience_preferred',
      'reference_learning',
    ]);
    expect(IMAGE_DEVELOP_TECHNIQUES).toHaveLength(6);
    const ids = IMAGE_DEVELOP_TECHNIQUES.map((t) => t.id);
    expect(ids).toEqual([...IMAGE_DEVELOP_TECHNIQUE_IDS]);
  });

  it('강의 핵심 원칙이 들어있다', () => {
    const joined = IMAGE_DEVELOP_TECHNIQUES.map((t) => t.principle).join(' ');
    expect(joined).toContain('과감히 제거');
    expect(joined).toContain('이득은 문구로');
    expect(joined).toContain('정답이 다 안 보이게');
    expect(joined).toContain('왼쪽 위');
    expect(joined).toContain('좋아하는 이미지로 교체');
    expect(joined).toContain('같은 카테고리');
  });

  it('직접 적용 기술은 1~5(reference_learning 제외)', () => {
    expect(DIRECT_DEVELOP_TECHNIQUE_IDS).toHaveLength(5);
    expect(DIRECT_DEVELOP_TECHNIQUE_IDS).not.toContain('reference_learning');
  });
});

describe('developThumbnailImage (B1)', () => {
  it('LLM 미주입 시 결정론 폴백으로 5개 제안을 낸다', async () => {
    const r = await developThumbnailImage(CANDIDATE, BASE_INPUT);
    expect(r.source).toBe('fallback');
    expect(r.suggestions).toHaveLength(5);
    expect(r.suggestions.map((s) => s.technique)).toEqual([...DIRECT_DEVELOP_TECHNIQUE_IDS]);
    expect(r.suggestions.every((s) => s.suggestion.length > 0)).toBe(true);
    expect(r.candidate_id).toBe('tm-vid-1-A');
  });

  it('LLM 정상 응답이면 llm 경로로 5개 제안을 낸다', async () => {
    const llmOut = DIRECT_DEVELOP_TECHNIQUE_IDS.map((t) => ({
      technique: t,
      applicable: t !== 'curiosity',
      suggestion: `${t} 제안`,
    }));
    const r = await developThumbnailImage(CANDIDATE, BASE_INPUT, {
      llmComplete: async () => JSON.stringify(llmOut),
    });
    expect(r.source).toBe('llm');
    expect(r.suggestions.find((s) => s.technique === 'curiosity')?.applicable).toBe(false);
  });

  it('LLM 실패 시 결정론 폴백 + 노트', async () => {
    const r = await developThumbnailImage(CANDIDATE, BASE_INPUT, {
      llmComplete: async () => {
        throw new Error('down');
      },
      maxRetries: 0,
    });
    expect(r.source).toBe('fallback');
    expect(r.notes.some((n) => n.includes('실패'))).toBe(true);
  });

  it('빈 문구는 거부한다', async () => {
    await expect(
      developThumbnailImage({ ...CANDIDATE, thumbnail_text: ' ' }, BASE_INPUT),
    ).rejects.toThrow('thumbnail_text');
  });
});

describe('learnThumbnailPatternsFromReferences (B1-6)', () => {
  const REFS: ThumbnailReferenceInput[] = [
    {
      video_id: 'v1',
      title: '이거 모르면 광고비 다 날립니다',
      thumbnail_text: '광고비 전부 손해',
      view_count: 500000,
      performance_grade: 'Great',
      contribution_grade: 'Good',
    },
    {
      video_id: 'v2',
      title: '월 매출 1억 버는 법',
      thumbnail_text: '월 1억 버는 법',
      view_count: 300000,
      // 미실측 (성과도/기여도 없음)
    },
    {
      video_id: 'v3',
      title: '그냥 일상 브이로그',
      view_count: 1000,
      performance_grade: 'Bad',
      contribution_grade: 'Bad',
    },
  ];

  it('결정론: Good/Great 실측 + 미실측(투명 표기)만 학습, 낮은 등급은 제외', async () => {
    const r = await learnThumbnailPatternsFromReferences(REFS);
    expect(r.source).toBe('fallback');
    expect(r.eligible_count).toBe(2);
    expect(r.unmeasured_count).toBe(1);
    const ids = r.patterns.map((p) => p.reference_video_id);
    expect(ids).toContain('v1');
    expect(ids).toContain('v2');
    expect(ids).not.toContain('v3'); // Bad 등급 제외
  });

  it('미실측은 measured=false로 투명 표기하고 조작하지 않는다', async () => {
    const r = await learnThumbnailPatternsFromReferences(REFS);
    const v1 = r.patterns.find((p) => p.reference_video_id === 'v1')!;
    const v2 = r.patterns.find((p) => p.reference_video_id === 'v2')!;
    expect(v1.measured).toBe(true);
    expect(v2.measured).toBe(false);
    expect(v2.source_note).toContain('미실측');
    expect(r.notes.some((n) => n.includes('조작 금지'))).toBe(true);
  });

  it('결정론 폴백은 unanalyzed 노트 + 텍스트 기반 hook_type 추정', async () => {
    const r = await learnThumbnailPatternsFromReferences(REFS);
    const v1 = r.patterns.find((p) => p.reference_video_id === 'v1')!;
    expect(v1.structure).toContain('unanalyzed');
    expect(v1.hook_type).toBe('loss'); // "광고비 전부 손해"
    expect(v1.adapted_thumbnail_candidates).toEqual([]);
    // ThumbnailPattern 호환 구조 (reference_patterns 주입 가능)
    expect(v1.id).toBe('tp-v1');
    expect(v1.raw_thumbnail_text).toBe('광고비 전부 손해');
  });

  it('LLM 경로: 구성 분석 결과를 패턴으로 반환한다', async () => {
    const r = await learnThumbnailPatternsFromReferences(REFS, {
      llmComplete: async () =>
        JSON.stringify([
          {
            video_id: 'v1',
            hook_type: 'warning',
            structure: '손실 경고 + 굳은 표정',
            reusable_formula: '{손실 대상} 전부 {손실 동사}',
            adapted_thumbnail_candidates: ['마케팅비 전부 증발'],
          },
          {
            video_id: 'v2',
            hook_type: 'gain',
            structure: '숫자 결과 제시',
            reusable_formula: '월 {금액} {동사}',
            adapted_thumbnail_candidates: [],
          },
        ]),
    });
    expect(r.source).toBe('llm');
    expect(r.patterns.find((p) => p.reference_video_id === 'v1')?.hook_type).toBe('warning');
    expect(r.patterns.find((p) => p.reference_video_id === 'v1')?.measured).toBe(true);
  });

  it('빈 입력은 빈 결과', async () => {
    const r = await learnThumbnailPatternsFromReferences([]);
    expect(r.patterns).toEqual([]);
    expect(r.eligible_count).toBe(0);
  });
});

describe('estimateHookType (결정론 추정 규칙)', () => {
  it.each([
    ['이 실수로 1억 잃었습니다', 'loss'],
    ['절대 하지 마세요', 'warning'],
    ['아이폰 vs 갤럭시 차이', 'contrast'],
    ['3개월 결과 인증', 'result'],
    ['월 천만원 버는 방법', 'gain'],
    ['아무도 모르는 그것', 'curiosity'],
  ])('%s → %s', (text, expected) => {
    expect(estimateHookType(text)).toBe(expected);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B2 — "내 채널에 모인 사람" 정합
// ═════════════════════════════════════════════════════════════════════════════

describe('judgeThumbnailAudienceFit (B2)', () => {
  it('LLM 판정 결과(match/partial/mismatch)를 반환한다', async () => {
    const r = await judgeThumbnailAudienceFit(
      { thumbnail_text: '광고비 새는 이유' },
      '마케팅 팀 없는 대표',
      { llmComplete: async () => '{"fit":"match","reason":"대표가 자기 일로 본다"}' },
    );
    expect(r.fit).toBe('match');
    expect(r.source).toBe('llm');
  });

  it('LLM 실패 시 unknown graceful', async () => {
    const r = await judgeThumbnailAudienceFit(
      { thumbnail_text: '광고비 새는 이유' },
      '마케팅 팀 없는 대표',
      {
        llmComplete: async () => {
          throw new Error('down');
        },
        maxRetries: 0,
      },
    );
    expect(r.fit).toBe('unknown');
    expect(r.source).toBe('fallback');
  });

  it('프로필 누락 시 unknown', async () => {
    const r = await judgeThumbnailAudienceFit({ thumbnail_text: '문구' }, '  ');
    expect(r.fit).toBe('unknown');
  });
});

describe('reviewThumbnailCandidate — B2 시청층 정합 항목', () => {
  it('channel_audience_profile 제공 시 체크리스트에 시청층 정합 항목이 추가된다', () => {
    const r = reviewThumbnailCandidate({
      thumbnail_text: '짧은 문구',
      channel_audience_profile: '마케팅 팀 없는 대표',
    });
    expect(r.checklist).toContain(AUDIENCE_FIT_CHECKLIST_ITEM);
    expect(r.checklist.length).toBe(THUMBNAIL_REVIEW_CHECKLIST.length + 1);
  });

  it('프로필 없으면 기존 체크리스트 그대로 (하위호환)', () => {
    const r = reviewThumbnailCandidate({ thumbnail_text: '짧은 문구' });
    expect(r.checklist).toEqual(THUMBNAIL_REVIEW_CHECKLIST);
    expect(r.warnings).toHaveLength(0);
  });
});

describe('buildThumbnailMatrix9 — B2 프롬프트 보강', () => {
  const MATRIX_INPUT: ThumbnailMatrixInput = {
    video_id: 'vid-1',
    title: BASE_INPUT.title,
    main_click_reason: BASE_INPUT.main_click_reason,
    target_audience: BASE_INPUT.target_audience,
    target_problem: BASE_INPUT.target_problem,
    target_desire: BASE_INPUT.target_desire,
    target_loss_to_avoid: '광고비 낭비',
    reference_patterns: [],
    channel_audience_profile: '자동화에 관심 있는 1인 대표',
  };

  it('프롬프트에 시청층 규칙과 프로필이 들어간다', async () => {
    let captured = '';
    await buildThumbnailMatrix9(MATRIX_INPUT, {
      llmComplete: async (prompt) => {
        captured = prompt;
        throw new Error('capture only');
      },
      maxRetries: 0,
    });
    expect(captured).toContain('내 채널에 모인 사람');
    expect(captured).toContain('주제 매몰 금지');
    expect(captured).toContain('자동화에 관심 있는 1인 대표');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B3 — 썸네일 문구에 제목 디벨롭 기술 재적용
// ═════════════════════════════════════════════════════════════════════════════

describe('developThumbnailTextWithTitleTechniques (B3)', () => {
  const INPUT = {
    text: '광고비 새는 이유',
    topic: '마케팅 자동화',
    target_audience: '마케팅 팀 없는 대표',
  };

  it('기술 3종(2·5·6단계)이 정의되어 있다', () => {
    expect(THUMBNAIL_TEXT_TITLE_TECHNIQUES).toEqual(['easy_words', 'modifier', 'question']);
    expect(THUMBNAIL_TEXT_TECHNIQUE_GUIDANCE.easy_words).toContain('일상어');
    expect(THUMBNAIL_TEXT_TECHNIQUE_GUIDANCE.modifier).toContain('수식어');
    expect(THUMBNAIL_TEXT_TECHNIQUE_GUIDANCE.question).toContain('질문');
  });

  it('LLM 경로: 후보 3개 + 16자 검수', async () => {
    const r = await developThumbnailTextWithTitleTechniques(INPUT, {
      llmComplete: async () =>
        JSON.stringify([
          { technique: 'easy_words', text: '돈 새는 이유' },
          { technique: 'modifier', text: '매달 돈 새는 이유' },
          { technique: 'question', text: '광고비, 어디로 사라질까' },
        ]),
    });
    expect(r.source).toBe('llm');
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates.every((c) => !c.over_limit)).toBe(true);
  });

  it('16자 초과 후보는 경고 + 축약 후보를 단다', async () => {
    const long = '대표님들이 절대 모르는 광고비가 줄줄 새는 진짜 이유'; // > 16자
    const r = await developThumbnailTextWithTitleTechniques(INPUT, {
      llmComplete: async () =>
        JSON.stringify([
          { technique: 'easy_words', text: long },
          { technique: 'modifier', text: '짧은 문구' },
          { technique: 'question', text: '짧은 질문?' },
        ]),
    });
    const overCandidate = r.candidates.find((c) => c.technique === 'easy_words')!;
    expect(overCandidate.over_limit).toBe(true);
    expect(overCandidate.warning).toContain(`${THUMBNAIL_TEXT_RECOMMENDED_MAX}자`);
    expect(overCandidate.shortened_candidate).toBeDefined();
    expect([...overCandidate.shortened_candidate!].length).toBeLessThanOrEqual(
      THUMBNAIL_TEXT_RECOMMENDED_MAX,
    );
  });

  it('폴백: 원문 유지 + 노트', async () => {
    const r = await developThumbnailTextWithTitleTechniques(INPUT);
    expect(r.source).toBe('fallback');
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates.every((c) => c.text === INPUT.text)).toBe(true);
    expect(r.notes.some((n) => n.includes('원문 유지'))).toBe(true);
  });

  it('빈 문구는 거부한다', async () => {
    await expect(
      developThumbnailTextWithTitleTechniques({ ...INPUT, text: '' }),
    ).rejects.toThrow('text');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B4 — 썸네일↔도입부 강도 연동
// ═════════════════════════════════════════════════════════════════════════════

describe('scoreIntroHookStrength (B4)', () => {
  it('LLM 점수를 0~10으로 클램프해 반환한다', async () => {
    const r = await scoreIntroHookStrength(
      { intro_text: '이 영상 끝까지 보면 광고비 절반이 줄어듭니다.' },
      { llmComplete: async () => '{"score":9,"reason":"약속이 선명함"}' },
    );
    expect(r.score).toBe(9);
    expect(r.source).toBe('llm');
  });

  it('LLM 실패/미주입 시 null + 노트', async () => {
    const r = await scoreIntroHookStrength({ intro_text: '도입부' });
    expect(r.score).toBeNull();
    expect(r.source).toBe('fallback');
    expect(r.reason).toContain('수동 평가');
  });

  it('빈 도입부는 null', async () => {
    const r = await scoreIntroHookStrength({ intro_text: '  ' });
    expect(r.score).toBeNull();
  });
});

describe('evaluateHookIntensityAlignment (B4 — 순수 결정론)', () => {
  it('썸네일 9점·도입부 9점 → aligned', () => {
    const r = evaluateHookIntensityAlignment({ thumbnail_score: 9, intro_score: 9 });
    expect(r.status).toBe('aligned');
    expect(r.gap).toBe(0);
  });

  it('경계: 도입부 = 썸네일 - 1 이면 aligned', () => {
    expect(
      evaluateHookIntensityAlignment({ thumbnail_score: 9, intro_score: 8 }).status,
    ).toBe('aligned');
  });

  it('도입부 < 썸네일 - 1 이면 intro_weaker 경고 + 권장 액션', () => {
    const r = evaluateHookIntensityAlignment({ thumbnail_score: 9, intro_score: 5 });
    expect(r.status).toBe('intro_weaker');
    expect(r.gap).toBe(4);
    expect(r.warning).toContain('9점이면 도입부도 9점');
    expect(r.recommended_action).toBe('도입부를 썸네일 기대 수준으로 보강');
  });

  it('도입부가 더 강하면 aligned (역방향은 경고하지 않음)', () => {
    expect(
      evaluateHookIntensityAlignment({ thumbnail_score: 5, intro_score: 9 }).status,
    ).toBe('aligned');
  });

  it('null/undefined 입력은 insufficient_data graceful', () => {
    expect(
      evaluateHookIntensityAlignment({ thumbnail_score: null, intro_score: 9 }).status,
    ).toBe('insufficient_data');
    expect(
      evaluateHookIntensityAlignment({ thumbnail_score: 9, intro_score: undefined }).status,
    ).toBe('insufficient_data');
    expect(
      evaluateHookIntensityAlignment({ thumbnail_score: null, intro_score: null }).gap,
    ).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B5 — 디벨롭 자가 재귀 점검
// ═════════════════════════════════════════════════════════════════════════════

describe('evaluateDevelopImprovement (B5)', () => {
  const INPUT = {
    original: '카페 창업 실패 이유',
    developed: '카페 차리고 1년 만에 망하는 이유',
    context: '주제: 카페 창업 / 타깃: 예비 창업자',
  };

  it('LLM improved=true → keep', async () => {
    const r = await evaluateDevelopImprovement(INPUT, {
      llmComplete: async () =>
        JSON.stringify({
          improved: true,
          hook_reason_original: '실패라는 손실 자극',
          hook_reason_developed: '1년이라는 구체 기간이 내 일처럼 느껴짐',
          reason: '구체성이 후킹을 강화',
        }),
    });
    expect(r.improved).toBe(true);
    expect(r.recommendation).toBe('keep');
    expect(r.source).toBe('llm');
    expect(r.hook_reason_developed).toContain('1년');
  });

  it('LLM improved=false → redo', async () => {
    const r = await evaluateDevelopImprovement(INPUT, {
      llmComplete: async () =>
        JSON.stringify({
          improved: false,
          hook_reason_original: '명확한 손실',
          hook_reason_developed: '길어져서 클릭 이유가 흐려짐',
          reason: '후퇴',
        }),
    });
    expect(r.improved).toBe(false);
    expect(r.recommendation).toBe('redo');
  });

  it('LLM 실패/미주입 시 unknown + keep 권장 노트', async () => {
    const r = await evaluateDevelopImprovement(INPUT);
    expect(r.improved).toBeNull();
    expect(r.recommendation).toBe('unknown');
    expect(r.reason).toContain('keep');
    expect(r.source).toBe('fallback');
  });

  it('빈 입력은 거부한다', async () => {
    await expect(
      evaluateDevelopImprovement({ original: '', developed: '결과' }),
    ).rejects.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B6 — 타깃 채널 우선 발굴
// ═════════════════════════════════════════════════════════════════════════════

describe('buildChannelFirstDiscoveryPlan (B6)', () => {
  const INPUT = {
    product: '마케팅 자동화 SaaS',
    target_audience: '마케팅 팀 없는 대표',
    my_terms: ['마케팅 자동화', '인스타 자동 DM'],
  };

  it('결정론 폴백: 채널 쿼리·매핑·재검색 쿼리를 만든다', async () => {
    const r = await buildChannelFirstDiscoveryPlan(INPUT);
    expect(r.source).toBe('fallback');
    expect(r.channel_queries.length).toBeGreaterThanOrEqual(5);
    expect(r.channel_queries[0]).toBe('마케팅 팀 없는 대표');
    expect(r.term_mappings).toHaveLength(2);
    expect(r.requery_terms).toContain('마케팅 자동화');
    expect(r.requery_terms).toContain('마케팅 팀 없는 대표 인스타 자동 DM');
    expect(r.notes).toContain(AUDIENCE_CHANNEL_CRITERIA);
  });

  it('LLM 경로: 계획을 그대로 반환한다', async () => {
    const r = await buildChannelFirstDiscoveryPlan(INPUT, {
      llmComplete: async () =>
        JSON.stringify({
          channel_queries: ['사장 브이로그', '자영업 인터뷰'],
          term_mappings: [{ discovered_term: '단골 만들기', my_term: '고객 리텐션 자동화' }],
          requery_terms: ['고객 리텐션 자동화'],
        }),
    });
    expect(r.source).toBe('llm');
    expect(r.channel_queries).toContain('사장 브이로그');
    expect(r.term_mappings[0].my_term).toBe('고객 리텐션 자동화');
  });

  it('프롬프트에 컨설팅 기준(채널 우선·유튜브 출력)이 들어간다', async () => {
    let captured = '';
    await buildChannelFirstDiscoveryPlan(INPUT, {
      llmComplete: async (p) => {
        captured = p;
        throw new Error('capture only');
      },
      maxRetries: 0,
    });
    expect(captured).toContain('볼만한 채널');
    expect(captured).toContain('유튜브 검색용');
    expect(captured).toContain('네이버');
  });

  it('타깃 누락은 거부한다', async () => {
    await expect(
      buildChannelFirstDiscoveryPlan({ ...INPUT, target_audience: '' }),
    ).rejects.toThrow('target_audience');
  });
});

describe('selectAudienceChannels (B6)', () => {
  const CHANNELS = [
    { channel_id: 'c1', name: '사장님 생존기', description: '자영업 대표 인터뷰 채널' },
    { channel_id: 'c2', name: '먹방 일기', description: '오늘도 먹는다' },
  ];

  it('제1 기준이 정본 문자열로 명시되어 있다', () => {
    expect(AUDIENCE_CHANNEL_CRITERIA).toContain('볼만한 채널인지가 제일 중요');
  });

  it('LLM 판정: would_watch에 따라 selected/rejected 분리', async () => {
    const r = await selectAudienceChannels(CHANNELS, { target_audience: '마케팅 팀 없는 대표' }, {
      llmComplete: async () =>
        JSON.stringify([
          { channel_id: 'c1', would_watch: true, reason: '대표가 본다' },
          { channel_id: 'c2', would_watch: false, reason: '타깃과 무관' },
        ]),
    });
    expect(r.source).toBe('llm');
    expect(r.selected.map((c) => c.channel_id)).toEqual(['c1']);
    expect(r.rejected.map((c) => c.channel_id)).toEqual(['c2']);
    expect(r.criteria).toBe(AUDIENCE_CHANNEL_CRITERIA);
  });

  it('결정론 폴백: 타깃 키워드 매칭으로 분리한다', async () => {
    const r = await selectAudienceChannels(CHANNELS, { target_audience: '자영업 대표' });
    expect(r.source).toBe('fallback');
    expect(r.selected.map((c) => c.channel_id)).toEqual(['c1']);
    expect(r.rejected.map((c) => c.channel_id)).toEqual(['c2']);
    expect(r.selected[0].reason).toContain('LLM 재판정 권장');
  });

  it('빈 채널 목록은 빈 결과', async () => {
    const r = await selectAudienceChannels([], { target_audience: '대표' });
    expect(r.selected).toEqual([]);
    expect(r.rejected).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B7 — 폰트 출처·라이선스
// ═════════════════════════════════════════════════════════════════════════════

describe('폰트 출처·라이선스 (B7)', () => {
  it('체크리스트에 폰트 라이선스 항목이 있다', () => {
    const joined = THUMBNAIL_REVIEW_CHECKLIST.join(' ');
    expect(joined).toContain('폰트');
    expect(joined).toContain('눈누');
  });

  it('font_source가 있는데 license_checked가 아니면 경고한다', () => {
    const unchecked = reviewThumbnailCandidate({
      thumbnail_text: '짧은 문구',
      font_source: { name: '배민 한나체', license_checked: false },
    });
    expect(unchecked.warnings.some((w) => w.includes('라이선스 미확인'))).toBe(true);

    const missing = reviewThumbnailCandidate({
      thumbnail_text: '짧은 문구',
      font_source: { name: '배민 한나체' },
    });
    expect(missing.warnings.some((w) => w.includes('라이선스 미확인'))).toBe(true);
  });

  it('license_checked=true면 경고 없음, font_source 미제공도 경고 없음(하위호환)', () => {
    const checked = reviewThumbnailCandidate({
      thumbnail_text: '짧은 문구',
      font_source: { name: '눈누 프리텐다드', license_checked: true },
    });
    expect(checked.warnings).toHaveLength(0);

    const none = reviewThumbnailCandidate({ thumbnail_text: '짧은 문구' });
    expect(none.warnings).toHaveLength(0);
  });
});
