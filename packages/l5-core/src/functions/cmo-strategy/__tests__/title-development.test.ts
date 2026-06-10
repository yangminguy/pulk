/**
 * WO-1: 제목 디벨롭 8단계 — l5-core 타입 + 결정론 함수 단위테스트
 *
 * spec: docs/_acr-progress/wo-1-l5-core-타입-결정론-함수-일괄.md §S3/§S5
 * PRD:  docs/prd/cmo-title-development.md §17, §19, §21, §25
 */
import {
  generateTitleSearchTerms,
  validateTitleReference,
  validateTitleReferences,
  generateCrossCombinations,
  countTitleLength,
  isTitleTooLong,
  isAwkward,
  scoreFinalTitle,
  recommendFromScore,
  buildSecondBrainSummary,
  TitleDevelopmentReferenceSchema,
} from '../title-development';
import type {
  TitleDevelopmentReference,
  TitleDevelopmentWorkflowRun,
  CombinationType,
} from '../title-development-types';

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

describe('validateTitleReference (AC-S2, AC-S3)', () => {
  it('조회수 49,999는 "조회수 5만 미만" 사유를 포함한다', () => {
    const reasons = validateTitleReference(makeRef({ view_count: 49999 }));
    expect(reasons).toContain('조회수 5만 미만');
  });

  it('조회수 50,000은 조회수 사유가 없다', () => {
    const reasons = validateTitleReference(makeRef({ view_count: 50000 }));
    expect(reasons).not.toContain('조회수 5만 미만');
  });

  it('정상 레퍼런스는 사유가 0개다', () => {
    expect(validateTitleReference(makeRef())).toEqual([]);
  });

  it('성과도/기여도가 Good·Great가 아니면 해당 사유를 포함한다', () => {
    const reasons = validateTitleReference(
      makeRef({
        performance_grade: 'Bad' as never,
        contribution_grade: 'Soso' as never,
      }),
    );
    expect(reasons).toContain('성과도 Good/Great 미충족');
    expect(reasons).toContain('기여도 Good/Great 미충족');
  });

  it('제목/썸네일 문구가 비어 있으면 해당 사유를 포함한다', () => {
    const reasons = validateTitleReference(makeRef({ title: '  ', thumbnail_text: '' }));
    expect(reasons).toContain('제목 없음');
    expect(reasons).toContain('썸네일 문구 없음');
  });
});

describe('validateTitleReferences (AC-S4, AC-S5)', () => {
  it('레퍼런스 1개만 입력하면 passed=false, request_more_references (PRD §25.2)', () => {
    const result = validateTitleReferences([makeRef()]);
    expect(result.passed).toBe(false);
    expect(result.next_action).toBe('request_more_references');
  });

  it('통과 레퍼런스 2개면 passed=true, continue (PRD §25.1 데이터)', () => {
    const ref1 = makeRef({
      id: 'ref-1',
      view_count: 80000,
      performance_grade: 'Great',
      contribution_grade: 'Good',
    });
    const ref2 = makeRef({
      id: 'ref-2',
      view_count: 120000,
      performance_grade: 'Good',
      contribution_grade: 'Great',
    });
    const result = validateTitleReferences([ref1, ref2]);
    expect(result.passed).toBe(true);
    expect(result.next_action).toBe('continue');
    expect(result.passed_references).toHaveLength(2);
    expect(result.failed_references).toHaveLength(0);
  });

  it('1개가 조건 미달이면 passed=false이고 failed에 사유가 기록된다 (PRD §25.3)', () => {
    const result = validateTitleReferences([
      makeRef({ id: 'ref-1', view_count: 30000 }),
      makeRef({ id: 'ref-2' }),
    ]);
    expect(result.passed).toBe(false);
    expect(result.next_action).toBe('request_more_references');
    expect(result.failed_references).toEqual([
      { reference_id: 'ref-1', reasons: ['조회수 5만 미만'] },
    ]);
  });
});

