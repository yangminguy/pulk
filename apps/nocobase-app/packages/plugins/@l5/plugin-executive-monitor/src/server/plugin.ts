import { randomUUID } from 'crypto';
import path from 'path';
import { Plugin } from '@nocobase/server';

const {
  derivePhaseFromTasks,
  buildTransitionResult,
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
      sort: ['-created_at'],
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
        created_at: row.created_at,
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
    await repo.update({
      filter: { source_task_id },
      values: { approval_status, updated_at: new Date() },
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

function registerGetRoute(app: any, path: string, handler: (ctx: MonitorContext) => Promise<void>) {
  app.use(async (ctx: MonitorContext, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.path !== path) {
      return next();
    }

    await handler(ctx);
  });
}

export default class PluginExecutiveMonitorServer extends Plugin {
  async load() {
    this.app.logger.info('PluginExecutiveMonitorServer loaded');

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
    ], 'loggedIn');
    this.app.acl.allow('bpr', ['currentPhase', 'requestTransition'], 'loggedIn');
  }

  async install() {}
  async afterEnable() {}
  async afterDisable() {}
  async remove() {}
}

