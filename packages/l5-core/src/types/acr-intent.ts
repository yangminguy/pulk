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
}

export interface ACRIntent {
  l5_task_id: string;
  task_title: string;
  phases: CTOPhase[];
  created_at: string;
}
