'use strict';

const { randomUUID } = require('crypto');
const { defineCollection } = require('@nocobase/database');
const { Plugin } = require('@nocobase/server');
const {
  assignExecutiveTasks,
  decomposeIntoWorkstreams,
  interpretFounderInstruction,
} = require('../../../../../../packages/l5-core/dist/functions/ceo-orchestration');

class PluginOrchestrationServer extends Plugin {
  async load() {
    this.app.logger.info('PluginOrchestrationServer loaded');

    await ensureOrchestrationColumns(this.db);
    registerCollections(this.db);
    registerChatResource(this.app, this.db);
    registerCrudResources(this.app);

    this.app.acl.allow('chat', ['submitInstruction', 'approvePlan'], 'loggedIn');
    this.app.acl.allow('founder_instructions', '*', 'loggedIn');
    this.app.acl.allow('ceo_interpretations', '*', 'loggedIn');
    this.app.acl.allow('agent_tasks', '*', 'loggedIn');
    this.app.acl.allow('agent_handoffs', '*', 'loggedIn');
  }

  async install() {}
  async afterEnable() {}
  async afterDisable() {}
  async remove() {}
}

async function ensureOrchestrationColumns(db) {
  try {
    await db.sequelize.query(`
      ALTER TABLE IF EXISTS agent_tasks
        ADD COLUMN IF NOT EXISTS risk_level text,
        ADD COLUMN IF NOT EXISTS phase text,
        ADD COLUMN IF NOT EXISTS source_ref text;
    `);
  } catch (error) {
    db.logger?.warn?.(`Could not ensure agent_tasks contract columns: ${error.message}`);
  }
}

function registerCollections(db) {
  db.collection(defineCollection({
    name: 'founder_instructions',
    title: 'Founder Instructions',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'raw_text', type: 'text', allowNull: false },
      { name: 'source', type: 'string', allowNull: false, defaultValue: 'manual' },
      { name: 'intent', type: 'text' },
      { name: 'constraints', type: 'json', defaultValue: [] },
      { name: 'requested_phase', type: 'string' },
      { name: 'status', type: 'string', allowNull: false, defaultValue: 'new' },
    ],
  }));

  db.collection(defineCollection({
    name: 'ceo_interpretations',
    title: 'CEO Interpretations',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'instruction_id', type: 'uuid', allowNull: false },
      { name: 'goal', type: 'text', allowNull: false },
      { name: 'assumptions', type: 'json', defaultValue: [] },
      { name: 'phase', type: 'string', allowNull: false },
      { name: 'success_criteria', type: 'json', defaultValue: [] },
      { name: 'risk_level', type: 'string', allowNull: false, defaultValue: 'D1' },
      { name: 'approval_required', type: 'boolean', defaultValue: false },
    ],
  }));

  db.collection(defineCollection({
    name: 'agent_tasks',
    title: 'Agent Tasks',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'instruction_id', type: 'uuid', allowNull: false },
      { name: 'interpretation_id', type: 'uuid' },
      { name: 'assigned_agent', type: 'string', allowNull: false },
      { name: 'title', type: 'string', allowNull: false },
      { name: 'rationale', type: 'text', allowNull: false },
      { name: 'expected_output', type: 'text', allowNull: false },
      { name: 'status', type: 'string', allowNull: false, defaultValue: 'queued' },
      { name: 'approval_required', type: 'boolean', defaultValue: false },
      { name: 'risk_level', type: 'string' },
      { name: 'phase', type: 'string' },
      { name: 'source_ref', type: 'string' },
      { name: 'blocker', type: 'text' },
      { name: 'due_at', type: 'date' },
    ],
  }));

  db.collection(defineCollection({
    name: 'agent_handoffs',
    title: 'Agent Handoffs',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'task_id', type: 'uuid', allowNull: false },
      { name: 'from_agent', type: 'string', allowNull: false },
      { name: 'to_agent', type: 'string' },
      { name: 'context', type: 'text', allowNull: false },
      { name: 'next_action', type: 'text', allowNull: false },
      { name: 'blocker', type: 'text' },
      { name: 'approval_required', type: 'boolean', defaultValue: false },
    ],
  }));
}

