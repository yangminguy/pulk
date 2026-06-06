// P3-3 — buildControlRoomTree: pure Business ▸ Project ▸ dev-task tree builder.
//
// Pure l5-core: no NocoBase, no network, no IO. The plugin reads businesses /
// projects / CTO agent_tasks rows and (optionally) ACR execution records, then
// passes them in as plain data. This function groups the tasks into the tree and
// merges the ACR execution fields per task. When ACR data is absent, the exec
// fields are null and the UI renders a degraded view — the task is never dropped.
//
// Implemented per docs/specs/P3-3-control-room-acr.md §3.3. Keeping mapping logic
// here (not in the UI) satisfies CLAUDE.md rule 3 and "no domain logic in UI".

import { estimateTaskTokens } from '../token-estimate';

/** One ACR execution record, keyed by L5 task id (== acr_task_id). */
export interface AcrExecTask {
  acr_task_id: string;
  assigned_agent?: string | null;
  plan_status?: string | null;
  phase_index?: number | null;
  phase_total?: number | null;
  branch?: string | null;
  workspace_status?: string | null;
  changed_files?: number | null;
  log_tail?: string | null;
  updated_at?: string | null;
  // Phase 6 — measured token usage + cost from the CLI runtime (null until the
  // ACR runner captures it; estimate is shown meanwhile).
  total_tokens?: number | null;
  estimated_cost_usd?: number | null;
  /** CTO Harness 복잡도(C0~C5). ACR이 dispatch 때 받은 intent.complexity 를 그대로
   * echo. null이면 UI는 뱃지를 숨긴다(degraded view). */
  complexity?: string | null;
}

export interface ControlRoomBusinessInput {
  id: string;
  name: string;
}

export interface ControlRoomProjectInput {
  id: string;
  business_id: string;
  name: string;
  status: string;
}

export interface ControlRoomTaskInput {
  id: string;
  title: string;
  assigned_agent: string;
  status: string;
  risk_level: string | null;
  phase: string | null;
  blocker: string | null;
  business_id: string | null;
  project_id: string | null;
  approval_required: boolean;
  updated_at: string | null;
}

export interface BuildControlRoomArgs {
  businesses: ControlRoomBusinessInput[];
  projects: ControlRoomProjectInput[];
  ctoTasks: ControlRoomTaskInput[];
  /** keyed by l5 task id (== acr_task_id); empty when ACR is unavailable */
  acrByTaskId: Record<string, AcrExecTask>;
}

export interface ControlRoomDevTask {
  task_id: string;
  title: string;
  agent: string;
  /** The CLI actually running the CURRENT phase (claude-code/codex/antigravity),
   * from ACR. `agent` is always the L5 owner ("CTO"); this is who's hands-on now
   * so the Control Room can say "Claude가 작업 중". Null when ACR data absent. */
  acr_agent: string | null;
  l5_status: string;
  risk_level: string | null;
  phase: string | null;
  blocker: string | null;
  approval_required: boolean;
  updated_at: string | null;
  // merged ACR execution fields (null when ACR data absent → degraded view)
  branch: string | null;
  phase_label: string | null; // "x / N" or null
  exec_status: string | null; // workspace_status ?? plan_status
  changed_files: number | null;
  log_tail: string | null;
  /** CTO가 배정한 복잡도(C0~C5). ACR echo. null = 미표시. */
  complexity: string | null;
  /** Forecast token range for this task (추정, from classification). */
  est_tokens_low: number | null;
  est_tokens_high: number | null;
  /** Measured token usage + cost from the CLI runtime (via ACR). Null until the
   * task has actually run; the UI then shows actuals instead of the estimate. */
  actual_total_tokens: number | null;
  actual_cost_usd: number | null;
}

export interface ControlRoomProjectNode {
  project_id: string | null;
  project_name: string;
  project_status: string | null;
  dev_tasks: ControlRoomDevTask[];
}

export interface ControlRoomBusinessNode {
  business_id: string | null;
  business_name: string;
  projects: ControlRoomProjectNode[];
}

const NO_PROJECT_KEY = '__no_project__';
const COMMON_BUSINESS_KEY = '__common__';

