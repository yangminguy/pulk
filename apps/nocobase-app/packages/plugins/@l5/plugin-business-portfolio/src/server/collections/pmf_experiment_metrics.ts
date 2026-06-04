import { CollectionOptions } from '@nocobase/database';

export default {
  name: 'pmf_experiment_metrics',
  title: 'PMF Experiment Metrics',
  shared: true,
  dumpRules: 'required',
  fields: [
    { name: 'experiment_id', type: 'string' },
    { name: 'metric_name', type: 'string' },
    { name: 'metric_value', type: 'string' }, // String to handle both number/string, or json? JSON might be better. Or we just use string.
    { name: 'signal_level', type: 'integer' },
    { name: 'evidence_ref', type: 'string' },
    { name: 'collected_at', type: 'date' }
  ]
} as CollectionOptions;
