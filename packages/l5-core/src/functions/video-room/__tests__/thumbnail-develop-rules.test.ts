// 강의 노트(2026-06-11) 반영 검증 — 비중 45/45/10, 검수 체크리스트, 7일 교체 윈도우,
// 모니터링 교체 신호, 매트릭스 프롬프트 보강.
import {
  THUMBNAIL_COMPONENT_WEIGHTS,
  THUMBNAIL_REVIEW_CHECKLIST,
  THUMBNAIL_TEXT_RECOMMENDED_MAX,
  reviewThumbnailCandidate,
  buildThumbnailMatrix9,
  type ThumbnailMatrixInput,
} from '../thumbnail-matrix';
import {
  THUMBNAIL_SWAP_WINDOW_DAYS,
  buildSequentialRotationPlan,
  validateRotationWindow,
  evaluateThumbnailSwapSignal,
} from '../thumbnail-ab-test';

const MATRIX_INPUT: ThumbnailMatrixInput = {
  video_id: 'vid-1',
  title: '인스타 마케팅 자동화로 매출 3배',
  main_click_reason: '마케팅 인력 없이 매출을 늘릴 수 있다',
  target_audience: '마케팅 팀 없는 대표',
  target_problem: '마케팅에 쓸 시간이 없다',
  target_desire: '자동으로 고객이 들어온다',
  target_loss_to_avoid: '광고비 낭비',
  reference_patterns: [],
};

describe('THUMBNAIL_COMPONENT_WEIGHTS (강의: 이미지 45 / 문구 45 / 디자인 10)', () => {
  it('비중 합이 1이고 디자인이 최저 비중이다', () => {
    const { image, text, design } = THUMBNAIL_COMPONENT_WEIGHTS;
    expect(image + text + design).toBeCloseTo(1);
    expect(image).toBe(0.45);
    expect(text).toBe(0.45);
    expect(design).toBe(0.10);
  });
});

describe('reviewThumbnailCandidate (검수 보조)', () => {
  it('체크리스트에 데드존/작은화면/무게중심 항목이 들어있다', () => {
    const joined = THUMBNAIL_REVIEW_CHECKLIST.join(' ');
    expect(joined).toContain('데드존');
    expect(joined).toContain('작은 화면');
    expect(joined).toContain('무게중심');
    expect(joined).toContain('카톡');
  });

  it('문구가 권장 글자 수를 넘으면 경고한다', () => {
    const long = '가'.repeat(THUMBNAIL_TEXT_RECOMMENDED_MAX + 1);
    const r = reviewThumbnailCandidate({ thumbnail_text: long });
    expect(r.warnings.some((w) => w.includes('글씨를 줄여야'))).toBe(true);
  });

  it('짧은 문구는 경고가 없다', () => {
    const r = reviewThumbnailCandidate({ thumbnail_text: '광고비 새는 이유' });
    expect(r.warnings).toHaveLength(0);
    expect(r.checklist.length).toBeGreaterThan(0);
  });

  it('디자인 노트가 과도하면 디자인 10% 원칙 경고를 낸다', () => {
    const r = reviewThumbnailCandidate({
      thumbnail_text: '짧은 문구',
      design_notes: '디'.repeat(130),
    });
    expect(r.warnings.some((w) => w.includes('10%'))).toBe(true);
  });
});

describe('매트릭스 프롬프트 보강 (45/45/10 + 공감 + 글자 수)', () => {
  it('LLM 프롬프트에 강의 규칙이 들어간다', async () => {
    let captured = '';
    await buildThumbnailMatrix9(MATRIX_INPUT, {
      llmComplete: async (prompt) => {
        captured = prompt;
        throw new Error('capture only'); // 폴백 경로로 종료
      },
      maxRetries: 0,
    });
    expect(captured).toContain('이미지 45%');
    expect(captured).toContain('디자인 10%');
    expect(captured).toContain('공감');
    expect(captured).toContain('16자');
    expect(captured).toContain('왼쪽 위');
    expect(captured).toContain('둘 다 디벨롭');
  });
});

describe('validateRotationWindow (업로드 후 7일 교체 윈도우)', () => {
  it('기본 3개 × 2일 = 6일은 7일 윈도우에 들어간다', () => {
    const slots = buildSequentialRotationPlan(['a', 'b', 'c'], 2);
    const check = validateRotationWindow(slots);
    expect(check.fits).toBe(true);
    expect(check.total_days).toBe(6);
    expect(check.window_days).toBe(THUMBNAIL_SWAP_WINDOW_DAYS);
  });

  it('3개 × 3일 = 9일은 윈도우 초과 경고를 낸다', () => {
    const slots = buildSequentialRotationPlan(['a', 'b', 'c'], 3);
    const check = validateRotationWindow(slots);
    expect(check.fits).toBe(false);
    expect(check.note).toContain('초과');
  });
});

describe('evaluateThumbnailSwapSignal (모니터링 교체 신호)', () => {
  it('윈도우(7일) 경과 후에는 too_late', () => {
    const r = evaluateThumbnailSwapSignal({ days_since_upload: 8, views: 50 });
    expect(r.action).toBe('too_late');
  });

  it('기본 모드: 기대 추세 미달이면 swap_recommended', () => {
    // 기본 기준 7일 100회 → 3.5일차 기대 50회. 실측 10회 → 교체 권장.
    const r = evaluateThumbnailSwapSignal({ days_since_upload: 3.5, views: 10 });
    expect(r.action).toBe('swap_recommended');
    expect(r.reason).toContain('썸네일 교체');
  });

  it('기본 모드: 기대 추세 충족이면 keep', () => {
    const r = evaluateThumbnailSwapSignal({ days_since_upload: 3.5, views: 80 });
    expect(r.action).toBe('keep');
  });

  it('업로드 직후(0일차)는 keep — 데이터 부족으로 교체 신호를 내지 않는다', () => {
    const r = evaluateThumbnailSwapSignal({ days_since_upload: 0, views: 0 });
    expect(r.action).toBe('keep');
  });

  it('강의 원 기준(분당 조회수)을 설정하면 그 기준으로 판단한다', () => {
    // 1일차 = 1440분, 분당 100 기준 → 144,000회 필요. 1,000회면 교체 권장.
    const swap = evaluateThumbnailSwapSignal(
      { days_since_upload: 1, views: 1000 },
      { views_per_minute_pass: 100 },
    );
    expect(swap.action).toBe('swap_recommended');

    const keep = evaluateThumbnailSwapSignal(
      { days_since_upload: 1, views: 200000 },
      { views_per_minute_pass: 100 },
    );
    expect(keep.action).toBe('keep');
  });

  it('임계값/윈도우는 설정으로 조정 가능하다', () => {
    const r = evaluateThumbnailSwapSignal(
      { days_since_upload: 5, views: 30 },
      { min_views_by_window_end: 40, window_days: 10 },
    );
    expect(r.action).toBe('keep'); // 기대 추세 = 40 * 5/10 = 20 ≤ 30
  });
});
