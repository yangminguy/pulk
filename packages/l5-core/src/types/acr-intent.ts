export type RuntimeType = 'claude' | 'codex' | 'antigravity' | 'omc';

export type ReleaseGateType = 'none' | 'auto_24h' | 'manual_founder';

export interface CTOPhase {
  name: string;
  runtime: RuntimeType;
  prompt_packet: string;
  expected_output: string;
  risk_level: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
  release_gate_type: ReleaseGateType;
  l5_approval_required: boolean;
  auto_execute: boolean;
  /** When true, ACR must not downgrade this phase to a smaller model on quota
   * exhaustion — it waits for the designated (T1) agent to recover instead.
   * Set by the CTO from the model tier (T1 = locked). */
  model_locked?: boolean;
}

export interface ACRIntent {
  l5_task_id: string;
  task_title: string;
  phases: CTOPhase[];
  created_at: string;
  /** Absolute path to the project working directory on the host running ACR.
   * If omitted, ACR resolves cwd from registered project. */
  project_path?: string;
  /** True when this task already cleared L5's approval gate before dispatch.
   * The Hermes dispatcher only forwards tasks with approval_required=false, so
   * any intent reaching ACR has passed L5 (either auto for D1-D2/D3 or an
   * explicit Founder approval for D4-D5). ACR treats this as the single source
   * of truth for the `manual_founder` release gate, instead of asking again in
   * its own Release Gate panel. (auto_24h is a separate time policy and is NOT
   * bypassed by this flag.) */
  l5_approved?: boolean;
}
