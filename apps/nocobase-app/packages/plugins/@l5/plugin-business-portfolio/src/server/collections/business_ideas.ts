import { CollectionOptions } from '@nocobase/database';

export default {
  name: 'business_ideas',
  title: 'Business Ideas',
  shared: true,
  dumpRules: 'required',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'raw_description', type: 'text' },
    { name: 'source', type: 'string' },
    { name: 'status', type: 'string', defaultValue: 'idea' },
    { name: 'founder_fit_score', type: 'float' },
    { name: 'opportunity_score', type: 'float' },
    { name: 'risk_level', type: 'string' }
  ]
} as CollectionOptions;
