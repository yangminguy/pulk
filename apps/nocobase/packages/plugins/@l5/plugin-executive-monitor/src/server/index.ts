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
                blocker: task.blocker,
                updated_at: task.updated_at,
              };
            }),
          );

          ctx.body = { ok: true, data: result };
        },
      },
    });

    // ACL: Founder는 monitor resource에 read-only
    app.acl.allow('monitor', ['currentTasks', 'blockedTasks', 'approvalQueue'], 'loggedIn');

    // agent_task, agent_handoff, founder_instruction은 admin만 write 가능
    app.acl.allow('agent_tasks', ['list', 'get'], 'loggedIn');
    app.acl.allow('founder_instructions', ['list', 'get'], 'loggedIn');
    app.acl.allow('ceo_interpretations', ['list', 'get'], 'loggedIn');
    app.acl.allow('agent_handoffs', ['list', 'get'], 'loggedIn');
  },
};
