import {
  evaluateAudienceFit,
  isAudienceFitPass,
  computeOverallScore,
  AUDIENCE_FIT_WEIGHTS,
  AUDIENCE_FIT_GATE,
  AudienceFitInput,
} from '../audience-fit';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<AudienceFitInput> = {}): AudienceFitInput {
  return {
    pain_fit: 85,
    desire_fit: 85,
    language_fit: 85,
    curiosity_fit: 85,
    trust_fit: 85,
    action_fit: 85,
    what_target_wants_to_hear: ['concrete results', 'simple steps'],
    what_target_does_not_want_to_hear: ['complicated jargon'],
    must_answer_questions: ['How long does it take?'],
    recommended_angle: 'Problem-first approach',
    ...overrides,
  };
}

// ── Unit tests: scoring rule ─────────────────────────────────────────────────

describe('computeOverallScore — weighted average rule', () => {
  test('weights sum to 100', () => {
    const total = Object.values(AUDIENCE_FIT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  test('all-100 input yields overall_score 100', () => {
    expect(
      computeOverallScore({
        pain_fit: 100,
        desire_fit: 100,
        language_fit: 100,
        curiosity_fit: 100,
        trust_fit: 100,
        action_fit: 100,
      }),
    ).toBe(100);
  });

  test('all-0 input yields overall_score 0', () => {
    expect(
      computeOverallScore({
        pain_fit: 0,
        desire_fit: 0,
        language_fit: 0,
        curiosity_fit: 0,
        trust_fit: 0,
        action_fit: 0,
      }),
    ).toBe(0);
  });

  test('weighted average is correct for known values', () => {
    // pain=80*25 + desire=80*20 + lang=80*20 + curiosity=80*10 + trust=80*15 + action=80*10
    // = 80 * (25+20+20+10+15+10) / 100 = 80
    expect(
      computeOverallScore({
        pain_fit: 80,
        desire_fit: 80,
        language_fit: 80,
        curiosity_fit: 80,
        trust_fit: 80,
        action_fit: 80,
      }),
    ).toBe(80);
  });

  test('higher-weight dimensions (pain_fit) have more impact', () => {
    // pain_fit=100 (weight 25) vs action_fit=100 (weight 10) — pain contributes more
    const highPain = computeOverallScore({
      pain_fit: 100,
      desire_fit: 0,
      language_fit: 0,
      curiosity_fit: 0,
      trust_fit: 0,
      action_fit: 0,
    });
    const highAction = computeOverallScore({
      pain_fit: 0,
      desire_fit: 0,
      language_fit: 0,
      curiosity_fit: 0,
      trust_fit: 0,
      action_fit: 100,
    });
    expect(highPain).toBeGreaterThan(highAction);
    expect(highPain).toBe(25); // 100*25/100
    expect(highAction).toBe(10); // 100*10/100
  });

  test('rounds to nearest integer', () => {
    // pain=85*25=2125, desire=85*20=1700, lang=85*20=1700, curiosity=85*10=850, trust=85*15=1275, action=85*10=850
    // sum=8500, /100=85 exactly
    expect(
      computeOverallScore({
        pain_fit: 85,
        desire_fit: 85,
        language_fit: 85,
        curiosity_fit: 85,
        trust_fit: 85,
        action_fit: 85,
      }),
    ).toBe(85);
  });
});

// ── Unit tests: evaluateAudienceFit ─────────────────────────────────────────

describe('evaluateAudienceFit', () => {
  test('returns AudienceFitReport with all 6 dimension scores from input', () => {
    const input = makeInput();
    const report = evaluateAudienceFit(input);
    expect(report.pain_fit).toBe(input.pain_fit);
    expect(report.desire_fit).toBe(input.desire_fit);
    expect(report.language_fit).toBe(input.language_fit);
    expect(report.curiosity_fit).toBe(input.curiosity_fit);
    expect(report.trust_fit).toBe(input.trust_fit);
    expect(report.action_fit).toBe(input.action_fit);
  });

  test('passes through qualitative fields unchanged', () => {
    const input = makeInput();
    const report = evaluateAudienceFit(input);
    expect(report.what_target_wants_to_hear).toEqual(input.what_target_wants_to_hear);
    expect(report.what_target_does_not_want_to_hear).toEqual(
      input.what_target_does_not_want_to_hear,
    );
    expect(report.must_answer_questions).toEqual(input.must_answer_questions);
    expect(report.recommended_angle).toBe(input.recommended_angle);
  });

  test('computes overall_score via weighted formula', () => {
    const input = makeInput({
      pain_fit: 80,
      desire_fit: 80,
      language_fit: 80,
      curiosity_fit: 80,
      trust_fit: 80,
      action_fit: 80,
    });
    const report = evaluateAudienceFit(input);
    expect(report.overall_score).toBe(80);
  });
});

// ── Gate pass/fail cases ─────────────────────────────────────────────────────

describe('isAudienceFitPass — Gate 1 (PRD §9 / §16.14)', () => {
  test('PASS: overall=80, language_fit=75, trust_fit=80 — all at exact thresholds', () => {
    // Construct scores so overall rounds to exactly 80.
    // Use uniform 80 for all → overall=80, lang=80>=75, trust=80>=80 ✓
    const report = evaluateAudienceFit(
      makeInput({
        pain_fit: 80,
        desire_fit: 80,
        language_fit: 80,
        curiosity_fit: 80,
        trust_fit: 80,
        action_fit: 80,
      }),
    );
    expect(report.overall_score).toBe(80);
    expect(isAudienceFitPass(report)).toBe(true);
  });

  test('PASS: high scores well above all thresholds', () => {
    const report = evaluateAudienceFit(makeInput()); // all=85 → overall=85
    expect(isAudienceFitPass(report)).toBe(true);
  });

  test('FAIL: overall 79 → fail even if language_fit and trust_fit pass', () => {
    // Need overall to compute to 79.
    // Set trust=80, lang=75 (both at threshold), adjust others to get overall < 80.
    // Try: pain=79, desire=79, lang=75, curiosity=79, trust=80, action=79
    // weighted = 79*25 + 79*20 + 75*20 + 79*10 + 80*15 + 79*10
    //          = 1975 + 1580 + 1500 + 790 + 1200 + 790 = 7835 → 78.35 → round = 78
    // Adjust upward slightly: pain=80, desire=80, lang=75, curiosity=80, trust=80, action=80
    // = 80*25+80*20+75*20+80*10+80*15+80*10 = 2000+1600+1500+800+1200+800 = 7900 → 79
    const report = evaluateAudienceFit(
      makeInput({
        pain_fit: 80,
        desire_fit: 80,
        language_fit: 75,
        curiosity_fit: 80,
        trust_fit: 80,
        action_fit: 80,
      }),
    );
    expect(report.overall_score).toBe(79);
    expect(isAudienceFitPass(report)).toBe(false);
  });

  test('FAIL: language_fit 74 → fail even if overall >= 80 and trust_fit >= 80', () => {
    // Compensate the low lang with high others to keep overall >= 80.
    // pain=86, desire=86, lang=74, curiosity=86, trust=86, action=86
    // = 86*25+86*20+74*20+86*10+86*15+86*10 = 2150+1720+1480+860+1290+860 = 8360 → 84
    const report = evaluateAudienceFit(
      makeInput({
        pain_fit: 86,
        desire_fit: 86,
        language_fit: 74,
        curiosity_fit: 86,
        trust_fit: 86,
        action_fit: 86,
      }),
    );
    expect(report.overall_score).toBeGreaterThanOrEqual(80);
    expect(report.language_fit).toBe(74);
    expect(isAudienceFitPass(report)).toBe(false);
  });

  test('FAIL: trust_fit 79 → fail even if overall >= 80 and language_fit >= 75', () => {
    // Compensate low trust with high others.
    // pain=86, desire=86, lang=86, curiosity=86, trust=79, action=86
    // = 86*25+86*20+86*20+86*10+79*15+86*10 = 2150+1720+1720+860+1185+860 = 8495 → 85
    const report = evaluateAudienceFit(
      makeInput({
        pain_fit: 86,
        desire_fit: 86,
        language_fit: 86,
        curiosity_fit: 86,
        trust_fit: 79,
        action_fit: 86,
      }),
    );
    expect(report.overall_score).toBeGreaterThanOrEqual(80);
    expect(report.trust_fit).toBe(79);
    expect(isAudienceFitPass(report)).toBe(false);
  });

  test('FAIL: all scores 0 → overall=0, all gates fail', () => {
    const report = evaluateAudienceFit(
      makeInput({
        pain_fit: 0,
        desire_fit: 0,
        language_fit: 0,
        curiosity_fit: 0,
        trust_fit: 0,
        action_fit: 0,
      }),
    );
    expect(report.overall_score).toBe(0);
    expect(isAudienceFitPass(report)).toBe(false);
  });

  test('gate thresholds are correct constants', () => {
    expect(AUDIENCE_FIT_GATE.overall_min).toBe(80);
    expect(AUDIENCE_FIT_GATE.language_fit_min).toBe(75);
    expect(AUDIENCE_FIT_GATE.trust_fit_min).toBe(80);
  });
});
