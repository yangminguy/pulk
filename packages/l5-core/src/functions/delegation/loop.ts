// M6 — Delegation verification loop controller.
//
// Pure l5-core, fully deterministic: no LLM, no I/O. The plugin injects
// `runWork` (target executive produces the deliverable) and `verify` (requesting
// executive scores it against acceptance_criteria). The CEO does NOT run on each
// round — it only gates entry (delegation approval) and handles escalation.
// See EXECUTIVE_DELEGATION_SPEC.md §3.3.

export interface VerifyVerdict {
  pass: boolean;
  /** Concrete guidance fed back into the next runWork round when pass=false. */
  feedback: string;
}

export interface DelegationLoopDeps {
  /**
   * Run the target executive. `round` is 1-based; `feedback` is null on the first
   * round and the previous verdict's feedback on retries.
   */
  runWork: (round: number, feedback: string | null) => Promise<{ output: unknown }>;
  /** Requesting executive scores the work against acceptance_criteria. */
  verify: (workOutput: unknown) => Promise<VerifyVerdict>;
  /** Optional per-round instrumentation hook (e.g. L5_DELEGATION_DEBUG logging). */
  onRound?: (round: number, verdict: VerifyVerdict) => void;
}

export type DelegationLoopResult =
  | { status: 'resolved'; rounds: number; output: unknown }
  | { status: 'escalated'; rounds: number; output: unknown; reason: string };

/**
 * Drive the delegation verification loop up to `maxRounds`.
 *
 * - verdict.pass on any round  → resolved (origin task resumes with the output).
 * - budget exhausted           → escalated (CEO/founder decides next).
 *
 * Loop control and termination live here (deterministic); only runWork/verify
 * touch the LLM, so the CEO incurs no per-round cost.
 */
export async function runDelegationLoop(
  maxRounds: number,
  deps: DelegationLoopDeps,
): Promise<DelegationLoopResult> {
  const { runWork, verify, onRound } = deps;

  let feedback: string | null = null;
  let lastOutput: unknown = null;

  for (let round = 1; round <= maxRounds; round++) {
    const work = await runWork(round, feedback);
    lastOutput = work.output;

    const verdict = await verify(work.output);
    onRound?.(round, verdict);

    if (verdict.pass) {
      return { status: 'resolved', rounds: round, output: lastOutput };
    }
    feedback = verdict.feedback;
  }

  return {
    status: 'escalated',
    rounds: maxRounds,
    output: lastOutput,
    reason: `max_rounds(${maxRounds}) 소진 — 수용 기준 미충족`,
  };
}
