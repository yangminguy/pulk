import { randomUUID } from 'crypto';
import path from 'path';
import { defineCollection } from '@nocobase/database';
import { Plugin } from '@nocobase/server';
import { startHermesScheduler, stopHermesScheduler } from './hermes-scheduler';
import { makeAcrExecutionTransport } from './acr-execution-transport';

const {
  derivePhaseFromTasks,
  buildTransitionResult,
  buildPhaseTransitionSummary,
  BPR_PHASE_ORDER,
  BPR_PHASE_LABELS,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/bpr'));

// P2 — live agent status derivation (pure l5-core).
const { deriveLiveStatus } =
  require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/monitor'));

// P3-2 — knowledge auto-curation (pure l5-core).
const { curateInsight, summarizeCuration } =
  require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/memory'));

// P3-3 — control room tree builder (pure l5-core).
const { buildControlRoomTree } =
  require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/cto-control-room'));

// P3-4 — self-mod acceptance-criteria builder (pure l5-core).
const { buildSelfModAcceptanceCriteria, checkSelfModDiffForbidden, checkSelfModIntentForbidden } =
  require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/tool-request'));

// 호랑이(Tiger) 자가개선 — 레지스트리/타깃 repo 해석 (pure l5-core).
const { decodeTargetRef, getImprovementTarget, resolveRepoAbsPath } =
  require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/tiger'));

type MonitorContext = {
  app: any;
  db?: any;
  body?: unknown;
  method?: string;
  path?: string;
  status?: number;
  request?: {
    body?: Record<string, unknown>;
  };
  action?: {
    params?: {
      values?: Record<string, unknown>;
    };
  };
};

type TaskRecord = Record<string, any>;

// Read business_id from query string. Returns:
//   { kind: 'common' }       — show company-wide tasks (business_id IS NULL)
//   { kind: 'all' }           — no filter (legacy callers without business_id param)
//   { kind: 'biz', id: '..'} — show only that business's tasks
function readBusinessScope(ctx: MonitorContext): { kind: 'all' | 'common' | 'biz'; id?: string } {
  const rawQuery = (ctx as any).request?.query ?? (ctx as any).query ?? {};
  const raw = rawQuery['business_id'];
  if (raw === undefined || raw === null) return { kind: 'all' };
  const s = String(raw).trim();
  if (!s || s === 'common') return { kind: 'common' };
  return { kind: 'biz', id: s };
}

function withBusinessFilter(base: Record<string, any>, scope: ReturnType<typeof readBusinessScope>): Record<string, any> {
  if (scope.kind === 'all') return base;
  if (scope.kind === 'common') return { ...base, business_id: { $empty: true } };
  return { ...base, business_id: scope.id };
}

async function currentTasks(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const scope = readBusinessScope(ctx);
  const tasks = await db.getRepository('agent_tasks').find({
    filter: withBusinessFilter({ status: { $notIn: ['done', 'killed'] } }, scope),
    sort: ['-updated_at'],
  });

  ctx.body = {
    ok: true,
    data: await withInstructionSnippets(db, tasks, (task, instruction) => ({
      task_id: task.id,
      agent: task.assigned_agent,
      task_title: task.title,
      source_instruction: instruction ? instruction.raw_text.slice(0, 120) : null,
      rationale: task.rationale,
      status: task.status,
      expected_output: task.expected_output,
      decision: task.decision,
      reasoning: task.reasoning,
      next_action: task.next_action,
      next_output: task.next_output,
      next_owner: task.next_owner,
      stop_reason: task.stop_reason,
      approval_required: task.approval_required,
      risk_level: task.risk_level,
      phase: task.phase,
      source_ref: task.source_ref,
      blocker: task.blocker,
      updated_at: task.updated_at ?? task.updatedAt,
    })),
  };
}

// P2 — monitor:liveStatus. Instruction-grouped live agent status, DB-derived only.
// Joins agent_tasks + executive_consultations + executive_delegations and runs the
// pure deriveLiveStatus per task. v1 has no task_activity table (see spec §1/§5).
async function liveStatus(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const scope = readBusinessScope(ctx);
  const rawQuery = (ctx as any).request?.query ?? (ctx as any).query ?? {};
  const instructionId = rawQuery['instruction_id'] || null;

  const taskFilter: any = withBusinessFilter(
    { status: { $notIn: ['killed'] } }, // keep 'done' so groups still show ✓
    scope,
  );
  if (instructionId) taskFilter.instruction_id = instructionId;

  const tasks = await db.getRepository('agent_tasks').find({
    filter: taskFilter,
    sort: ['-updated_at'],
  });

  const taskIds = tasks.map((t: any) => t.id);

  let consults: any[] = [];
  let delegs: any[] = [];
  if (taskIds.length) {
    try {
      consults = await db.getRepository('executive_consultations').find({
        filter: { task_id: { $in: taskIds }, status: 'awaiting_founder' },
      });
    } catch { consults = []; }
    try {
      delegs = await db.getRepository('executive_delegations').find({
        filter: {
          status: { $in: ['open', 'in_progress'] },
          $or: [
            { origin_task_id: { $in: taskIds } },
            { work_task_id: { $in: taskIds } },
          ],
        },
      });
    } catch { delegs = []; }
  }

  const consultByTask = new Map(consults.map((c: any) => [String(c.task_id), c]));
  const delegByOrigin = new Map(
    delegs.filter((d: any) => d.origin_task_id).map((d: any) => [String(d.origin_task_id), d]),
  );
  const delegByWork = new Map(
    delegs.filter((d: any) => d.work_task_id).map((d: any) => [String(d.work_task_id), d]),
  );

  // Instruction snippets — dedupe distinct instruction_ids (avoid N+1).
  const instrById = new Map<string, any>();
  const distinctInstr = Array.from(
    new Set(tasks.map((t: any) => t.instruction_id).filter(Boolean)),
  ) as string[];
  await Promise.all(
    distinctInstr.map(async (iid) => {
      const instr = await db.getRepository('founder_instructions').findOne({ filter: { id: iid } });
      if (instr) instrById.set(String(iid), instr);
    }),
  );

  const enriched = tasks
    .map((t: any) => {
      const derived = deriveLiveStatus(t, {
        consult: consultByTask.get(String(t.id)) ?? null,
        delegOut: delegByOrigin.get(String(t.id)) ?? null,
        delegIn: delegByWork.get(String(t.id)) ?? null,
      });
      if (derived.hidden) return null; // killed rows excluded
      const instr = t.instruction_id ? instrById.get(String(t.instruction_id)) : null;
      return {
        task_id: t.id,
        instruction_id: t.instruction_id ?? null,
        instruction_text: instr ? String(instr.raw_text).slice(0, 160) : null,
        agent: t.assigned_agent,
        task_title: t.title,
        raw_status: t.status,
        live_status: derived.live_status,
        counterpart: derived.counterpart,
        current_action: derived.current_action,
        risk_level: t.risk_level ?? null,
        phase: t.phase ?? null,
        approval_required: t.approval_required ?? false,
        updated_at: t.updated_at ?? t.updatedAt ?? null,
      };
    })
    .filter(Boolean);

  const groups = new Map<string, any>();
  for (const row of enriched) {
    const key = row!.instruction_id ?? '__none__';
    if (!groups.has(key)) {
      groups.set(key, {
        instruction_id: row!.instruction_id,
        instruction_text: row!.instruction_text,
        agents: [],
      });
    }
    groups.get(key).agents.push(row);
  }

  ctx.body = { ok: true, data: Array.from(groups.values()) };
}

// Native Orchestration(Claude Code 직접 phase 실행) 작업 내역을 사업별로 그룹.
// native_phase_runs(데몬이 REST로 기록)를 business 필터 + l5_task_id 그룹으로 반환.
async function nativePhaseRuns(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const scope = readBusinessScope(ctx);
  let runs: any[] = [];
  try {
    runs = await db.getRepository('native_phase_runs').find({
      filter: withBusinessFilter({}, scope),
      sort: ['started_at'],
    });
  } catch {
    runs = []; // 테이블 미생성 등 — graceful 빈 목록
  }

  const groups = new Map<string, any>();
  for (const r of runs) {
    const key = String(r.l5_task_id ?? '__none__');
    if (!groups.has(key)) {
      groups.set(key, {
        l5_task_id: r.l5_task_id ?? null,
        task_title: r.task_title ?? null,
        business_id: r.business_id ?? null,
        phases: [],
      });
    }
    groups.get(key).phases.push({
      id: r.id,
      phase_name: r.phase_name,
      agent: r.agent,
      runtime: r.runtime,
      status: r.status,
      output: r.output ?? '',
      diff_summary: r.diff_summary ?? null,
      changed_files: r.changed_files ?? null,
      verdict: r.verdict ?? null,
      started_at: r.started_at ?? r.createdAt ?? null,
      ended_at: r.ended_at ?? null,
    });
  }
  ctx.body = { ok: true, data: Array.from(groups.values()) };
}

async function blockedTasks(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const scope = readBusinessScope(ctx);
  const tasks = await db.getRepository('agent_tasks').find({
    filter: withBusinessFilter({ status: 'blocked' }, scope),
    sort: ['-updated_at'],
  });

  ctx.body = {
    ok: true,
    data: await withInstructionSnippets(db, tasks, (task, instruction) => ({
      task_id: task.id,
      agent: task.assigned_agent,
      task_title: task.title,
      source_instruction: instruction ? instruction.raw_text.slice(0, 120) : null,
      status: task.status,
      decision: task.decision,
      reasoning: task.reasoning,
      next_action: task.next_action,
      blocker: task.blocker,
      next_owner: task.next_owner,
      approval_required: task.approval_required,
      risk_level: task.risk_level,
      phase: task.phase,
      source_ref: task.source_ref,
      updated_at: task.updated_at ?? task.updatedAt,
    })),
  };
}

async function approvalQueue(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const scope = readBusinessScope(ctx);
  const tasks = await db.getRepository('agent_tasks').find({
    filter: withBusinessFilter({ approval_required: true, status: { $notIn: ['done', 'killed'] } }, scope),
    sort: ['-updated_at'],
  });

  ctx.body = {
    ok: true,
    data: await withInstructionSnippets(db, tasks, (task, instruction) => ({
      task_id: task.id,
      agent: task.assigned_agent,
      task_title: task.title,
      source_instruction: instruction ? instruction.raw_text.slice(0, 120) : null,
      rationale: task.rationale,
      status: task.status,
      expected_output: task.expected_output,
      approval_required: true,
      risk_level: task.risk_level,
      phase: task.phase,
      source_ref: task.source_ref,
      blocker: task.blocker,
      updated_at: task.updated_at ?? task.updatedAt,
      // P3-4: self-mod diff-preview fields (null for normal approval items)
      self_mod_origin: task.self_mod_origin ?? null,
      acr_branch: task.acr_branch ?? null,
      acr_diff: task.acr_diff ?? null,
      acr_pr_url: task.acr_pr_url ?? null,
    })),
  };
}

async function projectTimeline(ctx: MonitorContext) {
  const db = ctx.db || (ctx as any).app?.db;
  const rawQuery = (ctx as any).request?.query ?? (ctx as any).query ?? {};
  const rawId = String(rawQuery['business_id'] ?? '').trim();

  // 'common', empty string, or absent → company-wide (business_id IS NULL)
  const isCommon = !rawId || rawId === 'common';

  const taskWhereClause = isCommon
    ? `WHERE business_id IS NULL`
    : `WHERE business_id = :business_id`;

  const handoffWhereClause = isCommon
    ? `WHERE task_id IN (SELECT id FROM agent_tasks WHERE business_id IS NULL)`
    : `WHERE task_id IN (SELECT id FROM agent_tasks WHERE business_id = :business_id)`;

  const replacements = isCommon ? {} : { business_id: rawId };

  const agentTasksRaw: TaskRecord[] = await db.sequelize.query(
    `SELECT id, assigned_agent, title, status, risk_level, phase, source_ref, business_id, updated_at, created_at, approval_required
     FROM agent_tasks
     ${taskWhereClause}
     ORDER BY updated_at DESC
     LIMIT 50`,
    {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    }
  );

  let handoffsRaw: TaskRecord[] = [];
  try {
    handoffsRaw = await db.sequelize.query(
      `SELECT id, from_agent, to_agent, task_id, what_was_completed AS note, created_at
       FROM agent_handoffs
       ${handoffWhereClause}
       ORDER BY created_at DESC
       LIMIT 50`,
      {
        replacements,
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
  } catch {
    // agent_handoffs table may not exist yet
    handoffsRaw = [];
  }

  // Derive open items from task statuses
  const openItems = agentTasksRaw
    .filter((t) => ['needs_review', 'blocked'].includes(t['status'] as string) ||
      (t['approval_required'] && t['status'] !== 'done' && t['status'] !== 'killed'))
    .map((t) => ({
      kind: t['status'] === 'blocked'
        ? 'blocked'
        : t['approval_required'] && t['status'] !== 'done'
          ? 'pending_approval'
          : 'needs_review',
      task_id: String(t['id']),
      note: t['blocker'] as string | undefined ?? undefined,
    })) as Array<{ kind: 'needs_review' | 'blocked' | 'pending_approval'; task_id: string; note?: string }>;

  // Derive decisions from tasks whose source_ref contains 'judge' or title indicates a decision verdict
  const decisions = agentTasksRaw
    .filter((t) => {
      const ref = String(t['source_ref'] ?? '');
      const title = String(t['title'] ?? '');
      return ref.includes('judge') || title.toLowerCase().includes('decision') || title.toLowerCase().includes('verdict');
    })
    .map((t) => ({
      task_id: String(t['id']),
      verdict: t['status'] as string,
      rationale: '', // rationale intentionally omitted — may contain PII
      at: String(t['updated_at'] ?? t['created_at'] ?? ''),
    }));

  ctx.body = {
    ok: true,
    data: {
      agentTasks: agentTasksRaw.map((t) => ({
        task_id: String(t['id']),
        agent: t['assigned_agent'],
        title: t['title'],
        status: t['status'],
        risk_level: t['risk_level'] ?? null,
        phase: t['phase'] ?? null,
        source_ref: t['source_ref'] ?? null,
        updated_at: t['updated_at'] ?? t['created_at'] ?? null,
      })),
      handoffs: handoffsRaw.map((h) => ({
        id: String(h['id']),
        from_agent: h['from_agent'],
        to_agent: h['to_agent'],
        task_id: String(h['task_id']),
        note: h['note'] ?? null,
        created_at: h['created_at'] ?? null,
      })),
      openItems,
      decisions,
    },
  };
}

// roadmap:list — phase roadmap for one business (or company-wide when business_id is NULL).
// Maps agent_tasks → RoadmapItem the founder-ui RoadmapMiniCard expects.
async function roadmapList(ctx: MonitorContext) {
  const db = ctx.db || (ctx as any).app?.db;
  const rawQuery = (ctx as any).request?.query ?? (ctx as any).query ?? {};
  const rawId = String(rawQuery['business_id'] ?? '').trim();
  const isCommon = !rawId || rawId === 'common';

  const whereClause = isCommon ? `WHERE business_id IS NULL` : `WHERE business_id = :business_id`;
  const replacements = isCommon ? {} : { business_id: rawId };

  const rows: TaskRecord[] = await db.sequelize.query(
    `SELECT id, title, status, phase, business_id, updated_at, created_at, assigned_agent, rationale
     FROM agent_tasks
     ${whereClause}
     ORDER BY updated_at DESC
     LIMIT 50`,
    { replacements, type: db.sequelize.QueryTypes.SELECT }
  );

  ctx.body = {
    ok: true,
    data: rows.map((t) => ({
      id: String(t['id']),
      title: t['title'],
      status: t['status'],
      phase: t['phase'] ?? null,
      // agent_tasks carries no priority/due_date columns yet — null until modeled.
      priority: null,
      due_date: null,
      business_id: (t['business_id'] as string | null) ?? null,
      // Show "which agent is doing what" in the founder-ui roadmap preview.
      agent: (t['assigned_agent'] as string | null) ?? null,
      objective: (t['rationale'] as string | null) ?? null,
    })),
  };
}

// discovery:today — surfaces the self-learning cron's "오늘의 발견" record.
// The record is company-wide (model/tool changelog), so business_id is always null.
// Reads the hermes-runtime discovery JSON; missing file → empty (graceful).
async function discoveryToday(ctx: MonitorContext) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  // L5_DISCOVERY_PATH wins; else resolve from cwd (NocoBase runs from apps/nocobase-app → repo root is ../..).
  const discoveryPath =
    process.env.L5_DISCOVERY_PATH ??
    path.resolve(process.cwd(), '../../services/hermes-runtime/.omc/state/todays-discovery.json');

  let data: Array<{ id: string; summary: string; source: string | null; created_at: string; business_id: string | null }> = [];
  try {
    const raw = fs.readFileSync(discoveryPath, 'utf-8');
    const record = JSON.parse(raw) as {
      date?: string;
      generated_at?: string;
      new_entries?: Array<{ source?: string; label?: string; fetched_at?: string; content_preview?: string }>;
    };
    data = (record.new_entries ?? []).map((e, i) => ({
      id: `${record.date ?? 'today'}:${e.source ?? i}`,
      summary: (e.content_preview ?? '').slice(0, 280),
      source: e.label ?? e.source ?? null,
      created_at: e.fetched_at ?? record.generated_at ?? '',
      business_id: null,
    }));
  } catch {
    // No discovery file yet (self-learning hasn't run) → empty banner.
    data = [];
  }

  ctx.body = { ok: true, data };
}

async function toolRequests(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const { status } = requestValues(ctx) as { status?: string };

  // Use raw query to filter by source_ref prefix. Two sources land on this
  // 🔔 surface: repetition-pattern:* (repetition-analyzer) and secondbrain-watch:*
  // (cmo-strategy-watch, self-improvement loop Phase B). Both are CTO improvement
  // proposals the founder escalates via [CTO에게 전송].
  const whereStatus = status && status !== 'all' ? `AND status = :status` : '';
  const tasks = await db.sequelize.query(
    `SELECT * FROM agent_tasks
     WHERE assigned_agent = 'CTO'
       AND (source_ref LIKE 'repetition-pattern:%' OR source_ref LIKE 'secondbrain-watch:%')
       ${whereStatus}
     ORDER BY updated_at DESC`,
    {
      replacements: status && status !== 'all' ? { status } : {},
      type: db.sequelize.QueryTypes.SELECT,
    }
  ) as TaskRecord[];


  ctx.body = {
    ok: true,
    data: tasks.map((task: TaskRecord) => ({
      task_id: task.id,
      task_title: task.title,
      rationale: task.rationale,
      status: task.status,
      risk_level: task.risk_level,
      phase: task.phase,
      source_ref: task.source_ref,
      blocker: task.blocker,
      approval_required: task.approval_required,
      updated_at: task.updated_at ?? task.updatedAt,
      created_at: task.created_at ?? task.createdAt,
    })),
  };
}

async function approveTask(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const { task_id } = requestValues(ctx);
  if (!task_id) {
    ctx.status = 400;
    ctx.body = { ok: false, error: 'task_id is required' };
    return;
  }

  const repo = db.getRepository('agent_tasks');
  const task = await repo.findOne({ filter: { id: task_id } });
  if (!task) {
    ctx.status = 404;
    ctx.body = { ok: false, error: `Task ${task_id} not found` };
    return;
  }

  await repo.update({
    filter: { id: task_id },
    values: { status: 'done', approval_required: false, updated_at: new Date() },
  });
  ctx.body = { ok: true, task_id, new_status: 'done' };
}

// PRD §18.1 — control-room retry. Re-runs a settled ACR ExecutionRun by run_id
// via the ACR `/api/execution-runs/:run_id/retry` endpoint. Graceful: when ACR
// is unreachable the transport returns null and we report ok:false so the UI
// shows "ACR 미연결" instead of erroring. An optional `agent` override supports
// the retry_with_verifier escalation.
async function retryRun(ctx: MonitorContext) {
  const { run_id, agent } = requestValues(ctx) as { run_id?: string; agent?: string };
  if (!run_id) {
    ctx.status = 400;
    ctx.body = { ok: false, error: 'run_id is required' };
    return;
  }
  const transport = makeAcrExecutionTransport();
  const result = transport
    ? await transport.retryRun(run_id, typeof agent === 'string' ? agent : undefined)
    : null;
  if (!result) {
    ctx.body = { ok: false, error: 'ACR unreachable or retry failed', data: {} };
    return;
  }
  ctx.body = { ok: true, data: { run_id: result.run_id } };
}

async function rejectTask(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const { task_id, explanation } = requestValues(ctx);
  if (!task_id) {
    ctx.status = 400;
    ctx.body = { ok: false, error: 'task_id is required' };
    return;
  }

  const repo = db.getRepository('agent_tasks');
  const task = await repo.findOne({ filter: { id: task_id } });
  if (!task) {
    ctx.status = 404;
    ctx.body = { ok: false, error: `Task ${task_id} not found` };
    return;
  }

  await repo.update({
    filter: { id: task_id },
    values: {
      status: 'killed',
      blocker: typeof explanation === 'string' ? explanation : task.blocker,
      updated_at: new Date(),
    },
  });
  ctx.body = { ok: true, task_id, new_status: 'killed' };
}

// P3-4 — risk ranking for the self-mod auto-apply floor gate.
const RISK_RANK: Record<string, number> = { D1: 1, D2: 2, D3: 3, D4: 4, D5: 5 };
// Blast-radius guard now lives in l5-core (checkSelfModDiffForbidden /
// checkSelfModIntentForbidden) — shared + tested. See tool-request.ts.

// P3-4: founder presses [CTO에게 전송] on a Tool Request → create a CTO self-mod task.
// objective = the proposal (rationale), auto acceptance_criteria, risk floor D3,
// approval_required=false (build first; gate happens at apply). Marks origin sent.
async function sendToCTO(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const { task_id } = requestValues(ctx);
  if (!task_id) {
    ctx.status = 400;
    ctx.body = { ok: false, error: 'task_id is required' };
    return;
  }
  const repo = db.getRepository('agent_tasks');
  const origin = await repo.findOne({ filter: { id: task_id } });
  if (!origin) {
    ctx.status = 404;
    ctx.body = { ok: false, error: `Tool request ${task_id} not found` };
    return;
  }

  // Early blast-radius gate: block obviously-forbidden self-brain requests at
  // creation — before any CLI runs — based on the proposal's title/rationale.
  // (The diff-level hard gate still runs at apply.) Founder's #1 safety rule.
  const intent = checkSelfModIntentForbidden(`${origin.title ?? ''} ${origin.rationale ?? ''}`);
  if (intent.forbidden) {
    await repo.update({
      filter: { id: task_id },
      values: {
        self_mod_status: 'blocked',
        blocker: `selfmod:intent-denied ${intent.reason} (${intent.pattern})`,
        updated_at: new Date(),
      },
    });
    ctx.body = {
      ok: false,
      error: '요청이 보호 영역(승인/게이트/시크릿/프로세스 제어) 수정을 시사하여 차단되었습니다.',
      denied_by: intent.pattern,
      stage: 'intent',
    };
    return;
  }

  const criteria: string[] = buildSelfModAcceptanceCriteria({
    task_title: origin.title,
    rationale: origin.rationale,
    source_ref: origin.source_ref,
  });
  const selfModId = randomUUID();
  // Raw insert: NocoBase repository.create coerces the interpretation_id FK column
  // (belongsTo association) to '' when absent → FK violation. Raw SQL avoids it.
  await db.sequelize.query(
    `INSERT INTO agent_tasks
       (id, instruction_id, interpretation_id, assigned_agent, title, rationale,
        expected_output, status, approval_required, risk_level, phase, source_ref,
        self_mod_origin, business_id, project_id, "createdAt", "updatedAt")
     VALUES (:id, :instruction_id, :interpretation_id, 'CTO', :title, :rationale,
        :expected_output, 'queued', false, 'D3', 'execution_build', :source_ref,
        :self_mod_origin, :business_id, :project_id, now(), now())`,
    {
      replacements: {
        id: selfModId,
        instruction_id: origin.instruction_id,
        interpretation_id: origin.interpretation_id ?? null,
        title: `[자가수정] ${String(origin.title ?? '도구 개선').slice(0, 80)}`,
        rationale: origin.rationale ?? origin.title ?? '',
        expected_output: `다음 수용 기준을 모두 충족하도록 자신의 도구/코드를 수정: ${criteria.join(' / ')}`,
        source_ref: `selfmod:${task_id}`,
        self_mod_origin: task_id,
        business_id: origin.business_id ?? null,
        project_id: origin.project_id ?? null,
      },
    },
  );

  // Mark the origin Tool Request as sent (drives the UI chip).
  await repo.update({
    filter: { id: task_id },
    values: { self_mod_status: 'sent', updated_at: new Date() },
  });

  ctx.body = { ok: true, data: { self_mod_task_id: selfModId, origin_task_id: task_id, status: 'sent', acceptance_criteria: criteria } };
}

// P3-4: founder approves a self-mod (diff reviewed) → apply. ACR works on a branch;
// the running plugin/service cannot hot-swap itself, so applying code that touches
// running services is surfaced as needs_restart rather than pretended instant.
// Deny-list refuses diffs touching gate/secret/launchd code regardless of floor.
async function applySelfMod(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const { task_id } = requestValues(ctx);
  if (!task_id) {
    ctx.status = 400;
    ctx.body = { ok: false, error: 'task_id is required' };
    return;
  }
  const repo = db.getRepository('agent_tasks');
  const task = await repo.findOne({ filter: { id: task_id } });
  if (!task) {
    ctx.status = 404;
    ctx.body = { ok: false, error: `Self-mod task ${task_id} not found` };
    return;
  }

  // Blast-radius guard: hard refuse if the diff touches forbidden paths
  // (shared, tested l5-core gate — same patterns used at diff-arrival too).
  const diff = String(task.acr_diff ?? '');
  const denied = checkSelfModDiffForbidden(diff);
  if (denied.forbidden) {
    await repo.update({
      filter: { id: task_id },
      values: { status: 'needs_review', blocker: `selfmod:denied ${denied.reason} — 자동 적용 거부`, updated_at: new Date() },
    });
    ctx.body = { ok: false, error: 'diff touches a protected area; rejected', denied_by: denied.pattern };
    return;
  }

  // The merge itself is performed by ACR on its branch; when unavailable, mark
  // applied:needs_restart so the founder knows the running process must be reloaded.
  const needsRestart = !task.acr_branch;
  await repo.update({
    filter: { id: task_id },
    values: {
      status: 'done',
      approval_required: false,
      self_mod_status: 'applied',
      blocker: needsRestart ? 'applied:needs_restart — 변경 반영을 위해 해당 서비스 재기동 필요' : null,
      updated_at: new Date(),
    },
  });
  if (task.self_mod_origin) {
    await repo.update({ filter: { id: task.self_mod_origin }, values: { self_mod_status: 'applied', updated_at: new Date() } });
  }
  ctx.body = { ok: true, data: { task_id, status: 'applied', needs_restart: needsRestart, branch: task.acr_branch ?? null } };
}

// P3-4: founder rejects a self-mod → drop the branch (never merged = trivially safe).
async function rollbackSelfMod(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const { task_id } = requestValues(ctx);
  if (!task_id) {
    ctx.status = 400;
    ctx.body = { ok: false, error: 'task_id is required' };
    return;
  }
  const repo = db.getRepository('agent_tasks');
  const task = await repo.findOne({ filter: { id: task_id } });
  if (!task) {
    ctx.status = 404;
    ctx.body = { ok: false, error: `Self-mod task ${task_id} not found` };
    return;
  }
  await repo.update({
    filter: { id: task_id },
    values: { status: 'killed', self_mod_status: 'rolled_back', blocker: 'selfmod:rolled_back — 브랜치 폐기(미머지)', updated_at: new Date() },
  });
  if (task.self_mod_origin) {
    await repo.update({ filter: { id: task.self_mod_origin }, values: { self_mod_status: 'rejected', updated_at: new Date() } });
  }
  ctx.body = { ok: true, data: { task_id, status: 'rolled_back', branch: task.acr_branch ?? null } };
}

async function memoryCandidates(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  try {
    const repo = db.getRepository('founder_memory');
    const rows = await repo.find({
      filter: { approval_status: 'pending' },
      // founder_memory uses NocoBase's default camelCase timestamps.
      sort: ['-createdAt'],
    });
    ctx.body = {
      ok: true,
      data: rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        insight: row.insight,
        workflow_improvement: row.workflow_improvement,
        source_agent: row.source_agent,
        source_task_id: row.source_task_id,
        pii_level: row.pii_level,
        phase: row.phase,
        created_at: row.createdAt,
      })),
    };
  } catch {
    ctx.body = { ok: true, data: [] };
  }
}

