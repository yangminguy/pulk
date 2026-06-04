import { defineCollection } from '@nocobase/database';

export default defineCollection({
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
    { name: 'createdAt', type: 'date' },
    { name: 'updatedAt', type: 'date' },
  ],
});
