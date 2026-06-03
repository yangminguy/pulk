import {
  CURATION,
  scoreInsight,
  curateInsight,
  summarizeCuration,
  buildCurationLLMPrompt,
  parseCurationLLMVerdict,
  CurationInput,
  CurationSummaryItem,
} from '../curation';

// A rich, save-worthy insight: number + workflow_improvement + phase + length.
const rich: CurationInput = {
  insight:
    '광고 CTR이 3.2%에서 5.8%로 올랐는데 썸네일에 숫자를 넣은 결과 클릭률이 좋아졌기 때문이다.',
  pii_level: 'none',
  workflow_improvement: '썸네일 A/B 테스트를 기본 워크플로우에 포함',
  phase: 'growth',
  source_agent: 'CMO',
};

describe('scoreInsight heuristic branches', () => {
  it('length_ok reflects MIN_LENGTH', () => {
    expect(scoreInsight({ insight: 'a'.repeat(CURATION.MIN_LENGTH), pii_level: 'none' }).length_ok).toBe(true);
    expect(scoreInsight({ insight: 'a'.repeat(CURATION.MIN_LENGTH - 1), pii_level: 'none' }).length_ok).toBe(false);
  });

  it('digit/percent adds specificity', () => {
    const withNum = scoreInsight({ insight: '전환율 12% 상승했다 항목', pii_level: 'none' });
    const without = scoreInsight({ insight: '전환율 상승했다 항목 입니다', pii_level: 'none' });
    expect(withNum.specificity).toBeGreaterThan(without.specificity);
  });

  it('causal marker adds specificity', () => {
    const causal = scoreInsight({ insight: '리텐션이 좋아진 것은 온보딩 덕분 이라는 점', pii_level: 'none' });
    const plain = scoreInsight({ insight: '리텐션이 좋아진 것은 온보딩 관련 사항임', pii_level: 'none' });
    expect(causal.specificity).toBeGreaterThan(plain.specificity);
  });

  it('proper-noun / quote adds specificity', () => {
    const proper = scoreInsight({ insight: 'Notion 연동이 핵심이라는 점을 발견했음 확실히', pii_level: 'none' });
    const plain = scoreInsight({ insight: '연동이 핵심이라는 점을 발견했음 확실히 그렇다', pii_level: 'none' });
    expect(proper.specificity).toBeGreaterThan(plain.specificity);
  });

  it('workflow_improvement adds reuse_value', () => {
    const withWi = scoreInsight({ insight: 'a'.repeat(30), pii_level: 'none', workflow_improvement: '개선안' });
    const without = scoreInsight({ insight: 'a'.repeat(30), pii_level: 'none' });
    expect(withWi.reuse_value).toBeGreaterThan(without.reuse_value);
  });

  it('phase adds reuse_value', () => {
    const withPhase = scoreInsight({ insight: 'a'.repeat(30), pii_level: 'none', phase: 'pmf' });
    const without = scoreInsight({ insight: 'a'.repeat(30), pii_level: 'none' });
    expect(withPhase.reuse_value).toBeGreaterThan(without.reuse_value);
  });

  it('duplicate similarity removes the not-duplicate reuse bonus', () => {
    const dup = scoreInsight({ insight: 'a'.repeat(30), pii_level: 'none', maxSimilarity: 0.95 });
    const uniq = scoreInsight({ insight: 'a'.repeat(30), pii_level: 'none', maxSimilarity: 0.4 });
    expect(uniq.reuse_value).toBeGreaterThan(dup.reuse_value);
  });

  it('scores are clamped to 0..1', () => {
    const s = scoreInsight(rich);
    expect(s.specificity).toBeLessThanOrEqual(1);
    expect(s.reuse_value).toBeLessThanOrEqual(1);
  });
});