async function updateMemoryStatus(ctx: MonitorContext, approval_status: 'saved' | 'discarded') {
  const db = ctx.db || ctx.app.db;
  const { source_task_id } = requestValues(ctx);
  if (!source_task_id) {
    ctx.status = 400;
    ctx.body = { ok: false, error: 'source_task_id is required' };
    return;
  }

  try {
    const repo = db.getRepository('founder_memory');
    // NocoBase maintains updatedAt automatically; don't write a non-existent
    // snake_case column.
    await repo.update({
      filter: { source_task_id },
      values: { approval_status },
    });
    ctx.body = { ok: true, source_task_id, decision: approval_status };
  } catch {
    ctx.body = { ok: false, error: 'Memory table not ready' };
    return;
  }

  // M3: when CEO saves a memory (approval_status='saved'), push to secondbrain.
  // Best-effort: never blocks the save response. PII high excluded per governance.
  if (approval_status === 'saved') {
    pushToSecondBrainOnSave(db, source_task_id as string).catch((err) => {
      console.warn('[saveMemory] secondbrain push failed (best-effort):', err);
    });
  }
}

// M3: best-effort push of a saved founder_memory record to the SecondBrain MCP.
// No-ops when SECONDBRAIN_MCP_URL/TOKEN are absent (secondbrain disabled).
// TODO: update '/tools/secondbrain.append' and body shape when MCP endpoint is provisioned.
async function pushToSecondBrainOnSave(db: any, source_task_id: string): Promise<void> {
  const sbUrl = process.env.SECONDBRAIN_MCP_URL;
  const sbToken = process.env.SECONDBRAIN_MCP_TOKEN;
  if (!sbUrl || !sbToken) return;

  let record: any;
  try {
    const repo = db.getRepository('founder_memory');
    record = await repo.findOne({ filter: { source_task_id } });
  } catch { return; }
  if (!record) return;
  // Governance: never send high-PII insights to secondbrain.
  if ((record.pii_level ?? 'none') === 'high') return;

  const base = sbUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${sbToken}` };
  try {
    await fetch(`${base}/tools/secondbrain.append`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        insight: record.insight,
        source_agent: record.source_agent ?? null,
        source_task_id: record.source_task_id ?? null,
        phase: record.phase ?? null,
        pii_level: record.pii_level ?? 'none',
      }),
      signal: (AbortSignal as any).timeout?.(5000),
    });
  } catch {
    // best-effort — silent failure, saved status already persisted
  }
}

// P3-2 — knowledge auto-curation helpers.
const PURGE_GRACE_DAYS = 30;

function curationInputFromRow(row: any) {
  return {
    insight: String(row.insight ?? ''),
    pii_level: (row.pii_level ?? 'none') as 'none' | 'low' | 'high',
    workflow_improvement: row.workflow_improvement ?? undefined,
    phase: row.phase ?? undefined,
    source_agent: row.source_agent ?? undefined,
    // v1 sweep: similarity not computed here (transport lives in orchestration);
    // undefined → dedup skipped, fail-open to keep (never auto-discard as duplicate).
    maxSimilarity: undefined,
  };
}

// monitor:curate — periodic sweep that curates pending founder_memory rows.
// (persistTaskInsight lives in plugin-orchestration, not this lane, so curation
// at creation time is wired there; this sweep catches stragglers left 'pending'.)
async function curateSweep(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  let rows: any[] = [];
  try {
    rows = await db.getRepository('founder_memory').find({
      filter: { approval_status: 'pending' },
      sort: ['-createdAt'],
      limit: 200,
    });
  } catch {
    ctx.body = { ok: true, data: { curated: 0, saved: 0, discarded: 0, needs_review: 0 } };
    return;
  }

  const repo = db.getRepository('founder_memory');
  let saved = 0;
  let discarded = 0;
  let needsReview = 0;

  for (const row of rows) {
    const result = curateInsight(curationInputFromRow(row));
    if (result.decision === 'auto_save') {
      await repo.update({
        filter: { id: row.id },
        values: { approval_status: 'saved', curation_decision: 'auto_save' },
      });
      saved++;
      // Reuse the single append path; pii_high already guarded inside.
      if (row.source_task_id) {
        pushToSecondBrainOnSave(db, String(row.source_task_id)).catch(() => {});
      }
    } else if (result.decision === 'auto_discard') {
      const now = new Date();
      const purgeAt = new Date(now.getTime() + PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
      await repo.update({
        filter: { id: row.id },
        values: {
          approval_status: 'discarded',
          curation_decision: 'auto_discard',
          discard_reason: result.reason ?? null,
          discarded_at: now,
          purge_at: purgeAt,
        },
      });
      discarded++;
    } else {
      // needs_review → keep pending (default), record the decision marker only.
      await repo.update({
        filter: { id: row.id },
        values: { curation_decision: 'needs_review' },
      });
      needsReview++;
    }
  }

  ctx.body = {
    ok: true,
    data: { curated: rows.length, saved, discarded, needs_review: needsReview },
  };
}

// monitor:curationSummary — weekly saved/discarded summary (last 7 days).
async function curationSummary(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  let rows: any[] = [];
  try {
    rows = await db.getRepository('founder_memory').find({
      filter: { curation_decision: { $in: ['auto_save', 'auto_discard', 'needs_review'] } },
      sort: ['-updatedAt'],
      limit: 500,
    });
  } catch {
    rows = [];
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = rows.filter((r) => {
    const ts = new Date(r.updatedAt ?? r.createdAt ?? 0).getTime();
    return Number.isFinite(ts) && ts >= weekAgo;
  });

  const items = recent.map((r) => ({
    id: String(r.id),
    insight: String(r.insight ?? ''),
    result: {
      decision: (r.curation_decision ?? 'needs_review'),
      reason: r.discard_reason ?? undefined,
      explanation: r.discard_reason
        ? `자동 폐기 (${r.discard_reason})`
        : r.curation_decision === 'auto_save'
          ? '자동 저장'
          : '검토 필요',
    },
  }));

  // Discard timestamps differ per row, so build the summary then re-attach per-row
  // discarded_at/purge_at from the DB (summarizeCuration takes a single opts pair).
  const weekStart = new Date(weekAgo).toISOString();
  const summary = summarizeCuration(items, { week_start: weekStart });
  const purgeByid = new Map(recent.map((r) => [String(r.id), r]));
  summary.discarded = summary.discarded.map((d: any) => {
    const row = purgeByid.get(String(d.id));
    return {
      ...d,
      discarded_at: row?.discarded_at ?? row?.discardedAt ?? '',
      purge_at: row?.purge_at ?? row?.purgeAt ?? '',
    };
  });

  ctx.body = { ok: true, data: summary };
}

// monitor:overrideCuration — founder override of an auto-decision.
async function overrideCuration(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const { id, decision } = requestValues(ctx) as { id?: string; decision?: string };
  if (!id || !decision || !['save', 'discard', 'restore'].includes(decision)) {
    ctx.status = 400;
    ctx.body = { ok: false, error: "id and decision ('save'|'discard'|'restore') are required" };
    return;
  }

  const repo = db.getRepository('founder_memory');
  let row: any;
  try {
    row = await repo.findOne({ filter: { id } });
  } catch {
    ctx.body = { ok: false, error: 'Memory table not ready' };
    return;
  }
  if (!row) {
    ctx.status = 404;
    ctx.body = { ok: false, error: `Memory ${id} not found` };
    return;
  }

  if (decision === 'save') {
    await repo.update({
      filter: { id },
      values: {
        approval_status: 'saved',
        curation_decision: 'manual',
        discard_reason: null,
        discarded_at: null,
        purge_at: null,
      },
    });
    if (row.approval_status !== 'saved' && row.source_task_id) {
      pushToSecondBrainOnSave(db, String(row.source_task_id)).catch(() => {});
    }
    ctx.body = { ok: true, id, decision: 'saved' };
  } else if (decision === 'discard') {
    const now = new Date();
    const purgeAt = new Date(now.getTime() + PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
    await repo.update({
      filter: { id },
      values: {
        approval_status: 'discarded',
        curation_decision: 'manual',
        discarded_at: now,
        purge_at: purgeAt,
      },
    });
    ctx.body = { ok: true, id, decision: 'discarded' };
  } else {
    // restore — undo a discard within grace; back to pending, clear discard fields.
    await repo.update({
      filter: { id },
      values: {
        approval_status: 'pending',
        curation_decision: 'manual',
        discard_reason: null,
        discarded_at: null,
        purge_at: null,
      },
    });
    ctx.body = { ok: true, id, decision: 'restored' };
  }
}

// P3-3 — monitor:controlRoomTree. Business ▸ Project ▸ dev-task tree for the CTO,
// merged with ACR execution data when available (degraded to L5-only otherwise).
async function controlRoomTree(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const scope = readBusinessScope(ctx);

  // Scope the tree to the selected business so the Control Room filters like the
  // sidebar (parametrized to avoid injection). 'all'/'common' show every business.
  const bizFilter = scope.kind === 'biz' ? { bid: scope.id } : null;
  const businessRows: any[] = await db.sequelize.query(
    `SELECT id, title FROM businesses WHERE status != 'deleted'${bizFilter ? ' AND id = :bid' : ''} ORDER BY "updatedAt" DESC`,
    { type: db.sequelize.QueryTypes.SELECT, replacements: bizFilter ?? {} },
  );
  const businesses = businessRows.map((b) => ({ id: String(b.id), name: b.title ?? '' }));

  const projectRows: any[] = await db.sequelize.query(
    `SELECT id, business_id, title, status FROM projects WHERE status != 'deleted'${bizFilter ? ' AND business_id = :bid' : ''}`,
    { type: db.sequelize.QueryTypes.SELECT, replacements: bizFilter ?? {} },
  );
  const projects = projectRows.map((p) => ({
    id: String(p.id),
    business_id: String(p.business_id ?? ''),
    name: p.title ?? '',
    status: p.status ?? 'active',
  }));

  const taskRows = await db.getRepository('agent_tasks').find({
    filter: withBusinessFilter(
      { assigned_agent: 'CTO', status: { $notIn: ['done', 'killed'] } },
      scope,
    ),
    sort: ['-updated_at'],
  });
  const ctoTasks = taskRows.map((t: any) => ({
    id: String(t.id),
    title: t.title ?? '',
    assigned_agent: t.assigned_agent ?? 'CTO',
    status: t.status,
    risk_level: t.risk_level ?? null,
    phase: t.phase ?? null,
    blocker: t.blocker ?? null,
    business_id: t.business_id ?? null,
    project_id: t.project_id ?? null,
    approval_required: t.approval_required ?? false,
    updated_at: t.updated_at ?? t.updatedAt ?? null,
  }));

  // ACR merge — transport is a graceful stub (returns [] until the ACR GET route
  // ships). Query per distinct business (ACR keys feature-plans by l5-<businessId>).
  const acrByTaskId: Record<string, any> = {};
  const transport = makeAcrExecutionTransport();
  if (transport) {
    const bizIds = Array.from(
      new Set(ctoTasks.map((t: any) => t.business_id).filter(Boolean)),
    ) as string[];
    await Promise.all(
      bizIds.map(async (bid) => {
        const records = await transport.fetchExecution(`l5-${bid}`);
        for (const r of records) acrByTaskId[r.acr_task_id] = r;
      }),
    );
  }

  const tree = buildControlRoomTree({ businesses, projects, ctoTasks, acrByTaskId });
  ctx.body = { ok: true, data: tree };
}

async function withInstructionSnippets(
  db: any,
  tasks: TaskRecord[],
  mapTask: (task: TaskRecord, instruction: TaskRecord | null) => Record<string, unknown>,
) {
  const instructionRepo = db.getRepository('founder_instructions');

  return Promise.all(
    tasks.map(async (task) => {
      const instruction = task.instruction_id
        ? await instructionRepo.findOne({ filter: { id: task.instruction_id } })
        : null;

      return mapTask(task, instruction);
    }),
  );
}

function requestValues(ctx: MonitorContext): Record<string, unknown> {
  return ctx.request?.body ?? ctx.action?.params?.values ?? {};
}

async function currentPhase(ctx: MonitorContext) {
  const db = ctx.db || (ctx as any).app?.db;
  const tasks = await db.getRepository('agent_tasks').find({
    filter: { status: { $notIn: ['done', 'killed'] } },
  });
  const phase: string = derivePhaseFromTasks(tasks);
  const phaseIndex: number = BPR_PHASE_ORDER.indexOf(phase);
  const nextPhase: string | null = phaseIndex < BPR_PHASE_ORDER.length - 1 ? BPR_PHASE_ORDER[phaseIndex + 1] : null;
  ctx.body = {
    current_phase: phase,
    current_phase_label: BPR_PHASE_LABELS[phase] ?? phase,
    next_phase: nextPhase,
    next_phase_label: nextPhase ? (BPR_PHASE_LABELS[nextPhase] ?? nextPhase) : null,
    phase_index: phaseIndex,
    total_phases: BPR_PHASE_ORDER.length,
    requires_approval: true,
  };
}

async function transitionSummary(ctx: MonitorContext) {
  const body = requestValues(ctx);
  const fromPhase = (body.from_phase as string) ?? (ctx as any).action?.params?.from_phase;
  const toPhase = (body.to_phase as string) ?? (ctx as any).action?.params?.to_phase;
  if (!fromPhase || !toPhase) {
    (ctx as any).status = 400;
    ctx.body = { ok: false, error: 'from_phase and to_phase are required' };
    return;
  }
  const db = ctx.db || (ctx as any).app?.db;
  const tasks = await db.getRepository('agent_tasks').find({
    filter: { phase: fromPhase },
    limit: 200,
  });
  const summary = buildPhaseTransitionSummary({
    from_phase: fromPhase,
    to_phase: toPhase,
    tasks: tasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      expected_output: t.expected_output,
      status: t.status,
      assigned_agent: t.assigned_agent,
      phase: t.phase,
      blocker: t.blocker,
      insight_to_record: t.insight_to_record,
    })),
  });
  ctx.body = { ok: true, data: summary };
}

async function requestTransition(ctx: MonitorContext) {
  const body = requestValues(ctx);
  const { from_phase, to_phase, reason } = body as Record<string, string>;
  if (!from_phase || !to_phase) {
    (ctx as any).status = 400;
    ctx.body = { ok: false, error: 'from_phase and to_phase are required' };
    return;
  }
  const result = buildTransitionResult({
    from_phase,
    to_phase,
    reason: reason ?? 'Founder requested phase transition',
    triggered_by: 'founder',
  });
  if (result.ok) {
    const db = ctx.db || (ctx as any).app?.db;
    await db.getRepository('agent_tasks').create({
      values: {
        id: randomUUID(),
        instruction_id: randomUUID(),
        assigned_agent: 'CEO',
        title: `Phase Transition: ${BPR_PHASE_LABELS[from_phase] ?? from_phase} → ${BPR_PHASE_LABELS[to_phase] ?? to_phase}`,
        rationale: reason ?? 'Founder requested phase transition',
        expected_output: `Phase transition to ${to_phase} approved and executed`,
        status: 'needs_review',
        approval_required: true,
        risk_level: 'D5',
        phase: to_phase,
      },
    });
  }
  ctx.body = { ok: result.ok, data: result };
}

async function ensureBusinessIdIndex(db: any) {
  const dialect = db.sequelize?.getDialect?.();
  if (dialect === 'sqlite') return;

  try {
    await db.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_agent_tasks_business_id ON agent_tasks (business_id);`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure agent_tasks business_id index: ${message}`);
  }
}

function registerHermesResource(app: any, db: any) {
  app.resourcer.define({
    name: 'hermes',
    actions: {
      // Hermes가 LLM 컨텍스트로 사용할 태스크 요약 반환
      taskSummary: async (ctx: MonitorContext, next: () => Promise<void>) => {
        const taskRepo = db.getRepository('agent_tasks');
        const [active, pending, recent] = await Promise.all([
          taskRepo.find({ filter: { status: { $notIn: ['done', 'killed'] } }, sort: ['-updated_at'], limit: 50 }),
          taskRepo.find({ filter: { approval_required: true, status: { $notIn: ['done', 'killed'] } } }),
          taskRepo.find({ filter: { status: 'done' }, sort: ['-updated_at'], limit: 20 }),
        ]);

        ctx.body = {
          ok: true,
          summary: {
            active_count: active.length,
            pending_approval_count: pending.length,
            recent_done_count: recent.length,
            active_tasks: active.map((t: any) => ({
              id: t.id, agent: t.assigned_agent, title: t.title,
              status: t.status, risk: t.risk_level, phase: t.phase,
              updated_at: t.updated_at ?? t.updatedAt,
            })),
            pending_approvals: pending.map((t: any) => ({
              id: t.id, agent: t.assigned_agent, title: t.title, risk: t.risk_level,
            })),
            recent_completions: recent.map((t: any) => ({
              id: t.id, agent: t.assigned_agent, title: t.title, phase: t.phase,
            })),
          },
        };
        await next();
      },

      // Hermes LLM이 분석 후 태스크 생성
      createTask: async (ctx: MonitorContext, next: () => Promise<void>) => {
        const body = requestValues(ctx) as Record<string, any>;
        const { assigned_agent, title, rationale, expected_output, risk_level, phase } = body;
        if (!assigned_agent || !title || !rationale || !expected_output) {
          (ctx as any).status = 400;
          ctx.body = { ok: false, error: 'assigned_agent, title, rationale, expected_output are required' };
          return;
        }
        const { randomUUID } = await import('crypto');
        const now = new Date().toISOString();
        const task = await db.getRepository('agent_tasks').create({
          values: {
            id: randomUUID(),
            instruction_id: randomUUID(),
            assigned_agent,
            title,
            rationale,
            expected_output,
            status: 'queued',
            // Founder approval gate fires only for outbound messages / payments,
            // never for internal risk level. CEO review owns quality; CTO self-heals.
            approval_required: false,
            risk_level: risk_level ?? 'D2',
            phase,
            source_ref: 'hermes-agent',
            created_at: now,
            updated_at: now,
          },
        });
        ctx.body = { ok: true, task_id: task.id };
        await next();
      },

      // Hermes가 메모리 인사이트 저장
      saveInsight: async (ctx: MonitorContext, next: () => Promise<void>) => {
        const body = requestValues(ctx) as Record<string, any>;
        const { insight, source_agent, phase, pii_level } = body;
        if (!insight) {
          (ctx as any).status = 400;
          ctx.body = { ok: false, error: 'insight is required' };
          return;
        }
        const { randomUUID } = await import('crypto');
        await db.getRepository('founder_memory').create({
          values: {
            id: randomUUID(),
            insight,
            source_agent: source_agent ?? 'hermes',
            phase: phase ?? null,
            pii_level: pii_level ?? 'none',
            approval_status: 'pending',
            created_at: new Date().toISOString(),
          },
        });
        ctx.body = { ok: true };
        await next();
      },
    },
  });
}

function registerGetRoute(app: any, path: string, handler: (ctx: MonitorContext) => Promise<void>) {
  app.use(async (ctx: MonitorContext, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.path !== path) {
      return next();
    }

    await handler(ctx);
  });
}

function registerFounderMemoryCollection(db: any) {
  db.collection(defineCollection({
    name: 'founder_memory',
    title: 'Founder Memory',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'insight', type: 'text', allowNull: false },
      { name: 'workflow_improvement', type: 'text' },
      { name: 'source_agent', type: 'string' },
      { name: 'source_task_id', type: 'uuid' },
      { name: 'pii_level', type: 'string', defaultValue: 'none' },
      { name: 'phase', type: 'string' },
      { name: 'approval_status', type: 'string', defaultValue: 'pending' },
      // P3-2 — knowledge auto-curation soft-delete fields (additive, nullable).
      { name: 'curation_decision', type: 'string' }, // auto_save|auto_discard|needs_review|manual
      { name: 'discard_reason', type: 'string' },     // DiscardReason | null
      { name: 'discarded_at', type: 'date' },
      { name: 'purge_at', type: 'date' },
    ],
  }));
}

// Native Orchestration phase 실행 내역 테이블. 데몬이 REST :create/:update로 기록하고
// monitor:nativeRuns가 사업별로 조회한다. id는 서버 생성(uuid PK).
function registerNativePhaseRunsCollection(db: any) {
  db.collection(defineCollection({
    name: 'native_phase_runs',
    title: 'Native Phase Runs',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'business_id', type: 'string' },
      { name: 'l5_task_id', type: 'string' },
      { name: 'task_title', type: 'string' },
      { name: 'phase_name', type: 'string' },
      { name: 'agent', type: 'string' },        // claude-code | codex | antigravity
      { name: 'runtime', type: 'string' },
      { name: 'status', type: 'string' },        // merged | held | failed | waited
      { name: 'output', type: 'text' },          // 에이전트 작업 보고서 전체 본문
      { name: 'diff_summary', type: 'text' },
      { name: 'changed_files', type: 'integer' },
      { name: 'verdict', type: 'text' },
      { name: 'started_at', type: 'date' },
      { name: 'ended_at', type: 'date' },
    ],
  }));
}

// native_phase_runs 물리 테이블 보장(defineCollection은 모델만 등록 → DDL 필요).
// 다른 L5 컬렉션과 동일 규약: CREATE TABLE IF NOT EXISTS + camelCase 타임스탬프. idempotent.
async function ensureNativePhaseRunsTable(db: any) {
  const dialect = db.sequelize?.getDialect?.();
  if (dialect === 'sqlite') return;
  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS native_phase_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id text,
        l5_task_id text,
        task_title text,
        phase_name text,
        agent text,
        runtime text,
        status text,
        output text,
        diff_summary text,
        changed_files int,
        verdict text,
        started_at timestamptz,
        ended_at timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure native_phase_runs table: ${message}`);
  }
}

