// research-engine — pure domain layer for the general YouTube research engine.
// See docs/RESEARCH_ENGINE_SPEC.md. All I/O is via ports.ts; no fs / child_process
// / fetch / NocoBase here. WO-B (services/research-engine) wires concrete adapters.

export * from './types';
export * from './ports';
export * from './market-classifier';
export * from './query-expansion';
export * from './candidate-selection';
export * from './atom-extraction';
export * from './synthesis';
export * from './verification';
export * from './concept-graph';
export * from './report';
export * from './book-composer';
export * from './pipeline';