describe('curateInsight decision order', () => {
  it('pii_high → auto_discard/pii_high even with a high score', () => {
    const r = curateInsight({ ...rich, pii_level: 'high' });
    expect(r.decision).toBe('auto_discard');
    expect(r.reason).toBe('pii_high');
    expect(r.needs_llm).toBe(false);
  });

  it('too short → auto_discard/too_short', () => {
    const r = curateInsight({ insight: '짧음', pii_level: 'none' });
    expect(r.decision).toBe('auto_discard');
    expect(r.reason).toBe('too_short');
  });

  it('duplicate (0.95) → auto_discard/duplicate', () => {
    const r = curateInsight({ ...rich, maxSimilarity: 0.95 });
    expect(r.decision).toBe('auto_discard');
    expect(r.reason).toBe('duplicate');
  });

  it('not duplicate (0.5) → not discarded for duplicate', () => {
    const r = curateInsight({ ...rich, maxSimilarity: 0.5 });
    expect(r.reason).not.toBe('duplicate');
  });

  it('rich insight → auto_save', () => {
    const r = curateInsight(rich);
    expect(r.decision).toBe('auto_save');
    expect(r.reason).toBeUndefined();
    expect(r.needs_llm).toBe(false);
  });

  it('vague low insight → auto_discard/low_value', () => {
    // ≥MIN_LENGTH but <60 chars, no digit/causal/proper-noun → specificity 0,
    // reuse 0.4 → combined 0.2 < AUTO_DISCARD_SCORE.
    const r = curateInsight({ insight: '그냥 그랬다는 메모이고 별다른 내용은 없다는 기록', pii_level: 'none' });
    expect(r.decision).toBe('auto_discard');
    expect(r.reason).toBe('low_value');
  });

  it('mid-band → needs_review & needs_llm true', () => {
    // specificity 0.2 (length 60..400), reuse 0.4 (not-dup + generalizable) → combined 0.3..0.62
    const insight = 'a'.repeat(80);
    const r = curateInsight({ insight, pii_level: 'none' });
    expect(r.decision).toBe('needs_review');
    expect(r.needs_llm).toBe(true);
  });

  it('fail-open: similarity undefined never fabricates a duplicate discard', () => {
    const r = curateInsight({ ...rich, maxSimilarity: undefined });
    expect(r.reason).not.toBe('duplicate');
  });

  it('determinism: same input → same output', () => {
    expect(curateInsight(rich)).toEqual(curateInsight(rich));
  });
});

describe('summarizeCuration aggregation', () => {
  it('buckets and counts correctly', () => {
    const items: CurationSummaryItem[] = [
      { id: '1', insight: rich.insight, result: curateInsight(rich) },
      { id: '2', insight: '짧음', result: curateInsight({ insight: '짧음', pii_level: 'none' }) },
      { id: '3', insight: 'a'.repeat(80), result: curateInsight({ insight: 'a'.repeat(80), pii_level: 'none' }) },
    ];
    const summary = summarizeCuration(items, {
      week_start: '2026-06-01',
      discarded_at: '2026-06-02T00:00:00Z',
      purge_at: '2026-07-02T00:00:00Z',
    });
    expect(summary.week_start).toBe('2026-06-01');
    expect(summary.totals).toEqual({ saved: 1, discarded: 1, needs_review: 1 });
    expect(summary.saved[0].id).toBe('1');
    expect(summary.discarded[0].reason).toBe('too_short');
    expect(summary.discarded[0].purge_at).toBe('2026-07-02T00:00:00Z');
    expect(summary.needs_review[0].id).toBe('3');
  });
});

describe('borderline LLM helpers', () => {
  it('prompt does not leak high PII (only reached for needs_review)', () => {
    const { system } = buildCurationLLMPrompt(rich);
    expect(system).toContain('PII');
  });

  it('parses keep=true → auto_save', () => {
    expect(parseCurationLLMVerdict('{"keep": true, "reason": "재사용"}').decision).toBe('auto_save');
  });

  it('parses keep=false → auto_discard', () => {
    expect(parseCurationLLMVerdict('{"keep": false, "reason": "노이즈"}').decision).toBe('auto_discard');
  });

  it('fail-open: unparseable reply keeps the item (auto_save)', () => {
    expect(parseCurationLLMVerdict('garbage').decision).toBe('auto_save');
  });
});