// P3-2 — ensure the curation soft-delete columns exist on the existing table.
// Additive, nullable, idempotent — safe to run on every boot.
async function ensureCurationColumns(db: any) {
  const dialect = db.sequelize?.getDialect?.();
  if (dialect === 'sqlite') return;
  const stmts = [
    `ALTER TABLE founder_memory ADD COLUMN IF NOT EXISTS curation_decision text;`,
    `ALTER TABLE founder_memory ADD COLUMN IF NOT EXISTS discard_reason text;`,
    `ALTER TABLE founder_memory ADD COLUMN IF NOT EXISTS discarded_at timestamptz;`,
    `ALTER TABLE founder_memory ADD COLUMN IF NOT EXISTS purge_at timestamptz;`,
  ];
  for (const sql of stmts) {
    try {
      await db.sequelize.query(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      db.logger?.warn?.(`Could not ensure founder_memory curation column: ${message}`);
    }
  }
}

// ── 호랑이(Tiger) 자가개선 컬렉션 + 핸들러 ──────────────────────────────────
// night-bpr-loop가 REST :create로 BPRLog/WorkflowImprovementProposal/MemoryEntry를
// 적재하고, monitor:selfImproveCards가 🐯 자가개선 surface로 조회한다.
function registerTigerCollections(db: any) {
  db.collection(defineCollection({
    name: 'workflow_improvement_proposals',
    title: 'Workflow Improvement Proposals',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'related_workflow_id', type: 'string' },
      { name: 'related_business_id', type: 'string' },
      { name: 'current_process', type: 'text' },
      { name: 'identified_bottleneck', type: 'text' },
      { name: 'proposed_improvement', type: 'text' },
      { name: 'impact_on_timeline', type: 'string' },
      { name: 'effort_to_implement', type: 'string' },
      { name: 'suggested_by_agent_id', type: 'string' },
      { name: 'status', type: 'string', defaultValue: 'proposed' },
      { name: 'source_ref', type: 'string' },
    ],
  }));
  db.collection(defineCollection({
    name: 'bpr_logs',
    title: 'BPR Logs',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'business_id', type: 'string' },
      { name: 'bottleneck_description', type: 'text' },
      { name: 'impact', type: 'string' },
      { name: 'root_cause', type: 'text' },
      { name: 'proposed_solution', type: 'text' },
      { name: 'owner_agent_id', type: 'string' },
      { name: 'status', type: 'string', defaultValue: 'identified' },
      { name: 'source_ref', type: 'string' },
    ],
  }));
  db.collection(defineCollection({
    name: 'memory_entries',
    title: 'Memory Entries',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'category', type: 'string' },
      { name: 'content', type: 'text' },
      { name: 'related_business_id', type: 'string' },
      { name: 'related_entity_id', type: 'string' },
      { name: 'related_entity_type', type: 'string' },
      { name: 'pii_level', type: 'string', defaultValue: 'none' },
      { name: 'searchable_tags', type: 'json' },
      { name: 'suggested_tags', type: 'json' },
      { name: 'reusability_score', type: 'integer' },
      { name: 'approval_status', type: 'string', defaultValue: 'pending' },
      { name: 'contains_pii', type: 'boolean', defaultValue: false },
      { name: 'pii_notes', type: 'text' },
      { name: 'source_task_id', type: 'string' },
      { name: 'reusable_context', type: 'text' },
      { name: 'source_ref', type: 'string' },
    ],
  }));
}

