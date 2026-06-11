import {
  buildThumbnailMatrix9,
  analyzeThumbnailPsychology,
  ThumbnailMatrixCandidateSchema,
  ThumbnailPsychologyAnalysisSchema,
  SLOT_LABELS,
  IMAGE_STRATEGIES,
  TEXT_STRATEGIES,
  type ThumbnailMatrixInput,
  type ThumbnailMatrixCandidate,
} from '../thumbnail-matrix';
import type { ThumbnailPattern } from '../types';

// ── 공통 테스트 입력 ─────────────────────────────────────────────────────────

const BASE_INPUT: ThumbnailMatrixInput = {
  video_id: 'vid-001',
  title: '광고비 3배 절약하는 자동화 세팅법',
  main_click_reason: '광고비를 절약하는 구체적 방법을 알 수 있다',
  target_audience: '월 광고비 100만원 이상 쓰는 소상공인',
  target_problem: '광고비를 많이 쓰는데 효과를 모르겠다',
  target_desire: '같은 광고비로 3배 더 많은 고객을 확보',
  target_loss_to_avoid: '비효율적 광고 세팅으로 매달 수십만원 낭비',
  reference_patterns: [],
};

const SAMPLE_PATTERN: ThumbnailPattern = {
  id: 'tp-ref-1',
  reference_video_id: 'ref-vid-1',
  raw_thumbnail_text: '이것만 바꿨더니 3배',
  hook_type: 'result',
  structure: '숫자 강조 + 결과 화면',
  reusable_formula: '숫자+결과',
  adapted_thumbnail_candidates: ['자동화만 바꿨더니 3배'],
};

// ── buildThumbnailMatrix9 ────────────────────────────────────────────────────

describe('buildThumbnailMatrix9', () => {
  it('결정론 폴백: LLM 미주입 시 9개 후보 생성', async () => {
    const { candidates, source } = await buildThumbnailMatrix9(BASE_INPUT);
    expect(source).toBe('fallback');
    expect(candidates).toHaveLength(9);
  });

  it('9개 슬롯 A~I 전부 존재', async () => {
    const { candidates } = await buildThumbnailMatrix9(BASE_INPUT);
    const slots = candidates.map((c) => c.slot);
    expect(slots).toEqual([...SLOT_LABELS]);
  });

  it('이미지전략 3종 × 문구전략 3종 = 9개 조합 전부', async () => {
    const { candidates } = await buildThumbnailMatrix9(BASE_INPUT);
    const combos = new Set(candidates.map((c) => `${c.image_strategy}_${c.text_strategy}`));
    expect(combos.size).toBe(9);

    // 모든 이미지전략이 정확히 3번씩
    for (const img of IMAGE_STRATEGIES) {
      expect(candidates.filter((c) => c.image_strategy === img)).toHaveLength(3);
    }
    // 모든 문구전략이 정확히 3번씩
    for (const txt of TEXT_STRATEGIES) {
      expect(candidates.filter((c) => c.text_strategy === txt)).toHaveLength(3);
    }
  });

  it('9개 후보의 클릭 가설이 모두 서로 다르다', async () => {
    const { candidates } = await buildThumbnailMatrix9(BASE_INPUT);
    const hypotheses = new Set(candidates.map((c) => c.click_hypothesis));
    expect(hypotheses.size).toBe(9);
  });

  it('모든 후보가 zod 스키마를 통과', async () => {
    const { candidates } = await buildThumbnailMatrix9(BASE_INPUT);
    for (const c of candidates) {
      expect(() => ThumbnailMatrixCandidateSchema.parse(c)).not.toThrow();
    }
  });

  it('candidate_id가 video_id + slot 조합으로 결정론적', async () => {
    const { candidates } = await buildThumbnailMatrix9(BASE_INPUT);
    for (const c of candidates) {
      expect(c.candidate_id).toBe(`tm-${BASE_INPUT.video_id}-${c.slot}`);
    }
  });

  it('제목과 썸네일 문구가 중복되지 않는다', async () => {
    const { candidates } = await buildThumbnailMatrix9(BASE_INPUT);
    for (const c of candidates) {
      expect(c.thumbnail_text).not.toBe(BASE_INPUT.title);
    }
  });

  it('레퍼런스 패턴이 있어도 결정론 폴백 동작', async () => {
    const input = { ...BASE_INPUT, reference_patterns: [SAMPLE_PATTERN] };
    const { candidates, source } = await buildThumbnailMatrix9(input);
    expect(source).toBe('fallback');
    expect(candidates).toHaveLength(9);
  });

  it('필수 입력 누락 시 throw', async () => {
    await expect(
      buildThumbnailMatrix9({ ...BASE_INPUT, video_id: '' }),
    ).rejects.toThrow('video_id');

    await expect(
      buildThumbnailMatrix9({ ...BASE_INPUT, title: '' }),
    ).rejects.toThrow('title');

    await expect(
      buildThumbnailMatrix9({ ...BASE_INPUT, main_click_reason: '' }),
    ).rejects.toThrow('main_click_reason');
  });

  it('LLM 실패 시 폴백으로 전환', async () => {
    const failingLlm = async () => { throw new Error('LLM error'); };
    const { candidates, source } = await buildThumbnailMatrix9(BASE_INPUT, {
      llmComplete: failingLlm,
    });
    expect(source).toBe('fallback');
    expect(candidates).toHaveLength(9);
  });

  it('동일 입력 → 동일 출력 (결정론)', async () => {
    const r1 = await buildThumbnailMatrix9(BASE_INPUT);
    const r2 = await buildThumbnailMatrix9(BASE_INPUT);
    expect(r1.candidates).toEqual(r2.candidates);
  });
});

