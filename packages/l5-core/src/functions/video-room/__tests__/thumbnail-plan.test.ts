import { buildThumbnailPlan, BuildThumbnailPlanInput } from '../thumbnail-plan';
import { ThumbnailPattern, ReferenceCandidate } from '../types';

// ── fixtures ──────────────────────────────────────────────────────────────────

const pattern1: ThumbnailPattern = {
  id: 'tp-1',
  reference_video_id: 'vid-001',
  raw_thumbnail_text: 'AI팀 쓰기 전에 꼭 봐야 할 것',
  hook_type: 'warning',
  structure: '[대상] + [경고] + [숫자]',
  reusable_formula: '[타깃] + [손실 경고] + [행동 제안]',
  adapted_thumbnail_candidates: ['AI 마케팅팀 쓰기 전 확인 필수', '이것 모르면 돈 낭비'],
};

const pattern2: ThumbnailPattern = {
  id: 'tp-2',
  reference_video_id: 'vid-002',
  raw_thumbnail_text: '월매출 1억 만든 진짜 비법',
  hook_type: 'result',
  structure: '[결과 수치] + [비법]',
  reusable_formula: '[달성 수치] + [방법론]',
  adapted_thumbnail_candidates: ['월매출 1억, 이렇게 했습니다'],
};

const pattern3: ThumbnailPattern = {
  id: 'tp-3',
  reference_video_id: 'vid-003',
  raw_thumbnail_text: '왜 대부분 실패하는가',
  hook_type: 'loss',
  structure: '[손실 질문]',
  reusable_formula: '[타깃 손실 상황] + [원인 제시]',
  adapted_thumbnail_candidates: ['왜 당신의 마케팅은 실패하는가'],
};

const ref1: ReferenceCandidate = {
  id: 'ref-1',
  research_session_id: 'sess-1',
  title: '마케팅 대행사 현실',
  url: 'https://youtube.com/watch?v=abc',
  source: 'viewtrap',
  consumer_stage: '욕구',
  selected_for: 'thumbnail_pattern',
  selection_reason: '높은 조회수 + warning 훅 검증',
};

const baseInput: BuildThumbnailPlanInput = {
  content_id: 'content-123',
  thumbnail_direction: 'AI 마케팅 도구 도입 전 반드시 확인해야 할 3가지',
  reference_patterns: [pattern1, pattern2, pattern3],
  reference_candidates: [ref1],
  extra_insights: ['insight-sb-001', 'insight-sb-002'],
};

// ── Case 1: 정상 입력 — 후보 최소 3개 생성 ──────────────────────────────────

