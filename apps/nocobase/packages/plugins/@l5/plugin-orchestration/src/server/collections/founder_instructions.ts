import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'founder_instructions',
  title: 'Founder Instructions',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true, defaultValue: { $fn: 'uuidv4' } },
    { name: 'raw_text', type: 'text', allowNull: false },
    { name: 'source', type: 'string', allowNull: false, defaultValue: 'manual' },
    { name: 'intent', type: 'text' },
    { name: 'constraints', type: 'json', defaultValue: [] },
    { name: 'requested_phase', type: 'string' },
    { name: 'status', type: 'string', allowNull: false, defaultValue: 'new' },
    { name: 'createdAt', type: 'date' },
    { name: 'updatedAt', type: 'date' },
  ],
});
