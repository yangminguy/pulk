import { randomUUID } from 'crypto';
import path from 'path';
import { defineCollection } from '@nocobase/database';
import { Plugin } from '@nocobase/server';

const {
  assignExecutiveTasks,
  decomposeIntoWorkstreams,
  interpretFounderInstruction,
  createOpenAIClient,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/ceo-orchestration'));

const {
  generateWorkflow,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/workflow-factory'));

const {
  executeAgentTask,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/executive-runtime'));

const {
  verifyCTOPhase,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/cto-verification'));

const {
  answerClarifications,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/cto-clarification'));

type ActionContext = {
  app?: any;
  db: any;
  body?: unknown;
  request?: {
    body?: Record<string, unknown>;
  };
  action?: {
    params?: {
      values?: Record<string, unknown>;
      filterByTk?: string;
      agent?: string;
      status?: string;
      task_id?: string;
    };
  };
  throw(status: number, message: string): never;
};

export default class PluginOrchestrationServer extends Plugin {
  async load() {
    this.app.logger.info('PluginOrchestrationServer loaded');

    await ensureOrchestrationColumns(this.db);
    registerCollections(this.db);
    registerChatResource(this.app, this.db);
    registerCrudResources(this.app);

    this.app.acl.allow('chat', ['submitInstruction', 'generateWorkflow', 'approvePlan'], 'loggedIn');
    this.app.acl.allow('agent', ['executeTask', 'taskCallback'], 'loggedIn');
    this.app.acl.allow('acr', ['approvalCallback'], 'loggedIn');
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

async function ensureOrchestrationColumns(db: any) {
  const dialect = db.sequelize?.getDialect?.();
  if (dialect === 'sqlite') return;

  try {
    await db.sequelize.query(`
      ALTER TABLE IF EXISTS agent_tasks
        ADD COLUMN IF NOT EXISTS risk_level text,
        ADD COLUMN IF NOT EXISTS phase text,
        ADD COLUMN IF NOT EXISTS source_ref text,
        ADD COLUMN IF NOT EXISTS acr_token text;
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure agent_tasks contract columns: ${message}`);
  }
}

function registerCollections(db: any) {
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
      { name: 'acr_token', type: 'string' },
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

function registerChatResource(app: any, db: any) {
  app.resourcer.define({
    name: 'chat',
    actions: {
      submitInstruction: async (ctx: ActionContext, next: () => Promise<void>) => {
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
          constraints: Array.isArray(constraints) ? constraints : [],
          requested_phase,
          status: 'new',
          created_at: now,
        };
        const instructionRecord = await instructionRepo.create({ values: instruction });

        const llm = buildLLMClient(raw_text);
        const interpretationDraft = await interpretFounderInstruction(instruction as any, {
          llm,
          now: () => new Date(now),
          idGenerator: randomUUID,
        });
        const interpretation = { ...interpretationDraft, id: randomUUID() };
        const interpretationRecord = await interpretationRepo.create({ values: interpretation });

        await instructionRepo.update({
          filter: { id: instruction.id },
          values: { status: 'interpreted' },
        });

        const workstreams = await decomposeIntoWorkstreams(interpretation, {
          idGenerator: () => randomUUID(),
          llm,
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

      generateWorkflow: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { idea, current_phase } = getValues(ctx);
        if (!idea || typeof idea !== 'string') ctx.throw(400, 'idea is required');

        const result = generateWorkflow({
          business_idea: idea,
          current_phase: current_phase ?? undefined,
        });

        ctx.body = { ok: true, data: result };
        await next();
      },

      approvePlan: async (ctx: ActionContext, next: () => Promise<void>) => {
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

function registerCrudResources(app: any) {
  app.resourcer.define({
    name: 'founder_instructions',
    actions: {
      create: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { raw_text, source = 'manual', intent, constraints, requested_phase } = getValues(ctx);
        if (!raw_text) ctx.throw(400, 'raw_text is required');
        ctx.body = await ctx.db.getRepository('founder_instructions').create({
          values: {
            id: randomUUID(),
            raw_text,
            source,
            intent,
            constraints: Array.isArray(constraints) ? constraints : [],
            requested_phase,
            status: 'new',
          },
        });
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'ceo_interpretations',
    actions: {
      create: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { instruction_id, goal, assumptions, phase, success_criteria, risk_level, approval_required } = getValues(ctx);
        if (!instruction_id || !goal || !phase) ctx.throw(400, 'instruction_id, goal, and phase are required');
        ctx.body = await ctx.db.getRepository('ceo_interpretations').create({
          values: {
            id: randomUUID(),
            instruction_id,
            goal,
            assumptions: Array.isArray(assumptions) ? assumptions : [],
            phase,
            success_criteria: Array.isArray(success_criteria) ? success_criteria : [],
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
      create: async (ctx: ActionContext, next: () => Promise<void>) => {
        const {
          instruction_id,
          interpretation_id,
          assigned_agent,
          title,
          rationale,
          expected_output,
          approval_required,
          risk_level,
          phase,
          source_ref,
          due_at,
        } = getValues(ctx);
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
      updateStatus: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { filterByTk } = ctx.action?.params ?? {};
        const { status, blocker } = getValues(ctx);
        const valid = ['queued', 'running', 'blocked', 'needs_review', 'done', 'killed'];
        if (typeof status !== 'string' || !valid.includes(status)) {
          ctx.throw(400, `status must be one of: ${valid.join(', ')}`);
        }
        await ctx.db.getRepository('agent_tasks').update({ filterByTk, values: { status, blocker } });
        ctx.body = await ctx.db.getRepository('agent_tasks').findOne({ filter: { id: filterByTk } });
        await next();
      },
      listByAgent: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { agent } = ctx.action?.params ?? {};
        ctx.body = await ctx.db.getRepository('agent_tasks').find({ filter: { assigned_agent: agent } });
        await next();
      },
      listByStatus: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { status } = ctx.action?.params ?? {};
        ctx.body = await ctx.db.getRepository('agent_tasks').find({ filter: { status } });
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'agent_handoffs',
    actions: {
      create: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { task_id, from_agent, to_agent, context, next_action, blocker, approval_required } = getValues(ctx);
        if (!task_id || !from_agent || !context || !next_action) {
          ctx.throw(400, 'task_id, from_agent, context, and next_action are required');
        }
        ctx.body = await ctx.db.getRepository('agent_handoffs').create({
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
        await next();
      },
      listByTaskId: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { task_id } = ctx.action?.params ?? {};
        ctx.body = await ctx.db.getRepository('agent_handoffs').find({ filter: { task_id } });
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'acr',
    actions: {
      approvalCallback: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { token, approved, notes } = getValues(ctx);
        if (!token) ctx.throw(400, 'token is required');

        const taskRepo = ctx.db.getRepository('agent_tasks');
        const tasks = await taskRepo.find({ filter: { acr_token: token } });
        const task = tasks[0];
        if (!task) ctx.throw(404, `No task found for token: ${token}`);

        const newStatus = approved ? 'done' : 'killed';
        await taskRepo.update({
          filterByTk: task.id,
          values: {
            status: newStatus,
            approval_required: false,
            blocker: !approved && notes ? String(notes) : null,
            updated_at: new Date().toISOString(),
          },
        });

        ctx.body = { ok: true, task_id: task.id, new_status: newStatus, token };
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'agent',
    actions: {
      taskCallback: async (ctx: ActionContext, next: () => Promise<void>) => {
        const {
          l5_task_id,
          phase,
          status,
          output_summary,
          next_owner,
          // Phase 16: phase-to-phase context handoff fields
          diff_summary,
          log_tail,
          exit_code,
          branch,
          // Phase 18: clarification + risk reassessment fields
          questions,
          acr_callback_url,
          new_risk_level,
        } = getValues(ctx);
        if (!l5_task_id) ctx.throw(400, 'l5_task_id is required');
        if (!status) ctx.throw(400, 'status is required');

        const taskRepo = ctx.db.getRepository('agent_tasks');
        const task = await taskRepo.findOne({ filter: { id: l5_task_id } });
        if (!task) ctx.throw(404, 'Task not found');

        let updates: Record<string, any> = { updated_at: new Date().toISOString() };

        // Phase 16: compact phase-context line (kept short; full data goes to logs)
        const phaseCtx = [
          phase ? `phase=${phase}` : null,
          branch ? `branch=${branch}` : null,
          exit_code !== undefined && exit_code !== null ? `exit=${exit_code}` : null,
          diff_summary ? `diff_lines=${String(diff_summary).split('\n').length}` : null,
        ].filter(Boolean).join(' ');

        // Phase 17: CTO result verification gate.
        // Only runs for CTO tasks reporting success. Falls back to deterministic
        // mode (no LLM call) — Phase 17.1 will wire OPENAI_API_KEY-gated LLM.
        let verifierVerdict: any = null;
        const shouldVerify =
          (status === 'all_done' || status === 'phase_complete') &&
          task.assigned_agent === 'CTO';
        if (shouldVerify) {
          try {
            const verifierLLM = process.env.OPENAI_API_KEY
              ? buildLLMClient(task.title ?? '')
              : undefined;
            verifierVerdict = await verifyCTOPhase(
              {
                task_title: task.title,
                expected_output: task.expected_output ?? '',
                diff_summary: diff_summary ?? undefined,
                log_tail: log_tail ?? undefined,
                exit_code: typeof exit_code === 'number' ? exit_code : undefined,
              },
              verifierLLM,
            );
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[taskCallback] verifier threw:', err);
          }
        }

        if (status === 'all_done') {
          if (verifierVerdict && verifierVerdict.verdict === 'fail') {
            updates.status = 'needs_review';
            updates.approval_required = true;
            updates.blocker = `verifier:fail ${verifierVerdict.reason}. retry=${verifierVerdict.retry_recommended}. ${phaseCtx}`.trim();
          } else if (verifierVerdict && verifierVerdict.verdict === 'inconclusive') {
            updates.status = 'needs_review';
            updates.approval_required = true;
            updates.blocker = `verifier:inconclusive ${verifierVerdict.reason}. ${phaseCtx}`.trim();
          } else {
            updates.status = 'done';
            if (phaseCtx) updates.blocker = `done. ${phaseCtx}`;
          }
        } else if (status === 'failed') {
          updates.status = 'needs_review';
          updates.approval_required = true;
          updates.blocker = [output_summary, phaseCtx].filter(Boolean).join(' | ');
        } else if (status === 'blocked') {
          updates.status = 'blocked';
          updates.blocker = [output_summary, phaseCtx].filter(Boolean).join(' | ');
        } else if (status === 'phase_complete') {
          updates.blocker = `phase: ${phase} complete. next: ${next_owner || 'pending'}. ${phaseCtx}`.trim();
        } else if (status === 'needs_clarification') {
          // Phase 18: ACR raised clarifying questions. Try headless answer via CTO LLM;
          // escalate to Founder if risk >= D4 or LLM unavailable.
          const qs: string[] = Array.isArray(questions) ? questions.filter((q: unknown) => typeof q === 'string') : [];
          const clarifyLLM = process.env.OPENAI_API_KEY ? buildLLMClient(task.title ?? '') : undefined;
          let clarification: any = null;
          try {
            clarification = await answerClarifications(
              {
                task_title: task.title,
                expected_output: task.expected_output ?? '',
                risk_level: task.risk_level ?? 'D3',
                questions: qs,
                context: phaseCtx,
              },
              clarifyLLM,
            );
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[taskCallback] clarifier threw:', err);
            clarification = { verdict: 'escalate', answers: qs.map(() => ''), reason: 'clarifier exception' };
          }

          if (clarification.verdict === 'answered' && typeof acr_callback_url === 'string' && acr_callback_url) {
            // Fire reply to ACR; do not block taskCallback on failure.
            try {
              await fetch(acr_callback_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  l5_task_id,
                  phase,
                  questions: qs,
                  answers: clarification.answers,
                }),
                signal: (AbortSignal as any).timeout?.(5000),
              });
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('[taskCallback] clarify reply failed:', err);
            }
            updates.blocker = `clarification:answered ${qs.length} q. ${phaseCtx}`.trim();
          } else {
            updates.status = 'needs_review';
            updates.approval_required = true;
            updates.blocker = `clarification:escalate ${clarification.reason}. ${phaseCtx}`.trim();
          }
          ctx.body = {
            success: true,
            task_id: l5_task_id,
            new_status: updates.status ?? task.status,
            clarification,
          };
          await taskRepo.update({ filterByTk: l5_task_id, values: updates });
          await next();
          return;
        } else if (status === 'risk_reassess') {
          // Phase 18: ACR re-evaluated risk based on packet content. Sync to L5
          // agent_tasks.risk_level. Auto-promote approval_required when D3+.
          const allowed = ['D1', 'D2', 'D3', 'D4', 'D5'];
          if (typeof new_risk_level !== 'string' || !allowed.includes(new_risk_level)) {
            ctx.throw(400, `risk_reassess requires new_risk_level in ${allowed.join('|')}`);
          }
          const HIGH_RISK = ['D3', 'D4', 'D5'];
          updates.risk_level = new_risk_level;
          if (HIGH_RISK.includes(new_risk_level)) {
            updates.approval_required = true;
          }
          updates.blocker = `risk_reassess: ${task.risk_level ?? 'n/a'} -> ${new_risk_level}. ${phaseCtx}`.trim();
          await taskRepo.update({ filterByTk: l5_task_id, values: updates });
          ctx.body = {
            success: true,
            task_id: l5_task_id,
            new_status: task.status,
            new_risk_level,
          };
          await next();
          return;
        } else {
          ctx.throw(400, `Unknown status: ${status}`);
        }

        await taskRepo.update({ filterByTk: l5_task_id, values: updates });

        // Phase 16: structured log of phase context for downstream replanning (Phase 17).
        if (diff_summary || log_tail) {
          // eslint-disable-next-line no-console
          console.log(`[taskCallback] l5_task_id=${l5_task_id} phase=${phase} status=${status} ${phaseCtx}`);
          if (log_tail) {
            // eslint-disable-next-line no-console
            console.log(`[taskCallback] log_tail:\n${String(log_tail).slice(0, 1200)}`);
          }
        }

        ctx.body = {
          success: true,
          task_id: l5_task_id,
          new_status: updates.status ?? task.status,
          accepted_context: {
            has_diff: Boolean(diff_summary),
            has_log: Boolean(log_tail),
            exit_code: exit_code ?? null,
            branch: branch ?? null,
          },
          verifier: verifierVerdict ?? null,
        };
        await next();
      },

      executeTask: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { task_id } = getValues(ctx);
        if (!task_id) ctx.throw(400, 'task_id is required');

        const taskRepo = ctx.db.getRepository('agent_tasks');
        const handoffRepo = ctx.db.getRepository('agent_handoffs');

        const task = await taskRepo.findOne({ filter: { id: task_id } });
        if (!task) ctx.throw(404, `Task ${task_id} not found`);

        try {
          const result = executeAgentTask(task);

          let approval_required = result.approval_required;

          // D3+ 태스크에 ACR 승인 토큰 자동 발행
          const HIGH_RISK: string[] = ['D3', 'D4', 'D5'];
          const taskRisk = (task.risk_level ?? result.risk_level) as string | undefined;
          const acr_token = approval_required && taskRisk && HIGH_RISK.includes(taskRisk)
            ? randomUUID()
            : null;

          // Save handoff if present
          if (result.handoff) {
            await handoffRepo.create({
              values: {
                id: randomUUID(),
                ...result.handoff,
              },
            });
          }

          // Update task status
          await taskRepo.update({
            filterByTk: task_id,
            values: {
              status: result.updated_status,
              approval_required,
              blocker: result.output.bottleneck || null,
              ...(acr_token ? { acr_token } : {}),
            },
          });

          const updatedTask = await taskRepo.findOne({ filter: { id: task_id } });

          ctx.body = {
            ok: true,
            data: {
              task_id,
              status: result.updated_status,
              approval_required,
              acr_token,
              approval_routing: result.approval_routing,
              validation_errors: result.validation_errors,
              output: result.output,
              handoff: result.handoff,
              updated_task: updatedTask,
            },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.throw(500, `Failed to execute task: ${message}`);
        }

        await next();
      },
    },
  });
}

function getValues(ctx: ActionContext): Record<string, any> {
  return ctx.action?.params?.values ?? ctx.request?.body ?? {};
}

function buildLLMClient(rawText: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && typeof createOpenAIClient === 'function') {
    return createOpenAIClient({ apiKey });
  }
  return buildDeterministicLLM(rawText);
}

function buildDeterministicLLM(rawText: string) {
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
