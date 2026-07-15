import { buildConceptGraph } from '../concept-graph';
import { CONCEPT_RELATION_TYPES } from '../types';
import type { SynthesizedPrinciple } from '../types';
import { makeAtom } from '../__fixtures__';

function principle(over: Partial<SynthesizedPrinciple> = {}): SynthesizedPrinciple {
  return {
    id: 'p1',
    statement: 's',
    kind: 'common',
    mentionVideoCount: 1,
    independentChannelCount: 1,
    representativeSources: [],
    evidenceQuality: 'weak',
    counterClaims: [],
    applicabilityConditions: [],
    verificationStatus: 'ANECDOTAL',
    atomIds: [],
    ...over,
  };
}

describe('CONCEPT_RELATION_TYPES', () => {
  it('has all 8 relation types', () => {
    expect(CONCEPT_RELATION_TYPES).toHaveLength(8);
    expect(CONCEPT_RELATION_TYPES).toContain('DERIVED_FROM');
  });
});

describe('buildConceptGraph', () => {
  it('emits SUPPORTS from a common principle atom', () => {
    const atoms = [makeAtom({ claimId: 'a1', claimType: 'causal_claim' })];
    const edges = buildConceptGraph([principle({ atomIds: ['a1'] })], atoms);
    expect(edges).toContainEqual({ from: 'a1', to: 'p1', type: 'SUPPORTS', confidence: atoms[0].confidence });
  });

  it('emits CONTRADICTS for conflict principles', () => {
    const atoms = [makeAtom({ claimId: 'a1', claimType: 'causal_claim' })];
    const edges = buildConceptGraph([principle({ kind: 'conflict', atomIds: ['a1'] })], atoms);
    expect(edges[0].type).toBe('CONTRADICTS');
  });

  it('emits EXAMPLE_OF for case_study / instruction atoms', () => {
    const atoms = [makeAtom({ claimId: 'a1', claimType: 'case_study' })];
    const edges = buildConceptGraph([principle({ atomIds: ['a1'] })], atoms);
    expect(edges[0].type).toBe('EXAMPLE_OF');
  });

  it('links two common principles sharing a representative videoId as SIMILAR_TO', () => {
    const p1 = principle({ id: 'p1', representativeSources: [{ videoId: 'v1', startSeconds: 0, sourceUrl: 'u', market: 'KR' }] });
    const p2 = principle({ id: 'p2', representativeSources: [{ videoId: 'v1', startSeconds: 3, sourceUrl: 'u2', market: 'KR' }] });
    const edges = buildConceptGraph([p1, p2], []);
    expect(edges).toContainEqual({ from: 'p1', to: 'p2', type: 'SIMILAR_TO', confidence: 0.5 });
  });
});