function registerChatResource(app, db) {
  app.resourcer.define({
    name: 'chat',
    actions: {
      submitInstruction: async (ctx, next) => {
        const { raw_text, intent, constraints, requested_phase } = getValues(ctx);
        if (!raw_text || typeof raw_text !== 'string') ctx.throw(400, 'raw_text is required');

        const instructionRepo = db.getRepository('founder_instructions');
        const interpretationRepo = db.getRepository('ceo_interpretations');
        const taskRepo = db.getRepository('agent_tasks');
        const now = new Date().toISOString();

        const instruction = {
          id: randomUUID(),
          raw_text,
          source: 'chat',
          intent,
          constraints: constraints ?? [],
          requested_phase,
          status: 'new',
          created_at: now,
        };
        const instructionRecord = await instructionRepo.create({ values: instruction });

        const interpretationDraft = await interpretFounderInstruction(instruction, {
          llm: buildDeterministicLLM(raw_text),
          now: () => new Date(now),
          idGenerator: randomUUID,
        });
        const interpretation = { ...interpretationDraft, id: randomUUID() };
        const interpretationRecord = await interpretationRepo.create({ values: interpretation });

        await instructionRepo.update({
          filter: { id: instruction.id },
          values: { status: 'interpreted' },
        });

        const workstreams = decomposeIntoWorkstreams(interpretation, {
          idGenerator: () => randomUUID(),
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
      },

      approvePlan: async (ctx, next) => {
        const { instruction_id } = getValues(ctx);
        if (!instruction_id) ctx.throw(400, 'instruction_id is required');

        const taskRepo = ctx.db.getRepository('agent_tasks');
        const tasks = await taskRepo.find({ filter: { instruction_id, status: 'queued' } });

        let approved_count = 0;
        for (const task of tasks) {
          await taskRepo.update({
            filterByTk: task.id,
            values: { status: 'queued' },
          });
          approved_count++;
        }

        ctx.body = { ok: true, data: { instruction_id, approved_count } };
        await next();
      },
    },
  });
}

function registerCrudResources(app) {
  app.resourcer.define({
    name: 'founder_instructions',
    actions: {
      create: async (ctx, next) => {
        const { raw_text, source = 'manual', intent, constraints, requested_phase } = getValues(ctx);
        if (!raw_text) ctx.throw(400, 'raw_text is required');
        ctx.body = await ctx.db.getRepository('founder_instructions').create({
          values: { id: randomUUID(), raw_text, source, intent, constraints: constraints ?? [], requested_phase, status: 'new' },
        });
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'ceo_interpretations',
    actions: {
      create: async (ctx, next) => {
        const { instruction_id, goal, assumptions, phase, success_criteria, risk_level, approval_required } = getValues(ctx);
        if (!instruction_id || !goal || !phase) ctx.throw(400, 'instruction_id, goal, and phase are required');
        ctx.body = await ctx.db.getRepository('ceo_interpretations').create({
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
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'agent_tasks',
    actions: {
      create: async (ctx, next) => {
        const { instruction_id, interpretation_id, assigned_agent, title, rationale, expected_output, approval_required, risk_level, phase, source_ref, due_at } = getValues(ctx);
        if (!instruction_id || !assigned_agent || !title || !rationale || !expected_output) {
          ctx.throw(400, 'instruction_id, assigned_agent, title, rationale, and expected_output are required');
        }
        ctx.body = await ctx.db.getRepository('agent_tasks').create({
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
        await next();
      },
      updateStatus: async (ctx, next) => {
        const { filterByTk } = ctx.action.params;
        const { status, blocker } = getValues(ctx);
        const valid = ['queued', 'running', 'blocked', 'needs_review', 'done', 'killed'];
        if (!valid.includes(status)) ctx.throw(400, `status must be one of: ${valid.join(', ')}`);
        await ctx.db.getRepository('agent_tasks').update({ filterByTk, values: { status, blocker } });
        ctx.body = await ctx.db.getRepository('agent_tasks').findOne({ filter: { id: filterByTk } });
        await next();
      },
      listByAgent: async (ctx, next) => {
        const { agent } = ctx.action.params;
        ctx.body = await ctx.db.getRepository('agent_tasks').find({ filter: { assigned_agent: agent } });
        await next();
      },
      listByStatus: async (ctx, next) => {
        const { status } = ctx.action.params;
        ctx.body = await ctx.db.getRepository('agent_tasks').find({ filter: { status } });
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'agent_handoffs',
    actions: {
      create: async (ctx, next) => {
        const { task_id, from_agent, to_agent, context, next_action, blocker, approval_required } = getValues(ctx);
        if (!task_id || !from_agent || !context || !next_action) {
          ctx.throw(400, 'task_id, from_agent, context, and next_action are required');
        }
        ctx.body = await ctx.db.getRepository('agent_handoffs').create({
          values: { id: randomUUID(), task_id, from_agent, to_agent, context, next_action, blocker, approval_required: approval_required ?? false },
        });
        await next();
      },
      listByTaskId: async (ctx, next) => {
        const { task_id } = ctx.action.params;
        ctx.body = await ctx.db.getRepository('agent_handoffs').find({ filter: { task_id } });
        await next();
      },
    },
  });
}

function getValues(ctx) {
  return ctx.action?.params?.values ?? ctx.request?.body ?? {};
}

function buildDeterministicLLM(rawText) {
  return {
    async complete() {
      const external = /(send|publish|customer|client|lead|outreach|proposal|pricing|launch)/i.test(rawText);
      const tool = /(tool|build|automation|integration|api|engineering|stack)/i.test(rawText);
      const pmf = /(pmf|market|demand|experiment|waitlist|survey|interview|message|content|landing)/i.test(rawText);
      const finance = /(budget|cost|pricing|payment|invoice|subscription)/i.test(rawText);
      const risk = /(risk|legal|privacy|pii|security|compliance|consent)/i.test(rawText);

      return JSON.stringify({
        goal: rawText.trim(),
        phase: tool ? 'execution_system_build' : pmf ? 'market_pmf_diagnosis' : 'direction_alignment',
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

module.exports = PluginOrchestrationServer;
module.exports.default = PluginOrchestrationServer;
