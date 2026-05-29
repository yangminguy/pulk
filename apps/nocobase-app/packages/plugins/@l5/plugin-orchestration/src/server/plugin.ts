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
  generateWorkflowWithLLM,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/workflow-factory'));

const {
  executeAgentTask,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/executive-runtime'));

const {
  collectInsights,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/memory'));

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

    this.app.acl.allow('chat', ['submitInstruction', 'generateWorkflow', 'approvePlan', 'rejectPlan'], 'loggedIn');
    this.app.acl.allow('agent', ['executeTask'], 'loggedIn');
    // taskCallback is a machine-to-machine callback from ACR (non-interactive,
    // long-running). Public ACL + non-expiring shared-secret guard in the handler
    // avoids the ~17h JWT expiry that would break unattended cycle completion.
    this.app.acl.allow('agent', ['taskCallback'], 'public');
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
        ADD COLUMN IF NOT EXISTS acr_token text,
        ADD COLUMN IF NOT EXISTS business_id text;
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure agent_tasks contract columns: ${message}`);
  }

  try {
    await db.sequelize.query(`
      ALTER TABLE IF EXISTS founder_instructions
        ADD COLUMN IF NOT EXISTS business_id text;
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure founder_instructions contract columns: ${message}`);
  }

  try {
    await db.sequelize.query(`
      ALTER TABLE IF EXISTS ceo_interpretations
        ADD COLUMN IF NOT EXISTS business_id text;
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure ceo_interpretations contract columns: ${message}`);
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
      { name: 'business_id', type: 'string' },
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
      { name: 'business_id', type: 'string' },
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
      { name: 'business_id', type: 'string' },
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

        // Fetch active businesses for business_id inference.
        let activeBusinesses: { id: string; name: string; one_liner?: string }[] = [];
        try {
          const bizRepo = db.getRepository('businesses');
          if (bizRepo) {
            const rows = await bizRepo.find({ filter: { status: { $ne: 'deleted' } } });
            activeBusinesses = (rows ?? []).map((b: any) => ({
              id: String(b.id),
              name: String(b.title ?? b.name ?? b.id),
              one_liner: b.one_liner ?? undefined,
            }));
          }
        } catch {
          // plugin-business-portfolio may not be loaded in all envs — safe to skip
        }

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

        // Phase 5 (learning loop) — recall link. Inject previously-saved founder
        // memories into the CEO interpretation so past lessons shape new plans.
        // Only saved (founder-approved) insights, and never high-PII ones, are
        // sent to the LLM. Best-effort: failure must not block interpretation.
        const memories = await loadFounderMemories(ctx);

        const interpretationDraft = await interpretFounderInstruction(instruction as any, {
          llm,
          now: () => new Date(now),
          idGenerator: randomUUID,
          activeBusinesses,
          memories,
        });

        const {
          needs_business_clarification,
          business_clarification_question,
          new_business_proposal,
          business_id,
          ...interpCore
        } = interpretationDraft as any;

        const interpretation = { ...interpCore, id: randomUUID(), business_id: business_id ?? null };
        const interpretationRecord = await interpretationRepo.create({ values: interpretation });

        await instructionRepo.update({
          filter: { id: instruction.id },
          values: { status: 'interpreted', business_id: business_id ?? null },
        });

        // instructionRecord is the pre-update reference; reflect the persisted
        // status/business_id in the response so clients don't see stale nulls.
        const instructionOut = {
          ...((instructionRecord as any).toJSON?.() ?? instructionRecord),
          status: 'interpreted',
          business_id: business_id ?? null,
        };

        // Ambiguous business: save records but stop task creation, return clarification question.
        if (needs_business_clarification) {
          ctx.body = {
            ok: true,
            data: {
              instruction: instructionOut,
              interpretation: interpretationRecord,
              needs_business_clarification: true,
              business_clarification_question: business_clarification_question ?? null,
              tasks: [],
              ...(new_business_proposal ? { new_business_proposal } : {}),
            },
          };
          await next();
          return;
        }

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
          taskRecords.push(await taskRepo.create({ values: { ...task, business_id: business_id ?? null } }));
        }

        ctx.body = {
          ok: true,
          data: {
            instruction: instructionOut,
            interpretation: interpretationRecord,
            tasks: taskRecords,
            ...(new_business_proposal ? { new_business_proposal } : {}),
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

        const llm = process.env.OPENAI_API_KEY ? buildLLMClient(idea) : undefined;
        const result = llm
          ? await generateWorkflowWithLLM(
              { business_idea: idea, current_phase: current_phase ?? undefined },
              llm,
            )
          : generateWorkflow({
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
          // Approving clears the approval gate so the Hermes dispatcher
          // (status=queued AND approval_required=false) can pick the task up.
          await taskRepo.update({
            filterByTk: task.id,
            values: { approval_required: false },
          });
          approved_count++;
        }

        ctx.body = { ok: true, data: { instruction_id, approved_count } };
        await next();
      },
      rejectPlan: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { instruction_id } = getValues(ctx);
        if (!instruction_id) ctx.throw(400, 'instruction_id is required');

        const taskRepo = ctx.db.getRepository('agent_tasks');
        // Cancel only still-pending tasks; never touch already-running/done/killed.
        const tasks = await taskRepo.find({ filter: { instruction_id, status: 'queued' } });

        let rejected_count = 0;
        for (const task of tasks) {
          await taskRepo.update({ filterByTk: task.id, values: { status: 'killed' } });
          rejected_count++;
        }
        await ctx.db.getRepository('founder_instructions').update({
          filter: { id: instruction_id },
          values: { status: 'rejected' },
        });

        ctx.body = { ok: true, data: { instruction_id, rejected_count } };
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
        // Machine auth: non-expiring shared secret (set on both ACR and NocoBase).
        // Public ACL above means NocoBase skips JWT; we enforce the secret here.
        const expectedSecret = process.env.L5_SHARED_SECRET;
        if (expectedSecret) {
          // Koa ctx.get(header) exists at runtime; ActionContext type omits it.
          const provided = (ctx as any).get('x-l5-shared-secret');
          if (provided !== expectedSecret) {
            ctx.throw(401, 'Invalid or missing x-l5-shared-secret');
          }
        }
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
          // Phase 2: review & merge outcome fields
          merge_action,
          merge_target,
          pr_url,
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
            // Phase 2: record how the work was merged (or left for review).
            const mergeNote = merge_action
              ? ` merge=${merge_action}${merge_target ? `->${merge_target}` : ''}${pr_url ? ` pr=${pr_url}` : ''}`
              : '';
            if (phaseCtx || mergeNote) updates.blocker = `done.${mergeNote} ${phaseCtx}`.trim();
            // Best-effort Telegram notification — never blocks taskCallback response.
            sendCycleDoneTelegram(task, l5_task_id as string).catch(() => { /* silent */ });
          }
        } else if (status === 'empty_output') {
          // Phase 1: agent finished exit 0 but produced no file changes ("empty
          // branch") after retries. Not a clean success — alert the founder.
          updates.status = 'needs_review';
          updates.approval_required = true;
          updates.blocker = [`empty_output: agent produced no file changes`, output_summary, phaseCtx]
            .filter(Boolean)
            .join(' | ');
        } else if (status === 'merge_conflict') {
          // Phase 2: clean run but the branch could not be auto-merged into the
          // base. Surface as a founder review card; the branch is preserved.
          updates.status = 'needs_review';
          updates.approval_required = true;
          updates.blocker = [`merge_conflict${merge_target ? `->${merge_target}` : ''}: manual merge required`, phaseCtx]
            .filter(Boolean)
            .join(' | ');
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

        // CTO tasks without approval_required are owned by the Hermes dispatcher
        // (60s launchd cycle → runCTOAgent → ACR). executeTask must not alter their
        // status, otherwise the dispatcher will not see them as queued and ACR
        // dispatch is silently skipped.
        if (task.assigned_agent === 'CTO' && !task.approval_required) {
          ctx.body = {
            ok: true,
            deferred: true,
            data: {
              task_id,
              status: task.status,
              message: 'CTO task (approval_required=false) is managed by the Hermes dispatcher. No status change made.',
            },
          };
          await next();
          return;
        }

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

          // Phase 5 (learning loop) — collection link. When a completed task
          // produced a reusable insight, persist it as a pending founder_memory
          // candidate so the founder can review/save it and later runs can
          // reference it. Best-effort: never blocks or fails the task response.
          await persistTaskInsight(ctx, task, result).catch((err) => {
            console.warn('[executeTask] insight persist failed:', err);
          });

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

// Phase 5 (learning loop) — collection link.
// Extract a reusable insight from a completed task's executive-runtime output
// and store it as a pending founder_memory candidate. Idempotent per task
// (dedup by source_task_id). The founder_memory collection is owned by the
// executive-monitor plugin; we look it up at request time and no-op if it is
// not registered. Pure-domain extraction lives in l5-core (collectInsights).
async function persistTaskInsight(ctx: ActionContext, task: any, result: any): Promise<void> {
  if (typeof collectInsights !== 'function') return;

  const candidates = collectInsights([
    {
      task_id: task.id,
      assigned_agent: task.assigned_agent,
      output: {
        insight_to_record: result?.output?.insight_to_record,
        workflow_improvement_suggestion: result?.output?.workflow_improvement_suggestion,
        // risk_level drives pii_level (D4/D5 -> high). Prefer the task's declared
        // risk, falling back to the runtime result.
        risk_level: task.risk_level ?? result?.risk_level ?? result?.output?.risk_level,
        phase: task.phase ?? result?.output?.phase,
      },
    },
  ]);
  if (candidates.length === 0) return; // insight too short / absent

  let repo: any;
  try {
    repo = ctx.db.getRepository('founder_memory');
  } catch {
    return; // collection not registered in this app
  }
  if (!repo) return;

  for (const c of candidates) {
    // Dedup: one memory candidate per source task.
    const existing = await repo.findOne({ filter: { source_task_id: c.source_task_id } });
    if (existing) continue;
    await repo.create({
      values: {
        id: randomUUID(),
        insight: c.insight,
        workflow_improvement: c.workflow_improvement || null,
        source_agent: c.source_agent || null,
        source_task_id: c.source_task_id,
        pii_level: c.pii_level || 'none',
        phase: c.phase || null,
        approval_status: 'pending',
      },
    });
  }
}

// Phase 5 (learning loop) — recall link.
// Load founder-approved memories to feed the CEO interpretation. Excludes
// high-PII insights from anything sent to the LLM (CLAUDE.md governance). Caps
// the count so the prompt stays bounded. Returns [] on any failure.
async function loadFounderMemories(ctx: ActionContext): Promise<
  Array<{ insight: string; workflow_improvement?: string; phase?: string }>
> {
  const MAX_MEMORIES = 20;
  let repo: any;
  try {
    repo = ctx.db.getRepository('founder_memory');
  } catch {
    return [];
  }
  if (!repo) return [];

  try {
    const rows = await repo.find({
      filter: { approval_status: 'saved' },
      // founder_memory uses NocoBase's default camelCase timestamps.
      sort: ['-createdAt'],
      limit: MAX_MEMORIES * 2,
    });
    return (rows ?? [])
      // Governance: never send high-PII insights to the LLM. Filter in JS to
      // avoid depending on operator support across NocoBase versions.
      .filter((r: any) => (r.pii_level ?? 'none') !== 'high')
      .map((r: any) => ({
        insight: r.insight ?? '',
        workflow_improvement: r.workflow_improvement ?? undefined,
        phase: r.phase ?? undefined,
      }))
      .filter((m: { insight: string }) => m.insight.length > 0)
      .slice(0, MAX_MEMORIES);
  } catch (err) {
    console.warn('[interpret] founder memory recall failed:', err);
    return [];
  }
}

// Best-effort Telegram notification for cycle completion.
// Reads env vars TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FOUNDER_UI_BASE_URL.
// Silent skip if env vars are absent.
async function sendCycleDoneTelegram(task: any, taskId: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  const founderUIBase = process.env.FOUNDER_UI_BASE_URL ?? 'http://localhost:3002';
  const planTitle = (task.title as string | undefined) ?? taskId;
  const body = `task_id: ${taskId}`;
  const link = `${founderUIBase}/`;
  const text = `ℹ️ *사이클 완료 — ${planTitle}*\n\n${body}\n\n🔗 ${link}`;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });
  } catch {
    // Intentionally silent — notification failure must not affect task state.
  }
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
        business_id: null,
        needs_business_clarification: false,
      });
    },
  };
}
