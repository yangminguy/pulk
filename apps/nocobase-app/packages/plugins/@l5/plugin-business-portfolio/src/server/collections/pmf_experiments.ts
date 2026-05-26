import { CollectionOptions } from '@nocobase/database';

export default {
  name: 'pmf_experiments',
  title: 'PMF Experiments',
  shared: true,
  dumpRules: 'required',
  fields: [
    { name: 'business_id', type: 'string' },
    { name: 'hypothesis', type: 'text' },
    { name: 'format', type: 'string' },
    { name: 'target_segment', type: 'string' },
    { name: 'success_signal', type: 'text' },
    { name: 'status', type: 'string', defaultValue: 'planned' },
    { name: 'pmf_score', type: 'float' },
    { name: 'started_at', type: 'date' },
    { name: 'ended_at', type: 'date' }
  ]
} as CollectionOptions;
