// @l5/plugin-executive-monitor — server
// Collections: founder_instructions, ceo_interpretations, agent_tasks, agent_handoffs
// read-only API: /api/monitor/current-tasks, /api/monitor/blocked-tasks, /api/monitor/approval-queue
// 도메인 로직은 @l5/core에 위임한다 (하드코딩 금지).

import {
  founderInstructionCollection,
  ceoInterpretationCollection,
  agentTaskCollection,
  agentHandoffCollection,
} from './collections.js';

export default {
  name: 'executive-monitor',

  async load(this: any) {
    const app = this.app;
    const db = app.db;

    // Collection 등록
    db.collection(founderInstructionCollection);
    db.collection(ceoInterpretationCollection);
    db.collection(agentTaskCollection);
    db.collection(agentHandoffCollection);

    // /api/monitor/current-tasks — 모든 agent의 현재 task
    app.resource({
      name: 'monitor',
      actions: {
        async currentTasks(ctx: any) {
          const repo = db.getRepository('agent_tasks');
          const tasks = await repo.find({
            filter: { status: { $notIn: ['done', 'killed'] } },
            sort: ['-updated_at'],
          });

          // FounderInstruction raw_text snippet 조인
          const instructionRepo = db.getRepository('founder_instructions');
          const result = await Promise.all(
            tasks.map(async (task: any) => {
              const instruction = task.instruction_id
                ? await instructionRepo.findOne({ filter: { id: task.instruction_id } })
                : null;
              return {
                task_id: task.id,
                agent: task.assigned_agent,
                task_title: task.title,
                source_instruction: instruction
                  ? instruction.raw_text.slice(0, 120)
                  : null,
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
                updated_at: task.updated_at,
              };
            }),
          );

          ctx.body = { ok: true, data: result };
        },

        async blockedTasks(ctx: any) {
          const repo = db.getRepository('agent_tasks');
          const tasks = await repo.find({
            filter: { status: 'blocked' },
            sort: ['-updated_at'],
          });

          const instructionRepo = db.getRepository('founder_instructions');
          const result = await Promise.all(
            tasks.map(async (task: any) => {
              const instruction = task.instruction_id
                ? await instructionRepo.findOne({ filter: { id: task.instruction_id } })
                : null;
              return {
                task_id: task.id,
                agent: task.assigned_agent,
                task_title: task.title,
                source_instruction: instruction
                  ? instruction.raw_text.slice(0, 120)
                  : null,
                status: task.status,
                blocker: task.blocker,
                next_owner: task.next_owner,
                approval_required: task.approval_required,
                risk_level: task.risk_level,
                phase: task.phase,
                source_ref: task.source_ref,
                updated_at: task.updated_at,
              };
            }),
          );

          ctx.body = { ok: true, data: result };
        },

        async approvalQueue(ctx: any) {
          const repo = db.getRepository('agent_tasks');
          const tasks = await repo.find({
            filter: { approval_required: true, status: { $notIn: ['done', 'killed'] } },
            sort: ['-updated_at'],
          });

          const instructionRepo = db.getRepository('founder_instructions');
          const result = await Promise.all(
            tasks.map(async (task: any) => {
              const instruction = task.instruction_id
                ? await instructionRepo.findOne({ filter: { id: task.instruction_id } })
                : null;
              return {
                task_id: task.id,
                agent: task.assigned_agent,
                task_title: task.title,
                source_instruction: instruction
                  ? instruction.raw_text.slice(0, 120)
                  : null,
                rationale: task.rationale,
                status: task.status,
                expected_output: task.expected_output,
                approval_required: true,
                risk_level: task.risk_level,
                phase: task.phase,
                source_ref: task.source_ref,
                blocker: task.blocker,
                updated_at: task.updated_at,
              };
            }),
          );

          ctx.body = { ok: true, data: result };
        },

        async approveTask(ctx: any) {
          const body = ctx.request.body ?? ctx.action?.params?.values ?? {};
          const { task_id, notes } = body as { task_id?: string; notes?: string };
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
            values: { status: 'done', updated_at: new Date() },
          });
          ctx.body = { ok: true, task_id, new_status: 'done', message: '승인 완료.' };
        },

        async rejectTask(ctx: any) {
          const body = ctx.request.body ?? ctx.action?.params?.values ?? {};
          const { task_id, explanation } = body as { task_id?: string; explanation?: string };
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
            values: { status: 'killed', updated_at: new Date() },
          });
          ctx.body = { ok: true, task_id, new_status: 'killed', message: '거절 완료.' };
        },

        async memoryCandidates(ctx: any) {
          try {
            const repo = db.getRepository('founder_memory');
            const rows = await repo.find({
              filter: { approval_status: 'pending' },
              sort: ['-created_at'],
            });
            const data = rows.map((r: any) => ({
              id: r.id,
              insight: r.insight,
              workflow_improvement: r.workflow_improvement,
              source_agent: r.source_agent,
              source_task_id: r.source_task_id,
              pii_level: r.pii_level,
              phase: r.phase,
              created_at: r.created_at,
            }));
            ctx.body = { ok: true, data };
          } catch {
            ctx.body = { ok: true, data: [] };
          }
        },

        async saveMemory(ctx: any) {
          const body = ctx.request.body ?? ctx.action?.params?.values ?? {};
          const { source_task_id } = body as { source_task_id?: string };
          try {
            const repo = db.getRepository('founder_memory');
            await repo.update({
              filter: { source_task_id },
              values: { approval_status: 'saved', updated_at: new Date() },
            });
            ctx.body = { ok: true, source_task_id, decision: 'saved' };
          } catch {
            ctx.body = { ok: false, error: 'Memory table not ready' };
          }
        },

        async discardMemory(ctx: any) {
          const body = ctx.request.body ?? ctx.action?.params?.values ?? {};
          const { source_task_id } = body as { source_task_id?: string };
          try {
            const repo = db.getRepository('founder_memory');
            await repo.update({
              filter: { source_task_id },
              values: { approval_status: 'discarded', updated_at: new Date() },
            });
            ctx.body = { ok: true, source_task_id, decision: 'discarded' };
          } catch {
            ctx.body = { ok: false, error: 'Memory table not ready' };
          }
        },
      },
    });

    // ACL: Founder는 monitor resource에 read-only + write actions
    app.acl.allow('monitor', ['currentTasks', 'blockedTasks', 'approvalQueue'], 'loggedIn');
    app.acl.allow('monitor', ['approveTask', 'rejectTask', 'memoryCandidates', 'saveMemory', 'discardMemory'], 'loggedIn');

    // agent_task, agent_handoff, founder_instruction은 admin만 write 가능
    app.acl.allow('agent_tasks', ['list', 'get'], 'loggedIn');
    app.acl.allow('founder_instructions', ['list', 'get'], 'loggedIn');
    app.acl.allow('ceo_interpretations', ['list', 'get'], 'loggedIn');
    app.acl.allow('agent_handoffs', ['list', 'get'], 'loggedIn');
  },
};