describe('generateCrossCombinations (AC-S6)', () => {
  const ref1 = makeRef({ id: 'ref-1' });
  const ref2 = makeRef({
    id: 'ref-2',
    title: '쇼츠 자동화 이렇게 하면 망합니다',
    thumbnail_text: '90%가 모르는 실수',
  });
  const combos = () => generateCrossCombinations(ref1, ref2);

  it('항상 4개를 생성하고 CombinationType 4종이 각 1개씩이다', () => {
    const result = combos();
    expect(result).toHaveLength(4);
    const types = result.map((c) => c.combination_type).sort();
    const expected: CombinationType[] = [
      'ref1_thumbnail_ref2_title',
      'ref1_thumbnail_text_as_title_ref2_thumbnail',
      'ref1_title_ref2_thumbnail',
      'ref2_thumbnail_text_as_title_ref1_thumbnail',
    ];
    expect(types).toEqual([...expected].sort());
  });

  it('조합별 source ref id가 PRD §21.3 매핑과 일치한다', () => {
    const byType = Object.fromEntries(combos().map((c) => [c.combination_type, c]));

    // 1. Ref1 썸네일 + Ref2 제목
    expect(byType['ref1_thumbnail_ref2_title'].title_source_ref_id).toBe('ref-2');
    expect(byType['ref1_thumbnail_ref2_title'].thumbnail_source_ref_id).toBe('ref-1');
    // 2. Ref1 제목 + Ref2 썸네일
    expect(byType['ref1_title_ref2_thumbnail'].title_source_ref_id).toBe('ref-1');
    expect(byType['ref1_title_ref2_thumbnail'].thumbnail_source_ref_id).toBe('ref-2');
    // 3. Ref1 썸네일 문구 제목화 + Ref2 썸네일 구조
    expect(byType['ref1_thumbnail_text_as_title_ref2_thumbnail'].title_source_ref_id).toBe('ref-1');
    expect(byType['ref1_thumbnail_text_as_title_ref2_thumbnail'].thumbnail_source_ref_id).toBe('ref-2');
    expect(byType['ref1_thumbnail_text_as_title_ref2_thumbnail'].title_draft).toBe(ref1.thumbnail_text);
    // 4. Ref2 썸네일 문구 제목화 + Ref1 썸네일 구조
    expect(byType['ref2_thumbnail_text_as_title_ref1_thumbnail'].title_source_ref_id).toBe('ref-2');
    expect(byType['ref2_thumbnail_text_as_title_ref1_thumbnail'].thumbnail_source_ref_id).toBe('ref-1');
    expect(byType['ref2_thumbnail_text_as_title_ref1_thumbnail'].title_draft).toBe(ref2.thumbnail_text);
  });

  it('LLM 판정 전 초기값: awkwardness_score=0, passed=false, selected_for_next_step=false, id 유일', () => {
    const result = combos();
    for (const c of result) {
      expect(c.awkwardness_score).toBe(0);
      expect(c.passed).toBe(false);
      expect(c.selected_for_next_step).toBe(false);
      expect(c.id).toBeTruthy();
    }
    expect(new Set(result.map((c) => c.id)).size).toBe(4);
  });
});

describe('countTitleLength / isTitleTooLong (AC-S7)', () => {
  it('grapheme 단위로 센다: 이모지 포함 제목', () => {
    expect(countTitleLength('인스타그램 릴스 자동화 🚀')).toBe(14);
  });

  it('35자는 초과가 아니고 36자는 초과다 (PRD §13.4)', () => {
    expect(isTitleTooLong('가'.repeat(35))).toBe(false);
    expect(isTitleTooLong('가'.repeat(36))).toBe(true);
  });

  it('max를 지정하면 해당 기준으로 판정한다', () => {
    expect(isTitleTooLong('가나다', 3)).toBe(false);
    expect(isTitleTooLong('가나다라', 3)).toBe(true);
  });
});

describe('isAwkward', () => {
  it('감점 0이면 어색하지 않고, 감점이 있으면 어색하다 (PRD §9.6 초기값 0)', () => {
    expect(isAwkward(0)).toBe(false);
    expect(isAwkward(1)).toBe(true);
  });
});

describe('scoreFinalTitle (AC-S8)', () => {
  it('만점 입력은 100점이다 (PRD §17.2 배점)', () => {
    expect(
      scoreFinalTitle({
        target_fit: 20,
        desire_clarity: 20,
        problem_sharpness: 20,
        curiosity_gap: 15,
        script_match: 15,
        thumbnail_fit: 10,
      }),
    ).toBe(100);
  });

  it('배점 초과 입력은 항목 상한으로 클램프된다', () => {
    expect(
      scoreFinalTitle({
        target_fit: 999,
        desire_clarity: 20,
        problem_sharpness: 20,
        curiosity_gap: 15,
        script_match: 15,
        thumbnail_fit: 10,
      }),
    ).toBe(100);
  });

  it('부분 점수를 합산한다', () => {
    expect(
      scoreFinalTitle({
        target_fit: 10,
        desire_clarity: 10,
        problem_sharpness: 10,
        curiosity_gap: 5,
        script_match: 5,
        thumbnail_fit: 5,
      }),
    ).toBe(45);
  });
});

