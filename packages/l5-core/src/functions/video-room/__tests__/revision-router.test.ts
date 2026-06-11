import { routeRevision } from '../revision-router';
import { RevisionTarget } from '../types';
import type { ScriptQaReport } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<ScriptQaReport> = {}): ScriptQaReport {
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
    logic_block_alignment: [],
    missing_parts: [],
    revision_requests: [],
    overall_pass: true,
    ...overrides,
  };
}

// ── Empty revision_requests ──────────────────────────────────────────────────

describe('routeRevision — empty revision_requests', () => {
  test('returns empty array when revision_requests is empty', () => {
    const report = makeReport({ revision_requests: [] });
    expect(routeRevision(report)).toEqual([]);
  });

  test('returns empty array for unrecognised revision_request text', () => {
    const report = makeReport({ revision_requests: ['completely unknown issue'] });
    expect(routeRevision(report)).toEqual([]);
  });
});

// ── Individual keyword → target mapping ─────────────────────────────────────

describe('routeRevision — individual keyword routing', () => {
  test('시장맥락부족 → market_research_agent', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['시장맥락부족'] }));
    expect(targets).toContain(RevisionTarget.MarketResearchAgent);
    expect(targets).toHaveLength(1);
  });

  test('타깃언어부족 → voc_research_agent', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['타깃언어부족'] }));
    expect(targets).toContain(RevisionTarget.VocResearchAgent);
    expect(targets).toHaveLength(1);
  });

  test('근거부족 → claim_verification_agent', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['근거부족'] }));
    expect(targets).toContain(RevisionTarget.ClaimVerificationAgent);
    expect(targets).toHaveLength(1);
  });

  test('듣고싶은말아님 → audience_fit_validator', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['듣고싶은말아님'] }));
    expect(targets).toContain(RevisionTarget.AudienceFitValidator);
    expect(targets).toHaveLength(1);
  });

  test('재료부족 → script_material_pack_builder', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['재료부족'] }));
    expect(targets).toContain(RevisionTarget.ScriptMaterialPackBuilder);
    expect(targets).toHaveLength(1);
  });

  test('세트논리 → cmo_strategy_agent', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['세트논리 불일치'] }));
    expect(targets).toContain(RevisionTarget.CmoStrategyAgent);
    expect(targets).toHaveLength(1);
  });

  test('도입부약함 → intro_writer', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['도입부약함'] }));
    expect(targets).toContain(RevisionTarget.IntroWriter);
    expect(targets).toHaveLength(1);
  });

  test('파트약함 → logic_block_writer_a, logic_block_writer_b, logic_block_writer_c', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['파트약함'] }));
    expect(targets).toContain(RevisionTarget.LogicBlockWriterA);
    expect(targets).toContain(RevisionTarget.LogicBlockWriterB);
    expect(targets).toContain(RevisionTarget.LogicBlockWriterC);
    expect(targets).toHaveLength(3);
  });

  test('연결어색 → script_integrator', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['연결어색'] }));
    expect(targets).toContain(RevisionTarget.ScriptIntegrator);
    expect(targets).toHaveLength(1);
  });

  test('말투안맞음 → founder_voice_agent', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['말투안맞음'] }));
    expect(targets).toContain(RevisionTarget.FounderVoiceAgent);
    expect(targets).toHaveLength(1);
  });

  test('전략불일치 → cmo_script_qa_agent', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['전략불일치'] }));
    expect(targets).toContain(RevisionTarget.CmoScriptQaAgent);
    expect(targets).toHaveLength(1);
  });
});

// ── Multiple revision_requests ───────────────────────────────────────────────

describe('routeRevision — multiple revision_requests', () => {
  test('two distinct requests produce union of targets (no duplicates)', () => {
    const targets = routeRevision(
      makeReport({ revision_requests: ['시장맥락부족', '말투안맞음'] }),
    );
    expect(targets).toContain(RevisionTarget.MarketResearchAgent);
    expect(targets).toContain(RevisionTarget.FounderVoiceAgent);
    expect(targets).toHaveLength(2);
  });

  test('duplicate revision_request strings do not produce duplicate targets', () => {
    const targets = routeRevision(
      makeReport({ revision_requests: ['근거부족', '근거부족'] }),
    );
    expect(targets).toContain(RevisionTarget.ClaimVerificationAgent);
    expect(targets).toHaveLength(1);
  });

  test('파트약함 + 연결어색 → 4 targets (3 logic_block_writers + script_integrator)', () => {
    const targets = routeRevision(
      makeReport({ revision_requests: ['파트약함', '연결어색'] }),
    );
    expect(targets).toContain(RevisionTarget.LogicBlockWriterA);
    expect(targets).toContain(RevisionTarget.LogicBlockWriterB);
    expect(targets).toContain(RevisionTarget.LogicBlockWriterC);
    expect(targets).toContain(RevisionTarget.ScriptIntegrator);
    expect(targets).toHaveLength(4);
  });

  test('all 11 distinct request types produce correct total target count', () => {
    const report = makeReport({
      revision_requests: [
        '시장맥락부족',   // 1 target
        '타깃언어부족',   // 1 target
        '근거부족',       // 1 target
        '듣고싶은말아님', // 1 target
        '재료부족',       // 1 target
        '세트논리',       // 1 target
        '도입부약함',     // 1 target
        '파트약함',       // 3 targets
        '연결어색',       // 1 target
        '말투안맞음',     // 1 target
        '전략불일치',     // 1 target
      ],
    });
    const targets = routeRevision(report);
    // 10 single targets + 3 logic_block_writers = 13 unique targets
    expect(targets).toHaveLength(13);
  });
});

// ── Spacing variants ─────────────────────────────────────────────────────────

describe('routeRevision — spaced keyword variants', () => {
  test('타깃 언어 부족 (spaced) → voc_research_agent', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['타깃 언어 부족'] }));
    expect(targets).toContain(RevisionTarget.VocResearchAgent);
  });

  test('시장 맥락 부족 (spaced) → market_research_agent', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['시장 맥락 부족'] }));
    expect(targets).toContain(RevisionTarget.MarketResearchAgent);
  });

  test('도입부 약함 (spaced) → intro_writer', () => {
    const targets = routeRevision(makeReport({ revision_requests: ['도입부 약함'] }));
    expect(targets).toContain(RevisionTarget.IntroWriter);
  });
});
