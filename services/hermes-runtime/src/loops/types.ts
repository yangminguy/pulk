// Shared Hermes loop types
// Hermes loops are scheduled/triggered jobs (Trigger.dev) that drive the L5 operating cadence.

export interface LoopContext {
  // Trigger.dev run metadata, time window, and L5 context references.
  // TODO: replace `unknown` with concrete payload schema once defined.
  payload?: unknown;
}

export interface LoopResult {
  loop: string;
  status: "ok" | "skipped" | "error";
  summary: string;
  // Follow-up actions raised by the loop (e.g. approvals to request, agents to run).
  actions: string[];
}
