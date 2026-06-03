// P3-3 — ACR execution transport (DEGRADED/fallback stub).
//
// Per docs/specs/P3-3-control-room-acr.md §3.2 this transport pulls per-task
// branch/phase/log execution data from the Agent Control Room. The actual ACR
// GET route (`GET /api/l5/execution`) does NOT exist yet (it must be added in the
// separate ACR repo — TODO, out of this lane's scope). Until then this transport
// is a graceful stub: it always returns [] so the control-room tree renders from
// agent_tasks alone (DEGRADED mode) with ACR fields null. It never throws.
//
// When the ACR route ships, set ACR_BASE_URL + L5_SHARED_SECRET and flip
// ACR_EXECUTION_ENABLED=1 to enable the live fetch path below.

export interface AcrExecTask {
  acr_task_id: string;
  assigned_agent: string | null;
  plan_status: string | null;
  phase_index: number | null;
  phase_total: number | null;
  branch: string | null;
  workspace_status: string | null;
  changed_files: number | null;
  log_tail: string | null;
  updated_at: string | null;
}

export interface AcrExecutionTransport {
  /** Returns [] on any failure / when ACR is unreachable or not yet deployed. */
  fetchExecution(acrProjectId: string): Promise<AcrExecTask[]>;
}

export function makeAcrExecutionTransport(): AcrExecutionTransport | null {
  // Disabled by default: the ACR GET route is not deployed yet (documented TODO).
  // Returning the stub (not null) keeps the call site uniform; it yields [].
  const enabled = process.env.ACR_EXECUTION_ENABLED === '1';
  const baseUrl = (process.env.ACR_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
  const secret = process.env.L5_SHARED_SECRET;

  return {
    async fetchExecution(acrProjectId: string): Promise<AcrExecTask[]> {
      if (!enabled || !secret) return [];
      try {
        const res = await fetch(
          `${baseUrl}/api/l5/execution?projectId=${encodeURIComponent(acrProjectId)}`,
          {
            headers: { 'x-l5-shared-secret': secret },
            signal: (AbortSignal as any).timeout?.(4000),
          },
        );
        if (!res.ok) return [];
        const json: any = await res.json();
        const tasks = Array.isArray(json?.tasks) ? json.tasks : [];
        return tasks.map((t: any) => ({
          acr_task_id: String(t.acr_task_id ?? ''),
          assigned_agent: t.assigned_agent ?? null,
          plan_status: t.plan_status ?? null,
          phase_index: typeof t.phase_index === 'number' ? t.phase_index : null,
          phase_total: typeof t.phase_total === 'number' ? t.phase_total : null,
          branch: t.branch ?? null,
          workspace_status: t.workspace_status ?? null,
          changed_files: typeof t.changed_files === 'number' ? t.changed_files : null,
          log_tail: t.log_tail ?? null,
          updated_at: t.updated_at ?? null,
        }));
      } catch {
        // ACR down / 401 / timeout / parse error → degraded mode.
        return [];
      }
    },
  };
}
