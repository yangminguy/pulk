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

export default class PluginExecutiveMonitorServer extends Plugin {
  async load() {
    this.app.logger.info('PluginExecutiveMonitorServer loaded');
    registerFounderMemoryCollection(this.db);
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
    registerGetRoute(this.app, '/api/monitor/controlRoomTree', controlRoomTree);

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
      'sendToCTO',
      'applySelfMod',
      'rollbackSelfMod',
    ], 'loggedIn');
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

