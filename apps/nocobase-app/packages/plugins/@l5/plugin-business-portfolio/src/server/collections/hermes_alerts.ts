import { CollectionOptions } from '@nocobase/database';

export default {
  name: 'hermes_alerts',
  title: 'Hermes Alerts',
  shared: true,
  dumpRules: 'required',
  fields: [
    { name: 'alert_type', type: 'string' },
    { name: 'severity', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'message', type: 'text' },
    { name: 'related_workflow_id', type: 'string' },
    { name: 'related_business_id', type: 'string' },
    { name: 'suggested_action', type: 'text' },
    { name: 'status', type: 'string', defaultValue: 'open' }
  ]
} as CollectionOptions;
