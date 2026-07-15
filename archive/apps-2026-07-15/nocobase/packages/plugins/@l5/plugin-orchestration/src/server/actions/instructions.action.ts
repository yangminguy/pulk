import type {
  FounderInstruction,
  CEOInterpretation,
  AgentTask,
  AgentHandoff,
  LLMClient,
} from '@l5/core';
import {
  assignExecutiveTasks,
  createOpenAIClient,
  decomposeIntoWorkstreams,
  interpretFounderInstruction,
  generateWorkflow,
} from '@l5/core';
import { randomUUID } from 'crypto';

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
  const { raw_text, source = 'manual', intent, constraints, requested_phase } = getValues(ctx) as Partial<FounderInstruction>;

  if (!raw_text) {
    ctx.throw(400, 'raw_text is required');
  }

  const repo = ctx.db.getRepository('founder_instructions');
  const record = await repo.create({
    values: { id: randomUUID(), raw_text, source, intent, constraints: constraints ?? [], requested_phase, status: 'new' },
  });

  ctx.body = record;
  await next();
}

export async function createInterpretation(ctx: Context, next: Next) {
  const { instruction_id, goal, assumptions, phase, success_criteria, risk_level, approval_required } =
    getValues(ctx) as Partial<CEOInterpretation>;

  if (!instruction_id || !goal || !phase) {
    ctx.throw(400, 'instruction_id, goal, and phase are required');
  }

  const repo = ctx.db.getRepository('ceo_interpretations');
  const record = await repo.create({
    values: {
      id: randomUUID(),
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
  const { instruction_id, interpretation_id, assigned_agent, title, rationale, expected_output, approval_required, due_at, risk_level, phase, source_ref } =
    getValues(ctx) as Partial<AgentTask> & { phase?: string; source_ref?: string };

  if (!instruction_id || !assigned_agent || !title || !rationale || !expected_output) {
    ctx.throw(400, 'instruction_id, assigned_agent, title, rationale, and expected_output are required');
  }

  const repo = ctx.db.getRepository('agent_tasks');
  const record = await repo.create({
    values: {
      id: randomUUID(),
      instruction_id,
      interpretation_id,
      assigned_agent,
      title,
      rationale,
      expected_output,
      status: 'queued',
      approval_required: approval_required ?? false,
      risk_level,
      phase,
      source_ref,
      due_at,
    },
  });

  ctx.body = record;
  await next();
}

export async function updateTaskStatus(ctx: Context, next: Next) {
  const { id } = ctx.action.params;
  const { status, blocker } = getValues(ctx) as { status: AgentTask['status']; blocker?: string };

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
    getValues(ctx) as Partial<AgentHandoff>;

  if (!task_id || !from_agent || !context || !next_action) {
    ctx.throw(400, 'task_id, from_agent, context, and next_action are required');
  }

  const repo = ctx.db.getRepository('agent_handoffs');
  const record = await repo.create({
    values: {
      id: randomUUID(),
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

export async function submitChatInstruction(ctx: Context, next: Next) {
  const values = getValues(ctx);
  const { raw_text, intent, constraints, requested_phase } = values as Partial<FounderInstruction>;

  if (!raw_text || typeof raw_text !== 'string') {
    ctx.throw(400, 'raw_text is required');
  }

  const instructionRepo = ctx.db.getRepository('founder_instructions');
  const interpretationRepo = ctx.db.getRepository('ceo_interpretations');
  const taskRepo = ctx.db.getRepository('agent_tasks');

  const now = new Date().toISOString();
  const instruction: FounderInstruction = {
    id: randomUUID(),
    raw_text,
    source: 'chat',
    intent,
    constraints: constraints ?? [],
    requested_phase,
    status: 'new',
    created_at: now,
  };

  const instructionRecord = await instructionRepo.create({
    values: instruction,
  });

  const savedMemories: any[] = await ctx.db
    .getRepository('founder_memory')
    .find({ filter: { approval_status: 'saved' }, sort: ['-createdAt'], limit: 10 })
    .catch(() => []);
  const memories = savedMemories.map((m: any) => ({
    insight: m.insight as string,
    workflow_improvement: m.workflow_improvement as string | undefined,
    phase: m.phase as string | undefined,
  }));

  const interpretationDraft = await interpretFounderInstruction(instruction, {
    llm: buildLLMClient(raw_text),
    now: () => new Date(now),
    idGenerator: randomUUID,
    memories: memories.length > 0 ? memories : undefined,
  });

  const interpretation: CEOInterpretation = {
    ...interpretationDraft,
    id: randomUUID(),
  };

  const interpretationRecord = await interpretationRepo.create({
    values: interpretation,
  });

  await instructionRepo.update({
    filter: { id: instruction.id },
    values: { status: 'interpreted' },
  });

  const workstreams = await decomposeIntoWorkstreams(interpretation, {
    idGenerator: () => randomUUID(),
    llm: buildLLMClient(raw_text),
  });
  const tasks = assignExecutiveTasks(workstreams, {
    now: () => new Date(now),
    idGenerator: randomUUID,
  });

  const taskRecords = [];
  for (const task of tasks) {
    taskRecords.push(await taskRepo.create({ values: task }));
  }

  ctx.body = {
    ok: true,
    instruction_id: instruction.id,
    interpretation: interpretationRecord,
    tasks: taskRecords,
    data: {
      instruction: instructionRecord,
      interpretation: interpretationRecord,
      tasks: taskRecords,
      monitor_paths: {
        current_tasks: '/api/monitor:currentTasks',
        approval_queue: '/api/monitor:approvalQueue',
      },
    },
  };
  await next();
}

function getValues(ctx: Context): Record<string, unknown> {
  return ctx.action?.params?.values ?? ctx.request?.body ?? {};
}

function buildLLMClient(rawText: string): LLMClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    return createOpenAIClient({ apiKey });
  }
  return buildDeterministicLLM(rawText);
}

function buildDeterministicLLM(rawText: string): LLMClient {
  return {
    async complete() {
      const external = /(send|publish|customer|client|lead|outreach|proposal|pricing|launch)/i.test(rawText);
      const tool = /(tool|build|automation|integration|api|engineering|stack)/i.test(rawText);
      const pmf = /(pmf|market|demand|experiment|waitlist|survey|interview|message|content|landing)/i.test(rawText);
      const finance = /(budget|cost|pricing|payment|invoice|subscription)/i.test(rawText);
      const risk = /(risk|legal|privacy|pii|security|compliance|consent)/i.test(rawText);

      return JSON.stringify({
        goal: rawText.trim(),
        phase: tool
          ? 'execution_system_build'
          : pmf
            ? 'market_pmf_diagnosis'
            : 'direction_alignment',
        assumptions: [
          'Founder submitted this instruction through CEO chat v1.',
          'NocoBase is the internal source of truth for task, approval, and monitor records.',
        ],
        success_criteria: [
          'Persist the original Founder instruction.',
          'Create CEO interpretation and executable AgentTask records.',
          external
            ? 'Route external-facing work through an approval gate before send or publish.'
            : 'Keep execution internal until a later approval gate is required.',
        ],
        risk_level: risk || finance ? 'D4' : external ? 'D3' : 'D2',
        approval_required: external || risk || finance,
      });
    },
  };
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

export async function generateWorkflowAction(ctx: Context, next: Next) {
  const { business_idea, founder_context, memory_context } = getValues(ctx) as {
    business_idea?: string;
    founder_context?: string;
    memory_context?: string;
  };

  if (!business_idea || typeof business_idea !== 'string') {
    ctx.throw(400, 'business_idea is required');
  }

  const result = generateWorkflow({
    business_idea,
    founder_context,
    memory_context,
  });

  ctx.body = result;
  await next();
}