// defineCollection은 모델만 등록 → 물리 테이블 DDL 필요(native_phase_runs와 동일 규약).
async function ensureTigerTables(db: any) {
  const dialect = db.sequelize?.getDialect?.();
  if (dialect === 'sqlite') return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS workflow_improvement_proposals (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       related_workflow_id text, related_business_id text,
       current_process text, identified_bottleneck text, proposed_improvement text,
       impact_on_timeline text, effort_to_implement text, suggested_by_agent_id text,
       status text DEFAULT 'proposed', source_ref text,
       "createdAt" timestamptz NOT NULL DEFAULT now(),
       "updatedAt" timestamptz NOT NULL DEFAULT now()
     );`,
    `CREATE TABLE IF NOT EXISTS bpr_logs (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       business_id text, bottleneck_description text, impact text, root_cause text,
       proposed_solution text, owner_agent_id text, status text DEFAULT 'identified',
       source_ref text,
       "createdAt" timestamptz NOT NULL DEFAULT now(),
       "updatedAt" timestamptz NOT NULL DEFAULT now()
     );`,
    `CREATE TABLE IF NOT EXISTS memory_entries (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       category text, content text, related_business_id text, related_entity_id text,
       related_entity_type text, pii_level text DEFAULT 'none',
       searchable_tags jsonb, suggested_tags jsonb, reusability_score int,
       approval_status text DEFAULT 'pending', contains_pii boolean DEFAULT false,
       pii_notes text, source_task_id text, reusable_context text, source_ref text,
       "createdAt" timestamptz NOT NULL DEFAULT now(),
       "updatedAt" timestamptz NOT NULL DEFAULT now()
     );`,
  ];
  for (const sql of stmts) {
    try {
      await db.sequelize.query(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      db.logger?.warn?.(`Could not ensure tiger table: ${message}`);
    }
  }
}

// ── 호랑이(Tiger) 실시간 장애 감시 컬렉션 + 핸들러 ──────────────────────────
// reactive 감시 루프(hermes)가 REST :create로 tiger_incidents를 적재하고,
// monitor:incidents가 미해결 장애를 founder-ui 벨/장애 목록으로 surface한다.
// monitor:approveIncidentFix가 승인 게이트(status=approved → CTO 수정 dispatch 허용).
function registerTigerIncidentsCollection(db: any) {
  db.collection(defineCollection({
    name: 'tiger_incidents',
    title: 'Tiger Incidents',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'task_ref', type: 'string' },       // 감시 대상 작업 식별(l5_task_id/run_id/phase_run id 등)
      { name: 'task_label', type: 'string' },      // 사장님이 알아볼 작업명(키콘텐츠/영상룸 등)
      { name: 'incident_type', type: 'string' },   // failed | stalled | error
      { name: 'error_summary', type: 'text' },      // 오류 요지(메시지/스택 발췌)
      { name: 'diagnosis', type: 'text' },          // 호랑이 진단
      { name: 'proposed_fix', type: 'text' },       // "CTO에게 이렇게 고치게 하겠다" 수정 계획
      { name: 'target_repo', type: 'string' },     // 수정 대상 repo 절대경로
      { name: 'status', type: 'string', defaultValue: 'detected' }, // detected|approved|fixing|testing|resolved|escalated
      { name: 'attempt_count', type: 'integer', defaultValue: 0 },
      { name: 'detected_at', type: 'date' },
      { name: 'source_ref', type: 'string' },       // 원 신호 출처(native_phase_runs:<id> 등)
    ],
  }));
}

// defineCollection은 모델만 등록 → 물리 테이블 DDL 필요(native_phase_runs와 동일 규약). idempotent.
async function ensureTigerIncidentsTable(db: any) {
  const dialect = db.sequelize?.getDialect?.();
  if (dialect === 'sqlite') return;
  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS tiger_incidents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        task_ref text,
        task_label text,
        incident_type text,
        error_summary text,
        diagnosis text,
        proposed_fix text,
        target_repo text,
        status text DEFAULT 'detected',
        attempt_count int DEFAULT 0,
        detected_at timestamptz,
        source_ref text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure tiger_incidents table: ${message}`);
  }
}

