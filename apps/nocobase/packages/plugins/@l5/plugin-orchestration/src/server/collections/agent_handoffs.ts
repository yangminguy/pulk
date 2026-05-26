import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'agent_handoffs',
  title: 'Agent Handoffs',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true, defaultValue: { $fn: 'uuidv4' } },
    { name: 'task_id', type: 'uuid', allowNull: false },
    { name: 'from_agent', type: 'string', allowNull: false },
    { name: 'to_agent', type: 'string' },
    { name: 'context', type: 'text', allowNull: false },
    { name: 'next_action', type: 'text', allowNull: false },
    { name: 'blocker', type: 'text' },
    { name: 'approval_required', type: 'boolean', defaultValue: false },
    { name: 'createdAt', type: 'date' },
    { name: 'updatedAt', type: 'date' },
  ],
});
