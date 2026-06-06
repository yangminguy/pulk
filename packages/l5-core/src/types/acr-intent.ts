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

  // ── CTO Harness 판단 메타 (additive, optional) ──────────────────────────────
  // pulk CTO가 dispatch 전에 실어 보내는 복잡도/실행모드/경계 판단. ACR Kernel은
  // "무엇을 할지" 판단하지 않으므로(PRD §5.2), 이 값들을 그대로 받아 격리 범위와
  // 검증 강도를 정한다. 기존 ACR은 모르는 필드를 무시하므로 하위호환된다.
  /** 작업 복잡도 (C0~C5, cto-harness complexity-router 산출). */
  complexity?: 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
  /** Harness 실행 레일 (PRD §14.4). */
  harness_mode?: 'safe_solo' | 'implement_verify' | 'strict_sandbox' | 'parallel_patch_queue';
  /** 수정 허용 파일/디렉터리 glob (worktree boundary check 입력). 빈 배열 = 제한 없음. */
  allowed_files?: string[];
  /** 수정 금지 파일/디렉터리 glob (.env·lockfile·node_modules 등 하드 블록). */
  blocked_files?: string[];
  /** Founder 승인이 필요한 작업인지 (risk D3+). */
  requires_approval?: boolean;
}