// pulk 레포 루트(레지스트리 pulk-relative repo_path 절대화용). l5-core require와 동일 베이스.
const TIGER_PULK_ROOT =
  process.env.L5_PULK_ROOT ?? path.resolve(__dirname, '../../../../../../..');

// cardToProposal의 current_process 포맷에서 구조 필드를 복원(UI 카드 매핑용).
function parseTigerProcess(cp: string): {
  executive?: string;
  target_id?: string;
  repo_path?: string;
  root_cause?: string;
  risk_level?: string;
} {
  const m = (cp || '').match(
    /^\[호랑이 자가개선\]\s*(\S+)\s*\/\s*(\S+)\s*\((.+?)\)\.\s*근본원인:\s*(.*?)\.\s*위험도\s*(D\d)/,
  );
  if (!m) return {};
  return { executive: m[1], target_id: m[2], repo_path: m[3], root_cause: m[4], risk_level: m[5] };
}

// 🐯 자가개선 surface: status=proposed인 Tiger proposal → founder-ui SelfImproveCard.
async function selfImproveCards(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const { status } = requestValues(ctx) as { status?: string };
  const whereStatus = status && status !== 'all' ? `AND status = :status` : `AND status = 'proposed'`;
  const rows = (await db.sequelize.query(
    `SELECT * FROM workflow_improvement_proposals
       WHERE suggested_by_agent_id = 'Tiger' ${whereStatus}
       ORDER BY "createdAt" DESC`,
    {
      replacements: status && status !== 'all' ? { status } : {},
      type: db.sequelize.QueryTypes.SELECT,
    },
  )) as any[];

  ctx.body = {
    ok: true,
    data: rows.map((p: any) => {
      const parsed = parseTigerProcess(p.current_process);
      const targetId = decodeTargetRef(p.source_ref) ?? parsed.target_id ?? null;
      const entry = targetId ? getImprovementTarget(targetId) : undefined;
      const targetRepo = entry ? resolveRepoAbsPath(entry, TIGER_PULK_ROOT) : parsed.repo_path ?? '';
      const targetRepoLabel = entry
        ? entry.repo_path_kind === 'pulk-relative'
          ? `pulk · ${entry.repo_path}`
          : entry.repo_path
        : parsed.repo_path ?? '';
      return {
        proposal_id: String(p.id),
        executive: entry?.owner ?? parsed.executive ?? '',
        tool_label: entry?.tool ?? targetId ?? '',
        problem: p.identified_bottleneck ?? '',
        root_cause: parsed.root_cause ?? null,
        proposed_fix: p.proposed_improvement ?? '',
        effort_estimate: p.effort_to_implement ?? null,
        target_repo: targetRepo,
        target_repo_label: targetRepoLabel,
        risk_level: parsed.risk_level === 'D2' ? 'D2' : 'D1',
        source: 'log_adapter',
        self_mod_status: p.status === 'approved' ? 'sent' : null,
        created_at: p.createdAt ?? p.created_at,
      };
    }),
  };
}