describe('buildThumbnailPlan — 정상 입력', () => {
  it('후보를 최소 3개 생성한다', () => {
    const result = buildThumbnailPlan(baseInput);
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it('recommended가 candidates 중 하나의 candidate_id다', () => {
    const result = buildThumbnailPlan(baseInput);
    const ids = result.candidates.map((c) => c.candidate_id);
    expect(ids).toContain(result.recommended);
  });

  it('모든 후보에 used_insights가 기록된다', () => {
    const result = buildThumbnailPlan(baseInput);
    for (const c of result.candidates) {
      expect(Array.isArray(c.used_insights)).toBe(true);
    }
  });

  it('content_id, thumbnail_direction, approval_status가 올바르게 반환된다', () => {
    const result = buildThumbnailPlan(baseInput);
    expect(result.content_id).toBe('content-123');
    expect(result.thumbnail_direction).toBe(baseInput.thumbnail_direction);
    expect(result.approval_status).toBe('draft');
  });

  it('why_recommended가 비어 있지 않다', () => {
    const result = buildThumbnailPlan(baseInput);
    expect(result.why_recommended.trim().length).toBeGreaterThan(0);
  });

  it('각 후보의 click_logic이 유효한 ThumbnailHookType이다', () => {
    const validHooks = ['loss', 'gain', 'curiosity', 'warning', 'authority', 'result', 'contrast'];
    const result = buildThumbnailPlan(baseInput);
    for (const c of result.candidates) {
      expect(validHooks).toContain(c.click_logic);
    }
  });
});

// ── Case 2: 레퍼런스 패턴 1개 입력 — 나머지 2개 자동 패딩 ──────────────────

describe('buildThumbnailPlan — 패턴 1개 입력', () => {
  const input: BuildThumbnailPlanInput = {
    ...baseInput,
    reference_patterns: [pattern1],
    reference_candidates: [],
  };

  it('패턴이 1개여도 후보 3개 이상 생성', () => {
    const result = buildThumbnailPlan(input);
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it('recommended가 여전히 candidates 중 하나', () => {
    const result = buildThumbnailPlan(input);
    const ids = result.candidates.map((c) => c.candidate_id);
    expect(ids).toContain(result.recommended);
  });

  it('레퍼런스 없음 risk_note 포함', () => {
    const result = buildThumbnailPlan(input);
    const hasRefNote = result.risk_notes.some((n) => n.includes('ReferenceCandidate'));
    expect(hasRefNote).toBe(true);
  });
});

// ── Case 3: 빈 입력 처리 (패턴/후보 없음) ────────────────────────────────────

describe('buildThumbnailPlan — 빈 입력 (패턴/후보 없음)', () => {
  const emptyInput: BuildThumbnailPlanInput = {
    content_id: 'content-empty',
    thumbnail_direction: '소비자 욕구를 자극하는 썸네일',
    reference_patterns: [],
    reference_candidates: [],
  };

  it('패턴이 없어도 후보 3개 이상 생성', () => {
    const result = buildThumbnailPlan(emptyInput);
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it('recommended가 candidates 중 하나', () => {
    const result = buildThumbnailPlan(emptyInput);
    const ids = result.candidates.map((c) => c.candidate_id);
    expect(ids).toContain(result.recommended);
  });

  it('레퍼런스 패턴 없음 risk_note 포함', () => {
    const result = buildThumbnailPlan(emptyInput);
    const hasNote = result.risk_notes.some((n) => n.includes('레퍼런스 패턴'));
    expect(hasNote).toBe(true);
  });

  it('used_insights는 빈 배열일 수 있다 (오류 아님)', () => {
    const result = buildThumbnailPlan(emptyInput);
    for (const c of result.candidates) {
      expect(Array.isArray(c.used_insights)).toBe(true);
    }
  });
});

// ── Case 4: 유효성 검사 — 필수 필드 누락 ─────────────────────────────────────

describe('buildThumbnailPlan — 필수 필드 유효성 검사', () => {
  it('content_id가 비면 throw', () => {
    expect(() =>
      buildThumbnailPlan({ ...baseInput, content_id: '' }),
    ).toThrow('content_id must not be empty');
  });

  it('content_id가 공백만이면 throw', () => {
    expect(() =>
      buildThumbnailPlan({ ...baseInput, content_id: '   ' }),
    ).toThrow('content_id must not be empty');
  });

  it('thumbnail_direction이 비면 throw', () => {
    expect(() =>
      buildThumbnailPlan({ ...baseInput, thumbnail_direction: '' }),
    ).toThrow('thumbnail_direction must not be empty');
  });

  it('thumbnail_direction 없어도 brief.thumbnail_direction으로 대체', () => {
    const input: BuildThumbnailPlanInput = {
      ...baseInput,
      thumbnail_direction: '',
      brief: {
        thumbnail_direction: '브리프에서 온 방향성',
        risk_notes: ['브리프 리스크'],
      },
    };
    const result = buildThumbnailPlan(input);
    expect(result.thumbnail_direction).toBe('브리프에서 온 방향성');
  });

  it('brief.risk_notes가 결과 risk_notes에 포함된다', () => {
    const input: BuildThumbnailPlanInput = {
      ...baseInput,
      brief: {
        thumbnail_direction: baseInput.thumbnail_direction,
        risk_notes: ['과장 표현 주의'],
      },
    };
    const result = buildThumbnailPlan(input);
    expect(result.risk_notes).toContain('과장 표현 주의');
  });
});
