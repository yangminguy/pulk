import { evaluateScriptQa, SCRIPT_QA_THRESHOLDS, ScriptQaInput } from '../script-qa';
import type { ScriptQaReport } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ScriptQaInput> = {}): ScriptQaInput {
  return {
    strategy_fit_score: 85,
    audience_fit_score: 85,
    voice_fit_score: 80,
    sales_logic_score: 85,
    fact_safety_score: 92,
    desire_stage_coverage: {
      phenomenon: true,
      desire: true,
      plan: true,
      action: true,
      reward: true,
    },
    logic_block_alignment: ['block_1 — OK', 'block_2 — OK'],
    missing_parts: [],
    revision_requests: [],
    ...overrides,
  };
}

// ── Threshold constants ──────────────────────────────────────────────────────

describe('SCRIPT_QA_THRESHOLDS constants', () => {
  test('strategy_fit threshold is 80', () => {
    expect(SCRIPT_QA_THRESHOLDS.strategy_fit).toBe(80);
  });

  test('audience_fit threshold is 80', () => {
    expect(SCRIPT_QA_THRESHOLDS.audience_fit).toBe(80);
  });

  test('voice_fit threshold is 75', () => {
    expect(SCRIPT_QA_THRESHOLDS.voice_fit).toBe(75);
  });

  test('sales_logic threshold is 80', () => {
    expect(SCRIPT_QA_THRESHOLDS.sales_logic).toBe(80);
  });

  test('fact_safety threshold is 90', () => {
    expect(SCRIPT_QA_THRESHOLDS.fact_safety).toBe(90);
  });
});

// ── evaluateScriptQa — pass-through of input fields ─────────────────────────

describe('evaluateScriptQa — field pass-through', () => {
  test('numeric scores are returned unchanged', () => {
    const input = makeInput();
    const report = evaluateScriptQa(input);
    expect(report.strategy_fit_score).toBe(input.strategy_fit_score);
    expect(report.audience_fit_score).toBe(input.audience_fit_score);
    expect(report.voice_fit_score).toBe(input.voice_fit_score);
    expect(report.sales_logic_score).toBe(input.sales_logic_score);
    expect(report.fact_safety_score).toBe(input.fact_safety_score);
  });

  test('desire_stage_coverage is returned unchanged', () => {
    const input = makeInput({
      desire_stage_coverage: {
        phenomenon: true,
        desire: true,
        plan: false,
        action: false,
        reward: true,
      },
    });
    const report = evaluateScriptQa(input);
    expect(report.desire_stage_coverage).toEqual(input.desire_stage_coverage);
  });

  test('logic_block_alignment is returned unchanged', () => {
    const input = makeInput({ logic_block_alignment: ['block_1 — align', 'block_2 — drift'] });
    const report = evaluateScriptQa(input);
    expect(report.logic_block_alignment).toEqual(input.logic_block_alignment);
  });

  test('missing_parts is returned unchanged', () => {
    const input = makeInput({ missing_parts: ['CTA missing', 'intro weak'] });
    const report = evaluateScriptQa(input);
    expect(report.missing_parts).toEqual(input.missing_parts);
  });

  test('revision_requests is returned unchanged', () => {
    const input = makeInput({ revision_requests: ['말투안맞음', '전략불일치'] });
    const report = evaluateScriptQa(input);
    expect(report.revision_requests).toEqual(input.revision_requests);
  });
});

// ── evaluateScriptQa — overall_pass logic ────────────────────────────────────

describe('evaluateScriptQa — overall_pass', () => {
  test('PASS: all scores at or above thresholds → overall_pass true', () => {
    const report = evaluateScriptQa(
      makeInput({
        strategy_fit_score: 80,
        audience_fit_score: 80,
        voice_fit_score: 75,
        sales_logic_score: 80,
        fact_safety_score: 90,
      }),
    );
    expect(report.overall_pass).toBe(true);
  });

  test('PASS: all scores well above thresholds', () => {
    const report = evaluateScriptQa(makeInput());
    expect(report.overall_pass).toBe(true);
  });

  test('FAIL: strategy_fit_score 79 → overall_pass false', () => {
    const report = evaluateScriptQa(makeInput({ strategy_fit_score: 79 }));
    expect(report.overall_pass).toBe(false);
  });

  test('FAIL: audience_fit_score 79 → overall_pass false', () => {
    const report = evaluateScriptQa(makeInput({ audience_fit_score: 79 }));
    expect(report.overall_pass).toBe(false);
  });

  test('FAIL: voice_fit_score 74 → overall_pass false', () => {
    const report = evaluateScriptQa(makeInput({ voice_fit_score: 74 }));
    expect(report.overall_pass).toBe(false);
  });

  test('FAIL: sales_logic_score 79 → overall_pass false', () => {
    const report = evaluateScriptQa(makeInput({ sales_logic_score: 79 }));
    expect(report.overall_pass).toBe(false);
  });

  test('FAIL: fact_safety_score 89 → overall_pass false', () => {
    const report = evaluateScriptQa(makeInput({ fact_safety_score: 89 }));
    expect(report.overall_pass).toBe(false);
  });

  test('FAIL: all scores 0 → overall_pass false', () => {
    const report = evaluateScriptQa(
      makeInput({
        strategy_fit_score: 0,
        audience_fit_score: 0,
        voice_fit_score: 0,
        sales_logic_score: 0,
        fact_safety_score: 0,
      }),
    );
    expect(report.overall_pass).toBe(false);
  });

  test('FAIL: single failing score — fact_safety 89 fails even when rest pass', () => {
    // All other scores above threshold, only fact_safety below 90
    const report = evaluateScriptQa(
      makeInput({
        strategy_fit_score: 95,
        audience_fit_score: 95,
        voice_fit_score: 95,
        sales_logic_score: 95,
        fact_safety_score: 89,
      }),
    );
    expect(report.overall_pass).toBe(false);
    expect(report.fact_safety_score).toBe(89);
  });

  test('FAIL: voice_fit exactly at boundary -1 (74)', () => {
    const report = evaluateScriptQa(makeInput({ voice_fit_score: 74 }));
    expect(report.voice_fit_score).toBe(74);
    expect(report.overall_pass).toBe(false);
  });

  test('PASS: voice_fit exactly at boundary (75)', () => {
    const report = evaluateScriptQa(makeInput({ voice_fit_score: 75 }));
    expect(report.voice_fit_score).toBe(75);
    expect(report.overall_pass).toBe(true);
  });
});