// 일괄 승인: 선택 proposal을 status=approved로 마킹 → tiger-dispatch-loop(매시)가 집어
// repo별 병렬 코딩. intent 게이트 1차(보호영역 시사면 rejected + blocked 회수).
async function bulkApproveSelfImprove(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const { items } = requestValues(ctx) as {
    items?: Array<{ proposal_id: string; target_repo?: string }>;
  };
  const list = Array.isArray(items) ? items : [];
  const repo = db.getRepository('workflow_improvement_proposals');
  const dispatched: Array<{ proposal_id: string; self_mod_task_id: string; status: string }> = [];
  const blocked: Array<{ proposal_id: string; reason: string; denied_by?: string }> = [];

  for (const it of list) {
    const id = it?.proposal_id;
    if (!id) continue;
    const p = await repo.findOne({ filter: { id } });
    if (!p) {
      blocked.push({ proposal_id: String(id), reason: 'not found' });
      continue;
    }
    const intent = checkSelfModIntentForbidden(
      `${p.identified_bottleneck ?? ''} ${p.proposed_improvement ?? ''}`,
    );
    if (intent.forbidden) {
      await repo.update({ filter: { id }, values: { status: 'rejected', updated_at: new Date() } });
      blocked.push({ proposal_id: String(id), reason: intent.reason, denied_by: intent.pattern });
      continue;
    }
    await repo.update({
      filter: { id },
      values: { status: 'approved', updatedAt: new Date(), updated_at: new Date() },
    });
    dispatched.push({ proposal_id: String(id), self_mod_task_id: '', status: 'sent' });
  }
  ctx.body = { ok: true, data: { dispatched, blocked } };
}

