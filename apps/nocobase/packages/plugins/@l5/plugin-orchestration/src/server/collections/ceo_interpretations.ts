import { defineCollection } from '@nocobase/database';

export default defineCollection({
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
    { name: 'createdAt', type: 'date' },
    { name: 'updatedAt', type: 'date' },
  ],
});
