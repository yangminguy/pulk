import { decomposeIntoWorkstreams } from '../decomposer';
import type { CEOInterpretation } from '../types';

function makeInterp(over: Partial<CEOInterpretation> = {}): CEOInterpretation {
  return {
    id: 'interp_1',
    instruction_id: 'fi_1',
    goal: 'Launch marketing campaign',
    phase: 'execution_build',
    assumptions: [],
    success_criteria: [],
    risk_level: 'D2',
    approval_required: false,
    created_at: '2026-05-26T00:00:00Z',
    ...over,
  };
}

describe('decomposeIntoWorkstreams', () => {
  it('routes marketing/messaging text to CMO', () => {
    const ws = decomposeIntoWorkstreams(makeInterp({ goal: 'launch marketing campaign with new positioning' }));
    expect(ws.some(w => w.domain === 'CMO')).toBe(true);
  });

  it('routes sales/revenue text to CRO', () => {
    const ws = decomposeIntoWorkstreams(makeInterp({ goal: 'build sales pipeline and outreach proposal' }));
    expect(ws.some(w => w.domain === 'CRO')).toBe(true);
  });

  it('routes pmf/product text to CPO', () => {
    const ws = decomposeIntoWorkstreams(makeInterp({ goal: 'run pmf experiment with product interviews' }));
    expect(ws.some(w => w.domain === 'CPO')).toBe(true);
  });

  it('routes tech/automation text to CTO', () => {
    const ws = decomposeIntoWorkstreams(makeInterp({ goal: 'build internal automation tool', assumptions: ['engineering effort needed'] }));
    expect(ws.some(w => w.domain === 'CTO')).toBe(true);
  });

  it('routes finance/cost text to CFO', () => {
    const ws = decomposeIntoWorkstreams(makeInterp({ goal: 'set pricing and review subscription cost' }));
    expect(ws.some(w => w.domain === 'CFO')).toBe(true);
  });

  it('routes risk/compliance text to RiskQA', () => {
    const ws = decomposeIntoWorkstreams(makeInterp({ goal: 'review pii consent and compliance policy' }));
    expect(ws.some(w => w.domain === 'RiskQA')).toBe(true);
  });

  it('uses fallback (CPO) when no keywords match', () => {
    const ws = decomposeIntoWorkstreams(
      makeInterp({ goal: 'xyzzy', assumptions: [], success_criteria: [] })
    );
    expect(ws).toHaveLength(1);
    expect(ws[0].domain).toBe('CPO');
  });

  it('marks workstream as approval_required when risk is D4/D5 even if domain default is false', () => {
    const ws = decomposeIntoWorkstreams(
      makeInterp({ goal: 'product interview with customers', risk_level: 'D4' })
    );
    const cpoWs = ws.find(w => w.domain === 'CPO');
    expect(cpoWs?.approval_required).toBe(true);
  });

  it('marks workstream as approval_required when interpretation.approval_required is true', () => {
    const ws = decomposeIntoWorkstreams(
      makeInterp({ goal: 'product interview', risk_level: 'D1', approval_required: true })
    );
    expect(ws[0].approval_required).toBe(true);
  });

  it('propagates instruction_id and interpretation_id', () => {
    const ws = decomposeIntoWorkstreams(makeInterp({ goal: 'marketing copy review' }));
    expect(ws[0].instruction_id).toBe('fi_1');
    expect(ws[0].interpretation_id).toBe('interp_1');
  });
});