// 🔔 실시간 장애 surface: 미해결(resolved/escalated 제외) tiger_incidents → 벨 배지 + 장애 목록.
// status 쿼리로 필터 가능(all=전체). 최신 detected 우선.
async function incidents(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const rawQuery = (ctx as any).request?.query ?? (ctx as any).query ?? {};
  const status = rawQuery['status'] ? String(rawQuery['status']) : undefined;
  const whereStatus =
    status && status !== 'all'
      ? `WHERE status = :status`
      : `WHERE status NOT IN ('resolved', 'escalated')`;
  const rows = (await db.sequelize.query(
    `SELECT * FROM tiger_incidents ${whereStatus}
       ORDER BY COALESCE(detected_at, "createdAt") DESC`,
    {
      replacements: status && status !== 'all' ? { status } : {},
      type: db.sequelize.QueryTypes.SELECT,
    },
  )) as any[];

  ctx.body = {
    ok: true,
    data: rows.map((r: any) => ({
      id: String(r.id),
      task_ref: r.task_ref ?? null,
      task_label: r.task_label ?? null,
      incident_type: r.incident_type ?? null,
      error_summary: r.error_summary ?? null,
      diagnosis: r.diagnosis ?? null,
      proposed_fix: r.proposed_fix ?? null,
      target_repo: r.target_repo ?? null,
      status: r.status ?? 'detected',
      attempt_count: r.attempt_count ?? 0,
      detected_at: r.detected_at ?? r.createdAt ?? r.created_at ?? null,
      source_ref: r.source_ref ?? null,
    })),
  };
}