describe('recommendFromScore (AC-S9)', () => {
  it.each([
    [85, 'upload_candidate'],
    [100, 'upload_candidate'],
    [84, 'revise'],
    [70, 'revise'],
    [69, 'rerun_reference_search'],
    [0, 'rerun_reference_search'],
  ] as const)('%i점 → %s (PRD §17.3)', (score, expected) => {
    expect(recommendFromScore(score)).toBe(expected);
  });
});

describe('buildSecondBrainSummary (AC-S10)', () => {
  const run: TitleDevelopmentWorkflowRun = {
    id: 'run-1',
    video_project_id: 'vp-1',
    pulling_content_id: 'pc-1',
    pulling_topic: '릴스 자동화',
    target_audience: '1인 사업자',
    exact_search_terms: ['릴스 자동화'],
    expanded_search_terms: ['쇼츠 자동화'],
    forbidden_search_terms: ['브랜딩 일반론'],
    references: [makeRef({ id: 'ref-1' }), makeRef({ id: 'ref-2' })],
    combinations: [],
    step_results: [],
    final_candidates: [
      {
        title: '하루 10분 릴스 자동화, 문의가 끊기지 않는 이유',
        thumbnail_direction: '좌측 인물 + 우측 결과 텍스트',
        target_fit: 18,
        desire_clarity: 18,
        problem_sharpness: 18,
        curiosity_gap: 13,
        script_match: 13,
        thumbnail_fit: 8,
        total_score: 88,
        recommendation: 'upload_candidate',
        reason: '욕망 선명',
        risks: [],
      },
    ],
    selected_title: '하루 10분 릴스 자동화, 문의가 끊기지 않는 이유',
    selected_thumbnail_direction: '좌측 인물 + 우측 결과 텍스트',
    approval_status: 'draft',
    created_at: '2026-06-10T00:00:00.000Z',
    updated_at: '2026-06-10T00:00:00.000Z',
  };

  it('최종 제목·총점·주제를 포함한다', () => {
    const summary = buildSecondBrainSummary(run);
    expect(summary).toContain(run.selected_title);
    expect(summary).toContain('88');
    expect(summary).toContain('릴스 자동화');
  });

  it('같은 입력이면 같은 출력이다 (결정론)', () => {
    expect(buildSecondBrainSummary(run)).toBe(buildSecondBrainSummary(run));
  });
});

describe('generateTitleSearchTerms (AC-S11)', () => {
  const input = {
    pulling_topic: '릴스 자동화',
    target_audience: '1인 사업자',
    business_goal: '문의 늘리기',
  };

  it('exact에 풀링 주제가 포함되고 3개 배열 모두 비어있지 않다', () => {
    const result = generateTitleSearchTerms(input);
    expect(result.exact_search_terms).toContain('릴스 자동화');
    expect(result.exact_search_terms.length).toBeGreaterThan(0);
    expect(result.expanded_search_terms.length).toBeGreaterThan(0);
    expect(result.forbidden_search_terms.length).toBeGreaterThan(0);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it('같은 입력이면 같은 출력이다 (결정론)', () => {
    expect(generateTitleSearchTerms(input)).toEqual(generateTitleSearchTerms(input));
  });
});

describe('TitleDevelopmentReferenceSchema (외부 입력 경계 zod)', () => {
  it('정상 레퍼런스는 parse를 통과한다', () => {
    expect(() => TitleDevelopmentReferenceSchema.parse(makeRef())).not.toThrow();
  });

  it('등급이 잘못되면 parse가 실패한다', () => {
    expect(() =>
      TitleDevelopmentReferenceSchema.parse(makeRef({ performance_grade: 'Bad' as never })),
    ).toThrow();
  });

  it('view_count가 숫자가 아니면 parse가 실패한다', () => {
    expect(() =>
      TitleDevelopmentReferenceSchema.parse(makeRef({ view_count: '8만' as never })),
    ).toThrow();
  });
});
