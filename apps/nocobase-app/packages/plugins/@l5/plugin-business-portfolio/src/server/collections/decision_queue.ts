import { CollectionOptions } from '@nocobase/database';

export default {
  name: 'decision_queue',
  title: 'Decision Queue',
  shared: true,
  dumpRules: 'required',
  fields: [
    { name: 'decision_type', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'description', type: 'text' },
    { name: 'related_business_id', type: 'string' },
    { name: 'related_workflow_id', type: 'string' },
    { name: 'requested_by', type: 'string' },
    { name: 'required_by', type: 'string' },
    { name: 'status', type: 'string', defaultValue: 'open' },
    { name: 'approval_notes', type: 'text' }
  ]
} as CollectionOptions;