// 장애 수정 승인 게이트: status=detected인 장애를 approved로 전환 → reactive 루프가
// 집어 CTO 수정 dispatch. 승인 전 코딩 금지(안전 게이트)이므로 여기서만 approved로 올린다.
async function approveIncidentFix(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const { id } = requestValues(ctx) as { id?: string };
  if (!id) {
    (ctx as any).status = 400;
    ctx.body = { ok: false, error: 'id is required' };
    return;
  }
  const repo = db.getRepository('tiger_incidents');
  const incident = await repo.findOne({ filter: { id } });
  if (!incident) {
    (ctx as any).status = 404;
    ctx.body = { ok: false, error: 'incident not found' };
    return;
  }
  // detected에서만 승인 가능(이미 진행/완료된 건 멱등 무시).
  if (incident.status !== 'detected') {
    ctx.body = { ok: true, data: { id: String(id), status: incident.status, changed: false } };
    return;
  }
  await repo.update({
    filter: { id },
    values: { status: 'approved', updatedAt: new Date(), updated_at: new Date() },
  });
  ctx.body = { ok: true, data: { id: String(id), status: 'approved', changed: true } };
}

export default class PluginExecutiveMonitorServer extends Plugin {
  async load() {
    this.app.logger.info('PluginExecutiveMonitorServer loaded');
    registerFounderMemoryCollection(this.db);
    registerNativePhaseRunsCollection(this.db);
    await ensureNativePhaseRunsTable(this.db);
    registerTigerCollections(this.db);
    await ensureTigerTables(this.db);
    registerTigerIncidentsCollection(this.db);
    await ensureTigerIncidentsTable(this.db);
    await ensureBusinessIdIndex(this.db);
    await ensureCurationColumns(this.db);
    startHermesScheduler(this.db, this.app.logger);

    this.app.on('beforeStop', async () => {
      this.app.logger.info('PluginExecutiveMonitorServer cleaning up beforeStop');
      stopHermesScheduler(this.app.logger);
    });

    this.app.resourcer.define({
      name: 'monitor',
      actions: {
        currentTasks: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await currentTasks(ctx);
          await next();
        },
        selfImproveCards: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await selfImproveCards(ctx);
          await next();
        },
        bulkApproveSelfImprove: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await bulkApproveSelfImprove(ctx);
          await next();
        },
        blockedTasks: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await blockedTasks(ctx);
          await next();
        },
        approvalQueue: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await approvalQueue(ctx);
          await next();
        },
        approveTask: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await approveTask(ctx);
          await next();
        },
        rejectTask: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await rejectTask(ctx);
          await next();
        },
        memoryCandidates: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await memoryCandidates(ctx);
          await next();
        },
        saveMemory: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await updateMemoryStatus(ctx, 'saved');
          await next();
        },
        discardMemory: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await updateMemoryStatus(ctx, 'discarded');
          await next();
        },
        toolRequests: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await toolRequests(ctx);
          await next();
        },
        projectTimeline: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await projectTimeline(ctx);
          await next();
        },
        liveStatus: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await liveStatus(ctx);
          await next();
        },
        nativeRuns: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await nativePhaseRuns(ctx);
          await next();
        },
        curate: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await curateSweep(ctx);
          await next();
        },
        curationSummary: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await curationSummary(ctx);
          await next();
        },
        overrideCuration: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await overrideCuration(ctx);
          await next();
        },
        controlRoomTree: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await controlRoomTree(ctx);
          await next();
        },
        sendToCTO: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await sendToCTO(ctx);
          await next();
        },
        applySelfMod: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await applySelfMod(ctx);
          await next();
        },
        rollbackSelfMod: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await rollbackSelfMod(ctx);
          await next();
        },
        retryRun: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await retryRun(ctx);
          await next();
        },
        incidents: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await incidents(ctx);
          await next();
        },
        approveIncidentFix: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await approveIncidentFix(ctx);
          await next();
        },
      },
    });

    this.app.resourcer.define({
      name: 'roadmap',
      actions: {
        list: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await roadmapList(ctx);
          await next();
        },
      },
    });

    this.app.resourcer.define({
      name: 'discovery',
      actions: {
        today: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await discoveryToday(ctx);
          await next();
        },
      },
    });

    this.app.resourcer.define({
      name: 'bpr',
      actions: {
        currentPhase: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await currentPhase(ctx);
          await next();
        },
        requestTransition: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await requestTransition(ctx);
          await next();
        },
        transitionSummary: async (ctx: MonitorContext, next: () => Promise<void>) => {
          await transitionSummary(ctx);
          await next();
        },
      },
    });

    registerGetRoute(this.app, '/api/monitor/currentTasks', currentTasks);
    registerGetRoute(this.app, '/api/monitor/blockedTasks', blockedTasks);
    registerGetRoute(this.app, '/api/monitor/approvalQueue', approvalQueue);
    registerGetRoute(this.app, '/api/monitor/liveStatus', liveStatus);
    registerGetRoute(this.app, '/api/monitor/nativeRuns', nativePhaseRuns);
    registerGetRoute(this.app, '/api/monitor/controlRoomTree', controlRoomTree);
    registerGetRoute(this.app, '/api/monitor/incidents', incidents);

    this.app.acl.allow('monitor', [
      'currentTasks',
      'blockedTasks',
      'approvalQueue',
      'approveTask',
      'rejectTask',
      'memoryCandidates',
      'saveMemory',
      'discardMemory',
      'toolRequests',
      'projectTimeline',
      'liveStatus',
      'curate',
      'curationSummary',
      'overrideCuration',
      'controlRoomTree',
      'nativeRuns',
      'sendToCTO',
      'applySelfMod',
      'rollbackSelfMod',
      'retryRun',
      'selfImproveCards',
      'bulkApproveSelfImprove',
      'incidents',
      'approveIncidentFix',
    ], 'loggedIn');
    // 데몬이 native_phase_runs를 표준 REST(:create/:update/:list)로 기록·조회.
    this.app.acl.allow('native_phase_runs', ['create', 'update', 'list', 'get'], 'loggedIn');
    // night-bpr-loop가 호랑이 카드를 표준 REST로 적재/조회/갱신.
    this.app.acl.allow('workflow_improvement_proposals', ['create', 'update', 'list', 'get'], 'loggedIn');
    this.app.acl.allow('bpr_logs', ['create', 'update', 'list', 'get'], 'loggedIn');
    // reactive 감시 루프가 tiger_incidents를 표준 REST로 적재/갱신/조회.
    this.app.acl.allow('tiger_incidents', ['create', 'update', 'list', 'get'], 'loggedIn');
    this.app.acl.allow('memory_entries', ['create', 'update', 'list', 'get'], 'loggedIn');
    this.app.acl.allow('roadmap', ['list'], 'loggedIn');
    this.app.acl.allow('discovery', ['today'], 'loggedIn');
    this.app.acl.allow('bpr', ['currentPhase', 'requestTransition', 'transitionSummary'], 'loggedIn');

    registerHermesResource(this.app, this.db);
    this.app.acl.allow('hermes', ['taskSummary', 'createTask', 'saveInsight'], 'public');
  }

  async install() {}
  async afterEnable() {}
  async afterDisable() {
    this.app.logger.info('PluginExecutiveMonitorServer disabled, stopping scheduler');
    stopHermesScheduler(this.app.logger);
  }
  async remove() {}
}