/**
 * Build the Business ▸ Project ▸ dev-task tree. Tasks with null project_id are
 * grouped under a synthetic "(프로젝트 없음)" node inside their business; tasks
 * with null business_id go under a top-level "(공통)" business node.
 */
export function buildControlRoomTree(args: BuildControlRoomArgs): ControlRoomBusinessNode[] {
  const businessNameById = new Map<string, string>();
  for (const b of args.businesses) businessNameById.set(b.id, b.name);

  const projectById = new Map<string, ControlRoomProjectInput>();
  for (const p of args.projects) projectById.set(p.id, p);

  // bizKey -> (projKey -> dev tasks)
  const bizMap = new Map<string, Map<string, ControlRoomDevTask[]>>();
  // preserve first-seen ordering
  const bizOrder: string[] = [];
  const projOrderByBiz = new Map<string, string[]>();

  for (const t of args.ctoTasks) {
    const bizKey = t.business_id ?? COMMON_BUSINESS_KEY;
    const projKey = t.project_id ?? NO_PROJECT_KEY;

    if (!bizMap.has(bizKey)) {
      bizMap.set(bizKey, new Map());
      bizOrder.push(bizKey);
      projOrderByBiz.set(bizKey, []);
    }
    const projMap = bizMap.get(bizKey)!;
    if (!projMap.has(projKey)) {
      projMap.set(projKey, []);
      projOrderByBiz.get(bizKey)!.push(projKey);
    }

    projMap.get(projKey)!.push(mergeDevTask(t, args.acrByTaskId[t.id]));
  }

  return bizOrder.map((bizKey) => {
    const projMap = bizMap.get(bizKey)!;
    const projKeys = projOrderByBiz.get(bizKey)!;
    const business_id = bizKey === COMMON_BUSINESS_KEY ? null : bizKey;
    const business_name =
      bizKey === COMMON_BUSINESS_KEY ? '(공통)' : businessNameById.get(bizKey) ?? bizKey;

    const projects: ControlRoomProjectNode[] = projKeys.map((projKey) => {
      const dev_tasks = projMap.get(projKey)!;
      if (projKey === NO_PROJECT_KEY) {
        return {
          project_id: null,
          project_name: '(프로젝트 없음)',
          project_status: null,
          dev_tasks,
        };
      }
      const proj = projectById.get(projKey);
      return {
        project_id: projKey,
        project_name: proj?.name ?? projKey,
        project_status: proj?.status ?? null,
        dev_tasks,
      };
    });

    return { business_id, business_name, projects };
  });
}

function mergeDevTask(t: ControlRoomTaskInput, acr: AcrExecTask | undefined): ControlRoomDevTask {
  const est = estimateTaskTokens(t.title);
  const base: ControlRoomDevTask = {
    task_id: t.id,
    title: t.title,
    agent: t.assigned_agent,
    acr_agent: null,
    l5_status: t.status,
    risk_level: t.risk_level,
    phase: t.phase,
    blocker: t.blocker,
    approval_required: t.approval_required,
    updated_at: t.updated_at,
    branch: null,
    phase_label: null,
    exec_status: null,
    changed_files: null,
    log_tail: null,
    complexity: null,
    est_tokens_low: est.low,
    est_tokens_high: est.high,
    actual_total_tokens: null,
    actual_cost_usd: null,
  };
  if (!acr) return base;

  const phaseLabel =
    acr.phase_index != null && acr.phase_total != null
      ? `${acr.phase_index} / ${acr.phase_total}`
      : null;

  return {
    ...base,
    acr_agent: acr.assigned_agent ?? null,
    branch: acr.branch ?? null,
    phase_label: phaseLabel,
    exec_status: acr.workspace_status ?? acr.plan_status ?? null,
    changed_files: acr.changed_files ?? null,
    log_tail: acr.log_tail ?? null,
    complexity: acr.complexity ?? null,
    actual_total_tokens: typeof acr.total_tokens === 'number' ? acr.total_tokens : null,
    actual_cost_usd: typeof acr.estimated_cost_usd === 'number' ? acr.estimated_cost_usd : null,
  };
}