// ── analyzeThumbnailPsychology ───────────────────────────────────────────────

describe('analyzeThumbnailPsychology', () => {
  let sampleCandidate: ThumbnailMatrixCandidate;

  beforeAll(async () => {
    const { candidates } = await buildThumbnailMatrix9(BASE_INPUT);
    sampleCandidate = candidates[0]; // slot A: zoom × gain
  });

  it('결정론 폴백: LLM 미주입 시 분석 결과 생성', async () => {
    const { analysis, source } = await analyzeThumbnailPsychology(sampleCandidate);
    expect(source).toBe('fallback');
    expect(analysis.candidate_id).toBe(sampleCandidate.candidate_id);
  });

  it('출력이 zod 스키마를 통과', async () => {
    const { analysis } = await analyzeThumbnailPsychology(sampleCandidate);
    expect(() => ThumbnailPsychologyAnalysisSchema.parse(analysis)).not.toThrow();
  });

  it('모든 필수 필드가 존재하고 비어있지 않다', async () => {
    const { analysis } = await analyzeThumbnailPsychology(sampleCandidate);
    expect(analysis.text_structure.length).toBeGreaterThan(0);
    expect(analysis.text_psychology.length).toBeGreaterThan(0);
    expect(analysis.image_association.length).toBeGreaterThan(0);
    expect(analysis.combined_click_psychology.length).toBeGreaterThan(0);
    expect(analysis.expected_viewer_question.length).toBeGreaterThan(0);
    expect(analysis.expected_viewer_desire.length).toBeGreaterThan(0);
    expect(analysis.expected_viewer_fear.length).toBeGreaterThan(0);
  });

  it('점수가 0~100 범위', async () => {
    const { analysis } = await analyzeThumbnailPsychology(sampleCandidate);
    expect(analysis.click_reason_clarity_score).toBeGreaterThanOrEqual(0);
    expect(analysis.click_reason_clarity_score).toBeLessThanOrEqual(100);
    expect(analysis.title_text_image_alignment_score).toBeGreaterThanOrEqual(0);
    expect(analysis.title_text_image_alignment_score).toBeLessThanOrEqual(100);
  });

  it('9개 슬롯 전부에 대해 심리분석 동작', async () => {
    const { candidates } = await buildThumbnailMatrix9(BASE_INPUT);
    for (const c of candidates) {
      const { analysis } = await analyzeThumbnailPsychology(c);
      expect(analysis.candidate_id).toBe(c.candidate_id);
      expect(() => ThumbnailPsychologyAnalysisSchema.parse(analysis)).not.toThrow();
    }
  });

  it('서로 다른 슬롯은 서로 다른 심리분석 결과', async () => {
    const { candidates } = await buildThumbnailMatrix9(BASE_INPUT);
    const analyses = await Promise.all(
      candidates.map((c) => analyzeThumbnailPsychology(c).then((r) => r.analysis)),
    );
    // 9개 슬롯의 combined_click_psychology가 모두 다름 (3×3 조합)
    const combinedSet = new Set(analyses.map((a) => a.combined_click_psychology));
    expect(combinedSet.size).toBe(9);
  });

  it('LLM 실패 시 폴백으로 전환', async () => {
    const failingLlm = async () => { throw new Error('LLM error'); };
    const { analysis, source } = await analyzeThumbnailPsychology(sampleCandidate, {
      llmComplete: failingLlm,
    });
    expect(source).toBe('fallback');
    expect(analysis.candidate_id).toBe(sampleCandidate.candidate_id);
  });

  it('문구전략별 text_structure 분류가 올바르다', async () => {
    const { candidates } = await buildThumbnailMatrix9(BASE_INPUT);
    for (const c of candidates) {
      const { analysis } = await analyzeThumbnailPsychology(c);
      if (c.text_strategy === 'gain') expect(analysis.text_structure).toBe('이득 제시');
      if (c.text_strategy === 'loss_avoidance') expect(analysis.text_structure).toBe('손해 회피');
      if (c.text_strategy === 'curiosity') expect(analysis.text_structure).toBe('비밀/은닉');
    }
  });
});
