import { randomUUID } from 'crypto';
import path from 'path';
import { defineCollection } from '@nocobase/database';
import { Plugin } from '@nocobase/server';
import { startHermesScheduler, stopHermesScheduler } from './hermes-scheduler';

const {
  derivePhaseFromTasks,
  buildTransitionResult,
  buildPhaseTransitionSummary,
  BPR_PHASE_ORDER,
  BPR_PHASE_LABELS,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/bpr'));

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

async function currentTasks(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const tasks = await db.getRepository('agent_tasks').find({
    filter: { status: { $notIn: ['done', 'killed'] } },
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

async function blockedTasks(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const tasks = await db.getRepository('agent_tasks').find({
    filter: { status: 'blocked' },
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
  const tasks = await db.getRepository('agent_tasks').find({
    filter: { approval_required: true, status: { $notIn: ['done', 'killed'] } },
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
    `SELECT id, title, status, phase, business_id, updated_at, created_at
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

  // Use raw query to filter by source_ref prefix (repetition-pattern:*)
  const whereStatus = status && status !== 'all' ? `AND status = :status` : '';
  const tasks = await db.sequelize.query(
    `SELECT * FROM agent_tasks
     WHERE assigned_agent = 'CTO'
       AND source_ref LIKE 'repetition-pattern:%'
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
  }
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
            approval_required: ['D4', 'D5'].includes(risk_level ?? ''),
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
    ],
  }));
}

export default class PluginExecutiveMonitorServer extends Plugin {
  async load() {
    this.app.logger.info('PluginExecutiveMonitorServer loaded');
    registerFounderMemoryCollection(this.db);
    await ensureBusinessIdIndex(this.db);
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

