// research-engine — concept graph (§2 concept-graph).
//
// Deterministic edges between atoms and principles over the 8 relation types
// (SUPPORTS | CONTRADICTS | EXPLAINS | EXAMPLE_OF | REQUIRES | PRECEDES |
// SIMILAR_TO | DERIVED_FROM). No LLM — the graph is derived from the structure
// produced by synthesis, so it is fully unit-testable.

import {
  ConceptEdge,
  KnowledgeAtom,
  SynthesizedPrinciple,
} from './types';

/**
 * Build the concept graph from synthesized principles and their atoms:
 *  - each supporting atom → principle: SUPPORTS (or CONTRADICTS for conflicts).
 *  - case_study / instruction atoms → principle: EXAMPLE_OF.
 *  - principle → principle: SIMILAR_TO when they share ≥ 1 atom's videoId and
 *    are both 'common'.
 * confidence is carried from the atom (or a fixed prior for principle edges).
 */
export function buildConceptGraph(
  principles: SynthesizedPrinciple[],
  atoms: KnowledgeAtom[],
): ConceptEdge[] {
  const byId = new Map(atoms.map((a) => [a.claimId, a]));
  const edges: ConceptEdge[] = [];

  for (const p of principles) {
    const isConflict = p.kind === 'conflict' || p.kind === 'kr_us_diff';
    for (const atomId of p.atomIds) {
      const atom = byId.get(atomId);
      if (!atom) continue;
      const exemplar = atom.claimType === 'case_study' || atom.claimType === 'instruction';
      edges.push({
        from: atom.claimId,
        to: p.id,
        type: exemplar ? 'EXAMPLE_OF' : isConflict ? 'CONTRADICTS' : 'SUPPORTS',
        confidence: atom.confidence,
      });
    }
  }

  // Principle ↔ principle similarity by shared representative videoIds.
  for (let i = 0; i < principles.length; i++) {
    for (let j = i + 1; j < principles.length; j++) {
      const a = principles[i];
      const b = principles[j];
      if (a.kind !== 'common' || b.kind !== 'common') continue;
      const videosA = new Set(a.representativeSources.map((s) => s.videoId));
      const shared = b.representativeSources.some((s) => videosA.has(s.videoId));
      if (shared) {
        edges.push({ from: a.id, to: b.id, type: 'SIMILAR_TO', confidence: 0.5 });
      }
    }
  }

  return edges;
}
