import type {
  FounderInstruction,
  CEOInterpretation,
  AgentTask,
  AgentHandoff,
} from '@l5/core';

// Minimal NocoBase context/next types to avoid external type dependency
type Context = {
  db: any;
  request: { body: any };
  body: any;
  throw: (status: number, msg: string) => never;
  action: { params: any };
};
type Next = () => Promise<void>;

export async function createInstruction(ctx: Context, next: Next) {
  const { raw_text, source = 'manual', intent, constraints, requested_phase } = ctx.request.body as Partial<FounderInstruction>;

  if (!raw_text) {
    ctx.throw(400, 'raw_text is required');
  }

  const repo = ctx.db.getRepository('founder_instructions');
  const record = await repo.create({
    values: { raw_text, source, intent, constraints: constraints ?? [], requested_phase, status: 'new' },
  });

  ctx.body = record;
  await next();
}

export async function createInterpretation(ctx: Context, next: Next) {
  const { instruction_id, goal, assumptions, phase, success_criteria, risk_level, approval_required } =
    ctx.request.body as Partial<CEOInterpretation>;

  if (!instruction_id || !goal || !phase) {
    ctx.throw(400, 'instruction_id, goal, and phase are required');
  }

  const repo = ctx.db.getRepository('ceo_interpretations');
  const record = await repo.create({
    values: {
      instruction_id,
      goal,
      assumptions: assumptions ?? [],
      phase,
      success_criteria: success_criteria ?? [],
      risk_level: risk_level ?? 'D1',
      approval_required: approval_required ?? false,
    },
  });

  await ctx.db.getRepository('founder_instructions').update({
    filter: { id: instruction_id },
    values: { status: 'interpreted' },
  });

  ctx.body = record;
  await next();
}

export async function createTask(ctx: Context, next: Next) {
  const { instruction_id, interpretation_id, assigned_agent, title, rationale, expected_output, approval_required, due_at } =
    ctx.request.body as Partial<AgentTask>;

  if (!instruction_id || !assigned_agent || !title || !rationale || !expected_output) {
    ctx.throw(400, 'instruction_id, assigned_agent, title, rationale, and expected_output are required');
  }

  const repo = ctx.db.getRepository('agent_tasks');
  const record = await repo.create({
    values: {
      instruction_id,
      interpretation_id,
      assigned_agent,
      title,
      rationale,
      expected_output,
      status: 'queued',
      approval_required: approval_required ?? false,
      due_at,
    },
  });

  ctx.body = record;
  await next();
}

export async function updateTaskStatus(ctx: Context, next: Next) {
  const { id } = ctx.action.params;
  const { status, blocker } = ctx.request.body as { status: AgentTask['status']; blocker?: string };

  const validStatuses = ['queued', 'running', 'blocked', 'needs_review', 'done', 'killed'];
  if (!validStatuses.includes(status)) {
    ctx.throw(400, `status must be one of: ${validStatuses.join(', ')}`);
  }

  const repo = ctx.db.getRepository('agent_tasks');
  await repo.update({
    filter: { id },
    values: { status, blocker },
  });

  ctx.body = await repo.findOne({ filter: { id } });
  await next();
}

export async function createHandoff(ctx: Context, next: Next) {
  const { task_id, from_agent, to_agent, context, next_action, blocker, approval_required } =
    ctx.request.body as Partial<AgentHandoff>;

  if (!task_id || !from_agent || !context || !next_action) {
    ctx.throw(400, 'task_id, from_agent, context, and next_action are required');
  }

  const repo = ctx.db.getRepository('agent_handoffs');
  const record = await repo.create({
    values: {
      task_id,
      from_agent,
      to_agent,
      context,
      next_action,
      blocker,
      approval_required: approval_required ?? false,
    },
  });

  ctx.body = record;
  await next();
}

export async function listByTaskId(ctx: Context, next: Next) {
  const { task_id } = ctx.action.params;
  const repo = ctx.db.getRepository('agent_handoffs');
  ctx.body = await repo.find({ filter: { task_id } });
  await next();
}

export async function listTasksByAgent(ctx: Context, next: Next) {
  const { agent } = ctx.action.params;
  const repo = ctx.db.getRepository('agent_tasks');
  ctx.body = await repo.find({ filter: { assigned_agent: agent } });
  await next();
}

export async function listTasksByStatus(ctx: Context, next: Next) {
  const { status } = ctx.action.params;
  const repo = ctx.db.getRepository('agent_tasks');
  ctx.body = await repo.find({ filter: { status } });
  await next();
}
